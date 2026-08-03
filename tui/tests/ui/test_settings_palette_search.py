"""Searchable Settings and persisted command-palette acceptance coverage."""

from __future__ import annotations

import pytest
from textual.widgets import Input, ListView, Static, TabbedContent

from desktop_material_tui.ui.screens.dialogs import CommandPaletteDialog
from desktop_material_tui.ui.widgets.search_bar import SearchBar, SearchState

from .helpers import rendered_text, run_desktop_material


@pytest.mark.asyncio
async def test_settings_search_indexes_both_languages_current_values_and_exact_targets() -> None:
    async with run_desktop_material(size=(100, 30)) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "settings-tab"
        search = app.query_one("#settings-search", SearchBar)
        results = app.query_one("#settings-search-results", ListView)

        search.set_state(SearchState(query="靜音時段開始"), emit=True)
        await pilot.pause(0.2)
        assert results.query_one("#settings-result-quiet-start")

        await pilot.click("#settings-result-quiet-start")
        await pilot.pause()
        assert app.query_one("#settings-quiet-start", Input).has_focus

        app.query_one("#settings-terminal", Input).value = "kitty"
        search.set_state(SearchState(query="kitty"), emit=True)
        await pilot.pause(0.2)
        assert results.query_one("#settings-result-terminal")

        search.set_state(SearchState(query="(", mode="regex"), emit=True)
        await pilot.pause(0.2)
        assert (
            "existing settings remain available"
            in rendered_text(app.query_one("#settings-search-status", Static)).casefold()
        )


@pytest.mark.asyncio
async def test_settings_regex_builder_returns_to_the_origin_and_applies() -> None:
    async with run_desktop_material(size=(120, 40)) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "settings-tab"
        await pilot.pause()
        await pilot.click("#settings-builder")
        await pilot.pause()
        app.query_one("#regex-pattern", Input).value = "^Theme$"
        await pilot.click("#regex-apply")
        await pilot.pause(0.5)

        assert app.query_one("#main-tabs", TabbedContent).active == "settings-tab"
        assert app.query_one("#settings-search", SearchBar).state.mode == "regex"
        assert app.query_one("#settings-search-results", ListView).query_one(
            "#settings-result-theme"
        )


@pytest.mark.asyncio
async def test_palette_full_size_persists_and_setting_command_teleports() -> None:
    async with run_desktop_material(size=(120, 40)) as (app, pilot):
        await pilot.press("ctrl+p")
        await pilot.pause()
        assert isinstance(app.screen, CommandPaletteDialog)
        assert app.screen.query_one("#palette-card").has_class("palette-card")

        await pilot.click("#palette-size-toggle")
        await pilot.pause()
        assert app.screen.query_one("#palette-card").has_class("palette-full")
        await pilot.press("escape")

    async with run_desktop_material(size=(120, 40)) as (app, pilot):
        await pilot.press("ctrl+p")
        await pilot.pause()
        assert app.screen.query_one("#palette-card").has_class("palette-full")

        app.screen.query_one("#palette-query", Input).value = "quiet hours start"
        await pilot.pause(0.2)
        await pilot.click("#command-setting-quiet-start")
        await pilot.pause(0.4)

        assert app.query_one("#main-tabs", TabbedContent).active == "settings-tab"
        assert app.query_one("#settings-quiet-start", Input).has_focus


@pytest.mark.asyncio
async def test_palette_regex_builder_reopens_the_modal_with_synchronized_state() -> None:
    async with run_desktop_material(size=(120, 40)) as (app, pilot):
        await pilot.press("ctrl+p")
        await pilot.pause()
        await pilot.click("#palette-builder")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "regex-tab"

        app.query_one("#regex-pattern", Input).value = "Branches"
        await pilot.click("#regex-apply")
        await pilot.pause(0.2)

        assert isinstance(app.screen, CommandPaletteDialog)
        assert app.screen.query_one("#palette-query", Input).value == "Branches"
        assert app.screen.query_one("#command-branches")
        await pilot.click("#command-branches")
        await pilot.pause(0.4)
        assert app.query_one("#main-tabs", TabbedContent).active == "branches-tab"
