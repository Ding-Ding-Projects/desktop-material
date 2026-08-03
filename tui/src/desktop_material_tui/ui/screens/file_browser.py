"""Repository-wide file browser with bounded search and safe previews."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.message import Message
from textual.widgets import Button, Checkbox, DataTable, Label, TextArea
from textual.worker import Worker

from ...application.file_browser import (
    RepositoryFileBrowser,
    RepositoryFileEntry,
)
from ...application.search import RegexFlags, SearchMode, SearchService
from ..widgets.responsive_layout import ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState


class FileBrowserPane(Vertical):
    """Browse every repository file without reading beyond explicit bounds."""

    class OpenRequested(Message):
        """Request opening a selected file in the configured external editor."""

        def __init__(self, path: Path) -> None:
            self.path = path
            super().__init__()

    service: Any | None = None

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.browser: RepositoryFileBrowser | None = None
        self.entries: tuple[RepositoryFileEntry, ...] = ()
        self.visible_entries: tuple[RepositoryFileEntry, ...] = ()
        self.search_state = SearchState()

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="files",
            placeholder="Search repository files…",
            id="files-search",
        )
        with ScrollableToolbar(id="files-toolbar"):
            yield Button("Refresh", id="files-refresh")
            yield Checkbox("Show hidden files", id="files-hidden")
            yield Button("Open in editor", id="files-open-editor", variant="primary")
        yield Label("Open a repository to browse its files.", id="files-status")
        with Horizontal(classes="screen-split", id="files-split"):
            yield DataTable[str](
                id="files-table",
                cursor_type="row",
                zebra_stripes=True,
                classes="screen-list",
            )
            yield TextArea(
                "Select a file to preview it.",
                read_only=True,
                show_line_numbers=True,
                soft_wrap=False,
                id="files-preview",
                classes="screen-detail",
            )

    def on_mount(self) -> None:
        table = self.query_one("#files-table", DataTable)
        table.add_columns("Type", "Path", "Size")

    def bind_repository(self, service: Any | None) -> None:
        self.service = service
        self.browser = None
        self.entries = ()
        self.visible_entries = ()
        if self.is_mounted:
            self.reload()

    def reload(self) -> Worker[None] | None:
        if not self.is_mounted:
            return None
        return self._load_entries()

    @work(exclusive=True, group="file-browser-load")
    async def _load_entries(self) -> None:
        table = self.query_one("#files-table", DataTable)
        preview = self.query_one("#files-preview", TextArea)
        status = self.query_one("#files-status", Label)
        if self.service is None:
            self.browser = None
            self.entries = ()
            self.visible_entries = ()
            table.clear()
            preview.text = "Select a file to preview it."
            status.update("Open a repository to browse its files.")
            return
        status.update("Reading repository files…")
        show_hidden = self.query_one("#files-hidden", Checkbox).value
        try:
            browser = RepositoryFileBrowser(self.service.path)
            entries = await asyncio.to_thread(
                browser.list_entries,
                include_hidden=show_hidden,
            )
        except Exception as error:
            self.browser = None
            self.entries = ()
            self.visible_entries = ()
            table.clear()
            status.update(f"File browser failed: {error}")
            self.app.notify(
                str(error),
                title="File browser failed",
                severity="error",
                timeout=12,
            )
            return
        self.browser = browser
        self.entries = entries
        self._apply_search()

    def _filter_entries(self) -> tuple[RepositoryFileEntry, ...]:
        state = self.search_state
        try:
            mode = SearchMode(state.mode)
        except ValueError:
            mode = SearchMode.LITERAL
        result = SearchService().search(
            self.entries,
            state.query,
            mode=mode,
            flags=RegexFlags(
                ignore_case=not state.case_sensitive or "i" in state.flags,
                multiline="m" in state.flags,
                dot_all="s" in state.flags,
            ),
            get_text=lambda entry: (entry.name, entry.relative_path),
        )
        if result.error is not None:
            self.query_one("#files-status", Label).update(result.error)
            return self.entries
        return result.items

    def _apply_search(self) -> None:
        self._render_entries(self._filter_entries())

    def _render_entries(self, entries: tuple[RepositoryFileEntry, ...]) -> None:
        self.visible_entries = entries
        table = self.query_one("#files-table", DataTable)
        table.clear()
        for index, entry in enumerate(entries):
            kind = "DIR" if entry.is_directory else "LINK" if entry.is_symlink else "FILE"
            size = "—" if entry.size is None else f"{entry.size:,}"
            table.add_row(kind, entry.relative_path, size, key=str(index))
        qualifier = " matching" if self.search_state.query else ""
        self.query_one("#files-status", Label).update(
            f"{len(entries):,}{qualifier} of {len(self.entries):,} repository entries"
        )

    def _selected_entry(self) -> RepositoryFileEntry | None:
        table = self.query_one("#files-table", DataTable)
        if table.row_count == 0:
            return None
        try:
            row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
            index = int(str(row_key))
            return self.visible_entries[index]
        except (IndexError, KeyError, TypeError, ValueError):
            return None

    @on(SearchBar.Changed, "#files-search")
    def _search_changed(self, event: SearchBar.Changed) -> None:
        self.search_state = event.state
        self._apply_search()

    @on(Checkbox.Changed, "#files-hidden")
    def _hidden_changed(self, _event: Checkbox.Changed) -> None:
        self.reload()

    @on(DataTable.RowHighlighted, "#files-table")
    def _entry_highlighted(self, _event: DataTable.RowHighlighted) -> None:
        entry = self._selected_entry()
        if entry is None:
            return
        if entry.is_directory:
            self.query_one("#files-preview", TextArea).text = (
                f"Directory: {entry.relative_path}\n"
                "Use search to find any descendant file."
            )
            return
        self._load_preview(entry)

    @work(exclusive=True, group="file-browser-preview")
    async def _load_preview(self, entry: RepositoryFileEntry) -> None:
        browser = self.browser
        if browser is None:
            return
        preview_widget = self.query_one("#files-preview", TextArea)
        preview_widget.text = f"Loading {entry.relative_path}…"
        try:
            preview = await asyncio.to_thread(browser.preview, entry.relative_path)
        except Exception as error:
            preview_widget.text = f"Preview failed: {error}"
            return
        preview_widget.text = preview.text or "This file is empty."

    @on(Button.Pressed, "#files-refresh")
    def _refresh_pressed(self) -> None:
        self.reload()

    @on(Button.Pressed, "#files-open-editor")
    def _open_pressed(self) -> None:
        entry = self._selected_entry()
        browser = self.browser
        if entry is None or entry.is_directory or browser is None:
            self.app.notify("Select a file first.", severity="warning")
            return
        try:
            path = browser.resolve_file(entry.relative_path)
        except Exception as error:
            self.app.notify(
                str(error),
                title="File could not be opened",
                severity="error",
                timeout=12,
            )
            return
        self.post_message(self.OpenRequested(path))
