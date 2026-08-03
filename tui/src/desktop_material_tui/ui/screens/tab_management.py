"""Repository-tab management, overflow, and portable-session surface."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from textual import on
from textual.app import ComposeResult
from textual.containers import VerticalScroll
from textual.widgets import Button, Checkbox, DataTable, Input, Label, Select, Static

from ...application.repository_workspace import (
    Arrangement,
    CloseMode,
    ClosePreview,
    RepositoryWorkspaceError,
    RepositoryWorkspaceService,
)
from ...application.search import RegexFlags
from ...infrastructure.persistence import RepositoryRecord
from ..widgets.responsive_layout import ResponsiveFormRow, ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState


class RepositoryTabsPane(VerticalScroll):
    """Manage every open, overflowed, collapsed, or hidden repository tab."""

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.workspace: RepositoryWorkspaceService | None = None
        self.search_state = SearchState()
        self.close_search_state = SearchState()
        self.visible_records: tuple[RepositoryRecord, ...] = ()
        self.protected_paths: dict[Path, str] = {}
        self.overflow_paths: frozenset[Path] = frozenset()
        self._preview: ClosePreview | None = None
        self._on_changed: Callable[[], object] | None = None
        self._on_close_requested: Callable[[tuple[Path, ...]], object] | None = None

    def compose(self) -> ComposeResult:
        yield Label("Repository tabs and sessions", classes="pane-title")
        yield Static(
            "Aliases, pins, favourites, groups, order, visibility, and portable JSON "
            "stay in app-owned state. Closing a tab never deletes its repository.",
            id="repository-tabs-intro",
        )
        yield SearchBar(
            surface_id="repository-tabs",
            placeholder="Search aliases, groups, names, and paths…",
            id="repository-tabs-search",
        )
        with ScrollableToolbar(id="repository-tabs-filter-toolbar"):
            yield Checkbox("Show hidden repositories", id="repository-tabs-show-hidden")
            yield Button("Refresh", id="repository-tabs-refresh")
        yield Static("No repository tabs are open.", id="repository-tabs-status")
        yield DataTable[str](
            id="repository-tabs-table",
            cursor_type="row",
            zebra_stripes=True,
            classes="screen-list",
        )

        yield Label("Selected tab", classes="section-heading")
        with ResponsiveFormRow(id="repository-tab-alias-row"):
            yield Input(placeholder="Alias (blank restores repository name)", id="tab-alias")
            yield Button("Save alias", id="tab-alias-save", variant="primary")
        with ResponsiveFormRow(id="repository-tab-group-row"):
            yield Input(placeholder="Group name (up to 64 characters)", id="tab-group")
            yield Button("Set group", id="tab-group-save")
            yield Button("Clear group", id="tab-group-clear")
        with ScrollableToolbar(id="repository-tab-actions"):
            yield Button("Pin", id="tab-pin")
            yield Button("Favourite", id="tab-favorite")
            yield Button("Collapse group", id="tab-group-collapse")
            yield Button("Hide", id="tab-hide")
            yield Button("Move up", id="tab-move-up")
            yield Button("Move down", id="tab-move-down")
        with ResponsiveFormRow(id="repository-tab-arrange-row"):
            yield Select(
                (
                    ("Label A → Z", Arrangement.LABEL_ASCENDING.value),
                    ("Label Z → A", Arrangement.LABEL_DESCENDING.value),
                    ("Newest opened", Arrangement.NEWEST_OPENED.value),
                    ("Oldest opened", Arrangement.OLDEST_OPENED.value),
                    ("Repository status", Arrangement.REPOSITORY_STATUS.value),
                    ("Favourites first", Arrangement.FAVORITES_FIRST.value),
                    ("Favourites last", Arrangement.FAVORITES_LAST.value),
                ),
                value=Arrangement.LABEL_ASCENDING.value,
                allow_blank=False,
                id="tab-arrangement",
            )
            yield Button("Apply one-shot sort", id="tab-arrange-apply")

        yield Label("Portable tab session", classes="section-heading")
        with ResponsiveFormRow(id="repository-session-path-row"):
            yield Input(
                str(Path.home() / "desktop-material-tabs.json"),
                placeholder="/path/to/desktop-material-tabs.json",
                id="tab-session-path",
            )
            yield Select(
                (("Merge with open tabs", "merge"), ("Replace open tabs", "replace")),
                value="merge",
                allow_blank=False,
                id="tab-session-import-mode",
            )
        with ScrollableToolbar(id="repository-session-actions"):
            yield Button("Export JSON", id="tab-session-export")
            yield Button("Import JSON", id="tab-session-import")
        yield Static(
            "Portable files intentionally omit destination-local group membership.",
            id="tab-session-status",
        )

        yield Label("Reviewed bulk close", classes="section-heading")
        yield SearchBar(
            surface_id="repository-tabs-close",
            placeholder="Text or a bounded RE2 pattern…",
            id="repository-tabs-close-search",
        )
        with ResponsiveFormRow(id="repository-tabs-close-mode-row"):
            yield Select(
                (
                    ("Close tabs containing query", CloseMode.CONTAINING.value),
                    ("Close tabs not containing query", CloseMode.NOT_CONTAINING.value),
                ),
                value=CloseMode.CONTAINING.value,
                allow_blank=False,
                id="repository-tabs-close-action",
            )
            yield Checkbox("Include pinned tabs", id="repository-tabs-include-pinned")
        yield Static(
            "Enter a non-empty query to build a bounded close preview.",
            id="repository-tabs-close-preview",
        )
        with ResponsiveFormRow(id="repository-tabs-close-confirm-row"):
            yield Checkbox(
                "I reviewed the exact close list",
                id="repository-tabs-close-reviewed",
                disabled=True,
            )
            yield Button(
                "Close reviewed tabs",
                id="repository-tabs-close-apply",
                variant="error",
                disabled=True,
            )

    def on_mount(self) -> None:
        self.query_one("#repository-tabs-table", DataTable).add_columns(
            "State",
            "Label",
            "Group",
            "Repository path",
        )

    def bind_workspace(
        self,
        workspace: RepositoryWorkspaceService | None,
        *,
        on_changed: Callable[[], object] | None = None,
        on_close_requested: Callable[[tuple[Path, ...]], object] | None = None,
    ) -> None:
        self.workspace = workspace
        self._on_changed = on_changed
        self._on_close_requested = on_close_requested
        if self.is_mounted:
            self.reload()

    def set_protected_paths(self, reasons: Mapping[Path, str]) -> None:
        self.protected_paths = {
            path.expanduser().resolve(): reason for path, reason in reasons.items()
        }
        if self.is_mounted:
            self._update_close_preview(reset_review=False)

    def set_overflow_paths(self, paths: set[Path] | frozenset[Path]) -> None:
        self.overflow_paths = frozenset(path.expanduser().resolve() for path in paths)
        if self.is_mounted:
            self._render_records(self.visible_records)

    def reload(self) -> None:
        if not self.is_mounted:
            return
        workspace = self.workspace
        if workspace is None:
            self.visible_records = ()
            self.query_one("#repository-tabs-table", DataTable).clear()
            self.query_one("#repository-tabs-status", Static).update(
                "Repository-tab persistence is unavailable."
            )
            self._set_selected_controls(None)
            self._update_close_preview()
            return
        show_hidden = self.query_one("#repository-tabs-show-hidden", Checkbox).value
        flags = _flags_from_state(self.search_state)
        try:
            result = workspace.search(
                self.search_state.query,
                mode=self.search_state.mode,
                flags=flags,
                include_hidden=show_hidden,
            )
        except (RepositoryWorkspaceError, ValueError) as error:
            self.visible_records = ()
            self._render_records(())
            self.query_one("#repository-tabs-status", Static).update(str(error))
            return
        self.visible_records = result.items
        self._render_records(self.visible_records)
        if result.error is not None:
            self.query_one("#repository-tabs-status", Static).update(result.error)
        self._update_close_preview(reset_review=False)

    def _render_records(self, records: tuple[RepositoryRecord, ...]) -> None:
        table = self.query_one("#repository-tabs-table", DataTable)
        table.clear()
        for index, record in enumerate(records):
            state = []
            if record.pinned:
                state.append("PIN")
            if record.favorite:
                state.append("★")
            if record.hidden:
                state.append("HIDDEN")
            if record.path in self.overflow_paths:
                state.append("OVERFLOW")
            table.add_row(
                " · ".join(state) or "OPEN",
                _record_label(record),
                record.group_name or "—",
                str(record.path),
                key=str(index),
            )
        query_note = " matching" if self.search_state.query else ""
        self.query_one("#repository-tabs-status", Static).update(
            f"{len(records)}{query_note} repository tab(s). "
            "Pinned tabs stay outside bulk close by default."
        )
        self._set_selected_controls(self._selected_record())

    def _selected_record(self) -> RepositoryRecord | None:
        table = self.query_one("#repository-tabs-table", DataTable)
        if table.row_count == 0:
            return None
        try:
            row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
            return self.visible_records[int(str(row_key))]
        except (IndexError, KeyError, TypeError, ValueError):
            return None

    def _set_selected_controls(self, record: RepositoryRecord | None) -> None:
        controls = (
            "#tab-alias-save",
            "#tab-group-save",
            "#tab-group-clear",
            "#tab-pin",
            "#tab-favorite",
            "#tab-group-collapse",
            "#tab-hide",
            "#tab-move-up",
            "#tab-move-down",
        )
        for selector in controls:
            self.query_one(selector, Button).disabled = record is None
        if record is None:
            self.query_one("#tab-alias", Input).value = ""
            self.query_one("#tab-group", Input).value = ""
            return
        self.query_one("#tab-alias", Input).value = record.alias or ""
        self.query_one("#tab-group", Input).value = record.group_name or ""
        self.query_one("#tab-pin", Button).label = "Unpin" if record.pinned else "Pin"
        self.query_one("#tab-favorite", Button).label = (
            "Unfavourite" if record.favorite else "Favourite"
        )
        self.query_one("#tab-hide", Button).label = "Restore and open" if record.hidden else "Hide"
        collapse = self.query_one("#tab-group-collapse", Button)
        if record.group_name is None or self.workspace is None:
            collapse.disabled = True
            collapse.label = "Collapse group"
        else:
            collapsed = record.group_name in self.workspace.snapshot().collapsed_groups
            collapse.label = "Expand group" if collapsed else "Collapse group"

    @on(SearchBar.Changed, "#repository-tabs-search")
    def _search_changed(self, event: SearchBar.Changed) -> None:
        self.search_state = event.state
        self.reload()

    @on(SearchBar.Changed, "#repository-tabs-close-search")
    def _close_search_changed(self, event: SearchBar.Changed) -> None:
        self.close_search_state = event.state
        self._update_close_preview()

    @on(Checkbox.Changed, "#repository-tabs-show-hidden")
    def _show_hidden_changed(self, _event: Checkbox.Changed) -> None:
        self.reload()

    @on(Checkbox.Changed, "#repository-tabs-include-pinned")
    def _include_pinned_changed(self, _event: Checkbox.Changed) -> None:
        self._update_close_preview()

    @on(Checkbox.Changed, "#repository-tabs-close-reviewed")
    def _review_changed(self, event: Checkbox.Changed) -> None:
        self.query_one("#repository-tabs-close-apply", Button).disabled = not (
            event.value and self._preview is not None and self._preview.can_confirm
        )

    @on(Select.Changed, "#repository-tabs-close-action")
    def _close_mode_changed(self, _event: Select.Changed) -> None:
        self._update_close_preview()

    @on(DataTable.RowHighlighted, "#repository-tabs-table")
    def _record_highlighted(self, _event: DataTable.RowHighlighted) -> None:
        self._set_selected_controls(self._selected_record())

    @on(Button.Pressed)
    def _button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""
        if not button_id.startswith("tab-") and not button_id.startswith("repository-tabs-"):
            return
        if button_id == "repository-tabs-refresh":
            self.reload()
            return
        if button_id == "repository-tabs-close-apply":
            self._request_close()
            return
        if button_id == "tab-session-export":
            self._export_session()
            return
        if button_id == "tab-session-import":
            self._import_session()
            return
        if button_id == "tab-arrange-apply":
            self._arrange()
            return
        self._mutate_selected(button_id)

    def _mutate_selected(self, button_id: str) -> None:
        workspace = self.workspace
        record = self._selected_record()
        if workspace is None or record is None:
            self.app.notify("Select a repository tab first.", severity="warning")
            return
        try:
            if button_id == "tab-alias-save":
                workspace.set_alias(record.path, self.query_one("#tab-alias", Input).value)
                message = "Repository alias saved."
            elif button_id == "tab-group-save":
                workspace.set_group(record.path, self.query_one("#tab-group", Input).value)
                message = "Repository group saved."
            elif button_id == "tab-group-clear":
                workspace.set_group(record.path, None)
                message = "Repository removed from its group; the tab stayed open."
            elif button_id == "tab-pin":
                workspace.set_pinned(record.path, not record.pinned)
                message = "Repository pin state saved."
            elif button_id == "tab-favorite":
                workspace.set_favorite(record.path, not record.favorite)
                message = "Repository favourite state saved."
            elif button_id == "tab-group-collapse":
                if record.group_name is None:
                    raise RepositoryWorkspaceError("The selected tab is not grouped.")
                collapsed = record.group_name in workspace.snapshot().collapsed_groups
                workspace.set_group_collapsed(record.group_name, not collapsed)
                message = "Repository group display state saved."
            elif button_id == "tab-hide":
                if record.path in self.protected_paths and not record.hidden:
                    raise RepositoryWorkspaceError(
                        "This tab has unsaved work or an unavailable status and was not hidden."
                    )
                workspace.set_hidden(record.path, not record.hidden)
                if record.hidden:
                    workspace.open_repository(record.path)
                    message = "Hidden repository restored and opened."
                else:
                    message = "Repository hidden locally; its directory was not changed."
            elif button_id == "tab-move-up":
                workspace.move(record.path, -1)
                message = "Repository tab moved up as one stable group block."
            elif button_id == "tab-move-down":
                workspace.move(record.path, 1)
                message = "Repository tab moved down as one stable group block."
            else:
                return
        except (OSError, RepositoryWorkspaceError, ValueError) as error:
            self.app.notify(str(error), title="Tab change failed", severity="error")
            return
        self._changed(message)

    def _arrange(self) -> None:
        workspace = self.workspace
        value = self.query_one("#tab-arrangement", Select).value
        if workspace is None or value is Select.BLANK:
            return
        try:
            workspace.arrange(str(value))
        except (RepositoryWorkspaceError, ValueError) as error:
            self.app.notify(str(error), title="Arrange tabs failed", severity="error")
            return
        self._changed("One-shot tab order saved; future status changes will not reshuffle it.")

    def _export_session(self) -> None:
        workspace = self.workspace
        if workspace is None:
            return
        target = Path(self.query_one("#tab-session-path", Input).value)
        try:
            exported = workspace.export_to_path(target)
        except (OSError, RepositoryWorkspaceError, ValueError) as error:
            self.app.notify(str(error), title="Session export failed", severity="error")
            return
        self.query_one("#tab-session-status", Static).update(
            f"Exported bounded UTF-8 JSON to {exported}. Destination groups were omitted."
        )
        self.app.notify(str(exported), title="Tab session exported")

    def _import_session(self) -> None:
        workspace = self.workspace
        if workspace is None:
            return
        source = Path(self.query_one("#tab-session-path", Input).value)
        mode = self.query_one("#tab-session-import-mode", Select).value
        try:
            result = workspace.import_from_path(source, merge=mode != "replace")
        except (OSError, RepositoryWorkspaceError, ValueError) as error:
            self.app.notify(str(error), title="Session import failed", severity="error")
            return
        self.query_one("#tab-session-status", Static).update(
            f"Imported {len(result.imported)} tab(s); skipped {len(result.skipped_paths)} "
            "missing path(s). Existing destination groups were preserved."
        )
        self._changed("Portable tab session imported.")

    def _update_close_preview(self, *, reset_review: bool = True) -> None:
        reviewed = self.query_one("#repository-tabs-close-reviewed", Checkbox)
        apply_button = self.query_one("#repository-tabs-close-apply", Button)
        if reset_review:
            reviewed.value = False
        workspace = self.workspace
        if workspace is None:
            reviewed.disabled = True
            apply_button.disabled = True
            self._preview = None
            return
        close_mode = self.query_one("#repository-tabs-close-action", Select).value
        include_pinned = self.query_one("#repository-tabs-include-pinned", Checkbox).value
        try:
            preview = workspace.preview_close(
                self.close_search_state.query,
                search_mode=self.close_search_state.mode,
                flags=_flags_from_state(self.close_search_state),
                close_mode=(
                    CloseMode.CONTAINING.value
                    if close_mode is Select.BLANK
                    else str(close_mode)
                ),
                include_pinned=include_pinned,
                protected_paths=self.protected_paths,
            )
        except (RepositoryWorkspaceError, ValueError) as error:
            preview = None
            text = f"[red]{error}[/]"
        else:
            assert preview is not None
            text = _preview_text(preview)
        self._preview = preview
        self.query_one("#repository-tabs-close-preview", Static).update(text)
        can_confirm = preview is not None and preview.can_confirm
        reviewed.disabled = not can_confirm
        apply_button.disabled = not (can_confirm and reviewed.value)

    def _request_close(self) -> None:
        preview = self._preview
        reviewed = self.query_one("#repository-tabs-close-reviewed", Checkbox)
        if preview is None or not preview.can_confirm or not reviewed.value:
            self.app.notify("Review a valid close preview first.", severity="warning")
            return
        paths = tuple(record.path for record in preview.closing)
        reviewed.value = False
        self.query_one("#repository-tabs-close-apply", Button).disabled = True
        if self._on_close_requested is not None:
            self._on_close_requested(paths)

    def _changed(self, message: str) -> None:
        if self._on_changed is not None:
            self._on_changed()
        self.reload()
        self.app.notify(message, title="Repository tabs")


def _flags_from_state(state: SearchState) -> RegexFlags:
    return RegexFlags(
        ignore_case=not state.case_sensitive or "i" in state.flags,
        multiline="m" in state.flags,
        dot_all="s" in state.flags,
    )


def _record_label(record: RepositoryRecord) -> str:
    return record.alias or record.path.name or str(record.path)


def _preview_text(preview: ClosePreview) -> str:
    if preview.error is not None:
        return f"[red]{preview.error}[/]"
    names = ", ".join(_record_label(record) for record in preview.preview_records)
    if preview.preview_truncated:
        names += f", … +{len(preview.closing) - len(preview.preview_records)}"
    return (
        f"[b]{len(preview.closing)} will close[/] · {len(preview.kept)} will stay · "
        f"{len(preview.protected_pinned)} pinned excluded · "
        f"{len(preview.protected_unsaved)} unsaved/status-unknown excluded\n"
        f"Review: {names}"
    )
