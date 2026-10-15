"""Selected merge rows retain their exact branch identity through review."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import DataTable, TabbedContent

from desktop_material_tui.ui.screens.dialogs import DecisionDialog

from .helpers import run_desktop_material


@pytest.mark.asyncio
@pytest.mark.parametrize("move_after_review", [False, True])
async def test_merge_selected_branch_ignores_same_named_tag(
    deterministic_repository: DeterministicRepository,
    move_after_review: bool,
) -> None:
    repository = deterministic_repository
    repository.git("stash", "push", "-m", "Clean before merge selection")
    base = repository.git("rev-parse", "HEAD").stdout.strip()
    repository.git("tag", "feature/pilot")
    repository.git("switch", "feature/pilot")
    (repository.path / "feature.txt").write_text("selected branch payload\n")
    repository.git("add", "--", "feature.txt")
    repository.git("commit", "-m", "Selected branch change")
    tip = repository.git("rev-parse", "HEAD").stdout.strip()
    repository.git("switch", "main")

    async with run_desktop_material(repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "branches-tab"
        await pilot.pause()
        table = app.query_one("#branches-table", DataTable)
        row = next(
            index
            for index in range(table.row_count)
            if str(table.get_row_at(index)[1]) == "feature/pilot"
        )
        table.move_cursor(row=row)
        await pilot.pause()
        button = app.query_one("#branches-merge")
        button.scroll_visible(animate=False, force=True, immediate=True)
        await pilot.pause()
        assert await pilot.click("#branches-merge")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        assert f"Source: `{tip}`" in app.screen.body
        assert "feature.txt" in app.screen.body
        if move_after_review:
            repository.git("update-ref", "refs/heads/feature/pilot", base, tip)
        assert await pilot.click("#decision-confirm")
        await app.workers.wait_for_complete()
        await pilot.pause()
        await app.workers.wait_for_complete()

    assert repository.git("rev-parse", "HEAD").stdout.strip() == (
        base if move_after_review else tip
    )
    assert (repository.path / "feature.txt").exists() is not move_after_review
    assert repository.git("rev-parse", "refs/tags/feature/pilot").stdout.strip() == base
