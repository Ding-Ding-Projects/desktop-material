"""Desktop Material's Linux-first, mouse-capable Textual application."""

from __future__ import annotations

import asyncio
import os
import shlex
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import asdict, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar, Literal

from textual import events, on, work
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Horizontal, Vertical
from textual.widgets import (
    Button,
    Footer,
    Header,
    Input,
    Label,
    ListItem,
    ListView,
    Static,
    Tab,
    TabbedContent,
    TabPane,
    Tabs,
)

from .application.path_input import path_from_user_input
from .ui.screens.advanced import AdvancedPane
from .ui.screens.cheap_lfs import CheapLfsPane
from .ui.screens.dialogs import (
    CloneDialog,
    CloneRequest,
    CommandPaletteDialog,
    DecisionDialog,
    HelpDialog,
    PaletteCommand,
    PathDialog,
)
from .ui.screens.github import GitHubPane
from .ui.screens.notifications import NotificationCentrePane
from .ui.screens.regex_builder import RegexBuilderPane
from .ui.screens.repository_panes import (
    BranchesPane,
    ChangesPane,
    HistoryPane,
    RepositoryPane,
    RepositoryToolsPane,
    StashesPane,
)
from .ui.screens.settings import SettingsHistoryDialog, SettingsPane, SettingsValues
from .ui.widgets.search_bar import SearchBar, SearchState

if TYPE_CHECKING:
    from .infrastructure.persistence import RepositoryRecord


class RepositoryListItem(ListItem):
    """A list item that retains a canonical repository path."""

    def __init__(
        self,
        path: Path,
        *,
        active: bool = False,
        branch: str = "",
        ahead: int = 0,
        behind: int = 0,
        changes: int = 0,
    ) -> None:
        self.path = path
        marker = "●" if active else " "
        state = (
            f"\n[dim]{branch or 'detached'} · "
            f"[green]↑{ahead}[/] [yellow]↓{behind}[/] · {changes} change(s)[/]"
        )
        super().__init__(
            Static(
                f"{marker} [b]{path.name or path}[/]\n[dim]{path}[/]{state}",
                markup=True,
            )
        )


class DesktopMaterialTUI(App[None]):
    """Full-screen terminal Git and GitHub workspace."""

    _TAB_KEYS: ClassVar[dict[str, str]] = {
        "#--content-tab-changes-tab": "nav.changes",
        "#--content-tab-history-tab": "nav.history",
        "#--content-tab-branches-tab": "repository.branch",
        "#--content-tab-stashes-tab": "repository.stash",
        "#--content-tab-tools-tab": "nav.tools",
        "#--content-tab-cheap-lfs-tab": "nav.cheap_lfs",
        "#--content-tab-advanced-tab": "nav.advanced",
        "#--content-tab-github-tab": "nav.api",
        "#--content-tab-regex-tab": "search.regex_builder",
        "#--content-tab-settings-tab": "common.settings",
        "#--content-tab-notifications-tab": "notifications.title",
    }
    _COMPACT_TAB_LABELS: ClassVar[dict[str, str]] = {
        "#--content-tab-changes-tab": "Chg",
        "#--content-tab-history-tab": "Hist",
        "#--content-tab-branches-tab": "Br",
        "#--content-tab-stashes-tab": "St",
        "#--content-tab-tools-tab": "Tools",
        "#--content-tab-cheap-lfs-tab": "LFS",
        "#--content-tab-advanced-tab": "Adv",
        "#--content-tab-github-tab": "GH",
        "#--content-tab-regex-tab": "RE2",
        "#--content-tab-settings-tab": "Set",
        "#--content-tab-notifications-tab": "Bell",
    }

    TITLE = "Desktop Material TUI"
    SUB_TITLE = "Linux-first Git workspace"
    CSS_PATH = "ui/styles.tcss"
    ENABLE_COMMAND_PALETTE = False

    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("ctrl+q", "quit", "Quit", priority=True),
        Binding("ctrl+p", "command_palette", "Commands", priority=True),
        Binding("ctrl+o", "open_repository", "Open", priority=True),
        Binding("ctrl+r", "refresh_repository", "Refresh"),
        Binding("ctrl+shift+f", "regex_builder", "Regex"),
        Binding("f1", "help", "Help"),
        Binding("f5", "fetch", "Fetch"),
        Binding("ctrl+shift+p", "push", "Push"),
    ]

    def __init__(
        self,
        initial_repository: str | Path | None = None,
        *,
        language_override: str | None = None,
        theme_override: str | None = None,
        english_funny_level_override: int | None = None,
        cantonese_funny_level_override: int | None = None,
    ) -> None:
        super().__init__()
        self.initial_repository = (
            path_from_user_input(initial_repository).resolve()
            if initial_repository is not None
            else None
        )
        self.repository_services: dict[Path, Any] = {}
        self.repository_summaries: dict[Path, tuple[str, int, int, int]] = {}
        self.active_repository: Path | None = None
        self.search_bars: dict[str, SearchBar] = {}
        self._config_store: Any | None = None
        self._config: Any | None = None
        self._notification_service: Any | None = None
        self._persistence_database: Any | None = None
        self._translator: Any | None = None
        self._version_history_service: Any | None = None
        self._settings_undo_stack: list[Any] = []
        self._settings_redo_stack: list[Any] = []
        self.language_override = language_override
        self.theme_override = theme_override
        self.english_funny_level_override = english_funny_level_override
        self.cantonese_funny_level_override = cantonese_funny_level_override

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="app-body"):
            with Vertical(id="repository-rail"):
                yield Label("Repositories", id="repository-heading")
                yield SearchBar(
                    surface_id="repositories",
                    placeholder="Filter repositories…",
                    id="repositories-search",
                )
                yield ListView(id="repository-list")
                with Horizontal(id="repository-actions"):
                    yield Button(
                        "Open", id="repository-open", tooltip="Open an existing repository"
                    )
                    yield Button("Clone", id="repository-clone", tooltip="Clone from a URL")
                    yield Button("New", id="repository-new", tooltip="Initialize a repository")
            with Vertical(id="workspace"):
                yield Tabs(id="repository-tabs")
                with Horizontal(id="repository-toolbar"):
                    yield Static(
                        "No repository open", id="active-repository", classes="toolbar-title"
                    )
                    yield Button("Fetch", id="toolbar-fetch")
                    yield Button("Pull", id="toolbar-pull")
                    yield Button("Push", id="toolbar-push", variant="primary")
                    yield Button("Editor", id="toolbar-editor", classes="optional-toolbar")
                with TabbedContent(initial="changes-tab", id="main-tabs"):
                    with TabPane("Changes", id="changes-tab"):
                        yield ChangesPane(id="changes-pane", classes="screen-layout")
                    with TabPane("History", id="history-tab"):
                        yield HistoryPane(id="history-pane", classes="screen-layout")
                    with TabPane("Branches", id="branches-tab"):
                        yield BranchesPane(id="branches-pane", classes="screen-layout")
                    with TabPane("Stashes", id="stashes-tab"):
                        yield StashesPane(id="stashes-pane", classes="screen-layout")
                    with TabPane("Repository tools", id="tools-tab"):
                        yield RepositoryToolsPane(id="tools-pane", classes="screen-layout")
                    with TabPane("Cheap LFS", id="cheap-lfs-tab"):
                        yield CheapLfsPane(id="cheap-lfs-pane", classes="screen-layout")
                    with TabPane("Advanced", id="advanced-tab"):
                        yield AdvancedPane(id="advanced-pane", classes="screen-layout")
                    with TabPane("GitHub", id="github-tab"):
                        yield GitHubPane(
                            id="github-pane",
                            classes="screen-layout",
                        )
                    with TabPane("Regex", id="regex-tab"):
                        yield RegexBuilderPane(id="regex-pane", classes="screen-layout")
                    with TabPane("Settings", id="settings-tab"):
                        yield SettingsPane(id="settings-pane", classes="screen-layout")
                    with TabPane("Notifications", id="notifications-tab"):
                        yield NotificationCentrePane(
                            id="notifications-pane",
                            classes="screen-layout",
                        )
        yield Footer()

    def on_mount(self) -> None:
        self._initialize_services()
        self._index_search_bars()
        self._apply_config()
        restored = self._restore_saved_repositories()
        if self.initial_repository is not None:
            self.open_repository_path(self.initial_repository)
        elif restored and self.active_repository is not None:
            self._refresh_repository_navigation()
            self._bind_repository(self.repository_services[self.active_repository])
            self.notify(
                str(self.active_repository),
                title="Workspace restored",
            )
        else:
            self.notify(
                "Click Open or press Ctrl+O to choose a repository.",
                title="Welcome",
            )

    def on_unmount(self) -> None:
        """Release owned database handles and other lifecycle resources."""

        if self._notification_service is not None:
            close = getattr(self._notification_service, "close", None)
            if callable(close):
                close()

    def notify(
        self,
        message: str,
        *,
        title: str = "",
        severity: Literal["information", "warning", "error"] = "information",
        timeout: float | None = None,
        markup: bool = True,
    ) -> None:
        """Show a corner notification and retain a reviewable local record."""

        super().notify(
            message,
            title=title,
            severity=severity,
            timeout=timeout,
            markup=markup,
        )
        if self._notification_service is None:
            return
        try:
            from .application.notifications import NotificationLevel

            level = {
                "information": NotificationLevel.INFO,
                "warning": NotificationLevel.WARNING,
                "error": NotificationLevel.ERROR,
            }[severity]
            self._notification_service.publish(
                level,
                title or "Desktop Material TUI",
                message,
                source="ui",
            )
            self._refresh_notification_centre()
        except (OSError, ValueError):
            # A notification must never fail the action it is reporting.
            return

    def _refresh_notification_centre(self) -> None:
        if self._notification_service is None:
            return
        try:
            history = self._notification_service.history(limit=500)
            self.query_one("#notifications-pane", NotificationCentrePane).set_notifications(history)
        except (OSError, ValueError):
            return

    def _initialize_services(self) -> None:
        """Load optional persistence services without making startup fragile."""

        paths: Any | None = None
        try:
            from .infrastructure.persistence import ConfigStore, XDGPaths

            paths = XDGPaths.discover().ensure()
            self._config_store = ConfigStore(paths)
            self._config = self._config_store.load_or_default()
        except (ImportError, OSError, ValueError):
            self._config_store = None
            self._config = None
        if paths is None:
            self._notification_service = None
            self._persistence_database = None
            self._version_history_service = None
        else:
            try:
                from .application.notifications import NotificationService

                self._notification_service = NotificationService(paths)
                self._persistence_database = self._notification_service.database
            except (ImportError, OSError, ValueError):
                self._notification_service = None
                self._persistence_database = None
            try:
                from .application.version_history import VersionHistoryService

                profile = getattr(self._config, "active_profile", "local")
                self._version_history_service = VersionHistoryService(paths, profile)
                if self._config is not None:
                    versions = self._version_history_service.list_versions(limit=1)
                    if not versions:
                        self._version_history_service.record(
                            asdict(self._config),
                            label="Initial settings",
                        )
            except (ImportError, OSError, ValueError):
                self._version_history_service = None
        self._update_settings_history_status()

    def _apply_config(self) -> None:
        if self._config is None:
            self.add_class("comfortable")
            return
        appearance = getattr(self._config, "appearance", self._config)
        theme = self.theme_override or getattr(appearance, "theme", "dark")
        self.theme = "textual-light" if theme == "light" else "textual-dark"
        density = str(getattr(appearance, "density", "comfortable"))
        self.remove_class("comfortable", "dense")
        self.add_class("dense" if density in {"compact", "dense"} else "comfortable")
        self._apply_accent(str(getattr(appearance, "accent", "#6750a4")))
        settings = self.query_one("#settings-pane", SettingsPane)
        settings.load_settings(self._config)
        self._apply_element_overrides(getattr(appearance, "element_overrides", {}))
        self._localize_shell()

    def _localize_shell(self) -> None:
        """Apply the persisted language and funny levels to the mounted shell."""

        if self._config is None:
            return
        from .ui.i18n import LocalePreferences, configure

        language = self._config.language
        language_mode = {
            "en": "english",
            "yue-HK": "cantonese",
            "bilingual": "bilingual",
        }.get(self.language_override or "", language.mode)
        translator = configure(
            LocalePreferences.from_values(
                mode=language_mode,
                english_funny_level=(
                    language.english_funny_level
                    if self.english_funny_level_override is None
                    else self.english_funny_level_override
                ),
                cantonese_funny_level=(
                    language.cantonese_funny_level
                    if self.cantonese_funny_level_override is None
                    else self.cantonese_funny_level_override
                ),
                bilingual_separator=" · ",
            )
        )
        self._translator = translator
        self._update_header_copy()
        self.query_one("#repository-heading", Label).update(translator.t("repository.open"))
        button_keys = {
            "#repository-open": "common.open",
            "#repository-clone": "repository.clone",
            "#repository-new": "repository.create",
            "#toolbar-fetch": "repository.fetch",
            "#toolbar-pull": "repository.pull",
            "#toolbar-push": "repository.push",
            "#toolbar-editor": "settings.editor",
        }
        for selector, key in button_keys.items():
            self.query_one(selector, Button).label = translator.t(key)
        self._update_tab_labels()
        for search_bar in self.query(SearchBar):
            search_bar.localize(translator)
        self.query_one("#cheap-lfs-pane", CheapLfsPane).localize(translator)

    def _update_tab_labels(self) -> None:
        """Keep every workspace destination visible at compact widths."""

        translator = self._translator
        if translator is None:
            return
        compact = self.has_class("compact")
        for selector, key in self._TAB_KEYS.items():
            tab = self.query_one(selector, Tab)
            full_label = translator.t(key)
            tab.label = self._COMPACT_TAB_LABELS[selector] if compact else full_label
            tab.tooltip = full_label
        self._update_header_copy()

    def _update_header_copy(self) -> None:
        """Use intentional short copy where a full bilingual tagline cannot fit."""

        translator = self._translator
        if translator is None:
            return
        if not self.has_class("compact"):
            self.title = translator.t("app.name")
            self.sub_title = translator.t("app.tagline")
            return
        mode = str(getattr(translator.preferences.mode, "value", "english"))
        if mode == "bilingual":
            self.title = "Desktop Material / 終端版"
        elif mode == "cantonese":
            self.title = "Desktop Material 終端版"
        else:
            self.title = "Desktop Material"
        self.sub_title = "Git TUI"

    def _index_search_bars(self) -> None:
        self.search_bars = {bar.surface_id: bar for bar in self.query(SearchBar)}

    def on_resize(self, event: events.Resize) -> None:
        self.set_class(event.size.width < 120, "narrow")
        self.set_class(event.size.width < 125, "compact")
        self.set_class(event.size.height < 22, "short")
        if self.is_running:
            self._update_tab_labels()

    def _make_repository_service(self, path: Path) -> Any:
        from .application.repository_service import RepositoryService

        service = RepositoryService(path)
        service.validate()
        return service

    def _restore_saved_repositories(self) -> bool:
        """Restore valid repository tabs from app-owned SQLite state."""

        database = self._persistence_database
        if database is None:
            return False
        try:
            records = database.list_repositories(include_hidden=False)
        except Exception:
            return False
        valid_records: list[RepositoryRecord] = []
        for record in records:
            path = Path(getattr(record, "path", "")).expanduser().resolve()
            if not path.exists():
                continue
            try:
                self.repository_services[path] = self._make_repository_service(path)
            except Exception as error:
                self.notify(
                    f"{path}: {error}",
                    title="Skipped saved repository",
                    severity="warning",
                )
                continue
            valid_records.append(record)
        if not valid_records:
            return False
        latest = max(
            valid_records,
            key=lambda record: (
                getattr(record, "last_opened_at", None) or datetime.min.replace(tzinfo=timezone.utc)
            ),
        )
        self.active_repository = Path(latest.path).resolve()
        return True

    def _remember_repository(self, path: Path) -> None:
        database = self._persistence_database
        if database is None:
            return
        try:
            from .infrastructure.persistence import RepositoryRecord

            existing = database.get_repository(path)
            record = (
                replace(existing, last_opened_at=datetime.now(timezone.utc))
                if existing is not None
                else RepositoryRecord(
                    path=path,
                    last_opened_at=datetime.now(timezone.utc),
                )
            )
            database.save_repository(record)
        except (OSError, ValueError):
            return

    def open_repository_path(self, path: str | Path) -> None:
        requested_path = path_from_user_input(path).resolve()
        try:
            service = self.repository_services.get(requested_path)
            if service is None:
                service = self._make_repository_service(requested_path)
            repository_path = service.path
            existing_service = self.repository_services.get(repository_path)
            if existing_service is not None:
                service = existing_service
            else:
                self.repository_services[repository_path] = service
            if requested_path != repository_path:
                self.repository_services.pop(requested_path, None)
        except Exception as error:
            self.notify(str(error), title="Could not open repository", severity="error")
            return
        self.active_repository = repository_path
        self._remember_repository(repository_path)
        self._refresh_repository_navigation()
        self._bind_repository(service)
        self.notify(str(repository_path), title="Repository opened")

    def _refresh_repository_navigation(self) -> None:
        tabs = self.query_one("#repository-tabs", Tabs)
        existing_tab_ids = {tab.id for tab in tabs.query(Tab)}
        active_tab_id: str | None = None
        repository_paths = tuple(self.repository_services)
        self._refresh_repository_list()
        for index, path in enumerate(repository_paths):
            is_active = path == self.active_repository
            tab_id = f"repo-{index}"
            if tab_id not in existing_tab_ids:
                tabs.add_tab(Tab(path.name or str(path), id=tab_id))
            if is_active:
                active_tab_id = tab_id
        if active_tab_id:
            tabs.active = active_tab_id
        active = self.active_repository
        self.query_one("#active-repository", Static).update(
            f"[b]{active.name}[/]  [dim]{active}[/]" if active else "No repository open"
        )

    @work(exclusive=True, group="repository-list")
    async def _refresh_repository_list(self) -> None:
        """Rebuild the filtered rail without racing asynchronous removals."""

        repo_list = self.query_one("#repository-list", ListView)
        repository_paths = tuple(self.repository_services)
        visible_paths: tuple[Path, ...] = repository_paths
        try:
            state = self.query_one("#repositories-search", SearchBar).state
            from .application.search import RegexFlags, SearchMode, SearchService

            mode = SearchMode(state.mode)
            flags = RegexFlags(
                ignore_case=not state.case_sensitive or "i" in state.flags,
                multiline="m" in state.flags,
                dot_all="s" in state.flags,
            )
            result = SearchService().search(
                repository_paths,
                state.query,
                mode=mode,
                flags=flags,
                get_text=lambda path: (path.name, str(path)),
            )
            if result.error is None:
                visible_paths = tuple(result.items)
        except (ValueError, LookupError):
            visible_paths = repository_paths
        items = [
            RepositoryListItem(
                path,
                active=path == self.active_repository,
                branch=summary[0],
                ahead=summary[1],
                behind=summary[2],
                changes=summary[3],
            )
            for path, summary in await self._repository_summaries(visible_paths)
        ]
        await repo_list.clear()
        await repo_list.extend(items)

    async def _repository_summaries(
        self,
        paths: tuple[Path, ...],
    ) -> list[tuple[Path, tuple[str, int, int, int]]]:
        semaphore = asyncio.Semaphore(4)

        async def summarize(
            path: Path,
        ) -> tuple[Path, tuple[str, int, int, int]]:
            cached = self.repository_summaries.get(path)
            if cached is not None:
                return path, cached
            service = self.repository_services[path]
            try:
                async with semaphore:
                    status = await asyncio.to_thread(service.status)
                summary = (
                    str(
                        getattr(
                            status,
                            "branch",
                            getattr(status, "branch_head", "detached"),
                        )
                    ),
                    int(getattr(status, "ahead", 0)),
                    int(getattr(status, "behind", 0)),
                    len(getattr(status, "changes", ())),
                )
            except Exception:
                summary = ("unavailable", 0, 0, 0)
            self.repository_summaries[path] = summary
            return path, summary

        return list(await asyncio.gather(*(summarize(path) for path in paths)))

    @on(SearchBar.Changed, "#repositories-search")
    def _filter_repositories(self, _event: SearchBar.Changed) -> None:
        self._refresh_repository_list()

    def _bind_repository(self, service: Any) -> None:
        for pane in self.query(RepositoryPane):
            pane.bind_repository(service)
        self.query_one("#github-pane", GitHubPane).bind_git_repository(service)
        self._update_toolbar_status()

    @work(exclusive=True, group="toolbar-status")
    async def _update_toolbar_status(self) -> None:
        service = self.active_service
        if service is None:
            return
        try:
            status = await asyncio.to_thread(service.status)
        except Exception:
            return
        branch = getattr(
            status,
            "branch",
            getattr(status, "branch_name", getattr(status, "branch_head", "detached")),
        )
        ahead = getattr(status, "ahead", 0)
        behind = getattr(status, "behind", 0)
        path = self.active_repository
        self.query_one("#active-repository", Static).update(
            f"[b]{path.name if path else 'Repository'}[/] · {branch}  "
            f"[green]↑{ahead}[/] [yellow]↓{behind}[/]"
        )

    @property
    def active_service(self) -> Any | None:
        if self.active_repository is None:
            return None
        return self.repository_services.get(self.active_repository)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if event.list_view.id != "repository-list" or not isinstance(
            event.item, RepositoryListItem
        ):
            return
        self._activate_repository(event.item.path)

    def on_tabs_tab_activated(self, event: Tabs.TabActivated) -> None:
        if event.tabs.id != "repository-tabs" or not event.tab.id:
            return
        try:
            index = int(event.tab.id.removeprefix("repo-"))
            path = tuple(self.repository_services)[index]
        except (ValueError, IndexError):
            return
        self._activate_repository(path)

    def _activate_repository(self, path: Path) -> None:
        if path not in self.repository_services:
            return
        if path == self.active_repository:
            return
        self.active_repository = path
        self._refresh_repository_navigation()
        self._bind_repository(self.repository_services[path])

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        if button_id == "repository-open":
            self.action_open_repository()
        elif button_id == "repository-clone":
            self._show_clone_dialog()
        elif button_id == "repository-new":
            self._show_create_repository_dialog()
        elif button_id == "toolbar-fetch":
            self.action_fetch()
        elif button_id == "toolbar-pull":
            self.action_pull()
        elif button_id == "toolbar-push":
            self.action_push()
        elif button_id == "toolbar-editor":
            self.open_external_editor()
        elif button_id == "settings-save":
            self._save_settings()
        elif button_id == "settings-preview":
            self._preview_settings()
        elif button_id == "settings-detect-editors":
            self._detect_editors()
        elif button_id == "settings-reset-element":
            self._reset_element_appearance()
        elif button_id == "settings-undo":
            self._undo_settings()
        elif button_id == "settings-redo":
            self._redo_settings()
        elif button_id == "settings-history":
            self._open_settings_history()
        elif button_id == "notifications-refresh":
            self._refresh_notification_centre()
        elif button_id == "notifications-read":
            self._mark_notifications_read()
        elif button_id == "notifications-clear":
            self._confirm_clear_notifications()

    def action_open_repository(self) -> None:
        initial = str(self.active_repository.parent) if self.active_repository else ""
        translator = self._translator
        self.push_screen(
            PathDialog(
                translator.t("repository.open") if translator else "Open repository",
                initial=initial,
                submit_label=translator.t("common.open") if translator else "Open",
            ),
            lambda value: self.open_repository_path(value) if value else None,
        )

    def _show_clone_dialog(self) -> None:
        self.push_screen(CloneDialog(), self._handle_clone_request)

    def _handle_clone_request(self, request: CloneRequest | None) -> None:
        self._clone_request(request)

    def _show_create_repository_dialog(self) -> None:
        translator = self._translator
        self.push_screen(
            PathDialog(
                translator.t("repository.create") if translator else "Create repository",
                placeholder="/path/to/new/repository",
                submit_label=translator.t("repository.create") if translator else "Create",
            ),
            self._handle_create_repository,
        )

    def _handle_create_repository(self, value: str | None) -> None:
        self._create_repository(value)

    @work(exclusive=True, group="clone")
    async def _clone_request(self, request: CloneRequest | None) -> None:
        if request is None:
            return
        destination = await asyncio.to_thread(
            lambda: path_from_user_input(request.destination).resolve()
        )
        self.notify("Cloning in the background…", title="Clone")
        result = await asyncio.to_thread(
            subprocess.run,
            ["git", "clone", "--", request.url, str(destination)],
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
        if result.returncode:
            self.notify(
                result.stderr.strip() or "git clone failed",
                title="Clone failed",
                severity="error",
                timeout=15,
            )
            return
        self.open_repository_path(destination)
        self.notify("Clone complete.", title="Done")

    @work(exclusive=True, group="create-repository")
    async def _create_repository(self, value: str | None) -> None:
        if not value:
            return
        path = await asyncio.to_thread(lambda: path_from_user_input(value).resolve())
        try:
            await asyncio.to_thread(path.mkdir, parents=True, exist_ok=True)
            result = await asyncio.to_thread(
                subprocess.run,
                ["git", "init", str(path)],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except OSError as error:
            self.notify(str(error), title="Create failed", severity="error")
            return
        if result.returncode:
            self.notify(result.stderr, title="Create failed", severity="error")
            return
        self.open_repository_path(path)

    def action_refresh_repository(self) -> None:
        self.refresh_repository()

    def refresh_repository(self) -> None:
        self.repository_summaries.clear()
        self._refresh_repository_list()
        for pane in self.query(RepositoryPane):
            pane.reload()
        self._update_toolbar_status()

    @work(exclusive=True, group="network")
    async def action_fetch(self) -> None:
        await self._network_action("Fetch", "fetch", "Fetch completed.")

    @work(exclusive=True, group="network")
    async def action_pull(self) -> None:
        await self._network_action("Pull", "pull", "Pull completed.")

    @work(exclusive=True, group="network")
    async def action_push(self) -> None:
        await self._network_action("Push", "push", "Push completed.")

    async def _network_action(self, title: str, method: str, success: str) -> None:
        service = self.active_service
        if service is None:
            self.notify("Open a repository first.", severity="warning")
            return
        self.notify(f"{title} is running…", title=title)
        try:
            await asyncio.to_thread(getattr(service, method))
        except Exception as error:
            self.notify(str(error), title=f"{title} failed", severity="error", timeout=15)
            return
        self.notify(success, title="Done")
        self.refresh_repository()

    def action_command_palette(self) -> None:
        self.push_screen(CommandPaletteDialog(self._palette_commands()), self._run_palette_command)

    def _palette_commands(self) -> tuple[PaletteCommand, ...]:
        return (
            PaletteCommand("open", "Open repository", "Add an existing local repository", "Ctrl+O"),
            PaletteCommand("clone", "Clone repository", "Clone a Git URL"),
            PaletteCommand("new", "Create repository", "Initialize a new Git repository"),
            PaletteCommand(
                "refresh", "Refresh repository", "Reload status and all panes", "Ctrl+R"
            ),
            PaletteCommand("fetch", "Fetch", "Download remote refs", "F5"),
            PaletteCommand("pull", "Pull", "Fetch and integrate the upstream branch"),
            PaletteCommand("push", "Push", "Publish local commits", "Ctrl+Shift+P"),
            PaletteCommand("changes", "Show Changes", "Stage, diff, and commit"),
            PaletteCommand("history", "Show History", "Browse commits"),
            PaletteCommand("branches", "Show Branches", "Checkout, merge, create, or delete"),
            PaletteCommand("stashes", "Show Stashes", "Create, apply, pop, or drop"),
            PaletteCommand("tools", "Show Repository tools", "Remotes, tags, and diagnostics"),
            PaletteCommand(
                "cheap-lfs",
                "Show Cheap LFS",
                "Preview, track, verify, and restore large files",
            ),
            PaletteCommand(
                "advanced",
                "Show Advanced tools",
                "Worktrees, submodules, sparse checkout, reflog, build, and run",
            ),
            PaletteCommand("github", "Show GitHub", "Issues, PRs, Actions, releases, packages"),
            PaletteCommand(
                "regex", "Open regex builder", "Guided RE2 construction", "Ctrl+Shift+F"
            ),
            PaletteCommand("settings", "Open Settings", "Appearance, language, sound, editor"),
            PaletteCommand("notifications", "Open Notifications", "Review notification history"),
            PaletteCommand("editor", "Open external editor", "Use the configured editor"),
            PaletteCommand(
                "help", "Open Help", "Mouse, keyboard, text field, and safety guide", "F1"
            ),
            PaletteCommand("quit", "Quit", "Close Desktop Material TUI", "Ctrl+Q"),
        )

    def _run_palette_command(self, command_id: str | None) -> None:
        if command_id is None:
            return
        tab_map = {
            "changes": "changes-tab",
            "history": "history-tab",
            "branches": "branches-tab",
            "stashes": "stashes-tab",
            "tools": "tools-tab",
            "cheap-lfs": "cheap-lfs-tab",
            "advanced": "advanced-tab",
            "github": "github-tab",
            "regex": "regex-tab",
            "settings": "settings-tab",
            "notifications": "notifications-tab",
        }
        if command_id in tab_map:
            self.query_one("#main-tabs", TabbedContent).active = tab_map[command_id]
            return
        if command_id == "quit":
            self.call_later(self.action_quit)
            return
        actions: dict[str, Callable[[], object]] = {
            "open": self.action_open_repository,
            "clone": self._show_clone_dialog,
            "new": self._show_create_repository_dialog,
            "refresh": self.action_refresh_repository,
            "fetch": self.action_fetch,
            "pull": self.action_pull,
            "push": self.action_push,
            "editor": self.open_external_editor,
            "help": self.action_help,
        }
        action = actions.get(command_id)
        if action:
            action()

    def action_regex_builder(self) -> None:
        self.query_one("#main-tabs", TabbedContent).active = "regex-tab"
        self.query_one("#regex-pattern", Input).focus()

    def on_search_bar_builder_requested(self, event: SearchBar.BuilderRequested) -> None:
        builder = self.query_one("#regex-pane", RegexBuilderPane)
        builder.load_state(event.state, event.surface_id)
        self.query_one("#main-tabs", TabbedContent).active = "regex-tab"
        self.query_one("#regex-pattern", Input).focus()

    def apply_regex_builder(self, surface_id: str, state: SearchState) -> None:
        bar = self.search_bars.get(surface_id)
        if bar is None:
            self.notify(
                f"Search surface {surface_id!r} is not currently mounted.",
                severity="warning",
            )
            return
        bar.set_state(state, emit=True)
        self.notify("Regex applied to search.", title="Search")

    def action_help(self) -> None:
        self.push_screen(HelpDialog())

    async def action_quit(self) -> None:
        cheap_lfs = self.query_one("#cheap-lfs-pane", CheapLfsPane)
        if cheap_lfs.mutation_active:
            self.notify(
                cheap_lfs.mutation_warning(),
                title=cheap_lfs._t("cheap_lfs.quit_blocked"),
                severity="warning",
                timeout=600,
            )
            return
        self.exit()

    def _settings_values(self) -> SettingsValues:
        return self.query_one("#settings-pane", SettingsPane).collect_settings()

    def _preview_settings(self) -> None:
        values = self._settings_values()
        self.theme = "textual-light" if values["theme"] == "light" else "textual-dark"
        self.remove_class("comfortable", "dense")
        self.add_class("dense" if values["density"] == "compact" else "comfortable")
        accent_colors = {
            "violet": "#6750a4",
            "blue": "#0061a4",
            "green": "#386a20",
            "amber": "#825500",
            "rose": "#8c1d40",
        }
        self._apply_accent(accent_colors[str(values["accent"])])
        self._apply_element_overrides(values["element_overrides"])
        self.notify("Preview applied. Save to keep it.", title="Appearance")

    def _save_settings(self) -> None:
        values = self._settings_values()
        if self._config_store is None:
            self.notify(
                "Settings persistence is unavailable; preview remains active for this session.",
                severity="warning",
            )
            self._preview_settings()
            return
        try:
            accent_colors = {
                "violet": "#6750a4",
                "blue": "#0061a4",
                "green": "#386a20",
                "amber": "#825500",
                "rose": "#8c1d40",
            }
            language_modes = {
                "en": "english",
                "yue-HK": "cantonese",
                "bilingual": "bilingual",
            }

            def transform(current: Any) -> Any:
                appearance = replace(
                    current.appearance,
                    theme=str(values["theme"]),
                    density=str(values["density"]),
                    accent=accent_colors[str(values["accent"])],
                    reduced_motion=bool(values["reduced_motion"]),
                    element_overrides=dict(values["element_overrides"]),
                )
                language = replace(
                    current.language,
                    mode=language_modes[str(values["language"])],
                    english_funny_level=int(values["funny_level_english"]),
                    cantonese_funny_level=int(values["funny_level_cantonese"]),
                )
                interaction_values: tuple[tuple[str, object], ...] = (
                    ("editor", values["editor"]),
                    ("terminal", values["terminal"]),
                    ("narrator_enabled", values["narrator_enabled"]),
                    ("narrator_language", values["narrator_language"]),
                    ("quiet_hours_start", values["quiet_hours_start"]),
                    ("quiet_hours_end", values["quiet_hours_end"]),
                    ("reduced_sound", values["reduced_sound"]),
                    ("yield_to_screen_reader", values["yield_to_screen_reader"]),
                )
                interaction_changes = {
                    key: value
                    for key, value in interaction_values
                    if hasattr(current.interaction, key)
                }
                interaction = replace(current.interaction, **interaction_changes)
                return replace(
                    current,
                    appearance=appearance,
                    language=language,
                    interaction=interaction,
                )

            previous = self._config
            self._config = self._config_store.update(transform)
            if previous is not None and previous != self._config:
                self._settings_undo_stack.append(previous)
                self._settings_redo_stack.clear()
            if self._version_history_service is not None:
                self._version_history_service.record(
                    asdict(self._config),
                    label="Settings saved",
                )
        except Exception as error:
            self.notify(str(error), title="Save settings failed", severity="error")
            return
        self._apply_config()
        self._update_settings_history_status()
        self.notify("Settings saved with a local history snapshot.", title="Settings")

    def _apply_element_overrides(self, raw_overrides: object) -> None:
        """Apply terminal-safe per-surface style overrides live."""

        targets = {
            "workspace": "#workspace",
            "repository-rail": "#repository-rail",
            "toolbar": "#repository-toolbar",
            "tabs": "#main-tabs",
            "diff": "#changes-diff",
            "notifications": "#notifications-pane",
        }
        overrides = raw_overrides if isinstance(raw_overrides, dict) else {}
        for target, selector in targets.items():
            widget = self.query_one(selector)
            widget.styles.reset()
            override = overrides.get(target)
            if not isinstance(override, dict):
                continue
            foreground = str(override.get("foreground", "")).strip()
            background = str(override.get("background", "")).strip()
            styles = {str(style) for style in override.get("styles", []) if isinstance(style, str)}
            if foreground:
                widget.styles.color = foreground
            if background:
                widget.styles.background = background
            text_styles = styles & {"bold", "italic", "underline"}
            if text_styles:
                widget.styles.text_style = " ".join(sorted(text_styles))
            if "heavy-border" in styles:
                widget.styles.border = ("heavy", foreground or "#6750a4")

    def _apply_accent(self, accent: str) -> None:
        """Apply the persisted seed colour to live terminal controls."""

        for button in self.query("Button.-primary"):
            button.styles.background = accent
            button.styles.color = "#ffffff"
        self.query_one("#repository-tabs", Tabs).styles.color = accent

    def _reset_element_appearance(self) -> None:
        pane = self.query_one("#settings-pane", SettingsPane)
        target = pane.reset_selected_element()
        self._apply_element_overrides(pane.element_overrides)
        self.notify(
            f"Reset {target} appearance to its theme defaults.",
            title="Appearance",
        )

    def _update_settings_history_status(self) -> None:
        status = self.query_one("#settings-history-status", Static)
        if self._version_history_service is None:
            status.update("Local settings history is unavailable.")
            return
        try:
            versions = self._version_history_service.list_versions(limit=500)
            repository = self._version_history_service.repository_path
        except Exception as error:
            status.update(f"Local settings history is unavailable: {error}")
            return
        status.update(f"{len(versions)} local revision(s) · [dim]{repository}[/]")

    def _store_restored_config(self, config: Any, *, label: str) -> bool:
        if self._config_store is None:
            self.notify("Settings persistence is unavailable.", severity="error")
            return False
        try:
            self._config_store.save(config)
            if self._version_history_service is not None:
                self._version_history_service.record(asdict(config), label=label)
        except Exception as error:
            self.notify(str(error), title=f"{label} failed", severity="error")
            return False
        self._config = config
        self._apply_config()
        self._update_settings_history_status()
        self.notify(label, title="Settings")
        return True

    def _undo_settings(self) -> None:
        if self._config is None or not self._settings_undo_stack:
            self.notify("No settings change is available to undo.", severity="warning")
            return
        target = self._settings_undo_stack.pop()
        current = self._config
        if self._store_restored_config(target, label="Settings undo"):
            self._settings_redo_stack.append(current)
        else:
            self._settings_undo_stack.append(target)

    def _redo_settings(self) -> None:
        if self._config is None or not self._settings_redo_stack:
            self.notify("No settings change is available to redo.", severity="warning")
            return
        target = self._settings_redo_stack.pop()
        current = self._config
        if self._store_restored_config(target, label="Settings redo"):
            self._settings_undo_stack.append(current)
        else:
            self._settings_redo_stack.append(target)

    def _open_settings_history(self) -> None:
        if self._version_history_service is None:
            self.notify("Local settings history is unavailable.", severity="warning")
            return
        try:
            entries = self._version_history_service.list_versions(limit=250)
        except Exception as error:
            self.notify(str(error), title="History failed", severity="error")
            return
        self.push_screen(
            SettingsHistoryDialog(entries, self._version_history_service),
            self._restore_settings_revision,
        )

    def _restore_settings_revision(self, revision: str | None) -> None:
        if revision is None or self._version_history_service is None:
            return
        try:
            from .infrastructure.persistence import app_config_from_mapping

            snapshot = self._version_history_service.read(revision)
            config = app_config_from_mapping(snapshot.settings)
        except Exception as error:
            self.notify(str(error), title="Restore failed", severity="error")
            return
        current = self._config
        if self._store_restored_config(
            config,
            label=f"Restored settings {revision[:10]}",
        ):
            if current is not None:
                self._settings_undo_stack.append(current)
            self._settings_redo_stack.clear()

    def _detect_editors(self) -> None:
        editors = self._available_editors()
        if not editors:
            self.notify("No supported editor command was found on PATH.", severity="warning")
            return
        self.query_one("#settings-editor", Input).value = editors[0]
        self.notify(", ".join(editors), title="Detected editors")

    def _mark_notifications_read(self) -> None:
        if self._notification_service is None:
            return
        count = self._notification_service.mark_all_read()
        self._refresh_notification_centre()
        self.notify(f"Marked {count} notification(s) read.", title="Notifications")

    def _confirm_clear_notifications(self) -> None:
        if self._notification_service is None:
            return
        self.push_screen(
            DecisionDialog(
                "Clear notification history?",
                "This permanently removes the locally stored notification history.",
                confirm_label="Clear history",
                destructive=True,
                typed_confirmation="clear",
            ),
            lambda confirmed: self._clear_notifications() if confirmed else None,
        )

    def _clear_notifications(self) -> None:
        if self._notification_service is None:
            return
        notifications = self._notification_service.history(limit=10_000)
        for notification in notifications:
            self._notification_service.delete(notification.notification_id)
        self._refresh_notification_centre()
        self.notify(
            f"Removed {len(notifications)} notification(s).",
            title="Notifications",
        )

    def _available_editors(self) -> list[str]:
        configured = []
        for variable in ("VISUAL", "EDITOR"):
            value = os.environ.get(variable, "").strip()
            if value:
                configured.append(value)
        configured.extend(
            command
            for command in (
                "code",
                "codium",
                "zed",
                "nvim",
                "vim",
                "emacs",
                "subl",
                "idea",
                "pycharm",
                "kate",
                "gedit",
            )
            if shutil.which(command)
        )
        return list(dict.fromkeys(configured))

    def open_external_editor(self) -> None:
        if self.active_repository is None:
            self.notify("Open a repository first.", severity="warning")
            return
        editor = ""
        if self._config is not None:
            interaction = getattr(self._config, "interaction", self._config)
            editor = str(getattr(interaction, "editor", ""))
        if editor.casefold() == "auto":
            editor = ""
        if not editor:
            editors = self._available_editors()
            editor = editors[0] if editors else ""
        if not editor:
            self.notify(
                "No editor detected. Configure one in Settings → External editor.",
                severity="warning",
            )
            return
        try:
            argv = shlex.split(editor, posix=os.name != "nt")
        except ValueError as error:
            self.notify(str(error), title="Invalid editor command", severity="error")
            return
        argv.append(str(self.active_repository))
        executable = Path(argv[0]).name.lower()
        terminal_editors = {"vi", "vim", "nvim", "nano", "emacs", "helix", "hx"}
        try:
            if executable in terminal_editors:
                with self.suspend():
                    subprocess.run(  # noqa: S603 - argv is explicit; no shell
                        argv,
                        check=False,
                    )
                self.refresh_repository()
            else:
                subprocess.Popen(  # noqa: S603 - argv is explicit; no shell
                    argv,
                    cwd=self.active_repository,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=os.name != "nt",
                )
                self.notify(f"Opened {self.active_repository.name} in {argv[0]}.")
        except OSError as error:
            self.notify(str(error), title="Could not open editor", severity="error")
