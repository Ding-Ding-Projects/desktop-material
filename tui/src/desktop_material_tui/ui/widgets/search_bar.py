"""A shared literal / fuzzy / RE2 search control."""

from __future__ import annotations

from dataclasses import dataclass

from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.message import Message
from textual.widgets import Button, Input, Select

from ..i18n import Translator, get_translator


@dataclass(frozen=True)
class SearchState:
    """Search state shared with a full regex builder."""

    query: str = ""
    mode: str = "literal"
    case_sensitive: bool = False
    flags: str = ""


class SearchBar(Horizontal):
    """Focusable search input with a mouse-clickable full builder affordance."""

    DEFAULT_CSS = """
    SearchBar {
        height: 3;
        width: 100%;
        layout: horizontal;
    }

    SearchBar Input {
        width: 1fr;
        height: 3;
    }

    SearchBar Select {
        width: 16;
        height: 3;
    }

    SearchBar Button {
        width: 10;
        min-width: 8;
        height: 3;
    }
    """

    class Changed(Message):
        """Posted whenever the effective search state changes."""

        def __init__(self, state: SearchState, control: SearchBar) -> None:
            self.state = state
            self._control = control
            super().__init__()

        @property
        def control(self) -> SearchBar:
            return self._control

        @property
        def search_bar(self) -> SearchBar:
            return self._control

    class BuilderRequested(Message):
        """Posted when the full guided regex builder is requested."""

        def __init__(
            self,
            state: SearchState,
            surface_id: str,
            control: SearchBar,
        ) -> None:
            self.state = state
            self.surface_id = surface_id
            self._control = control
            super().__init__()

        @property
        def control(self) -> SearchBar:
            return self._control

    def __init__(
        self,
        *,
        surface_id: str,
        placeholder: str = "Search…",
        initial: SearchState | None = None,
        id: str | None = None,  # noqa: A002 - mirrors Textual's widget API
        classes: str | None = None,
    ) -> None:
        super().__init__(id=id, classes=classes)
        self.surface_id = surface_id
        self.state = initial or SearchState()
        self.placeholder = placeholder

    def compose(self) -> ComposeResult:
        yield Input(
            value=self.state.query,
            placeholder=self.placeholder,
            id=f"{self.surface_id}-query",
            select_on_focus=False,
        )
        yield Select(
            (("Text", "literal"), ("Fuzzy", "fuzzy"), ("Regex", "regex")),
            value=self.state.mode,
            allow_blank=False,
            compact=True,
            id=f"{self.surface_id}-mode",
        )
        yield Button(
            "Regex…",
            id=f"{self.surface_id}-builder",
            tooltip="Open the guided RE2 builder",
        )

    def set_state(self, state: SearchState, *, emit: bool = False) -> None:
        """Synchronize builder results back into the compact control."""

        self.state = state
        input_widget = self.query_one(Input)
        select_widget = self.query_one(Select)
        input_widget.value = state.query
        select_widget.value = state.mode
        if emit:
            self.post_message(self.Changed(state, self))

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input is not self.query_one(Input):
            return
        self.state = SearchState(
            query=event.value,
            mode=self.state.mode,
            case_sensitive=self.state.case_sensitive,
            flags=self.state.flags,
        )
        self.post_message(self.Changed(self.state, self))

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select is not self.query_one(Select) or event.value is Select.BLANK:
            return
        self.state = SearchState(
            query=self.state.query,
            mode=str(event.value),
            case_sensitive=self.state.case_sensitive,
            flags=self.state.flags,
        )
        self.post_message(self.Changed(self.state, self))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == f"{self.surface_id}-builder":
            self.post_message(self.BuilderRequested(self.state, self.surface_id, self))

    def localize(self, translator: Translator | None = None) -> None:
        """Relabel mode and builder controls without disturbing their state."""

        translator = translator or get_translator()
        self.query_one(Select).set_options(
            (
                (translator.t("search.mode.literal"), "literal"),
                (translator.t("search.mode.fuzzy"), "fuzzy"),
                (translator.t("search.mode.regex"), "regex"),
            )
        )
        self.query_one(Button).label = translator.t("search.regex_builder")
