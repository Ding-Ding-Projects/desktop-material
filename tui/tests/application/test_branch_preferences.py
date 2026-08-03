"""Private branch pin/hide/solo/default preference persistence."""

from __future__ import annotations

from pathlib import Path

import pytest

from desktop_material_tui.application.advanced_workspace import (
    BranchPreferenceStore,
    BranchViewPreferences,
    WorkspaceCommandError,
)


def test_branch_preferences_round_trip_outside_repository(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    preference_file = tmp_path / "private" / "branches.json"
    store = BranchPreferenceStore(repository, preference_file=preference_file)
    preferences = BranchViewPreferences(
        pinned=("main", "feature/pinned"),
        hidden=("archive/old",),
        solo="feature/pinned",
        default_branch="main",
    )

    store.save(preferences)

    assert store.load() == preferences
    assert preference_file.is_file()
    assert not (repository / ".desktop-material").exists()


def test_branch_preferences_reject_unsafe_or_foreign_data(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    preference_file = tmp_path / "branches.json"
    store = BranchPreferenceStore(repository, preference_file=preference_file)

    with pytest.raises(WorkspaceCommandError, match="unsafe"):
        store.save(BranchViewPreferences(hidden=("--delete",)))

    preference_file.write_text('{"repository":"/elsewhere","pinned":[]}', encoding="utf-8")
    with pytest.raises(WorkspaceCommandError, match="another repository"):
        store.load()
