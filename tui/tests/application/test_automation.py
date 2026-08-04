"""Layered automation settings, guards, scheduling, and real Git outcomes."""

from __future__ import annotations

from dataclasses import replace

# `datetime.UTC` is 3.11+, and this package declares `requires-python = ">=3.10"`
# — so on the 3.10 leg of the matrix this import failed and pytest never reached
# a single one of the 649 tests it had collected.
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from desktop_material_tui.application.automation import (
    AutomationError,
    AutomationGuardState,
    AutomationOverrides,
    AutomationRunResult,
    AutomationScheduler,
    AutomationSettings,
    AutomationSettingsState,
    AutomationSettingsStore,
    AutomationTarget,
    RepositoryAutomationService,
    build_fallback_commit_message,
    can_auto_commit_push,
    can_auto_pull,
    resolve_automation_settings,
)
from desktop_material_tui.infrastructure.git.runner import SubprocessGitRunner


def _store(tmp_path: Path) -> AutomationSettingsStore:
    return AutomationSettingsStore(
        settings_file=tmp_path / "state" / "settings.json",
        audit_file=tmp_path / "state" / "audit.json",
    )


def _guard(**changes: object) -> AutomationGuardState:
    base = AutomationGuardState(
        tip_is_valid=True,
        branch_name="main",
        has_changes=True,
        has_conflict=False,
        has_multi_commit_operation=False,
        operation_in_progress=False,
        has_draft_commit_message=False,
        has_upstream=True,
    )
    return replace(base, **changes)


def _git(runner: SubprocessGitRunner, cwd: Path, *args: str) -> str:
    return runner.run(args, cwd=cwd).stdout.strip()


def _repository_with_origin(tmp_path: Path) -> tuple[Path, Path, SubprocessGitRunner]:
    runner = SubprocessGitRunner(default_timeout=30)
    origin = tmp_path / "origin.git"
    repo = tmp_path / "repo"
    _git(runner, tmp_path, "init", "--bare", str(origin))
    _git(runner, tmp_path, "clone", str(origin), str(repo))
    _git(runner, repo, "config", "user.name", "Automation Test")
    _git(runner, repo, "config", "user.email", "automation@example.test")
    (repo / "tracked.txt").write_text("initial\n", encoding="utf-8")
    _git(runner, repo, "add", "tracked.txt")
    _git(runner, repo, "commit", "-m", "Initial")
    _git(runner, repo, "branch", "-M", "main")
    _git(runner, repo, "push", "--set-upstream", "origin", "main")
    return repo, origin, runner


def test_defaults_are_disabled_and_corrupt_state_fails_closed(tmp_path: Path) -> None:
    store = _store(tmp_path)

    assert store.load() == AutomationSettingsState()
    assert not store.load().global_settings.auto_commit_push_enabled
    store.settings_file.parent.mkdir(parents=True)
    store.settings_file.write_text("not json", encoding="utf-8")
    with pytest.raises(AutomationError, match="Could not read"):
        store.load()


def test_settings_round_trip_and_resolve_global_account_repository_precedence(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    state = AutomationSettingsState(
        global_settings=AutomationSettings(
            auto_commit_push_enabled=True,
            auto_commit_push_interval=60,
            auto_pull_enabled=False,
            auto_pull_interval=30,
        ),
        accounts={"account": AutomationOverrides(auto_pull_enabled=True)},
        repositories={
            "repo": AutomationOverrides(
                auto_commit_push_enabled=False,
                auto_pull_interval=5,
            )
        },
    )

    store.save(state)
    effective = resolve_automation_settings(
        store.load(), account_key="account", repository_key="repo"
    )

    assert not effective.auto_commit_push_enabled
    assert effective.auto_commit_push_interval == 60
    assert effective.auto_pull_enabled
    assert effective.auto_pull_interval == 5
    assert "schema" in store.settings_file.read_text(encoding="utf-8")


def test_settings_reject_invalid_intervals_keys_and_unbounded_maps(tmp_path: Path) -> None:
    store = _store(tmp_path)
    with pytest.raises(AutomationError, match="interval"):
        store.save(
            AutomationSettingsState(
                global_settings=AutomationSettings(
                    auto_commit_push_interval=6  # type: ignore[arg-type]
                )
            )
        )
    with pytest.raises(AutomationError, match="key"):
        store.save(AutomationSettingsState(accounts={"bad\nkey": AutomationOverrides()}))
    with pytest.raises(AutomationError, match="exceeds"):
        store.save(
            AutomationSettingsState(
                accounts={str(index): AutomationOverrides() for index in range(257)}
            )
        )


@pytest.mark.parametrize(
    ("state", "reason"),
    [
        (_guard(tip_is_valid=False), "branch"),
        (_guard(branch_name=None), "branch"),
        (_guard(has_changes=False), "no changes"),
        (_guard(has_draft_commit_message=True), "draft"),
        (_guard(has_conflict=True), "conflict"),
        (_guard(has_multi_commit_operation=True), "conflict"),
        (_guard(operation_in_progress=True), "Another Git operation"),
    ],
)
def test_commit_push_guard_skips_every_unsafe_state(
    state: AutomationGuardState, reason: str
) -> None:
    decision = can_auto_commit_push(state)
    assert not decision.safe
    assert reason.casefold() in decision.reason.casefold()


@pytest.mark.parametrize(
    ("state", "reason"),
    [
        (_guard(has_changes=False, has_upstream=False), "upstream"),
        (_guard(has_changes=True), "not clean"),
        (_guard(has_changes=False, has_conflict=True), "conflict"),
        (_guard(has_changes=False, operation_in_progress=True), "Another Git operation"),
    ],
)
def test_pull_guard_skips_every_unsafe_state(
    state: AutomationGuardState, reason: str
) -> None:
    decision = can_auto_pull(state)
    assert not decision.safe
    assert reason.casefold() in decision.reason.casefold()


def test_fallback_message_matches_desktop_offline_contract() -> None:
    now = datetime(2026, 8, 2, 12, 34, 56, tzinfo=timezone.utc)

    summary, description = build_fallback_commit_message(("a.txt", "b.py"), now)

    assert summary == "Auto commit 2026-08-02 12:34:56Z"
    assert description == "2 files changed\n\n- a.txt\n- b.py"


def test_real_commit_push_creates_a_commit_pushes_and_records_audit(tmp_path: Path) -> None:
    repo, origin, runner = _repository_with_origin(tmp_path)
    store = _store(tmp_path)
    fixed = datetime(2026, 8, 2, 13, 0, tzinfo=timezone.utc)
    (repo / "tracked.txt").write_text("changed\n", encoding="utf-8")
    service = RepositoryAutomationService(
        repo,
        runner=runner,
        store=store,
        clock=lambda: fixed,
    )

    result = service.run("commit-push")

    assert result.status == "done"
    assert result.generated_summary == "Auto commit 2026-08-02 13:00:00Z"
    assert result.commit_oid == _git(runner, repo, "rev-parse", "HEAD")
    assert result.commit_oid == _git(runner, origin, "rev-parse", "refs/heads/main")
    audit = store.load_audit()
    assert len(audit) == 1
    assert audit[0].status == "done"
    assert audit[0].repository_name == "repo"


def test_draft_message_and_multicommit_state_are_preserved(tmp_path: Path) -> None:
    repo, _, runner = _repository_with_origin(tmp_path)
    store = _store(tmp_path)
    (repo / "tracked.txt").write_text("drafted\n", encoding="utf-8")
    before = _git(runner, repo, "rev-parse", "HEAD")
    service = RepositoryAutomationService(repo, runner=runner, store=store)

    draft = service.run("commit-push", draft_commit_message="My work in progress")

    assert draft.status == "skipped"
    assert "draft" in draft.detail.casefold()
    assert _git(runner, repo, "rev-parse", "HEAD") == before
    (repo / ".git" / "CHERRY_PICK_HEAD").write_text(before + "\n", encoding="utf-8")
    operation = service.run("commit-push")
    assert operation.status == "skipped"
    assert "conflict" in operation.detail.casefold()
    assert _git(runner, repo, "rev-parse", "HEAD") == before


def test_detached_head_is_skipped_without_committing(tmp_path: Path) -> None:
    repo, _, runner = _repository_with_origin(tmp_path)
    _git(runner, repo, "checkout", "--detach")
    (repo / "tracked.txt").write_text("detached\n", encoding="utf-8")

    result = RepositoryAutomationService(
        repo, runner=runner, store=_store(tmp_path)
    ).run("commit-push")

    assert result.status == "skipped"
    assert "branch" in result.detail.casefold()


def test_failed_push_reports_recoverable_partial_commit(tmp_path: Path) -> None:
    repo, _, runner = _repository_with_origin(tmp_path)
    _git(runner, repo, "remote", "set-url", "origin", str(tmp_path / "missing.git"))
    (repo / "tracked.txt").write_text("local commit survives\n", encoding="utf-8")
    before = _git(runner, repo, "rev-parse", "HEAD")

    result = RepositoryAutomationService(
        repo, runner=runner, store=_store(tmp_path)
    ).run("commit-push")

    assert result.status == "partial"
    assert result.commit_oid is not None
    assert result.commit_oid != before
    assert _git(runner, repo, "rev-parse", "HEAD") == result.commit_oid
    assert "push failed" in result.detail.casefold()


def test_real_pull_fast_forwards_clean_repository(tmp_path: Path) -> None:
    repo, origin, runner = _repository_with_origin(tmp_path)
    peer = tmp_path / "peer"
    _git(runner, tmp_path, "clone", "--branch", "main", str(origin), str(peer))
    _git(runner, peer, "config", "user.name", "Peer")
    _git(runner, peer, "config", "user.email", "peer@example.test")
    (peer / "peer.txt").write_text("from peer\n", encoding="utf-8")
    _git(runner, peer, "add", "peer.txt")
    _git(runner, peer, "commit", "-m", "Peer change")
    _git(runner, peer, "push")

    result = RepositoryAutomationService(
        repo, runner=runner, store=_store(tmp_path)
    ).run("pull")

    assert result.status == "done"
    assert (repo / "peer.txt").read_text(encoding="utf-8") == "from peer\n"


def test_dirty_pull_is_skipped_without_touching_file(tmp_path: Path) -> None:
    repo, _, runner = _repository_with_origin(tmp_path)
    (repo / "tracked.txt").write_text("local dirty\n", encoding="utf-8")

    result = RepositoryAutomationService(
        repo, runner=runner, store=_store(tmp_path)
    ).run("pull")

    assert result.status == "skipped"
    assert "not clean" in result.detail.casefold()
    assert (repo / "tracked.txt").read_text(encoding="utf-8") == "local dirty\n"


def test_scheduler_applies_overrides_intervals_and_isolates_failures(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    store = _store(tmp_path)
    store.save(
        AutomationSettingsState(
            global_settings=AutomationSettings(auto_pull_enabled=True, auto_pull_interval=15),
            repositories={
                "first-key": AutomationOverrides(auto_commit_push_enabled=True),
                "second-key": AutomationOverrides(auto_pull_enabled=False),
            },
        )
    )
    calls: list[tuple[Path, str, str]] = []

    class FakeService:
        def __init__(self, repository: Path) -> None:
            self.repository = repository

        def run(self, action: str, *, draft_commit_message: str = "") -> AutomationRunResult:
            calls.append((self.repository, action, draft_commit_message))
            if self.repository == first and action == "pull":
                raise RuntimeError("token=do-not-leak")
            return AutomationRunResult(action, "done", "ok")  # type: ignore[arg-type]

    scheduler = AutomationScheduler(store, service_factory=FakeService)
    instant = datetime(2026, 8, 2, 10, 0, tzinfo=timezone.utc)
    targets = (
        AutomationTarget(first, repository_key="first-key", draft_commit_message="draft"),
        AutomationTarget(second, repository_key="second-key"),
    )

    first_tick = scheduler.tick(targets, now=instant)
    early_tick = scheduler.tick(targets, now=instant + timedelta(minutes=4))
    due_tick = scheduler.tick(targets, now=instant + timedelta(minutes=15))

    assert len(first_tick) == 2
    assert first_tick[0][1].status == "done"
    assert first_tick[1][1].status == "failed"
    assert "do-not-leak" not in first_tick[1][1].detail
    assert early_tick == ()
    assert len(due_tick) == 1
    assert due_tick[0][1].action == "pull"
    assert all(call[0] == first for call in calls)


def test_audit_history_is_bounded_and_malformed_rows_are_ignored(tmp_path: Path) -> None:
    store = _store(tmp_path)
    store.audit_file.parent.mkdir(parents=True)
    store.audit_file.write_text(
        '[{"timestamp":"now","repository_id":"id","repository_name":"repo",'
        '"action":"pull","status":"done","detail":"ok"}, null, {"bad":true}]',
        encoding="utf-8",
    )

    events = store.load_audit()

    assert len(events) == 1
    assert events[0].action == "pull"
