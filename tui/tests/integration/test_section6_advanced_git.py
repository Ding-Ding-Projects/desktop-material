"""Real-Git coverage for reviewed section-6 terminal workflows."""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
from pathlib import Path

import pytest

from desktop_material_tui.application.advanced_git import AdvancedGitService
from desktop_material_tui.domain.errors import InvalidGitArgumentError


def _git(path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    executable = shutil.which("git")
    if executable is None:
        pytest.skip("Git is required for section-6 integration coverage")
    environment = os.environ.copy()
    environment.update(
        {
            "GIT_AUTHOR_NAME": "Section Six Test",
            "GIT_AUTHOR_EMAIL": "section6@example.invalid",
            "GIT_COMMITTER_NAME": "Section Six Test",
            "GIT_COMMITTER_EMAIL": "section6@example.invalid",
            "GIT_AUTHOR_DATE": "2026-08-02T12:00:00+00:00",
            "GIT_COMMITTER_DATE": "2026-08-02T12:00:00+00:00",
        }
    )
    return subprocess.run(  # noqa: S603 - fixed executable and argv only
        (executable, *args),
        cwd=path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.fixture
def section6_repository(tmp_path: Path) -> Path:
    repository = tmp_path / "section 6 repository"
    repository.mkdir()
    _git(repository, "init", "--initial-branch=main")
    _git(repository, "config", "user.name", "Section Six Local")
    _git(repository, "config", "user.email", "local@example.invalid")
    _git(repository, "config", "commit.gpgsign", "false")
    (repository / "tracked.txt").write_text("base\n", encoding="utf-8")
    _git(repository, "add", "--", "tracked.txt")
    _git(repository, "commit", "--no-verify", "-m", "Base commit")
    return repository


def test_author_offline_message_and_cross_ref_history(section6_repository: Path) -> None:
    service = AdvancedGitService(section6_repository)
    author = service.effective_author()
    assert author.complete
    assert author.name is not None
    assert author.name.value == "Section Six Local"
    assert author.name.scope == "local"
    assert author.email is not None
    assert author.email.origin.startswith("file:")

    (section6_repository / "staged.txt").write_text("ready\n", encoding="utf-8")
    _git(section6_repository, "add", "--", "staged.txt")
    suggestion = service.suggest_commit_message(style="detailed")
    assert suggestion.source == "offline-deterministic"
    assert suggestion.summary == "Add staged.txt"
    assert "A: staged.txt" in suggestion.body

    _git(section6_repository, "commit", "--no-verify", "-m", "Add staged fixture")
    _git(section6_repository, "branch", "topic/history")
    current = service.history_page(scope="current")
    across_refs = service.history_page(scope="all")
    assert current
    assert across_refs
    assert all(len(record.oid) in {40, 64} for record in across_refs)


def test_reviewed_bulk_delete_protects_and_revalidates_every_tip(
    section6_repository: Path,
) -> None:
    service = AdvancedGitService(section6_repository)
    _git(section6_repository, "branch", "delete/one")
    _git(section6_repository, "branch", "delete/two")

    with pytest.raises(InvalidGitArgumentError, match="protected"):
        service.review_bulk_branch_deletion(("main",), default_branch="main")

    _git(section6_repository, "switch", "delete/one")
    conservative = service.bulk_branch_candidates()
    main = next(candidate for candidate in conservative if candidate.name == "main")
    assert main.protected_reason == "conventional default branch"
    _git(section6_repository, "switch", "main")

    review = service.review_bulk_branch_deletion(
        ("delete/one", "delete/two"),
        default_branch="main",
    )
    (section6_repository / "advance.txt").write_text("advance\n", encoding="utf-8")
    _git(section6_repository, "add", "--", "advance.txt")
    _git(section6_repository, "commit", "--no-verify", "-m", "Advance main")
    _git(section6_repository, "branch", "-f", "delete/two", "main")
    with pytest.raises(InvalidGitArgumentError, match="changed after review"):
        service.apply_bulk_branch_deletion(review, default_branch="main")
    assert _git(section6_repository, "branch", "--list", "delete/one").stdout.strip()

    fresh = service.review_bulk_branch_deletion(
        ("delete/one", "delete/two"),
        default_branch="main",
    )
    results = service.apply_bulk_branch_deletion(fresh, default_branch="main")
    assert all(result.deleted for result in results)
    assert all(len(result.recovery_oid) in {40, 64} for result in results)


def test_reviewed_rebase_refuses_dirty_and_merge_all_is_stale_safe(
    section6_repository: Path,
) -> None:
    service = AdvancedGitService(section6_repository)
    _git(section6_repository, "switch", "-c", "topic/merge")
    (section6_repository / "topic.txt").write_text("topic\n", encoding="utf-8")
    _git(section6_repository, "add", "--", "topic.txt")
    _git(section6_repository, "commit", "--no-verify", "-m", "Topic commit")
    _git(section6_repository, "switch", "main")

    review = service.review_merge_all()
    assert [target.label for target in review.targets] == ["topic/merge"]
    assert not review.targets[0].conflicting_paths
    results = service.apply_merge_all(review)
    assert results[0].merged
    assert (section6_repository / "topic.txt").is_file()

    (section6_repository / "tracked.txt").write_text("dirty\n", encoding="utf-8")
    with pytest.raises(InvalidGitArgumentError, match="clean working tree"):
        service.preview_rebase("topic/merge")


def test_merge_all_revalidates_every_linked_worktree_is_clean(
    section6_repository: Path,
    tmp_path: Path,
) -> None:
    linked = tmp_path / "linked-worktree"
    _git(
        section6_repository,
        "worktree",
        "add",
        "-b",
        "topic/worktree",
        str(linked),
        "HEAD",
    )
    (linked / "linked.txt").write_text("committed\n", encoding="utf-8")
    _git(linked, "add", "--", "linked.txt")
    _git(linked, "commit", "--no-verify", "-m", "Linked worktree commit")

    service = AdvancedGitService(section6_repository)
    review = service.review_merge_all()
    (linked / "uncommitted.txt").write_text("do not overlook me\n", encoding="utf-8")

    with pytest.raises(InvalidGitArgumentError, match="became dirty after review"):
        service.apply_merge_all(review)
    assert _git(section6_repository, "rev-parse", "HEAD").stdout.strip() == review.current_oid


def test_pull_preview_fetches_then_integrates_only_reviewed_oid(
    section6_repository: Path,
    tmp_path: Path,
) -> None:
    remote = tmp_path / "pull remote.git"
    _git(tmp_path, "init", "--bare", "--initial-branch=main", str(remote))
    _git(section6_repository, "remote", "add", "origin", str(remote))
    _git(section6_repository, "push", "-u", "origin", "main")
    _git(section6_repository, "remote", "set-head", "origin", "main")
    peer = tmp_path / "peer"
    _git(tmp_path, "clone", str(remote), str(peer))
    (peer / "incoming.txt").write_text("incoming\n", encoding="utf-8")
    _git(peer, "add", "--", "incoming.txt")
    _git(peer, "commit", "--no-verify", "-m", "Incoming commit")
    _git(peer, "push", "origin", "main")

    service = AdvancedGitService(section6_repository)
    original = _git(section6_repository, "rev-parse", "HEAD").stdout.strip()
    preview = service.prepare_pull_preview()
    assert preview.current_oid == original
    assert preview.behind == 1
    assert preview.confirmable
    assert preview.incoming_files == ("incoming.txt",)
    service.apply_pull_preview(preview)
    assert _git(section6_repository, "rev-parse", "HEAD").stdout.strip() == preview.upstream_oid


def test_deleted_upstream_recovery_requires_remote_proof_and_defaults_to_keep_local(
    section6_repository: Path,
    tmp_path: Path,
) -> None:
    remote = tmp_path / "recovery remote.git"
    _git(tmp_path, "init", "--bare", "--initial-branch=main", str(remote))
    _git(section6_repository, "remote", "add", "origin", str(remote))
    _git(section6_repository, "push", "-u", "origin", "main")
    _git(section6_repository, "remote", "set-head", "origin", "main")
    _git(section6_repository, "switch", "-c", "stale/review")
    (section6_repository / "stale.txt").write_text("stranded\n", encoding="utf-8")
    _git(section6_repository, "add", "--", "stale.txt")
    _git(section6_repository, "commit", "--no-verify", "-m", "Stranded work")
    _git(section6_repository, "push", "-u", "origin", "stale/review")

    service = AdvancedGitService(section6_repository)
    with pytest.raises(InvalidGitArgumentError, match="still advertises"):
        service.review_deleted_upstream(default_branch="main")
    _git(section6_repository, "push", "origin", "--delete", "stale/review")
    review = service.review_deleted_upstream(default_branch="main")
    assert review.stranded_commits == 1
    service.apply_deleted_upstream_recovery(review, delete_local=False)
    assert _git(section6_repository, "branch", "--show-current").stdout.strip() == "main"
    assert _git(section6_repository, "branch", "--list", "stale/review").stdout.strip()


def test_batch_review_rejects_ambiguous_paths_and_supports_cancellation(
    section6_repository: Path,
) -> None:
    child = section6_repository / "nested"
    child.mkdir()
    with pytest.raises(InvalidGitArgumentError, match="root exactly"):
        AdvancedGitService.review_batch_sync(
            (child,),
            operation="fetch",
        )
    with pytest.raises(InvalidGitArgumentError, match="duplicate"):
        AdvancedGitService.review_batch_sync(
            (section6_repository, section6_repository),
            operation="fetch",
        )
    review = AdvancedGitService.review_batch_sync(
        (section6_repository,),
        operation="fetch",
    )
    cancellation = threading.Event()
    cancellation.set()
    results = AdvancedGitService.apply_batch_sync(review, cancellation=cancellation)
    assert results[0].status == "cancelled"


def test_failure_diagnosis_is_bounded_and_forbids_history_destroying_recovery() -> None:
    diagnosis = AdvancedGitService.diagnose_failure(
        "push",
        "! [rejected] main -> main (non-fast-forward)",
        repository="repository",
        remote="origin",
        branch="main",
    )
    assert diagnosis.kind == "non-fast-forward"
    assert not diagnosis.one_click_safe
    assert "Do not force-push" in diagnosis.recovery_prompt
    assert "switch branches" in diagnosis.recovery_prompt
