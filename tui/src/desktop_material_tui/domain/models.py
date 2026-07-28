"""Immutable domain models shared by the terminal UI and Git infrastructure."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class GitCommandResult:
    """Completed Git process result.

    ``argv`` is safe to display: the runner redacts URL credentials and
    authorization configuration before constructing this object.
    """

    argv: tuple[str, ...]
    cwd: Path
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


@dataclass(frozen=True)
class FileChange:
    """One entry from ``git status --porcelain=v2 -z``."""

    path: str
    index_status: str
    worktree_status: str
    record_type: str
    original_path: str | None = None
    submodule: str = "N..."
    head_mode: str | None = None
    index_mode: str | None = None
    worktree_mode: str | None = None
    head_oid: str | None = None
    index_oid: str | None = None
    score: str | None = None

    @property
    def is_untracked(self) -> bool:
        return self.record_type == "?"

    @property
    def is_ignored(self) -> bool:
        return self.record_type == "!"

    @property
    def is_staged(self) -> bool:
        return not self.is_ignored and self.index_status not in (".", " ", "?")

    @property
    def is_unstaged(self) -> bool:
        return self.is_untracked or (not self.is_ignored and self.worktree_status not in (".", " "))

    @property
    def is_conflicted(self) -> bool:
        if self.record_type == "u":
            return True
        return "U" in (self.index_status, self.worktree_status) or (
            self.index_status,
            self.worktree_status,
        ) in {
            ("A", "A"),
            ("D", "D"),
        }


@dataclass(frozen=True)
class RepositoryStatus:
    """Repository branch metadata and working-tree changes."""

    branch_oid: str | None
    branch_head: str | None
    upstream: str | None
    ahead: int
    behind: int
    changes: tuple[FileChange, ...]
    is_initial: bool = False
    is_detached: bool = False

    @property
    def is_clean(self) -> bool:
        return not any(not change.is_ignored for change in self.changes)

    @property
    def staged_count(self) -> int:
        return sum(change.is_staged for change in self.changes)

    @property
    def unstaged_count(self) -> int:
        return sum(change.is_unstaged for change in self.changes)

    @property
    def untracked_count(self) -> int:
        return sum(change.is_untracked for change in self.changes)

    @property
    def conflicted_count(self) -> int:
        return sum(change.is_conflicted for change in self.changes)


@dataclass(frozen=True)
class Commit:
    oid: str
    parents: tuple[str, ...]
    author_name: str
    author_email: str
    authored_at: datetime
    subject: str
    body: str

    @property
    def short_oid(self) -> str:
        return self.oid[:8]


@dataclass(frozen=True)
class Branch:
    name: str
    full_name: str
    oid: str
    upstream: str | None
    is_current: bool
    is_remote: bool
    ahead: int = 0
    behind: int = 0
    committed_at: datetime | None = None
    symbolic_target: str | None = None


@dataclass(frozen=True)
class StashEntry:
    ref: str
    index: int
    oid: str
    author_name: str
    author_email: str
    authored_at: datetime
    message: str


@dataclass(frozen=True)
class Remote:
    name: str
    fetch_url: str
    push_url: str


@dataclass(frozen=True)
class Tag:
    name: str
    oid: str
    target_oid: str
    object_type: str
    target_type: str
    subject: str
    created_at: datetime | None = None


@dataclass(frozen=True)
class DiffResult:
    text: str
    staged: bool
    revision: str | None
    paths: tuple[str, ...]

    @property
    def is_empty(self) -> bool:
        return self.text == ""
