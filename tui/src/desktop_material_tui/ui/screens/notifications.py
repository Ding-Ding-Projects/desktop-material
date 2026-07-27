"""Persistent, searchable notification centre."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, DataTable, TextArea

from ...application.search import RegexFlags, SearchMode, SearchService
from ..widgets.search_bar import SearchBar


class NotificationCentrePane(Vertical):
    """Review informational, progress, success, warning, and error events."""

    notifications: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.notifications = []

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="notifications",
            placeholder="Search notification history…",
            id="notifications-search",
        )
        with Horizontal(classes="screen-toolbar"):
            yield Button("Refresh", id="notifications-refresh")
            yield Button("Mark all read", id="notifications-read")
            yield Button("Clear history…", id="notifications-clear", variant="error")
        with Horizontal(classes="screen-split"):
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="notifications-table",
                classes="screen-list",
            )
            yield TextArea(
                "Select a notification.",
                read_only=True,
                id="notification-detail",
                classes="screen-detail",
            )

    def on_mount(self) -> None:
        self.query_one("#notifications-table", DataTable).add_columns(
            "When",
            "Severity",
            "Title",
            "Status",
        )

    def set_notifications(self, notifications: Iterable[object]) -> None:
        self.notifications = list(notifications)
        self._render_notifications(self.notifications)

    def _render_notifications(self, notifications: Iterable[object]) -> None:
        table = self.query_one("#notifications-table", DataTable)
        table.clear()
        source_indices = {
            id(notification): index for index, notification in enumerate(self.notifications)
        }
        for notification in notifications:
            index = source_indices[id(notification)]
            level = getattr(notification, "level", "information")
            severity = str(getattr(level, "value", level))
            table.add_row(
                str(getattr(notification, "created_at", "")),
                severity,
                str(getattr(notification, "title", "")),
                "read" if getattr(notification, "is_read", False) else "new",
                key=str(index),
            )

    @on(SearchBar.Changed, "#notifications-search")
    def _filter_notifications(self, event: SearchBar.Changed) -> None:
        try:
            mode = SearchMode(event.state.mode)
        except ValueError:
            mode = SearchMode.LITERAL
        flags = RegexFlags(
            ignore_case=not event.state.case_sensitive or "i" in event.state.flags,
            multiline="m" in event.state.flags,
            dot_all="s" in event.state.flags,
        )
        result = SearchService().search(
            self.notifications,
            event.state.query,
            mode=mode,
            flags=flags,
            get_text=lambda item: (
                str(getattr(item, "title", "")),
                str(getattr(item, "message", "")),
                str(getattr(item, "source", "")),
                str(getattr(item, "created_at", "")),
            ),
        )
        self._render_notifications(result.items if result.error is None else self.notifications)

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        if event.data_table.id != "notifications-table":
            return
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            notification = self.notifications[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        level = getattr(notification, "level", "information")
        severity = str(getattr(level, "value", level))
        action = getattr(notification, "action", None)
        self.query_one("#notification-detail", TextArea).text = (
            f"{getattr(notification, 'title', '')}\n"
            f"{getattr(notification, 'created_at', '')} · {severity}\n\n"
            f"{getattr(notification, 'message', '')}\n\n"
            f"Action: {getattr(action, 'label', '—')} {getattr(action, 'target', '')}"
        )
