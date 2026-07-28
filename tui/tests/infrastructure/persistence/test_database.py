from __future__ import annotations

import sqlite3
from pathlib import Path

from desktop_material_tui.infrastructure.persistence import (
    CURRENT_SCHEMA_VERSION,
    PersistentNotificationRecord,
    RepositoryRecord,
    SessionRecord,
    SQLiteStore,
)
from desktop_material_tui.infrastructure.persistence.database import MIGRATIONS


def test_database_uses_wal_and_applies_all_migrations(tmp_path: Path) -> None:
    database = SQLiteStore(tmp_path / "state.sqlite3")
    try:
        assert database.journal_mode == "wal"
        assert database.schema_version == CURRENT_SCHEMA_VERSION
    finally:
        database.close()


def test_database_upserts_repositories_and_sessions(tmp_path: Path) -> None:
    database = SQLiteStore(tmp_path / "state.sqlite3")
    repository_path = tmp_path / "repo"
    repository_path.mkdir()
    try:
        original = database.save_repository(
            RepositoryRecord(
                path=repository_path,
                alias="One",
                metadata={"language": "Python"},
            )
        )
        updated = database.save_repository(
            RepositoryRecord(
                path=repository_path,
                alias="Renamed",
                favorite=True,
                pinned=True,
                metadata={"language": "Rust"},
            )
        )
        session = database.save_session(
            SessionRecord(
                name="main",
                active_repository_path=repository_path,
                state={"tabs": ["changes", "history"]},
            )
        )

        assert updated.record_id == original.record_id
        assert updated.created_at == original.created_at
        assert database.get_repository(repository_path) == updated
        assert database.list_repositories() == [updated]
        assert database.get_session(session.session_id) == session
        assert database.list_sessions() == [session]
        assert database.delete_session(session.session_id)
        assert database.delete_repository(repository_path)
    finally:
        database.close()


def test_opening_version_one_database_migrates_notifications(tmp_path: Path) -> None:
    path = tmp_path / "legacy.sqlite3"
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    for statement in MIGRATIONS[0][1]:
        connection.execute(statement)
    connection.execute(
        "INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)",
        ("2026-01-01T00:00:00+00:00",),
    )
    connection.commit()
    connection.close()

    database = SQLiteStore(path)
    try:
        assert database.schema_version == 2
        saved = database.save_notification(
            PersistentNotificationRecord(
                notification_id="migration-proof",
                level="info",
                title="Migrated",
                message="Notification schema is available.",
            )
        )
        assert database.get_notification(saved.notification_id) is not None
    finally:
        database.close()
