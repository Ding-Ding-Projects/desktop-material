"""Public domain contracts for Desktop Material TUI."""

from .errors import (
    GitCommandError,
    GitCommandTimeoutError,
    GitExecutableNotFoundError,
    GitParseError,
    GitProcessStartError,
    InvalidGitArgumentError,
    InvalidRepositoryError,
    RepositoryError,
)
from .models import (
    Branch,
    Commit,
    DiffResult,
    FileChange,
    GitCommandResult,
    Remote,
    RepositoryStatus,
    StashEntry,
    Tag,
)
from .ports import GitRunner

__all__ = [
    "Branch",
    "Commit",
    "DiffResult",
    "FileChange",
    "GitCommandError",
    "GitCommandResult",
    "GitCommandTimeoutError",
    "GitExecutableNotFoundError",
    "GitParseError",
    "GitProcessStartError",
    "GitRunner",
    "InvalidGitArgumentError",
    "InvalidRepositoryError",
    "Remote",
    "RepositoryError",
    "RepositoryStatus",
    "StashEntry",
    "Tag",
]
