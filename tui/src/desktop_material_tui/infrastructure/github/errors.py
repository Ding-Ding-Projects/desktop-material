"""Structured, secret-safe errors for the GitHub CLI integration."""

from __future__ import annotations

import re
from typing import Any

_ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
_TOKEN_PATTERNS = (
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{12,}\b", re.IGNORECASE),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{12,}\b", re.IGNORECASE),
    re.compile(r"\bBearer\s+[^\s,;]+", re.IGNORECASE),
    re.compile(r"(?im)^(\s*(?:authorization|x-oauth-token)\s*:\s*).+$"),
    re.compile(
        r"(?i)([?&](?:access_token|auth|key|signature|sig|token)="
        r")[^&#\s]+"
    ),
)
_SCOPE_LIST = re.compile(r"missing required scopes?\s*\[([^\]]+)\]", re.IGNORECASE)
_SCOPE_QUOTED = re.compile(
    r"(?:requires?|missing)\s+(?:the\s+)?[\"']([^\"']+)[\"']\s+scope",
    re.IGNORECASE,
)
_HTTP_STATUS = re.compile(r"\bHTTP\s+([1-5][0-9]{2})\b", re.IGNORECASE)


def sanitize_cli_text(value: str, *, maximum_length: int = 1200) -> str:
    """Remove ANSI escapes and credential-shaped values from CLI text."""

    sanitized = _ANSI_ESCAPE.sub("", value)
    for pattern in _TOKEN_PATTERNS:
        if pattern.groups:
            sanitized = pattern.sub(r"\1<redacted>", sanitized)
        else:
            sanitized = pattern.sub("<redacted>", sanitized)
    sanitized = sanitized.replace("\x00", "")
    sanitized = " ".join(sanitized.split())
    if len(sanitized) > maximum_length:
        return f"{sanitized[: maximum_length - 1]}…"
    return sanitized


def extract_required_scopes(value: str) -> tuple[str, ...]:
    """Extract scope names without retaining the surrounding CLI output."""

    scopes: set[str] = set()
    for match in _SCOPE_LIST.finditer(value):
        for candidate in re.split(r"[,\s]+", match.group(1)):
            normalized = candidate.strip(" '\"")
            if normalized:
                scopes.add(normalized)
    for match in _SCOPE_QUOTED.finditer(value):
        normalized = match.group(1).strip()
        if normalized:
            scopes.add(normalized)
    return tuple(sorted(scopes))


def extract_http_status(value: str) -> int | None:
    """Return the last HTTP status mentioned by ``gh``, when present."""

    statuses = [int(match.group(1)) for match in _HTTP_STATUS.finditer(value)]
    return statuses[-1] if statuses else None


class GitHubError(RuntimeError):
    """Base error safe to render directly in the TUI."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        retryable: bool = False,
        operation: str | None = None,
        exit_code: int | None = None,
        http_status: int | None = None,
        required_scopes: tuple[str, ...] = (),
    ) -> None:
        self.message = sanitize_cli_text(message)
        self.code = code
        self.retryable = retryable
        self.operation = operation
        self.exit_code = exit_code
        self.http_status = http_status
        self.required_scopes = required_scopes
        super().__init__(self.message)

    def as_dict(self) -> dict[str, Any]:
        """Return a serialization containing no raw process output."""

        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "operation": self.operation,
            "exit_code": self.exit_code,
            "http_status": self.http_status,
            "required_scopes": list(self.required_scopes),
        }


class GitHubCliNotFoundError(GitHubError):
    """The ``gh`` executable was not installed or could not be launched."""

    def __init__(self, *, operation: str | None = None) -> None:
        super().__init__(
            "GitHub CLI (gh) is not installed or is not available on PATH.",
            code="gh_not_found",
            operation=operation,
        )


class GitHubAuthenticationError(GitHubError):
    """No usable GitHub CLI authentication was available."""

    def __init__(
        self,
        message: str = "GitHub CLI is not authenticated for this host.",
        *,
        operation: str | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(
            message,
            code="gh_not_authenticated",
            operation=operation,
            http_status=http_status,
        )


class GitHubScopeError(GitHubError):
    """The active token lacks one or more required scopes."""

    def __init__(
        self,
        required_scopes: tuple[str, ...],
        *,
        operation: str | None = None,
    ) -> None:
        rendered = ", ".join(required_scopes) if required_scopes else "additional scopes"
        super().__init__(
            f"GitHub CLI authentication is missing required scope(s): {rendered}.",
            code="gh_missing_scope",
            operation=operation,
            required_scopes=required_scopes,
        )


class GitHubTimeoutError(GitHubError):
    """A bounded GitHub CLI operation exceeded its deadline."""

    def __init__(self, timeout_seconds: float, *, operation: str) -> None:
        super().__init__(
            f"GitHub operation timed out after {timeout_seconds:g} seconds.",
            code="gh_timeout",
            retryable=True,
            operation=operation,
        )


class GitHubCommandError(GitHubError):
    """The GitHub CLI or API rejected an operation."""

    def __init__(
        self,
        message: str,
        *,
        operation: str,
        exit_code: int,
        http_status: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(
            message,
            code="gh_command_failed",
            retryable=retryable,
            operation=operation,
            exit_code=exit_code,
            http_status=http_status,
        )


class GitHubResponseError(GitHubError):
    """The CLI returned malformed or unexpectedly shaped JSON."""

    def __init__(self, message: str, *, operation: str) -> None:
        super().__init__(
            message,
            code="gh_invalid_response",
            operation=operation,
        )


class GitHubResponseTooLargeError(GitHubError):
    """A response exceeded the configured memory-safety bound."""

    def __init__(self, actual_bytes: int, maximum_bytes: int, *, operation: str) -> None:
        super().__init__(
            (
                "GitHub response exceeded the configured limit "
                f"({actual_bytes} bytes > {maximum_bytes} bytes)."
            ),
            code="gh_response_too_large",
            operation=operation,
        )


class GitHubValidationError(GitHubError):
    """Caller input failed a local validation rule."""

    def __init__(self, message: str, *, operation: str | None = None) -> None:
        super().__init__(
            message,
            code="gh_validation",
            operation=operation,
        )


class GitHubUnsafeOperationError(GitHubError):
    """The bounded explorer refused an unconfirmed or unsafe request."""

    def __init__(self, message: str, *, operation: str) -> None:
        super().__init__(
            message,
            code="gh_unsafe_operation",
            operation=operation,
        )
