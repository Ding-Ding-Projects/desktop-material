"""Profile-local shell preferences coexist with repository session state."""

from __future__ import annotations

from pathlib import Path

import pytest

from desktop_material_tui.application.repository_workspace import (
    RepositoryWorkspaceService,
)
from desktop_material_tui.application.shell_state import ShellStateService
from desktop_material_tui.infrastructure.persistence import SQLiteStore


def test_palette_size_persists_without_overwriting_repository_workspace(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    database = SQLiteStore(tmp_path / "state.sqlite3")
    shell = ShellStateService(database, "work profile")
    workspace = RepositoryWorkspaceService(database, "work profile")

    try:
        assert shell.load().palette_size == "card"
        assert shell.save_palette_size("full").palette_size == "full"

        workspace.open_repository(repository)
        assert shell.load().palette_size == "full"

        assert shell.save_palette_size("card").palette_size == "card"
        snapshot = workspace.snapshot()
        assert [record.path for record in snapshot.records] == [repository.resolve()]
        session = database.get_session(shell.session_id)
        assert session is not None
        assert session.state["open_repository_paths"] == [str(repository.resolve())]
        assert session.state["shell_preferences"] == {"palette_size": "card"}
    finally:
        database.close()


def test_palette_size_rejects_unbounded_values(tmp_path: Path) -> None:
    database = SQLiteStore(tmp_path / "state.sqlite3")
    try:
        shell = ShellStateService(database)
        with pytest.raises(ValueError, match="card or full"):
            shell.save_palette_size("wall-sized")
    finally:
        database.close()
