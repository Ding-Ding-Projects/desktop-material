"""Decision, path, command, and help overlays."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import ClassVar

from textual.app import ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Input, Label, ListItem, ListView, Markdown, Static


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
            with Horizontal(classes="modal-actions"):
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


class PathDialog(ModalScreen[str | None]):
    """Mouse- and keyboard-friendly repository path entry."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]

    def __init__(
        self, title: str, *, initial: str = "", placeholder: str = "/path/to/repo"
    ) -> None:
        super().__init__()
        self.dialog_title = title
        self.initial = initial
        self.placeholder = placeholder

    def compose(self) -> ComposeResult:
        with Vertical(id="path-card", classes="modal-card"):
            yield Label(self.dialog_title, classes="modal-title")
            yield Input(
                value=self.initial,
                placeholder=self.placeholder,
                id="path-input",
                select_on_focus=False,
            )
            with Horizontal(classes="modal-actions"):
                yield Button("Cancel", id="path-cancel")
                yield Button("Open", id="path-open", variant="primary")

    def on_mount(self) -> None:
        self.query_one("#path-input", Input).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "path-input":
            self._submit()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "path-open":
            self._submit()
        elif event.button.id == "path-cancel":
            self.dismiss(None)

    def _submit(self) -> None:
        value = self.query_one("#path-input", Input).value.strip()
        if value:
            self.dismiss(value)

    def action_cancel(self) -> None:
        self.dismiss(None)


@dataclass(frozen=True)
class CloneRequest:
    url: str
    destination: str


class CloneDialog(ModalScreen[CloneRequest | None]):
    """Clone URL and destination text fields."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]

    def compose(self) -> ComposeResult:
        with Vertical(id="clone-card", classes="modal-card"):
            yield Label("Clone repository", classes="modal-title")
            yield Label("Repository URL", classes="field-label")
            yield Input(
                placeholder="https://github.com/owner/repository.git",
                id="clone-url",
                select_on_focus=False,
            )
            yield Label("Destination folder", classes="field-label")
            yield Input(
                placeholder="/home/you/src/repository",
                id="clone-destination",
                select_on_focus=False,
            )
            with Horizontal(classes="modal-actions"):
                yield Button("Cancel", id="clone-cancel")
                yield Button("Clone", id="clone-submit", variant="primary")

    def on_mount(self) -> None:
        self.query_one("#clone-url", Input).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "clone-url":
            self.query_one("#clone-destination", Input).focus()
        else:
            self._submit()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "clone-submit":
            self._submit()
        elif event.button.id == "clone-cancel":
            self.dismiss(None)

    def _submit(self) -> None:
        url = self.query_one("#clone-url", Input).value.strip()
        destination = self.query_one("#clone-destination", Input).value.strip()
        if not url:
            self.query_one("#clone-url", Input).focus()
            return
        if not destination:
            self.query_one("#clone-destination", Input).focus()
            return
        self.dismiss(CloneRequest(url=url, destination=destination))

    def action_cancel(self) -> None:
        self.dismiss(None)


@dataclass(frozen=True)
class PaletteCommand:
    id: str
    title: str
    description: str = ""
    shortcut: str = ""


class CommandPaletteDialog(ModalScreen[str | None]):
    """Searchable command palette with click and keyboard activation."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "cancel", "Cancel")]

    def __init__(self, commands: Iterable[PaletteCommand]) -> None:
        super().__init__()
        self.commands = tuple(commands)

    def compose(self) -> ComposeResult:
        with Vertical(id="palette-card", classes="modal-card"):
            yield Label("Command palette", classes="modal-title")
            yield Input(
                placeholder="Type a command…",
                id="palette-query",
                select_on_focus=False,
            )
            yield ListView(id="palette-list")

    async def on_mount(self) -> None:
        await self._populate("")
        self.query_one("#palette-query", Input).focus()

    async def _populate(self, query: str) -> None:
        query = query.casefold().strip()
        list_view = self.query_one("#palette-list", ListView)
        items: list[ListItem] = []
        for command in self.commands:
            haystack = f"{command.title} {command.description} {command.shortcut}".casefold()
            if query and all(part not in haystack for part in query.split()):
                continue
            shortcut = f"  [dim]{command.shortcut}[/]" if command.shortcut else ""
            description = f"\n[dim]{command.description}[/]" if command.description else ""
            item = ListItem(
                Static(f"[b]{command.title}[/]{shortcut}{description}", markup=True),
                id=f"command-{command.id}",
            )
            items.append(item)
        await list_view.clear()
        await list_view.extend(items)

    async def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id == "palette-query":
            await self._populate(event.value)

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
            self.dismiss(item.id.removeprefix("command-"))

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
