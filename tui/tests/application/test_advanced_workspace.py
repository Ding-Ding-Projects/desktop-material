"""Safe argv command profiles and execution."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from desktop_material_tui.application.advanced_workspace import (
    WorkspaceCommandError,
    WorkspaceCommandProfile,
    WorkspaceCommandService,
)


def test_profile_is_private_atomic_and_repository_scoped(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    profile_file = tmp_path / "private" / "commands.json"
    service = WorkspaceCommandService(repository, profile_file=profile_file)
    profile = WorkspaceCommandProfile(
        repository=str(repository.resolve()),
        build_command="git status --short",
        run_command="git log -1 --oneline",
        working_directory=".",
        terminal_command="xterm",
    )

    service.save_profile(profile)

    assert service.load_profile() == profile
    assert profile_file.is_file()
    assert not (repository / ".desktop-material").exists()


@pytest.mark.parametrize(
    "command",
    [
        "sh -c 'echo unsafe'",
        "bash -c 'echo unsafe'",
        "python tool.py | tee output.txt",
        "python tool.py > output.txt",
    ],
)
def test_shell_modes_and_operators_are_rejected(tmp_path: Path, command: str) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    service = WorkspaceCommandService(repository, profile_file=tmp_path / "profile.json")

    with pytest.raises(WorkspaceCommandError):
        service.parse_argv(command)


def test_working_directory_cannot_escape_repository(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    service = WorkspaceCommandService(repository, profile_file=tmp_path / "profile.json")

    with pytest.raises(WorkspaceCommandError):
        service.resolve_working_directory("../outside")


def test_command_runs_without_shell_and_captures_output(tmp_path: Path) -> None:
    executable = shutil.which("git")
    if executable is None:
        pytest.skip("Git is required for argv execution coverage")
    repository = tmp_path / "repository"
    repository.mkdir()
    service = WorkspaceCommandService(repository, profile_file=tmp_path / "profile.json")

    result = service.run("git --version", timeout=10)

    assert result.ok
    assert result.argv == ("git", "--version")
    assert result.stdout.startswith("git version ")
    assert result.stderr == ""


def test_terminal_launcher_uses_argv_and_repository_child_cwd(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repository"
    child = repository / "packages" / "app"
    child.mkdir(parents=True)
    service = WorkspaceCommandService(repository, profile_file=tmp_path / "profile.json")
    captured: dict[str, Any] = {}

    def fake_popen(args: tuple[str, ...], **kwargs: Any) -> object:
        captured["args"] = args
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    argv = service.launch_terminal("xterm -fa Monospace", working_directory="packages/app")

    assert argv == ("xterm", "-fa", "Monospace")
    assert captured["args"] == argv
    assert captured["cwd"] == child.resolve()
    assert captured["shell"] is False
