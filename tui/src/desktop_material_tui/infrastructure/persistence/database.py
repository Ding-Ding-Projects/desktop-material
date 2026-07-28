"""SQLite persistence for repositories, terminal sessions, and notifications."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager, suppress
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

from .paths import XDGPaths

CURRENT_SCHEMA_VERSION = 2


class PersistenceError(RuntimeError):
    """Durable state could not be read or updated."""


@dataclass(frozen=True)
class RepositoryRecord:
    path: Path
    alias: str | None = None
    group_name: str | None = None
    pinned: bool = False
    favorite: bool = False
    hidden: bool = False
    account_key: str | None = None
    default_branch: str | None = None
    editor_command: str | None = None
    metadata: Mapping[str, object] = field(default_factory=dict)
    record_id: int | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_opened_at: datetime | None = None


@dataclass(frozen=True)
class SessionRecord:
    name: str
    active_repository_path: Path | None = None
    selected_section: str = "changes"
    state: Mapping[str, object] = field(default_factory=dict)
    session_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class PersistentNotificationRecord:
    notification_id: str
    level: str
    title: str
    message: str
    category: str = "general"
    source: str | None = None
    action_label: str | None = None
    action_target: str | None = None
    persistent: bool = True
    metadata: Mapping[str, object] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    read_at: datetime | None = None
    dismissed_at: datetime | None = None


Migration = tuple[int, Sequence[str]]

MIGRATIONS: Sequence[Migration] = (
    (
        1,
        (
            """
            CREATE TABLE repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                alias TEXT,
                group_name TEXT,
                pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
                favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
                hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
                account_key TEXT,
                default_branch TEXT,
                editor_command TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_opened_at TEXT
            )
            """,
            """
            CREATE INDEX repositories_group_name_idx
                ON repositories(group_name, favorite DESC, alias, path)
            """,
            """
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                active_repository_path TEXT,
                selected_section TEXT NOT NULL,
                state_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX sessions_updated_at_idx
                ON sessions(updated_at DESC)
            """,
        ),
    ),
    (
        2,
        (
            """
            CREATE TABLE notifications (
                id TEXT PRIMARY KEY,
                level TEXT NOT NULL
                    CHECK (level IN ('info', 'success', 'warning', 'error', 'progress')),
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                source TEXT,
                action_label TEXT,
                action_target TEXT,
                persistent INTEGER NOT NULL DEFAULT 1
                    CHECK (persistent IN (0, 1)),
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                read_at TEXT,
                dismissed_at TEXT
            )
            """,
            """
            CREATE INDEX notifications_history_idx
                ON notifications(created_at DESC, id DESC)
            """,
            """
            CREATE INDEX notifications_unread_idx
                ON notifications(read_at, dismissed_at, created_at DESC)
            """,
        ),
    ),
)


class SQLiteStore:
    """Thread-safe SQLite store with WAL and explicit schema migrations."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            str(path),
            timeout=5.0,
            isolation_level=None,
            check_same_thread=False,
        )
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA busy_timeout = 5000")
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._connection.execute("PRAGMA synchronous = FULL")
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._apply_migrations()
        with suppress(OSError):
            self.path.chmod(0o600)

    @classmethod
    def from_paths(cls, paths: XDGPaths) -> SQLiteStore:
        paths.ensure()
        return cls(paths.database_file)

    @property
    def journal_mode(self) -> str:
        with self._lock:
            row = self._connection.execute("PRAGMA journal_mode").fetchone()
            return str(row[0]).lower()

    @property
    def schema_version(self) -> int:
        with self._lock:
            row = self._connection.execute(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations"
            ).fetchone()
            return int(row[0])

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._connection.execute("BEGIN IMMEDIATE")
            try:
                yield self._connection
            except BaseException:
                self._connection.execute("ROLLBACK")
                raise
            else:
                self._connection.execute("COMMIT")

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def __enter__(self) -> SQLiteStore:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _apply_migrations(self) -> None:
        with self._lock:
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied_rows = self._connection.execute(
                "SELECT version FROM schema_migrations"
            ).fetchall()
            applied = {int(row[0]) for row in applied_rows}
            unknown = applied - {version for version, _statements in MIGRATIONS}
            if unknown:
                raise PersistenceError(
                    "Database schema is newer than this application: "
                    + ", ".join(str(version) for version in sorted(unknown))
                )
            for version, statements in MIGRATIONS:
                if version in applied:
                    continue
                with self.transaction() as connection:
                    for statement in statements:
                        connection.execute(statement)
                    connection.execute(
                        "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                        (version, _to_iso(datetime.now(timezone.utc))),
                    )

    # Repository records -------------------------------------------------

    def save_repository(self, record: RepositoryRecord) -> RepositoryRecord:
        now = datetime.now(timezone.utc)
        canonical_path = record.path.expanduser().resolve()
        metadata_json = _json_dumps(record.metadata)
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO repositories(
                    path, alias, group_name, pinned, favorite, hidden,
                    account_key, default_branch, editor_command, metadata_json,
                    created_at, updated_at, last_opened_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    alias = excluded.alias,
                    group_name = excluded.group_name,
                    pinned = excluded.pinned,
                    favorite = excluded.favorite,
                    hidden = excluded.hidden,
                    account_key = excluded.account_key,
                    default_branch = excluded.default_branch,
                    editor_command = excluded.editor_command,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at,
                    last_opened_at = excluded.last_opened_at
                """,
                (
                    str(canonical_path),
                    record.alias,
                    record.group_name,
                    int(record.pinned),
                    int(record.favorite),
                    int(record.hidden),
                    record.account_key,
                    record.default_branch,
                    record.editor_command,
                    metadata_json,
                    _to_iso(record.created_at),
                    _to_iso(now),
                    _to_iso(record.last_opened_at),
                ),
            )
            row = connection.execute(
                "SELECT * FROM repositories WHERE path = ?", (str(canonical_path),)
            ).fetchone()
        assert row is not None
        return _repository_from_row(row)

    def get_repository(self, path: Path) -> RepositoryRecord | None:
        canonical_path = path.expanduser().resolve()
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM repositories WHERE path = ?", (str(canonical_path),)
            ).fetchone()
        return None if row is None else _repository_from_row(row)

    def list_repositories(
        self,
        *,
        include_hidden: bool = True,
    ) -> list[RepositoryRecord]:
        query = "SELECT * FROM repositories"
        parameters: tuple[object, ...] = ()
        if not include_hidden:
            query += " WHERE hidden = 0"
        query += (
            " ORDER BY pinned DESC, favorite DESC, COALESCE(group_name, ''), COALESCE(alias, path)"
        )
        with self._lock:
            rows = self._connection.execute(query, parameters).fetchall()
        return [_repository_from_row(row) for row in rows]

    def delete_repository(self, path: Path) -> bool:
        canonical_path = path.expanduser().resolve()
        with self.transaction() as connection:
            cursor = connection.execute(
                "DELETE FROM repositories WHERE path = ?", (str(canonical_path),)
            )
        return cursor.rowcount > 0

    # Terminal sessions --------------------------------------------------

    def save_session(self, session: SessionRecord) -> SessionRecord:
        now = datetime.now(timezone.utc)
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO sessions(
                    id, name, active_repository_path, selected_section,
                    state_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    active_repository_path = excluded.active_repository_path,
                    selected_section = excluded.selected_section,
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at
                """,
                (
                    session.session_id,
                    session.name,
                    str(session.active_repository_path.expanduser().resolve())
                    if session.active_repository_path is not None
                    else None,
                    session.selected_section,
                    _json_dumps(session.state),
                    _to_iso(session.created_at),
                    _to_iso(now),
                ),
            )
            row = connection.execute(
                "SELECT * FROM sessions WHERE id = ?", (session.session_id,)
            ).fetchone()
        assert row is not None
        return _session_from_row(row)

    def get_session(self, session_id: str) -> SessionRecord | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        return None if row is None else _session_from_row(row)

    def list_sessions(self, *, limit: int = 100) -> list[SessionRecord]:
        bounded_limit = max(0, min(limit, 1000))
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?",
                (bounded_limit,),
            ).fetchall()
        return [_session_from_row(row) for row in rows]

    def delete_session(self, session_id: str) -> bool:
        with self.transaction() as connection:
            cursor = connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return cursor.rowcount > 0

    # Notification history ----------------------------------------------

    def save_notification(
        self,
        notification: PersistentNotificationRecord,
    ) -> PersistentNotificationRecord:
        now = datetime.now(timezone.utc)
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO notifications(
                    id, level, title, message, category, source,
                    action_label, action_target, persistent, metadata_json,
                    created_at, updated_at, read_at, dismissed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    level = excluded.level,
                    title = excluded.title,
                    message = excluded.message,
                    category = excluded.category,
                    source = excluded.source,
                    action_label = excluded.action_label,
                    action_target = excluded.action_target,
                    persistent = excluded.persistent,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at,
                    read_at = excluded.read_at,
                    dismissed_at = excluded.dismissed_at
                """,
                (
                    notification.notification_id,
                    notification.level,
                    notification.title,
                    notification.message,
                    notification.category,
                    notification.source,
                    notification.action_label,
                    notification.action_target,
                    int(notification.persistent),
                    _json_dumps(notification.metadata),
                    _to_iso(notification.created_at),
                    _to_iso(now),
                    _to_iso(notification.read_at),
                    _to_iso(notification.dismissed_at),
                ),
            )
        return replace(notification, updated_at=now)

    def get_notification(
        self,
        notification_id: str,
    ) -> PersistentNotificationRecord | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM notifications WHERE id = ?", (notification_id,)
            ).fetchone()
        return None if row is None else _notification_from_row(row)

    def list_notifications(
        self,
        *,
        limit: int = 500,
        unread_only: bool = False,
        include_dismissed: bool = True,
    ) -> list[PersistentNotificationRecord]:
        bounded_limit = max(0, min(limit, 5000))
        clauses: list[str] = []
        if unread_only:
            clauses.append("read_at IS NULL")
        if not include_dismissed:
            clauses.append("dismissed_at IS NULL")
        query = "SELECT * FROM notifications"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC, id DESC LIMIT ?"
        with self._lock:
            rows = self._connection.execute(query, (bounded_limit,)).fetchall()
        return [_notification_from_row(row) for row in rows]

    def set_notification_read(
        self,
        notification_id: str,
        read_at: datetime | None,
    ) -> bool:
        with self.transaction() as connection:
            cursor = connection.execute(
                "UPDATE notifications SET read_at = ?, updated_at = ? WHERE id = ?",
                (
                    _to_iso(read_at),
                    _to_iso(datetime.now(timezone.utc)),
                    notification_id,
                ),
            )
        return cursor.rowcount > 0

    def set_notification_dismissed(
        self,
        notification_id: str,
        dismissed_at: datetime | None,
    ) -> bool:
        with self.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE notifications
                   SET dismissed_at = ?, updated_at = ?
                 WHERE id = ?
                """,
                (
                    _to_iso(dismissed_at),
                    _to_iso(datetime.now(timezone.utc)),
                    notification_id,
                ),
            )
        return cursor.rowcount > 0

    def mark_all_notifications_read(self, read_at: datetime) -> int:
        with self.transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE notifications
                   SET read_at = ?, updated_at = ?
                 WHERE read_at IS NULL
                """,
                (_to_iso(read_at), _to_iso(read_at)),
            )
        return cursor.rowcount

    def delete_notification(self, notification_id: str) -> bool:
        with self.transaction() as connection:
            cursor = connection.execute(
                "DELETE FROM notifications WHERE id = ?", (notification_id,)
            )
        return cursor.rowcount > 0

    def delete_dismissed_notifications(self) -> int:
        with self.transaction() as connection:
            cursor = connection.execute("DELETE FROM notifications WHERE dismissed_at IS NOT NULL")
        return cursor.rowcount

    def unread_notification_count(self) -> int:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT COUNT(*) FROM notifications
                 WHERE read_at IS NULL AND dismissed_at IS NULL
                """
            ).fetchone()
        return int(row[0])


# Compatibility alias used in application-layer type hints.
PersistenceDatabase = SQLiteStore


def _repository_from_row(row: sqlite3.Row) -> RepositoryRecord:
    return RepositoryRecord(
        record_id=int(row["id"]),
        path=Path(str(row["path"])),
        alias=cast(str | None, row["alias"]),
        group_name=cast(str | None, row["group_name"]),
        pinned=bool(row["pinned"]),
        favorite=bool(row["favorite"]),
        hidden=bool(row["hidden"]),
        account_key=cast(str | None, row["account_key"]),
        default_branch=cast(str | None, row["default_branch"]),
        editor_command=cast(str | None, row["editor_command"]),
        metadata=_json_loads(str(row["metadata_json"])),
        created_at=_from_iso(str(row["created_at"])),
        updated_at=_from_iso(str(row["updated_at"])),
        last_opened_at=_from_optional_iso(cast(str | None, row["last_opened_at"])),
    )


def _session_from_row(row: sqlite3.Row) -> SessionRecord:
    active_path = cast(str | None, row["active_repository_path"])
    return SessionRecord(
        session_id=str(row["id"]),
        name=str(row["name"]),
        active_repository_path=Path(active_path) if active_path else None,
        selected_section=str(row["selected_section"]),
        state=_json_loads(str(row["state_json"])),
        created_at=_from_iso(str(row["created_at"])),
        updated_at=_from_iso(str(row["updated_at"])),
    )


def _notification_from_row(row: sqlite3.Row) -> PersistentNotificationRecord:
    return PersistentNotificationRecord(
        notification_id=str(row["id"]),
        level=str(row["level"]),
        title=str(row["title"]),
        message=str(row["message"]),
        category=str(row["category"]),
        source=cast(str | None, row["source"]),
        action_label=cast(str | None, row["action_label"]),
        action_target=cast(str | None, row["action_target"]),
        persistent=bool(row["persistent"]),
        metadata=_json_loads(str(row["metadata_json"])),
        created_at=_from_iso(str(row["created_at"])),
        updated_at=_from_iso(str(row["updated_at"])),
        read_at=_from_optional_iso(cast(str | None, row["read_at"])),
        dismissed_at=_from_optional_iso(cast(str | None, row["dismissed_at"])),
    )


def _json_dumps(value: Mapping[str, object]) -> str:
    try:
        return json.dumps(
            dict(value),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise PersistenceError(f"State is not JSON serializable: {error}") from error


def _json_loads(value: str) -> Mapping[str, object]:
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError as error:
        raise PersistenceError(f"Stored JSON is corrupt: {error}") from error
    if not isinstance(decoded, dict):
        raise PersistenceError("Stored JSON must be an object")
    return cast(dict[str, object], decoded)


def _to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _from_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _from_optional_iso(value: str | None) -> datetime | None:
    return None if value is None else _from_iso(value)
