"""Interactive advanced Git, workspace, and build/run tools."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, ClassVar, cast

from textual import on, work
from textual.app import ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical
from textual.widgets import (
    Button,
    Checkbox,
    DataTable,
    Input,
    Label,
    Static,
    TabbedContent,
    TabPane,
    TextArea,
)

from ...application.advanced_git import AdvancedGitService
from ...application.advanced_workspace import (
    WorkspaceCommandProfile,
    WorkspaceCommandResult,
    WorkspaceCommandService,
)
from ...infrastructure.git.advanced import (
    ReflogRecord,
    RepositoryDiagnostics,
    SparseCheckoutState,
    SubmoduleRecord,
    WorktreeRecord,
)
from .dialogs import DecisionDialog
from .repository_panes import RepositoryPane


def _selected_index(table: DataTable[object]) -> int | None:
    if table.row_count == 0:
        return None
    try:
        key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
        if key is None:
            return None
        return int(key)
    except (KeyError, TypeError, ValueError):
        return None


class AdvancedPane(RepositoryPane):
    """Worktrees, submodules, sparse checkout, recovery, and safe commands."""

    BINDINGS: ClassVar[list[BindingType]] = [("f6", "reload", "Refresh advanced tools")]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.git: AdvancedGitService | None = None
        self.commands: WorkspaceCommandService | None = None
        self.worktrees: list[WorktreeRecord] = []
        self.submodules: list[SubmoduleRecord] = []
        self.reflog_entries: list[ReflogRecord] = []

    def compose(self) -> ComposeResult:
        with TabbedContent(initial="advanced-worktrees-tab", id="advanced-tabs"):
            with TabPane("Worktrees", id="advanced-worktrees-tab"):
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="advanced-refresh")
                    yield Button("Add worktree", id="worktree-add", variant="primary")
                    yield Button("Remove…", id="worktree-remove", variant="error")
                    yield Button("Prune stale…", id="worktree-prune")
                yield DataTable(
                    cursor_type="row",
                    zebra_stripes=True,
                    id="worktrees-table",
                    classes="advanced-table",
                )
                with Vertical(classes="form-panel advanced-form"):
                    yield Label("New worktree path", classes="field-label")
                    yield Input(
                        placeholder="/home/you/src/project-feature",
                        id="worktree-path",
                        select_on_focus=False,
                    )
                    with Horizontal(classes="advanced-input-row"):
                        yield Input(
                            placeholder="existing or new branch",
                            id="worktree-branch",
                            select_on_focus=False,
                        )
                        yield Input(
                            placeholder="start point (optional)",
                            id="worktree-start",
                            select_on_focus=False,
                        )
                    with Horizontal(classes="advanced-check-row"):
                        yield Checkbox("Create branch", id="worktree-create-branch")
                        yield Checkbox("Detached", id="worktree-detached")
                        yield Checkbox("Force removal", id="worktree-force")
                    yield Static(
                        "Removal always asks for typed confirmation. Git refuses dirty "
                        "worktrees unless Force removal is selected.",
                        classes="help-copy",
                    )

            with TabPane("Submodules", id="advanced-submodules-tab"):
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="submodule-refresh")
                    yield Button("Initialize / update", id="submodule-update", variant="primary")
                    yield Button("Sync URLs", id="submodule-sync")
                    yield Button("Deinitialize…", id="submodule-deinit", variant="error")
                yield DataTable(
                    cursor_type="row",
                    zebra_stripes=True,
                    id="submodules-table",
                    classes="advanced-table",
                )
                with Vertical(classes="form-panel advanced-form"):
                    yield Label(
                        "Submodule path (blank updates every submodule)",
                        classes="field-label",
                    )
                    yield Input(
                        placeholder="modules/example",
                        id="submodule-path",
                        select_on_focus=False,
                    )
                    with Horizontal(classes="advanced-check-row"):
                        yield Checkbox("Recursive", value=True, id="submodule-recursive")
                        yield Checkbox("Force deinitialize", id="submodule-force")
                    yield Static(
                        "Authentication comes from Git's configured credential helper; "
                        "credentials are never accepted in these fields.",
                        classes="help-copy",
                    )

            with TabPane("Sparse checkout", id="advanced-sparse-tab"):
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="sparse-refresh")
                    yield Button("Apply patterns…", id="sparse-apply", variant="primary")
                    yield Button("Disable…", id="sparse-disable")
                yield Static(
                    "Sparse checkout status has not loaded.",
                    id="sparse-status",
                    classes="advanced-status",
                )
                yield Checkbox("Cone mode (directory paths)", value=True, id="sparse-cone")
                yield Label("One directory or pattern per line", classes="field-label")
                yield TextArea(
                    "",
                    placeholder="src\nREADME.md",
                    id="sparse-patterns",
                    soft_wrap=False,
                    tab_behavior="focus",
                    classes="advanced-editor",
                )
                yield Static(
                    "Applying patterns changes which tracked files are present in this "
                    "worktree. The operation is guarded by typed confirmation.",
                    classes="help-copy",
                )

            with TabPane("Recovery & diagnostics", id="advanced-recovery-tab"):
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="recovery-refresh")
                    yield Button("Copy selected hash", id="reflog-copy")
                with Horizontal(classes="screen-split"):
                    yield DataTable(
                        cursor_type="row",
                        zebra_stripes=True,
                        id="reflog-table",
                        classes="screen-list",
                    )
                    yield TextArea(
                        "Repository diagnostics have not loaded.",
                        read_only=True,
                        soft_wrap=False,
                        tab_behavior="focus",
                        id="advanced-diagnostics",
                        classes="screen-detail",
                    )

            with (
                TabPane("Build & run", id="advanced-commands-tab"),
                Vertical(classes="advanced-command-form"),
            ):
                yield Label(
                    "Build command (argv only; no shell operators)",
                    classes="field-label",
                )
                yield Input(
                    placeholder="python -m pytest",
                    id="advanced-build-command",
                    select_on_focus=False,
                )
                yield Label(
                    "Run command (argv only; no shell operators)",
                    classes="field-label",
                )
                yield Input(
                    placeholder="python -m your_package",
                    id="advanced-run-command",
                    select_on_focus=False,
                )
                with Horizontal(classes="advanced-input-row"):
                    yield Input(
                        value=".",
                        placeholder="working directory inside repository",
                        id="advanced-working-directory",
                        select_on_focus=False,
                    )
                    yield Input(
                        value="auto",
                        placeholder="graphical terminal command",
                        id="advanced-terminal-command",
                        select_on_focus=False,
                    )
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Run build", id="advanced-run-build", variant="primary")
                    yield Button("Run app", id="advanced-run-app")
                    yield Button("Save commands", id="advanced-save-commands")
                    yield Button("Open terminal", id="advanced-open-terminal")
                    yield Button("Clear output", id="advanced-clear-output")
                yield TextArea(
                    "Command output appears here. Output and runtime are bounded.",
                    read_only=True,
                    show_line_numbers=False,
                    soft_wrap=False,
                    tab_behavior="focus",
                    id="advanced-command-output",
                    classes="advanced-command-output",
                )
                yield Static(
                    "Profiles live in the app's private XDG config directory, never in "
                    "the repository. Put secrets in credential helpers or environment "
                    "providers, not command arguments.",
                    classes="help-copy",
                )

    def on_mount(self) -> None:
        self.query_one("#worktrees-table", DataTable).add_columns("Path", "Branch", "HEAD", "State")
        self.query_one("#submodules-table", DataTable).add_columns(
            "State", "Path", "Commit", "Description"
        )
        self.query_one("#reflog-table", DataTable).add_columns(
            "Selector", "Commit", "Action", "When"
        )

    def bind_repository(self, service: Any | None) -> None:
        self.service = service
        self.worktrees = []
        self.submodules = []
        self.reflog_entries = []
        if service is None:
            self.git = None
            self.commands = None
            self.reload()
            return
        try:
            path = Path(service.validate())
            self.git = AdvancedGitService(path)
            self.git.validate()
            self.commands = WorkspaceCommandService(path)
            self._load_command_profile()
        except Exception as error:
            self.git = None
            self.commands = None
            self._error("Open advanced tools", error)
            return
        self.reload()

    def _load_command_profile(self) -> None:
        if self.commands is None or not self.is_mounted:
            return
        try:
            profile = self.commands.load_profile()
        except Exception as error:
            self._error("Load command profile", error)
            return
        self.query_one("#advanced-build-command", Input).value = profile.build_command
        self.query_one("#advanced-run-command", Input).value = profile.run_command
        self.query_one("#advanced-working-directory", Input).value = profile.working_directory
        self.query_one("#advanced-terminal-command", Input).value = profile.terminal_command

    def reload(self) -> None:
        self._reload()

    @work(exclusive=True, group="advanced-load")
    async def _reload(self) -> None:
        if not self.is_mounted:
            return
        if self.git is None:
            self.query_one("#worktrees-table", DataTable).clear()
            self.query_one("#submodules-table", DataTable).clear()
            self.query_one("#reflog-table", DataTable).clear()
            self.query_one("#sparse-status", Static).update(
                "Open a repository to use advanced Git tools."
            )
            self.query_one(
                "#advanced-diagnostics", TextArea
            ).text = "Open a repository to view diagnostics."
            return
        results = await asyncio.gather(
            asyncio.to_thread(self.git.worktrees),
            asyncio.to_thread(self.git.submodules),
            asyncio.to_thread(self.git.sparse_checkout),
            asyncio.to_thread(self.git.reflog),
            asyncio.to_thread(self.git.diagnostics),
            return_exceptions=True,
        )
        errors: list[BaseException] = []
        worktrees, submodules, sparse, reflog, diagnostics = results
        if isinstance(worktrees, BaseException):
            errors.append(worktrees)
        else:
            self._render_worktrees(cast(Sequence[WorktreeRecord], worktrees))
        if isinstance(submodules, BaseException):
            errors.append(submodules)
        else:
            self._render_submodules(cast(Sequence[SubmoduleRecord], submodules))
        if isinstance(sparse, BaseException):
            errors.append(sparse)
        else:
            self._render_sparse(sparse)
        if isinstance(reflog, BaseException):
            errors.append(reflog)
        else:
            self._render_reflog(cast(Sequence[ReflogRecord], reflog))
        if isinstance(diagnostics, BaseException):
            errors.append(diagnostics)
        else:
            self._render_diagnostics(diagnostics)
        if errors:
            self._error("Refresh advanced tools", errors[0])

    def _render_worktrees(self, records: Sequence[WorktreeRecord]) -> None:
        self.worktrees = list(records)
        table = cast(
            DataTable[object],
            self.query_one("#worktrees-table", DataTable),
        )
        table.clear()
        for index, record in enumerate(records):
            states = []
            if record.locked_reason is not None:
                states.append(f"locked {record.locked_reason}".strip())
            if record.prunable_reason is not None:
                states.append(f"prunable {record.prunable_reason}".strip())
            table.add_row(
                str(record.path),
                record.display_branch,
                record.head[:10],
                ", ".join(states) or "ready",
                key=str(index),
            )

    def _render_submodules(self, records: Sequence[SubmoduleRecord]) -> None:
        self.submodules = list(records)
        table = cast(
            DataTable[object],
            self.query_one("#submodules-table", DataTable),
        )
        table.clear()
        meanings = {
            " ": "ready",
            "-": "not initialized",
            "+": "different commit",
            "U": "conflict",
        }
        for index, record in enumerate(records):
            table.add_row(
                meanings.get(record.state, record.state),
                record.path,
                record.oid[:10],
                record.description,
                key=str(index),
            )

    def _render_sparse(self, state: SparseCheckoutState) -> None:
        self.query_one("#sparse-status", Static).update(
            f"[b]{'Enabled' if state.enabled else 'Disabled'}[/] · "
            f"{'cone' if state.cone_mode else 'non-cone'} mode · "
            f"{len(state.patterns)} pattern(s)"
        )
        self.query_one("#sparse-cone", Checkbox).value = state.cone_mode
        self.query_one("#sparse-patterns", TextArea).text = "\n".join(state.patterns)

    def _render_reflog(self, records: Sequence[ReflogRecord]) -> None:
        self.reflog_entries = list(records)
        table = cast(
            DataTable[object],
            self.query_one("#reflog-table", DataTable),
        )
        table.clear()
        for index, record in enumerate(records):
            table.add_row(
                record.selector,
                record.short_oid,
                record.action,
                str(record.authored_at or ""),
                key=str(index),
            )

    def _render_diagnostics(self, diagnostics: RepositoryDiagnostics) -> None:
        lines = [
            f"Git: {diagnostics.git_version}",
            f"Root: {diagnostics.repository_root}",
            f"Git directory: {diagnostics.git_directory}",
            f"Common directory: {diagnostics.common_directory}",
            f"HEAD: {diagnostics.head}",
            "",
            "Object database",
        ]
        lines.extend(f"  {key}: {value}" for key, value in diagnostics.object_statistics)
        lines.extend(("", f"Remotes ({len(diagnostics.remotes)})"))
        for remote in diagnostics.remotes:
            lines.extend(
                (
                    f"  {remote.name}",
                    f"    fetch: {remote.fetch_url}",
                    f"    push:  {remote.push_url}",
                )
            )
        lines.extend(("", f"Recent tags ({len(diagnostics.recent_tags)})"))
        lines.extend(
            f"  {tag.name}  {tag.oid}  {tag.object_type}  {tag.subject}"
            for tag in diagnostics.recent_tags
        )
        self.query_one("#advanced-diagnostics", TextArea).text = "\n".join(lines)

    @on(DataTable.RowHighlighted, "#worktrees-table")
    def _worktree_highlighted(self, _event: DataTable.RowHighlighted) -> None:
        record = self._selected_worktree()
        if record is not None:
            self.query_one("#worktree-path", Input).value = str(record.path)

    @on(DataTable.RowHighlighted, "#submodules-table")
    def _submodule_highlighted(self, _event: DataTable.RowHighlighted) -> None:
        record = self._selected_submodule()
        if record is not None:
            self.query_one("#submodule-path", Input).value = record.path

    def _selected_worktree(self) -> WorktreeRecord | None:
        table = cast(
            DataTable[object],
            self.query_one("#worktrees-table", DataTable),
        )
        index = _selected_index(table)
        return self.worktrees[index] if index is not None and index < len(self.worktrees) else None

    def _selected_submodule(self) -> SubmoduleRecord | None:
        table = cast(
            DataTable[object],
            self.query_one("#submodules-table", DataTable),
        )
        index = _selected_index(table)
        return (
            self.submodules[index] if index is not None and index < len(self.submodules) else None
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id in {
            "advanced-refresh",
            "submodule-refresh",
            "sparse-refresh",
            "recovery-refresh",
        }:
            self.reload()
        elif button_id == "worktree-add":
            self._add_worktree()
        elif button_id == "worktree-remove":
            self._confirm_remove_worktree()
        elif button_id == "worktree-prune":
            self._confirm_prune_worktrees()
        elif button_id == "submodule-update":
            self._update_submodules()
        elif button_id == "submodule-sync":
            self._sync_submodules()
        elif button_id == "submodule-deinit":
            self._confirm_deinit_submodule()
        elif button_id == "sparse-apply":
            self._confirm_sparse_apply()
        elif button_id == "sparse-disable":
            self._confirm_sparse_disable()
        elif button_id == "reflog-copy":
            self._copy_reflog_hash()
        elif button_id == "advanced-run-build":
            self._run_workspace_command("Build", "#advanced-build-command")
        elif button_id == "advanced-run-app":
            self._run_workspace_command("Run", "#advanced-run-command")
        elif button_id == "advanced-save-commands":
            self._save_commands()
        elif button_id == "advanced-open-terminal":
            self._open_terminal()
        elif button_id == "advanced-clear-output":
            self.query_one("#advanced-command-output", TextArea).text = ""

    def action_reload(self) -> None:
        self.reload()

    async def _git_operation(
        self,
        title: str,
        operation: Callable[[], object],
        success: str,
    ) -> bool:
        if self.git is None:
            self.app.notify("Open a repository first.", severity="warning")
            return False
        self.app.notify(f"{title}…", title="Working")
        try:
            await asyncio.to_thread(operation)
        except Exception as error:
            self._error(title, error)
            return False
        self.app.notify(success, title="Done")
        refresh = getattr(self.app, "refresh_repository", None)
        if callable(refresh):
            refresh()
        else:
            self.reload()
        return True

    @work(exclusive=True, group="advanced-mutate")
    async def _add_worktree(self) -> None:
        git = self.git
        if git is None:
            return
        path = self.query_one("#worktree-path", Input).value.strip()
        branch = self.query_one("#worktree-branch", Input).value.strip() or None
        start = self.query_one("#worktree-start", Input).value.strip() or None
        create = self.query_one("#worktree-create-branch", Checkbox).value
        detach = self.query_one("#worktree-detached", Checkbox).value
        if not path:
            self.app.notify("Enter a worktree path.", severity="warning")
            self.query_one("#worktree-path", Input).focus()
            return
        if await self._git_operation(
            "Add worktree",
            lambda: git.add_worktree(
                path,
                branch=branch,
                start_point=start,
                create_branch=create,
                detach=detach,
            ),
            f"Added worktree at {path}.",
        ):
            self.query_one("#worktree-path", Input).value = ""
            self.query_one("#worktree-branch", Input).value = ""
            self.query_one("#worktree-start", Input).value = ""

    def _confirm_remove_worktree(self) -> None:
        record = self._selected_worktree()
        if record is None:
            self.app.notify("Select a worktree first.", severity="warning")
            return
        if self.git is not None and record.path.resolve() == self.git.validate():
            self.app.notify("The primary worktree cannot be removed here.", severity="warning")
            return
        force = self.query_one("#worktree-force", Checkbox).value

        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._remove_worktree(record.path, force)

        self.app.push_screen(
            DecisionDialog(
                "Remove selected worktree?",
                f"Git will remove **{record.path}** and its working files."
                + (
                    "\n\nForce removal is enabled, so uncommitted content may be lost."
                    if force
                    else ""
                ),
                confirm_label="Remove worktree",
                destructive=True,
                typed_confirmation="remove",
            ),
            resolved,
        )

    @work(exclusive=True, group="advanced-mutate")
    async def _remove_worktree(self, path: Path, force: bool) -> None:
        git = self.git
        if git is not None:
            await self._git_operation(
                "Remove worktree",
                lambda: git.remove_worktree(path, force=force),
                f"Removed worktree {path}.",
            )

    def _confirm_prune_worktrees(self) -> None:
        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._prune_worktrees()

        self.app.push_screen(
            DecisionDialog(
                "Prune stale worktree records?",
                "Only administrative records whose worktree paths are already missing "
                "will be removed.",
                confirm_label="Prune stale records",
                destructive=True,
            ),
            resolved,
        )

    @work(exclusive=True, group="advanced-mutate")
    async def _prune_worktrees(self) -> None:
        git = self.git
        if git is not None:
            await self._git_operation(
                "Prune worktrees",
                lambda: git.prune_worktrees(dry_run=False),
                "Pruned stale worktree records.",
            )

    @work(exclusive=True, group="advanced-mutate")
    async def _update_submodules(self) -> None:
        git = self.git
        if git is None:
            return
        path = self.query_one("#submodule-path", Input).value.strip()
        recursive = self.query_one("#submodule-recursive", Checkbox).value
        await self._git_operation(
            "Update submodules",
            lambda: git.update_submodules(
                (path,) if path else (),
                recursive=recursive,
            ),
            "Submodules updated.",
        )

    @work(exclusive=True, group="advanced-mutate")
    async def _sync_submodules(self) -> None:
        git = self.git
        if git is not None:
            await self._git_operation(
                "Sync submodules",
                lambda: git.sync_submodules(
                    recursive=self.query_one("#submodule-recursive", Checkbox).value
                ),
                "Submodule URLs synchronized.",
            )

    def _confirm_deinit_submodule(self) -> None:
        path = self.query_one("#submodule-path", Input).value.strip()
        if not path:
            selected = self._selected_submodule()
            path = selected.path if selected is not None else ""
        if not path:
            self.app.notify("Select or enter a submodule path first.", severity="warning")
            return
        force = self.query_one("#submodule-force", Checkbox).value

        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._deinit_submodule(path, force)

        self.app.push_screen(
            DecisionDialog(
                "Deinitialize submodule?",
                f"This removes the checked-out submodule worktree at **{path}**."
                + (
                    "\n\nForce is enabled, so local submodule changes may be lost." if force else ""
                ),
                confirm_label="Deinitialize",
                destructive=True,
                typed_confirmation="deinit",
            ),
            resolved,
        )

    @work(exclusive=True, group="advanced-mutate")
    async def _deinit_submodule(self, path: str, force: bool) -> None:
        git = self.git
        if git is not None:
            await self._git_operation(
                "Deinitialize submodule",
                lambda: git.deinit_submodule(path, force=force),
                f"Deinitialized {path}.",
            )

    def _confirm_sparse_apply(self) -> None:
        patterns = tuple(
            line.strip()
            for line in self.query_one("#sparse-patterns", TextArea).text.splitlines()
            if line.strip()
        )
        if not patterns:
            self.app.notify("Enter at least one sparse checkout pattern.", severity="warning")
            return
        cone = self.query_one("#sparse-cone", Checkbox).value

        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._apply_sparse(patterns, cone)

        self.app.push_screen(
            DecisionDialog(
                "Apply sparse checkout patterns?",
                "Tracked files outside the selected paths may leave this worktree. "
                "Git history is unchanged and disabling sparse checkout restores them.",
                confirm_label="Apply patterns",
                destructive=True,
                typed_confirmation="sparse",
            ),
            resolved,
        )

    @work(exclusive=True, group="advanced-mutate")
    async def _apply_sparse(self, patterns: Sequence[str], cone: bool) -> None:
        git = self.git
        if git is not None:
            await self._git_operation(
                "Apply sparse checkout",
                lambda: git.set_sparse_checkout(patterns, cone_mode=cone),
                "Sparse checkout updated.",
            )

    def _confirm_sparse_disable(self) -> None:
        def resolved(confirmed: bool | None) -> None:
            if confirmed:
                self._disable_sparse()

        self.app.push_screen(
            DecisionDialog(
                "Disable sparse checkout?",
                "Git will restore the full tracked working tree.",
                confirm_label="Disable sparse checkout",
            ),
            resolved,
        )

    @work(exclusive=True, group="advanced-mutate")
    async def _disable_sparse(self) -> None:
        if self.git is not None:
            await self._git_operation(
                "Disable sparse checkout",
                self.git.disable_sparse_checkout,
                "Sparse checkout disabled.",
            )

    def _copy_reflog_hash(self) -> None:
        table = cast(
            DataTable[object],
            self.query_one("#reflog-table", DataTable),
        )
        index = _selected_index(table)
        if index is None or index >= len(self.reflog_entries):
            self.app.notify("Select a reflog entry first.", severity="warning")
            return
        self.app.copy_to_clipboard(self.reflog_entries[index].oid)
        self.app.notify("Reflog commit hash copied.")

    def _profile_from_fields(self) -> WorkspaceCommandProfile | None:
        if self.commands is None:
            self.app.notify("Open a repository first.", severity="warning")
            return None
        return WorkspaceCommandProfile(
            repository=str(self.commands.repository),
            build_command=self.query_one("#advanced-build-command", Input).value.strip(),
            run_command=self.query_one("#advanced-run-command", Input).value.strip(),
            working_directory=(
                self.query_one("#advanced-working-directory", Input).value.strip() or "."
            ),
            terminal_command=(
                self.query_one("#advanced-terminal-command", Input).value.strip() or "auto"
            ),
        )

    @work(exclusive=True, group="advanced-command-save")
    async def _save_commands(self) -> None:
        profile = self._profile_from_fields()
        if profile is None or self.commands is None:
            return
        try:
            await asyncio.to_thread(self.commands.save_profile, profile)
        except Exception as error:
            self._error("Save command profile", error)
            return
        self.app.notify(
            "Build and run commands saved outside the repository.",
            title="Commands",
        )

    @work(exclusive=True, group="advanced-command-run")
    async def _run_workspace_command(self, title: str, input_selector: str) -> None:
        if self.commands is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        command = self.query_one(input_selector, Input).value.strip()
        working_directory = (
            self.query_one("#advanced-working-directory", Input).value.strip() or "."
        )
        output = self.query_one("#advanced-command-output", TextArea)
        output.text = f"{title} is running…"
        self.app.notify(f"{title} command is running…", title=title)
        try:
            result = await asyncio.to_thread(
                self.commands.run,
                command,
                working_directory=working_directory,
            )
        except Exception as error:
            output.text = str(error)
            self._error(f"{title} command", error)
            return
        output.text = self._format_command_result(result)
        if result.ok:
            self.app.notify(
                f"{title} completed in {result.duration_seconds:.2f}s.",
                title=title,
            )
        else:
            reason = (
                "timed out"
                if result.timed_out
                else "exceeded the output limit"
                if result.output_truncated
                else f"exited with {result.exit_code}"
            )
            self.app.notify(
                f"{title} {reason}.",
                title=f"{title} failed",
                severity="error",
                timeout=15,
            )

    @work(exclusive=True, group="advanced-terminal")
    async def _open_terminal(self) -> None:
        if self.commands is None:
            self.app.notify("Open a repository first.", severity="warning")
            return
        terminal = self.query_one("#advanced-terminal-command", Input).value.strip() or "auto"
        working_directory = (
            self.query_one("#advanced-working-directory", Input).value.strip() or "."
        )
        try:
            argv = await asyncio.to_thread(
                self.commands.launch_terminal,
                terminal,
                working_directory=working_directory,
            )
        except Exception as error:
            self._error("Open terminal", error)
            return
        self.app.notify(f"Opened {Path(argv[0]).name}.", title="Terminal")

    @staticmethod
    def _format_command_result(result: WorkspaceCommandResult) -> str:
        status = (
            "timed out"
            if result.timed_out
            else "output limit reached"
            if result.output_truncated
            else f"exit {result.exit_code}"
        )
        sections = [
            f"Command: {' '.join(result.argv)}",
            f"Working directory: {result.cwd}",
            f"Result: {status} in {result.duration_seconds:.2f}s",
        ]
        if result.stdout:
            sections.extend(("", "stdout", result.stdout.rstrip()))
        if result.stderr:
            sections.extend(("", "stderr", result.stderr.rstrip()))
        return "\n".join(sections)


__all__ = ["AdvancedPane"]
