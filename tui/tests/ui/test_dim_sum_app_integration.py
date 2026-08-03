from __future__ import annotations

import hashlib
import threading
from pathlib import Path

import pytest
from textual.widgets import Button, Label

import desktop_material_tui.app as app_module
from desktop_material_tui.app import DesktopMaterialTUI
from desktop_material_tui.application.dim_sum import DimSumDish
from desktop_material_tui.infrastructure.persistence import XDGPaths
from desktop_material_tui.ui.widgets.dim_sum_card import DimSumSurpriseCard
from desktop_material_tui.ui.widgets.png_picture import TerminalPicture


def _dish(tmp_path: Path) -> DimSumDish:
    image = tmp_path / "har-gow.png"
    image.write_bytes(b"verified fixture bytes")
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


def _mark_first_run_complete() -> None:
    paths = XDGPaths.discover().ensure()
    marker = paths.state_dir / DesktopMaterialTUI._STARTUP_MARKER_FILENAME
    marker.write_text("completed\n", encoding="utf-8")


@pytest.mark.asyncio
async def test_eligible_launch_mounts_one_verified_card_without_stealing_focus(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mark_first_run_complete()
    dish = _dish(tmp_path)
    release_catalog = threading.Event()
    draws = iter((0.01, 0.0))

    def load_catalog(_manifest: Path, _root: Path) -> tuple[DimSumDish, ...]:
        assert release_catalog.wait(timeout=2)
        return (dish,)

    monkeypatch.setattr(app_module, "load_dim_sum_catalog", load_catalog)
    monkeypatch.setattr(
        app_module,
        "decode_png_picture",
        lambda *_args, **_kwargs: TerminalPicture(
            rows=(((255, 0, 0),), ((0, 0, 255),))
        ),
    )
    app = DesktopMaterialTUI(dim_sum_random_draw=lambda: next(draws))

    async with app.run_test(size=(90, 30), notifications=False) as pilot:
        await pilot.pause()
        origin = app.query_one("#repository-open", Button)
        origin.focus()
        release_catalog.set()
        await app.workers.wait_for_complete()
        await pilot.pause()

        card = app.query_one("#dim-sum-surprise", DimSumSurpriseCard)
        assert app.focused is origin
        assert card.region.right <= app.size.width
        assert card.region.bottom <= app.size.height
        assert "Classic Har Gow · 蝦餃" in str(
            app.query_one("#dim-sum-name", Label).render()
        )
        assert app._dim_sum_controller is not None
        assert app._dim_sum_controller.considered

        card.dismiss("test")
        await pilot.pause()
        app._start_dim_sum_surprise()
        await pilot.pause()
        assert len(app.query(DimSumSurpriseCard)) == 0


@pytest.mark.asyncio
async def test_first_run_spends_draw_without_loading_art_or_showing_later(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    draws: list[float] = []

    def unexpected_load(_manifest: Path, _root: Path) -> tuple[DimSumDish, ...]:
        raise AssertionError("a suppressed first run must not load the catalog")

    def record_draw() -> float:
        draws.append(0.01)
        return 0.01

    monkeypatch.setattr(app_module, "load_dim_sum_catalog", unexpected_load)
    app = DesktopMaterialTUI(dim_sum_random_draw=record_draw)

    async with app.run_test(size=(90, 30), notifications=False) as pilot:
        for _ in range(10):
            await pilot.pause()
            if app._dim_sum_controller is not None:
                break
        assert app._first_run
        assert app._dim_sum_controller is not None
        assert app._dim_sum_controller.considered
        assert draws == []
        assert len(app.query(DimSumSurpriseCard)) == 0
        marker = (
            XDGPaths.discover().state_dir
            / DesktopMaterialTUI._STARTUP_MARKER_FILENAME
        )
        assert marker.read_text(encoding="utf-8") == "completed\n"
