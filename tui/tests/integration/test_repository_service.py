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


def test_file_history_blame_coauthors_revert_and_cherry_pick(
    repository: RepositoryService,
    git_runner: SubprocessGitRunner,
) -> None:
    first_oid = commit_file(repository, "story.txt", "first\n", "Write first line")
    second_oid = commit_file(
        repository,
        "story.txt",
        "first\nsecond\n",
        "Write second line",
    )

    file_history = repository.file_history("story.txt")
    assert [commit.oid for commit in file_history] == [second_oid, first_oid]
    blame = repository.blame("story.txt")
    assert "<tui-test@example.test>" in blame
    assert "second" in blame

    target = repository.validate() / "story.txt"
    target.write_text("first\nsecond\nthird\n", encoding="utf-8")
    repository.stage(("story.txt",))
    coauthored = repository.commit(
        "Write third line",
        co_authors=("Pair Pilot <pair@example.test>",),
    )
    message = git_runner.run(
        ["show", "-s", "--format=%B", coauthored.oid], cwd=repository.validate()
    ).stdout
    assert "Co-authored-by: Pair Pilot <pair@example.test>" in message

    repository.revert_commit(coauthored.oid)
    assert target.read_text(encoding="utf-8") == "first\nsecond\n"

    repository.create_branch("feature/cherry")
    feature_oid = commit_file(repository, "feature.txt", "picked\n", "Pick this commit")
    repository.checkout_branch("main")
    repository.cherry_pick_commit(feature_oid)
    assert (repository.validate() / "feature.txt").read_text(encoding="utf-8") == "picked\n"


def test_merge_preview_applies_exact_reviewed_tip(repository: RepositoryService) -> None:
    commit_file(repository, "base.txt", "base\n", "Initial")
    repository.create_branch("feature/clean")
    feature_oid = commit_file(repository, "feature.txt", "feature\n", "Feature change")
    repository.checkout_branch("main")

    preview = repository.merge_preview("feature/clean")
    assert preview.current_branch == "main"
    assert preview.source_oid == feature_oid
    assert preview.conflicting_paths == ()
    assert preview.changed_files == ("feature.txt",)
    assert [commit.oid for commit in preview.incoming_commits] == [feature_oid]

    repository.apply_merge_preview(preview)
    assert (repository.validate() / "feature.txt").read_text(encoding="utf-8") == "feature\n"


def test_merge_preview_reports_conflicts_without_touching_worktree(
    repository: RepositoryService,
) -> None:
    commit_file(repository, "shared.txt", "base\n", "Initial")
    repository.create_branch("feature/conflict")
    commit_file(repository, "shared.txt", "feature\n", "Feature edit")
    repository.checkout_branch("main")
    main_oid = commit_file(repository, "shared.txt", "main\n", "Main edit")

    preview = repository.merge_preview("feature/conflict")

    assert preview.current_oid == main_oid
    assert preview.conflicting_paths == ("shared.txt",)
    assert (repository.validate() / "shared.txt").read_text(encoding="utf-8") == "main\n"
    assert repository.status().is_clean


def test_word_diff_context_and_exact_file_preview_versions(
    repository: RepositoryService,
) -> None:
    commit_file(repository, "table.csv", "name,value\nHar Gow,one\n", "Add table")
    target = repository.validate() / "table.csv"
    target.write_bytes(b"name,value\nHar Gow,two words\n")

    word = repository.diff(("table.csv",), context_lines=20, word_diff=True)
    assert word.word_diff
    assert "[-Gow,one-]" in word.text
    assert "{+Gow,two words+}" in word.text
    before, after = repository.diff_file_versions("table.csv", staged=False)
    assert before == b"name,value\nHar Gow,one\n"
    assert after == b"name,value\nHar Gow,two words\n"

    repository.stage(("table.csv",))
    before, after = repository.diff_file_versions("table.csv", staged=True)
    assert before == b"name,value\nHar Gow,one\n"
    assert after == b"name,value\nHar Gow,two words\n"

    with pytest.raises(InvalidGitArgumentError, match="preview limit"):
        repository.diff_file_versions("table.csv", staged=True, max_bytes=4)


def test_merge_preview_refuses_changed_reviewed_tip(
    repository: RepositoryService,
) -> None:
    commit_file(repository, "base.txt", "base\n", "Initial")
    repository.create_branch("feature/stale")
    commit_file(repository, "feature.txt", "feature\n", "Feature")
    repository.checkout_branch("main")
    preview = repository.merge_preview("feature/stale")
    commit_file(repository, "main.txt", "changed after review\n", "Advance main")

    with pytest.raises(InvalidGitArgumentError, match="tip changed after review"):
        repository.apply_merge_preview(preview)


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


def test_selective_stash_exact_identity_diff_and_branch(
    repository: RepositoryService,
) -> None:
    commit_file(repository, "a.txt", "a base\n", "Add A")
    commit_file(repository, "b.txt", "b base\n", "Add B")
    root = repository.validate()
    (root / "a.txt").write_text("a selected\n", encoding="utf-8")
    (root / "b.txt").write_text("b stays\n", encoding="utf-8")

    repository.stash_push("only A", paths=("a.txt",))
    selected = repository.stashes()[0]
    assert (root / "a.txt").read_text(encoding="utf-8") == "a base\n"
    assert (root / "b.txt").read_text(encoding="utf-8") == "b stays\n"
    assert "a selected" in repository.stash_diff(selected.ref, expected_oid=selected.oid)

    with pytest.raises(InvalidGitArgumentError, match="changed after selection"):
        repository.stash_apply(selected.ref, expected_oid="0" * 40)

    repository.stash_apply(selected.ref, expected_oid=selected.oid)
    assert (root / "a.txt").read_text(encoding="utf-8") == "a selected\n"
    repository.stash_drop(selected.ref, expected_oid=selected.oid)
    repository.discard(("a.txt", "b.txt"))

    (root / "a.txt").write_text("branch payload\n", encoding="utf-8")
    repository.stash_push("branch stash", paths=("a.txt",))
    branched = repository.stashes()[0]
    repository.stash_branch(
        "recovered/stash",
        branched.ref,
        expected_oid=branched.oid,
    )
    assert repository.status().branch_head == "recovered/stash"
    assert (root / "a.txt").read_text(encoding="utf-8") == "branch payload\n"
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
    with pytest.raises(InvalidGitArgumentError, match=r"Name <email@example\.com>"):
        repository.commit("Invalid co-author", co_authors=("missing-email",))
    with pytest.raises(InvalidGitArgumentError, match=r"Name <email@example\.com>"):
        repository.commit("Nameless co-author", co_authors=(" <pair@example.test>",))
