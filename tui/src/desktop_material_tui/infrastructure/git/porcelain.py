"""Parsers for stable, machine-oriented Git output formats."""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime, timezone

from ...domain.errors import GitParseError
from ...domain.models import (
    Branch,
    Commit,
    FileChange,
    RepositoryStatus,
    StashEntry,
    Tag,
)

HISTORY_FORMAT = "%H%x00%P%x00%an%x00%ae%x00%at%x00%aI%x00%s%x00%b%x00"
BRANCH_FORMAT = (
    "%(refname)%00%(refname:short)%00%(objectname)%00"
    "%(upstream:short)%00%(upstream:track,nobracket)%00%(HEAD)%00"
    "%(committerdate:iso-strict)%00%(symref)%00"
)
STASH_FORMAT = "%gd%x00%H%x00%an%x00%ae%x00%aI%x00%gs%x00"
TAG_FORMAT = (
    "%(refname:short)%00%(objectname)%00%(objecttype)%00"
    "%(*objectname)%00%(*objecttype)%00%(subject)%00"
    "%(creatordate:iso-strict)%00"
)

_AHEAD = re.compile(r"(?:^|,\s*)ahead\s+(\d+)(?:,|$)")
_BEHIND = re.compile(r"(?:^|,\s*)behind\s+(\d+)(?:,|$)")
_STASH_INDEX = re.compile(r"^stash@\{(\d+)\}$")


def _parse_iso_datetime(
    value: str,
    *,
    output_kind: str,
    allow_empty: bool = False,
) -> datetime | None:
    if value == "" and allow_empty:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise GitParseError(output_kind, "invalid ISO timestamp", value) from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _fixed_nul_records(
    output: str,
    width: int,
    output_kind: str,
) -> Iterable[tuple[str, ...]]:
    fields = output.split("\x00")
    # The format strings end in NUL and Git appends one record newline. Remove
    # that one synthetic field only; an empty final data field (for example an
    # empty commit body) immediately before it is meaningful.
    if fields and fields[-1].strip("\r\n") == "":
        fields.pop()
    if not fields:
        return ()
    if len(fields) % width != 0:
        raise GitParseError(
            output_kind,
            f"expected a multiple of {width} NUL-delimited fields, got {len(fields)}",
            output,
        )

    records: list[tuple[str, ...]] = []
    for offset in range(0, len(fields), width):
        record = fields[offset : offset + width]
        # Git appends a record newline outside the pretty format. It therefore
        # becomes a prefix on the next record's first NUL-delimited field.
        record[0] = record[0].lstrip("\r\n")
        records.append(tuple(record))
    return records


def _consume_status_headers(
    segment: str,
    headers: dict[str, str],
) -> str:
    """Consume one or more newline-separated porcelain branch headers."""

    remainder = segment
    while remainder.startswith("# "):
        if "\n" in remainder:
            line, remainder = remainder.split("\n", 1)
        else:
            line, remainder = remainder, ""
        name, separator, value = line[2:].partition(" ")
        if not separator:
            raise GitParseError("status", "malformed branch header", line)
        headers[name] = value.rstrip("\r")
    return remainder


def _xy(value: str, segment: str) -> tuple[str, str]:
    if len(value) != 2:
        raise GitParseError("status", "invalid XY status code", segment)
    return value[0], value[1]


def parse_porcelain_v2(output: str) -> RepositoryStatus:
    """Parse ``git status --porcelain=v2 --branch -z`` output.

    Paths remain unquoted and may contain spaces or newlines. Rename/copy
    records consume the following NUL field as their original path.
    """

    headers: dict[str, str] = {}
    changes: list[FileChange] = []
    segments = output.split("\x00")
    index = 0

    while index < len(segments):
        segment = _consume_status_headers(segments[index], headers)
        index += 1
        if segment == "":
            continue

        record_type = segment[0]
        if record_type == "1":
            fields = segment.split(" ", 8)
            if len(fields) != 9:
                raise GitParseError("status", "malformed ordinary record", segment)
            index_status, worktree_status = _xy(fields[1], segment)
            changes.append(
                FileChange(
                    path=fields[8],
                    index_status=index_status,
                    worktree_status=worktree_status,
                    record_type=record_type,
                    submodule=fields[2],
                    head_mode=fields[3],
                    index_mode=fields[4],
                    worktree_mode=fields[5],
                    head_oid=fields[6],
                    index_oid=fields[7],
                )
            )
        elif record_type == "2":
            fields = segment.split(" ", 9)
            if len(fields) != 10:
                raise GitParseError("status", "malformed rename/copy record", segment)
            if index >= len(segments) or segments[index] == "":
                raise GitParseError(
                    "status", "rename/copy record is missing its original path", segment
                )
            original_path = segments[index]
            index += 1
            index_status, worktree_status = _xy(fields[1], segment)
            changes.append(
                FileChange(
                    path=fields[9],
                    original_path=original_path,
                    index_status=index_status,
                    worktree_status=worktree_status,
                    record_type=record_type,
                    submodule=fields[2],
                    head_mode=fields[3],
                    index_mode=fields[4],
                    worktree_mode=fields[5],
                    head_oid=fields[6],
                    index_oid=fields[7],
                    score=fields[8],
                )
            )
        elif record_type == "u":
            fields = segment.split(" ", 10)
            if len(fields) != 11:
                raise GitParseError("status", "malformed unmerged record", segment)
            index_status, worktree_status = _xy(fields[1], segment)
            changes.append(
                FileChange(
                    path=fields[10],
                    index_status=index_status,
                    worktree_status=worktree_status,
                    record_type=record_type,
                    submodule=fields[2],
                    head_mode=fields[3],
                    index_mode=fields[4],
                    worktree_mode=fields[6],
                    head_oid=fields[7],
                    index_oid=fields[8],
                )
            )
        elif record_type in ("?", "!"):
            if len(segment) < 3 or segment[1] != " ":
                raise GitParseError("status", "malformed untracked/ignored record", segment)
            changes.append(
                FileChange(
                    path=segment[2:],
                    index_status="?" if record_type == "?" else "!",
                    worktree_status="?" if record_type == "?" else "!",
                    record_type=record_type,
                )
            )
        else:
            raise GitParseError("status", f"unknown record type {record_type!r}", segment)

    raw_oid = headers.get("branch.oid")
    is_initial = raw_oid == "(initial)"
    branch_oid = None if raw_oid in (None, "(initial)") else raw_oid
    raw_head = headers.get("branch.head")
    is_detached = raw_head == "(detached)"
    branch_head = None if raw_head in (None, "(detached)") else raw_head

    ahead = 0
    behind = 0
    ab = headers.get("branch.ab")
    if ab is not None:
        match = re.fullmatch(r"\+(\d+)\s+-(\d+)", ab)
        if match is None:
            raise GitParseError("status", "invalid branch.ab header", ab)
        ahead, behind = int(match.group(1)), int(match.group(2))

    return RepositoryStatus(
        branch_oid=branch_oid,
        branch_head=branch_head,
        upstream=headers.get("branch.upstream"),
        ahead=ahead,
        behind=behind,
        changes=tuple(changes),
        is_initial=is_initial,
        is_detached=is_detached,
    )


def parse_history(output: str) -> tuple[Commit, ...]:
    commits: list[Commit] = []
    for record in _fixed_nul_records(output, 8, "history"):
        oid, parents, author_name, author_email, timestamp, iso_date, subject, body = record
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", oid):
            raise GitParseError("history", "invalid commit object ID", oid)
        try:
            int(timestamp)
        except ValueError as error:
            raise GitParseError("history", "invalid author timestamp", timestamp) from error
        authored_at = _parse_iso_datetime(iso_date, output_kind="history")
        assert authored_at is not None
        commits.append(
            Commit(
                oid=oid,
                parents=tuple(parent for parent in parents.split(" ") if parent),
                author_name=author_name,
                author_email=author_email,
                authored_at=authored_at,
                subject=subject,
                body=body.rstrip("\n"),
            )
        )
    return tuple(commits)


def _track_counts(track: str) -> tuple[int, int]:
    ahead_match = _AHEAD.search(track)
    behind_match = _BEHIND.search(track)
    return (
        int(ahead_match.group(1)) if ahead_match else 0,
        int(behind_match.group(1)) if behind_match else 0,
    )


def parse_branches(output: str) -> tuple[Branch, ...]:
    branches: list[Branch] = []
    for record in _fixed_nul_records(output, 8, "branches"):
        (
            full_name,
            name,
            oid,
            upstream,
            track,
            head_marker,
            committed_date,
            symbolic_target,
        ) = record
        if symbolic_target and full_name.startswith("refs/remotes/"):
            # Hide origin/HEAD-style symbolic aliases from the branch picker.
            continue
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", oid):
            raise GitParseError("branches", "invalid branch object ID", oid)
        ahead, behind = _track_counts(track)
        branches.append(
            Branch(
                name=name,
                full_name=full_name,
                oid=oid,
                upstream=upstream or None,
                is_current=head_marker == "*",
                is_remote=full_name.startswith("refs/remotes/"),
                ahead=ahead,
                behind=behind,
                committed_at=_parse_iso_datetime(
                    committed_date,
                    output_kind="branches",
                    allow_empty=True,
                ),
                symbolic_target=symbolic_target or None,
            )
        )
    return tuple(branches)


def parse_stashes(output: str) -> tuple[StashEntry, ...]:
    stashes: list[StashEntry] = []
    for record in _fixed_nul_records(output, 6, "stashes"):
        ref, oid, author_name, author_email, iso_date, message = record
        match = _STASH_INDEX.fullmatch(ref)
        if match is None:
            raise GitParseError("stashes", "invalid stash reference", ref)
        authored_at = _parse_iso_datetime(iso_date, output_kind="stashes")
        assert authored_at is not None
        stashes.append(
            StashEntry(
                ref=ref,
                index=int(match.group(1)),
                oid=oid,
                author_name=author_name,
                author_email=author_email,
                authored_at=authored_at,
                message=message,
            )
        )
    return tuple(stashes)


def parse_tags(output: str) -> tuple[Tag, ...]:
    tags: list[Tag] = []
    for record in _fixed_nul_records(output, 7, "tags"):
        name, oid, object_type, peeled_oid, peeled_type, subject, iso_date = record
        target_oid = peeled_oid or oid
        target_type = peeled_type or object_type
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", oid):
            raise GitParseError("tags", "invalid tag object ID", oid)
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", target_oid):
            raise GitParseError("tags", "invalid tag target object ID", target_oid)
        tags.append(
            Tag(
                name=name,
                oid=oid,
                target_oid=target_oid,
                object_type=object_type,
                target_type=target_type,
                subject=subject,
                created_at=_parse_iso_datetime(
                    iso_date,
                    output_kind="tags",
                    allow_empty=True,
                ),
            )
        )
    return tuple(tags)
