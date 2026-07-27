"""A small, deterministic real Git repository used by UI and PTY tests."""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

_COMMIT_ENVIRONMENT = {
    "GIT_AUTHOR_DATE": "2024-01-02T03:04:05+00:00",
    "GIT_COMMITTER_DATE": "2024-01-02T03:04:05+00:00",
}


@dataclass(frozen=True)
class DeterministicRepository:
    """A throwaway repository with history, branches, a stash, and a dirty file."""

    path: Path
    git_executable: str

    def git(
        self,
        *arguments: str,
        environment: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        command_environment = os.environ.copy()
        command_environment.update(_COMMIT_ENVIRONMENT)
        if environment is not None:
            command_environment.update(environment)
        return subprocess.run(  # noqa: S603 - fixed executable and argv; never a shell
            (self.git_executable, *arguments),
            cwd=self.path,
            env=command_environment,
            capture_output=True,
            check=True,
            text=True,
            timeout=20,
        )


@pytest.fixture
def deterministic_repository(tmp_path: Path) -> DeterministicRepository:
    """Build a real repository without consulting global Git identity or hooks."""

    git_executable = shutil.which("git")
    if git_executable is None:
        pytest.skip("Git is required for repository interaction coverage.")

    repository_path = tmp_path / "interaction-repository"
    repository_path.mkdir()
    repository = DeterministicRepository(repository_path, git_executable)
    repository.git("init", "--initial-branch=main")
    repository.git("config", "user.name", "Desktop Material Test")
    repository.git("config", "user.email", "desktop-material@example.invalid")
    repository.git("config", "commit.gpgsign", "false")
    repository.git("config", "core.autocrlf", "false")

    (repository_path / "README.md").write_bytes(b"# Fixture repository\n")
    (repository_path / "notes.txt").write_bytes(b"first revision\n")
    repository.git("add", "--", "README.md", "notes.txt")
    repository.git("commit", "--no-verify", "-m", "Initial fixture commit")

    (repository_path / "notes.txt").write_bytes(b"first revision\nsecond revision\n")
    repository.git("add", "--", "notes.txt")
    repository.git(
        "commit",
        "--no-verify",
        "-m",
        "Second fixture commit",
        environment={
            "GIT_AUTHOR_DATE": "2024-02-03T04:05:06+00:00",
            "GIT_COMMITTER_DATE": "2024-02-03T04:05:06+00:00",
        },
    )
    repository.git("branch", "feature/pilot")

    (repository_path / "notes.txt").write_bytes(b"content waiting in the fixture stash\n")
    repository.git("stash", "push", "-m", "fixture stash", "--", "notes.txt")

    (repository_path / "README.md").write_bytes(
        b"# Fixture repository\n\nWorking tree change for Pilot.\n"
    )
    return repository


__all__ = ["DeterministicRepository", "deterministic_repository"]
