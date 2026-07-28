"""Isolated, local Git history for profile metadata and settings."""

from __future__ import annotations

import contextlib
import hashlib
import re
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import tomli_w

from .atomic import atomic_write_bytes
from .config import ConfigError, load_toml_bytes
from .locking import FileLock
from .paths import XDGPaths

SETTINGS_DOCUMENT = "settings.toml"
PROFILE_DOCUMENT = "profile.toml"
_REVISION_PATTERN = re.compile(r"^(?:HEAD|[0-9a-fA-F]{7,64})$")
_SENSITIVE_KEY_PARTS = frozenset(
    (
        "api_key",
        "authorization",
        "client_secret",
        "credential",
        "password",
        "private_key",
        "refresh_token",
        "secret",
        "token",
    )
)


class ProfileHistoryError(RuntimeError):
    """An isolated profile-history operation failed."""


class SensitiveSettingError(ProfileHistoryError):
    """A caller attempted to commit secret-bearing material."""


def _parse_git_datetime(value: str) -> datetime:
    """Parse Git's strict ISO timestamp across all supported Python versions."""

    normalized = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ProfileHistoryError("Git returned an invalid profile history timestamp") from error


@dataclass(frozen=True)
class ProfileRevision:
    revision: str
    created_at: datetime
    label: str


@dataclass(frozen=True)
class ProfileSnapshot:
    settings: Mapping[str, Any]
    profile: Mapping[str, Any]


class GitProfileHistory:
    """Append-only settings history in an app-owned repository.

    Each profile receives a repository below ``XDG_DATA_HOME``. The caller's
    repository path is never used to derive this location, and the profile id is
    represented by a sanitized label plus a hash to prevent traversal.
    """

    def __init__(
        self,
        paths: XDGPaths,
        profile_id: str = "local",
        *,
        git_binary: str = "git",
        lock_timeout: float | None = 10.0,
    ) -> None:
        if not profile_id.strip():
            raise ProfileHistoryError("Profile id cannot be empty")
        self.paths = paths
        self.profile_id = profile_id
        self.git_binary = git_binary
        self.lock_timeout = lock_timeout
        digest = hashlib.sha256(profile_id.encode("utf-8")).hexdigest()[:16]
        slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", profile_id).strip(".-")[:32]
        if not slug:
            slug = "profile"
        self.repository = paths.profile_history_root / f"{slug}-{digest}"
        self.lock_path = paths.profile_history_root / ".locks" / f"{digest}.lock"
        self.settings_path = self.repository / SETTINGS_DOCUMENT
        self.profile_path = self.repository / PROFILE_DOCUMENT
        self._assert_isolated()

    def initialize(self) -> None:
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            self._initialize_unlocked()

    def record(
        self,
        settings: Mapping[str, Any],
        *,
        label: str,
        profile: Mapping[str, Any] | None = None,
    ) -> ProfileRevision:
        """Record a complete settings/profile snapshot if it changed."""

        if not label.strip():
            raise ProfileHistoryError("History label cannot be empty")
        _reject_sensitive_values(settings)
        if profile is not None:
            _reject_sensitive_values(profile)
        settings_bytes = _toml_bytes(settings)
        profile_bytes = _toml_bytes({} if profile is None else profile)

        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            self._initialize_unlocked()
            atomic_write_bytes(self.settings_path, settings_bytes)
            atomic_write_bytes(self.profile_path, profile_bytes)
            self._run_text(("add", "--", SETTINGS_DOCUMENT, PROFILE_DOCUMENT))
            staged = self._run_text(
                ("diff", "--cached", "--quiet", "--"),
                check=False,
            )
            if staged.returncode not in (0, 1):
                raise ProfileHistoryError(staged.stderr.strip() or "git diff failed")
            if staged.returncode == 1:
                self._run_text(
                    (
                        "commit",
                        "--no-gpg-sign",
                        "--no-verify",
                        "-m",
                        label.strip(),
                        "--",
                        SETTINGS_DOCUMENT,
                        PROFILE_DOCUMENT,
                    )
                )
            revision = self._head_unlocked()
            if revision is None:
                raise ProfileHistoryError("Git did not create a profile revision")
            return revision

    def list_revisions(self, *, limit: int = 100) -> list[ProfileRevision]:
        bounded_limit = max(0, min(limit, 5000))
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            self._initialize_unlocked()
            if self._head_unlocked() is None:
                return []
            result = self._run_text(
                (
                    "log",
                    f"--max-count={bounded_limit}",
                    "--format=%H%x1f%cI%x1f%s",
                    "--",
                    SETTINGS_DOCUMENT,
                    PROFILE_DOCUMENT,
                )
            )
            revisions: list[ProfileRevision] = []
            for line in result.stdout.splitlines():
                parts = line.split("\x1f", 2)
                if len(parts) != 3:
                    continue
                revisions.append(
                    ProfileRevision(
                        revision=parts[0],
                        created_at=_parse_git_datetime(parts[1]),
                        label=parts[2],
                    )
                )
            return revisions

    def read(self, revision: str = "HEAD") -> ProfileSnapshot:
        _validate_revision(revision)
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            self._initialize_unlocked()
            if self._head_unlocked() is None:
                return ProfileSnapshot(settings={}, profile={})
            self._ensure_revision_unlocked(revision)
            settings = self._read_document_unlocked(revision, SETTINGS_DOCUMENT)
            profile = self._read_document_unlocked(revision, PROFILE_DOCUMENT)
            return ProfileSnapshot(settings=settings, profile=profile)

    def diff(self, older: str, newer: str = "HEAD") -> str:
        _validate_revision(older)
        _validate_revision(newer)
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            self._initialize_unlocked()
            self._ensure_revision_unlocked(older)
            self._ensure_revision_unlocked(newer)
            result = self._run_text(
                (
                    "diff",
                    "--no-ext-diff",
                    "--no-color",
                    older,
                    newer,
                    "--",
                    SETTINGS_DOCUMENT,
                    PROFILE_DOCUMENT,
                )
            )
            return result.stdout

    def restore(self, revision: str, *, label: str | None = None) -> ProfileRevision:
        """Restore a past snapshot by appending a new audit commit."""

        _validate_revision(revision)
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            self._initialize_unlocked()
            if self._head_unlocked() is None:
                raise ProfileHistoryError("There is no profile history to restore")
            self._ensure_revision_unlocked(revision)
            for document, destination in (
                (SETTINGS_DOCUMENT, self.settings_path),
                (PROFILE_DOCUMENT, self.profile_path),
            ):
                content = self._show_document_unlocked(revision, document)
                if content is None:
                    with contextlib.suppress(FileNotFoundError):
                        destination.unlink()
                else:
                    atomic_write_bytes(destination, content)
            self._run_text(("add", "-A", "--", SETTINGS_DOCUMENT, PROFILE_DOCUMENT))
            changed = self._run_text(
                ("diff", "--cached", "--quiet", "--"),
                check=False,
            )
            if changed.returncode not in (0, 1):
                raise ProfileHistoryError(changed.stderr.strip() or "git diff failed")
            if changed.returncode == 1:
                restore_label = (
                    label.strip()
                    if label is not None and label.strip()
                    else f"Restore profile from {revision[:12]}"
                )
                self._run_text(
                    (
                        "commit",
                        "--no-gpg-sign",
                        "--no-verify",
                        "-m",
                        restore_label,
                        "--",
                        SETTINGS_DOCUMENT,
                        PROFILE_DOCUMENT,
                    )
                )
            restored = self._head_unlocked()
            if restored is None:
                raise ProfileHistoryError("Restored profile has no Git revision")
            return restored

    def _initialize_unlocked(self) -> None:
        self.repository.mkdir(mode=0o700, parents=True, exist_ok=True)
        git_directory = self.repository / ".git"
        if not git_directory.is_dir():
            initialized = self._run_text(("init", "--initial-branch=main"), check=False)
            if initialized.returncode != 0:
                fallback = self._run_text(("init",), check=False)
                if fallback.returncode != 0:
                    raise ProfileHistoryError(
                        fallback.stderr.strip()
                        or initialized.stderr.strip()
                        or "Unable to initialize profile history"
                    )
        self._run_text(("config", "--local", "user.name", "Desktop Material TUI"))
        self._run_text(
            (
                "config",
                "--local",
                "user.email",
                "desktop-material-tui@localhost.invalid",
            )
        )
        self._run_text(("config", "--local", "commit.gpgsign", "false"))

    def _head_unlocked(self) -> ProfileRevision | None:
        result = self._run_text(
            ("show", "-s", "--format=%H%x1f%cI%x1f%s", "HEAD"),
            check=False,
        )
        if result.returncode != 0:
            return None
        parts = result.stdout.strip().split("\x1f", 2)
        if len(parts) != 3:
            raise ProfileHistoryError("Git returned malformed profile history")
        return ProfileRevision(
            revision=parts[0],
            created_at=_parse_git_datetime(parts[1]),
            label=parts[2],
        )

    def _read_document_unlocked(
        self,
        revision: str,
        document: str,
    ) -> Mapping[str, Any]:
        content = self._show_document_unlocked(revision, document)
        if content is None:
            return {}
        try:
            return load_toml_bytes(content)
        except ConfigError as error:
            raise ProfileHistoryError(str(error)) from error

    def _ensure_revision_unlocked(self, revision: str) -> None:
        result = self._run_text(
            ("cat-file", "-e", f"{revision}^{{commit}}"),
            check=False,
        )
        if result.returncode != 0:
            raise ProfileHistoryError(f"Profile revision does not exist: {revision}")

    def _show_document_unlocked(
        self,
        revision: str,
        document: str,
    ) -> bytes | None:
        result = self._run_bytes(("show", f"{revision}:{document}"), check=False)
        if result.returncode != 0:
            return None
        return result.stdout

    def _run_text(
        self,
        arguments: Sequence[str],
        *,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(  # noqa: S603
                (self.git_binary, "-C", str(self.repository), *arguments),
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ProfileHistoryError(f"Unable to run Git: {error}") from error
        if check and result.returncode != 0:
            raise ProfileHistoryError(
                result.stderr.strip()
                or result.stdout.strip()
                or f"Git exited with {result.returncode}"
            )
        return result

    def _run_bytes(
        self,
        arguments: Sequence[str],
        *,
        check: bool = True,
    ) -> subprocess.CompletedProcess[bytes]:
        try:
            result = subprocess.run(  # noqa: S603
                (self.git_binary, "-C", str(self.repository), *arguments),
                check=False,
                capture_output=True,
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ProfileHistoryError(f"Unable to run Git: {error}") from error
        if check and result.returncode != 0:
            detail = result.stderr.decode("utf-8", errors="replace").strip()
            raise ProfileHistoryError(detail or f"Git exited with {result.returncode}")
        return result

    def _assert_isolated(self) -> None:
        root = self.paths.profile_history_root.resolve()
        candidate = self.repository.resolve()
        try:
            candidate.relative_to(root)
        except ValueError as error:
            raise ProfileHistoryError("Profile history escaped its XDG data root") from error
        if candidate == root:
            raise ProfileHistoryError("Profile history requires an isolated subdirectory")


def _validate_revision(revision: str) -> None:
    if not _REVISION_PATTERN.fullmatch(revision):
        raise ProfileHistoryError("Invalid Git revision")


def _toml_bytes(value: Mapping[str, Any]) -> bytes:
    try:
        return tomli_w.dumps(dict(value)).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise ProfileHistoryError(f"Settings cannot be encoded as TOML: {error}") from error


def _reject_sensitive_values(
    value: object,
    *,
    path: tuple[str, ...] = (),
) -> None:
    if isinstance(value, Mapping):
        for raw_key, child in value.items():
            key = str(raw_key)
            normalized = re.sub(r"[^a-z0-9]+", "_", key.lower()).strip("_")
            sensitive = normalized in _SENSITIVE_KEY_PARTS or any(
                normalized.endswith(f"_{part}") for part in _SENSITIVE_KEY_PARTS
            )
            # Conventional names such as oauth_token are caught by the suffix
            # check without rejecting benign settings such as
            # credential_helper or secret_scanning_enabled.
            if sensitive:
                location = ".".join((*path, key))
                raise SensitiveSettingError(
                    f"Sensitive setting cannot be stored in Git history: {location}"
                )
            _reject_sensitive_values(child, path=(*path, key))
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            _reject_sensitive_values(child, path=(*path, str(index)))
