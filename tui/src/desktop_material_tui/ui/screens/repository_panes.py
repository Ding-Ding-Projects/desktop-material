"""Interactive repository workflow panes."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from typing import Any

from rich.markup import escape
from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import (
    Button,
    Checkbox,
    DataTable,
    Input,
    Label,
    SelectionList,
    Static,
    TextArea,
)
from textual.worker import Worker

from ...application.search import RegexFlags, SearchMode, SearchService
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

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.changes: list[object] = []

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
        with Horizontal(classes="screen-split"):
            yield SelectionList[str](id="changes-list", classes="screen-list")
            yield TextArea(
                "Select a changed file to inspect its diff.",
                read_only=True,
                show_line_numbers=True,
                soft_wrap=False,
                id="changes-diff",
                classes="screen-detail",
            )
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
                yield Checkbox("Amend last commit", id="commit-amend")
                yield Checkbox("Add Signed-off-by", id="commit-signoff")
                yield Button("Commit", id="commit-submit", variant="primary")
                yield Button("Commit & push", id="commit-push")

    @work(exclusive=True, group="changes-load")
    async def reload(self) -> None:
        change_list = self.query_one("#changes-list", SelectionList)
        diff = self.query_one("#changes-diff", TextArea)
        change_list.clear_options()
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

    @work(exclusive=True, group="diff-load")
    async def _load_diff(self, path: str) -> None:
        diff = self.query_one("#changes-diff", TextArea)
        diff.text = f"Loading {path}…"
        if self.service is None:
            return
        try:
            result = await asyncio.to_thread(self.service.diff, (path,))
            text = str(_value(result, "text", _value(result, "patch", result)))
            if not text.strip():
                staged = await asyncio.to_thread(self.service.diff, (path,), staged=True)
                text = str(_value(staged, "text", _value(staged, "patch", staged)))
            diff.text = text or "No textual diff is available for this file."
        except Exception as error:
            diff.text = str(error)
            self._error("Load diff", error)

    def _selected_paths(self) -> tuple[str, ...]:
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
            )
            if push:
                await asyncio.to_thread(self.service.push)
        except Exception as error:
            self._error("Commit and push" if push else "Commit", error)
            return
        self.query_one("#commit-summary", Input).value = ""
        self.query_one("#commit-body", TextArea).text = ""
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
        with ScrollableToolbar():
            yield Button("Refresh", id="history-refresh")
            yield Button("Copy hash", id="history-copy")
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

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "history-refresh":
            self.reload()
        elif event.button.id == "history-copy":
            table = self.query_one("#history-table", DataTable)
            source_index = _selected_source_index(table)
            if source_index is not None and 0 <= source_index < len(self.commits):
                commit = self.commits[source_index]
                oid = str(_value(commit, "oid", _value(commit, "sha", "")))
                self.app.copy_to_clipboard(oid)
                self.app.notify("Commit hash copied.")


class BranchesPane(RepositoryPane):
    """Branch browsing and guarded branch operations."""

    branches: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.branches = []

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="branches",
            placeholder="Filter local and remote branches…",
            id="branches-search",
        )
        with ScrollableToolbar():
            yield Button("Refresh", id="branches-refresh")
            yield Button("Checkout", id="branches-checkout", variant="primary")
            yield Button("Merge", id="branches-merge")
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

    def on_mount(self) -> None:
        self.query_one("#branches-table", DataTable).add_columns(
            "Current",
            "Branch",
            "Type",
            "Upstream",
            "Ahead",
            "Behind",
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
        for index, branch in enumerate(self.branches):
            self._add_branch_row(table, index, branch)

    def _add_branch_row(self, table: DataTable[str], index: int, branch: object) -> None:
        table.add_row(
            "●" if _value(branch, "is_current", False) else "",
            str(_value(branch, "name", "")),
            "remote" if _value(branch, "is_remote", False) else "local",
            str(_value(branch, "upstream", "")),
            str(_value(branch, "ahead", "")),
            str(_value(branch, "behind", "")),
            key=str(index),
        )

    @on(SearchBar.Changed, "#branches-search")
    def _filter_branches(self, event: SearchBar.Changed) -> None:
        table = self.query_one("#branches-table", DataTable)
        table.clear()
        filtered = _filtered(
            self.branches,
            event.state,
            "name",
            "upstream",
            "oid",
            "sha",
        )
        original_indices = {id(branch): index for index, branch in enumerate(self.branches)}
        for branch in filtered:
            self._add_branch_row(table, original_indices[id(branch)], branch)

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
            f"Ahead: {_value(branch, 'ahead', 0)}   Behind: {_value(branch, 'behind', 0)}"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "branches-refresh":
            self.reload()
        elif button_id == "branch-create":
            self._create_branch()
        elif button_id in {"branches-checkout", "branches-merge", "branches-delete"}:
            branch = self._selected()
            if branch is None:
                self.app.notify("Select a branch first.", severity="warning")
                return
            name = str(_value(branch, "name", ""))
            if button_id == "branches-checkout":
                self._checkout(name)
            elif button_id == "branches-merge":
                self._merge(name)
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
    async def _merge(self, name: str) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Merge branch",
            lambda: service.merge_branch(name),
            success=f"Merged {name}.",
        )

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
                yield Checkbox("Include untracked files", id="stash-untracked")
                yield Checkbox("Keep staged changes", id="stash-keep-index")
                yield Button("Stash changes", id="stash-create", variant="primary")
                yield Static(
                    "\nUse the Changes page selection before creating a selective stash. "
                    "Applying keeps the stash; Pop removes it only after Git applies it.",
                    classes="help-copy",
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

    def _selected_ref(self) -> str | None:
        table = self.query_one("#stashes-table", DataTable)
        source_index = _selected_source_index(table)
        if source_index is None or not (0 <= source_index < len(self.stashes)):
            return None
        return str(
            _value(
                self.stashes[source_index],
                "ref",
                f"stash@{{{source_index}}}",
            )
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "stashes-refresh":
            self.reload()
        elif button_id == "stash-create":
            self._create()
        elif button_id in {"stashes-apply", "stashes-pop", "stashes-drop"}:
            ref = self._selected_ref()
            if ref is None:
                self.app.notify("Select a stash first.", severity="warning")
                return
            if button_id == "stashes-apply":
                self._apply(ref, pop=False)
            elif button_id == "stashes-pop":
                self._apply(ref, pop=True)
            else:
                self._confirm_drop(ref)

    @work(exclusive=True, group="stashes-mutate")
    async def _create(self) -> None:
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
            ),
            success="Changes stashed.",
        ):
            self.query_one("#stash-message", Input).value = ""

    @work(exclusive=True, group="stashes-mutate")
    async def _apply(self, ref: str, *, pop: bool) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Pop stash" if pop else "Apply stash",
            lambda: service.stash_apply(ref, pop=pop),
            success=f"{'Popped' if pop else 'Applied'} {ref}.",
        )

    def _confirm_drop(self, ref: str) -> None:
        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._drop(ref)

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
    async def _drop(self, ref: str) -> None:
        service = self.service
        if service is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        await self._mutate(
            "Drop stash",
            lambda: service.stash_drop(ref),
            success=f"Dropped {ref}.",
        )


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
        for tag in tags:
            tag_table.add_row(
                str(_value(tag, "name", "")),
                _short_oid(tag),
                str(_value(tag, "message", "")),
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


REPOSITORY_PANES = (
    ChangesPane,
    HistoryPane,
    BranchesPane,
    StashesPane,
    RepositoryToolsPane,
)
