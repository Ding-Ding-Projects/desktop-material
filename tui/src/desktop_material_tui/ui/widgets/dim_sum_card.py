"""Non-blocking, auto-dismissing terminal card for the startup dim-sum draw."""

from __future__ import annotations

from rich.text import Text
from textual import events, on
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.dom import NoScreen
from textual.message import Message
from textual.widgets import Button, Label, Static

from ...application.dim_sum import (
    DIM_SUM_SURPRISE_DURATION_SECONDS,
    DimSumDish,
    LanguagePrimary,
    dim_sum_alt_text,
    dim_sum_display_name,
)
from ..i18n import LanguageMode, Translator, get_translator


class DimSumSurpriseCard(Vertical):
    """A corner overlay that never gates startup or steals focus."""

    DEFAULT_CSS = """
    DimSumSurpriseCard {
        layer: dim-sum-overlay;
        position: absolute;
        width: 42;
        height: auto;
        max-height: 23;
        min-height: 15;
        padding: 1 2;
        border: round $accent;
        background: $surface;
        color: $text;
    }

    DimSumSurpriseCard #dim-sum-picture {
        width: 100%;
        height: auto;
        content-align: center middle;
    }

    DimSumSurpriseCard #dim-sum-name {
        width: 100%;
        text-style: bold;
        color: $accent;
    }

    DimSumSurpriseCard #dim-sum-alt,
    DimSumSurpriseCard #dim-sum-lead,
    DimSumSurpriseCard #dim-sum-romanization {
        width: 100%;
        height: auto;
        color: $text-muted;
    }

    DimSumSurpriseCard #dim-sum-dismiss {
        width: 100%;
        min-width: 12;
        height: 3;
    }
    """

    class Dismissed(Message):
        """The card left through its timer, button, or explicit close path."""

        def __init__(self, reason: str) -> None:
            self.reason = reason
            super().__init__()

    def __init__(
        self,
        dish: DimSumDish,
        picture: Text,
        *,
        translator: Translator | None = None,
        duration_seconds: float = DIM_SUM_SURPRISE_DURATION_SECONDS,
        id: str | None = None,  # noqa: A002 - mirrors Textual's widget API
    ) -> None:
        super().__init__(id=id)
        if duration_seconds <= 0:
            raise ValueError("duration_seconds must be positive")
        self.dish = dish
        self.picture = picture
        self.translator = translator or get_translator()
        self.duration_seconds = duration_seconds
        self._dismissed = False

    def compose(self) -> ComposeResult:
        preferences = self.translator.preferences
        primary: LanguagePrimary = (
            "cantonese"
            if preferences.mode is LanguageMode.CANTONESE
            else "english"
        )
        yield Label(self.translator.t("dim_sum.title"), id="dim-sum-title")
        yield Static(self.picture, id="dim-sum-picture")
        yield Label(dim_sum_display_name(self.dish, primary), id="dim-sum-name")
        if self.dish.jyutping:
            yield Label(
                self.translator.t("dim_sum.romanization", jyutping=self.dish.jyutping),
                id="dim-sum-romanization",
            )
        yield Label(dim_sum_alt_text(self.dish, primary), id="dim-sum-alt")
        yield Label(self.translator.t("dim_sum.lead"), id="dim-sum-lead")
        yield Button(self.translator.t("dim_sum.dismiss"), id="dim-sum-dismiss")

    def on_mount(self) -> None:
        self.set_timer(self.duration_seconds, lambda: self.dismiss("timer"))
        self.call_after_refresh(self._anchor_to_corner)

    def on_resize(self, _event: events.Resize) -> None:
        self._anchor_to_corner()

    def _anchor_to_corner(self) -> None:
        if not self.is_mounted:
            return
        try:
            screen = self.screen
        except NoScreen:
            return
        screen_width = screen.size.width
        screen_height = screen.size.height
        width = min(42, max(24, screen_width - 2))
        self.styles.width = width
        measured_height = max(1, self.outer_size.height or 18)
        self.styles.offset = (
            max(0, screen_width - width - 1),
            max(0, screen_height - measured_height - 1),
        )

    @on(Button.Pressed, "#dim-sum-dismiss")
    def _dismiss_pressed(self) -> None:
        self.dismiss("button")

    def dismiss(self, reason: str = "programmatic") -> None:
        """Remove the card once and report why without changing app focus."""

        if self._dismissed:
            return
        self._dismissed = True
        self.post_message(self.Dismissed(reason))
        self.remove()
