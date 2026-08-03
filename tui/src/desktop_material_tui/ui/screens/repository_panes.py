"""Interactive repository workflow panes."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from typing import Any

from rich.markup import escape
from rich.syntax import Syntax
from rich.text import Text
from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import (
    Button,
    Checkbox,
    DataTable,
    Input,
    Label,
    Markdown,
    RichLog,
    Select,
    SelectionList,
    Static,
    TextArea,
    Tree,
)
from textual.worker import Worker

from ...application.diff_preview import (
    MAX_TEXT_PREVIEW_BYTES,
    changed_path_entries,
    decode_text_preview,
    structured_diff,
)
from ...application.search import RegexFlags, SearchMode, SearchService
from ..widgets.png_picture import (
    MAX_PNG_BYTES,
    decode_png_bytes,
    render_terminal_picture,
)
from ..widgets.responsive_layout import ResponsiveFormRow, ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState
from .dialogs import DecisionDialog


def _value(item: object, name: str, default: Any = "") -> Any:
    return getattr(item, name, default)


def _short_oid(item: object) -> str:
    value = str(_value(item, "oid", _value(item, "sha", _value(item, "id", ""))))
    return value[:10]


def _filtered(
    items: Sequence[object],
    state: SearchState,
    *fields: str,
) -> tuple[object, ...]:
    """Apply the shared literal/fuzzy/RE2 contract to arbitrary models."""

    try:
        mode = SearchMode(state.mode)
    except ValueError:
        mode = SearchMode.LITERAL
    flags = RegexFlags(
        ignore_case=not state.case_sensitive or "i" in state.flags,
        multiline="m" in state.flags,
        dot_all="s" in state.flags,
    )
    result = SearchService().search(
        items,
        state.query,
        mode=mode,
        flags=flags,
        get_text=lambda item: tuple(str(_value(item, field, "")) for field in fields),
    )
    return result.items if result.error is None else tuple(items)


def _selected_source_index(table: DataTable[str]) -> int | None:
    """Return the source-model index stored as a table row key.

    A filtered table's visible row number is not the same thing as the index in
    its backing list. Keeping the original index in the row key prevents a
    click on a filtered result from operating on a different Git object.
    """

    if table.row_count == 0:
        return None
    try:
        cell_key = table.coordinate_to_cell_key(table.cursor_coordinate)
        source_key = cell_key.row_key.value
        return int(source_key) if source_key is not None else None
    except (KeyError, ValueError, TypeError):
        return None


class RepositoryPane(Vertical):
    """Base pane that binds to a repository service at runtime."""

    service: Any | None = None

    def bind_repository(self, service: Any | None) -> None:
        self.service = service
        self.reload()

    def reload(self) -> Worker[None] | None:
        """Refresh pane contents when implemented by a concrete pane."""

        return None

    def _error(self, action: str, error: BaseException) -> None:
        self.app.notify(
            str(error),
            title=f"{action} failed",
            severity="error",
            timeout=12,
        )

    async def _mutate(
        self,
        title: str,
        operation: Callable[[], object],
        *,
        success: str,
    ) -> bool:
        if self.service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return False
        self.app.notify(f"{title}…", title="Working")
        try:
            await asyncio.to_thread(operation)
        except Exception as error:
            self._error(title, error)
            return False
        self.app.notify(success, title="Done")
        refresh_all = getattr(self.app, "refresh_repository", None)
        if callable(refresh_all):
            refresh_all()
        else:
            self.reload()
        return True


class ChangesPane(RepositoryPane):
    """Stage, inspect, commit, and discard working-tree changes."""

    DEFAULT_CSS = """
    ChangesPane #changes-image-preview {
        padding: 0 1;
    }

    ChangesPane .image-heading {
        height: 1;
        color: $text-muted;
    }

    ChangesPane .image-frame {
        width: 100%;
        height: auto;
        min-height: 3;
        margin-bottom: 1;
    }
    """

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.changes: list[object] = []
        self.current_diff_path: str | None = None
        self.current_diff_text = ""
        self.current_diff_staged = False
        self.diff_context_lines = 3
        self.word_diff = False
        self.diff_render_mode = "plain"
        self.preview_mode = "code"
        self.file_view_mode = "flat"

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="changes",
            placeholder="Filter changed files…",
            id="changes-search",
        )
        with ScrollableToolbar():
            yield Button("Refresh", id="changes-refresh")
            yield Button("Stage selected", id="changes-stage", variant="primary")
            yield Button("Unstage selected", id="changes-unstage")
            yield Button("Discard selected…", id="changes-discard", variant="error")
        with ScrollableToolbar(id="diff-options-toolbar"):
            yield Select(
                (("Flat files", "flat"), ("Changed-file tree", "tree")),
                value="flat",
                allow_blank=False,
                id="changes-file-view",
            )
            yield Select(
                (("Line diff", "line"), ("Word diff", "word")),
                value="line",
                allow_blank=False,
                id="diff-word-mode",
            )
            yield Select(
                (
                    ("3 context lines", "3"),
                    ("20 context lines", "20"),
                    ("50 context lines", "50"),
                    ("100 context lines", "100"),
                    ("Whole file (bounded)", "10000"),
                ),
                value="3",
                allow_blank=False,
                id="diff-context",
            )
            yield Select(
                (("Plain patch", "plain"), ("Syntax-highlighted patch", "syntax")),
                value="plain",
                allow_blank=False,
                id="diff-render-mode",
            )
            yield Select(
                (
                    ("Code", "code"),
                    ("CSV/TSV table", "table"),
                    ("Safe Markdown", "markdown"),
                    ("PNG before/after", "image"),
                ),
                value="code",
                allow_blank=False,
                id="diff-preview-mode",
            )
        with Horizontal(classes="screen-split"):
            yield SelectionList[str](id="changes-list", classes="screen-list")
            change_tree: Tree[str | None] = Tree(
                "Changed files",
                id="changes-tree",
                classes="screen-list",
            )
            change_tree.show_root = False
            change_tree.display = False
            yield change_tree
            yield TextArea(
                "Select a changed file to inspect its diff.",
                read_only=True,
                show_line_numbers=True,
                soft_wrap=False,
                id="changes-diff",
                classes="screen-detail",
            )
            syntax_diff = RichLog(
                wrap=False,
                highlight=False,
                markup=False,
                id="changes-syntax-diff",
                classes="screen-detail",
            )
            syntax_diff.display = False
            yield syntax_diff
            structured_table: DataTable[str] = DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="changes-structured-table",
                classes="screen-detail",
            )
            structured_table.display = False
            yield structured_table
            markdown = Markdown(
                "Select a Markdown file to preview.",
                open_links=False,
                id="changes-markdown",
                classes="screen-detail",
            )
            markdown.display = False
            yield markdown
            image_preview = VerticalScroll(
                Label("Before", classes="image-heading"),
                Static("No before image loaded.", id="changes-image-before", classes="image-frame"),
                Label("After", classes="image-heading"),
                Static("No after image loaded.", id="changes-image-after", classes="image-frame"),
                Static(
                    "Bounded 8-bit RGB/RGBA non-interlaced PNG preview.",
                    id="changes-image-status",
                ),
                id="changes-image-preview",
                classes="screen-detail",
            )
            image_preview.display = False
            yield image_preview
        with Vertical(classes="form-panel", id="commit-panel"):
            yield Label("Commit", classes="field-label")
            yield Input(
                placeholder="Summary (required)",
                id="commit-summary",
                max_length=200,
                select_on_focus=False,
            )
            yield TextArea(
                "",
                placeholder="Description (optional)",
                id="commit-body",
                soft_wrap=True,
                tab_behavior="focus",
            )
            with ResponsiveFormRow():
                yield Input(
                    placeholder="Co-authors: Name <email>; …",
                    id="commit-coauthors",
                    select_on_focus=False,
                )
                yield Checkbox("Amend last commit", id="commit-amend")
                yield Checkbox("Add Signed-off-by", id="commit-signoff")
                yield Button("Commit", id="commit-submit", variant="primary")
                yield Button("Commit & push", id="commit-push")

    @work(exclusive=True, group="changes-load")
    async def reload(self) -> None:
        change_list = self.query_one("#changes-list", SelectionList)
        diff = self.query_one("#changes-diff", TextArea)
        change_list.clear_options()
        self.query_one("#changes-tree", Tree).clear()
        self.current_diff_path = None
        diff.text = "Loading changes…"
        if self.service is None:
            diff.text = "Open a repository to view changes."
            return
        try:
            status = await asyncio.to_thread(self.service.status)
        except Exception as error:
            diff.text = str(error)
            self._error("Refresh changes", error)
            return
        self.changes = list(_value(status, "changes", ()))
        if not self.changes:
            diff.text = "Working tree clean. Nothing is waiting backstage."
            return
        self._render_changes(self.changes)
        branch = str(
            _value(
                status,
                "branch",
                _value(status, "branch_name", _value(status, "branch_head", "detached")),
            )
        )
        ahead = int(_value(status, "ahead", 0))
        behind = int(_value(status, "behind", 0))
        diff.text = (
            f"Branch: {branch}\nAhead: {ahead}  Behind: {behind}\n\n"
            "Click a file or select it with the keyboard to load its diff."
        )

    def _render_changes(self, changes: Sequence[object]) -> None:
        change_list = self.query_one("#changes-list", SelectionList)
        change_list.clear_options()
        for change in changes:
            path = str(_value(change, "path", ""))
            original = str(_value(change, "original_path", ""))
            state = str(_value(change, "status", _value(change, "xy", "?")))
            staged = bool(_value(change, "is_staged", False))
            conflicted = bool(_value(change, "is_conflicted", False))
            prefix = "!" if conflicted else "+" if staged else "·"
            rename = f" ← {original}" if original else ""
            change_list.add_option((f"{prefix} [{state}] {path}{rename}", path, False))
        self._render_change_tree(changes)

    def _render_change_tree(self, changes: Sequence[object]) -> None:
        tree = self.query_one("#changes-tree", Tree)
        tree.clear()
        directories: dict[tuple[str, ...], Any] = {}
        by_path = {str(_value(change, "path", "")): change for change in changes}
        for entry in changed_path_entries(tuple(by_path)):
            change = by_path[entry.path]
            parent = tree.root
            if entry.grouped:
                for depth, segment in enumerate(entry.segments[:-1], start=1):
                    key = entry.segments[:depth]
                    node = directories.get(key)
                    if node is None:
                        node = parent.add(Text(segment), data=None, expand=True)
                        directories[key] = node
                    parent = node
            state = str(_value(change, "status", _value(change, "xy", "?")))
            staged = bool(_value(change, "is_staged", False))
            conflicted = bool(_value(change, "is_conflicted", False))
            prefix = "!" if conflicted else "+" if staged else "·"
            label = entry.segments[-1] if entry.grouped else entry.path
            parent.add_leaf(Text(f"{prefix} [{state}] {label}"), data=entry.path)
        tree.root.expand()

    @on(SearchBar.Changed, "#changes-search")
    def _filter_changes(self, event: SearchBar.Changed) -> None:
        self._render_changes(
            _filtered(
                self.changes,
                event.state,
                "path",
                "original_path",
                "status",
                "xy",
            )
        )

    @on(SelectionList.SelectionHighlighted, "#changes-list")
    def _change_highlighted(self, event: SelectionList.SelectionHighlighted[str]) -> None:
        self._load_diff(str(event.selection.value))

    @on(Tree.NodeHighlighted, "#changes-tree")
    def _tree_change_highlighted(self, event: Tree.NodeHighlighted[str | None]) -> None:
        if event.node.data is not None:
            self._load_diff(event.node.data)

    @on(Select.Changed, "#changes-file-view")
    def _change_file_view(self, event: Select.Changed) -> None:
        if not isinstance(event.value, str):
            return
        self.file_view_mode = event.value
        self.query_one("#changes-list", SelectionList).display = event.value == "flat"
        self.query_one("#changes-tree", Tree).display = event.value == "tree"

    @on(Select.Changed, "#diff-word-mode")
    def _change_word_mode(self, event: Select.Changed) -> None:
        if isinstance(event.value, str):
            self.word_diff = event.value == "word"
            self._reload_current_diff()

    @on(Select.Changed, "#diff-context")
    def _change_diff_context(self, event: Select.Changed) -> None:
        if isinstance(event.value, str):
            self.diff_context_lines = int(event.value)
            self._reload_current_diff()

    @on(Select.Changed, "#diff-render-mode")
    def _change_diff_render_mode(self, event: Select.Changed) -> None:
        if isinstance(event.value, str):
            self.diff_render_mode = event.value
            if self.preview_mode == "code":
                self._show_preview("code")

    @on(Select.Changed, "#diff-preview-mode")
    def _change_preview_mode(self, event: Select.Changed) -> None:
        if isinstance(event.value, str):
            self.preview_mode = event.value
            self._reload_current_diff()

    @on(Markdown.LinkClicked, "#changes-markdown")
    def _block_markdown_link(self, event: Markdown.LinkClicked) -> None:
        event.stop()
        self.app.notify(
            f"Preview link was not opened: {event.href}",
            title="Safe Markdown preview",
        )

    def _reload_current_diff(self) -> None:
        if self.current_diff_path is not None:
            self._load_diff(self.current_diff_path)

    @work(exclusive=True, group="diff-load")
    async def _load_diff(self, path: str) -> None:
        diff = self.query_one("#changes-diff", TextArea)
        diff.text = f"Loading {path}…"
        self.current_diff_path = path
        if self.service is None:
            return
        try:
            result = await asyncio.to_thread(
                self.service.diff,
                (path,),
                context_lines=self.diff_context_lines,
                word_diff=self.word_diff,
            )
            text = str(_value(result, "text", _value(result, "patch", result)))
            staged_mode = False
            if not text.strip():
                staged = await asyncio.to_thread(
                    self.service.diff,
                    (path,),
                    staged=True,
                    context_lines=self.diff_context_lines,
                    word_diff=self.word_diff,
                )
                text = str(_value(staged, "text", _value(staged, "patch", staged)))
                staged_mode = True
            self.current_diff_text = text or "No textual diff is available for this file."
            self.current_diff_staged = staged_mode
            await self._render_current_preview(path)
        except Exception as error:
            diff.text = str(error)
            self._error("Load diff", error)

    async def _render_current_preview(self, path: str) -> None:
        self._set_code_text(self.current_diff_text)
        if self.preview_mode == "table":
            await self._render_structured_preview(path)
        elif self.preview_mode == "markdown":
            await self._render_markdown_preview(path)
        elif self.preview_mode == "image":
            await self._render_image_preview(path)
        self._show_preview(self.preview_mode)

    def _set_code_text(self, text: str) -> None:
        self.query_one("#changes-diff", TextArea).text = text
        syntax_log = self.query_one("#changes-syntax-diff", RichLog)
        syntax_log.clear()
        syntax_log.write(
            Syntax(
                text,
                "diff",
                theme="ansi_dark",
                line_numbers=True,
                word_wrap=False,
            )
        )

    def _show_preview(self, preview: str) -> None:
        plain_code = preview == "code" and self.diff_render_mode == "plain"
        syntax_code = preview == "code" and self.diff_render_mode == "syntax"
        self.query_one("#changes-diff", TextArea).display = plain_code
        self.query_one("#changes-syntax-diff", RichLog).display = syntax_code
        self.query_one("#changes-structured-table", DataTable).display = preview == "table"
        self.query_one("#changes-markdown", Markdown).display = preview == "markdown"
        self.query_one("#changes-image-preview", VerticalScroll).display = preview == "image"

    async def _preview_versions(
        self,
        path: str,
        *,
        max_bytes: int,
    ) -> tuple[bytes | None, bytes | None]:
        service = self.service
        if service is None:
            return None, None
        return await asyncio.to_thread(
            service.diff_file_versions,
            path,
            staged=self.current_diff_staged,
            max_bytes=max_bytes,
        )

    async def _render_structured_preview(self, path: str) -> None:
        table = self.query_one("#changes-structured-table", DataTable)
        table.clear(columns=True)
        suffix = path.casefold().rsplit(".", 1)[-1] if "." in path else ""
        if suffix not in {"csv", "tsv"}:
            table.add_column("Structured preview")
            table.add_row("Available only for bounded UTF-8 .csv and .tsv files.")
            return
        try:
            before, after = await self._preview_versions(
                path,
                max_bytes=MAX_TEXT_PREVIEW_BYTES,
            )
            model = structured_diff(
                before,
                after,
                delimiter="," if suffix == "csv" else "\t",
            )
        except Exception as error:
            table.add_column("Structured preview unavailable")
            table.add_row(str(error))
            return
        table.add_columns(
            "Change",
            "Before row",
            "After row",
            *(f"Column {index}" for index in range(1, model.column_count + 1)),
        )
        for row_index, row in enumerate(model.rows):
            before_cells = row.before or ()
            after_cells = row.after or ()
            cells: list[str] = []
            for column in range(model.column_count):
                before_cell = before_cells[column] if column < len(before_cells) else ""
                after_cell = after_cells[column] if column < len(after_cells) else ""
                cells.append(
                    before_cell
                    if before_cell == after_cell
                    else f"{before_cell} → {after_cell}"
                )
            table.add_row(
                row.status,
                "—" if row.before_index is None else str(row.before_index + 1),
                "—" if row.after_index is None else str(row.after_index + 1),
                *cells,
                key=str(row_index),
            )

    async def _render_markdown_preview(self, path: str) -> None:
        markdown = self.query_one("#changes-markdown", Markdown)
        if not path.casefold().endswith((".md", ".markdown")):
            await markdown.update(
                "# Preview unavailable\n\nSafe Markdown preview is available only for "
                "bounded UTF-8 `.md` and `.markdown` files."
            )
            return
        try:
            before, after = await self._preview_versions(
                path,
                max_bytes=MAX_TEXT_PREVIEW_BYTES,
            )
            selected = after if after is not None else before
            side = "after" if after is not None else "before (deleted file)"
            content = decode_text_preview(selected, label=f"{side} Markdown")
        except Exception as error:
            await markdown.update(f"# Preview unavailable\n\n`{error}`")
            return
        await markdown.update(content or "_This Markdown side is empty._")

    async def _render_image_preview(self, path: str) -> None:
        before_widget = self.query_one("#changes-image-before", Static)
        after_widget = self.query_one("#changes-image-after", Static)
        status = self.query_one("#changes-image-status", Static)
        if not path.casefold().endswith(".png"):
            before_widget.update("No PNG before image.")
            after_widget.update("No PNG after image.")
            status.update(
                "Terminal image preview supports bounded 8-bit RGB/RGBA PNG only. "
                "TGA and SVG remain unavailable."
            )
            return
        try:
            before, after = await self._preview_versions(path, max_bytes=MAX_PNG_BYTES)
            self._update_png_side(before_widget, before, missing="Added file: no before image.")
            self._update_png_side(after_widget, after, missing="Deleted file: no after image.")
        except Exception as error:
            before_widget.update("PNG preview unavailable.")
            after_widget.update("PNG preview unavailable.")
            status.update(str(error))
            return
        status.update(
            "Rendered locally from exact bounded Git/worktree bytes; no file was executed "
            "and no network resource was loaded."
        )

    @staticmethod
    def _update_png_side(widget: Static, payload: bytes | None, *, missing: str) -> None:
        if payload is None:
            widget.update(missing)
            return
        picture = decode_png_bytes(payload, columns=32, terminal_rows=10)
        widget.update(render_terminal_picture(picture))

    def _selected_paths(self) -> tuple[str, ...]:
        if self.file_view_mode == "tree":
            tree = self.query_one("#changes-tree", Tree)
            data = tree.cursor_node.data if tree.cursor_node is not None else None
            return (str(data),) if data is not None else ()
        return tuple(self.query_one("#changes-list", SelectionList).selected)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "changes-refresh":
            self.reload()
        elif button_id == "changes-stage":
            self._stage()
        elif button_id == "changes-unstage":
            self._unstage()
        elif button_id == "changes-discard":
            self._confirm_discard()
        elif button_id in {"commit-submit", "commit-push"}:
            self._commit(push=button_id == "commit-push")

    @work(exclusive=True, group="changes-mutate")
    async def _stage(self) -> None:
        paths = self._selected_paths()
        if not paths:
            self.app.notify("Select one or more files first.", severity="warning")
            return
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Stage files",
            lambda: service.stage(paths),
            success="Files staged.",
        )

    @work(exclusive=True, group="changes-mutate")
    async def _unstage(self) -> None:
        paths = self._selected_paths()
        if not paths:
            self.app.notify("Select one or more files first.", severity="warning")
            return
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Unstage files",
            lambda: service.unstage(paths),
            success="Files unstaged.",
        )

    def _confirm_discard(self) -> None:
        paths = self._selected_paths()
        if not paths:
            self.app.notify("Select one or more files first.", severity="warning")
            return

        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._discard(paths)

        self.app.push_screen(
            DecisionDialog(
                "Discard selected changes?",
                "This restores the selected paths from Git. Uncommitted content may be lost.",
                confirm_label="Discard",
                destructive=True,
                typed_confirmation="discard",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="changes-mutate")
    async def _discard(self, paths: Sequence[str]) -> None:
        if self.service is None:
            return
        discard = getattr(self.service, "discard", None)
        if not callable(discard):
            self.app.notify(
                "Discard is not available in this backend build.",
                severity="error",
            )
            return
        await self._mutate(
            "Discard changes",
            lambda: discard(tuple(paths)),
            success="Selected changes discarded.",
        )

    @work(exclusive=True, group="commit")
    async def _commit(self, *, push: bool) -> None:
        if self.service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        summary = self.query_one("#commit-summary", Input).value.strip()
        body = self.query_one("#commit-body", TextArea).text.strip()
        co_authors = tuple(
            value.strip()
            for value in self.query_one("#commit-coauthors", Input).value.split(";")
            if value.strip()
        )
        amend = self.query_one("#commit-amend", Checkbox).value
        signoff = self.query_one("#commit-signoff", Checkbox).value
        if not summary:
            self.app.notify("A commit summary is required.", severity="warning")
            self.query_one("#commit-summary", Input).focus()
            return
        try:
            await asyncio.to_thread(
                self.service.commit,
                summary,
                body or None,
                amend=amend,
                signoff=signoff,
                co_authors=co_authors,
            )
            if push:
                await asyncio.to_thread(self.service.push)
        except Exception as error:
            self._error("Commit and push" if push else "Commit", error)
            return
        self.query_one("#commit-summary", Input).value = ""
        self.query_one("#commit-body", TextArea).text = ""
        self.query_one("#commit-coauthors", Input).value = ""
        self.app.notify(
            "Commit created and pushed." if push else "Commit created.",
            title="Done",
        )
        refresh_all = getattr(self.app, "refresh_repository", None)
        if callable(refresh_all):
            refresh_all()


class HistoryPane(RepositoryPane):
    """Browsable commit history and commit details."""

    commits: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.commits = []

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="history",
            placeholder="Search commits, authors, hashes…",
            id="history-search",
        )
        with ResponsiveFormRow():
            yield Input(
                placeholder="Repository file path for history or blame",
                id="history-file-path",
                select_on_focus=False,
            )
            yield Button("File history", id="history-file")
            yield Button("Blame", id="history-blame")
        with ScrollableToolbar():
            yield Button("Refresh", id="history-refresh")
            yield Button("Copy hash", id="history-copy")
            yield Button("Revert…", id="history-revert")
            yield Button("Cherry-pick…", id="history-cherry-pick")
        with Horizontal(classes="screen-split"):
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="history-table",
                classes="screen-list",
            )
            yield TextArea(
                "Select a commit to inspect it.",
                read_only=True,
                show_line_numbers=False,
                soft_wrap=True,
                id="history-detail",
                classes="screen-detail",
            )

    def on_mount(self) -> None:
        table = self.query_one("#history-table", DataTable)
        table.add_columns("Commit", "Message", "Author", "When")

    @work(exclusive=True, group="history-load")
    async def reload(self) -> None:
        table = self.query_one("#history-table", DataTable)
        detail = self.query_one("#history-detail", TextArea)
        table.clear()
        self.commits = []
        detail.text = "Loading history…"
        if self.service is None:
            detail.text = "Open a repository to view history."
            return
        try:
            self.commits = list(await asyncio.to_thread(self.service.history, limit=250))
        except Exception as error:
            detail.text = str(error)
            self._error("Load history", error)
            return
        for index, commit in enumerate(self.commits):
            self._add_commit_row(table, index, commit)
        detail.text = (
            "No commits found."
            if not self.commits
            else "Click a commit row or press Enter to inspect its details."
        )

    def _add_commit_row(self, table: DataTable[str], index: int, commit: object) -> None:
        subject = str(
            _value(
                commit,
                "subject",
                _value(commit, "summary", _value(commit, "message", "")),
            )
        )
        table.add_row(
            _short_oid(commit),
            subject.splitlines()[0] if subject.splitlines() else "(no subject)",
            str(_value(commit, "author_name", _value(commit, "author", ""))),
            str(_value(commit, "authored_at", _value(commit, "date", ""))),
            key=str(index),
        )

    @on(SearchBar.Changed, "#history-search")
    def _filter_history(self, event: SearchBar.Changed) -> None:
        table = self.query_one("#history-table", DataTable)
        table.clear()
        filtered = _filtered(
            self.commits,
            event.state,
            "oid",
            "subject",
            "body",
            "author_name",
            "author_email",
        )
        original_indices = {id(commit): index for index, commit in enumerate(self.commits)}
        for commit in filtered:
            self._add_commit_row(table, original_indices[id(commit)], commit)

    @on(DataTable.RowHighlighted, "#history-table")
    def _history_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            commit = self.commits[int(source_key)]
        except (ValueError, IndexError, TypeError):
            return
        parents = _value(commit, "parents", ())
        if isinstance(parents, str):
            parents_text = parents
        else:
            parents_text = ", ".join(str(parent)[:10] for parent in parents)
        detail = self.query_one("#history-detail", TextArea)
        detail.text = (
            f"Commit: {_value(commit, 'oid', _value(commit, 'sha', ''))}\n"
            f"Author: {_value(commit, 'author_name', _value(commit, 'author', ''))} "
            f"<{_value(commit, 'author_email', '')}>\n"
            f"Date: {_value(commit, 'authored_at', _value(commit, 'date', ''))}\n"
            f"Parents: {parents_text or 'root'}\n\n"
            f"{_value(commit, 'subject', _value(commit, 'summary', ''))}\n\n"
            f"{_value(commit, 'body', _value(commit, 'message', ''))}"
        )

    def _selected_commit(self) -> object | None:
        table = self.query_one("#history-table", DataTable)
        source_index = _selected_source_index(table)
        if source_index is None or not (0 <= source_index < len(self.commits)):
            return None
        return self.commits[source_index]

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "history-refresh":
            self.reload()
        elif button_id == "history-file":
            self._load_file_history()
        elif button_id == "history-blame":
            self._load_blame()
        elif button_id == "history-copy":
            commit = self._selected_commit()
            if commit is not None:
                oid = str(_value(commit, "oid", _value(commit, "sha", "")))
                self.app.copy_to_clipboard(oid)
                self.app.notify("Commit hash copied.")
        elif button_id in {"history-revert", "history-cherry-pick"}:
            commit = self._selected_commit()
            if commit is None:
                self.app.notify("Select a commit first.", severity="warning")
                return
            self._confirm_commit_action(
                commit,
                cherry_pick=button_id == "history-cherry-pick",
            )

    def _history_path(self) -> str | None:
        path_input = self.query_one("#history-file-path", Input)
        path = path_input.value.strip()
        if not path:
            self.app.notify("Enter a repository file path first.", severity="warning")
            path_input.focus()
            return None
        return path

    @work(exclusive=True, group="history-load")
    async def _load_file_history(self) -> None:
        path = self._history_path()
        if path is None or self.service is None:
            return
        table = self.query_one("#history-table", DataTable)
        detail = self.query_one("#history-detail", TextArea)
        detail.text = f"Loading history for {path}…"
        try:
            self.commits = list(
                await asyncio.to_thread(self.service.file_history, path, limit=250)
            )
        except Exception as error:
            self._error("Load file history", error)
            return
        table.clear()
        for index, commit in enumerate(self.commits):
            self._add_commit_row(table, index, commit)
        detail.text = (
            f"No commits found for {path}."
            if not self.commits
            else f"Showing {len(self.commits)} commit(s) for {path}."
        )

    @work(exclusive=True, group="history-blame")
    async def _load_blame(self) -> None:
        path = self._history_path()
        if path is None or self.service is None:
            return
        detail = self.query_one("#history-detail", TextArea)
        detail.text = f"Loading blame for {path}…"
        try:
            detail.text = await asyncio.to_thread(self.service.blame, path)
        except Exception as error:
            detail.text = str(error)
            self._error("Load blame", error)

    def _confirm_commit_action(self, commit: object, *, cherry_pick: bool) -> None:
        oid = str(_value(commit, "oid", _value(commit, "sha", "")))
        subject = str(_value(commit, "subject", _value(commit, "summary", "")))
        action = "Cherry-pick" if cherry_pick else "Revert"

        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._run_commit_action(oid, cherry_pick=cherry_pick)

        self.app.push_screen(
            DecisionDialog(
                f"{action} selected commit?",
                f"Commit: `{oid}`\n\nSubject: {subject}\n\n"
                "Git will create a new commit. If conflicts occur, they remain visible "
                "on the Changes page for explicit resolution.",
                confirm_label=action,
            ),
            resolved,
        )

    @work(exclusive=True, group="history-mutate")
    async def _run_commit_action(self, oid: str, *, cherry_pick: bool) -> None:
        service = self.service
        if service is None:
            return
        action = "Cherry-pick" if cherry_pick else "Revert"
        operation = service.cherry_pick_commit if cherry_pick else service.revert_commit
        await self._mutate(
            action,
            lambda: operation(oid),
            success=f"{action} created a new commit from {oid[:10]}.",
        )


class BranchesPane(RepositoryPane):
    """Branch browsing and guarded branch operations."""

    branches: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.branches = []
        self.sort_mode = "activity"

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="branches",
            placeholder="Filter local and remote branches…",
            id="branches-search",
        )
        with ScrollableToolbar():
            yield Button("Refresh", id="branches-refresh")
            yield Select(
                (("Last activity", "activity"), ("Alphabetical", "alphabetical")),
                value="activity",
                allow_blank=False,
                id="branches-sort",
            )
            yield Button("Checkout", id="branches-checkout", variant="primary")
            yield Button("Preview merge…", id="branches-merge")
            yield Button("Delete…", id="branches-delete", variant="error")
        with Horizontal(classes="screen-split"):
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="branches-table",
                classes="screen-list",
            )
            with Vertical(classes="screen-detail", id="branch-detail"):
                yield Static("Select a branch.")
                yield Label("Create branch", classes="field-label")
                yield Input(
                    placeholder="new-branch-name",
                    id="branch-name",
                    select_on_focus=False,
                )
                yield Input(
                    placeholder="start point (optional)",
                    id="branch-start",
                    select_on_focus=False,
                )
                yield Button("Create & checkout", id="branch-create", variant="primary")
                yield Label("Rename selected branch", classes="field-label")
                yield Input(
                    placeholder="new branch name",
                    id="branch-new-name",
                    select_on_focus=False,
                )
                yield Button("Rename selected", id="branch-rename")

    def on_mount(self) -> None:
        self.query_one("#branches-table", DataTable).add_columns(
            "Current",
            "Branch",
            "Type",
            "Upstream",
            "Ahead",
            "Behind",
            "Publish",
        )

    @work(exclusive=True, group="branches-load")
    async def reload(self) -> None:
        table = self.query_one("#branches-table", DataTable)
        table.clear()
        self.branches = []
        if self.service is None:
            return
        try:
            self.branches = list(await asyncio.to_thread(self.service.branches))
        except Exception as error:
            self._error("Load branches", error)
            return
        self._render_branches(self.branches)

    def _add_branch_row(self, table: DataTable[str], index: int, branch: object) -> None:
        table.add_row(
            "●" if _value(branch, "is_current", False) else "",
            str(_value(branch, "name", "")),
            "remote" if _value(branch, "is_remote", False) else "local",
            str(_value(branch, "upstream", "")),
            str(_value(branch, "ahead", "")),
            str(_value(branch, "behind", "")),
            self._publish_state(branch),
            key=str(index),
        )

    @staticmethod
    def _publish_state(branch: object) -> str:
        if _value(branch, "is_remote", False):
            return "remote"
        if _value(branch, "upstream_gone", False):
            return "upstream gone"
        if not _value(branch, "upstream", None):
            return "local only"
        return "published"

    def _ordered_branches(self, branches: Sequence[object]) -> tuple[object, ...]:
        if self.sort_mode == "alphabetical":
            return tuple(
                sorted(branches, key=lambda branch: str(_value(branch, "name", "")).casefold())
            )

        def activity(branch: object) -> float:
            committed_at = _value(branch, "committed_at", None)
            timestamp = getattr(committed_at, "timestamp", None)
            return float(timestamp()) if callable(timestamp) else float("-inf")

        return tuple(
            sorted(
                branches,
                key=lambda branch: (
                    -activity(branch),
                    str(_value(branch, "name", "")).casefold(),
                ),
            )
        )

    def _render_branches(self, branches: Sequence[object]) -> None:
        table = self.query_one("#branches-table", DataTable)
        table.clear()
        original_indices = {id(branch): index for index, branch in enumerate(self.branches)}
        for branch in self._ordered_branches(branches):
            self._add_branch_row(table, original_indices[id(branch)], branch)

    @on(SearchBar.Changed, "#branches-search")
    def _filter_branches(self, event: SearchBar.Changed) -> None:
        filtered = _filtered(
            self.branches,
            event.state,
            "name",
            "upstream",
            "oid",
            "sha",
        )
        self._render_branches(filtered)

    @on(Select.Changed, "#branches-sort")
    def _sort_branches(self, event: Select.Changed) -> None:
        value = event.value
        if isinstance(value, str) and value in {"activity", "alphabetical"}:
            self.sort_mode = value
            self._render_branches(self.branches)

    def _selected(self) -> object | None:
        table = self.query_one("#branches-table", DataTable)
        source_index = _selected_source_index(table)
        if source_index is None or not (0 <= source_index < len(self.branches)):
            return None
        return self.branches[source_index]

    @on(DataTable.RowHighlighted, "#branches-table")
    def _branch_highlighted(self, event: DataTable.RowHighlighted) -> None:
        branch = self._selected()
        if branch is None:
            return
        self.query_one("#branch-detail Static", Static).update(
            f"[b]{escape(str(_value(branch, 'name', '')))}[/]\n\n"
            f"Upstream: {escape(str(_value(branch, 'upstream', '—')))}\n"
            f"Tip: {escape(str(_value(branch, 'oid', _value(branch, 'sha', ''))))}\n"
            f"Ahead: {_value(branch, 'ahead', 0)}   Behind: {_value(branch, 'behind', 0)}\n"
            f"Publish: {self._publish_state(branch)}"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "branches-refresh":
            self.reload()
        elif button_id == "branch-create":
            self._create_branch()
        elif button_id == "branch-rename":
            branch = self._selected()
            if branch is None:
                self.app.notify("Select a branch first.", severity="warning")
                return
            self._rename_branch(str(_value(branch, "name", "")))
        elif button_id in {"branches-checkout", "branches-merge", "branches-delete"}:
            branch = self._selected()
            if branch is None:
                self.app.notify("Select a branch first.", severity="warning")
                return
            name = str(_value(branch, "name", ""))
            if button_id == "branches-checkout":
                self._checkout(name)
            elif button_id == "branches-merge":
                self._preview_merge(name)
            else:
                self._confirm_delete(name)

    @work(exclusive=True, group="branches-mutate")
    async def _create_branch(self) -> None:
        name = self.query_one("#branch-name", Input).value.strip()
        start = self.query_one("#branch-start", Input).value.strip() or None
        if not name:
            self.app.notify("Enter a branch name.", severity="warning")
            return
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        if await self._mutate(
            "Create branch",
            lambda: service.create_branch(name, start),
            success=f"Created and checked out {name}.",
        ):
            self.query_one("#branch-name", Input).value = ""
            self.query_one("#branch-start", Input).value = ""

    @work(exclusive=True, group="branches-mutate")
    async def _checkout(self, name: str) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Checkout branch",
            lambda: service.checkout_branch(name),
            success=f"Checked out {name}.",
        )

    @work(exclusive=True, group="branches-mutate")
    async def _preview_merge(self, name: str) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        self.app.notify("Computing merge preview…", title="Working")
        try:
            preview = await asyncio.to_thread(service.merge_preview, name)
        except Exception as error:
            self._error("Preview merge", error)
            return
        conflict_lines = (
            "\n".join(f"- `{path}`" for path in preview.conflicting_paths)
            if preview.conflicting_paths
            else "- None detected"
        )
        file_lines = "\n".join(f"- `{path}`" for path in preview.changed_files[:25])
        commit_lines = "\n".join(
            f"- `{commit.oid[:10]}` {commit.subject}"
            for commit in preview.incoming_commits[:25]
        )

        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._apply_merge_preview(preview)

        self.app.push_screen(
            DecisionDialog(
                f"Merge {preview.source_branch} into {preview.current_branch}?",
                f"Current: `{preview.current_oid}`\n\n"
                f"Source: `{preview.source_oid}`\n\n"
                f"Merge base: `{preview.merge_base_oid}`\n\n"
                f"Conflicting paths\n{conflict_lines}\n\n"
                f"Incoming commits\n{commit_lines or '- None'}\n\n"
                f"Changed files\n{file_lines or '- None'}\n\n"
                "Confirmation revalidates both reviewed tips. Detected conflicts may "
                "leave the repository in a merge state for resolution on Changes.",
                confirm_label="Merge reviewed tips",
            ),
            resolved,
        )

    @work(exclusive=True, group="branches-mutate")
    async def _apply_merge_preview(self, preview: object) -> None:
        service = self.service
        if service is None:
            return
        await self._mutate(
            "Merge reviewed branch",
            lambda: service.apply_merge_preview(preview),
            success=f"Merged {_value(preview, 'source_branch', 'reviewed branch')}.",
        )

    @work(exclusive=True, group="branches-mutate")
    async def _rename_branch(self, old_name: str) -> None:
        service = self.service
        if service is None:
            return
        name_input = self.query_one("#branch-new-name", Input)
        new_name = name_input.value.strip()
        if not new_name:
            self.app.notify("Enter the new branch name.", severity="warning")
            name_input.focus()
            return
        if await self._mutate(
            "Rename branch",
            lambda: service.rename_branch(old_name, new_name),
            success=f"Renamed {old_name} to {new_name}.",
        ):
            name_input.value = ""

    def _confirm_delete(self, name: str) -> None:
        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._delete(name)

        self.app.push_screen(
            DecisionDialog(
                f"Delete branch {name}?",
                "Git will refuse a normal delete if the branch is not fully merged.",
                confirm_label="Delete",
                destructive=True,
            ),
            handle_decision,
        )

    @work(exclusive=True, group="branches-mutate")
    async def _delete(self, name: str) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Delete branch",
            lambda: service.delete_branch(name),
            success=f"Deleted {name}.",
        )


class StashesPane(RepositoryPane):
    """Create, inspect, apply, pop, and delete Git stashes."""

    DEFAULT_CSS = """
    StashesPane #stash-paths {
        height: 4;
    }

    StashesPane #stash-detail {
        height: 1fr;
        min-height: 5;
    }
    """

    stashes: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.stashes = []

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="stashes",
            placeholder="Filter stashes…",
            id="stashes-search",
        )
        with ScrollableToolbar():
            yield Button("Refresh", id="stashes-refresh")
            yield Button("Apply", id="stashes-apply")
            yield Button("Pop", id="stashes-pop", variant="primary")
            yield Button("Branch from", id="stashes-branch")
            yield Button("Drop…", id="stashes-drop", variant="error")
        with Horizontal(classes="screen-split"):
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="stashes-table",
                classes="screen-list",
            )
            with Vertical(classes="screen-detail"):
                yield Label("Create stash", classes="field-label")
                yield Input(
                    placeholder="Message (optional)",
                    id="stash-message",
                    select_on_focus=False,
                )
                yield Input(
                    placeholder="New branch name for selected stash",
                    id="stash-branch-name",
                    select_on_focus=False,
                )
                yield TextArea(
                    "",
                    placeholder="Selective stash paths, one repository path per line",
                    id="stash-paths",
                    soft_wrap=False,
                    tab_behavior="focus",
                )
                yield Checkbox("Include untracked files", id="stash-untracked")
                yield Checkbox("Keep staged changes", id="stash-keep-index")
                yield Button("Stash changes", id="stash-create", variant="primary")
                yield Static(
                    "\nSelective paths are reviewed before Git runs. "
                    "Applying keeps the stash; Pop removes it only after Git applies it.",
                    classes="help-copy",
                )
                yield TextArea(
                    "Select a stash to inspect its exact object and patch.",
                    read_only=True,
                    show_line_numbers=False,
                    soft_wrap=False,
                    id="stash-detail",
                )

    def on_mount(self) -> None:
        self.query_one("#stashes-table", DataTable).add_columns("Ref", "Branch", "Message", "When")

    @work(exclusive=True, group="stashes-load")
    async def reload(self) -> None:
        table = self.query_one("#stashes-table", DataTable)
        table.clear()
        self.stashes = []
        if self.service is None:
            return
        try:
            self.stashes = list(await asyncio.to_thread(self.service.stashes))
        except Exception as error:
            self._error("Load stashes", error)
            return
        for index, stash in enumerate(self.stashes):
            self._add_stash_row(table, index, stash)

    def _add_stash_row(self, table: DataTable[str], index: int, stash: object) -> None:
        table.add_row(
            str(_value(stash, "ref", f"stash@{{{index}}}")),
            str(_value(stash, "branch", "")),
            str(_value(stash, "message", "")),
            str(_value(stash, "created_at", _value(stash, "date", ""))),
            key=str(index),
        )

    @on(SearchBar.Changed, "#stashes-search")
    def _filter_stashes(self, event: SearchBar.Changed) -> None:
        table = self.query_one("#stashes-table", DataTable)
        table.clear()
        filtered = _filtered(self.stashes, event.state, "ref", "branch", "message")
        original_indices = {id(stash): index for index, stash in enumerate(self.stashes)}
        for stash in filtered:
            self._add_stash_row(table, original_indices[id(stash)], stash)

    def _selected_stash(self) -> object | None:
        table = self.query_one("#stashes-table", DataTable)
        source_index = _selected_source_index(table)
        if source_index is None or not (0 <= source_index < len(self.stashes)):
            return None
        return self.stashes[source_index]

    @on(DataTable.RowHighlighted, "#stashes-table")
    def _stash_highlighted(self, _event: DataTable.RowHighlighted) -> None:
        stash = self._selected_stash()
        if stash is not None:
            self._load_stash_detail(
                str(_value(stash, "ref", "stash@{0}")),
                str(_value(stash, "oid", "")),
            )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "stashes-refresh":
            self.reload()
        elif button_id == "stash-create":
            self._confirm_create()
        elif button_id in {
            "stashes-apply",
            "stashes-pop",
            "stashes-branch",
            "stashes-drop",
        }:
            stash = self._selected_stash()
            if stash is None:
                self.app.notify("Select a stash first.", severity="warning")
                return
            ref = str(_value(stash, "ref", ""))
            oid = str(_value(stash, "oid", ""))
            if button_id == "stashes-apply":
                self._apply(ref, oid, pop=False)
            elif button_id == "stashes-pop":
                self._apply(ref, oid, pop=True)
            elif button_id == "stashes-branch":
                self._branch_from(ref, oid)
            else:
                self._confirm_drop(ref, oid)

    def _selective_paths(self) -> tuple[str, ...]:
        return tuple(
            line.strip()
            for line in self.query_one("#stash-paths", TextArea).text.splitlines()
            if line.strip()
        )

    def _confirm_create(self) -> None:
        paths = self._selective_paths()
        if not paths:
            self._create(())
            return

        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._create(paths)

        reviewed = "\n".join(f"- `{path}`" for path in paths)
        self.app.push_screen(
            DecisionDialog(
                f"Stash exactly {len(paths)} reviewed path(s)?",
                f"Only these repository-bound whole files will be stashed:\n\n{reviewed}",
                confirm_label="Stash reviewed paths",
            ),
            resolved,
        )

    @work(exclusive=True, group="stashes-mutate")
    async def _create(self, paths: Sequence[str]) -> None:
        message = self.query_one("#stash-message", Input).value.strip() or None
        include_untracked = self.query_one("#stash-untracked", Checkbox).value
        keep_index = self.query_one("#stash-keep-index", Checkbox).value
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        if await self._mutate(
            "Create stash",
            lambda: service.stash_push(
                message,
                include_untracked=include_untracked,
                keep_index=keep_index,
                paths=tuple(paths),
            ),
            success="Changes stashed.",
        ):
            self.query_one("#stash-message", Input).value = ""
            self.query_one("#stash-paths", TextArea).text = ""

    @work(exclusive=True, group="stashes-mutate")
    async def _apply(self, ref: str, oid: str, *, pop: bool) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Pop stash" if pop else "Apply stash",
            lambda: service.stash_apply(ref, pop=pop, expected_oid=oid),
            success=f"{'Popped' if pop else 'Applied'} {ref}.",
        )

    def _confirm_drop(self, ref: str, oid: str) -> None:
        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._drop(ref, oid)

        self.app.push_screen(
            DecisionDialog(
                f"Drop {ref}?",
                "Dropped stash content is difficult to recover.",
                confirm_label="Drop",
                destructive=True,
                typed_confirmation="drop",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="stashes-mutate")
    async def _drop(self, ref: str, oid: str) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Drop stash",
            lambda: service.stash_drop(ref, expected_oid=oid),
            success=f"Dropped {ref}.",
        )

    @work(exclusive=True, group="stash-detail")
    async def _load_stash_detail(self, ref: str, oid: str) -> None:
        service = self.service
        if service is None:
            return
        detail = self.query_one("#stash-detail", TextArea)
        detail.text = f"Loading {ref} ({oid})…"
        try:
            patch = await asyncio.to_thread(
                service.stash_diff,
                ref,
                expected_oid=oid,
            )
            detail.text = f"Object: {oid}\n\n{patch or 'No textual changes.'}"
        except Exception as error:
            detail.text = str(error)
            self._error("Inspect stash", error)

    @work(exclusive=True, group="stashes-mutate")
    async def _branch_from(self, ref: str, oid: str) -> None:
        service = self.service
        if service is None:
            return
        name_input = self.query_one("#stash-branch-name", Input)
        branch = name_input.value.strip()
        if not branch:
            self.app.notify("Enter a new branch name first.", severity="warning")
            name_input.focus()
            return
        if await self._mutate(
            "Create branch from stash",
            lambda: service.stash_branch(branch, ref, expected_oid=oid),
            success=f"Created {branch} from {ref}.",
        ):
            name_input.value = ""


class RepositoryToolsPane(RepositoryPane):
    """Remote, tag, and repository diagnostics surface."""

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="repository-tools",
            placeholder="Search remotes, tags, diagnostics…",
            id="tools-search",
        )
        with ScrollableToolbar():
            yield Button("Refresh", id="tools-refresh")
            yield Button("Copy repository path", id="tools-copy-path")
            yield Button("Open external editor", id="tools-editor", variant="primary")
        with Horizontal(classes="screen-split"):
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="remotes-table",
                classes="screen-list",
            )
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="tags-table",
                classes="screen-detail",
            )
        with Vertical(classes="form-panel", id="tag-form"):
            yield Label("Create tag on a commit", classes="field-label")
            with ResponsiveFormRow():
                yield Input(
                    placeholder="tag name",
                    id="tag-name",
                    select_on_focus=False,
                )
                yield Input(
                    placeholder="target commit (defaults to HEAD)",
                    id="tag-target",
                    select_on_focus=False,
                )
                yield Input(
                    placeholder="annotation (blank creates lightweight tag)",
                    id="tag-message",
                    select_on_focus=False,
                )
            with ScrollableToolbar():
                yield Button("Create tag", id="tag-create", variant="primary")
                yield Button("Delete selected…", id="tag-delete", variant="error")

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.remotes_data: list[object] = []
        self.tags_data: list[object] = []

    def on_mount(self) -> None:
        self.query_one("#remotes-table", DataTable).add_columns("Remote", "Fetch", "Push")
        self.query_one("#tags-table", DataTable).add_columns("Tag", "Target", "Message")

    @work(exclusive=True, group="tools-load")
    async def reload(self) -> None:
        remote_table = self.query_one("#remotes-table", DataTable)
        tag_table = self.query_one("#tags-table", DataTable)
        remote_table.clear()
        tag_table.clear()
        if self.service is None:
            return
        try:
            remotes, tags = await asyncio.gather(
                asyncio.to_thread(self.service.remotes),
                asyncio.to_thread(self.service.tags),
            )
        except Exception as error:
            self._error("Load repository tools", error)
            return
        self.remotes_data = list(remotes)
        self.tags_data = list(tags)
        self._render_tools(self.remotes_data, self.tags_data)

    def _render_tools(
        self,
        remotes: Sequence[object],
        tags: Sequence[object],
    ) -> None:
        remote_table = self.query_one("#remotes-table", DataTable)
        tag_table = self.query_one("#tags-table", DataTable)
        remote_table.clear()
        tag_table.clear()
        for remote in remotes:
            remote_table.add_row(
                str(_value(remote, "name", "")),
                str(_value(remote, "fetch_url", _value(remote, "url", ""))),
                str(_value(remote, "push_url", _value(remote, "url", ""))),
            )
        tag_indices = {id(tag): index for index, tag in enumerate(self.tags_data)}
        for tag in tags:
            tag_table.add_row(
                str(_value(tag, "name", "")),
                str(_value(tag, "target_oid", _value(tag, "oid", "")))[:10],
                str(_value(tag, "subject", _value(tag, "message", ""))),
                key=str(tag_indices[id(tag)]),
            )

    @on(SearchBar.Changed, "#tools-search")
    def _filter_tools(self, event: SearchBar.Changed) -> None:
        remotes = _filtered(
            self.remotes_data,
            event.state,
            "name",
            "fetch_url",
            "push_url",
            "url",
        )
        tags = _filtered(self.tags_data, event.state, "name", "message", "oid", "sha")
        self._render_tools(remotes, tags)

    def _selected_tag(self) -> object | None:
        table = self.query_one("#tags-table", DataTable)
        source_index = _selected_source_index(table)
        if source_index is None or not (0 <= source_index < len(self.tags_data)):
            return None
        return self.tags_data[source_index]

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "tools-refresh":
            self.reload()
        elif event.button.id == "tools-copy-path" and self.service is not None:
            self.app.copy_to_clipboard(str(self.service.path))
            self.app.notify("Repository path copied.")
        elif event.button.id == "tools-editor":
            opener = getattr(self.app, "open_external_editor", None)
            if callable(opener):
                opener()
        elif event.button.id == "tag-create":
            self._create_tag()
        elif event.button.id == "tag-delete":
            tag = self._selected_tag()
            if tag is None:
                self.app.notify("Select a tag first.", severity="warning")
                return
            self._confirm_delete_tag(str(_value(tag, "name", "")))

    @work(exclusive=True, group="tags-mutate")
    async def _create_tag(self) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        name_input = self.query_one("#tag-name", Input)
        name = name_input.value.strip()
        target = self.query_one("#tag-target", Input).value.strip() or None
        message = self.query_one("#tag-message", Input).value.strip() or None
        if not name:
            self.app.notify("Enter a tag name.", severity="warning")
            name_input.focus()
            return
        if await self._mutate(
            "Create tag",
            lambda: service.create_tag(name, message=message, target=target),
            success=f"Created tag {name}.",
        ):
            name_input.value = ""
            self.query_one("#tag-target", Input).value = ""
            self.query_one("#tag-message", Input).value = ""

    def _confirm_delete_tag(self, name: str) -> None:
        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._delete_tag(name)

        self.app.push_screen(
            DecisionDialog(
                f"Delete local tag {name}?",
                "This deletes only the selected local tag. No remote tag is changed.",
                confirm_label="Delete local tag",
                destructive=True,
                typed_confirmation="delete-tag",
            ),
            resolved,
        )

    @work(exclusive=True, group="tags-mutate")
    async def _delete_tag(self, name: str) -> None:
        service = self.service
        if service is not None:
            await self._mutate(
                "Delete tag",
                lambda: service.delete_tag(name),
                success=f"Deleted local tag {name}.",
            )


REPOSITORY_PANES = (
    ChangesPane,
    HistoryPane,
    BranchesPane,
    StashesPane,
    RepositoryToolsPane,
)
