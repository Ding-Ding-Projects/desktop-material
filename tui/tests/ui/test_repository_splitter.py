"""Repository/workspace splitter interaction and persistence tests."""

from __future__ import annotations

import pytest
from textual.containers import Vertical

from desktop_material_tui.infrastructure.persistence import (
    AppConfig,
    AppearanceConfig,
    ConfigStore,
    XDGPaths,
)
from desktop_material_tui.ui.widgets.repository_splitter import RepositoryRailSplitter

from .helpers import run_desktop_material


@pytest.mark.asyncio
async def test_splitter_keyboard_controls_are_accessible_and_persisted() -> None:
    async with run_desktop_material(size=(160, 40)) as (app, pilot):
        rail = app.query_one("#repository-rail", Vertical)
        splitter = app.query_one("#repository-splitter", RepositoryRailSplitter)

        assert splitter.can_focus
        assert splitter in app.screen.focus_chain
        assert splitter.name == "Resize repository and workspace panels"
        assert "Left/Right" in str(splitter.tooltip)
        assert splitter.size.width == 1
        assert rail.region.width == 28

        splitter.focus()
        await pilot.press("right")
        await pilot.pause()
        assert rail.region.width == 29
        assert ConfigStore(XDGPaths.discover()).load().appearance.repository_rail_width == 29

        await pilot.press("shift+right")
        await pilot.pause()
        assert rail.region.width == 34

        await pilot.press("left")
        await pilot.press("shift+left")
        await pilot.pause()
        assert rail.region.width == 28

        await pilot.press("end")
        await pilot.pause()
        assert rail.region.width == 119
        assert app.query_one("#workspace").region.width >= 40

        await pilot.press("home")
        await pilot.pause()
        assert rail.region.width == 28
        assert ConfigStore(XDGPaths.discover()).load().appearance.repository_rail_width == 28

        await pilot.press("shift+left")
        await pilot.press("shift+left")
        await pilot.press("left")
        await pilot.pause()
        assert rail.region.width == 20
        assert ConfigStore(XDGPaths.discover()).load().appearance.repository_rail_width == 20
        assert app._version_history_service is not None
        assert app._version_history_service.list_versions(limit=20)[0].label == (
            "Repository rail resized"
        )


@pytest.mark.asyncio
async def test_splitter_mouse_drag_captures_and_persists_only_on_release() -> None:
    async with run_desktop_material(size=(160, 40)) as (app, pilot):
        rail = app.query_one("#repository-rail", Vertical)
        splitter = app.query_one("#repository-splitter", RepositoryRailSplitter)
        start_x = splitter.region.x
        pointer_y = splitter.region.y + 1
        store = ConfigStore(XDGPaths.discover())

        assert await pilot.mouse_down(splitter, offset=(0, 1))
        await pilot.pause()
        assert app.mouse_captured is splitter
        assert splitter.dragging

        assert await pilot.hover(None, offset=(start_x + 10, pointer_y))
        await pilot.pause()
        assert rail.region.width == 38
        assert store.load().appearance.repository_rail_width == 28

        assert await pilot.mouse_up(None, offset=(start_x + 10, pointer_y))
        await pilot.pause()
        assert app.mouse_captured is None
        assert not splitter.dragging
        assert rail.region.width == 38
        assert store.load().appearance.repository_rail_width == 38

    async with run_desktop_material(size=(160, 40)) as (restarted_app, _pilot):
        assert restarted_app.query_one("#repository-rail", Vertical).region.width == 38


@pytest.mark.asyncio
async def test_splitter_clamps_without_losing_preference_across_resizes() -> None:
    store = ConfigStore(XDGPaths.discover())
    store.save(
        AppConfig(
            appearance=AppearanceConfig(repository_rail_width=100),
        )
    )

    async with run_desktop_material(size=(160, 40)) as (app, pilot):
        rail = app.query_one("#repository-rail", Vertical)
        splitter = app.query_one("#repository-splitter", RepositoryRailSplitter)

        assert rail.region.width == 100
        assert app._preferred_repository_rail_width == 100

        await pilot.resize_terminal(130, 40)
        await pilot.pause()
        assert rail.region.width == 89
        assert app.query_one("#workspace").region.width >= 40
        assert app._preferred_repository_rail_width == 100
        assert store.load().appearance.repository_rail_width == 100

        await pilot.resize_terminal(100, 30)
        await pilot.pause()
        assert not rail.display
        assert not splitter.display
        assert app._preferred_repository_rail_width == 100

        await pilot.resize_terminal(200, 48)
        await pilot.pause()
        assert rail.display
        assert splitter.display
        assert rail.region.width == 100
        assert app._preferred_repository_rail_width == 100


@pytest.mark.asyncio
async def test_splitter_history_failure_does_not_undo_config_save(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with run_desktop_material(size=(160, 40)) as (app, pilot):
        splitter = app.query_one("#repository-splitter", RepositoryRailSplitter)
        assert app._version_history_service is not None

        def fail_history(*_args: object, **_kwargs: object) -> None:
            raise OSError("history unavailable")

        monkeypatch.setattr(app._version_history_service, "record", fail_history)
        splitter.focus()
        await pilot.press("right")
        await pilot.pause()

        assert ConfigStore(XDGPaths.discover()).load().appearance.repository_rail_width == 29
        assert app.query_one("#repository-rail", Vertical).region.width == 29
