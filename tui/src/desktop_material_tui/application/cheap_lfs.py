"""Cross-platform, fail-closed Cheap LFS Release workflows."""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import unicodedata
import uuid
import zlib
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from platformdirs import user_cache_path

from ..domain.cheap_lfs import (
    CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES,
    CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
    CHEAP_LFS_PART_SIZE_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    CheapLfsPart,
    CheapLfsPartRange,
    CheapLfsPointer,
    is_cheap_lfs_pointer_text,
    parse_cheap_lfs_pointer,
    plan_file_parts,
    serialize_cheap_lfs_pointer,
    validate_cheap_lfs_tracked_path,
)
from ..infrastructure.git.runner import SubprocessGitRunner
from ..infrastructure.github.errors import sanitize_cli_text
from ..infrastructure.github.transport import (
    GhProcessResult,
    GhTransport,
    SubprocessGhTransport,
)

CHEAP_LFS_RELEASE_BODY_SENTINEL = "<!-- desktop-material:cheap-lfs-release-bucket:v1 -->"
CHEAP_LFS_ASSET_LABEL_PREFIX = "cheap-lfs/v1"
CHEAP_LFS_MAXIMUM_RELEASE_ASSETS = 1_000
_BUFFER_SIZE = 1024 * 1024
_SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")
_SHA256_DIGEST = re.compile(r"^sha256:([a-f0-9]{64})$")
_LEGACY_ASSET_LABEL = re.compile(
    r"^cheap-lfs/v1 sha256=[a-f0-9]{64} "
    r"commit=(?:-|[a-f0-9]{7,64}) path=.+$"
)
_RELEASE_TAG = re.compile(r"^[^\s\x00-\x1f]{1,255}$")
_REPOSITORY_SLUG = re.compile(
    r"^(?:(?P<host>[A-Za-z0-9.-]+)/)?"
    r"(?P<owner>[A-Za-z0-9_.-]{1,100})/"
    r"(?P<name>[A-Za-z0-9_.-]{1,100})$"
)
_GITHUB_HTTPS_REMOTE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$",
    re.IGNORECASE,
)
_GITHUB_SSH_REMOTE = re.compile(
    r"^(?:ssh://git@github\.com/|git@github\.com:)"
    r"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$",
    re.IGNORECASE,
)


class CheapLfsError(RuntimeError):
    """A bounded, user-displayable Cheap LFS failure."""


@dataclass(frozen=True)
class CheapLfsReleaseAsset:
    name: str
    size_in_bytes: int
    digest: str | None
    state: str
    label: str | None = None


@dataclass(frozen=True)
class CheapLfsRelease:
    tag: str
    body: str
    draft: bool
    prerelease: bool
    assets: tuple[CheapLfsReleaseAsset, ...]


class CheapLfsReleaseProvider(Protocol):
    """Provider boundary used by the real ``gh`` adapter and unit fakes."""

    def get_release(self, repository: str, tag: str) -> CheapLfsRelease | None: ...

    def create_release(self, repository: str, tag: str) -> CheapLfsRelease: ...

    def upload_asset(
        self,
        repository: str,
        tag: str,
        source: Path,
        asset_name: str,
        label: str,
    ) -> CheapLfsReleaseAsset: ...

    def download_asset(
        self,
        repository: str,
        tag: str,
        asset_name: str,
        destination: Path,
    ) -> None: ...


class GhCheapLfsReleaseProvider:
    """Published-prerelease storage through the installed GitHub CLI."""

    def __init__(
        self,
        transport: GhTransport | None = None,
        *,
        command_prefix: Sequence[str] = ("gh",),
        timeout_seconds: float = 3_600.0,
    ) -> None:
        if not command_prefix or any(not item or "\x00" in item for item in command_prefix):
            raise ValueError("GitHub CLI command prefix must contain safe argv items.")
        if timeout_seconds <= 0:
            raise ValueError("GitHub CLI timeout must be greater than zero.")
        self.transport = transport or SubprocessGhTransport()
        self.command_prefix = tuple(command_prefix)
        self.timeout_seconds = timeout_seconds

    def get_release(self, repository: str, tag: str) -> CheapLfsRelease | None:
        repository = _validate_repository_slug(repository)
        tag = _validate_release_tag(tag)
        result = self._run(
            (
                "release",
                "view",
                tag,
                "--repo",
                repository,
                "--json",
                "tagName,isDraft,isPrerelease,body,assets",
            ),
            allow_failure=True,
        )
        if result.return_code != 0:
            message = sanitize_cli_text(f"{result.stderr} {result.stdout}")
            if re.search(r"(?:HTTP\s+)?404\b|not found|release does not exist", message, re.I):
                return None
            raise CheapLfsError(message or "GitHub CLI could not read the Cheap LFS release.")
        try:
            raw = json.loads(result.stdout)
            if not isinstance(raw, Mapping):
                raise TypeError("Release metadata root is not an object.")
            raw_assets = raw.get("assets", [])
            if not isinstance(raw_assets, list):
                raise TypeError("Release assets are not a list.")
            assets_list: list[CheapLfsReleaseAsset] = []
            for item in raw_assets:
                if not isinstance(item, Mapping):
                    raise TypeError("Release asset metadata is not an object.")
                assets_list.append(
                    CheapLfsReleaseAsset(
                        name=str(item["name"]),
                        size_in_bytes=int(item["size"]),
                        digest=(
                            str(item["digest"]).lower()
                            if item.get("digest") not in (None, "")
                            else None
                        ),
                        state=str(item.get("state", "uploaded")).lower(),
                        label=(str(item["label"]) if item.get("label") not in (None, "") else None),
                    )
                )
            assets = tuple(assets_list)
            return CheapLfsRelease(
                tag=str(raw["tagName"]),
                body=str(raw.get("body") or ""),
                draft=bool(raw.get("isDraft")),
                prerelease=bool(raw.get("isPrerelease")),
                assets=assets,
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise CheapLfsError("GitHub CLI returned malformed Release metadata.") from error

    def create_release(self, repository: str, tag: str) -> CheapLfsRelease:
        repository = _validate_repository_slug(repository)
        tag = _validate_release_tag(tag)
        self._run(
            (
                "release",
                "create",
                tag,
                "--repo",
                repository,
                "--title",
                f"Cheap LFS assets ({tag})",
                "--notes",
                CHEAP_LFS_RELEASE_BODY_SENTINEL,
                "--prerelease",
            )
        )
        release = self.get_release(repository, tag)
        if release is None:
            raise CheapLfsError("GitHub created no readable Cheap LFS release.")
        return release

    def upload_asset(
        self,
        repository: str,
        tag: str,
        source: Path,
        asset_name: str,
        label: str,
    ) -> CheapLfsReleaseAsset:
        repository = _validate_repository_slug(repository)
        tag = _validate_release_tag(tag)
        _validate_release_asset_leaf(asset_name)
        if source.name != asset_name:
            raise CheapLfsError("Cheap LFS staged asset name does not match its upload plan.")
        self._run(
            (
                "release",
                "upload",
                tag,
                f"{source}#{label}",
                "--repo",
                repository,
            )
        )
        release = self.get_release(repository, tag)
        if release is None:
            raise CheapLfsError("Cheap LFS release disappeared after upload.")
        for asset in release.assets:
            if asset.name == asset_name:
                return asset
        raise CheapLfsError("GitHub did not report the uploaded Cheap LFS asset.")

    def download_asset(
        self,
        repository: str,
        tag: str,
        asset_name: str,
        destination: Path,
    ) -> None:
        repository = _validate_repository_slug(repository)
        tag = _validate_release_tag(tag)
        _validate_release_asset_leaf(asset_name)
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix="cheap-lfs-download-",
            dir=destination.parent,
        ) as raw_directory:
            directory = Path(raw_directory)
            self._run(
                (
                    "release",
                    "download",
                    tag,
                    "--repo",
                    repository,
                    "--pattern",
                    _escape_gh_asset_pattern(asset_name),
                    "--dir",
                    str(directory),
                )
            )
            downloaded = directory / asset_name
            if not downloaded.is_file() or downloaded.is_symlink():
                raise CheapLfsError(f"GitHub did not download the exact asset {asset_name!r}.")
            _atomic_copy(downloaded, destination)

    def _run(
        self,
        arguments: Sequence[str],
        *,
        allow_failure: bool = False,
    ) -> GhProcessResult:
        try:
            result = self.transport.run(
                (*self.command_prefix, *arguments),
                timeout_seconds=self.timeout_seconds,
            )
        except FileNotFoundError as error:
            raise CheapLfsError(
                "GitHub CLI (gh) is required for Release transfer operations."
            ) from error
        except (subprocess.TimeoutExpired, TimeoutError) as error:
            raise CheapLfsError("GitHub CLI Cheap LFS transfer timed out.") from error
        if result.return_code != 0 and not allow_failure:
            message = sanitize_cli_text(f"{result.stderr} {result.stdout}")
            raise CheapLfsError(message or "GitHub CLI Cheap LFS operation failed.")
        return result


@dataclass(frozen=True)
class CheapLfsHashedPart:
    index: int
    offset: int
    length: int
    sha256: str
    asset_name: str


@dataclass(frozen=True)
class CheapLfsTrackPlan:
    repository: Path
    repository_slug: str
    relative_path: str
    absolute_path: Path
    release_tag: str
    size_in_bytes: int
    sha256: str
    parts: tuple[CheapLfsHashedPart, ...]
    pointer_text: str
    cache_root: Path
    source_identity: tuple[int, int, int, int]
    requires_confirmation: bool = True

    @property
    def provider_mutations(self) -> tuple[str, ...]:
        return (
            f"create managed prerelease {self.release_tag!r} if absent",
            f"upload or reuse {len(self.parts)} verified Release asset(s)",
            f"replace {self.relative_path!r} with a canonical v1 pointer",
        )


@dataclass(frozen=True)
class CheapLfsTrackReceipt:
    relative_path: str
    release_tag: str
    size_in_bytes: int
    sha256: str
    uploaded_assets: tuple[str, ...]
    reused_assets: tuple[str, ...]
    pointer_path: Path
    staged: bool
    recovery_path: Path


@dataclass(frozen=True)
class CheapLfsInventoryEntry:
    relative_path: str
    state: str
    size_in_bytes: int
    sha256: str
    release_tag: str
    asset_count: int
    cached_parts: int
    verified: bool | None
    detail: str = ""


@dataclass(frozen=True)
class CheapLfsRestorePlan:
    repository: Path
    repository_slug: str | None
    relative_path: str
    pointer: CheapLfsPointer
    cached_parts: int
    download_assets: tuple[str, ...]
    requires_confirmation: bool = True

    @property
    def provider_reads(self) -> tuple[str, ...]:
        if not self.download_assets:
            return ()
        return (
            f"download {len(self.download_assets)} asset(s) from "
            f"release {self.pointer.release_tag!r}",
        )


@dataclass(frozen=True)
class CheapLfsRestoreReceipt:
    relative_path: str
    size_in_bytes: int
    sha256: str
    downloaded_assets: tuple[str, ...]
    restored_path: Path
    recovery_path: Path


@dataclass(frozen=True)
class _PointerFile:
    path: Path
    relative_path: str
    text: str
    pointer: CheapLfsPointer
    identity: tuple[int, int, int, int]


class CheapLfsService:
    """Plan, track, verify, and restore canonical Release-backed pointers."""

    def __init__(
        self,
        repository: str | Path,
        *,
        provider: CheapLfsReleaseProvider | None = None,
        repository_slug: str | None = None,
        cache_root: str | Path | None = None,
        part_size: int = CHEAP_LFS_PART_SIZE_BYTES,
        git_runner: SubprocessGitRunner | None = None,
        swap_hook: Callable[[str, Path, Path, Path], None] | None = None,
    ) -> None:
        self.repository = Path(repository).expanduser().resolve()
        if not self.repository.is_dir():
            raise CheapLfsError("Cheap LFS repository path is not a directory.")
        self.provider = provider or GhCheapLfsReleaseProvider()
        self.repository_slug_override = (
            _validate_repository_slug(repository_slug) if repository_slug is not None else None
        )
        self.cache_root = (
            Path(cache_root).expanduser().resolve()
            if cache_root is not None
            else Path(user_cache_path("desktop-material-tui", appauthor=False)) / "cheap-lfs"
        )
        if not 1 <= part_size <= CHEAP_LFS_PART_SIZE_BYTES:
            raise ValueError("New Cheap LFS parts must be between 1 byte and 500 MiB.")
        self.part_size = part_size
        self.git_runner = git_runner or SubprocessGitRunner()
        self._swap_hook = swap_hook
        self._validate_repository()

    def status(
        self,
        paths: Sequence[str] = (),
        *,
        verify: bool = False,
    ) -> tuple[CheapLfsInventoryEntry, ...]:
        """List current v1 pointers without contacting the provider."""

        candidates = (
            tuple(self._normalize_path(path) for path in paths)
            if paths
            else self._candidate_paths()
        )
        entries: list[CheapLfsInventoryEntry] = []
        for relative_path in candidates:
            absolute = self.repository / Path(relative_path)
            pointer_file = self._read_pointer_file(absolute, relative_path, required=False)
            if pointer_file is None:
                try:
                    source_stat = absolute.lstat()
                except OSError:
                    continue
                if (
                    not stat.S_ISREG(source_stat.st_mode)
                    or absolute.is_symlink()
                    or source_stat.st_nlink != 1
                    or source_stat.st_size <= CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES
                ):
                    continue
                entries.append(
                    CheapLfsInventoryEntry(
                        relative_path=relative_path,
                        state="auto-pin-candidate",
                        size_in_bytes=source_stat.st_size,
                        sha256="",
                        release_tag="",
                        asset_count=max(
                            1,
                            (source_stat.st_size + self.part_size - 1) // self.part_size,
                        ),
                        cached_parts=0,
                        verified=None,
                        detail=(
                            "safe regular file strictly above the 100 MiB "
                            "automatic-pin threshold; preview hashes it"
                        ),
                    )
                )
                continue
            pointer = pointer_file.pointer
            logical_parts = _pointer_parts(pointer)
            cached = sum(
                self._cached_part_is_valid(part.sha256, part.size_in_bytes)
                for part in logical_parts
            )
            verified_value: bool | None = None
            detail = ""
            if verify:
                verified_value = cached == len(logical_parts)
                detail = (
                    "all payload parts are verified in the local cache"
                    if verified_value
                    else "provider assets were not downloaded by this read-only check"
                )
            entries.append(
                CheapLfsInventoryEntry(
                    relative_path=relative_path,
                    state="pointer",
                    size_in_bytes=pointer.size_in_bytes,
                    sha256=pointer.sha256,
                    release_tag=pointer.release_tag,
                    asset_count=len(logical_parts),
                    cached_parts=cached,
                    verified=verified_value,
                    detail=detail,
                )
            )
        return tuple(entries)

    def preview_track(
        self,
        relative_path: str,
        *,
        release_tag: str = "assets",
        repository_slug: str | None = None,
    ) -> CheapLfsTrackPlan:
        """Hash one payload and return an entirely read-only mutation plan."""

        normalized = self._normalize_path(relative_path)
        tag = _validate_release_tag(release_tag)
        absolute = self.repository / Path(normalized)
        source_stat = self._require_regular_source(absolute)
        if source_stat.st_size < 0:
            raise CheapLfsError("Cheap LFS source reported an invalid size.")
        ranges = plan_file_parts(source_stat.st_size, self.part_size)
        whole_hash, part_hashes = _hash_file_parts(absolute, ranges)
        reviewed_stat = self._require_regular_source(absolute)
        if _stat_identity(reviewed_stat) != _stat_identity(source_stat):
            raise CheapLfsError("Cheap LFS source changed while previewing it.")
        base_name = _asset_base_name(absolute.name, whole_hash, len(ranges))
        width = max(3, len(str(len(ranges))))
        parts = tuple(
            CheapLfsHashedPart(
                index=part.index,
                offset=part.offset,
                length=part.length,
                sha256=part_hashes[part.index],
                asset_name=(
                    base_name
                    if len(ranges) == 1
                    else _append_utf8_suffix(
                        base_name,
                        f".part{part.index + 1:0{width}d}",
                    )
                ),
            )
            for part in ranges
        )
        pointer = _pointer_from_plan(tag, base_name, source_stat.st_size, whole_hash, parts)
        pointer_text = serialize_cheap_lfs_pointer(pointer)
        slug = (
            _validate_repository_slug(repository_slug)
            if repository_slug is not None
            else self._repository_slug()
        )
        return CheapLfsTrackPlan(
            repository=self.repository,
            repository_slug=slug,
            relative_path=normalized,
            absolute_path=absolute,
            release_tag=tag,
            size_in_bytes=source_stat.st_size,
            sha256=whole_hash,
            parts=parts,
            pointer_text=pointer_text,
            cache_root=self.cache_root,
            source_identity=_stat_identity(reviewed_stat),
        )

    def track(
        self,
        plan: CheapLfsTrackPlan,
        *,
        confirmed: bool,
        stage: bool = False,
    ) -> CheapLfsTrackReceipt:
        """Execute a reviewed plan; never clobber provider assets."""

        if not confirmed:
            raise CheapLfsError("Cheap LFS track requires explicit confirmation.")
        self._validate_track_plan_scope(plan)
        self._cache_source(plan)
        release = self.provider.get_release(plan.repository_slug, plan.release_tag)
        if release is None:
            release = self.provider.create_release(plan.repository_slug, plan.release_tag)
        _validate_managed_release(release, plan.release_tag)
        existing = {asset.name: asset for asset in release.assets}
        missing_count = sum(part.asset_name not in existing for part in plan.parts)
        if len(release.assets) + missing_count > CHEAP_LFS_MAXIMUM_RELEASE_ASSETS:
            raise CheapLfsError("Cheap LFS release has insufficient asset capacity.")

        uploaded: list[str] = []
        reused: list[str] = []
        label = _asset_label(plan.relative_path, plan.sha256)
        for part in plan.parts:
            cached_path = self._object_path(part.sha256)
            asset = existing.get(part.asset_name)
            if asset is None:
                with self._staged_asset(cached_path, part.asset_name) as staged_path:
                    asset = self.provider.upload_asset(
                        plan.repository_slug,
                        plan.release_tag,
                        staged_path,
                        part.asset_name,
                        label,
                    )
                uploaded.append(part.asset_name)
            else:
                reused.append(part.asset_name)
            self._prove_provider_asset(
                plan.repository_slug,
                plan.release_tag,
                asset,
                part,
            )

        # Publication quarantines the exact source inode, verifies it once more,
        # and claims the original path without overwrite.  A late editor keeps
        # writing to the retained recovery inode instead of being silently lost.
        recovery_path = self._replace_source_with_pointer(plan)
        if stage:
            self.git_runner.run(
                ["add", "--", f":(literal){plan.relative_path}"],
                cwd=self.repository,
            )
        return CheapLfsTrackReceipt(
            relative_path=plan.relative_path,
            release_tag=plan.release_tag,
            size_in_bytes=plan.size_in_bytes,
            sha256=plan.sha256,
            uploaded_assets=tuple(uploaded),
            reused_assets=tuple(reused),
            pointer_path=plan.absolute_path,
            staged=stage,
            recovery_path=recovery_path,
        )

    def preview_restore(
        self,
        relative_path: str,
        *,
        repository_slug: str | None = None,
    ) -> CheapLfsRestorePlan:
        normalized = self._normalize_path(relative_path)
        pointer_file = self._read_pointer_file(
            self.repository / Path(normalized),
            normalized,
            required=True,
        )
        if pointer_file is None:  # pragma: no cover - ``required`` raises
            raise CheapLfsError("Cheap LFS pointer was not found.")
        logical_parts = _pointer_parts(pointer_file.pointer)
        cached_parts = sum(
            self._cached_part_is_valid(part.sha256, part.size_in_bytes) for part in logical_parts
        )
        downloads = tuple(
            part.name
            for part in logical_parts
            if not self._cached_part_is_valid(part.sha256, part.size_in_bytes)
        )
        slug: str | None = None
        if downloads:
            slug = (
                _validate_repository_slug(repository_slug)
                if repository_slug is not None
                else self._repository_slug()
            )
        return CheapLfsRestorePlan(
            repository=self.repository,
            repository_slug=slug,
            relative_path=normalized,
            pointer=pointer_file.pointer,
            cached_parts=cached_parts,
            download_assets=downloads,
        )

    def restore(
        self,
        plan: CheapLfsRestorePlan,
        *,
        confirmed: bool,
    ) -> CheapLfsRestoreReceipt:
        """Materialize through cache/Release, then atomically replace the pointer."""

        if not confirmed:
            raise CheapLfsError("Cheap LFS restore requires explicit confirmation.")
        if plan.repository.resolve() != self.repository:
            raise CheapLfsError("Cheap LFS restore plan belongs to another repository.")
        normalized = self._normalize_path(plan.relative_path)
        pointer_file = self._read_pointer_file(
            self.repository / Path(normalized),
            normalized,
            required=True,
        )
        if pointer_file is None:  # pragma: no cover - ``required`` raises
            raise CheapLfsError("Cheap LFS pointer was not found.")
        if pointer_file.pointer != plan.pointer:
            raise CheapLfsError("Cheap LFS pointer changed after preview.")

        logical_parts = _pointer_parts(plan.pointer)
        missing = [
            part
            for part in logical_parts
            if not self._cached_part_is_valid(part.sha256, part.size_in_bytes)
        ]
        downloaded: list[str] = []
        if missing:
            if plan.repository_slug is None:
                raise CheapLfsError("Cheap LFS restore requires a GitHub repository slug.")
            release = self.provider.get_release(
                plan.repository_slug,
                plan.pointer.release_tag,
            )
            if release is None:
                raise CheapLfsError(
                    f"No release tagged {plan.pointer.release_tag!r} holds this pointer."
                )
            assets = {asset.name: asset for asset in release.assets}
            for part in missing:
                asset = assets.get(part.name)
                if asset is None:
                    raise CheapLfsError(f"Cheap LFS release has no asset named {part.name!r}.")
                expected_stored_size = (
                    part.deflated_size_in_bytes
                    if part.deflated_size_in_bytes is not None
                    else part.size_in_bytes
                )
                if asset.state != "uploaded" or asset.size_in_bytes != expected_stored_size:
                    raise CheapLfsError(
                        f"Cheap LFS asset {part.name!r} metadata does not match its pointer."
                    )
                self._download_part(
                    plan.repository_slug,
                    plan.pointer.release_tag,
                    part,
                )
                downloaded.append(part.name)

        recovery_path = self._assemble_and_replace(pointer_file)
        return CheapLfsRestoreReceipt(
            relative_path=normalized,
            size_in_bytes=plan.pointer.size_in_bytes,
            sha256=plan.pointer.sha256,
            downloaded_assets=tuple(downloaded),
            restored_path=pointer_file.path,
            recovery_path=recovery_path,
        )

    def verify(
        self,
        relative_path: str,
        *,
        fetch_missing: bool = False,
        repository_slug: str | None = None,
    ) -> CheapLfsInventoryEntry:
        """Verify cached payloads, optionally downloading missing provider data."""

        plan = self.preview_restore(relative_path, repository_slug=repository_slug)
        if fetch_missing and plan.download_assets:
            self._fetch_missing_for_verification(plan)
        entries = self.status((plan.relative_path,), verify=True)
        if not entries:
            raise CheapLfsError("Cheap LFS pointer was not found.")
        return entries[0]

    def _fetch_missing_for_verification(self, plan: CheapLfsRestorePlan) -> None:
        if plan.repository_slug is None:
            raise CheapLfsError("Cheap LFS provider verification requires a repository slug.")
        release = self.provider.get_release(plan.repository_slug, plan.pointer.release_tag)
        if release is None:
            raise CheapLfsError("Cheap LFS release was not found.")
        assets = {asset.name: asset for asset in release.assets}
        for part in _pointer_parts(plan.pointer):
            if self._cached_part_is_valid(part.sha256, part.size_in_bytes):
                continue
            asset = assets.get(part.name)
            if asset is None:
                raise CheapLfsError(f"Cheap LFS release has no asset named {part.name!r}.")
            expected_stored_size = (
                part.deflated_size_in_bytes
                if part.deflated_size_in_bytes is not None
                else part.size_in_bytes
            )
            if asset.state != "uploaded" or asset.size_in_bytes != expected_stored_size:
                raise CheapLfsError(
                    f"Cheap LFS asset {part.name!r} metadata does not match its pointer."
                )
            self._download_part(plan.repository_slug, plan.pointer.release_tag, part)

    def _candidate_paths(self) -> tuple[str, ...]:
        result = self.git_runner.run(
            ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            cwd=self.repository,
            timeout=60.0,
        )
        paths: list[str] = []
        for raw_path in result.stdout.split("\x00"):
            if not raw_path:
                continue
            try:
                normalized = self._normalize_path(raw_path)
            except CheapLfsError:
                continue
            absolute = self.repository / Path(normalized)
            try:
                file_stat = absolute.lstat()
            except OSError:
                continue
            if not stat.S_ISREG(file_stat.st_mode) or absolute.is_symlink():
                continue
            if file_stat.st_size <= CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES:
                try:
                    with absolute.open("rb") as handle:
                        prefix = handle.read(256)
                    prefix_text = prefix.decode("utf-8-sig")
                except (OSError, UnicodeDecodeError):
                    prefix_text = ""
                if is_cheap_lfs_pointer_text(prefix_text):
                    paths.append(normalized)
                    if len(paths) >= 10_000:
                        break
                    continue
            if file_stat.st_size > CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES:
                paths.append(normalized)
            if len(paths) >= 10_000:
                break
        return tuple(paths)

    def _validate_repository(self) -> None:
        try:
            top_level = self.git_runner.run(
                ["rev-parse", "--path-format=absolute", "--show-toplevel"],
                cwd=self.repository,
            ).stdout.strip()
        except Exception as error:
            raise CheapLfsError("Cheap LFS requires a Git working tree.") from error
        if not top_level or Path(top_level).resolve() != self.repository:
            raise CheapLfsError("Cheap LFS repository path must be the Git working-tree root.")

    def _repository_slug(self) -> str:
        if self.repository_slug_override is not None:
            return self.repository_slug_override
        try:
            url = self.git_runner.run(
                ["remote", "get-url", "origin"],
                cwd=self.repository,
            ).stdout.strip()
        except Exception as error:
            raise CheapLfsError(
                "Cheap LFS could not resolve origin; pass --repo OWNER/NAME."
            ) from error
        for pattern in (_GITHUB_HTTPS_REMOTE, _GITHUB_SSH_REMOTE):
            match = pattern.fullmatch(url)
            if match is not None:
                return _validate_repository_slug(f"{match.group(1)}/{match.group(2)}")
        raise CheapLfsError(
            "Cheap LFS Release transfer currently supports GitHub.com origins; "
            "pass --repo OWNER/NAME when origin is not canonical."
        )

    def _normalize_path(self, relative_path: str) -> str:
        normalized = validate_cheap_lfs_tracked_path(relative_path)
        if normalized is None:
            raise CheapLfsError(
                "Choose a Windows-safe repository-relative path without Git metadata "
                "or parent traversal."
            )
        absolute = (self.repository / Path(normalized)).absolute()
        try:
            common = os.path.commonpath((str(self.repository), str(absolute)))
        except ValueError as error:
            raise CheapLfsError("Cheap LFS path is on another filesystem.") from error
        if os.path.normcase(common) != os.path.normcase(str(self.repository)):
            raise CheapLfsError("Cheap LFS path must stay inside the repository.")
        self._require_unredirected_parent(absolute)
        return normalized

    def _require_unredirected_parent(self, path: Path) -> None:
        lexical_parent = path.parent.absolute()
        try:
            canonical_parent = lexical_parent.resolve(strict=True)
            common = os.path.commonpath((str(self.repository), str(canonical_parent)))
        except (OSError, ValueError) as error:
            raise CheapLfsError(
                "Cheap LFS requires an existing, unredirected repository parent."
            ) from error
        if os.path.normcase(common) != os.path.normcase(str(self.repository)) or os.path.normcase(
            str(canonical_parent)
        ) != os.path.normcase(str(lexical_parent)):
            raise CheapLfsError("Cheap LFS refuses a symlink, junction, or redirected parent path.")

    def _require_regular_source(self, path: Path) -> os.stat_result:
        self._require_unredirected_parent(path)
        try:
            source_stat = path.lstat()
        except OSError as error:
            raise CheapLfsError(f"Cheap LFS source is unavailable: {error}") from error
        if not stat.S_ISREG(source_stat.st_mode) or path.is_symlink():
            raise CheapLfsError("Cheap LFS refuses a symlink, junction, or non-regular source.")
        if source_stat.st_nlink != 1:
            raise CheapLfsError("Cheap LFS refuses a hard-linked source file.")
        if source_stat.st_size <= CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES:
            try:
                with path.open("rb") as handle:
                    candidate = handle.read(CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES + 1)
                if parse_cheap_lfs_pointer(candidate.decode("utf-8-sig")) is not None:
                    raise CheapLfsError("This path is already a Cheap LFS pointer.")
            except UnicodeDecodeError:
                pass
        return source_stat

    def _validate_track_plan_scope(self, plan: CheapLfsTrackPlan) -> None:
        try:
            ranges = plan_file_parts(plan.size_in_bytes, self.part_size)
            base_name = _asset_base_name(
                plan.absolute_path.name,
                plan.sha256,
                len(ranges),
            )
            width = max(3, len(str(len(ranges))))
            expected_parts = tuple(
                CheapLfsHashedPart(
                    index=part_range.index,
                    offset=part_range.offset,
                    length=part_range.length,
                    sha256=part.sha256,
                    asset_name=(
                        base_name
                        if len(ranges) == 1
                        else _append_utf8_suffix(
                            base_name,
                            f".part{part_range.index + 1:0{width}d}",
                        )
                    ),
                )
                for part_range, part in zip(ranges, plan.parts, strict=False)
            )
            valid = (
                plan.repository.resolve() == self.repository
                and self._normalize_path(plan.relative_path) == plan.relative_path
                and plan.absolute_path == self.repository / Path(plan.relative_path)
                and plan.cache_root.resolve() == self.cache_root
                and _validate_repository_slug(plan.repository_slug) == plan.repository_slug
                and _validate_release_tag(plan.release_tag) == plan.release_tag
                and _SHA256_HEX.fullmatch(plan.sha256) is not None
                and len(plan.parts) == len(ranges)
                and all(
                    _SHA256_HEX.fullmatch(part.sha256) is not None and part == expected
                    for part, expected in zip(
                        plan.parts,
                        expected_parts,
                        strict=True,
                    )
                )
                and plan.pointer_text
                == serialize_cheap_lfs_pointer(
                    _pointer_from_plan(
                        plan.release_tag,
                        base_name,
                        plan.size_in_bytes,
                        plan.sha256,
                        expected_parts,
                    )
                )
            )
        except (AttributeError, CheapLfsError, TypeError, ValueError):
            valid = False
        if not valid:
            raise CheapLfsError("Cheap LFS track plan is invalid or belongs elsewhere.")

    def _cache_source(self, plan: CheapLfsTrackPlan) -> None:
        self._ensure_cache_directories()
        if _stat_identity(self._require_regular_source(plan.absolute_path)) != (
            plan.source_identity
        ):
            raise CheapLfsError("Cheap LFS source changed after preview.")
        ranges = tuple(
            CheapLfsPartRange(part.index, part.offset, part.length) for part in plan.parts
        )
        whole = hashlib.sha256()
        observed_parts: list[str] = []
        with plan.absolute_path.open("rb") as source:
            for part, part_range in zip(plan.parts, ranges, strict=True):
                destination = self._object_path(part.sha256)
                destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                descriptor, raw_temp = tempfile.mkstemp(
                    prefix=f".{part.sha256}.",
                    dir=destination.parent,
                )
                temporary = Path(raw_temp)
                part_hash = hashlib.sha256()
                try:
                    with os.fdopen(descriptor, "wb") as output:
                        remaining = part_range.length
                        while remaining:
                            chunk = source.read(min(_BUFFER_SIZE, remaining))
                            if not chunk:
                                raise CheapLfsError(
                                    "Cheap LFS source became shorter while caching."
                                )
                            output.write(chunk)
                            whole.update(chunk)
                            part_hash.update(chunk)
                            remaining -= len(chunk)
                        output.flush()
                        os.fsync(output.fileno())
                    observed = part_hash.hexdigest()
                    observed_parts.append(observed)
                    if observed != part.sha256 or temporary.stat().st_size != part.length:
                        raise CheapLfsError("Cheap LFS source changed after preview.")
                    temporary.replace(destination)
                finally:
                    temporary.unlink(missing_ok=True)
            if source.read(1):
                raise CheapLfsError("Cheap LFS source became longer after preview.")
        if whole.hexdigest() != plan.sha256 or tuple(observed_parts) != tuple(
            part.sha256 for part in plan.parts
        ):
            raise CheapLfsError("Cheap LFS source changed after preview.")
        if _stat_identity(self._require_regular_source(plan.absolute_path)) != (
            plan.source_identity
        ):
            raise CheapLfsError("Cheap LFS source changed while caching.")

    def _prove_provider_asset(
        self,
        repository_slug: str,
        release_tag: str,
        asset: CheapLfsReleaseAsset,
        part: CheapLfsHashedPart,
    ) -> None:
        if asset.name != part.asset_name or asset.state != "uploaded":
            raise CheapLfsError("GitHub reported the wrong Cheap LFS asset.")
        if asset.size_in_bytes != part.length:
            raise CheapLfsError("GitHub Cheap LFS asset has the wrong byte size.")
        digest_match = _SHA256_DIGEST.fullmatch(asset.digest or "")
        if digest_match is not None:
            if digest_match.group(1) != part.sha256:
                raise CheapLfsError("GitHub Cheap LFS asset has the wrong digest.")
            return
        # Historical/enterprise responses may omit the provider digest.  Prove
        # content by a bounded download rather than trusting a collision-prone name.
        self._download_raw_and_verify(
            repository_slug,
            release_tag,
            part.asset_name,
            part.length,
            part.sha256,
        )

    def _download_raw_and_verify(
        self,
        repository_slug: str,
        release_tag: str,
        asset_name: str,
        expected_size: int,
        expected_sha256: str,
    ) -> Path:
        self._ensure_cache_directories()
        destination = self._object_path(expected_sha256)
        descriptor, raw_temp = tempfile.mkstemp(
            prefix=".download-",
            dir=self.cache_root / "incoming",
        )
        os.close(descriptor)
        temporary = Path(raw_temp)
        try:
            self.provider.download_asset(
                repository_slug,
                release_tag,
                asset_name,
                temporary,
            )
            observed_sha, observed_size = _hash_file(temporary)
            if observed_sha != expected_sha256 or observed_size != expected_size:
                raise CheapLfsError("Downloaded Cheap LFS asset does not match the pointer.")
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            temporary.replace(destination)
            return destination
        finally:
            temporary.unlink(missing_ok=True)

    def _download_part(
        self,
        repository_slug: str,
        release_tag: str,
        part: CheapLfsPart,
    ) -> Path:
        if part.deflated_size_in_bytes is None:
            return self._download_raw_and_verify(
                repository_slug,
                release_tag,
                part.name,
                part.size_in_bytes,
                part.sha256,
            )
        self._ensure_cache_directories()
        descriptor, raw_temp = tempfile.mkstemp(
            prefix=".compressed-",
            dir=self.cache_root / "incoming",
        )
        os.close(descriptor)
        compressed = Path(raw_temp)
        destination = self._object_path(part.sha256)
        expanded = compressed.with_name(f"{compressed.name}.expanded")
        try:
            self.provider.download_asset(
                repository_slug,
                release_tag,
                part.name,
                compressed,
            )
            if compressed.stat().st_size != part.deflated_size_in_bytes:
                raise CheapLfsError("Compressed Cheap LFS asset has the wrong size.")
            _inflate_raw_bounded(compressed, expanded, part.size_in_bytes)
            observed_sha, observed_size = _hash_file(expanded)
            if observed_sha != part.sha256 or observed_size != part.size_in_bytes:
                raise CheapLfsError("Expanded Cheap LFS part failed verification.")
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            expanded.replace(destination)
            return destination
        finally:
            compressed.unlink(missing_ok=True)
            expanded.unlink(missing_ok=True)

    def _assemble_and_replace(self, pointer_file: _PointerFile) -> Path:
        destination = pointer_file.path
        descriptor, raw_temp = tempfile.mkstemp(
            prefix=f".{destination.name}.cheap-lfs-",
            dir=destination.parent,
        )
        temporary = Path(raw_temp)
        whole_hash = hashlib.sha256()
        size = 0
        try:
            with os.fdopen(descriptor, "wb") as output:
                for part in _pointer_parts(pointer_file.pointer):
                    cached = self._object_path(part.sha256)
                    if not self._cached_part_is_valid(part.sha256, part.size_in_bytes):
                        raise CheapLfsError("A verified Cheap LFS cache part is missing.")
                    with cached.open("rb") as source:
                        while True:
                            chunk = source.read(_BUFFER_SIZE)
                            if not chunk:
                                break
                            output.write(chunk)
                            whole_hash.update(chunk)
                            size += len(chunk)
                output.flush()
                os.fsync(output.fileno())
            if (
                size != pointer_file.pointer.size_in_bytes
                or whole_hash.hexdigest() != pointer_file.pointer.sha256
            ):
                raise CheapLfsError("Reassembled Cheap LFS payload failed whole-file verification.")
            with contextlib.suppress(OSError):
                temporary.chmod(stat.S_IMODE(destination.stat().st_mode))
            return self._exclusive_quarantine_swap(
                destination,
                temporary,
                review=lambda quarantine: self._review_quarantined_pointer(
                    quarantine,
                    pointer_file,
                ),
                operation="restore",
            )
        finally:
            temporary.unlink(missing_ok=True)

    def _replace_source_with_pointer(self, plan: CheapLfsTrackPlan) -> Path:
        source_stat = self._require_regular_source(plan.absolute_path)
        descriptor, raw_temp = tempfile.mkstemp(
            prefix=f".{plan.absolute_path.name}.cheap-lfs-pointer-",
            dir=plan.absolute_path.parent,
        )
        temporary = Path(raw_temp)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(plan.pointer_text.encode("utf-8"))
                output.flush()
                os.fsync(output.fileno())
            with contextlib.suppress(OSError):
                temporary.chmod(stat.S_IMODE(source_stat.st_mode))
            if _stat_identity(source_stat) != plan.source_identity:
                raise CheapLfsError("Cheap LFS source changed before pointer publication.")
            return self._exclusive_quarantine_swap(
                plan.absolute_path,
                temporary,
                review=lambda quarantine: self._review_quarantined_source(
                    quarantine,
                    plan,
                ),
                operation="track",
            )
        finally:
            temporary.unlink(missing_ok=True)

    def _exclusive_quarantine_swap(
        self,
        destination: Path,
        replacement: Path,
        *,
        review: Callable[[Path], None],
        operation: str,
    ) -> Path:
        """Claim ``destination`` without overwrite while retaining its old inode.

        The old path is renamed to a random sibling first.  A hard link into the
        app-owned recovery store preserves both the reviewed bytes and any writes
        arriving through an already-open file descriptor.  The replacement then
        claims the now-empty original path with another no-overwrite hard link.
        """

        quarantine = destination.with_name(
            f".{destination.name}.cheap-lfs-quarantine-{uuid.uuid4().hex}"
        )
        self._require_unredirected_parent(destination)
        destination.rename(quarantine)
        recovery = self._retain_quarantine(quarantine, destination.name, operation)
        try:
            review(quarantine)
            if self._swap_hook is not None:
                self._swap_hook("before-publish", destination, quarantine, recovery)
            try:
                self._require_unredirected_parent(destination)
                os.link(replacement, destination)
            except FileExistsError as error:
                raise CheapLfsError(
                    f"Cheap LFS {operation} found a new file at the target path; "
                    f"it was not overwritten. Recovery is retained at {recovery}."
                ) from error
            except OSError as error:
                raise CheapLfsError(
                    f"Cheap LFS {operation} could not publish with no-overwrite "
                    f"semantics. Recovery is retained at {recovery}: {error}"
                ) from error
        except Exception:
            self._restore_quarantine_without_overwrite(
                quarantine,
                destination,
                recovery,
            )
            raise
        if recovery != quarantine:
            with contextlib.suppress(OSError):
                quarantine.unlink()
        return recovery

    def _retain_quarantine(
        self,
        quarantine: Path,
        original_name: str,
        operation: str,
    ) -> Path:
        repository_key = hashlib.sha256(str(self.repository).encode("utf-8")).hexdigest()[:16]
        recovery_directory = self.cache_root / "recovery" / repository_key
        recovery_name = f"{operation}-{uuid.uuid4().hex}-{_safe_recovery_name(original_name)}"
        try:
            recovery_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            if recovery_directory.is_symlink() or not recovery_directory.is_dir():
                raise OSError("recovery directory is redirected")
            recovery = recovery_directory / recovery_name
            os.link(quarantine, recovery)
            return recovery
        except OSError:
            # Cross-device cache roots cannot hard-link the quarantined inode.
            # Keeping the random sibling is noisier but never loses a late edit.
            return quarantine

    def _restore_quarantine_without_overwrite(
        self,
        quarantine: Path,
        destination: Path,
        recovery: Path,
    ) -> None:
        try:
            self._require_unredirected_parent(destination)
        except CheapLfsError:
            # The reviewed inode remains in recovery. Never follow a parent
            # path which changed into a symlink or junction during rollback.
            return
        if destination.exists() or destination.is_symlink():
            return
        source = quarantine if quarantine.exists() else recovery
        try:
            os.link(source, destination)
        except OSError:
            return
        if recovery != quarantine:
            with contextlib.suppress(OSError):
                quarantine.unlink()

    @staticmethod
    def _review_quarantined_pointer(
        quarantine: Path,
        pointer_file: _PointerFile,
    ) -> None:
        try:
            file_stat = quarantine.lstat()
            if (
                not stat.S_ISREG(file_stat.st_mode)
                or quarantine.is_symlink()
                or file_stat.st_size > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES
                or _stat_identity(file_stat) != pointer_file.identity
            ):
                raise CheapLfsError("Cheap LFS pointer changed while restoring.")
            with quarantine.open("rb") as handle:
                data = handle.read(CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES + 1)
            text = data.decode("utf-8-sig")
        except (OSError, UnicodeDecodeError) as error:
            raise CheapLfsError("Cheap LFS pointer changed while restoring.") from error
        if text != pointer_file.text or parse_cheap_lfs_pointer(text) != pointer_file.pointer:
            raise CheapLfsError("Cheap LFS pointer changed while restoring.")

    @staticmethod
    def _review_quarantined_source(
        quarantine: Path,
        plan: CheapLfsTrackPlan,
    ) -> None:
        try:
            file_stat = quarantine.lstat()
        except OSError as error:
            raise CheapLfsError("Cheap LFS source changed before publication.") from error
        if (
            not stat.S_ISREG(file_stat.st_mode)
            or quarantine.is_symlink()
            or _stat_identity(file_stat) != plan.source_identity
        ):
            raise CheapLfsError("Cheap LFS source changed before publication.")
        whole_hash, part_hashes = _hash_file_parts(
            quarantine,
            tuple(CheapLfsPartRange(part.index, part.offset, part.length) for part in plan.parts),
        )
        if whole_hash != plan.sha256 or tuple(part_hashes) != tuple(
            part.sha256 for part in plan.parts
        ):
            raise CheapLfsError(
                "Cheap LFS source changed after preview; uploaded assets were retained "
                "but the changed file was recovered without being overwritten."
            )

    def _read_pointer_file(
        self,
        path: Path,
        relative_path: str,
        *,
        required: bool,
    ) -> _PointerFile | None:
        try:
            self._require_unredirected_parent(path)
        except CheapLfsError:
            if required:
                raise
            return None
        try:
            file_stat = path.lstat()
            if (
                not stat.S_ISREG(file_stat.st_mode)
                or path.is_symlink()
                or file_stat.st_nlink != 1
                or file_stat.st_size > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES
            ):
                if required:
                    raise CheapLfsError("Cheap LFS pointer path is not a safe regular file.")
                return None
            with path.open("rb") as handle:
                data = handle.read(CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES + 1)
            if len(data) > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES:
                if required:
                    raise CheapLfsError("Cheap LFS pointer grew beyond 512 KiB.")
                return None
        except OSError as error:
            if required:
                raise CheapLfsError(f"Cheap LFS pointer is unavailable: {error}") from error
            return None
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            if required:
                raise CheapLfsError("Cheap LFS pointer is not UTF-8 text.") from None
            return None
        pointer = parse_cheap_lfs_pointer(text)
        if pointer is None:
            if required:
                raise CheapLfsError("This file is not a canonical Cheap LFS v1 pointer.")
            return None
        return _PointerFile(
            path=path,
            relative_path=relative_path,
            text=text,
            pointer=pointer,
            identity=_stat_identity(file_stat),
        )

    def _object_path(self, sha256: str) -> Path:
        return self.cache_root / "objects" / "sha256" / sha256[:2] / sha256

    def _cached_part_is_valid(self, sha256: str, expected_size: int) -> bool:
        path = self._object_path(sha256)
        try:
            file_stat = path.lstat()
            if (
                not stat.S_ISREG(file_stat.st_mode)
                or path.is_symlink()
                or file_stat.st_size != expected_size
            ):
                return False
            observed, size = _hash_file(path)
            return observed == sha256 and size == expected_size
        except OSError:
            return False

    def _ensure_cache_directories(self) -> None:
        for directory in (
            self.cache_root,
            self.cache_root / "incoming",
            self.cache_root / "staging",
        ):
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            with contextlib.suppress(OSError):
                directory.chmod(0o700)

    def _staged_asset(self, source: Path, asset_name: str) -> _StagedAsset:
        self._ensure_cache_directories()
        return _StagedAsset(source, asset_name, self.cache_root / "staging")


class _StagedAsset:
    def __init__(self, source: Path, asset_name: str, root: Path) -> None:
        self.source = source
        self.asset_name = asset_name
        self.root = root
        self.directory: tempfile.TemporaryDirectory[str] | None = None

    def __enter__(self) -> Path:
        _validate_release_asset_leaf(self.asset_name)
        self.directory = tempfile.TemporaryDirectory(
            prefix="upload-",
            dir=self.root,
        )
        target = Path(self.directory.name) / self.asset_name
        try:
            os.link(self.source, target)
        except OSError:
            shutil.copyfile(self.source, target)
        return target

    def __exit__(self, *_args: object) -> None:
        if self.directory is not None:
            self.directory.cleanup()


def _pointer_from_plan(
    release_tag: str,
    base_name: str,
    size_in_bytes: int,
    whole_sha256: str,
    parts: Sequence[CheapLfsHashedPart],
) -> CheapLfsPointer:
    if len(parts) == 1:
        return CheapLfsPointer(
            version=CHEAP_LFS_POINTER_VERSION,
            release_tag=release_tag,
            asset_name=parts[0].asset_name,
            size_in_bytes=size_in_bytes,
            sha256=whole_sha256,
        )
    return CheapLfsPointer(
        version=CHEAP_LFS_POINTER_VERSION,
        release_tag=release_tag,
        asset_name=base_name,
        size_in_bytes=size_in_bytes,
        sha256=whole_sha256,
        parts=tuple(
            CheapLfsPart(
                name=part.asset_name,
                size_in_bytes=part.length,
                sha256=part.sha256,
            )
            for part in parts
        ),
    )


def _pointer_parts(pointer: CheapLfsPointer) -> tuple[CheapLfsPart, ...]:
    if pointer.parts is not None:
        return pointer.parts
    return (
        CheapLfsPart(
            name=pointer.asset_name,
            size_in_bytes=pointer.size_in_bytes,
            sha256=pointer.sha256,
        ),
    )


def _hash_file_parts(
    path: Path,
    ranges: Sequence[CheapLfsPartRange],
) -> tuple[str, tuple[str, ...]]:
    whole = hashlib.sha256()
    part_hashes: list[str] = []
    try:
        with path.open("rb") as handle:
            for part in ranges:
                digest = hashlib.sha256()
                remaining = part.length
                while remaining:
                    chunk = handle.read(min(_BUFFER_SIZE, remaining))
                    if not chunk:
                        raise CheapLfsError("Cheap LFS source became shorter while hashing.")
                    whole.update(chunk)
                    digest.update(chunk)
                    remaining -= len(chunk)
                part_hashes.append(digest.hexdigest())
            if handle.read(1):
                raise CheapLfsError("Cheap LFS source became longer while hashing.")
    except OSError as error:
        raise CheapLfsError(f"Cheap LFS could not hash the source: {error}") from error
    return whole.hexdigest(), tuple(part_hashes)


def _hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(_BUFFER_SIZE)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def _asset_base_name(source_name: str, sha256: str, part_count: int) -> str:
    normalized = unicodedata.normalize("NFC", source_name).strip()
    normalized = re.sub(r"[\x00-\x1f\x7f/\\?#\[\]*]", "_", normalized)
    if normalized in {"", ".", ".."}:
        normalized = "asset"
    suffix = f".cheap-lfs-{sha256[:12]}"
    if part_count > 1:
        width = max(3, len(str(part_count)))
        suffix += f".parts-{part_count:0{width}d}"
    return _append_utf8_suffix(normalized, suffix)


def _append_utf8_suffix(value: str, suffix: str, maximum_bytes: int = 255) -> str:
    budget = maximum_bytes - len(suffix.encode("utf-8"))
    if budget < 1:
        raise CheapLfsError("Cheap LFS asset suffix exceeds GitHub's name limit.")
    prefix_bytes = value.encode("utf-8")[:budget]
    while prefix_bytes:
        try:
            prefix = prefix_bytes.decode("utf-8")
            break
        except UnicodeDecodeError:
            prefix_bytes = prefix_bytes[:-1]
    else:
        prefix = "a"
    return f"{prefix}{suffix}"


def _asset_label(relative_path: str, sha256: str) -> str:
    clean_path = " ".join(re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", relative_path).split())
    head = f"{CHEAP_LFS_ASSET_LABEL_PREFIX} sha256={sha256} commit=- path="
    budget = 255 - len(head.encode("utf-8"))
    encoded = clean_path.encode("utf-8")
    if len(encoded) > budget:
        tail = encoded[-(budget - 3) :]
        while tail:
            try:
                clean_path = "..." + tail.decode("utf-8")
                break
            except UnicodeDecodeError:
                tail = tail[1:]
    return head + clean_path


def _validate_release_tag(value: str) -> str:
    tag = value.strip()
    if (
        tag != value
        or _RELEASE_TAG.fullmatch(tag) is None
        or "\ufeff" in tag
        or tag.startswith("-")
        or tag in {".", ".."}
    ):
        raise CheapLfsError("Cheap LFS release tag must be option-safe and whitespace-free.")
    return tag


def _validate_repository_slug(value: str) -> str:
    slug = value.strip().removesuffix(".git")
    match = _REPOSITORY_SLUG.fullmatch(slug)
    if match is None or match.group("host") not in (None, "github.com"):
        raise CheapLfsError("Repository must use OWNER/NAME or github.com/OWNER/NAME.")
    owner = match.group("owner")
    name = match.group("name")
    if owner in {".", ".."} or name in {".", ".."} or owner.startswith("-") or name.startswith("-"):
        raise CheapLfsError("Repository must use OWNER/NAME or github.com/OWNER/NAME.")
    return f"{owner}/{name}"


def _validate_managed_release(release: CheapLfsRelease, expected_tag: str) -> None:
    has_legacy_provenance = any(
        _LEGACY_ASSET_LABEL.fullmatch(asset.label or "") is not None for asset in release.assets
    )
    if (
        release.tag != expected_tag
        or not release.prerelease
        or release.draft
        or (release.body != CHEAP_LFS_RELEASE_BODY_SENTINEL and not has_legacy_provenance)
    ):
        raise CheapLfsError(
            "Cheap LFS refuses to use a normal, draft, renamed, or unowned release."
        )


def _escape_gh_asset_pattern(asset_name: str) -> str:
    replacements = {"[": "[[]", "]": "[]]", "*": "[*]", "?": "[?]"}
    return "".join(replacements.get(character, character) for character in asset_name)


def _validate_release_asset_leaf(value: str) -> str:
    if (
        not value
        or value in {".", ".."}
        or value != value.strip()
        or len(value.encode("utf-8")) > 255
        or re.search(r'[\x00-\x1f\x7f/\\<>:"|?#]', value) is not None
        or value.endswith((".", " "))
    ):
        raise CheapLfsError("Cheap LFS pointer names an unsafe or non-leaf Release asset.")
    return value


def _safe_recovery_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]", "_", value)
    return normalized[:120] or "payload"


def _atomic_copy(source: Path, destination: Path) -> None:
    descriptor, raw_temp = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        dir=destination.parent,
    )
    os.close(descriptor)
    temporary = Path(raw_temp)
    try:
        shutil.copyfile(source, temporary)
        with temporary.open("rb") as handle:
            os.fsync(handle.fileno())
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def _inflate_raw_bounded(source: Path, destination: Path, maximum_size: int) -> None:
    decompressor = zlib.decompressobj(wbits=-zlib.MAX_WBITS)
    written = 0
    if maximum_size < 0:
        raise CheapLfsError("Compressed Cheap LFS part has an invalid declared size.")
    try:
        with source.open("rb") as compressed, destination.open("wb") as expanded:
            while True:
                pending = compressed.read(_BUFFER_SIZE)
                if not pending:
                    break
                while pending:
                    output_limit = min(
                        _BUFFER_SIZE,
                        maximum_size - written + 1,
                    )
                    data = decompressor.decompress(pending, output_limit)
                    written += len(data)
                    if written > maximum_size:
                        raise CheapLfsError("Compressed Cheap LFS part exceeds its declared size.")
                    expanded.write(data)
                    if decompressor.unused_data:
                        raise CheapLfsError("Compressed Cheap LFS part contains trailing bytes.")
                    remainder = decompressor.unconsumed_tail
                    if remainder == pending and not data:
                        raise CheapLfsError("Compressed Cheap LFS part made no decoding progress.")
                    pending = remainder
            while not decompressor.eof:
                output_limit = min(
                    _BUFFER_SIZE,
                    maximum_size - written + 1,
                )
                data = decompressor.decompress(b"", output_limit)
                if not data:
                    break
                written += len(data)
                if written > maximum_size:
                    raise CheapLfsError("Compressed Cheap LFS part exceeds its declared size.")
                expanded.write(data)
                if decompressor.unused_data:
                    raise CheapLfsError("Compressed Cheap LFS part contains trailing bytes.")
            if decompressor.unused_data:
                raise CheapLfsError("Compressed Cheap LFS part contains trailing bytes.")
            if written != maximum_size or not decompressor.eof:
                raise CheapLfsError("Compressed Cheap LFS part is truncated or oversized.")
            expanded.flush()
            os.fsync(expanded.fileno())
    except zlib.error as error:
        raise CheapLfsError("Compressed Cheap LFS part is invalid.") from error


def _stat_identity(value: os.stat_result) -> tuple[int, int, int, int]:
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)


def auto_pin_candidate(size_in_bytes: int) -> bool:
    """Expose the desktop app's strict ``> 100 MiB`` automatic-pin rule."""

    return size_in_bytes > CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES


def summarize_provider_scope() -> tuple[str, ...]:
    """Factual help text shared by CLI and TUI."""

    return (
        "Read/write: canonical desktop-material/cheap-lfs/v1 GitHub Release pointers.",
        "Read/restore: raw part and legacy part-deflate records with exact SHA-256 checks.",
        "Writes: published managed prereleases through gh; no asset clobbering.",
        "Not implemented here: OCI/GHCR/Docker writes and cloud-compression publication.",
    )
