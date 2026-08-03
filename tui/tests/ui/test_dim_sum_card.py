from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from rich.text import Text
from textual.app import App, ComposeResult
from textual.widgets import Button, Label

from desktop_material_tui.application.dim_sum import DimSumDish
from desktop_material_tui.ui.i18n import LocalePreferences, Translator
from desktop_material_tui.ui.widgets.dim_sum_card import DimSumSurpriseCard


def _dish(tmp_path: Path) -> DimSumDish:
    image = tmp_path / "har-gow.png"
    image.write_bytes(b"png bytes")
    return DimSumDish(
        dish_id="hk-dish-0001",
        slug="classic-har-gow",
        english_name="Classic Har Gow",
        cantonese_name="蝦餃",
        jyutping="haa1 gaau2",
        category="steamed-dim-sum",
        english_alt="Photograph of Classic Har Gow",
        cantonese_alt="茶樓枱上嘅蝦餃",
        filename=image.name,
        byte_count=image.stat().st_size,
        width=2,
        height=2,
        sha256=hashlib.sha256(image.read_bytes()).hexdigest(),
        image_path=image,
    )


class _CardApp(App[None]):
    def __init__(self, card: DimSumSurpriseCard) -> None:
        super().__init__()
        self.card = card
        self.dismissed: str | None = None

    def compose(self) -> ComposeResult:
        yield Button("Original focus", id="origin")

    async def on_mount(self) -> None:
        self.query_one("#origin", Button).focus()
        await self.mount(self.card)

    def on_dim_sum_surprise_card_dismissed(
        self, event: DimSumSurpriseCard.Dismissed
    ) -> None:
        self.dismissed = event.reason


def _translator(mode: str = "english") -> Translator:
    return Translator(
        LocalePreferences.from_values(mode=mode),
        english_catalog={
            "dim_sum.title": "Dim sum surprise",
            "dim_sum.romanization": "Jyutping: {jyutping}",
            "dim_sum.lead": "A small tea-break hello.",
            "dim_sum.dismiss": "Dismiss",
        },
        cantonese_catalog={
            "dim_sum.title": "點心小驚喜",
            "dim_sum.romanization": "粵拼: {jyutping}",
            "dim_sum.lead": "茶歇小小招呼。",
            "dim_sum.dismiss": "收起",
        },
    )


@pytest.mark.asyncio
async def test_card_is_corner_anchored_non_blocking_and_button_dismissible(
    tmp_path: Path,
) -> None:
    card = DimSumSurpriseCard(
        _dish(tmp_path),
        Text("▀▀\n▀▀"),
        translator=_translator(),
        duration_seconds=60,
        id="dim-sum-card",
    )
    app = _CardApp(card)

    async with app.run_test(size=(80, 30), notifications=False) as pilot:
        await pilot.pause()
        assert app.focused is app.query_one("#origin", Button)
        assert card.region.right <= app.size.width
        assert card.region.bottom <= app.size.height
        assert "Classic Har Gow · 蝦餃" in str(
            app.query_one("#dim-sum-name", Label).render()
        )
        assert await pilot.click("#dim-sum-dismiss")
        await pilot.pause()
        assert app.dismissed == "button"
        assert len(app.query(DimSumSurpriseCard)) == 0


@pytest.mark.asyncio
async def test_card_auto_dismisses_and_cantonese_stays_primary(tmp_path: Path) -> None:
    card = DimSumSurpriseCard(
        _dish(tmp_path),
        Text("▀"),
        translator=_translator("cantonese"),
        duration_seconds=0.01,
    )
    app = _CardApp(card)

    async with app.run_test(size=(42, 22), notifications=False) as pilot:
        await pilot.pause(0.05)
        assert app.dismissed == "timer"
        assert len(app.query(DimSumSurpriseCard)) == 0
