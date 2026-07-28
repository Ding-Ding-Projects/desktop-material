"""Real-Git verification for advanced workspace operations."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from desktop_material_tui.application.advanced_git import AdvancedGitService
from desktop_material_tui.domain.errors import InvalidGitArgumentError


def _git(repository: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    executable = shutil.which("git")
    if executable is None:
        pytest.skip("Git is required for advanced integration coverage")
    environment = os.environ.copy()
    environment.update(
        {
            "GIT_AUTHOR_NAME": "Advanced Test",
            "GIT_AUTHOR_EMAIL": "advanced@example.invalid",
            "GIT_COMMITTER_NAME": "Advanced Test",
            "GIT_COMMITTER_EMAIL": "advanced@example.invalid",
            "GIT_AUTHOR_DATE": "2026-07-27T12:00:00+00:00",
            "GIT_COMMITTER_DATE": "2026-07-27T12:00:00+00:00",
        }
    )
    return subprocess.run(  # noqa: S603 - fixed executable with argv
        (executable, *arguments),
        cwd=repository,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.fixture
def advanced_repository(tmp_path: Path) -> Path:
    repository = tmp_path / "advanced repository"
    repository.mkdir()
    _git(repository, "init", "--initial-branch=main")
    (repository / "src").mkdir()
    (repository / "docs").mkdir()
    (repository / "src" / "app.py").write_text("print('ready')\n", encoding="utf-8")
    (repository / "docs" / "guide.md").write_text("# Guide\n", encoding="utf-8")
    _git(repository, "add", "--", "src/app.py", "docs/guide.md")
    _git(repository, "commit", "--no-verify", "-m", "Initial advanced fixture")
    return repository


def test_worktree_lifecycle_and_reflog_are_bounded(
    advanced_repository: Path,
    tmp_path: Path,
) -> None:
    service = AdvancedGitService(advanced_repository)
    target = tmp_path / "feature worktree"

    initial = service.worktrees()
    assert len(initial) == 1
    assert initial[0].display_branch == "main"

    service.add_worktree(
        target,
        branch="feature/advanced",
        create_branch=True,
    )
    assert target in {record.path for record in service.worktrees()}
    assert any(record.display_branch == "feature/advanced" for record in service.worktrees())

    service.remove_worktree(target)
    assert not target.exists()
    assert target not in {record.path for record in service.worktrees()}

    reflog = service.reflog(limit=10)
    assert reflog
    assert reflog[0].selector.startswith("HEAD@{")
    assert len(reflog) <= 10


def test_sparse_checkout_and_diagnostics(
    advanced_repository: Path,
) -> None:
    service = AdvancedGitService(advanced_repository)

    assert not service.sparse_checkout().enabled
    service.set_sparse_checkout(("src",), cone_mode=True)
    state = service.sparse_checkout()
    assert state.enabled
    assert state.cone_mode
    assert state.patterns == ("src",)
    service.disable_sparse_checkout()
    assert not service.sparse_checkout().enabled

    diagnostics = service.diagnostics()
    assert diagnostics.repository_root == advanced_repository.resolve()
    assert diagnostics.git_version.startswith("git version ")
    assert diagnostics.head
    assert diagnostics.git_directory.is_absolute()


def test_advanced_operations_reject_unregistered_or_escaping_paths(
    advanced_repository: Path,
    tmp_path: Path,
) -> None:
    service = AdvancedGitService(advanced_repository)

    with pytest.raises(InvalidGitArgumentError):
        service.remove_worktree(tmp_path / "not registered")
    with pytest.raises(InvalidGitArgumentError):
        service.update_submodules(("../outside",))
    with pytest.raises(InvalidGitArgumentError):
        service.set_sparse_checkout(("--danger",))


def test_submodule_status_deinitialize_update_and_sync(
    advanced_repository: Path,
    tmp_path: Path,
) -> None:
    source = tmp_path / "submodule source"
    source.mkdir()
    _git(source, "init", "--initial-branch=main")
    (source / "module.txt").write_text("submodule fixture\n", encoding="utf-8")
    _git(source, "add", "--", "module.txt")
    _git(source, "commit", "--no-verify", "-m", "Submodule fixture")
    _git(advanced_repository, "config", "protocol.file.allow", "always")
    _git(
        advanced_repository,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(source),
        "modules/example",
    )
    _git(advanced_repository, "commit", "--no-verify", "-am", "Add submodule")
    service = AdvancedGitService(advanced_repository)

    modules = service.submodules()
    assert len(modules) == 1
    assert modules[0].path == "modules/example"
    assert modules[0].initialized

    service.sync_submodules()
    service.deinit_submodule("modules/example")
    assert not service.submodules()[0].initialized
    service.update_submodules(("modules/example",))
    assert service.submodules()[0].initialized
