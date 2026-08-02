"""Keyboard, mouse, and real-Git coverage for complete worktree management."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import DataTable, Input, TabbedContent

from desktop_material_tui.ui.screens.dialogs import DecisionDialog

from .helpers import run_desktop_material, type_text


async def _wait_for_mutation(app: object, pilot: object) -> None:
    """Wait for a mutation and the repository refresh that it schedules."""

    await app.workers.wait_for_complete()  # type: ignore[attr-defined]
    await pilot.pause()  # type: ignore[attr-defined]
    await app.workers.wait_for_complete()  # type: ignore[attr-defined]
    await pilot.pause()  # type: ignore[attr-defined]


async def _replace_input(pilot: object, selector: str, value: str) -> None:
    assert await pilot.click(selector)  # type: ignore[attr-defined]
    await pilot.press("ctrl+shift+a", "backspace")  # type: ignore[attr-defined]
    await type_text(pilot, value)  # type: ignore[arg-type]


def _select_linked_worktree(table: DataTable[object]) -> None:
    assert table.row_count == 2
    table.move_cursor(row=1)


@pytest.mark.asyncio
async def test_complete_worktree_management_from_advanced_pane(
    deterministic_repository: DeterministicRepository,
) -> None:
    parent = deterministic_repository.path.parent
    original = parent / "worktree lifecycle pilot"
    renamed = parent / "worktree renamed pilot"
    move_parent = parent / "worktree move parent"
    move_parent.mkdir()
    moved = move_parent / "worktree moved pilot"
    manually_moved = parent / "worktree repaired pilot"

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "advanced-tab"
        await pilot.pause()

        await _replace_input(pilot, "#worktree-path", original.as_posix())
        await _replace_input(pilot, "#worktree-branch", "feature/worktree-lifecycle-pilot")
        assert await pilot.click("#worktree-create-branch")
        assert await pilot.click("#worktree-add")
        await _wait_for_mutation(app, pilot)

        table = app.query_one("#worktrees-table", DataTable)
        assert original.is_dir()
        _select_linked_worktree(table)
        await pilot.pause()

        await _replace_input(pilot, "#worktree-lock-reason", "Keep for release verification")
        assert await pilot.click("#worktree-lock")
        await _wait_for_mutation(app, pilot)
        table = app.query_one("#worktrees-table", DataTable)
        assert "locked Keep for release verification" in str(table.get_row_at(1)[3])

        _select_linked_worktree(table)
        await pilot.pause()
        assert await pilot.click("#worktree-unlock")
        await _wait_for_mutation(app, pilot)
        table = app.query_one("#worktrees-table", DataTable)
        assert str(table.get_row_at(1)[3]) == "ready"

        _select_linked_worktree(table)
        await pilot.pause()
        await _replace_input(pilot, "#worktree-action-value", renamed.name)
        assert await pilot.click("#worktree-rename")
        await _wait_for_mutation(app, pilot)
        assert renamed.is_dir()
        assert not original.exists()

        table = app.query_one("#worktrees-table", DataTable)
        _select_linked_worktree(table)
        await pilot.pause()
        await _replace_input(pilot, "#worktree-action-value", moved.as_posix())
        assert await pilot.click("#worktree-move")
        await _wait_for_mutation(app, pilot)
        assert moved.is_dir()
        assert not renamed.exists()

        moved.rename(manually_moved)
        await _replace_input(pilot, "#worktree-path", manually_moved.as_posix())
        assert await pilot.click("#worktree-repair")
        await _wait_for_mutation(app, pilot)
        table = app.query_one("#worktrees-table", DataTable)
        assert str(table.get_row_at(1)[0]) == str(manually_moved.resolve())

        _select_linked_worktree(table)
        await pilot.pause()
        assert await pilot.click("#worktree-remove")
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        confirmation = app.screen.query_one("#decision-confirmation", Input)
        assert confirmation.has_focus
        await type_text(pilot, "remove")
        assert await pilot.click("#decision-confirm")
        await _wait_for_mutation(app, pilot)

        assert not manually_moved.exists()
        assert app.query_one("#worktrees-table", DataTable).row_count == 1
