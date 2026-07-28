"""Mouse, keyboard, focus, and command-palette acceptance coverage."""

from __future__ import annotations

import sqlite3

import pytest
from git_repository import DeterministicRepository
from textual.widgets import Input, TabbedContent, TextArea

from desktop_material_tui.ui.screens.dialogs import CommandPaletteDialog

from .helpers import run_desktop_material, type_text


@pytest.mark.asyncio
async def test_mouse_clicks_inputs_text_area_and_focus_traversal(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        summary = app.query_one("#commit-summary", Input)
        body = app.query_one("#commit-body", TextArea)

        assert await pilot.click("#commit-summary")
        await type_text(pilot, "Pilot summary")
        await pilot.pause()
        assert summary.value == "Pilot summary"
        assert app.focused is summary

        assert await pilot.click("#commit-body")
        await type_text(pilot, "First line\nSecond line")
        await pilot.pause()
        assert body.text == "First line\nSecond line"
        assert app.focused is body

        assert await pilot.click("#commit-summary")
        await pilot.press("tab")
        assert app.focused is body
        await pilot.press("shift+tab")
        assert app.focused is summary

        assert await pilot.click("#--content-tab-history-tab")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "history-tab"


@pytest.mark.asyncio
async def test_command_palette_opens_filters_and_activates_a_command(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        await pilot.press("ctrl+p")
        await pilot.pause()
        assert isinstance(app.screen, CommandPaletteDialog)

        query = app.screen.query_one("#palette-query", Input)
        assert query.has_focus
        await type_text(pilot, "branches")
        await pilot.pause()

        assert app.screen.query_one("#command-branches")
        # The click dismisses its own modal before Pilot can report the target as
        # still mounted; the resulting active tab is the interaction contract.
        await pilot.click("#command-branches")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "branches-tab"


@pytest.mark.asyncio
async def test_app_closes_its_owned_notification_database(
    deterministic_repository: DeterministicRepository,
) -> None:
    service = None
    async with run_desktop_material(deterministic_repository.path) as (app, _pilot):
        service = app._notification_service
        assert service is not None
        assert service.unread_count >= 0

    assert service is not None
    with pytest.raises(sqlite3.ProgrammingError, match="closed database"):
        _ = service.database.schema_version


@pytest.mark.asyncio
async def test_recent_repository_tabs_restore_from_app_owned_state(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path):
        pass

    async with run_desktop_material() as (restored, _pilot):
        assert restored.active_repository == deterministic_repository.path.resolve()
        assert deterministic_repository.path.resolve() in restored.repository_services
        assert restored.query_one("#repository-list").children
