"""Persistent, non-blocking notification history."""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from desktop_material_tui.infrastructure.persistence import (
    PersistentNotificationRecord,
    SQLiteStore,
    XDGPaths,
)

from .search import RegexFlags, SearchMode, SearchResult, SearchService


class NotificationLevel(str, Enum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    PROGRESS = "progress"


@dataclass(frozen=True)
class NotificationAction:
    label: str
    target: str


@dataclass(frozen=True)
class Notification:
    notification_id: str
    level: NotificationLevel
    title: str
    message: str
    category: str = "general"
    source: str | None = None
    action: NotificationAction | None = None
    persistent: bool = True
    metadata: Mapping[str, object] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    read_at: datetime | None = None
    dismissed_at: datetime | None = None

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    @property
    def is_dismissed(self) -> bool:
        return self.dismissed_at is not None

    # Compatibility names used by presentation-only notification views.
    @property
    def severity(self) -> str:
        return self.level.value

    @property
    def read(self) -> bool:
        return self.is_read

    @property
    def body(self) -> str:
        return self.message

    @property
    def action_label(self) -> str | None:
        return self.action.label if self.action is not None else None

    @property
    def action_url(self) -> str | None:
        return self.action.target if self.action is not None else None


class NotificationService:
    """Owns durable notification history and review-state transitions."""

    def __init__(
        self,
        storage: SQLiteStore | XDGPaths | Path,
    ) -> None:
        if isinstance(storage, SQLiteStore):
            self.database = storage
            self._owns_database = False
        elif isinstance(storage, XDGPaths):
            self.database = SQLiteStore.from_paths(storage)
            self._owns_database = True
        else:
            self.database = SQLiteStore(storage)
            self._owns_database = True
        self._search = SearchService()

    def publish(
        self,
        level: NotificationLevel,
        title: str,
        message: str,
        *,
        notification_id: str | None = None,
        category: str = "general",
        source: str | None = None,
        action: NotificationAction | None = None,
        persistent: bool | None = None,
        metadata: Mapping[str, object] | None = None,
    ) -> Notification:
        if not title.strip():
            raise ValueError("Notification title cannot be empty")
        identifier = notification_id or uuid.uuid4().hex
        existing = self.database.get_notification(identifier)
        created_at = existing.created_at if existing is not None else datetime.now(timezone.utc)
        sticky = (
            level in (NotificationLevel.WARNING, NotificationLevel.ERROR)
            if persistent is None
            else persistent
        )
        record = PersistentNotificationRecord(
            notification_id=identifier,
            level=level.value,
            title=title,
            message=message,
            category=category,
            source=source,
            action_label=action.label if action is not None else None,
            action_target=action.target if action is not None else None,
            persistent=sticky,
            metadata={} if metadata is None else metadata,
            created_at=created_at,
            read_at=existing.read_at if existing is not None else None,
            dismissed_at=None,
        )
        self.database.save_notification(record)
        stored = self.database.get_notification(identifier)
        assert stored is not None
        return _from_record(stored)

    def get(self, notification_id: str) -> Notification | None:
        record = self.database.get_notification(notification_id)
        return None if record is None else _from_record(record)

    def history(
        self,
        *,
        limit: int = 500,
        unread_only: bool = False,
        include_dismissed: bool = True,
        levels: Sequence[NotificationLevel] | None = None,
        query: str = "",
        mode: SearchMode = SearchMode.LITERAL,
        flags: RegexFlags | None = None,
    ) -> tuple[Notification, ...]:
        notifications = tuple(
            _from_record(record)
            for record in self.database.list_notifications(
                limit=limit,
                unread_only=unread_only,
                include_dismissed=include_dismissed,
            )
        )
        if levels is not None:
            accepted = frozenset(levels)
            notifications = tuple(
                notification for notification in notifications if notification.level in accepted
            )
        if query == "":
            return notifications
        result = self._search.search(
            notifications,
            query,
            mode=mode,
            flags=flags,
            get_text=lambda notification: (
                notification.title,
                notification.message,
                notification.category,
                notification.source or "",
            ),
        )
        return result.items

    def search_history(
        self,
        query: str,
        *,
        limit: int = 500,
        mode: SearchMode = SearchMode.LITERAL,
        flags: RegexFlags | None = None,
    ) -> SearchResult[Notification]:
        notifications = tuple(
            _from_record(record) for record in self.database.list_notifications(limit=limit)
        )
        return self._search.search(
            notifications,
            query,
            mode=mode,
            flags=flags,
            get_text=lambda notification: (
                notification.title,
                notification.message,
                notification.category,
                notification.source or "",
            ),
        )

    def mark_read(self, notification_id: str) -> bool:
        return self.database.set_notification_read(
            notification_id,
            datetime.now(timezone.utc),
        )

    def mark_unread(self, notification_id: str) -> bool:
        return self.database.set_notification_read(notification_id, None)

    def mark_all_read(self) -> int:
        return self.database.mark_all_notifications_read(datetime.now(timezone.utc))

    def dismiss(self, notification_id: str) -> bool:
        return self.database.set_notification_dismissed(
            notification_id,
            datetime.now(timezone.utc),
        )

    def restore(self, notification_id: str) -> bool:
        return self.database.set_notification_dismissed(notification_id, None)

    def delete(self, notification_id: str) -> bool:
        return self.database.delete_notification(notification_id)

    def clear_dismissed(self) -> int:
        return self.database.delete_dismissed_notifications()

    @property
    def unread_count(self) -> int:
        return self.database.unread_notification_count()

    def close(self) -> None:
        if self._owns_database:
            self.database.close()

    def __enter__(self) -> NotificationService:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def _from_record(record: PersistentNotificationRecord) -> Notification:
    action = None
    if record.action_label is not None and record.action_target is not None:
        action = NotificationAction(record.action_label, record.action_target)
    return Notification(
        notification_id=record.notification_id,
        level=NotificationLevel(record.level),
        title=record.title,
        message=record.message,
        category=record.category,
        source=record.source,
        action=action,
        persistent=record.persistent,
        metadata=record.metadata,
        created_at=record.created_at,
        updated_at=record.updated_at,
        read_at=record.read_at,
        dismissed_at=record.dismissed_at,
    )
