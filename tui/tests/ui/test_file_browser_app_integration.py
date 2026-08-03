from __future__ import annotations

from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.widgets import DataTable, Input, TextArea

from .helpers import assert_visible_inside_app, run_desktop_material


@pytest.mark.asyncio
async def test_files_tab_binds_active_repository_and_opens_selected_file(
    deterministic_repository: DeterministicRepository,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    opened: list[tuple[Path, Path]] = []
    async with run_desktop_material(
        deterministic_repository.path,
        size=(78, 24),
    ) as (app, pilot):
        monkeypatch.setattr(
            app,
            "_open_external_editor_target",
            lambda target, *, workspace_root: opened.append((target, workspace_root)),
        )
        await pilot.click("#--content-tab-files-tab")
        await app.workers.wait_for_complete()

        table = app.query_one("#files-table", DataTable)
        assert table.row_count >= 2
        query = app.query_one("#files-query", Input)
        query.value = "README.md"
        await pilot.pause()
        assert table.row_count == 1
        table.focus()
        await pilot.press("enter")
        await app.workers.wait_for_complete()
        assert "Fixture repository" in app.query_one("#files-preview", TextArea).text

        await pilot.click("#files-open-editor")
        await pilot.pause()
        assert opened == [
            (
                deterministic_repository.path.resolve() / "README.md",
                deterministic_repository.path.resolve(),
            )
        ]
        assert_visible_inside_app(app, "#files-table")
        app.query_one("#files-preview", TextArea).focus()
        await pilot.pause()
        assert_visible_inside_app(app, "#files-preview")
