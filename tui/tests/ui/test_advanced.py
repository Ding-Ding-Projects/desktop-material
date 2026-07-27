"""Mouse, keyboard, and real-Git coverage for the Advanced page."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.widgets import Checkbox, DataTable, Input, TabbedContent, TextArea

from desktop_material_tui.ui.screens.dialogs import DecisionDialog

from .helpers import run_desktop_material, type_text


@pytest.mark.asyncio
async def test_advanced_worktree_fields_buttons_and_typed_removal(
    deterministic_repository: DeterministicRepository,
) -> None:
    target = deterministic_repository.path.parent / "advanced pilot worktree"
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "advanced-tab"
        await pilot.pause()

        path_input = app.query_one("#worktree-path", Input)
        branch_input = app.query_one("#worktree-branch", Input)
        create_branch = app.query_one("#worktree-create-branch", Checkbox)
        assert await pilot.click("#worktree-path")
        await pilot.press("ctrl+shift+a", "backspace")
        await type_text(pilot, target.as_posix())
        assert await pilot.click("#worktree-branch")
        await type_text(pilot, "feature/advanced-pilot")
        assert await pilot.click("#worktree-create-branch")
        assert path_input.value == target.as_posix()
        assert branch_input.value == "feature/advanced-pilot"
        assert create_branch.value

        assert await pilot.click("#worktree-add")
        await app.workers.wait_for_complete()
        await pilot.pause()
        # The mutation schedules the shared repository refresh as its final
        # step, so wait once more for that newly-created load worker.
        await app.workers.wait_for_complete()
        await pilot.pause()

        table = app.query_one("#worktrees-table", DataTable)
        assert target.is_dir()
        assert table.row_count == 2
        assert any(
            str(table.get_row_at(row)[1]) == "feature/advanced-pilot"
            for row in range(table.row_count)
        )

        table.move_cursor(row=1)
        await pilot.pause()
        assert await pilot.click("#worktree-remove")
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        confirmation = app.screen.query_one("#decision-confirmation", Input)
        assert confirmation.has_focus
        await type_text(pilot, "remove")
        assert await pilot.click("#decision-confirm")
        await app.workers.wait_for_complete()
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert not target.exists()
        assert app.query_one("#worktrees-table", DataTable).row_count == 1


@pytest.mark.asyncio
async def test_advanced_build_command_is_typed_run_saved_and_cleared(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "advanced-tab"
        app.query_one("#advanced-tabs", TabbedContent).active = "advanced-commands-tab"
        await pilot.pause()

        command = app.query_one("#advanced-build-command", Input)
        output = app.query_one("#advanced-command-output", TextArea)
        assert await pilot.click("#advanced-build-command")
        await type_text(pilot, "git --version")
        assert command.value == "git --version"

        assert await pilot.click("#advanced-run-build")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert "Result: exit 0" in output.text
        assert "git version " in output.text

        assert await pilot.click("#advanced-save-commands")
        await app.workers.wait_for_complete()
        pane = app.query_one("#advanced-pane")
        profile_file: Path = pane.commands.profile_file  # type: ignore[attr-defined,union-attr]
        assert await asyncio.to_thread(profile_file.is_file)

        assert await pilot.click("#advanced-clear-output")
        assert output.text == ""
