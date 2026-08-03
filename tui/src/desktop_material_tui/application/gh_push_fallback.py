"""One-shot GitHub CLI credential fallback for HTTPS pushes.

The fallback is intentionally narrow: it is consulted only after Git reports an
authentication or permission failure, and it never materializes a credential.
``gh auth git-credential`` remains an out-of-process Git credential helper.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import unquote, urlsplit

from ..domain.errors import GitCommandError
from ..infrastructure.github.transport import GhTransport, SubprocessGhTransport

GH_CREDENTIAL_CONFIG_ARGS = (
    "-c",
    "credential.helper=",
    "-c",
    "credential.helper=!gh auth git-credential",
)

_AUTH_FAILURE = re.compile(
    r"(?:"
    r"authentication failed|"
    r"could not read (?:username|password)|"
    r"invalid username or password|"
    r"terminal prompts disabled|"
    r"write access to repository not granted|"
    r"permission to .+ denied|"
    r"remote: permission denied|"
    r"(?:http|status)(?:\s+code)?\s*[:=]?\s*(?:401|403)\b"
    r")",
    re.IGNORECASE,
)
_OWNER = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_HOST = re.compile(
    r"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\."
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)


@dataclass(frozen=True)
class HTTPSGitHubRemote:
    """Credential-free facts parsed from one HTTPS remote URL."""

    hostname: str
    owner: str


@dataclass(frozen=True)
class GitHubPushFallbackContext:
    """Caller-owned facts that cannot be inferred safely from Git stderr."""

    remote_url: str
    authenticated_login: str | None
    is_known_github_repository: bool
    is_organization_owned: bool


class GhCredentialProbe(Protocol):
    """Read-only availability probe used after every pure predicate passes."""

    def is_available_for(self, hostname: str) -> bool:
        """Return whether ``gh`` exists and is authenticated for ``hostname``."""


class SubprocessGhCredentialProbe:
    """Probe ``gh`` through explicit argv arrays and inspect only exit codes."""

    def __init__(
        self,
        transport: GhTransport | None = None,
        *,
        timeout_seconds: float = 10.0,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self._transport = transport or SubprocessGhTransport()
        self._timeout_seconds = float(timeout_seconds)

    def is_available_for(self, hostname: str) -> bool:
        if not _HOST.fullmatch(hostname):
            return False
        try:
            version = self._transport.run(
                ("gh", "--version"),
                timeout_seconds=self._timeout_seconds,
            )
            if version.return_code != 0:
                return False
            auth = self._transport.run(
                ("gh", "auth", "status", "--hostname", hostname),
                timeout_seconds=self._timeout_seconds,
            )
        except (OSError, subprocess.TimeoutExpired):
            return False
        return auth.return_code == 0


class GitHubPushFallbackPolicy:
    """Evaluate the one-shot fallback contract without changing Git state."""

    def __init__(self, probe: GhCredentialProbe | None = None) -> None:
        self._probe = probe or SubprocessGhCredentialProbe()

    def should_retry(
        self,
        error: GitCommandError,
        context: GitHubPushFallbackContext,
    ) -> bool:
        if not is_auth_or_permission_failure(error):
            return False
        remote = parse_https_github_remote(context.remote_url)
        if remote is None or not context.is_known_github_repository:
            return False
        login = (context.authenticated_login or "").strip()
        owner_differs = bool(login) and remote.owner.casefold() != login.casefold()
        if not context.is_organization_owned and not owner_differs:
            return False
        try:
            return self._probe.is_available_for(remote.hostname)
        except Exception:
            return False


def is_auth_or_permission_failure(error: GitCommandError) -> bool:
    """Classify only credential/permission failures that the helper may fix."""

    output = f"{error.result.stderr}\n{error.result.stdout}"
    return _AUTH_FAILURE.search(output) is not None


def parse_https_github_remote(value: str) -> HTTPSGitHubRemote | None:
    """Return secret-free HTTPS host/owner facts, rejecting userinfo and ports."""

    try:
        parsed = urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError):
        return None
    if parsed.scheme.lower() != "https" or parsed.hostname is None:
        return None
    if parsed.query or parsed.fragment:
        return None
    if parsed.username is not None or parsed.password is not None or port is not None:
        return None
    hostname = parsed.hostname.rstrip(".").lower()
    if not _HOST.fullmatch(hostname):
        return None
    path_parts = [unquote(part) for part in parsed.path.split("/") if part]
    if len(path_parts) != 2 or not _OWNER.fullmatch(path_parts[0]):
        return None
    repository = path_parts[1]
    if repository.endswith(".git"):
        repository = repository[:-4]
    if not _REPOSITORY.fullmatch(repository) or repository in {".", ".."}:
        return None
    return HTTPSGitHubRemote(hostname=hostname, owner=path_parts[0])
