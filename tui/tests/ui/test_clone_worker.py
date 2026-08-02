"""Worker-boundary checks for clone URL and destination safety."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest
from git_repository import DeterministicRepository

import desktop_material_tui.app as app_module
from desktop_material_tui.ui.screens.dialogs import CloneRequest

from .helpers import run_desktop_material


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("problem", "expected_message"),
    [
        ("invalid", "not a valid filesystem path"),
        ("occupied", "already exists and is not empty"),
        ("parent", "parent directory does not exist"),
        ("symlink", "is a symbolic link"),
    ],
)
async def test_clone_worker_rechecks_destination_before_git(
    deterministic_repository: DeterministicRepository,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    problem: str,
    expected_message: str,
) -> None:
    destination = tmp_path / "fresh clone"
    inspections = 0
    git_calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def inspect_destination(_value: str) -> tuple[Path | None, str | None]:
        nonlocal inspections
        inspections += 1
        if inspections == 1:
            return destination.resolve(), None
        return None, problem

    def record_git_call(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        git_calls.append((args, kwargs))
        return subprocess.CompletedProcess(args[0], 1, "", "unexpected invocation")

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        notices: list[tuple[str, dict[str, object]]] = []

        def record_notice(message: str, **metadata: object) -> None:
            notices.append((message, metadata))

        monkeypatch.setattr(app_module, "inspect_clone_destination", inspect_destination)
        monkeypatch.setattr(app_module.subprocess, "run", record_git_call)
        monkeypatch.setattr(app, "notify", record_notice)
        app._clone_request(
            CloneRequest(
                url="https://example.invalid/owner/repository.git",
                destination=str(destination),
            )
        )
        await app.workers.wait_for_complete()
        await pilot.pause()

    assert inspections == 2
    assert git_calls == []
    assert expected_message in notices[-1][0]
    assert notices[-1][1]["title"] == "Clone failed"
    assert notices[-1][1]["severity"] == "error"


@pytest.mark.asyncio
async def test_clone_worker_rejects_embedded_http_credentials(
    deterministic_repository: DeterministicRepository,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inspected: list[str] = []
    git_calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def inspect_destination(value: str) -> tuple[Path | None, str | None]:
        inspected.append(value)
        return Path(value).resolve(), None

    def record_git_call(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        git_calls.append((args, kwargs))
        return subprocess.CompletedProcess(args[0], 1, "", "unexpected invocation")

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        notices: list[tuple[str, dict[str, object]]] = []
        monkeypatch.setattr(app_module, "inspect_clone_destination", inspect_destination)
        monkeypatch.setattr(app_module.subprocess, "run", record_git_call)
        monkeypatch.setattr(
            app,
            "notify",
            lambda message, **metadata: notices.append((message, metadata)),
        )
        app._clone_request(
            CloneRequest(
                url="https://token@example.invalid/owner/repository.git",
                destination=str(tmp_path / "credential clone"),
            )
        )
        await app.workers.wait_for_complete()
        await pilot.pause()

    assert inspected == []
    assert git_calls == []
    assert "embedded credentials are not allowed" in notices[-1][0]
    assert notices[-1][1]["severity"] == "error"


@pytest.mark.asyncio
async def test_clone_worker_uses_argv_without_a_shell_after_both_checks(
    deterministic_repository: DeterministicRepository,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    destination = tmp_path / "safe clone"
    inspections: list[str] = []
    git_calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def inspect_destination(value: str) -> tuple[Path | None, str | None]:
        inspections.append(value)
        return destination.resolve(), None

    def record_git_call(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        git_calls.append((args, kwargs))
        return subprocess.CompletedProcess(args[0], 0, "", "")

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        opened: list[Path] = []
        monkeypatch.setattr(app_module, "inspect_clone_destination", inspect_destination)
        monkeypatch.setattr(app_module.shutil, "which", lambda _name: "/usr/bin/git")
        monkeypatch.setattr(app_module.subprocess, "run", record_git_call)
        monkeypatch.setattr(app, "open_repository_path", opened.append)
        app._clone_request(
            CloneRequest(
                url="https://example.invalid/owner/repository.git",
                destination=str(destination),
            )
        )
        await app.workers.wait_for_complete()
        await pilot.pause()

    assert inspections == [str(destination), str(destination)]
    assert len(git_calls) == 1
    positional, keywords = git_calls[0]
    assert positional == (
        [
            "/usr/bin/git",
            "clone",
            "--",
            "https://example.invalid/owner/repository.git",
            str(destination.resolve()),
        ],
    )
    assert keywords["shell"] is False
    assert opened == [destination.resolve()]
