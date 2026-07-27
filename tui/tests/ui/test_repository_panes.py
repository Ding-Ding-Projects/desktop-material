"""Real-repository acceptance coverage for the principal workflow panes."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import Button, DataTable, Input, SelectionList, Static, TextArea

from desktop_material_tui.ui.screens.dialogs import DecisionDialog
from desktop_material_tui.ui.screens.repository_panes import BranchesPane
from desktop_material_tui.ui.widgets.search_bar import SearchBar, SearchState

from .helpers import rendered_text, run_desktop_material, type_text


@pytest.mark.asyncio
async def test_changes_history_branches_and_stashes_load_real_git_data(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        changes = app.query_one("#changes-list", SelectionList)
        changes_detail = app.query_one("#changes-diff", TextArea)
        history = app.query_one("#history-table", DataTable)
        branches = app.query_one("#branches-table", DataTable)
        stashes = app.query_one("#stashes-table", DataTable)
        toolbar = app.query_one("#active-repository", Static)

        assert changes.option_count == 1
        assert "README.md" in str(changes.get_option_at_index(0).prompt)
        assert "Branch: main" in changes_detail.text
        assert "main" in rendered_text(toolbar)

        assert history.row_count == 2
        assert "Second fixture commit" in str(history.get_row_at(0)[1])

        assert branches.row_count >= 2
        branch_names = {str(branches.get_row_at(row)[1]) for row in range(branches.row_count)}
        assert {"main", "feature/pilot"} <= branch_names

        assert stashes.row_count == 1
        assert str(stashes.get_row_at(0)[0]) == "stash@{0}"
        assert "fixture stash" in str(stashes.get_row_at(0)[2])

        branch_search = app.query_one("#branches-search", SearchBar)
        branch_search.set_state(SearchState(query="feature/pilot"), emit=True)
        await pilot.pause()
        assert branches.row_count == 1
        assert str(branches.get_row_at(0)[1]) == "feature/pilot"
        assert app.query_one("#branches-pane", BranchesPane)._selected().name == "feature/pilot"


@pytest.mark.asyncio
async def test_destructive_dialog_requires_exact_typed_confirmation(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        changes = app.query_one("#changes-list", SelectionList)
        changes.select("README.md")

        assert await pilot.click("#changes-discard")
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)

        confirmation = app.screen.query_one("#decision-confirmation", Input)
        confirm = app.screen.query_one("#decision-confirm", Button)
        assert confirmation.has_focus
        assert confirm.disabled

        await type_text(pilot, "wrong")
        await pilot.pause()
        assert confirmation.value == "wrong"
        assert confirm.disabled

        # Textual follows terminal/Emacs conventions: Ctrl+A is Home, while
        # Ctrl+Shift+A selects all text in an Input.
        await pilot.press("ctrl+shift+a", "backspace")
        await type_text(pilot, "discard")
        await pilot.pause()
        assert confirmation.value == "discard"
        assert not confirm.disabled

        assert await pilot.click("#decision-cancel")
        await pilot.pause()
        assert not isinstance(app.screen, DecisionDialog)
        assert (
            (deterministic_repository.path / "README.md")
            .read_text(encoding="utf-8")
            .endswith("Working tree change for Pilot.\n")
        )
