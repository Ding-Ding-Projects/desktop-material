"""Structured, display-safe errors for repository operations."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from .models import GitCommandResult


def _bounded(text: str, maximum: int = 16_384) -> str:
    if len(text) <= maximum:
        return text
    return f"{text[:maximum]}\n… output truncated …"


class RepositoryError(RuntimeError):
    """Base class for errors that can be presented by the repository UI."""


class InvalidRepositoryError(RepositoryError):
    def __init__(self, path: Path, detail: str = "Not a Git working tree") -> None:
        self.path = path
        self.detail = detail
        super().__init__(f"{detail}: {path}")


class InvalidGitArgumentError(RepositoryError):
    def __init__(self, field: str, detail: str) -> None:
        self.field = field
        self.detail = detail
        super().__init__(f"Invalid {field}: {detail}")


class GitExecutableNotFoundError(RepositoryError):
    def __init__(self, executable: str) -> None:
        self.executable = executable
        super().__init__(f"Git executable was not found: {executable}")


class GitProcessStartError(RepositoryError):
    def __init__(self, argv: Sequence[str], cwd: Path, detail: str) -> None:
        self.argv = tuple(argv)
        self.cwd = cwd
        self.detail = detail
        super().__init__(f"Unable to start Git in {cwd}: {detail}")


class GitCommandError(RepositoryError):
    """Git exited with a code outside the caller's accepted set."""

    def __init__(self, result: GitCommandResult) -> None:
        self.result = result
        detail = _bounded(result.stderr.strip() or result.stdout.strip())
        if not detail:
            detail = f"Git exited with code {result.exit_code}"
        super().__init__(detail)

    @property
    def argv(self) -> tuple[str, ...]:
        return self.result.argv

    @property
    def cwd(self) -> Path:
        return self.result.cwd

    @property
    def exit_code(self) -> int:
        return self.result.exit_code


class GitCommandTimeoutError(RepositoryError):
    def __init__(
        self,
        argv: Sequence[str],
        cwd: Path,
        timeout_seconds: float,
        duration_seconds: float,
        stdout: str = "",
        stderr: str = "",
    ) -> None:
        self.argv = tuple(argv)
        self.cwd = cwd
        self.timeout_seconds = timeout_seconds
        self.duration_seconds = duration_seconds
        self.stdout = _bounded(stdout)
        self.stderr = _bounded(stderr)
        super().__init__(f"Git timed out after {timeout_seconds:g} seconds in {cwd}")


class GitParseError(RepositoryError):
    def __init__(
        self,
        output_kind: str,
        detail: str,
        snippet: str | None = None,
    ) -> None:
        self.output_kind = output_kind
        self.detail = detail
        self.snippet = _bounded(snippet or "", 512)
        suffix = f": {self.snippet!r}" if self.snippet else ""
        super().__init__(f"Unable to parse Git {output_kind}: {detail}{suffix}")
