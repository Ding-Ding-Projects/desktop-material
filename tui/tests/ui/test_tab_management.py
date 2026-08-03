from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.pilot import Pilot
from textual.widgets import Button, Checkbox, DataTable, Input, Static, TabbedContent

from desktop_material_tui.infrastructure.persistence import RepositoryRecord

from .helpers import run_desktop_material


async def _activate_button(pilot: Pilot[None], button: Button) -> None:
    button.focus()
    button.scroll_visible(animate=False, force=True, immediate=True)
    await pilot.pause()
    await pilot.press("enter")
    await pilot.pause()


@pytest.mark.asyncio
async def test_repository_tab_metadata_groups_order_and_session_export(
    deterministic_repository: DeterministicRepository,
    tmp_path: Path,
) -> None:
    session_file = tmp_path / "tabs.json"
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        await pilot.click("#repository-tabs-menu")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "tab-manager-tab"
        assert app.query_one("#repository-tabs-table", DataTable).row_count == 1

        alias = app.query_one("#tab-alias", Input)
        alias.value = "Primary workspace"
        await pilot.click("#tab-alias-save")
        group = app.query_one("#tab-group", Input)
        group.value = "Services"
        await pilot.click("#tab-group-save")
        collapse_button = app.query_one("#tab-group-collapse", Button)
        assert not collapse_button.disabled
        await _activate_button(pilot, collapse_button)
        await _activate_button(pilot, app.query_one("#tab-pin", Button))
        await _activate_button(pilot, app.query_one("#tab-favorite", Button))
        await app.workers.wait_for_complete()

        workspace = app._repository_workspace
        assert workspace is not None
        record = workspace.database.get_repository(deterministic_repository.path)
        assert isinstance(record, RepositoryRecord)
        assert record.alias == "Primary workspace"
        assert record.group_name == "Services"
        assert record.pinned
        assert record.favorite
        assert workspace.snapshot().collapsed_groups == frozenset({"Services"})

        app.query_one("#tab-session-path", Input).value = str(session_file)
        await _activate_button(pilot, app.query_one("#tab-session-export", Button))
        payload = json.loads(session_file.read_text(encoding="utf-8"))
        assert payload["tabs"] == [
            {
                "alias": "Primary workspace",
                "favorite": True,
                "path": str(deterministic_repository.path.resolve()),
                "pinned": True,
            }
        ]
        assert "Services" not in session_file.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_reviewed_bulk_close_rechecks_work_and_never_deletes_repository(
    deterministic_repository: DeterministicRepository,
    tmp_path: Path,
) -> None:
    clean_repository = tmp_path / "clean-repository"
    await asyncio.to_thread(
        subprocess.run,
        (
            deterministic_repository.git_executable,
            "clone",
            "--quiet",
            str(deterministic_repository.path),
            str(clean_repository),
        ),
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.open_repository_path(clean_repository)
        await app.workers.wait_for_complete()
        workspace = app._repository_workspace
        assert workspace is not None
        workspace.set_pinned(deterministic_repository.path, True)
        app._workspace_changed()
        await app.workers.wait_for_complete()

        app.action_manage_repository_tabs()
        await app.workers.wait_for_complete()
        query = app.query_one("#repository-tabs-close-query", Input)
        query.value = "repository"
        await pilot.pause()
        preview = str(app.query_one("#repository-tabs-close-preview", Static).render())
        assert "1 will close" in preview
        assert "1 pinned excluded" in preview

        reviewed = app.query_one("#repository-tabs-close-reviewed", Checkbox)
        apply_button = app.query_one("#repository-tabs-close-apply", Button)
        assert not reviewed.disabled
        reviewed.focus()
        reviewed.scroll_visible(animate=False, force=True, immediate=True)
        await pilot.pause()
        await pilot.press("space")
        assert not apply_button.disabled
        await _activate_button(pilot, apply_button)
        await app.workers.wait_for_complete()

        assert clean_repository.resolve() not in app.repository_services
        assert deterministic_repository.path.resolve() in app.repository_services
        assert clean_repository.is_dir()
        assert workspace.database.get_repository(clean_repository) is not None
