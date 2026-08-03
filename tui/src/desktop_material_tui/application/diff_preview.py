"""Bounded, dependency-light models for terminal diff presentation."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Literal

MAX_TREE_PATH_LENGTH = 4_096
MAX_TREE_DEPTH = 128
MAX_TEXT_PREVIEW_BYTES = 512 * 1024
MAX_STRUCTURED_RECORDS = 500
MAX_STRUCTURED_COLUMNS = 128
MAX_STRUCTURED_CELLS = 20_000
MAX_STRUCTURED_CELL_BYTES = 64 * 1024

_WINDOWS_ABSOLUTE = re.compile(r"^[A-Za-z]:[/\\]")


class DiffPreviewError(ValueError):
    """A file cannot be represented safely by the requested preview."""


@dataclass(frozen=True)
class ChangedPathEntry:
    """A repository path plus safe presentation-only tree segments."""

    path: str
    segments: tuple[str, ...]
    grouped: bool


@dataclass(frozen=True)
class StructuredRow:
    """One aligned CSV/TSV record pair."""

    status: Literal["unchanged", "added", "removed", "changed"]
    before_index: int | None
    after_index: int | None
    before: tuple[str, ...] | None
    after: tuple[str, ...] | None


@dataclass(frozen=True)
class StructuredDiff:
    """Bounded semantic CSV/TSV comparison ready for a terminal table."""

    delimiter: str
    column_count: int
    rows: tuple[StructuredRow, ...]


def changed_path_entries(paths: tuple[str, ...]) -> tuple[ChangedPathEntry, ...]:
    """Group only safe relative Git paths; keep unsafe labels as root leaves."""

    entries: list[ChangedPathEntry] = []
    for path in paths:
        segments = _safe_tree_segments(path)
        entries.append(
            ChangedPathEntry(
                path=path,
                segments=segments if segments is not None else (path,),
                grouped=segments is not None,
            )
        )
    return tuple(
        sorted(
            entries,
            key=lambda entry: (entry.segments, entry.path),
        )
    )


def decode_text_preview(
    payload: bytes | None,
    *,
    label: str,
    max_bytes: int = MAX_TEXT_PREVIEW_BYTES,
) -> str:
    """Decode one bounded UTF-8 text side without guessing a legacy encoding."""

    if payload is None:
        return ""
    if not 1 <= max_bytes <= MAX_TEXT_PREVIEW_BYTES:
        raise ValueError("text preview byte limit is outside the supported range")
    if len(payload) > max_bytes:
        raise DiffPreviewError(f"{label} exceeds the {max_bytes:,}-byte preview limit")
    if b"\0" in payload:
        raise DiffPreviewError(f"{label} contains NUL bytes and is treated as binary")
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise DiffPreviewError(f"{label} is not valid UTF-8 text") from error
    if any(
        ord(character) < 32 and character not in {"\t", "\n", "\r"}
        for character in text
    ):
        raise DiffPreviewError(f"{label} contains unsafe terminal control characters")
    return text


def structured_diff(
    before: bytes | None,
    after: bytes | None,
    *,
    delimiter: Literal[",", "\t"],
) -> StructuredDiff:
    """Parse and align bounded CSV or TSV records without generating a patch."""

    before_rows = _parse_records(before, delimiter=delimiter, label="before side")
    after_rows = _parse_records(after, delimiter=delimiter, label="after side")
    column_count = max(
        (len(row) for row in (*before_rows, *after_rows)),
        default=0,
    )
    matcher = SequenceMatcher(a=before_rows, b=after_rows, autojunk=False)
    rows: list[StructuredRow] = []
    for opcode, before_start, before_end, after_start, after_end in matcher.get_opcodes():
        if opcode == "equal":
            for offset in range(before_end - before_start):
                before_index = before_start + offset
                after_index = after_start + offset
                rows.append(
                    StructuredRow(
                        status="unchanged",
                        before_index=before_index,
                        after_index=after_index,
                        before=before_rows[before_index],
                        after=after_rows[after_index],
                    )
                )
            continue
        if opcode == "delete":
            rows.extend(
                StructuredRow("removed", index, None, before_rows[index], None)
                for index in range(before_start, before_end)
            )
            continue
        if opcode == "insert":
            rows.extend(
                StructuredRow("added", None, index, None, after_rows[index])
                for index in range(after_start, after_end)
            )
            continue

        paired = min(before_end - before_start, after_end - after_start)
        for offset in range(paired):
            before_index = before_start + offset
            after_index = after_start + offset
            rows.append(
                StructuredRow(
                    status="changed",
                    before_index=before_index,
                    after_index=after_index,
                    before=before_rows[before_index],
                    after=after_rows[after_index],
                )
            )
        rows.extend(
            StructuredRow("removed", index, None, before_rows[index], None)
            for index in range(before_start + paired, before_end)
        )
        rows.extend(
            StructuredRow("added", None, index, None, after_rows[index])
            for index in range(after_start + paired, after_end)
        )
    return StructuredDiff(delimiter=delimiter, column_count=column_count, rows=tuple(rows))


def _safe_tree_segments(path: str) -> tuple[str, ...] | None:
    if (
        not path
        or len(path) > MAX_TREE_PATH_LENGTH
        or path.startswith(("/", "\\"))
        or _WINDOWS_ABSOLUTE.match(path)
        or any(ord(character) < 32 or ord(character) == 127 for character in path)
    ):
        return None
    segments = tuple(path.split("/"))
    if (
        len(segments) > MAX_TREE_DEPTH
        or any(segment in {"", ".", ".."} for segment in segments)
    ):
        return None
    return segments


def _parse_records(
    payload: bytes | None,
    *,
    delimiter: str,
    label: str,
) -> tuple[tuple[str, ...], ...]:
    if payload is None:
        return ()
    text = decode_text_preview(payload, label=label)
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
        records: list[tuple[str, ...]] = []
        cell_count = 0
        for record in reader:
            if len(records) >= MAX_STRUCTURED_RECORDS:
                raise DiffPreviewError(
                    f"{label} exceeds {MAX_STRUCTURED_RECORDS:,} structured records"
                )
            if len(record) > MAX_STRUCTURED_COLUMNS:
                raise DiffPreviewError(
                    f"{label} exceeds {MAX_STRUCTURED_COLUMNS:,} columns"
                )
            for cell in record:
                if len(cell.encode("utf-8")) > MAX_STRUCTURED_CELL_BYTES:
                    raise DiffPreviewError(
                        f"{label} contains a cell over {MAX_STRUCTURED_CELL_BYTES:,} bytes"
                    )
            cell_count += len(record)
            if cell_count > MAX_STRUCTURED_CELLS:
                raise DiffPreviewError(
                    f"{label} exceeds {MAX_STRUCTURED_CELLS:,} structured cells"
                )
            records.append(tuple(record))
    except csv.Error as error:
        raise DiffPreviewError(f"{label} is malformed delimited text: {error}") from error
    return tuple(records)
