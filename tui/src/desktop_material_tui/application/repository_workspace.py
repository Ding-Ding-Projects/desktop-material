"""Persistent repository-tab workspace behavior and portable sessions."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from ..infrastructure.persistence import RepositoryRecord, SessionRecord, SQLiteStore
from .search import RegexFlags, SearchMode, SearchResult, SearchService

SESSION_FORMAT = "desktop-material-tui-repository-session"
SESSION_FORMAT_VERSION = 1
MAX_SESSION_BYTES = 256 * 1024
MAX_SESSION_REPOSITORIES = 256
MAX_PATH_LENGTH = 4_096
MAX_ALIAS_LENGTH = 128
MAX_GROUP_NAME_LENGTH = 64
MAX_CLOSE_PREVIEW = 20


class RepositoryWorkspaceError(ValueError):
    """A workspace mutation or portable session is invalid."""


class Arrangement(str, Enum):
    """One-shot arrangements; manual movement remains the persisted default."""

    LABEL_ASCENDING = "label-ascending"
    LABEL_DESCENDING = "label-descending"
    NEWEST_OPENED = "newest-opened"
    OLDEST_OPENED = "oldest-opened"
    REPOSITORY_STATUS = "repository-status"
    FAVORITES_FIRST = "favorites-first"
    FAVORITES_LAST = "favorites-last"


class CloseMode(str, Enum):
    """Bulk-close predicates share one exact search result."""

    CONTAINING = "containing"
    NOT_CONTAINING = "not-containing"


@dataclass(frozen=True)
class WorkspaceSnapshot:
    """Ordered open tabs and profile-local group display state."""

    records: tuple[RepositoryRecord, ...]
    active_repository_path: Path | None
    collapsed_groups: frozenset[str]


@dataclass(frozen=True)
class TabStripEntry:
    """A real repository tab or one collapsed-group chip."""

    identifier: str
    label: str
    path: Path | None
    group_name: str | None
    pinned: bool
    favorite: bool
    member_count: int = 1


@dataclass(frozen=True)
class TabStripProjection:
    """Bounded strip entries plus the complete overflow remainder."""

    visible: tuple[TabStripEntry, ...]
    overflow: tuple[TabStripEntry, ...]

    @property
    def overflow_repository_count(self) -> int:
        return sum(entry.member_count for entry in self.overflow)


@dataclass(frozen=True)
class ClosePreview:
    """Reviewable, fail-closed bulk-close plan."""

    query: str
    search_mode: SearchMode
    flags: RegexFlags
    close_mode: CloseMode
    include_pinned: bool
    closing: tuple[RepositoryRecord, ...] = ()
    kept: tuple[RepositoryRecord, ...] = ()
    protected_pinned: tuple[RepositoryRecord, ...] = ()
    protected_unsaved: tuple[RepositoryRecord, ...] = ()
    error: str | None = None

    @property
    def can_confirm(self) -> bool:
        return self.error is None and bool(self.closing)

    @property
    def preview_records(self) -> tuple[RepositoryRecord, ...]:
        return self.closing[:MAX_CLOSE_PREVIEW]

    @property
    def preview_truncated(self) -> bool:
        return len(self.closing) > MAX_CLOSE_PREVIEW


@dataclass(frozen=True)
class SessionImportResult:
    """Facts returned after a bounded portable-session import."""

    imported: tuple[RepositoryRecord, ...]
    skipped_paths: tuple[str, ...]
    merged: bool


class RepositoryWorkspaceService:
    """Own repository-tab metadata without touching any working tree."""

    def __init__(self, database: SQLiteStore, profile: str = "local") -> None:
        normalized_profile = " ".join(profile.split())[:MAX_ALIAS_LENGTH] or "local"
        digest = hashlib.sha256(normalized_profile.encode("utf-8")).hexdigest()[:24]
        self.database = database
        self.profile = normalized_profile
        self.session_id = f"repository-tabs-{digest}"

    def snapshot(self) -> WorkspaceSnapshot:
        """Load one profile's ordered open tabs, repairing stale references."""

        session = self.database.get_session(self.session_id)
        records = self.database.list_repositories(include_hidden=True)
        records_by_path = {_path_key(record.path): record for record in records}
        if session is None:
            ordered = tuple(record for record in records if not record.hidden)
            active = _latest_opened_path(ordered)
            return WorkspaceSnapshot(ordered, active, frozenset())

        raw_paths = session.state.get("open_repository_paths", ())
        ordered_records: list[RepositoryRecord] = []
        seen: set[str] = set()
        if isinstance(raw_paths, Sequence) and not isinstance(raw_paths, (str, bytes)):
            for raw_path in raw_paths[:MAX_SESSION_REPOSITORIES]:
                if not isinstance(raw_path, str) or len(raw_path) > MAX_PATH_LENGTH:
                    continue
                key = _path_key(Path(raw_path))
                record = records_by_path.get(key)
                if record is None or record.hidden or key in seen:
                    continue
                ordered_records.append(record)
                seen.add(key)

        raw_collapsed = session.state.get("collapsed_groups", ())
        collapsed = {
            normalized
            for item in (
                raw_collapsed
                if isinstance(raw_collapsed, Sequence)
                and not isinstance(raw_collapsed, (str, bytes))
                else ()
            )
            if isinstance(item, str)
            and (normalized := _normalize_optional_text(item, MAX_GROUP_NAME_LENGTH))
        }
        available_groups = {
            record.group_name for record in ordered_records if record.group_name is not None
        }
        active = (
            session.active_repository_path.expanduser().resolve()
            if session.active_repository_path is not None
            else None
        )
        ordered_paths = {_path_key(record.path) for record in ordered_records}
        if active is None or _path_key(active) not in ordered_paths:
            active = _latest_opened_path(ordered_records)
        return WorkspaceSnapshot(
            tuple(ordered_records),
            active,
            frozenset(collapsed & available_groups),
        )

    def open_repository(self, path: Path) -> WorkspaceSnapshot:
        canonical = path.expanduser().resolve()
        record = self.database.get_repository(canonical)
        if record is None:
            record = self.database.save_repository(
                RepositoryRecord(path=canonical, last_opened_at=datetime.now(timezone.utc))
            )
        elif record.hidden:
            record = self.database.save_repository(replace(record, hidden=False))

        snapshot = self.snapshot()
        records = list(snapshot.records)
        if all(_path_key(item.path) != _path_key(canonical) for item in records):
            records.append(record)
        else:
            records = [
                record if _path_key(item.path) == _path_key(canonical) else item
                for item in records
            ]
        return self._save(records, canonical, snapshot.collapsed_groups)

    def set_active(self, path: Path) -> WorkspaceSnapshot:
        canonical = path.expanduser().resolve()
        snapshot = self.snapshot()
        if all(_path_key(record.path) != _path_key(canonical) for record in snapshot.records):
            raise RepositoryWorkspaceError("The repository is not open in this workspace.")
        return self._save(snapshot.records, canonical, snapshot.collapsed_groups)

    def close_repositories(self, paths: Iterable[Path]) -> WorkspaceSnapshot:
        """Close tabs only; repository records and filesystem paths remain intact."""

        closing = {_path_key(path) for path in paths}
        snapshot = self.snapshot()
        remaining = tuple(
            record for record in snapshot.records if _path_key(record.path) not in closing
        )
        active = snapshot.active_repository_path
        if active is not None and _path_key(active) in closing:
            active = remaining[0].path if remaining else None
        return self._save(remaining, active, snapshot.collapsed_groups)

    def set_alias(self, path: Path, alias: str | None) -> RepositoryRecord:
        record = self._require_record(path)
        normalized = _normalize_optional_text(alias, MAX_ALIAS_LENGTH)
        return self.database.save_repository(replace(record, alias=normalized))

    def set_favorite(self, path: Path, favorite: bool) -> RepositoryRecord:
        return self.database.save_repository(
            replace(self._require_record(path), favorite=favorite)
        )

    def set_pinned(self, path: Path, pinned: bool) -> WorkspaceSnapshot:
        """Pin a whole named group so a group can never cross the pin boundary."""

        source = self._require_record(path)
        records = self.database.list_repositories(include_hidden=True)
        targets = (
            [record for record in records if record.group_name == source.group_name]
            if source.group_name is not None
            else [source]
        )
        for record in targets:
            self.database.save_repository(replace(record, pinned=pinned))
        return self._normalize_and_save(self.snapshot())

    def set_group(self, path: Path, group_name: str | None) -> WorkspaceSnapshot:
        source = self._require_record(path)
        normalized = _normalize_optional_text(group_name, MAX_GROUP_NAME_LENGTH)
        if normalized is not None:
            group_members = [
                record
                for record in self.database.list_repositories(include_hidden=True)
                if record.group_name == normalized and _path_key(record.path) != _path_key(path)
            ]
            if any(record.pinned != source.pinned for record in group_members):
                raise RepositoryWorkspaceError(
                    "A tab group cannot cross the pinned and unpinned boundary."
                )
        updated = self.database.save_repository(replace(source, group_name=normalized))
        snapshot = self.snapshot()
        records = [
            updated if _path_key(record.path) == _path_key(updated.path) else record
            for record in snapshot.records
        ]
        if normalized is not None:
            records = _place_after_group(records, updated.path, normalized)
        return self._normalize_and_save(
            WorkspaceSnapshot(
                tuple(records),
                snapshot.active_repository_path,
                snapshot.collapsed_groups,
            )
        )

    def set_group_collapsed(self, group_name: str, collapsed: bool) -> WorkspaceSnapshot:
        normalized = _normalize_optional_text(group_name, MAX_GROUP_NAME_LENGTH)
        if normalized is None:
            raise RepositoryWorkspaceError("A group name is required.")
        snapshot = self.snapshot()
        if not any(record.group_name == normalized for record in snapshot.records):
            raise RepositoryWorkspaceError("The group is not present in this workspace.")
        collapsed_groups = set(snapshot.collapsed_groups)
        if collapsed:
            collapsed_groups.add(normalized)
        else:
            collapsed_groups.discard(normalized)
        return self._save(snapshot.records, snapshot.active_repository_path, collapsed_groups)

    def set_hidden(self, path: Path, hidden: bool) -> WorkspaceSnapshot:
        record = self._require_record(path)
        self.database.save_repository(replace(record, hidden=hidden))
        if hidden:
            return self.close_repositories((path,))
        return self.snapshot()

    def move(self, path: Path, offset: int) -> WorkspaceSnapshot:
        """Move one ungrouped tab or its whole named group by one stable block."""

        if offset not in {-1, 1}:
            raise RepositoryWorkspaceError("Manual movement accepts only -1 or 1.")
        snapshot = self.snapshot()
        blocks = _workspace_blocks(snapshot.records)
        key = _path_key(path)
        source_index = next(
            (
                index
                for index, block in enumerate(blocks)
                if any(_path_key(record.path) == key for record in block)
            ),
            None,
        )
        if source_index is None:
            raise RepositoryWorkspaceError("The repository is not open in this workspace.")
        destination_index = source_index + offset
        if destination_index < 0 or destination_index >= len(blocks):
            return snapshot
        if blocks[source_index][0].pinned != blocks[destination_index][0].pinned:
            return snapshot
        blocks[source_index], blocks[destination_index] = (
            blocks[destination_index],
            blocks[source_index],
        )
        return self._save(
            tuple(record for block in blocks for record in block),
            snapshot.active_repository_path,
            snapshot.collapsed_groups,
        )

    def arrange(
        self,
        arrangement: Arrangement | str,
        *,
        status_by_path: Mapping[Path, str] | None = None,
    ) -> WorkspaceSnapshot:
        """Apply one named sort while keeping groups and the pin boundary intact."""

        selected = Arrangement(arrangement)
        snapshot = self.snapshot()
        blocks = _workspace_blocks(snapshot.records)
        statuses = {
            _path_key(path): value.casefold()
            for path, value in (status_by_path or {}).items()
        }

        def block_key(block: list[RepositoryRecord]) -> tuple[object, ...]:
            representative = block[0]
            label = min(_record_label(record).casefold() for record in block)
            opened = max(
                (
                    record.last_opened_at or datetime.min.replace(tzinfo=timezone.utc)
                    for record in block
                ),
                default=datetime.min.replace(tzinfo=timezone.utc),
            )
            favorite = any(record.favorite for record in block)
            status = min((statuses.get(_path_key(record.path), "") for record in block), default="")
            tie = _path_key(representative.path)
            if selected is Arrangement.LABEL_ASCENDING:
                return (label, tie)
            if selected is Arrangement.LABEL_DESCENDING:
                return (_descending_text_key(label), tie)
            if selected is Arrangement.NEWEST_OPENED:
                return (-opened.timestamp(), tie)
            if selected is Arrangement.OLDEST_OPENED:
                return (opened.timestamp(), tie)
            if selected is Arrangement.REPOSITORY_STATUS:
                return (status, label, tie)
            if selected is Arrangement.FAVORITES_FIRST:
                return (not favorite, label, tie)
            return (favorite, label, tie)

        pinned = sorted((block for block in blocks if block[0].pinned), key=block_key)
        unpinned = sorted((block for block in blocks if not block[0].pinned), key=block_key)
        ordered = tuple(record for block in (*pinned, *unpinned) for record in block)
        return self._save(ordered, snapshot.active_repository_path, snapshot.collapsed_groups)

    def search(
        self,
        query: str,
        *,
        mode: SearchMode | str = SearchMode.LITERAL,
        flags: RegexFlags | None = None,
        include_hidden: bool = False,
    ) -> SearchResult[RepositoryRecord]:
        records = (
            tuple(self.database.list_repositories(include_hidden=True))
            if include_hidden
            else self.snapshot().records
        )
        return SearchService().search(
            records,
            query,
            mode=SearchMode(mode),
            flags=RegexFlags(ignore_case=True) if flags is None else flags,
            get_text=_record_search_keys,
        )

    def strip_projection(self, maximum_visible: int) -> TabStripProjection:
        snapshot = self.snapshot()
        entries = _strip_entries(snapshot)
        if not entries:
            return TabStripProjection((), ())
        capacity = max(1, min(maximum_visible, 32))
        mandatory = {index for index, entry in enumerate(entries) if entry.pinned}
        active_key = (
            _path_key(snapshot.active_repository_path)
            if snapshot.active_repository_path is not None
            else None
        )
        active_index = next(
            (
                index
                for index, entry in enumerate(entries)
                if entry.path is not None and _path_key(entry.path) == active_key
            ),
            None,
        )
        if active_index is not None:
            mandatory.add(active_index)
        visible_indices = set(mandatory)
        for index in range(len(entries)):
            if len(visible_indices) >= max(capacity, len(mandatory)):
                break
            visible_indices.add(index)
        visible = tuple(entry for index, entry in enumerate(entries) if index in visible_indices)
        overflow = tuple(
            entry for index, entry in enumerate(entries) if index not in visible_indices
        )
        return TabStripProjection(visible, overflow)

    def preview_close(
        self,
        query: str,
        *,
        search_mode: SearchMode | str = SearchMode.LITERAL,
        flags: RegexFlags | None = None,
        close_mode: CloseMode | str = CloseMode.CONTAINING,
        include_pinned: bool = False,
        protected_paths: Iterable[Path] = (),
    ) -> ClosePreview:
        mode = SearchMode(search_mode)
        selected_close_mode = CloseMode(close_mode)
        selected_flags = RegexFlags(ignore_case=True) if flags is None else flags
        snapshot = self.snapshot()
        records = snapshot.records
        if not query.strip():
            return ClosePreview(
                query,
                mode,
                selected_flags,
                selected_close_mode,
                include_pinned,
                kept=records,
                error="Enter a non-empty query before reviewing a bulk close.",
            )
        result = SearchService().search(
            records,
            query,
            mode=mode,
            flags=selected_flags,
            get_text=_record_search_keys,
        )
        if result.error is not None:
            return ClosePreview(
                query,
                mode,
                selected_flags,
                selected_close_mode,
                include_pinned,
                kept=records,
                error=result.error,
            )
        matched = {_path_key(record.path) for record in result.items}
        if not matched:
            return ClosePreview(
                query,
                mode,
                selected_flags,
                selected_close_mode,
                include_pinned,
                kept=records,
                error="No tab matches this query; nothing can be confirmed.",
            )
        candidate = {
            _path_key(record.path)
            for record in records
            if (_path_key(record.path) in matched)
            == (selected_close_mode is CloseMode.CONTAINING)
        }
        protected = {_path_key(path) for path in protected_paths}
        protected_pinned = tuple(
            record
            for record in records
            if _path_key(record.path) in candidate and record.pinned and not include_pinned
        )
        protected_unsaved = tuple(
            record for record in records if _path_key(record.path) in candidate & protected
        )
        excluded = {
            _path_key(record.path) for record in (*protected_pinned, *protected_unsaved)
        }
        closing = tuple(
            record
            for record in records
            if _path_key(record.path) in candidate and _path_key(record.path) not in excluded
        )
        kept = tuple(record for record in records if record not in closing)
        error = None if closing else "Every candidate is protected; no tab can be closed."
        return ClosePreview(
            query,
            mode,
            selected_flags,
            selected_close_mode,
            include_pinned,
            closing,
            kept,
            protected_pinned,
            protected_unsaved,
            error,
        )

    def export_to_path(self, destination: Path) -> Path:
        payload = self.export_payload()
        encoded = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
        if len(encoded) > MAX_SESSION_BYTES:
            raise RepositoryWorkspaceError(
                f"The session export exceeds the {MAX_SESSION_BYTES}-byte limit."
            )
        target = destination.expanduser().resolve()
        if not target.parent.is_dir():
            raise RepositoryWorkspaceError("The session export directory does not exist.")
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{target.name}.", suffix=".tmp", dir=target.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        return target

    def export_payload(self) -> Mapping[str, object]:
        snapshot = self.snapshot()
        if len(snapshot.records) > MAX_SESSION_REPOSITORIES:
            raise RepositoryWorkspaceError(
                f"A session may contain at most {MAX_SESSION_REPOSITORIES} repositories."
            )
        return {
            "format": SESSION_FORMAT,
            "version": SESSION_FORMAT_VERSION,
            "active_repository_path": (
                str(snapshot.active_repository_path)
                if snapshot.active_repository_path is not None
                else None
            ),
            "tabs": [
                {
                    "path": str(record.path),
                    "alias": record.alias,
                    "pinned": record.pinned,
                    "favorite": record.favorite,
                }
                for record in snapshot.records
            ],
        }

    def import_from_path(self, source: Path, *, merge: bool = True) -> SessionImportResult:
        candidate = source.expanduser().resolve()
        try:
            size = candidate.stat().st_size
        except OSError as error:
            raise RepositoryWorkspaceError(f"Could not read the session file: {error}") from error
        if size <= 0 or size > MAX_SESSION_BYTES:
            raise RepositoryWorkspaceError(
                f"The session file must be between 1 and {MAX_SESSION_BYTES} bytes."
            )
        try:
            with candidate.open("rb") as stream:
                payload = stream.read(MAX_SESSION_BYTES + 1)
        except OSError as error:
            raise RepositoryWorkspaceError(f"Could not read the session file: {error}") from error
        return self.import_payload(payload, merge=merge)

    def import_payload(
        self,
        payload: bytes | str | Mapping[str, object],
        *,
        merge: bool = True,
    ) -> SessionImportResult:
        raw: object
        if isinstance(payload, bytes):
            if len(payload) > MAX_SESSION_BYTES:
                raise RepositoryWorkspaceError("The session payload exceeds the size limit.")
            try:
                raw = json.loads(payload.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise RepositoryWorkspaceError(
                    "The session file is not valid UTF-8 JSON."
                ) from error
        elif isinstance(payload, str):
            encoded = payload.encode("utf-8")
            if len(encoded) > MAX_SESSION_BYTES:
                raise RepositoryWorkspaceError("The session payload exceeds the size limit.")
            try:
                raw = json.loads(payload)
            except json.JSONDecodeError as error:
                raise RepositoryWorkspaceError("The session file is not valid JSON.") from error
        else:
            raw = payload
            try:
                encoded = json.dumps(raw, separators=(",", ":")).encode("utf-8")
            except (TypeError, ValueError) as error:
                raise RepositoryWorkspaceError(
                    "The session mapping is not JSON serializable."
                ) from error
            if len(encoded) > MAX_SESSION_BYTES:
                raise RepositoryWorkspaceError("The session payload exceeds the size limit.")
        if not isinstance(raw, Mapping):
            raise RepositoryWorkspaceError("The session payload must be a JSON object.")
        if raw.get("format") != SESSION_FORMAT or raw.get("version") != SESSION_FORMAT_VERSION:
            raise RepositoryWorkspaceError("The session format or version is unsupported.")
        tabs = raw.get("tabs")
        if not isinstance(tabs, list) or len(tabs) > MAX_SESSION_REPOSITORIES:
            raise RepositoryWorkspaceError(
                f"The session must contain at most {MAX_SESSION_REPOSITORIES} tabs."
            )

        imported: list[RepositoryRecord] = []
        skipped: list[str] = []
        seen: set[str] = set()
        for item in tabs:
            if not isinstance(item, Mapping):
                raise RepositoryWorkspaceError("Every session tab must be a JSON object.")
            raw_path = item.get("path")
            if not isinstance(raw_path, str) or not raw_path or len(raw_path) > MAX_PATH_LENGTH:
                raise RepositoryWorkspaceError("Every session tab needs a bounded path string.")
            path = Path(raw_path).expanduser().resolve()
            key = _path_key(path)
            if key in seen:
                continue
            seen.add(key)
            if not path.is_dir():
                skipped.append(raw_path)
                continue
            alias_value = item.get("alias")
            if alias_value is not None and not isinstance(alias_value, str):
                raise RepositoryWorkspaceError("A tab alias must be a string or null.")
            pinned_value = item.get("pinned", False)
            favorite_value = item.get("favorite", False)
            if not isinstance(pinned_value, bool) or not isinstance(favorite_value, bool):
                raise RepositoryWorkspaceError("Pinned and favorite values must be booleans.")
            existing = self.database.get_repository(path)
            if existing is None:
                record = RepositoryRecord(
                    path=path,
                    alias=_normalize_optional_text(alias_value, MAX_ALIAS_LENGTH),
                    pinned=pinned_value,
                    favorite=favorite_value,
                    last_opened_at=datetime.now(timezone.utc),
                )
            else:
                # Group definitions and membership belong to the destination profile.
                # A grouped destination tab also retains its pin side so importing a
                # portable file cannot make that local group invalid.
                record = replace(
                    existing,
                    alias=_normalize_optional_text(alias_value, MAX_ALIAS_LENGTH),
                    pinned=existing.pinned if existing.group_name else pinned_value,
                    favorite=favorite_value,
                )
            imported.append(self.database.save_repository(record))

        snapshot = self.snapshot()
        current = list(snapshot.records) if merge else []
        current_by_path = {_path_key(record.path): record for record in current}
        for record in imported:
            if record.hidden:
                continue
            key = _path_key(record.path)
            if key in current_by_path:
                current = [record if _path_key(item.path) == key else item for item in current]
            else:
                current.append(record)
            current_by_path[key] = record

        active_raw = raw.get("active_repository_path")
        active_import = (
            Path(active_raw).expanduser().resolve()
            if isinstance(active_raw, str) and len(active_raw) <= MAX_PATH_LENGTH
            else None
        )
        active = snapshot.active_repository_path
        open_keys = {_path_key(record.path) for record in current}
        if active_import is not None and _path_key(active_import) in open_keys:
            active = active_import
        elif active is None or _path_key(active) not in open_keys:
            active = current[0].path if current else None
        self._save(current, active, snapshot.collapsed_groups)
        return SessionImportResult(tuple(imported), tuple(skipped), merge)

    def _require_record(self, path: Path) -> RepositoryRecord:
        record = self.database.get_repository(path)
        if record is None:
            raise RepositoryWorkspaceError("The repository is not registered.")
        return record

    def _normalize_and_save(self, snapshot: WorkspaceSnapshot) -> WorkspaceSnapshot:
        ordered = tuple(record for block in _workspace_blocks(snapshot.records) for record in block)
        return self._save(ordered, snapshot.active_repository_path, snapshot.collapsed_groups)

    def _save(
        self,
        records: Sequence[RepositoryRecord],
        active: Path | None,
        collapsed_groups: Iterable[str],
    ) -> WorkspaceSnapshot:
        bounded_records = tuple(records[:MAX_SESSION_REPOSITORIES])
        existing = self.database.get_session(self.session_id)
        state = dict(existing.state) if existing is not None else {}
        groups = sorted(
            {
                normalized
                for group in collapsed_groups
                if (normalized := _normalize_optional_text(group, MAX_GROUP_NAME_LENGTH))
            }
        )
        state.update(
            {
                "schema_version": SESSION_FORMAT_VERSION,
                "open_repository_paths": [str(record.path) for record in bounded_records],
                "collapsed_groups": groups,
            }
        )
        session = (
            replace(
                existing,
                active_repository_path=active,
                state=state,
            )
            if existing is not None
            else SessionRecord(
                session_id=self.session_id,
                name=f"Repository tabs · {self.profile}",
                active_repository_path=active,
                state=state,
            )
        )
        self.database.save_session(session)
        return self.snapshot()


def _path_key(path: Path) -> str:
    return os.path.normcase(str(path.expanduser().resolve()))


def _normalize_optional_text(value: str | None, maximum: int) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized[:maximum] or None


def _record_label(record: RepositoryRecord) -> str:
    return record.alias or record.path.name or str(record.path)


def _record_search_keys(record: RepositoryRecord) -> tuple[str, ...]:
    return tuple(
        value
        for value in (
            _record_label(record),
            record.path.name,
            str(record.path),
            record.group_name or "",
        )
        if value
    )


def _latest_opened_path(records: Sequence[RepositoryRecord]) -> Path | None:
    if not records:
        return None
    return max(
        records,
        key=lambda record: record.last_opened_at
        or datetime.min.replace(tzinfo=timezone.utc),
    ).path


def _workspace_blocks(records: Sequence[RepositoryRecord]) -> list[list[RepositoryRecord]]:
    """Return stable group blocks with pinned blocks first."""

    blocks: list[list[RepositoryRecord]] = []
    consumed: set[str] = set()
    for pinned in (True, False):
        for record in records:
            key = _path_key(record.path)
            if key in consumed or record.pinned is not pinned:
                continue
            if record.group_name is None:
                block = [record]
            else:
                block = [
                    member
                    for member in records
                    if member.pinned is pinned and member.group_name == record.group_name
                ]
            consumed.update(_path_key(member.path) for member in block)
            blocks.append(block)
    return blocks


def _place_after_group(
    records: Sequence[RepositoryRecord],
    path: Path,
    group_name: str,
) -> list[RepositoryRecord]:
    key = _path_key(path)
    source = next((record for record in records if _path_key(record.path) == key), None)
    if source is None:
        return list(records)
    remaining = [record for record in records if _path_key(record.path) != key]
    destinations = [
        index
        for index, record in enumerate(remaining)
        if record.group_name == group_name and record.pinned == source.pinned
    ]
    if not destinations:
        return list(records)
    remaining.insert(destinations[-1] + 1, source)
    return remaining


def _descending_text_key(value: str) -> tuple[int, ...]:
    return tuple(-ord(character) for character in value)


def _strip_entries(snapshot: WorkspaceSnapshot) -> tuple[TabStripEntry, ...]:
    entries: list[TabStripEntry] = []
    emitted_groups: set[tuple[bool, str]] = set()
    for record in snapshot.records:
        group_name = record.group_name
        group_key = (record.pinned, group_name or "")
        if group_name is not None and group_name in snapshot.collapsed_groups:
            if group_key in emitted_groups:
                continue
            emitted_groups.add(group_key)
            members = tuple(
                candidate
                for candidate in snapshot.records
                if candidate.pinned == record.pinned and candidate.group_name == group_name
            )
            entries.append(
                TabStripEntry(
                    identifier=f"group-{hashlib.sha256(group_name.encode()).hexdigest()[:12]}",
                    label=f"▸ {group_name} ({len(members)})",
                    path=None,
                    group_name=group_name,
                    pinned=record.pinned,
                    favorite=any(member.favorite for member in members),
                    member_count=len(members),
                )
            )
            continue
        identifier = hashlib.sha256(_path_key(record.path).encode()).hexdigest()[:12]
        markers = f"{'📌 ' if record.pinned else ''}{'★ ' if record.favorite else ''}"
        entries.append(
            TabStripEntry(
                identifier=f"repository-{identifier}",
                label=f"{markers}{_record_label(record)}",
                path=record.path,
                group_name=group_name,
                pinned=record.pinned,
                favorite=record.favorite,
            )
        )
    return tuple(entries)
