from __future__ import annotations

from pathlib import Path

from desktop_material_tui.application.notifications import (
    NotificationAction,
    NotificationLevel,
    NotificationService,
)
from desktop_material_tui.application.search import RegexFlags, SearchMode
from desktop_material_tui.infrastructure.persistence import SQLiteStore


def test_notification_history_persists_review_state_across_services(
    tmp_path: Path,
) -> None:
    path = tmp_path / "notifications.sqlite3"
    with NotificationService(path) as service:
        created = service.publish(
            NotificationLevel.WARNING,
            "Push blocked",
            "The remote rejected the update.",
            action=NotificationAction("View details", "notification:details"),
            metadata={"repository": "demo"},
        )
        assert created.persistent
        assert service.unread_count == 1
        assert service.mark_read(created.notification_id)
        assert service.dismiss(created.notification_id)

    with NotificationService(path) as reopened:
        stored = reopened.get(created.notification_id)
        assert stored is not None
        assert stored.is_read
        assert stored.is_dismissed
        assert stored.action == NotificationAction("View details", "notification:details")
        assert reopened.restore(created.notification_id)
        assert reopened.mark_unread(created.notification_id)
        assert reopened.unread_count == 1


def test_notification_history_supports_literal_regex_filters_and_bulk_actions(
    tmp_path: Path,
) -> None:
    database = SQLiteStore(tmp_path / "notifications.sqlite3")
    service = NotificationService(database)
    try:
        first = service.publish(
            NotificationLevel.INFO,
            "Clone finished",
            "alpha/repository is ready",
            category="clone",
        )
        second = service.publish(
            NotificationLevel.ERROR,
            "Build failed",
            "beta returned exit code 1",
            category="build",
        )

        assert service.history(query="ALPHA")[0].notification_id == first.notification_id
        regex = service.search_history(
            r"exit\s+code\s+\d",
            mode=SearchMode.REGEX,
            flags=RegexFlags(ignore_case=True),
        )
        assert regex.items[0].notification_id == second.notification_id
        assert service.mark_all_read() == 2
        assert service.dismiss(first.notification_id)
        assert service.clear_dismissed() == 1
        assert service.get(first.notification_id) is None
        assert service.get(second.notification_id) is not None
    finally:
        database.close()
