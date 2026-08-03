"""Terminal-native release history backed by the bundled factual catalog."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Checkbox, DataTable, Input, Label, Static

from ...application.changelog import (
    ChangelogCatalog,
    ChangelogEntry,
    ChangelogError,
    ChangelogRelease,
    parse_filter_date,
)
from ...application.search import RegexFlags, SearchMode, SearchResult
from ..i18n import Translator, get_translator
from ..widgets.responsive_layout import ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState


class ChangelogPane(Vertical):
    """Search, inspect, copy, and export every recorded project release."""

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.catalog: ChangelogCatalog | None = None
        self.releases: tuple[ChangelogRelease, ...] = ()
        self.search_state = SearchState()
        self._last_good_start: date | None = None
        self._last_good_end: date | None = None
        self._date_error: str | None = None
        self._catalog_error: str | None = None
        self._selected_release_version: str | None = None

    def compose(self) -> ComposeResult:
        yield Label("Release history", id="changelog-title", classes="modal-title")
        yield SearchBar(
            surface_id="changelog",
            placeholder="Search versions, categories, changes, or commit SHAs…",
            id="changelog-search",
        )
        with ScrollableToolbar(id="changelog-date-row"):
            yield Input(
                placeholder="Start YYYY-MM-DD",
                id="changelog-start",
                max_length=10,
                select_on_focus=False,
            )
            yield Input(
                placeholder="End YYYY-MM-DD",
                id="changelog-end",
                max_length=10,
                select_on_focus=False,
            )
            yield Checkbox("Include date-unrecorded releases", id="changelog-include-unrecorded")
            yield Button("Reset filters", id="changelog-reset")
        yield Static("Loading the bundled release catalog…", id="changelog-status", markup=True)
        with Horizontal(id="changelog-split", classes="screen-split"):
            yield DataTable[str](
                cursor_type="row",
                zebra_stripes=True,
                id="changelog-release-table",
                classes="screen-list",
            )
            yield DataTable[str](
                cursor_type="row",
                zebra_stripes=True,
                id="changelog-entry-table",
                classes="screen-detail",
            )
        with ScrollableToolbar(id="changelog-actions"):
            yield Button("Copy filtered view", id="changelog-copy")
            yield Button("Copy selected commit", id="changelog-copy-commit")
            yield Input(
                placeholder="New Markdown export path",
                id="changelog-export-path",
                select_on_focus=False,
            )
            yield Button("Export Markdown", id="changelog-export", variant="primary")

    def on_mount(self) -> None:
        self.query_one("#changelog-release-table", DataTable).add_columns(
            "Version",
            "Date",
            "Entries",
        )
        self.query_one("#changelog-entry-table", DataTable).add_columns(
            "Category",
            "Change",
            "Commit",
        )
        self.localize()

    def on_show(self) -> None:
        self.ensure_loaded()

    def ensure_loaded(self) -> None:
        """Load the bundled catalog only when release history becomes visible."""

        if self.catalog is not None or self._catalog_error is not None:
            return
        try:
            self.catalog = ChangelogCatalog.load_default()
        except ChangelogError as error:
            self._catalog_error = str(error)
            self._update_status()
            return
        self._apply_filters()

    @on(SearchBar.Changed, "#changelog-search")
    def _search_changed(self, event: SearchBar.Changed) -> None:
        self.search_state = event.state
        self._apply_filters()

    @on(Input.Changed, "#changelog-start")
    @on(Input.Changed, "#changelog-end")
    def _date_changed(self, _event: Input.Changed) -> None:
        self._accept_typed_dates()

    @on(Checkbox.Changed, "#changelog-include-unrecorded")
    def _include_unrecorded_changed(self, _event: Checkbox.Changed) -> None:
        self._apply_filters()

    @on(DataTable.RowHighlighted, "#changelog-release-table")
    def _release_highlighted(self, event: DataTable.RowHighlighted) -> None:
        self._selected_release_version = str(event.row_key.value)
        self._render_selected_release()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "changelog-reset":
            self._reset_filters()
        elif button_id == "changelog-copy":
            self._copy_filtered_view()
        elif button_id == "changelog-copy-commit":
            self._copy_selected_commit()
        elif button_id == "changelog-export":
            self._export_markdown()

    def _accept_typed_dates(self) -> None:
        start_value = self.query_one("#changelog-start", Input).value
        end_value = self.query_one("#changelog-end", Input).value
        try:
            start = parse_filter_date(start_value)
            end = parse_filter_date(end_value)
            if start is not None and end is not None and start > end:
                raise ChangelogError("The start date must not be after the end date.")
        except ChangelogError as error:
            self._date_error = str(error)
            self._update_status()
            return
        self._last_good_start = start
        self._last_good_end = end
        self._date_error = None
        self._apply_filters()

    def _search_result(self) -> SearchResult[ChangelogRelease]:
        if self.catalog is None:
            return SearchResult(hits=(), error=self._catalog_error)
        try:
            mode = SearchMode(self.search_state.mode)
        except ValueError:
            mode = SearchMode.LITERAL
        flags = RegexFlags(
            ignore_case=not self.search_state.case_sensitive or "i" in self.search_state.flags,
            multiline="m" in self.search_state.flags,
            dot_all="s" in self.search_state.flags,
        )
        return self.catalog.filter(
            self.search_state.query,
            mode=mode,
            flags=flags,
            start=self._last_good_start,
            end=self._last_good_end,
            include_unrecorded=self.query_one("#changelog-include-unrecorded", Checkbox).value,
        )

    def _apply_filters(self) -> None:
        if self.catalog is None:
            self.releases = ()
            self._render_release_rows()
            self._update_status()
            return
        try:
            result = self._search_result()
        except ChangelogError as error:
            self._date_error = str(error)
            self._update_status()
            return
        self.releases = result.items
        self._render_release_rows()
        self._update_status(search_error=result.error)

    def _render_release_rows(self) -> None:
        table = self.query_one("#changelog-release-table", DataTable)
        selected = self._selected_release_version
        table.clear(columns=False)
        for release in self.releases:
            table.add_row(
                release.version,
                release.date_label,
                str(len(release.entries)),
                key=release.version,
            )
        visible_versions = {release.version for release in self.releases}
        if selected not in visible_versions:
            selected = self.releases[0].version if self.releases else None
        self._selected_release_version = selected
        if selected is None:
            self.query_one("#changelog-entry-table", DataTable).clear(columns=False)
            return
        row = next(
            index for index, release in enumerate(self.releases) if release.version == selected
        )
        table.move_cursor(row=row, column=0, animate=False)
        self._render_selected_release()

    def _selected_release(self) -> ChangelogRelease | None:
        if self._selected_release_version is None:
            return None
        return next(
            (
                release
                for release in self.releases
                if release.version == self._selected_release_version
            ),
            None,
        )

    def _render_selected_release(self) -> None:
        table = self.query_one("#changelog-entry-table", DataTable)
        table.clear(columns=False)
        release = self._selected_release()
        if release is None:
            return
        for index, entry in enumerate(release.entries):
            table.add_row(
                entry.category or "Uncategorized",
                entry.text,
                entry.commit or "Not recorded",
                key=str(index),
            )
        if release.entries:
            table.move_cursor(row=0, column=0, animate=False)

    def _selected_entry(self) -> ChangelogEntry | None:
        release = self._selected_release()
        if release is None or not release.entries:
            return None
        table = self.query_one("#changelog-entry-table", DataTable)
        try:
            key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
            index = int(str(key))
        except (IndexError, KeyError, ValueError):
            return None
        return release.entries[index] if 0 <= index < len(release.entries) else None

    def _update_status(self, *, search_error: str | None = None) -> None:
        status = self.query_one("#changelog-status", Static)
        if self._catalog_error is not None:
            status.update(f"[red]{self._catalog_error}[/]")
            return
        if self.catalog is None:
            status.update("Loading the bundled release catalog…")
            return
        entry_count = sum(len(release.entries) for release in self.releases)
        parts = [
            f"{len(self.releases)} of {len(self.catalog.releases)} releases",
            f"{entry_count} visible entries",
        ]
        if (
            self._last_good_start is not None or self._last_good_end is not None
        ) and not self.query_one("#changelog-include-unrecorded", Checkbox).value:
            parts.append(f"{self.catalog.unrecorded_count} date-unrecorded releases excluded")
        error = self._date_error or search_error
        if error:
            parts.append(f"[red]{error}[/]")
        status.update(" · ".join(parts))

    def _reset_filters(self) -> None:
        self.query_one("#changelog-start", Input).value = ""
        self.query_one("#changelog-end", Input).value = ""
        self.query_one("#changelog-include-unrecorded", Checkbox).value = False
        self._last_good_start = None
        self._last_good_end = None
        self._date_error = None
        search = self.query_one("#changelog-search", SearchBar)
        search.set_state(SearchState(), emit=True)

    def _scope_label(self) -> str:
        query = self.search_state.query.strip() or "none"
        start = self._last_good_start.isoformat() if self._last_good_start is not None else "open"
        end = self._last_good_end.isoformat() if self._last_good_end is not None else "open"
        undated = self.query_one("#changelog-include-unrecorded", Checkbox).value
        return (
            f"visible releases; query={query!r}; mode={self.search_state.mode}; "
            f"dates={start}..{end}; include date-unrecorded={str(undated).lower()}"
        )

    def _copy_filtered_view(self) -> None:
        if self.catalog is None:
            self.app.notify("The release catalog is unavailable.", severity="error")
            return
        try:
            rendered = self.catalog.markdown(self.releases, scope=self._scope_label())
        except ChangelogError as error:
            self.app.notify(str(error), title="Copy failed", severity="error")
            return
        self.app.copy_to_clipboard(rendered)
        self.app.notify("The visible release history was copied.", title="Release history")

    def _copy_selected_commit(self) -> None:
        entry = self._selected_entry()
        if entry is None or entry.commit is None:
            self.app.notify("The selected entry has no recorded commit.", severity="warning")
            return
        self.app.copy_to_clipboard(entry.commit)
        self.app.notify("The full commit SHA was copied.", title="Release history")

    def _export_markdown(self) -> None:
        if self.catalog is None:
            self.app.notify("The release catalog is unavailable.", severity="error")
            return
        raw_destination = self.query_one("#changelog-export-path", Input).value.strip()
        if not raw_destination:
            self.app.notify("Enter a new Markdown export path.", severity="warning")
            return
        try:
            destination = self.catalog.export_markdown(
                self.releases,
                Path(raw_destination),
                scope=self._scope_label(),
            )
        except ChangelogError as error:
            self.app.notify(str(error), title="Export failed", severity="error")
            return
        self.app.notify(str(destination), title="Release history exported")

    def localize(self, translator: Translator | None = None) -> None:
        translator = translator or get_translator()
        self.query_one("#changelog-title", Label).update(translator.t("changelog.title"))
        self.query_one("#changelog-include-unrecorded", Checkbox).label = translator.t(
            "changelog.include_unrecorded"
        )
        labels = {
            "#changelog-reset": "changelog.reset",
            "#changelog-copy": "changelog.copy",
            "#changelog-copy-commit": "changelog.copy_commit",
            "#changelog-export": "changelog.export",
        }
        for selector, key in labels.items():
            self.query_one(selector, Button).label = translator.t(key)


__all__ = ["ChangelogPane"]
