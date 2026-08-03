"""Isolated ``gh`` configuration profiles for explicit browser sign-in."""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
from collections.abc import Callable, Mapping, Sequence
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

from ...application.accounts import GITHUB_REQUIRED_SCOPES, audit_github_scopes
from ...domain.accounts import AccountEmail, AccountProvider, ProviderIdentity
from .transport import GhTransport, SubprocessGhTransport

_HOST = re.compile(
    r"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\."
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)
_PROFILE_ID = re.compile(r"^p_[A-Za-z0-9_-]{24,96}$")
_PLAINTEXT_TOKEN = re.compile(r"(?m)^\s*oauth_token\s*:\s*[^\s#][^\r\n]*$")
_MAX_PROFILE_RESPONSE = 65_536


class GitHubProfileError(RuntimeError):
    """An isolated sign-in failed without retaining process output."""


class InsecureGitHubCredentialStorageError(GitHubProfileError):
    """gh stored a credential outside an operating-system keyring."""


class InteractiveGhTransport(Protocol):
    """TTY/browser-capable transport reserved for a user-invoked sign-in."""

    def run(
        self,
        argv: Sequence[str],
        *,
        environment: Mapping[str, str],
        timeout_seconds: float,
    ) -> int:
        """Run one explicit login argv and return only its exit status."""


class SubprocessInteractiveGhTransport:
    """Run browser login directly, preserving the caller's terminal streams."""

    def run(
        self,
        argv: Sequence[str],
        *,
        environment: Mapping[str, str],
        timeout_seconds: float,
    ) -> int:
        if not argv or any(not item or "\x00" in item for item in argv):
            raise GitHubProfileError("GitHub login command is invalid.")
        process_environment = os.environ.copy()
        process_environment.update(environment)
        process_environment.update(
            {
                "GH_NO_UPDATE_NOTIFIER": "1",
                "GH_PAGER": "cat",
                "PAGER": "cat",
                "NO_COLOR": "1",
            }
        )
        # GH_PROMPT_DISABLED is deliberately absent: this class is reachable
        # only from the explicit browser sign-in method below.
        completed = subprocess.run(  # noqa: S603 - explicit argv, no command shell.
            tuple(argv),
            check=False,
            shell=False,
            env=process_environment,
            timeout=timeout_seconds,
        )
        return completed.returncode


@dataclass(frozen=True)
class GitHubProfileLogin:
    profile_id: str
    identity: ProviderIdentity
    granted_scopes: tuple[str, ...]


class GitHubAccountProfileManager:
    """Own random per-account ``GH_CONFIG_DIR`` profiles below an app directory."""

    def __init__(
        self,
        profiles_root: Path,
        *,
        interactive_transport: InteractiveGhTransport | None = None,
        headless_transport_factory: Callable[[Mapping[str, str]], GhTransport] | None = None,
        login_timeout_seconds: float = 300.0,
        probe_timeout_seconds: float = 20.0,
    ) -> None:
        if login_timeout_seconds <= 0 or probe_timeout_seconds <= 0:
            raise ValueError("profile timeouts must be positive")
        self._root = profiles_root.expanduser().resolve()
        self._root.mkdir(mode=0o700, parents=True, exist_ok=True)
        with suppress(OSError):
            self._root.chmod(0o700)
        self._interactive = interactive_transport or SubprocessInteractiveGhTransport()
        self._transport_factory = headless_transport_factory or SubprocessGhTransport
        self._login_timeout = float(login_timeout_seconds)
        self._probe_timeout = float(probe_timeout_seconds)

    def sign_in_with_browser(self, host: str = "github.com") -> GitHubProfileLogin:
        """Perform one user-invoked web login in a new random isolated profile."""

        normalized_host = _hostname(host)
        profile_id = f"p_{secrets.token_urlsafe(32)}"
        profile_path = self._profile_path(profile_id)
        profile_path.mkdir(mode=0o700)
        with suppress(OSError):
            profile_path.chmod(0o700)
        environment = {"GH_CONFIG_DIR": str(profile_path)}
        argv = (
            "gh",
            "auth",
            "login",
            "--web",
            "--hostname",
            normalized_host,
            "--git-protocol",
            "https",
            "--skip-ssh-key",
            "--scopes",
            ",".join(GITHUB_REQUIRED_SCOPES),
        )
        try:
            return_code = self._interactive.run(
                argv,
                environment=environment,
                timeout_seconds=self._login_timeout,
            )
            if return_code != 0:
                raise GitHubProfileError("GitHub browser sign-in did not complete.")
            self._reject_plaintext_profile(profile_path)
            transport = self._transport_factory(environment)
            status = self._read_json(
                transport,
                (
                    "gh",
                    "auth",
                    "status",
                    "--hostname",
                    normalized_host,
                    "--active",
                    "--json",
                    "hosts",
                ),
                "GitHub authentication status",
            )
            granted_scopes, token_source = _active_profile_status(status, normalized_host)
            if "keyring" not in token_source.casefold():
                raise InsecureGitHubCredentialStorageError(
                    "GitHub CLI did not confirm secure keyring credential storage."
                )
            audit = audit_github_scopes(granted_scopes)
            audit.require_accepted()
            user = self._read_json(
                transport,
                ("gh", "api", "--hostname", normalized_host, "user"),
                "GitHub account identity",
            )
            identity = _github_identity(user, normalized_host)
            return GitHubProfileLogin(profile_id, identity, audit.granted)
        except BaseException:
            self.delete_profile(profile_id)
            raise

    def environment_for(self, profile_id: str) -> dict[str, str]:
        path = self._profile_path(profile_id)
        if not path.is_dir():
            raise GitHubProfileError("GitHub account profile does not exist.")
        return {"GH_CONFIG_DIR": str(path)}

    def delete_profile(self, profile_id: str) -> bool:
        path = self._profile_path(profile_id)
        if not path.exists():
            return False
        shutil.rmtree(path)
        return True

    def _profile_path(self, profile_id: str) -> Path:
        if _PROFILE_ID.fullmatch(profile_id) is None:
            raise GitHubProfileError("GitHub account profile id is invalid.")
        candidate = (self._root / profile_id).resolve()
        if candidate.parent != self._root:
            raise GitHubProfileError("GitHub account profile escaped its owned directory.")
        return candidate

    @staticmethod
    def _reject_plaintext_profile(profile_path: Path) -> None:
        hosts_file = profile_path / "hosts.yml"
        if not hosts_file.exists():
            return
        if hosts_file.stat().st_size > _MAX_PROFILE_RESPONSE:
            raise GitHubProfileError("GitHub account profile metadata is unexpectedly large.")
        value = hosts_file.read_text(encoding="utf-8", errors="replace")
        if _PLAINTEXT_TOKEN.search(value):
            raise InsecureGitHubCredentialStorageError(
                "GitHub CLI attempted to store a credential in plaintext."
            )

    def _read_json(
        self,
        transport: GhTransport,
        argv: tuple[str, ...],
        operation: str,
    ) -> object:
        result = transport.run_binary(
            argv,
            timeout_seconds=self._probe_timeout,
            maximum_bytes=_MAX_PROFILE_RESPONSE,
        )
        if result.return_code != 0:
            raise GitHubProfileError(f"{operation} failed.")
        if len(result.stdout) > _MAX_PROFILE_RESPONSE:
            raise GitHubProfileError(f"{operation} exceeded its response limit.")
        try:
            return json.loads(result.stdout.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise GitHubProfileError(f"{operation} returned invalid JSON.") from error


def _hostname(value: str) -> str:
    candidate = value.rstrip(".").lower()
    if _HOST.fullmatch(candidate) is None:
        raise GitHubProfileError("GitHub hostname is invalid.")
    return candidate


def _active_profile_status(value: object, host: str) -> tuple[tuple[str, ...], str]:
    if not isinstance(value, dict) or not isinstance(value.get("hosts"), dict):
        raise GitHubProfileError("GitHub authentication status has an invalid shape.")
    hosts = cast(dict[object, object], value["hosts"])
    entries = hosts.get(host)
    if not isinstance(entries, list):
        raise GitHubProfileError("GitHub authentication status omitted the requested host.")
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("active") is not True:
            continue
        scopes = entry.get("scopes")
        source = entry.get("tokenSource")
        if (
            not isinstance(scopes, list)
            or any(not isinstance(scope, str) for scope in scopes)
            or not isinstance(source, str)
        ):
            raise GitHubProfileError("GitHub authentication status is incomplete.")
        return tuple(cast(list[str], scopes)), source
    raise GitHubProfileError("GitHub authentication status has no active account.")


def _github_identity(value: object, host: str) -> ProviderIdentity:
    if not isinstance(value, dict):
        raise GitHubProfileError("GitHub account identity has an invalid shape.")
    provider_id = value.get("id")
    login = value.get("login")
    if not isinstance(provider_id, int) or provider_id < 1 or not isinstance(login, str):
        raise GitHubProfileError("GitHub account identity is incomplete.")
    name = value.get("name")
    avatar = value.get("avatar_url")
    email = value.get("email")
    if name is not None and not isinstance(name, str):
        raise GitHubProfileError("GitHub account display name is invalid.")
    if avatar is not None and not isinstance(avatar, str):
        raise GitHubProfileError("GitHub account avatar URL is invalid.")
    if email is not None and not isinstance(email, str):
        raise GitHubProfileError("GitHub account email is invalid.")
    emails = (AccountEmail(email, primary=True),) if email else ()
    return ProviderIdentity(
        provider=AccountProvider.GITHUB,
        endpoint=f"https://{host}",
        provider_id=str(provider_id),
        login=login,
        display_name=name,
        avatar_url=avatar,
        emails=emails,
    )
