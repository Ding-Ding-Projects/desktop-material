"""Terminal-native Help and factual release-history acceptance coverage."""

from __future__ import annotations

from pathlib import Path

import pytest
from textual.widgets import Checkbox, DataTable, Input, Static, TabbedContent

from desktop_material_tui.ui.widgets.search_bar import SearchBar, SearchState

from .helpers import rendered_text, run_desktop_material


@pytest.mark.asyncio
async def test_f1_and_palette_routes_open_the_persistent_help_and_changelog_tabs() -> None:
    async with run_desktop_material(size=(120, 40)) as (app, pilot):
        await pilot.press("f1")
        await pilot.pause()

        assert app.query_one("#main-tabs", TabbedContent).active == "help-tab"
        assert app.query_one("#help-tabs", TabbedContent).active == "help-guide-tab"

        await pilot.press("ctrl+p")
        await pilot.pause()
        query = app.screen.query_one("#palette-query", Input)
        query.value = "release history"
        await pilot.pause(0.2)
        await pilot.click("#command-changelog")
        await pilot.pause(0.2)

        assert app.query_one("#main-tabs", TabbedContent).active == "help-tab"
        assert app.query_one("#help-tabs", TabbedContent).active == "help-changelog-tab"
        assert app.query_one("#changelog-release-table", DataTable).row_count == 707
        assert app.query_one("#changelog-entry-table", DataTable).row_count > 0


@pytest.mark.asyncio
async def test_changelog_search_regex_builder_and_typed_dates_preserve_truthful_state() -> None:
    async with run_desktop_material(size=(120, 40)) as (app, pilot):
        app.action_changelog()
        await pilot.pause()
        releases = app.query_one("#changelog-release-table", DataTable)
        search = app.query_one("#changelog-search", SearchBar)

        search.set_state(SearchState(query="dim sum"), emit=True)
        await pilot.pause(0.2)
        assert 0 < releases.row_count < 707

        await pilot.click("#changelog-builder")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "regex-tab"
        pattern = app.query_one("#regex-pattern", Input)
        pattern.value = r"^3\.6\.3-material2[12]$"
        await pilot.click("#regex-apply")
        await pilot.pause(0.2)

        assert app.query_one("#main-tabs", TabbedContent).active == "help-tab"
        assert app.query_one("#help-tabs", TabbedContent).active == "help-changelog-tab"
        assert search.state.mode == "regex"
        assert releases.row_count == 2

        search.set_state(SearchState(), emit=True)
        start = app.query_one("#changelog-start", Input)
        start.value = "1900-01-01"
        await pilot.pause(0.2)
        assert releases.row_count == 668
        valid_count = releases.row_count

        start.value = "2026-08"
        await pilot.pause(0.2)
        assert releases.row_count == valid_count
        status = app.query_one("#changelog-status", Static)
        assert "complete ISO date" in rendered_text(status)

        start.value = "1900-01-01"
        include = app.query_one("#changelog-include-unrecorded", Checkbox)
        include.value = True
        await pilot.pause(0.2)
        assert releases.row_count == 707


@pytest.mark.asyncio
async def test_changelog_copy_commit_and_non_overwriting_markdown_export(tmp_path: Path) -> None:
    async with run_desktop_material(size=(80, 24)) as (app, pilot):
        app.action_changelog()
        await pilot.pause(0.2)

        copy_commit = app.query_one("#changelog-copy-commit")
        copy_commit.scroll_visible(animate=False)
        await pilot.pause()
        await pilot.click(copy_commit)
        await pilot.pause()
        assert len(app.clipboard) == 40
        assert app.clipboard.isalnum()

        copy_view = app.query_one("#changelog-copy")
        copy_view.scroll_visible(animate=False)
        await pilot.pause()
        await pilot.click(copy_view)
        await pilot.pause()
        assert app.clipboard.startswith("# Desktop Material release history")
        assert "Exported scope: visible releases" in app.clipboard

        destination = tmp_path / "release-history.md"
        app.query_one("#changelog-export-path", Input).value = str(destination)
        export = app.query_one("#changelog-export")
        export.scroll_visible(animate=False)
        await pilot.pause()
        await pilot.click(export)
        await pilot.pause()

        rendered = destination.read_text(encoding="utf-8")
        assert "# Desktop Material release history" in rendered
        assert "https://github.com/Ding-Ding-Projects/desktop-material/commit/" in rendered
        before = destination.read_bytes()
        await pilot.click(export)
        await pilot.pause()
        assert destination.read_bytes() == before
