"""Guided RE2 construction and live-match interaction coverage."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import DataTable, Input, TabbedContent, TextArea

from desktop_material_tui.ui.screens.regex_builder import RegexBuilderPane

from .helpers import run_desktop_material, type_text


@pytest.mark.asyncio
async def test_guided_buttons_and_live_matches(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        assert await pilot.click("#--content-tab-regex-tab")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "regex-tab"

        pattern = app.query_one("#regex-pattern", Input)
        sample = app.query_one("#regex-sample", TextArea)
        matches = app.query_one("#regex-matches", DataTable)

        assert await pilot.click("#regex-literal")
        await pilot.pause()
        assert pattern.value == "text"
        assert pattern.has_focus

        assert await pilot.click("#regex-sample")
        await type_text(pilot, "text and text")
        await pilot.pause()
        assert sample.text == "text and text"
        assert matches.row_count == 2
        assert matches.get_row_at(0)[2] == "text"
        assert "2 matches" in str(app.query_one("#regex-feedback").render())


@pytest.mark.asyncio
async def test_zero_width_matches_are_bounded_and_visible(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.action_regex_builder()
        await pilot.pause()
        pane = app.query_one("#regex-pane", RegexBuilderPane)
        pattern = pane.query_one("#regex-pattern", Input)
        sample = pane.query_one("#regex-sample", TextArea)
        matches = pane.query_one("#regex-matches", DataTable)

        assert await pilot.click("#regex-start")
        assert pattern.value == "^"
        assert await pilot.click("#regex-sample")
        await type_text(pilot, "abc")
        await pilot.pause()

        assert sample.text == "abc"
        assert matches.row_count == 1
        assert matches.get_row_at(0)[1] == "0:0"
        assert "zero-width" in str(matches.get_row_at(0)[2])
