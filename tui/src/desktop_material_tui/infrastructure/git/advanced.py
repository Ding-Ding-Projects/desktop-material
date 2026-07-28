"""Parsers and models for Git's advanced workspace plumbing.

The ordinary repository service deliberately stays small.  This module keeps
the less common, multi-worktree and sparse-checkout formats isolated so they
can be tested without invoking a shell or requiring a particular UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class WorktreeRecord:
    """One record from ``git worktree list --porcelain -z``."""

    path: Path
    head: str
    branch: str | None
    detached: bool = False
    bare: bool = False
    locked_reason: str | None = None
    prunable_reason: str | None = None

    @property
    def display_branch(self) -> str:
        if self.bare:
            return "(bare)"
        if self.detached:
            return "(detached)"
        return self.branch or "(unknown)"


@dataclass(frozen=True)
class SubmoduleRecord:
    """A submodule status entry."""

    path: str
    oid: str
    state: str
    description: str = ""

    @property
    def initialized(self) -> bool:
        return self.state != "-"

    @property
    def has_conflict(self) -> bool:
        return self.state == "U"


@dataclass(frozen=True)
class SparseCheckoutState:
    """Current sparse-checkout configuration and its displayed patterns."""

    enabled: bool
    cone_mode: bool
    patterns: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReflogRecord:
    """A bounded recovery entry from ``git reflog``."""

    oid: str
    selector: str
    action: str
    authored_at: datetime | None

    @property
    def short_oid(self) -> str:
        return self.oid[:10]


@dataclass(frozen=True)
class RemoteDiagnostic:
    name: str
    fetch_url: str
    push_url: str


@dataclass(frozen=True)
class TagDiagnostic:
    name: str
    oid: str
    object_type: str
    subject: str


@dataclass(frozen=True)
class RepositoryDiagnostics:
    """A compact diagnostic snapshot safe to render inside the TUI."""

    git_version: str
    repository_root: Path
    git_directory: Path
    common_directory: Path
    head: str
    object_statistics: tuple[tuple[str, str], ...]
    remotes: tuple[RemoteDiagnostic, ...]
    recent_tags: tuple[TagDiagnostic, ...]


def parse_worktree_porcelain(output: str) -> tuple[WorktreeRecord, ...]:
    """Parse the NUL-delimited stable worktree format.

    Git separates fields with NUL and terminates each record with an additional
    NUL.  Reasons after ``locked`` and ``prunable`` are optional.
    """

    records: list[WorktreeRecord] = []
    fields: dict[str, str] = {}

    def finish() -> None:
        if not fields:
            return
        path = fields.get("worktree")
        if path:
            records.append(
                WorktreeRecord(
                    path=Path(path),
                    head=fields.get("HEAD", ""),
                    branch=_short_branch(fields.get("branch")),
                    detached="detached" in fields,
                    bare="bare" in fields,
                    locked_reason=fields.get("locked"),
                    prunable_reason=fields.get("prunable"),
                )
            )
        fields.clear()

    for token in output.split("\0"):
        if token == "":
            finish()
            continue
        key, separator, value = token.partition(" ")
        fields[key] = value if separator else ""
    finish()
    return tuple(records)


def parse_submodule_status(output: str) -> tuple[SubmoduleRecord, ...]:
    """Parse ``git submodule status --recursive`` without losing path spaces."""

    records: list[SubmoduleRecord] = []
    for raw_line in output.splitlines():
        if not raw_line:
            continue
        state = raw_line[0]
        remainder = raw_line[1:]
        oid, separator, path_and_description = remainder.partition(" ")
        if not separator or not oid:
            continue
        path = path_and_description
        description = ""
        if path_and_description.endswith(")") and " (" in path_and_description:
            path, _, suffix = path_and_description.rpartition(" (")
            description = suffix[:-1]
        records.append(
            SubmoduleRecord(
                path=path,
                oid=oid,
                state=state,
                description=description,
            )
        )
    return tuple(records)


def parse_reflog(output: str) -> tuple[ReflogRecord, ...]:
    records: list[ReflogRecord] = []
    for raw_record in output.split("\x1e"):
        record = raw_record.strip("\r\n")
        if not record:
            continue
        fields = record.split("\x1f")
        if len(fields) != 4:
            continue
        authored_at: datetime | None
        try:
            iso_date = fields[3]
            normalized = f"{iso_date[:-1]}+00:00" if iso_date.endswith("Z") else iso_date
            authored_at = datetime.fromisoformat(normalized)
        except ValueError:
            authored_at = None
        records.append(
            ReflogRecord(
                oid=fields[0],
                selector=fields[1],
                action=fields[2],
                authored_at=authored_at,
            )
        )
    return tuple(records)


def _short_branch(value: str | None) -> str | None:
    if value is None:
        return None
    prefix = "refs/heads/"
    return value[len(prefix) :] if value.startswith(prefix) else value


__all__ = [
    "ReflogRecord",
    "RemoteDiagnostic",
    "RepositoryDiagnostics",
    "SparseCheckoutState",
    "SubmoduleRecord",
    "TagDiagnostic",
    "WorktreeRecord",
    "parse_reflog",
    "parse_submodule_status",
    "parse_worktree_porcelain",
]
