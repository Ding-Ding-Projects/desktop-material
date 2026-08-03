"""Local coding-agent repair safety, consent, and verification contracts."""

from __future__ import annotations

import sys
import threading
from collections.abc import Callable, Mapping
from pathlib import Path

import pytest

from desktop_material_tui.application.local_ai_repair import (
    AgentCommandPlan,
    AgentConsent,
    AgentPreferences,
    AgentProcessResult,
    AgentStream,
    BuildFailure,
    LocalAIRepairError,
    LocalAIRepairService,
    ShellFreeAgentExecutor,
    redact_sensitive_text,
)


class FakeExecutor:
    def __init__(self, results: list[AgentProcessResult] | None = None) -> None:
        self.results = results or [_result()]
        self.plans: list[AgentCommandPlan] = []

    def run(
        self,
        plan: AgentCommandPlan,
        *,
        timeout_seconds: float,
        cancel_event: threading.Event,
        on_event: Callable[[AgentStream, str], None] | None = None,
        environment: Mapping[str, str] | None = None,
    ) -> AgentProcessResult:
        del timeout_seconds, cancel_event, environment
        self.plans.append(plan)
        result = self.results.pop(0) if len(self.results) > 1 else self.results[0]
        if on_event is not None:
            on_event("meta", "fake event")
        return result


def _result(
    exit_code: int = 0,
    *,
    output: str = "agent output",
    launched: bool = True,
    cancelled: bool = False,
    timed_out: bool = False,
) -> AgentProcessResult:
    return AgentProcessResult(
        exit_code=exit_code,
        output=output,
        events=(),
        launched=launched,
        cancelled=cancelled,
        timed_out=timed_out,
    )


def _service(tmp_path: Path, executor: FakeExecutor | None = None) -> LocalAIRepairService:
    return LocalAIRepairService(
        tmp_path,
        preferences_file=tmp_path / "state" / "agent.json",
        executor=executor,
    )


def test_preferences_are_repository_scoped_atomic_and_non_secret(tmp_path: Path) -> None:
    service = _service(tmp_path)
    preferences = AgentPreferences(str(tmp_path.resolve()), "opencode", "provider/model")

    service.save_preferences(preferences)

    assert service.load_preferences() == preferences
    text = (tmp_path / "state" / "agent.json").read_text(encoding="utf-8")
    assert '"schema": 1' in text
    assert "token" not in text.casefold()
    with pytest.raises(LocalAIRepairError, match="another repository"):
        service.save_preferences(AgentPreferences(str(tmp_path.parent), "codex"))


@pytest.mark.parametrize("provider", ["unknown", "", None])
def test_preferences_reject_unknown_providers(tmp_path: Path, provider: object) -> None:
    service = _service(tmp_path)
    with pytest.raises(LocalAIRepairError, match="Unsupported"):
        service.save_preferences(
            AgentPreferences(str(tmp_path.resolve()), provider)  # type: ignore[arg-type]
        )


@pytest.mark.parametrize("model", ["-danger", "bad\nmodel", "x" * 161])
def test_preferences_reject_unsafe_model_values(tmp_path: Path, model: str) -> None:
    with pytest.raises(LocalAIRepairError, match="model selection"):
        _service(tmp_path).save_preferences(
            AgentPreferences(str(tmp_path.resolve()), "codex", model)
        )


def test_codex_repair_plan_is_stdin_only_and_sandboxed(tmp_path: Path) -> None:
    service = _service(tmp_path)
    preferences = AgentPreferences(str(tmp_path.resolve()), "codex", "gpt-test")
    failure = BuildFailure("build", 7, "compiler exploded")

    plan = service.repair_plan(failure, preferences=preferences)

    assert plan.cwd == tmp_path.resolve()
    assert plan.stdin is not None
    assert "compiler exploded" in plan.stdin
    assert "compiler exploded" not in plan.argv
    assert plan.argv == (
        "codex",
        "--ask-for-approval",
        "on-request",
        "exec",
        "--sandbox",
        "workspace-write",
        "--disable",
        "hooks",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--color",
        "never",
        "--model",
        "gpt-test",
        "-",
    )


def test_auto_approval_is_per_run_and_changes_only_reviewed_flags(tmp_path: Path) -> None:
    service = _service(tmp_path)
    preferences = AgentPreferences(str(tmp_path.resolve()), "codex")

    manual = service.repair_plan(BuildFailure("build", 1, "x"), preferences=preferences)
    automatic = service.repair_plan(
        BuildFailure("build", 1, "x"),
        preferences=preferences,
        consent=AgentConsent(auto_approve=True),
    )

    assert manual.argv[2] == "on-request"
    assert automatic.argv[2] == "never"
    assert "danger-full-access" not in automatic.argv


def test_opencode_plan_is_explicit_and_repository_scoped(tmp_path: Path) -> None:
    nested = tmp_path / "apps" / "api"
    nested.mkdir(parents=True)
    preferences = AgentPreferences(str(tmp_path.resolve()), "opencode", "vendor/model")

    plan = _service(tmp_path).repair_plan(
        BuildFailure("install", 2, "failed", "apps/api"),
        preferences=preferences,
        consent=AgentConsent(auto_approve=True),
    )

    assert plan.argv == (
        "opencode",
        "run",
        "--auto",
        "--dir",
        str(nested.resolve()),
        "--model",
        "vendor/model",
    )
    assert plan.stdin is not None
    assert str(nested.resolve()) not in plan.argv[1:4]


def test_working_directory_cannot_escape_or_follow_outside_symlink(tmp_path: Path) -> None:
    service = _service(tmp_path)
    with pytest.raises(LocalAIRepairError, match="escaped"):
        service.repair_plan(BuildFailure("build", 1, "x", "../outside"))

    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir(exist_ok=True)
    link = tmp_path / "outside-link"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("This host does not permit test symlinks")
    with pytest.raises(LocalAIRepairError, match="escaped"):
        service.repair_plan(BuildFailure("build", 1, "x", "outside-link"))


def test_failure_context_is_bounded_redacted_and_forbids_lossy_git_actions(
    tmp_path: Path,
) -> None:
    tail = "old\n" + "x" * 5_000 + "\nTOKEN=github_pat_abcdefghijklmnopqrstuvwxyz123456"
    plan = _service(tmp_path).repair_plan(BuildFailure("run", 55, tail))

    assert plan.stdin is not None
    assert len(plan.stdin) < 6_000
    assert "github_pat_" not in plan.stdin
    assert "[REDACTED]" in plan.stdin
    for rule in ("Never force-push", "rewrite or drop commits", "switch branches"):
        assert rule in plan.stdin


def test_redactor_covers_assignments_bearers_known_tokens_and_url_userinfo() -> None:
    raw = (
        "password=hunter2 Authorization: Bearer abcdefghijklmnop "
        "ghp_abcdefghijklmnopqrstuvwxyz https://alice:secret@example.test/repo"
    )

    redacted = redact_sensitive_text(raw)

    assert "hunter2" not in redacted
    assert "abcdefghijklmnop" not in redacted
    assert "ghp_" not in redacted
    assert "alice:secret" not in redacted
    assert redacted.count("[REDACTED]") >= 4


def test_agent_exit_zero_never_bypasses_failed_verification(tmp_path: Path) -> None:
    executor = FakeExecutor([_result(0)])
    calls = 0

    def verify() -> bool:
        nonlocal calls
        calls += 1
        return False

    outcome = _service(tmp_path, executor).repair_failed_build(
        BuildFailure("build", 1, "failure"), verify=verify
    )

    assert calls == 1
    assert outcome.process.exit_code == 0
    assert outcome.verification_ran
    assert not outcome.repaired


def test_nonzero_agent_exit_still_gets_independent_verification(tmp_path: Path) -> None:
    executor = FakeExecutor([_result(9)])

    outcome = _service(tmp_path, executor).repair_failed_build(
        BuildFailure("build", 1, "failure"), verify=lambda: True
    )

    assert outcome.process.exit_code == 9
    assert outcome.repaired


def test_verification_accepts_build_result_shape_and_redacts_errors(tmp_path: Path) -> None:
    class Verdict:
        ok = True

    passed = _service(tmp_path, FakeExecutor()).repair_failed_build(
        BuildFailure("build", 1, "failure"), verify=Verdict
    )
    assert passed.repaired

    def broken() -> object:
        raise RuntimeError("token=top-secret-value")

    failed = _service(tmp_path, FakeExecutor()).repair_failed_build(
        BuildFailure("build", 1, "failure"), verify=broken
    )
    assert not failed.repaired
    assert failed.verification_error == "token=[REDACTED]"


@pytest.mark.parametrize(
    "process",
    [
        _result(-1, launched=False),
        _result(130, cancelled=True),
        _result(124, timed_out=True),
    ],
)
def test_unlaunched_cancelled_or_timed_out_agent_does_not_claim_verification(
    tmp_path: Path, process: AgentProcessResult
) -> None:
    called = False

    def verify() -> bool:
        nonlocal called
        called = True
        return True

    outcome = _service(tmp_path, FakeExecutor([process])).repair_failed_build(
        BuildFailure("build", 1, "failure"), verify=verify
    )

    assert not called
    assert not outcome.verification_ran
    assert not outcome.repaired


def test_install_and_authentication_require_separate_explicit_consent(tmp_path: Path) -> None:
    service = _service(tmp_path, FakeExecutor())
    with pytest.raises(LocalAIRepairError, match="explicit consent"):
        service.install("codex", consent=AgentConsent())
    with pytest.raises(LocalAIRepairError, match="sign-in requires explicit consent"):
        service.authentication_plan("opencode", consent=AgentConsent())

    install = service.install_plan("codex")
    auth = service.authentication_plan(
        "opencode", consent=AgentConsent(authenticate=True)
    )
    assert install.argv == ("npm", "install", "--global", "@openai/codex")
    assert auth.argv == ("opencode", "auth", "login")
    assert auth.interactive


def test_status_uses_only_bounded_exit_status_detection(tmp_path: Path) -> None:
    executor = FakeExecutor([_result(output="codex-cli 1.2.3"), _result(output="signed in")])

    status = _service(tmp_path, executor).status("codex")

    assert status.installed
    assert status.version == "1.2.3"
    assert status.authenticated
    assert executor.plans[0].argv == ("codex", "--version")
    assert executor.plans[1].argv == ("codex", "login", "status")


def test_opencode_empty_auth_inventory_is_not_authenticated(tmp_path: Path) -> None:
    executor = FakeExecutor(
        [_result(output="opencode 2.0.0"), _result(output="No credentials configured")]
    )
    assert not _service(tmp_path, executor).status("opencode").authenticated


def test_free_form_prompt_is_stdin_only_bounded_and_guarded(tmp_path: Path) -> None:
    plan = _service(tmp_path).free_form_plan("fix this\n" + "x" * 10_000)

    assert plan.stdin is not None
    assert len(plan.stdin) < 8_500
    assert "fix this" in plan.stdin
    assert "fix this" not in plan.argv
    assert "Do not commit or push" in plan.stdin
    with pytest.raises(LocalAIRepairError, match="blank"):
        _service(tmp_path).free_form_plan(" \n ")


def test_real_executor_writes_stdin_redacts_output_and_never_uses_a_shell(
    tmp_path: Path,
) -> None:
    program = tmp_path / "agent_probe.py"
    program.write_text(
        "import sys\nvalue=sys.stdin.read()\nprint(value)\nprint('token=visible-secret')\n",
        encoding="utf-8",
    )
    plan = AgentCommandPlan(
        "codex",
        "prompt",
        (sys.executable, str(program)),
        tmp_path,
        stdin="hello over stdin",
    )
    events: list[tuple[AgentStream, str]] = []

    result = ShellFreeAgentExecutor().run(
        plan,
        timeout_seconds=10,
        cancel_event=threading.Event(),
        on_event=lambda stream, text: events.append((stream, text)),
    )

    assert result.exit_code == 0
    assert "hello over stdin" in result.output
    assert "visible-secret" not in result.output
    assert "token=[REDACTED]" in result.output
    assert events[0][0] == "command"
    with pytest.raises(LocalAIRepairError, match="Shell command modes"):
        ShellFreeAgentExecutor().run(
            AgentCommandPlan("codex", "prompt", ("sh", "-c", "echo unsafe"), tmp_path),
            timeout_seconds=10,
            cancel_event=threading.Event(),
        )


def test_real_executor_bounds_output_and_reports_missing_binary(tmp_path: Path) -> None:
    program = tmp_path / "noisy.py"
    program.write_text("print('x' * 10000)\n", encoding="utf-8")
    executor = ShellFreeAgentExecutor(maximum_output_bytes=1_024)
    noisy = executor.run(
        AgentCommandPlan("codex", "prompt", (sys.executable, str(program)), tmp_path),
        timeout_seconds=10,
        cancel_event=threading.Event(),
    )
    missing = executor.run(
        AgentCommandPlan(
            "codex",
            "prompt",
            ("desktop-material-certainly-missing-agent-binary", "--version"),
            tmp_path,
        ),
        timeout_seconds=10,
        cancel_event=threading.Event(),
    )

    assert noisy.output_truncated
    assert len(noisy.output.encode("utf-8")) <= 1_024
    assert not missing.launched
    assert missing.exit_code == -1


def test_real_executor_cancels_process_tree(tmp_path: Path) -> None:
    program = tmp_path / "waiter.py"
    program.write_text(
        "import time\nprint('ready', flush=True)\ntime.sleep(60)\n",
        encoding="utf-8",
    )
    cancel = threading.Event()
    timer = threading.Timer(0.15, cancel.set)
    timer.start()
    try:
        result = ShellFreeAgentExecutor().run(
            AgentCommandPlan("codex", "prompt", (sys.executable, str(program)), tmp_path),
            timeout_seconds=10,
            cancel_event=cancel,
        )
    finally:
        timer.cancel()

    assert result.cancelled
    assert result.exit_code == 130
