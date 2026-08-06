from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from desktop_material_tui.application.version_history import VersionHistoryService
from desktop_material_tui.infrastructure.persistence import (
    ProfileHistoryError,
    SensitiveSettingError,
    XDGPaths,
)


def test_version_history_records_diffs_and_append_only_restore(tmp_path: Path) -> None:
    paths = XDGPaths.discover(environment={}, home=tmp_path / "home").ensure()
    service = VersionHistoryService(paths, "../local/profile")

    first = service.record(
        {"theme": "dark", "credential_helper": "manager"},
        label="Dark theme",
        profile={"name": "Local"},
    )
    second = service.record(
        {"theme": "light", "credential_helper": "manager"},
        label="Light theme",
        profile={"name": "Local"},
    )

    assert first.revision != second.revision
    assert 'theme = "dark"' in service.diff(first.revision)
    assert 'theme = "light"' in service.diff(first.revision)
    restored = service.restore(first.revision)
    assert restored.revision not in (first.revision, second.revision)
    assert service.read().settings["theme"] == "dark"
    assert len(service.list_versions()) == 3

    history_path = Path(service.repository_path).resolve()
    assert history_path.is_relative_to(paths.profile_history_root.resolve())
    git_executable = shutil.which("git")
    assert git_executable is not None
    long_paths = subprocess.run(  # noqa: S603 - resolved Git executable and fixed argv
        (
            git_executable,
            "-C",
            str(history_path),
            "config",
            "--local",
            "--get",
            "core.longpaths",
        ),
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert long_paths.stdout.strip().lower() == "true"


def test_unchanged_snapshot_does_not_create_redundant_commit(tmp_path: Path) -> None:
    paths = XDGPaths.discover(environment={}, home=tmp_path).ensure()
    service = VersionHistoryService(paths)
    first = service.record({"theme": "dark"}, label="First")
    duplicate = service.record({"theme": "dark"}, label="Duplicate")

    assert duplicate.revision == first.revision
    assert len(service.list_versions()) == 1


def test_version_history_refuses_secret_bearing_settings(tmp_path: Path) -> None:
    service = VersionHistoryService(XDGPaths.discover(environment={}, home=tmp_path).ensure())

    with pytest.raises(SensitiveSettingError):
        service.record({"github_token": "not-for-history"}, label="Unsafe")


def test_version_history_refuses_unknown_but_well_formed_revision(
    tmp_path: Path,
) -> None:
    service = VersionHistoryService(XDGPaths.discover(environment={}, home=tmp_path).ensure())
    service.record({"theme": "dark"}, label="Initial")

    with pytest.raises(ProfileHistoryError, match="does not exist"):
        service.restore("0" * 40)
