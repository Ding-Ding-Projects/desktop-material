"""Desktop Material's Linux-first, mouse-capable Textual application."""

from __future__ import annotations

import asyncio
import os
import shlex
import shutil
import sqlite3
import subprocess
from collections.abc import Callable
from contextlib import suppress
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
    TextArea,
)

from .application.dim_sum import (
    DimSumLaunchContext,
    DimSumSurpriseController,
    is_within_quiet_hours,
    load_dim_sum_catalog,
)
from .application.path_input import (
    clone_url_embeds_http_credentials,
    inspect_clone_destination,
    path_from_user_input,
)
from .ui.screens.advanced import AdvancedPane
from .ui.screens.cheap_lfs import CheapLfsPane
from .ui.screens.dialogs import (
    CloneDialog,
    CloneRequest,
    CommandPaletteDialog,
    DecisionDialog,
    PaletteBuilderRequest,
    PaletteCommand,
    PaletteResult,
    PaletteSelection,
    PathDialog,
)
from .ui.screens.file_browser import FileBrowserPane
from .ui.screens.github import GitHubPane
from .ui.screens.help import HelpPane
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
from .ui.screens.settings import (
    SETTINGS_TARGETS,
    SettingsHistoryDialog,
    SettingsPane,
    SettingsValues,
)
from .ui.screens.tab_management import RepositoryTabsPane
from .ui.widgets.dim_sum_card import DimSumSurpriseCard
from .ui.widgets.png_picture import decode_png_picture, render_terminal_picture
from .ui.widgets.repository_splitter import RepositoryRailSplitter
from .ui.widgets.search_bar import SearchBar, SearchState

if TYPE_CHECKING:
    from .application.shell_state import PaletteSize
    from .infrastructure.persistence import RepositoryRecord


class _ClonePreflightError(ValueError):
    """A clone request that became unsafe before Git started."""


_CLONE_DESTINATION_ERRORS: dict[str, str] = {
    "invalid": "The clone destination is not a valid filesystem path.",
    "occupied": "The clone destination already exists and is not empty.",
    "parent": "The clone destination parent directory does not exist.",
    "symlink": "The clone destination is a symbolic link; choose a real directory.",
}


def _validated_clone_request(request: CloneRequest) -> tuple[str, Path]:
    """Return a safe source and target from a current filesystem inspection."""

    url = request.url.strip()
    if not url:
        raise _ClonePreflightError("The clone URL is empty.")
    if clone_url_embeds_http_credentials(url):
        raise _ClonePreflightError(
            "HTTP clone URLs with embedded credentials are not allowed. "
            "Use a credential helper or an SSH URL."
        )
    destination, problem = inspect_clone_destination(request.destination)
    if problem is not None:
        raise _ClonePreflightError(_CLONE_DESTINATION_ERRORS[problem])
    if destination is None:  # Defensive: the inspector always pairs this with a problem.
        raise _ClonePreflightError("The clone destination is not a valid filesystem path.")
    return url, destination


def _execute_clone_request(
    request: CloneRequest,
) -> tuple[Path, subprocess.CompletedProcess[str]]:
    """Recheck the request immediately before invoking Git without a shell."""

    url, destination = _validated_clone_request(request)
    git_executable = shutil.which("git")
    if git_executable is None:
        raise OSError("Git executable was not found on PATH.")
    result = subprocess.run(  # noqa: S603 - resolved executable, argv only, no shell
        [git_executable, "clone", "--", url, str(destination)],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
        shell=False,
    )
    return destination, result


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
        label: str | None = None,
        group_name: str | None = None,
        pinned: bool = False,
        favorite: bool = False,
    ) -> None:
        self.path = path
        marker = "●" if active else " "
        badges = " ".join(
            badge
            for badge, enabled in (
                ("[yellow]PIN[/]", pinned),
                ("[yellow]★[/]", favorite),
            )
            if enabled
        )
        display_label = label or path.name or str(path)
        group = f" · {group_name}" if group_name else ""
        state = (
            f"\n[dim]{branch or 'detached'} · "
            f"[green]↑{ahead}[/] [yellow]↓{behind}[/] · {changes} change(s){group}[/]"
        )
        super().__init__(
            Static(
                f"{marker} [b]{display_label}[/] {badges}\n[dim]{path}[/]{state}",
                markup=True,
            )
        )


class DesktopMaterialTUI(App[None]):
    """Full-screen terminal Git and GitHub workspace."""

    _TAB_KEYS: ClassVar[dict[str, str]] = {
        "#--content-tab-changes-tab": "nav.changes",
        "#--content-tab-files-tab": "nav.files",
        "#--content-tab-tab-manager-tab": "nav.repository_tabs",
        "#--content-tab-history-tab": "nav.history",
        "#--content-tab-branches-tab": "repository.branch",
        "#--content-tab-stashes-tab": "repository.stash",
        "#--content-tab-tools-tab": "nav.tools",
        "#--content-tab-cheap-lfs-tab": "nav.cheap_lfs",
        "#--content-tab-advanced-tab": "nav.advanced",
        "#--content-tab-github-tab": "nav.api",
        "#--content-tab-regex-tab": "search.regex_builder",
        "#--content-tab-help-tab": "nav.help",
        "#--content-tab-settings-tab": "common.settings",
        "#--content-tab-notifications-tab": "notifications.title",
    }
    _COMPACT_TAB_LABELS: ClassVar[dict[str, str]] = {
        "#--content-tab-changes-tab": "Chg",
        "#--content-tab-files-tab": "Files",
        "#--content-tab-tab-manager-tab": "Tabs",
        "#--content-tab-history-tab": "Hist",
        "#--content-tab-branches-tab": "Br",
        "#--content-tab-stashes-tab": "St",
        "#--content-tab-tools-tab": "Tools",
        "#--content-tab-cheap-lfs-tab": "LFS",
        "#--content-tab-advanced-tab": "Adv",
        "#--content-tab-github-tab": "GH",
        "#--content-tab-regex-tab": "RE2",
        "#--content-tab-help-tab": "Help",
        "#--content-tab-settings-tab": "Set",
        "#--content-tab-notifications-tab": "Bell",
    }

    TITLE = "Desktop Material TUI"
    SUB_TITLE = "Linux-first Git workspace"
    CSS_PATH = "ui/styles.tcss"
    ENABLE_COMMAND_PALETTE = False
    _STARTUP_MARKER_FILENAME = "startup-complete"

    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("ctrl+q", "quit", "Quit", priority=True),
        Binding("ctrl+p", "command_palette", "Commands", priority=True),
        Binding("ctrl+o", "open_repository", "Open", priority=True),
        Binding("ctrl+r", "refresh_repository", "Refresh"),
        Binding("ctrl+shift+f", "regex_builder", "Regex"),
        Binding("ctrl+shift+t", "manage_repository_tabs", "Tabs"),
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
        dim_sum_random_draw: Callable[[], float] | None = None,
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
        self._repository_workspace: Any | None = None
        self._repository_tab_paths: dict[str, Path] = {}
        self._repository_group_tabs: dict[str, str] = {}
        self._repository_close_protection: dict[Path, str] = {}
        self._refreshing_repository_tabs = False
        # The tab this app activated itself when it last rebuilt the strip.
        #
        # `_refreshing_repository_tabs` alone cannot cover it: assigning
        # `tabs.active` *posts* a message, and the flag is cleared on a refresh
        # boundary that the message queue can drain past. Textual also posts
        # `TabActivated` more than once for a single activation, so consuming
        # one message is not enough either — the survivor is read as the user
        # clicking a collapsed group chip, and collapsing a group immediately
        # expands it again. Holding the id until some *other* tab is activated
        # costs nothing: re-activating the already-active tab posts nothing at
        # all, so no real gesture hides behind this.
        self._app_activated_tab: str | None = None
        self._repository_tab_render_generation = 0
        self._translator: Any | None = None
        self._version_history_service: Any | None = None
        self._shell_state_service: Any | None = None
        self._palette_size: PaletteSize = "card"
        self._palette_search_state = SearchState()
        self._search_origin_tabs: dict[str, str] = {}
        self._settings_undo_stack: list[Any] = []
        self._settings_redo_stack: list[Any] = []
        self._preferred_repository_rail_width = RepositoryRailSplitter.DEFAULT_WIDTH
        self._first_run = True
        self._startup_had_error = False
        self._dim_sum_started = False
        self._dim_sum_random_draw = dim_sum_random_draw
        self._dim_sum_controller: DimSumSurpriseController | None = None
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
            yield RepositoryRailSplitter(id="repository-splitter")
            with Vertical(id="workspace"):
                with Horizontal(id="repository-tab-strip"):
                    yield Tabs(id="repository-tabs")
                    yield Button(
                        "Tabs…",
                        id="repository-tabs-menu",
                        tooltip="Search, arrange, group, import, export, or close tabs",
                    )
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
                    with TabPane("Files", id="files-tab"):
                        yield FileBrowserPane(id="files-pane", classes="screen-layout")
                    with TabPane("Tabs", id="tab-manager-tab"):
                        yield RepositoryTabsPane(
                            id="repository-tabs-pane",
                            classes="screen-layout",
                        )
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
                    with TabPane("Help", id="help-tab"):
                        yield HelpPane(id="help-pane", classes="screen-layout")
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
        self.query_one("#repository-tabs-pane", RepositoryTabsPane).bind_workspace(
            self._repository_workspace,
            on_changed=self._workspace_changed,
            on_close_requested=self._request_repository_tab_close,
        )
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
        self._refresh_repository_tab_safety()
        self.call_after_refresh(self._start_dim_sum_surprise)

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

        if severity == "error":
            self._startup_had_error = True
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
            startup_marker = paths.state_dir / self._STARTUP_MARKER_FILENAME
            self._first_run = not startup_marker.exists()
            if self._first_run:
                startup_marker.write_text("completed\n", encoding="utf-8")
                with suppress(OSError):
                    startup_marker.chmod(0o600)
            self._config_store = ConfigStore(paths)
            try:
                self._config = self._config_store.load()
            except (OSError, ValueError):
                self._startup_had_error = True
                self._config = self._config_store.load_or_default()
        except (ImportError, OSError, ValueError):
            self._startup_had_error = True
            self._config_store = None
            self._config = None
        if paths is None:
            self._notification_service = None
            self._persistence_database = None
            self._repository_workspace = None
            self._version_history_service = None
            self._shell_state_service = None
            self._palette_size = "card"
        else:
            try:
                from .application.notifications import NotificationService

                self._notification_service = NotificationService(paths)
                self._persistence_database = self._notification_service.database
            except (ImportError, OSError, ValueError):
                self._notification_service = None
                self._persistence_database = None
            if self._persistence_database is not None:
                try:
                    from .application.repository_workspace import (
                        RepositoryWorkspaceService,
                    )

                    profile = str(getattr(self._config, "active_profile", "local"))
                    self._repository_workspace = RepositoryWorkspaceService(
                        self._persistence_database,
                        profile,
                    )
                except (ImportError, OSError, ValueError):
                    self._repository_workspace = None
                try:
                    from .application.shell_state import ShellStateService

                    profile = str(getattr(self._config, "active_profile", "local"))
                    self._shell_state_service = ShellStateService(
                        self._persistence_database,
                        profile,
                    )
                    self._palette_size = self._shell_state_service.load().palette_size
                except (ImportError, OSError, ValueError, sqlite3.Error):
                    self._shell_state_service = None
                    self._palette_size = "card"
            else:
                self._shell_state_service = None
                self._palette_size = "card"
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
            self._apply_repository_rail_width()
            return
        appearance = getattr(self._config, "appearance", self._config)
        self._preferred_repository_rail_width = int(
            getattr(
                appearance,
                "repository_rail_width",
                RepositoryRailSplitter.DEFAULT_WIDTH,
            )
        )
        theme = self.theme_override or getattr(appearance, "theme", "dark")
        self.theme = "textual-light" if theme == "light" else "textual-dark"
        density = str(getattr(appearance, "density", "comfortable"))
        self.remove_class("comfortable", "dense")
        self.add_class("dense" if density in {"compact", "dense"} else "comfortable")
        self._apply_accent(str(getattr(appearance, "accent", "#6750a4")))
        settings = self.query_one("#settings-pane", SettingsPane)
        settings.load_settings(self._config)
        self._apply_element_overrides(getattr(appearance, "element_overrides", {}))
        self._apply_repository_rail_width()
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
        self.query_one("#help-pane", HelpPane).localize(translator)

    def _update_tab_labels(self) -> None:
        """Keep every workspace destination visible at compact widths."""

        translator = self._translator
        if translator is None:
            return
        compact = self.has_class("compact")
        fallback_labels = {
            "nav.files": "Files",
            "nav.repository_tabs": "Tabs",
            "nav.help": "Help",
        }
        for selector, key in self._TAB_KEYS.items():
            tab = self.query_one(selector, Tab)
            full_label = translator.t(key)
            if full_label == key:
                full_label = fallback_labels.get(key, full_label)
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
            self._apply_repository_rail_width(total_width=event.size.width)
            self._update_tab_labels()
            self._render_repository_tabs()

    @on(RepositoryRailSplitter.ResizeRequested)
    def _on_repository_splitter_resize(
        self,
        event: RepositoryRailSplitter.ResizeRequested,
    ) -> None:
        """Apply splitter movement live and persist explicit completed actions."""

        width = self._apply_repository_rail_width(width=event.width)
        if not event.persist:
            return
        self._preferred_repository_rail_width = width
        self._persist_repository_rail_width(width)

    def _apply_repository_rail_width(
        self,
        *,
        width: int | None = None,
        total_width: int | None = None,
    ) -> int:
        """Apply a clamped width while preserving at least 40 workspace cells."""

        available_width = self.size.width if total_width is None else total_width
        maximum_width = max(
            RepositoryRailSplitter.MINIMUM_WIDTH,
            available_width - RepositoryRailSplitter.WORKSPACE_MINIMUM_WIDTH - 1,
        )
        requested_width = self._preferred_repository_rail_width if width is None else width
        applied_width = min(
            max(requested_width, RepositoryRailSplitter.MINIMUM_WIDTH),
            maximum_width,
        )
        rail = self.query_one("#repository-rail", Vertical)
        splitter = self.query_one("#repository-splitter", RepositoryRailSplitter)
        rail.styles.width = applied_width
        splitter.set_width_limits(applied_width, maximum_width)
        return applied_width

    def _persist_repository_rail_width(self, width: int) -> None:
        """Persist a completed resize; history failure never rolls it back."""

        if self._config_store is None:
            return

        previous = self._config
        try:
            updated = self._config_store.update(
                lambda current: replace(
                    current,
                    appearance=replace(
                        current.appearance,
                        repository_rail_width=width,
                    ),
                )
            )
        except Exception as error:
            self.notify(
                str(error),
                title="Repository width was not saved",
                severity="warning",
            )
            return

        self._config = updated
        if previous is not None and previous != updated:
            self._settings_undo_stack.append(previous)
            self._settings_redo_stack.clear()
        if previous == updated:
            return
        if self._version_history_service is not None:
            try:
                self._version_history_service.record(
                    asdict(updated),
                    label="Repository rail resized",
                )
            except Exception as error:
                self.notify(
                    str(error),
                    title="Repository width history was not recorded",
                    severity="warning",
                )
        self._update_settings_history_status()

    def _start_dim_sum_surprise(self) -> None:
        """Begin the one allowed startup draw after the main shell is usable."""

        if self._dim_sum_started:
            return
        self._dim_sum_started = True
        self.run_worker(
            self._consider_dim_sum_surprise(),
            group="dim-sum-surprise",
            exclusive=True,
        )

    async def _consider_dim_sum_surprise(self) -> None:
        """Load, verify, decode, and mount an eligible bundled dish off-thread."""

        interaction = getattr(self._config, "interaction", self._config)
        quiet_hours = False
        if interaction is not None:
            quiet_hours = is_within_quiet_hours(
                str(getattr(interaction, "quiet_hours_start", "")),
                str(getattr(interaction, "quiet_hours_end", "")),
            )
        context = DimSumLaunchContext(
            first_run=self._first_run,
            error_state=self._startup_had_error,
            updating=os.environ.get("DMT_UPDATE_IN_PROGRESS") == "1",
            modal_open=len(self.screen_stack) > 1,
            quiet_hours=quiet_hours,
        )

        # A suppressed launch spends its one opportunity immediately. It must not
        # load 28 MiB of optional art or ambush the user after the condition clears.
        if any(
            (
                context.first_run,
                context.error_state,
                context.updating,
                context.modal_open,
                context.quiet_hours,
            )
        ):
            self._dim_sum_controller = DimSumSurpriseController(
                (), random_draw=self._dim_sum_random_draw
            )
            self._dim_sum_controller.consider(context)
            return

        asset_root = Path(__file__).parent / "assets" / "dim-sum"
        try:
            dishes = await asyncio.to_thread(
                load_dim_sum_catalog,
                asset_root / "manifest.json",
                asset_root,
            )
            self._dim_sum_controller = DimSumSurpriseController(
                dishes,
                random_draw=self._dim_sum_random_draw,
            )
            decision = self._dim_sum_controller.consider(context)
            if decision.dish is None:
                return
            picture = await asyncio.to_thread(
                decode_png_picture,
                decision.dish.image_path,
                columns=24,
                terminal_rows=8,
            )
            rendered_picture = render_terminal_picture(picture)
        except (OSError, TypeError, ValueError):
            # The optional delight may fail closed, but it never turns startup
            # into an error dialog or a delayed interruption.
            self._startup_had_error = True
            return

        if len(self.screen_stack) > 1 or self._startup_had_error:
            return
        await self.mount(
            DimSumSurpriseCard(
                decision.dish,
                rendered_picture,
                translator=self._translator,
                id="dim-sum-surprise",
            )
        )

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
            workspace_snapshot = (
                self._repository_workspace.snapshot()
                if self._repository_workspace is not None
                else None
            )
            records = (
                list(workspace_snapshot.records)
                if workspace_snapshot is not None
                else database.list_repositories(include_hidden=False)
            )
        except Exception:
            return False
        valid_records: list[RepositoryRecord] = []
        skipped_paths: list[Path] = []
        restored_services: dict[Path, Any] = {}
        for record in records:
            path = Path(getattr(record, "path", "")).expanduser().resolve()
            if not path.exists():
                skipped_paths.append(path)
                continue
            try:
                restored_services[path] = self._make_repository_service(path)
            except Exception as error:
                skipped_paths.append(path)
                self.notify(
                    f"{path}: {error}",
                    title="Skipped saved repository",
                    severity="warning",
                )
                continue
            valid_records.append(record)
        if skipped_paths and self._repository_workspace is not None:
            with suppress(OSError, RuntimeError, ValueError):
                self._repository_workspace.close_repositories(skipped_paths)
        self.repository_services = restored_services
        if not valid_records:
            return False
        restored_paths = set(restored_services)
        preferred_active = (
            workspace_snapshot.active_repository_path if workspace_snapshot is not None else None
        )
        if preferred_active in restored_paths:
            self.active_repository = preferred_active
        else:
            latest = max(
                valid_records,
                key=lambda record: (
                    getattr(record, "last_opened_at", None)
                    or datetime.min.replace(tzinfo=timezone.utc)
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
            if self._repository_workspace is not None:
                self._repository_workspace.open_repository(path)
        except (OSError, RuntimeError, ValueError):
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
        self._refresh_repository_tab_safety()
        self.notify(str(repository_path), title="Repository opened")

    def _refresh_repository_navigation(self) -> None:
        self._refresh_repository_list()
        self._render_repository_tabs()
        active = self.active_repository
        self.query_one("#active-repository", Static).update(
            f"[b]{active.name}[/]  [dim]{active}[/]" if active else "No repository open"
        )

    def _open_repository_records(self) -> tuple[RepositoryRecord, ...]:
        from .infrastructure.persistence import RepositoryRecord

        live_paths: dict[str, Path] = {}
        for path in self.repository_services:
            resolved = path.expanduser().resolve()
            live_paths.setdefault(os.path.normcase(str(resolved)), resolved)

        def live_records() -> tuple[RepositoryRecord, ...]:
            return tuple(RepositoryRecord(path=path) for path in live_paths.values())

        workspace = self._repository_workspace
        if workspace is None:
            return live_records()
        try:
            snapshot = workspace.snapshot()
        except (OSError, RuntimeError, ValueError):
            return live_records()

        records: list[RepositoryRecord] = []
        retained_keys: set[str] = set()
        for record in snapshot.records:
            key = os.path.normcase(str(record.path.expanduser().resolve()))
            if key not in live_paths or key in retained_keys:
                continue
            records.append(record)
            retained_keys.add(key)
        records.extend(
            RepositoryRecord(path=path)
            for key, path in live_paths.items()
            if key not in retained_keys
        )
        return tuple(records)

    @work(exclusive=True, group="repository-tabs-render")
    async def _render_repository_tabs(self) -> None:
        tabs = self.query_one("#repository-tabs", Tabs)
        records = self._open_repository_records()
        workspace = self._repository_workspace
        if workspace is not None:
            workspace_width = max(40, self.size.width - self._preferred_repository_rail_width)
            maximum_visible = max(2, min(8, workspace_width // 18))
            projection = workspace.strip_projection(maximum_visible)
            entries = projection.visible
            overflow_entries = projection.overflow
        else:
            from .application.repository_workspace import TabStripEntry

            entries = tuple(
                TabStripEntry(
                    identifier=f"repository-{index}",
                    label=record.path.name or str(record.path),
                    path=record.path,
                    group_name=None,
                    pinned=False,
                    favorite=False,
                )
                for index, record in enumerate(records)
            )
            overflow_entries = ()

        overflow_paths: set[Path] = set()
        for entry in overflow_entries:
            if entry.path is not None:
                overflow_paths.add(entry.path)
            elif entry.group_name is not None:
                overflow_paths.update(
                    record.path
                    for record in records
                    if record.group_name == entry.group_name and record.pinned == entry.pinned
                )
        overflow_count = len(overflow_paths)
        menu = self.query_one("#repository-tabs-menu", Button)
        menu.label = f"Tabs… +{overflow_count}" if overflow_count else "Tabs…"
        menu.tooltip = (
            f"Open the complete tab list; {overflow_count} tab(s) are in overflow."
            if overflow_count
            else "Search, arrange, group, import, export, or close tabs"
        )
        pane = self.query_one("#repository-tabs-pane", RepositoryTabsPane)
        pane.set_overflow_paths(overflow_paths)

        self._repository_tab_paths.clear()
        self._repository_group_tabs.clear()
        active_tab_id: str | None = None
        active_record = next(
            (record for record in records if record.path == self.active_repository),
            None,
        )
        self._repository_tab_render_generation += 1
        generation = self._repository_tab_render_generation
        self._refreshing_repository_tabs = True
        try:
            await tabs.clear()
            for entry in entries:
                if entry.path is not None:
                    self._repository_tab_paths[entry.identifier] = entry.path
                    if entry.path == self.active_repository:
                        active_tab_id = entry.identifier
                elif entry.group_name is not None:
                    self._repository_group_tabs[entry.identifier] = entry.group_name
                    if (
                        active_record is not None
                        and active_record.group_name == entry.group_name
                        and active_record.pinned == entry.pinned
                    ):
                        active_tab_id = entry.identifier
                await tabs.add_tab(Tab(entry.label, id=entry.identifier))
            self._app_activated_tab = active_tab_id
            if active_tab_id is not None:
                tabs.active = active_tab_id
        finally:
            self.call_after_refresh(self._complete_repository_tab_render, generation)

    def _complete_repository_tab_render(self, generation: int) -> None:
        if generation == self._repository_tab_render_generation:
            self._refreshing_repository_tabs = False

    @work(exclusive=True, group="repository-list")
    async def _refresh_repository_list(self) -> None:
        """Rebuild the filtered rail without racing asynchronous removals."""

        repo_list = self.query_one("#repository-list", ListView)
        repository_records = self._open_repository_records()
        visible_records = repository_records
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
                repository_records,
                state.query,
                mode=mode,
                flags=flags,
                get_text=lambda record: (
                    record.alias or record.path.name,
                    record.path.name,
                    str(record.path),
                    record.group_name or "",
                ),
            )
            if result.error is None:
                visible_records = tuple(result.items)
        except (ValueError, LookupError):
            visible_records = repository_records
        visible_paths = tuple(record.path for record in visible_records)
        summaries = dict(await self._repository_summaries(visible_paths))
        items = [
            RepositoryListItem(
                record.path,
                active=record.path == self.active_repository,
                branch=summaries[record.path][0],
                ahead=summaries[record.path][1],
                behind=summaries[record.path][2],
                changes=summaries[record.path][3],
                label=record.alias,
                group_name=record.group_name,
                pinned=record.pinned,
                favorite=record.favorite,
            )
            for record in visible_records
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

    def _bind_repository(self, service: Any | None) -> None:
        for pane in self.query(RepositoryPane):
            pane.bind_repository(service)
        self.query_one("#files-pane", FileBrowserPane).bind_repository(service)
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
        if (
            event.tabs.id != "repository-tabs"
            or not event.tab.id
            or self._refreshing_repository_tabs
        ):
            return
        # An activation this app performed is not the user asking for anything.
        if event.tab.id == self._app_activated_tab:
            return
        # Some other tab: the user has moved on, so the rebuild's own
        # activation is spent and coming back to it counts again.
        self._app_activated_tab = None
        path = self._repository_tab_paths.get(event.tab.id)
        if path is not None:
            self._activate_repository(path)
            return
        group_name = self._repository_group_tabs.get(event.tab.id)
        if group_name is None or self._repository_workspace is None:
            return
        try:
            self._repository_workspace.set_group_collapsed(group_name, False)
        except (OSError, RuntimeError, ValueError) as error:
            self.notify(str(error), title="Could not expand tab group", severity="error")
            return
        self._workspace_changed()

    def _activate_repository(self, path: Path) -> None:
        if path not in self.repository_services:
            return
        if path == self.active_repository:
            return
        self.active_repository = path
        if self._repository_workspace is not None:
            with suppress(OSError, RuntimeError, ValueError):
                self._repository_workspace.set_active(path)
        self._refresh_repository_navigation()
        self._bind_repository(self.repository_services[path])

    def _workspace_changed(self) -> None:
        """Reconcile runtime services with the durable ordered tab session."""

        workspace = self._repository_workspace
        if workspace is None:
            return
        try:
            snapshot = workspace.snapshot()
        except (OSError, RuntimeError, ValueError) as error:
            self.notify(str(error), title="Workspace refresh failed", severity="error")
            return
        reconciled: dict[Path, Any] = {}
        invalid: list[Path] = []
        for record in snapshot.records:
            path = record.path.expanduser().resolve()
            service = self.repository_services.get(path)
            if service is None:
                try:
                    service = self._make_repository_service(path)
                except Exception as error:
                    invalid.append(path)
                    self.notify(
                        f"{path}: {error}",
                        title="Skipped session repository",
                        severity="warning",
                    )
                    continue
            reconciled[path] = service
        if invalid:
            with suppress(OSError, RuntimeError, ValueError):
                snapshot = workspace.close_repositories(invalid)
        self.repository_services = reconciled
        self.repository_summaries = {
            path: summary
            for path, summary in self.repository_summaries.items()
            if path in reconciled
        }
        preferred = snapshot.active_repository_path
        self.active_repository = (
            preferred if preferred in reconciled else next(iter(reconciled), None)
        )
        self._refresh_repository_navigation()
        self._bind_repository(self.active_service)
        self.query_one("#repository-tabs-pane", RepositoryTabsPane).reload()
        self._refresh_repository_tab_safety()

    def _request_repository_tab_close(self, paths: tuple[Path, ...]) -> None:
        self._close_repository_tabs(paths)

    @work(exclusive=True, group="repository-tab-close")
    async def _close_repository_tabs(self, paths: tuple[Path, ...]) -> None:
        """Revalidate every reviewed candidate immediately before closing."""

        workspace = self._repository_workspace
        if workspace is None:
            return
        current_paths = {record.path for record in workspace.snapshot().records}
        requested = tuple(dict.fromkeys(path.expanduser().resolve() for path in paths))
        if not requested or any(path not in current_paths for path in requested):
            self.notify(
                "The tab set changed after preview; review the close list again.",
                title="Tabs stayed open",
                severity="warning",
            )
            return
        blockers = await self._repository_close_blockers(requested)
        if blockers:
            self._repository_close_protection.update(blockers)
            self.query_one("#repository-tabs-pane", RepositoryTabsPane).set_protected_paths(
                self._repository_close_protection
            )
            detail = ", ".join(f"{path.name}: {reason}" for path, reason in blockers.items())
            self.notify(
                detail,
                title="Tabs stayed open because work is protected",
                severity="warning",
                timeout=20,
            )
            return
        try:
            workspace.close_repositories(requested)
        except (OSError, RuntimeError, ValueError) as error:
            self.notify(str(error), title="Close tabs failed", severity="error")
            return
        self._workspace_changed()
        self.notify(
            f"Closed {len(requested)} repository tab(s). No directory or Git state was deleted.",
            title="Repository tabs",
        )

    async def _repository_close_blockers(
        self,
        paths: tuple[Path, ...],
    ) -> dict[Path, str]:
        blockers = self._draft_close_protection(paths)

        async def inspect(path: Path) -> tuple[Path, str | None]:
            service = self.repository_services.get(path)
            if service is None:
                return path, "repository service is unavailable"
            try:
                status = await asyncio.to_thread(service.status)
            except Exception:
                return path, "repository status could not be verified"
            if getattr(status, "changes", ()):
                return path, "working-tree changes are present"
            return path, None

        results = await asyncio.gather(*(inspect(path) for path in paths))
        blockers.update({path: reason for path, reason in results if reason is not None})
        return blockers

    def _draft_close_protection(self, paths: tuple[Path, ...]) -> dict[Path, str]:
        active = self.active_repository
        if active is None or active not in paths:
            return {}
        try:
            summary = self.query_one("#commit-summary", Input).value.strip()
            body = self.query_one("#commit-body", TextArea).text.strip()
        except (AttributeError, LookupError):
            return {active: "commit draft status could not be verified"}
        return {active: "an unsubmitted commit message is present"} if summary or body else {}

    @work(exclusive=True, group="repository-tab-safety")
    async def _refresh_repository_tab_safety(self) -> None:
        paths = tuple(self.repository_services)
        if not paths:
            self._repository_close_protection = {}
        else:
            self._repository_close_protection = await self._repository_close_blockers(paths)
        self.query_one("#repository-tabs-pane", RepositoryTabsPane).set_protected_paths(
            self._repository_close_protection
        )

    def action_manage_repository_tabs(self) -> None:
        self.query_one("#main-tabs", TabbedContent).active = "tab-manager-tab"
        self.query_one("#repository-tabs-pane", RepositoryTabsPane).reload()
        self._refresh_repository_tab_safety()
        self.call_later(self.query_one("#repository-tabs-query", Input).focus)

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
        elif button_id == "repository-tabs-menu":
            self.action_manage_repository_tabs()
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
        try:
            await asyncio.to_thread(_validated_clone_request, request)
        except _ClonePreflightError as error:
            self.notify(str(error), title="Clone failed", severity="error", timeout=15)
            return
        self.notify("Cloning in the background…", title="Clone")
        try:
            destination, result = await asyncio.to_thread(_execute_clone_request, request)
        except _ClonePreflightError as error:
            self.notify(str(error), title="Clone failed", severity="error", timeout=15)
            return
        except subprocess.TimeoutExpired:
            self.notify(
                "git clone timed out after 600 seconds.",
                title="Clone failed",
                severity="error",
                timeout=15,
            )
            return
        except OSError as error:
            self.notify(str(error), title="Clone failed", severity="error", timeout=15)
            return
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
        self.query_one("#files-pane", FileBrowserPane).reload()
        self._update_toolbar_status()
        self._refresh_repository_tab_safety()

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
        self.push_screen(
            CommandPaletteDialog(
                self._palette_commands(),
                size=self._palette_size,
                initial_search=self._palette_search_state,
                on_size_changed=self._save_palette_size,
            ),
            self._run_palette_result,
        )

    def _palette_commands(self) -> tuple[PaletteCommand, ...]:
        commands = (
            PaletteCommand(
                "open",
                "Open repository",
                "Add an existing local repository",
                "Ctrl+O",
                "Repository",
            ),
            PaletteCommand("clone", "Clone repository", "Clone a Git URL", group="Repository"),
            PaletteCommand(
                "new",
                "Create repository",
                "Initialize a new Git repository",
                group="Repository",
            ),
            PaletteCommand(
                "refresh",
                "Refresh repository",
                "Reload status and all panes",
                "Ctrl+R",
                "Repository",
            ),
            PaletteCommand("fetch", "Fetch", "Download remote refs", "F5", "Repository"),
            PaletteCommand(
                "pull", "Pull", "Fetch and integrate the upstream branch", group="Repository"
            ),
            PaletteCommand("push", "Push", "Publish local commits", "Ctrl+Shift+P", "Repository"),
            PaletteCommand("changes", "Show Changes", "Stage, diff, and commit", group="Navigate"),
            PaletteCommand(
                "files", "Show Files", "Browse and preview repository files", group="Navigate"
            ),
            PaletteCommand(
                "repository-tabs",
                "Manage repository tabs",
                "Search, arrange, group, import, export, or close tabs",
                "Ctrl+Shift+T",
                "Navigate",
            ),
            PaletteCommand("history", "Show History", "Browse commits", group="Navigate"),
            PaletteCommand(
                "branches",
                "Show Branches",
                "Checkout, merge, create, or delete",
                group="Navigate",
            ),
            PaletteCommand(
                "stashes", "Show Stashes", "Create, apply, pop, or drop", group="Navigate"
            ),
            PaletteCommand(
                "tools", "Show Repository tools", "Remotes, tags, and diagnostics", group="Navigate"
            ),
            PaletteCommand(
                "cheap-lfs",
                "Show Cheap LFS",
                "Preview, track, verify, and restore large files",
                group="Navigate",
            ),
            PaletteCommand(
                "advanced",
                "Show Advanced tools",
                "Worktrees, submodules, sparse checkout, reflog, build, and run",
                group="Navigate",
            ),
            PaletteCommand(
                "github",
                "Show GitHub",
                "Issues, PRs, Actions, releases, packages",
                group="Navigate",
            ),
            PaletteCommand(
                "regex",
                "Open regex builder",
                "Guided RE2 construction",
                "Ctrl+Shift+F",
                "Navigate",
            ),
            PaletteCommand(
                "changelog",
                "Release history",
                "Search, copy, and export every recorded release",
                group="Help",
                keywords=("changelog", "versions", "更新記錄", "版本歷史"),
            ),
            PaletteCommand(
                "settings",
                "Open Settings",
                "Appearance, language, sound, editor",
                group="Navigate",
            ),
            PaletteCommand(
                "notifications",
                "Open Notifications",
                "Review notification history",
                group="Navigate",
            ),
            PaletteCommand(
                "editor", "Open external editor", "Use the configured editor", group="Repository"
            ),
            PaletteCommand(
                "help",
                "Open Help",
                "Mouse, keyboard, text field, and safety guide",
                "F1",
                "Help",
            ),
            PaletteCommand("quit", "Quit", "Close Desktop Material TUI", "Ctrl+Q"),
        )
        setting_commands = tuple(
            PaletteCommand(
                f"setting-{target.key}",
                target.english_name,
                target.english_description,
                group="Settings",
                keywords=(
                    target.cantonese_name,
                    target.cantonese_description,
                    *target.keywords,
                ),
            )
            for target in SETTINGS_TARGETS
        )
        return commands + setting_commands

    def _run_palette_result(self, result: PaletteResult | None) -> None:
        if isinstance(result, PaletteBuilderRequest):
            self._palette_search_state = result.state
            builder = self.query_one("#regex-pane", RegexBuilderPane)
            builder.load_state(result.state, "palette")
            self.query_one("#main-tabs", TabbedContent).active = "regex-tab"
            self.call_after_refresh(self.query_one("#regex-pattern", Input).focus)
            return
        if isinstance(result, PaletteSelection):
            self._palette_search_state = SearchState()
            # A modal result callback runs while Textual is still resuming the
            # underlying screen. ContentTabs also completes its activation
            # messages on the next update tick, so route after that settle
            # window rather than letting the old tab overwrite the command.
            self.set_timer(
                0.1,
                lambda: self._run_palette_command(result.command_id),
            )

    def _run_palette_command(self, command_id: str | None) -> None:
        if command_id is None:
            return
        if command_id.startswith("setting-"):
            target = command_id.removeprefix("setting-")
            self.screen.set_focus(None)
            self.query_one("#main-tabs", TabbedContent).active = "settings-tab"
            settings = self.query_one("#settings-pane", SettingsPane)
            self.call_after_refresh(settings.focus_target, target)
            return
        tab_map = {
            "changes": "changes-tab",
            "files": "files-tab",
            "repository-tabs": "tab-manager-tab",
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
            # The modal restores the control that was focused underneath it.
            # Clear that focus before switching panes so a focused control in
            # the previous pane cannot reactivate its TabPane afterward.
            self.screen.set_focus(None)
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
            "changelog": self.action_changelog,
        }
        action = actions.get(command_id)
        if action:
            action()

    def action_regex_builder(self) -> None:
        self.query_one("#main-tabs", TabbedContent).active = "regex-tab"
        self.query_one("#regex-pattern", Input).focus()

    def on_search_bar_builder_requested(self, event: SearchBar.BuilderRequested) -> None:
        active_tab = self.query_one("#main-tabs", TabbedContent).active
        if active_tab is not None:
            self._search_origin_tabs[event.surface_id] = active_tab
        builder = self.query_one("#regex-pane", RegexBuilderPane)
        builder.load_state(event.state, event.surface_id)
        self.query_one("#main-tabs", TabbedContent).active = "regex-tab"
        self.query_one("#regex-pattern", Input).focus()

    def apply_regex_builder(self, surface_id: str, state: SearchState) -> None:
        if surface_id == "palette":
            self._palette_search_state = state
            self.notify("Regex applied to command search.", title="Search")
            self.call_later(self.action_command_palette)
            return
        bar = self.search_bars.get(surface_id)
        if bar is None:
            self.notify(
                f"Search surface {surface_id!r} is not currently mounted.",
                severity="warning",
            )
            return
        origin_tab = self._search_origin_tabs.pop(surface_id, None)
        if origin_tab is not None:
            self.query_one("#main-tabs", TabbedContent).active = origin_tab

        def apply_to_origin() -> None:
            bar.set_state(state, emit=True)
            bar.query_one(Input).focus()

        # Applying while the origin is hidden races its resume-time widget
        # messages. Restore the tab first, then synchronize the mounted bar.
        self.call_after_refresh(apply_to_origin)
        self.notify("Regex applied to search.", title="Search")

    def action_help(self) -> None:
        self.query_one("#main-tabs", TabbedContent).active = "help-tab"
        self.query_one("#help-pane", HelpPane).open_guide()

    def action_changelog(self) -> None:
        self.query_one("#main-tabs", TabbedContent).active = "help-tab"
        self.query_one("#help-pane", HelpPane).open_changelog()

    def _save_palette_size(self, size: PaletteSize) -> None:
        self._palette_size = size
        if self._shell_state_service is None:
            self.notify(
                "The command palette size changed for this session but could not be persisted.",
                severity="warning",
            )
            return
        try:
            self._shell_state_service.save_palette_size(size)
        except (OSError, ValueError, sqlite3.Error) as error:
            self.notify(str(error), title="Palette size was not saved", severity="error")

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
        self._open_external_editor_target(
            self.active_repository,
            workspace_root=self.active_repository,
        )

    @on(FileBrowserPane.OpenRequested)
    def _open_file_browser_selection(self, event: FileBrowserPane.OpenRequested) -> None:
        repository = self.active_repository
        if repository is None:
            self.notify("Open a repository first.", severity="warning")
            return
        try:
            selected = event.path.expanduser().resolve(strict=True)
            selected.relative_to(repository.expanduser().resolve(strict=True))
        except (OSError, ValueError) as error:
            self.notify(
                str(error),
                title="File is outside the active repository",
                severity="error",
            )
            return
        self._open_external_editor_target(selected, workspace_root=repository)

    def _open_external_editor_target(self, target: Path, *, workspace_root: Path) -> None:
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
        executable = Path(argv[0]).name.lower()
        terminal_editors = {"vi", "vim", "nvim", "nano", "emacs", "helix", "hx"}
        visual_studio_code = {"code", "code-insiders", "codium"}
        if executable in visual_studio_code and target != workspace_root:
            argv.extend((str(workspace_root), "--goto", str(target)))
        else:
            argv.append(str(target))
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
                    cwd=workspace_root,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=os.name != "nt",
                )
                self.notify(f"Opened {target.name} in {argv[0]}.")
        except OSError as error:
            self.notify(str(error), title="Could not open editor", severity="error")
