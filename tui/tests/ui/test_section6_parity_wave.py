"""Mounted-pane acceptance for the section-6 terminal parity wave."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import (
    Collapsible,
    DataTable,
    Input,
    Select,
    SelectionList,
    Static,
    TabbedContent,
    TextArea,
)

from desktop_material_tui.ui.screens.dialogs import DecisionDialog
from desktop_material_tui.ui.screens.repository_panes import BranchesPane

from .helpers import run_desktop_material


async def _scroll_click(app: object, pilot: object, selector: str) -> None:
    target = app.query_one(selector)  # type: ignore[attr-defined]
    target.scroll_visible(animate=False, force=True, immediate=True)
    await pilot.pause()  # type: ignore[attr-defined]
    assert await pilot.click(selector)  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_commit_author_offline_draft_and_history_scope_are_mounted(
    deterministic_repository: DeterministicRepository,
) -> None:
    deterministic_repository.git("add", "--", "README.md")
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        await app.workers.wait_for_complete()
        await pilot.pause()
        disclosure = app.query_one("#commit-author-disclosure", Static)
        assert "Desktop Material Test" in str(disclosure.render())
        assert "desktop-material@example.invalid" in str(disclosure.render())

        await _scroll_click(app, pilot, "#commit-suggest-offline")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert app.query_one("#commit-summary", Input).value == "Update README.md"

        app.query_one("#main-tabs", TabbedContent).active = "history-tab"
        scope = app.query_one("#history-scope", Select)
        scope.value = "all"
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert app.query_one("#history-revert").disabled
        table = app.query_one("#history-table", DataTable)
        assert table.row_count >= 2
        assert str(table.get_row_at(0)[4]) in {"commit", "merge"}


@pytest.mark.asyncio
async def test_branch_preferences_and_bulk_review_use_selected_exact_tip(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "branches-tab"
        await app.workers.wait_for_complete()
        await pilot.pause()
        table = app.query_one("#branches-table", DataTable)
        feature_row = next(
            row
            for row in range(table.row_count)
            if str(table.get_row_at(row)[1]) == "feature/pilot"
        )
        table.move_cursor(row=feature_row)
        await _scroll_click(app, pilot, "#branches-pin")
        await app.workers.wait_for_complete()
        pane = app.query_one("#branches-pane", BranchesPane)
        assert "feature/pilot" in pane.branch_preferences.pinned

        app.query_one("#branches-advanced", Collapsible).collapsed = False
        await pilot.pause()
        selection = app.query_one("#branches-bulk-selection", SelectionList)
        selection.select("feature/pilot")
        await _scroll_click(app, pilot, "#branches-bulk-review")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        assert "feature/pilot" in app.screen.body
        assert "recovery object ID" in app.screen.body


@pytest.mark.asyncio
async def test_advanced_batch_cancel_and_failure_prompt_are_visible(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "advanced-tab"
        app.query_one("#advanced-tabs", TabbedContent).active = "advanced-sync-tab"
        await pilot.pause()
        app.query_one("#failure-operation", Input).value = "push origin main"
        app.query_one("#failure-text", TextArea).text = (
            "! [rejected] main -> main (non-fast-forward)"
        )
        await _scroll_click(app, pilot, "#failure-diagnose")
        output = app.query_one("#failure-output", TextArea).text
        assert "Classification: non-fast-forward" in output
        assert "Do not force-push" in output
        assert "switch branches" in output

        await _scroll_click(app, pilot, "#batch-cancel")
        pane = app.query_one("#advanced-pane")
        assert pane.batch_cancellation.is_set()  # type: ignore[attr-defined]
