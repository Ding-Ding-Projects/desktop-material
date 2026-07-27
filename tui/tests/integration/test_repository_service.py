from pathlib import Path

import pytest

from desktop_material_tui.application.repository_service import RepositoryService
from desktop_material_tui.domain.errors import (
    GitCommandError,
    InvalidGitArgumentError,
)
from desktop_material_tui.infrastructure.git.runner import SubprocessGitRunner


@pytest.fixture
def git_runner() -> SubprocessGitRunner:
    return SubprocessGitRunner(default_timeout=10)


@pytest.fixture
def repository(tmp_path: Path, git_runner: SubprocessGitRunner) -> RepositoryService:
    git_runner.run(["init", "-b", "main"], cwd=tmp_path)
    git_runner.run(["config", "user.name", "TUI Test"], cwd=tmp_path)
    git_runner.run(
        ["config", "user.email", "tui-test@example.test"],
        cwd=tmp_path,
    )
    return RepositoryService(tmp_path, git_runner, timeout=10, network_timeout=20)


def commit_file(
    repository: RepositoryService,
    relative_path: str,
    contents: str,
    summary: str,
) -> str:
    target = repository.validate() / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(contents, encoding="utf-8")
    repository.stage([relative_path])
    return repository.commit(summary).oid


def test_status_stage_unstage_commit_history_and_diff(
    repository: RepositoryService,
) -> None:
    root = repository.validate()
    unusual_path = "folder/file with spaces.txt"
    target = root / unusual_path
    target.parent.mkdir()
    target.write_text("first\n", encoding="utf-8")

    initial = repository.status()
    assert initial.is_initial
    assert initial.untracked_count == 1

    repository.stage([unusual_path])
    assert repository.status().staged_count == 1
    repository.unstage([unusual_path])
    assert repository.status().untracked_count == 1
    repository.stage([unusual_path])

    commit = repository.commit("Initial commit", "Integration test body")
    assert commit.subject == "Initial commit"
    assert commit.body == "Integration test body"
    assert repository.status().is_clean
    assert repository.history(limit=10)[0].oid == commit.oid

    target.write_text("first\nsecond\n", encoding="utf-8")
    working_diff = repository.diff([unusual_path])
    assert "+second" in working_diff.text
    assert not working_diff.staged

    repository.stage([unusual_path])
    staged_diff = repository.diff([unusual_path], staged=True)
    assert "+second" in staged_diff.text
    repository.unstage([unusual_path])
    assert repository.status().unstaged_count == 1

    repository.discard([unusual_path])
    assert target.read_text(encoding="utf-8") == "first\n"
    assert repository.status().is_clean


def test_discard_staged_restores_index_and_worktree(
    repository: RepositoryService,
) -> None:
    commit_file(repository, "tracked.txt", "original\n", "Initial")
    target = repository.validate() / "tracked.txt"
    target.write_text("changed\n", encoding="utf-8")
    repository.stage(["tracked.txt"])

    repository.discard(["tracked.txt"], staged=True)

    assert target.read_text(encoding="utf-8") == "original\n"
    assert repository.status().is_clean


def test_discard_never_deletes_untracked_files(
    repository: RepositoryService,
) -> None:
    untracked = repository.validate() / "untracked.txt"
    untracked.write_text("keep me\n", encoding="utf-8")

    with pytest.raises(GitCommandError):
        repository.discard(["untracked.txt"])

    assert untracked.exists()


def test_branch_lifecycle(repository: RepositoryService) -> None:
    commit_file(repository, "tracked.txt", "base\n", "Initial")

    created = repository.create_branch("feature/clickable")
    assert created.name == "feature/clickable"
    assert created.is_current

    renamed = repository.rename_branch("feature/clickable", "feature/text-box")
    assert renamed.name == "feature/text-box"
    assert renamed.is_current

    repository.checkout_branch("main")
    repository.delete_branch("feature/text-box")

    assert [branch.name for branch in repository.branches(False)] == ["main"]


def test_stash_push_apply_pop_and_drop(repository: RepositoryService) -> None:
    commit_file(repository, "tracked.txt", "base\n", "Initial")
    target = repository.validate() / "tracked.txt"
    target.write_text("work one\n", encoding="utf-8")

    repository.stash_push("clickable stash")
    stashes = repository.stashes()
    assert len(stashes) == 1
    assert "clickable stash" in stashes[0].message
    assert target.read_text(encoding="utf-8") == "base\n"

    repository.stash_apply(pop=True)
    assert target.read_text(encoding="utf-8") == "work one\n"
    assert repository.stashes() == ()

    repository.discard(["tracked.txt"])
    target.write_text("work two\n", encoding="utf-8")
    repository.stash_push("drop me")
    repository.stash_drop()
    assert repository.stashes() == ()


def test_tags_and_remotes(
    repository: RepositoryService,
    git_runner: SubprocessGitRunner,
    tmp_path: Path,
) -> None:
    commit_file(repository, "tracked.txt", "base\n", "Initial")
    tag = repository.create_tag("v1.0", "First release")
    assert tag.name == "v1.0"
    assert tag.object_type == "tag"
    repository.delete_tag("v1.0")
    assert repository.tags() == ()

    remote_path = tmp_path.parent / f"{tmp_path.name}-remote.git"
    remote_path.mkdir()
    git_runner.run(["init", "--bare", "-b", "main"], cwd=remote_path)
    remote = repository.add_remote("origin", str(remote_path))
    assert remote.name == "origin"
    repository.push("origin", "main", set_upstream=True)
    assert repository.status().upstream == "origin/main"
    repository.fetch("origin")
    repository.remove_remote("origin")
    assert repository.remotes() == ()


def test_fetch_pull_and_push_against_second_worktree(
    repository: RepositoryService,
    git_runner: SubprocessGitRunner,
    tmp_path: Path,
) -> None:
    commit_file(repository, "shared.txt", "one\n", "Initial")
    remote_path = tmp_path.parent / f"{tmp_path.name}-sync.git"
    remote_path.mkdir()
    git_runner.run(["init", "--bare", "-b", "main"], cwd=remote_path)
    repository.add_remote("origin", str(remote_path))
    repository.push("origin", "main", set_upstream=True)

    second_path = tmp_path.parent / f"{tmp_path.name}-second"
    git_runner.run(["clone", str(remote_path), str(second_path)], cwd=tmp_path.parent)
    git_runner.run(["config", "user.name", "Second Test"], cwd=second_path)
    git_runner.run(
        ["config", "user.email", "second@example.test"],
        cwd=second_path,
    )
    (second_path / "shared.txt").write_text("one\ntwo\n", encoding="utf-8")
    git_runner.run(["add", "--", "shared.txt"], cwd=second_path)
    git_runner.run(["commit", "-m", "Second commit"], cwd=second_path)
    git_runner.run(["push", "origin", "main"], cwd=second_path)

    repository.fetch("origin")
    assert repository.status().behind == 1
    repository.pull("origin", "main", ff_only=True)
    assert (repository.validate() / "shared.txt").read_text(encoding="utf-8") == ("one\ntwo\n")


def test_inputs_cannot_escape_repository_or_become_options(
    repository: RepositoryService,
) -> None:
    with pytest.raises(InvalidGitArgumentError, match="within"):
        repository.stage(["../outside.txt"])
    with pytest.raises(InvalidGitArgumentError, match="begin"):
        repository.create_branch("--upload-pack=evil")
    with pytest.raises(InvalidGitArgumentError, match="credential vault"):
        repository.add_remote(
            "unsafe",
            "https://user:secret@example.test/repository.git",
        )
