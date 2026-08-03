"""Decision, path, command, and help overlays."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

from textual import events, on
from textual.app import ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    DirectoryTree,
    Input,
    Label,
    ListItem,
    ListView,
    Markdown,
    Static,
)

from ...application.path_input import (
    clone_destination_for_url,
    clone_url_embeds_http_credentials,
    inspect_clone_destination,
    normalize_path_input,
    path_from_user_input,
)
from ...application.search import RegexFlags, SearchMode, SearchService
from ...application.shell_state import PaletteSize
from ..i18n import Translator, get_translator
from ..widgets.responsive_layout import ResponsiveFormRow, ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState


class DecisionDialog(ModalScreen[bool]):
    """A blocking dialog reserved for a decision the user must make."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]

    def __init__(
        self,
        title: str,
        body: str,
        *,
        confirm_label: str = "Confirm",
        cancel_label: str = "Cancel",
        destructive: bool = False,
        typed_confirmation: str | None = None,
        typed_prompt: str | None = None,
    ) -> None:
        super().__init__()
        self.dialog_title = title
        self.body = body
        self.confirm_label = confirm_label
        self.cancel_label = cancel_label
        self.destructive = destructive
        self.typed_confirmation = typed_confirmation
        self.typed_prompt = typed_prompt

    def compose(self) -> ComposeResult:
        with Vertical(id="decision-card", classes="modal-card"):
            yield Label(self.dialog_title, classes="modal-title")
            yield Markdown(self.body, classes="modal-body")
            if self.typed_confirmation is not None:
                yield Label(
                    self.typed_prompt or f"Type {self.typed_confirmation!r} to continue:",
                    classes="field-label modal-prompt",
                )
                yield Input(
                    placeholder=self.typed_confirmation,
                    id="decision-confirmation",
                    select_on_focus=False,
                )
            with ScrollableToolbar(classes="modal-actions"):
                yield Button(self.cancel_label, id="decision-cancel")
                yield Button(
                    self.confirm_label,
                    id="decision-confirm",
                    variant="error" if self.destructive else "primary",
                    disabled=self.typed_confirmation is not None,
                )

    def on_mount(self) -> None:
        target = (
            self.query_one("#decision-confirmation", Input)
            if self.typed_confirmation is not None
            else self.query_one("#decision-confirm", Button)
        )
        target.focus()

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id != "decision-confirmation":
            return
        confirm = self.query_one("#decision-confirm", Button)
        confirm.disabled = event.value != self.typed_confirmation

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "decision-confirmation" and event.value == self.typed_confirmation:
            self.dismiss(True)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "decision-confirm":
            self.dismiss(True)
        elif event.button.id == "decision-cancel":
            self.dismiss(False)

    def action_cancel(self) -> None:
        self.dismiss(False)


class PathInput(Input):
    """Path entry that normalizes wrappers introduced by clipboard paste."""

    @staticmethod
    def _paste_value(value: str) -> str:
        """Return one normalized path from a potentially multiline paste."""

        lines = value.splitlines()
        first_line = lines[0] if lines else value
        return normalize_path_input(first_line)

    def _on_paste(self, event: events.Paste) -> None:
        if event.text:
            line = self._paste_value(event.text)
            selection = self.selection
            if selection.is_empty:
                self.insert_text_at_cursor(line)
            else:
                self.replace(line, *selection)
        event.prevent_default()
        event.stop()

    def action_paste(self) -> None:
        """Paste a normalized path from Textual's local clipboard."""

        value = self._paste_value(self.app.clipboard)
        start, end = self.selection
        self.replace(value, start, end)


class FolderDirectoryTree(DirectoryTree):
    """Terminal-native file browser used to choose repository directories."""


def _browser_root(value: str) -> Path:
    """Find the nearest existing directory suitable for a tree root."""

    normalized = normalize_path_input(value)
    try:
        candidate = Path(normalized).expanduser() if normalized else Path.cwd()
        if not candidate.is_absolute():
            candidate = Path.cwd() / candidate
        while not candidate.is_dir():
            parent = candidate.parent
            if parent == candidate:
                break
            candidate = parent
        if candidate.is_dir():
            return candidate.resolve()
    except (OSError, RuntimeError, ValueError):
        pass

    try:
        home = Path.home()
        if home.is_dir():
            return home.resolve()
    except (OSError, RuntimeError, ValueError):
        pass
    try:
        working_directory = Path.cwd()
        if working_directory.is_dir():
            return working_directory.resolve()
    except (OSError, RuntimeError, ValueError):
        pass
    return Path()


class PathDialog(ModalScreen[str | None]):
    """Mouse- and keyboard-friendly repository path entry and folder browser."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]

    def __init__(
        self,
        title: str,
        *,
        initial: str = "",
        placeholder: str = "/path/to/repo",
        submit_label: str | None = None,
    ) -> None:
        super().__init__()
        self.dialog_title = title
        self.initial = initial
        self.placeholder = placeholder
        self._translator: Translator = get_translator()
        self.submit_label = submit_label or self._translator.t("common.open")

    def compose(self) -> ComposeResult:
        with Vertical(id="path-card", classes="modal-card browser-open"):
            yield Label(self.dialog_title, classes="modal-title")
            with ResponsiveFormRow(id="path-entry-row"):
                yield PathInput(
                    value=self.initial,
                    placeholder=self.placeholder,
                    id="path-input",
                    select_on_focus=False,
                )
                yield Button(
                    self._translator.t("path.browser.hide"),
                    id="path-browse",
                    tooltip=self._translator.t("path.browser.hide_tooltip"),
                )
            with Vertical(id="path-browser-region"):
                with ScrollableToolbar(id="path-browser-toolbar"):
                    yield Button(
                        self._translator.t("path.browser.up"),
                        id="path-browser-up",
                        tooltip=self._translator.t("path.browser.up_tooltip"),
                    )
                    yield Button(
                        self._translator.t("path.browser.home"),
                        id="path-browser-home",
                        tooltip=self._translator.t("path.browser.home_tooltip"),
                    )
                yield FolderDirectoryTree(
                    _browser_root(self.initial),
                    id="path-browser",
                    name=self._translator.t("path.browser.name"),
                )
            with ScrollableToolbar(classes="modal-actions"):
                yield Button(self._translator.t("common.cancel"), id="path-cancel")
                yield Button(self.submit_label, id="path-open", variant="primary")

    def on_mount(self) -> None:
        self.query_one("#path-input", PathInput).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "path-input":
            self._submit()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "path-open":
            self._submit()
        elif event.button.id == "path-cancel":
            self.dismiss(None)
        elif event.button.id == "path-browse":
            self._toggle_browser()
        elif event.button.id == "path-browser-up":
            tree = self.query_one("#path-browser", FolderDirectoryTree)
            self._set_browser_root(Path(tree.path).parent)
        elif event.button.id == "path-browser-home":
            self._set_browser_root(_browser_root("~"))

    def on_directory_tree_directory_selected(
        self,
        event: DirectoryTree.DirectorySelected,
    ) -> None:
        if event.control.id != "path-browser":
            return
        path_input = self.query_one("#path-input", PathInput)
        selected_path = str(event.path)
        path_input.value = selected_path
        path_input.cursor_position = len(selected_path)

    def on_directory_tree_file_selected(self, event: DirectoryTree.FileSelected) -> None:
        if event.control.id != "path-browser":
            return
        path_input = self.query_one("#path-input", PathInput)
        selected_parent = str(event.path.parent)
        path_input.value = selected_parent
        path_input.cursor_position = len(selected_parent)

    def _toggle_browser(self) -> None:
        card = self.query_one("#path-card", Vertical)
        browse = self.query_one("#path-browse", Button)
        if card.has_class("browser-open"):
            card.remove_class("browser-open")
            browse.label = self._translator.t("path.browser.browse")
            browse.tooltip = self._translator.t("path.browser.browse_tooltip")
            self.query_one("#path-input", PathInput).focus()
            return

        value = self.query_one("#path-input", PathInput).value
        self._set_browser_root(_browser_root(value))
        card.add_class("browser-open")
        browse.label = self._translator.t("path.browser.hide")
        browse.tooltip = self._translator.t("path.browser.hide_tooltip")
        self.query_one("#path-browser", FolderDirectoryTree).focus()

    def _set_browser_root(self, root: Path) -> None:
        tree = self.query_one("#path-browser", FolderDirectoryTree)
        tree.path = _browser_root(str(root))

    def _submit(self) -> None:
        path_input = self.query_one("#path-input", PathInput)
        value = normalize_path_input(path_input.value)
        path_input.value = value
        if not value:
            path_input.focus()
            return
        self.dismiss(value)

    def action_cancel(self) -> None:
        self.dismiss(None)


@dataclass(frozen=True)
class CloneRequest:
    url: str
    destination: str


class CloneDialog(ModalScreen[CloneRequest | None]):
    """Clone URL, safe working-directory default, and folder browser."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]
    DEFAULT_CSS = """
    CloneDialog #clone-card {
        height: 90vh;
    }

    CloneDialog #clone-content {
        width: 100%;
        height: 1fr;
    }

    CloneDialog #clone-destination-row {
        width: 100%;
        height: 3;
    }

    .narrow CloneDialog #clone-destination-row {
        height: 6;
    }

    CloneDialog #clone-destination {
        width: 1fr;
    }

    CloneDialog #clone-browse {
        width: auto;
        min-width: 10;
        margin-left: 1;
    }

    .narrow CloneDialog #clone-browse {
        margin-left: 0;
    }

    CloneDialog #clone-browser-region {
        width: 100%;
        height: 1fr;
        min-height: 8;
    }

    CloneDialog #clone-browser-toolbar {
        width: 100%;
        height: 3;
        overflow-x: auto;
    }

    CloneDialog #clone-browser-toolbar Button {
        width: auto;
        min-width: 9;
        margin-right: 1;
    }

    CloneDialog #clone-browser {
        width: 100%;
        height: 1fr;
        min-height: 4;
    }

    CloneDialog #clone-error {
        width: 100%;
        height: auto;
        min-height: 1;
        color: $error;
    }

    CloneDialog #clone-card.browser-closed #clone-browser-region,
    CloneDialog #clone-card.browser-closed .clone-parent-label {
        display: none;
    }
    """

    def __init__(self, working_directory: str | Path | None = None) -> None:
        super().__init__()
        try:
            candidate = path_from_user_input(working_directory or Path.cwd()).resolve()
            self.working_directory = candidate if candidate.is_dir() else Path.cwd().resolve()
        except (OSError, RuntimeError, ValueError):
            self.working_directory = _browser_root("")
        self._translator = get_translator()
        self._automatic_destination = str(clone_destination_for_url("", self.working_directory))
        self._destination_user_edited = False

    def compose(self) -> ComposeResult:
        with Vertical(id="clone-card", classes="modal-card browser-open"):
            with VerticalScroll(id="clone-content"):
                yield Label(self._translator.t("repository.clone"), classes="modal-title")
                yield Label(self._translator.t("clone.url"), classes="field-label")
                yield Input(
                    placeholder="https://github.com/owner/repository.git",
                    id="clone-url",
                    select_on_focus=False,
                )
                yield Label(self._translator.t("clone.destination"), classes="field-label")
                with ResponsiveFormRow(id="clone-destination-row"):
                    yield PathInput(
                        value=self._automatic_destination,
                        placeholder="/home/you/src/repository",
                        id="clone-destination",
                        select_on_focus=True,
                    )
                    yield Button(
                        self._translator.t("path.browser.hide"),
                        id="clone-browse",
                        tooltip=self._translator.t("path.browser.hide_tooltip"),
                    )
                yield Label(
                    self._translator.t("clone.parent"),
                    classes="field-label clone-parent-label",
                )
                with Vertical(id="clone-browser-region"):
                    with ScrollableToolbar(id="clone-browser-toolbar"):
                        yield Button(
                            self._translator.t("path.browser.up"),
                            id="clone-browser-up",
                            tooltip=self._translator.t("path.browser.up_tooltip"),
                        )
                        yield Button(
                            self._translator.t("path.browser.home"),
                            id="clone-browser-home",
                            tooltip=self._translator.t("path.browser.home_tooltip"),
                        )
                        yield Button(
                            self._translator.t("clone.working"),
                            id="clone-browser-working",
                            tooltip=self._translator.t("clone.working_tooltip"),
                        )
                    yield FolderDirectoryTree(
                        self.working_directory,
                        id="clone-browser",
                        name=self._translator.t("path.browser.name"),
                    )
                yield Static("", id="clone-error")
            with ScrollableToolbar(classes="modal-actions"):
                yield Button(self._translator.t("common.cancel"), id="clone-cancel")
                yield Button(
                    self._translator.t("repository.clone"),
                    id="clone-submit",
                    variant="primary",
                )

    def on_mount(self) -> None:
        self.query_one("#clone-url", Input).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "clone-url":
            self.query_one("#clone-destination", PathInput).focus()
        else:
            self._submit()

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id == "clone-destination":
            if event.value != self._automatic_destination:
                self._destination_user_edited = True
            return
        if event.input.id != "clone-url":
            return

        destination_input = self.query_one("#clone-destination", PathInput)
        may_replace = (
            not self._destination_user_edited
            or destination_input.value == self._automatic_destination
        )
        self._automatic_destination = str(
            clone_destination_for_url(event.value, self.working_directory)
        )
        if may_replace:
            destination_input.value = self._automatic_destination
            destination_input.cursor_position = len(self._automatic_destination)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "clone-submit":
            self._submit()
        elif event.button.id == "clone-cancel":
            self.dismiss(None)
        elif event.button.id == "clone-browse":
            self._toggle_browser()
        elif event.button.id == "clone-browser-up":
            tree = self.query_one("#clone-browser", FolderDirectoryTree)
            self._set_browser_root(Path(tree.path).parent)
        elif event.button.id == "clone-browser-home":
            self._set_browser_root(_browser_root("~"))
        elif event.button.id == "clone-browser-working":
            self._set_browser_root(self.working_directory)

    def on_directory_tree_directory_selected(
        self,
        event: DirectoryTree.DirectorySelected,
    ) -> None:
        if event.control.id != "clone-browser":
            return
        destination = str(
            clone_destination_for_url(
                self.query_one("#clone-url", Input).value,
                event.path,
            )
        )
        self._destination_user_edited = True
        destination_input = self.query_one("#clone-destination", PathInput)
        destination_input.value = destination
        destination_input.cursor_position = len(destination)
        self._clear_error()

    def on_directory_tree_file_selected(self, event: DirectoryTree.FileSelected) -> None:
        if event.control.id != "clone-browser":
            return
        destination = str(
            clone_destination_for_url(
                self.query_one("#clone-url", Input).value,
                event.path.parent,
            )
        )
        self._destination_user_edited = True
        destination_input = self.query_one("#clone-destination", PathInput)
        destination_input.value = destination
        destination_input.cursor_position = len(destination)
        self._clear_error()

    def _toggle_browser(self) -> None:
        card = self.query_one("#clone-card", Vertical)
        browse = self.query_one("#clone-browse", Button)
        if card.has_class("browser-open"):
            card.remove_class("browser-open")
            card.add_class("browser-closed")
            browse.label = self._translator.t("path.browser.browse")
            browse.tooltip = self._translator.t("path.browser.browse_tooltip")
            self.query_one("#clone-destination", PathInput).focus()
            return
        card.remove_class("browser-closed")
        card.add_class("browser-open")
        browse.label = self._translator.t("path.browser.hide")
        browse.tooltip = self._translator.t("path.browser.hide_tooltip")
        self.query_one("#clone-browser", FolderDirectoryTree).focus()

    def _set_browser_root(self, root: Path) -> None:
        self.query_one("#clone-browser", FolderDirectoryTree).path = _browser_root(str(root))

    def _clear_error(self) -> None:
        self.query_one("#clone-error", Static).update("")

    def _show_error(self, message: str, *, focus: Input) -> None:
        self.query_one("#clone-error", Static).update(message)
        focus.focus()

    def _submit(self) -> None:
        url = self.query_one("#clone-url", Input).value.strip()
        destination_input = self.query_one("#clone-destination", PathInput)
        destination = normalize_path_input(destination_input.value)
        destination_input.value = destination
        if not url:
            self._show_error(
                self._translator.t("clone.error.url"),
                focus=self.query_one("#clone-url", Input),
            )
            return
        if clone_url_embeds_http_credentials(url):
            self._show_error(
                self._translator.t("clone.error.credentials"),
                focus=self.query_one("#clone-url", Input),
            )
            return
        if not destination:
            self._show_error(
                self._translator.t("clone.error.destination"),
                focus=destination_input,
            )
            return
        _destination_path, problem = inspect_clone_destination(destination)
        if problem is not None:
            problem_key = {
                "invalid": "clone.error.destination",
                "occupied": "clone.error.occupied",
                "parent": "clone.error.parent",
                "symlink": "clone.error.symlink",
            }[problem]
            self._show_error(
                self._translator.t(problem_key),
                focus=destination_input,
            )
            return
        self._clear_error()
        self.dismiss(CloneRequest(url=url, destination=destination))

    def action_cancel(self) -> None:
        self.dismiss(None)


@dataclass(frozen=True)
class PaletteCommand:
    id: str
    title: str
    description: str = ""
    shortcut: str = ""
    group: str = "App"
    keywords: tuple[str, ...] = ()


@dataclass(frozen=True)
class PaletteSelection:
    """A command chosen from the palette."""

    command_id: str


@dataclass(frozen=True)
class PaletteBuilderRequest:
    """A modal palette search asking the mounted full builder for help."""

    state: SearchState


PaletteResult = PaletteSelection | PaletteBuilderRequest


class CommandPaletteDialog(ModalScreen[PaletteResult | None]):
    """Searchable command palette with click and keyboard activation."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]

    def __init__(
        self,
        commands: Iterable[PaletteCommand],
        *,
        size: PaletteSize = "card",
        initial_search: SearchState | None = None,
        on_size_changed: Callable[[PaletteSize], None] | None = None,
    ) -> None:
        super().__init__()
        self.commands = tuple(commands)
        self.palette_size = size
        self.search_state = initial_search or SearchState()
        self.on_size_changed = on_size_changed

    def compose(self) -> ComposeResult:
        with Vertical(
            id="palette-card",
            classes=f"modal-card palette-{self.palette_size}",
        ):
            with Horizontal(id="palette-header"):
                yield Label("Command palette", classes="modal-title")
                yield Button(
                    self._size_button_label(),
                    id="palette-size-toggle",
                    tooltip="Switch between a bounded card and the full terminal window",
                )
            yield SearchBar(
                surface_id="palette",
                placeholder="Type a command or setting…",
                initial=self.search_state,
                id="palette-search",
            )
            yield Static("All commands", id="palette-status")
            yield ListView(id="palette-list")

    async def on_mount(self) -> None:
        await self._populate(self.search_state)
        self.query_one("#palette-query", Input).focus()

    async def _populate(self, state: SearchState) -> None:
        list_view = self.query_one("#palette-list", ListView)
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
            self.commands,
            state.query,
            mode=mode,
            flags=flags,
            get_text=lambda command: (
                command.title,
                command.description,
                command.shortcut,
                command.group,
                *command.keywords,
            ),
        )
        items: list[ListItem] = []
        for command in result.items:
            shortcut = f"  [dim]{command.shortcut}[/]" if command.shortcut else ""
            description = f"\n[dim]{command.description}[/]" if command.description else ""
            item = ListItem(
                Static(
                    f"[b]{command.title}[/]{shortcut}  [dim]{command.group}[/]{description}",
                    markup=True,
                ),
                id=f"command-{command.id}",
            )
            items.append(item)
        await list_view.clear()
        await list_view.extend(items)
        status = self.query_one("#palette-status", Static)
        if result.error is not None:
            status.update(f"[red]{result.error}[/] · Commands remain available.")
        elif state.query.strip():
            status.update(f"{len(items)} matching command(s).")
        else:
            status.update(f"{len(items)} commands and settings.")

    @on(SearchBar.Changed, "#palette-search")
    async def _search_changed(self, event: SearchBar.Changed) -> None:
        self.search_state = event.state
        await self._populate(event.state)

    @on(SearchBar.BuilderRequested, "#palette-search")
    def _builder_requested(self, event: SearchBar.BuilderRequested) -> None:
        event.stop()
        self.dismiss(PaletteBuilderRequest(event.state))

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id != "palette-query":
            return
        list_view = self.query_one("#palette-list", ListView)
        if list_view.highlighted_child is not None:
            self._choose(list_view.highlighted_child)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        self._choose(event.item)

    def _choose(self, item: ListItem) -> None:
        if item.id and item.id.startswith("command-"):
            self.dismiss(PaletteSelection(item.id.removeprefix("command-")))

    @on(Button.Pressed, "#palette-size-toggle")
    def _toggle_size(self, _event: Button.Pressed) -> None:
        next_size: PaletteSize = "full" if self.palette_size == "card" else "card"
        self.palette_size = next_size
        card = self.query_one("#palette-card", Vertical)
        card.remove_class("palette-card", "palette-full")
        card.add_class(f"palette-{next_size}")
        self.query_one("#palette-size-toggle", Button).label = self._size_button_label()
        if self.on_size_changed is not None:
            self.on_size_changed(next_size)

    def _size_button_label(self) -> str:
        return "Full window" if self.palette_size == "card" else "Bounded card"

    def action_cancel(self) -> None:
        self.dismiss(None)


class HelpDialog(ModalScreen[None]):
    """Scrollable help and interaction reference."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "close", "Close")]

    def compose(self) -> ComposeResult:
        with Vertical(id="help-card", classes="modal-card"):
            yield Label("Desktop Material TUI help", classes="modal-title")
            with VerticalScroll():
                yield Markdown(
                    """
## Point, click, or stay on the keyboard

Every main action is exposed as a focusable terminal control. Click tabs,
buttons, tables, checkboxes, selects, and text boxes with the mouse. Use the
mouse wheel over a pane to scroll it.

| Input | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Move focus |
| `Enter` / `Space` | Activate the focused control |
| `Esc` | Close only the top dialog or sheet |
| `Ctrl+P` | Open the command palette |
| `Ctrl+O` | Open a repository path |
| `Ctrl+R` | Refresh the current repository |
| `Ctrl+Shift+F` | Open the full RE2 builder |
| `F1` | Open this help |
| `Ctrl+Q` | Quit |

Text fields support cursor movement, selection, paste, deletion, and normal
terminal clipboard behavior. Multiline commit bodies and regex samples use a
real text area.

## Safety

Informational work uses corner notifications and never interrupts typing.
Only a decision, consent, credential step, or destructive action opens a
blocking dialog. Git commands are launched as argument arrays without a shell.
                    """
                )
            yield Button("Close", id="help-close", variant="primary")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "help-close":
            self.dismiss(None)

    def action_close(self) -> None:
        self.dismiss(None)
