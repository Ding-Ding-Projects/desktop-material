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
class GitConfigValue:
    """One effective Git configuration value and the source that won."""

    value: str
    scope: str
    origin: str


@dataclass(frozen=True)
class EffectiveGitAuthor:
    """Effective commit identity without pretending a missing value exists."""

    name: GitConfigValue | None
    email: GitConfigValue | None

    @property
    def complete(self) -> bool:
        return self.name is not None and self.email is not None


@dataclass(frozen=True)
class CommitMessageSuggestion:
    """A deterministic, offline commit-message draft."""

    summary: str
    body: str
    included_paths: tuple[str, ...]
    source: str = "offline-deterministic"


@dataclass(frozen=True)
class HistoryRecord:
    """One commit from a bounded current-branch or cross-ref page."""

    oid: str
    parents: tuple[str, ...]
    author_name: str
    author_email: str
    authored_at: datetime | None
    subject: str
    body: str
    decorations: tuple[str, ...] = ()

    @property
    def merge_commit(self) -> bool:
        return len(self.parents) > 1


@dataclass(frozen=True)
class BulkBranchCandidate:
    """One local branch tip considered for reviewed deletion."""

    name: str
    ref: str
    oid: str
    protected_reason: str | None = None


@dataclass(frozen=True)
class BulkBranchReview:
    """Immutable exact tips accepted at the bulk-delete review boundary."""

    candidates: tuple[BulkBranchCandidate, ...]


@dataclass(frozen=True)
class BranchDeletionResult:
    """Isolated outcome and recovery identity for one local branch."""

    name: str
    recovery_oid: str
    deleted: bool
    error: str | None = None


@dataclass(frozen=True)
class PullPreview:
    """Freshly fetched, stale-checkable ordinary pull review."""

    current_branch: str
    current_ref: str
    current_oid: str
    upstream_ref: str
    upstream_oid: str
    remote: str
    merge_base_oid: str
    ahead: int
    behind: int
    route: str
    incoming_commits: tuple[HistoryRecord, ...]
    incoming_files: tuple[str, ...]
    commits_truncated: bool = False
    files_truncated: bool = False
    confirmable: bool = True
    unavailable_reason: str | None = None


@dataclass(frozen=True)
class DeletedUpstreamReview:
    """Reviewed local recovery after a configured upstream disappeared."""

    repository: Path
    current_branch: str
    current_oid: str
    upstream_ref: str
    remote: str
    remote_branch: str
    default_branch: str
    default_oid: str
    stranded_commits: int | None


@dataclass(frozen=True)
class RebasePreview:
    """Exact current and target tips for one reviewed rebase."""

    current_branch: str
    current_ref: str
    current_oid: str
    target: str
    target_oid: str
    ahead: int
    behind: int
    commits: tuple[HistoryRecord, ...]
    commits_truncated: bool = False


@dataclass(frozen=True)
class ShallowState:
    shallow: bool
    remote: str | None


@dataclass(frozen=True)
class MergeTarget:
    """One exact branch or linked-worktree tip in a merge-all review."""

    label: str
    oid: str
    ref: str | None
    worktree: Path | None
    conflicting_paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class MergeAllReview:
    current_branch: str
    current_oid: str
    targets: tuple[MergeTarget, ...]


@dataclass(frozen=True)
class MergeTargetResult:
    label: str
    oid: str
    merged: bool
    error: str | None = None


@dataclass(frozen=True)
class BatchRepositorySnapshot:
    path: Path
    current_branch: str | None
    current_oid: str | None
    upstream_ref: str | None
    operation: str


@dataclass(frozen=True)
class BatchSyncReview:
    operation: str
    repositories: tuple[BatchRepositorySnapshot, ...]


@dataclass(frozen=True)
class BatchSyncResult:
    path: Path
    status: str
    detail: str


@dataclass(frozen=True)
class GitFailureDiagnosis:
    """Pure, bounded failure classification and a work-preserving prompt."""

    kind: str
    summary: str
    original_error: str
    recovery_prompt: str
    one_click_safe: bool = False


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


def parse_config_value(output: str) -> GitConfigValue | None:
    """Parse ``git config --show-scope --show-origin --get`` output."""

    line = output.rstrip("\r\n")
    if not line:
        return None
    fields = line.split("\t", 2)
    if len(fields) != 3:
        return None
    scope, origin, value = fields
    return GitConfigValue(value=value, scope=scope, origin=origin)


def parse_history_records(output: str) -> tuple[HistoryRecord, ...]:
    """Parse bounded record/unit-separated Git log output."""

    records: list[HistoryRecord] = []
    for raw_record in output.split("\x1e"):
        record = raw_record.strip("\r\n")
        if not record:
            continue
        fields = record.split("\x1f")
        if len(fields) != 8:
            continue
        authored_at: datetime | None
        try:
            normalized = f"{fields[4][:-1]}+00:00" if fields[4].endswith("Z") else fields[4]
            authored_at = datetime.fromisoformat(normalized)
        except ValueError:
            authored_at = None
        records.append(
            HistoryRecord(
                oid=fields[0],
                parents=tuple(fields[1].split()) if fields[1] else (),
                author_name=fields[2],
                author_email=fields[3],
                authored_at=authored_at,
                subject=fields[5],
                body=fields[6].rstrip("\r\n"),
                decorations=tuple(
                    decoration.strip()
                    for decoration in fields[7].split(",")
                    if decoration.strip()
                ),
            )
        )
    return tuple(records)


def parse_name_status(output: str, *, limit: int) -> tuple[tuple[str, str], ...]:
    """Parse a NUL-delimited ``--name-status`` stream with an explicit bound."""

    if limit < 1:
        return ()
    tokens = output.split("\0")
    records: list[tuple[str, str]] = []
    index = 0
    while index < len(tokens) and len(records) < limit:
        status = tokens[index]
        index += 1
        if not status or index >= len(tokens):
            continue
        path = tokens[index]
        index += 1
        if not path:
            continue
        # Rename/copy records carry an additional destination path. Display
        # the destination because it is the path present after integration.
        if status.startswith(("R", "C")) and index < len(tokens):
            destination = tokens[index]
            index += 1
            if destination:
                path = destination
        records.append((status, path))
    return tuple(records)


def _short_branch(value: str | None) -> str | None:
    if value is None:
        return None
    prefix = "refs/heads/"
    return value[len(prefix) :] if value.startswith(prefix) else value


__all__ = [
    "BatchRepositorySnapshot",
    "BatchSyncResult",
    "BatchSyncReview",
    "BranchDeletionResult",
    "BulkBranchCandidate",
    "BulkBranchReview",
    "CommitMessageSuggestion",
    "DeletedUpstreamReview",
    "EffectiveGitAuthor",
    "GitConfigValue",
    "GitFailureDiagnosis",
    "HistoryRecord",
    "MergeAllReview",
    "MergeTarget",
    "MergeTargetResult",
    "PullPreview",
    "RebasePreview",
    "ReflogRecord",
    "RemoteDiagnostic",
    "RepositoryDiagnostics",
    "ShallowState",
    "SparseCheckoutState",
    "SubmoduleRecord",
    "TagDiagnostic",
    "WorktreeRecord",
    "parse_config_value",
    "parse_history_records",
    "parse_name_status",
    "parse_reflog",
    "parse_submodule_status",
    "parse_worktree_porcelain",
]
