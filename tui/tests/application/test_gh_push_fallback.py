from pathlib import Path

import pytest

from desktop_material_tui.application.gh_push_fallback import (
    GH_CREDENTIAL_CONFIG_ARGS,
    GitHubPushFallbackContext,
    GitHubPushFallbackPolicy,
    SubprocessGhCredentialProbe,
    is_auth_or_permission_failure,
    parse_https_github_remote,
)
from desktop_material_tui.application.repository_service import RepositoryService
from desktop_material_tui.domain.errors import GitCommandError
from desktop_material_tui.domain.models import GitCommandResult
from desktop_material_tui.infrastructure.github.transport import GhProcessResult


class Probe:
    def __init__(self, available: bool = True) -> None:
        self.available = available
        self.hosts: list[str] = []

    def is_available_for(self, hostname: str) -> bool:
        self.hosts.append(hostname)
        return self.available


class FailingProbe:
    def is_available_for(self, hostname: str) -> bool:
        del hostname
        raise RuntimeError("probe failed")


class Transport:
    def __init__(self, return_codes: list[int]) -> None:
        self.return_codes = return_codes
        self.calls: list[tuple[str, ...]] = []

    def run(self, argv, *, timeout_seconds, stdin_text=None):  # type: ignore[no-untyped-def]
        del timeout_seconds, stdin_text
        call = tuple(argv)
        self.calls.append(call)
        return GhProcessResult(call, self.return_codes.pop(0), "", "")

    def run_binary(self, argv, *, timeout_seconds, maximum_bytes):  # type: ignore[no-untyped-def]
        raise AssertionError("binary transport must not be used")


class PushRunner:
    def __init__(self, results: list[GitCommandResult | Exception]) -> None:
        self.results = results
        self.calls: list[tuple[str, ...]] = []

    def run(
        self,
        args,
        *,
        cwd,
        timeout=None,
        input_data=None,
        allowed_exit_codes=(0,),
    ):  # type: ignore[no-untyped-def]
        del timeout, input_data, allowed_exit_codes
        self.calls.append(tuple(args))
        outcome = self.results.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def git_error(tmp_path: Path, message: str) -> GitCommandError:
    return GitCommandError(
        GitCommandResult(
            argv=("git", "push"),
            cwd=tmp_path,
            exit_code=128,
            stdout="",
            stderr=message,
            duration_seconds=0.01,
        )
    )


def result(tmp_path: Path) -> GitCommandResult:
    return GitCommandResult(("git", "push"), tmp_path, 0, "", "", 0.01)


def context(**overrides: object) -> GitHubPushFallbackContext:
    values: dict[str, object] = {
        "remote_url": "https://github.com/acme/widgets.git",
        "authenticated_login": "developer",
        "is_known_github_repository": True,
        "is_organization_owned": True,
    }
    values.update(overrides)
    return GitHubPushFallbackContext(**values)  # type: ignore[arg-type]


def test_probe_uses_exact_no_shell_argv_and_never_requests_a_token() -> None:
    transport = Transport([0, 0])
    probe = SubprocessGhCredentialProbe(transport)

    assert probe.is_available_for("github.com")
    assert transport.calls == [
        ("gh", "--version"),
        ("gh", "auth", "status", "--hostname", "github.com"),
    ]
    assert all("--show-token" not in call for call in transport.calls)


@pytest.mark.parametrize(
    "value",
    [
        "http://github.com/acme/widgets.git",
        "ssh://git@github.com/acme/widgets.git",
        "https://user:token@github.com/acme/widgets.git",
        "https://github.com:443/acme/widgets.git",
        "https://github.com/acme/widgets/extra",
    ],
)
def test_remote_parser_rejects_non_https_or_credential_bearing_urls(value: str) -> None:
    assert parse_https_github_remote(value) is None


@pytest.mark.parametrize(
    "message",
    [
        "fatal: Authentication failed for 'https://github.com/acme/widgets.git/'",
        "remote: Permission to acme/widgets.git denied to developer.",
        "remote: Write access to repository not granted. HTTP 403",
    ],
)
def test_auth_classifier_accepts_only_credential_and_permission_failures(
    tmp_path: Path,
    message: str,
) -> None:
    assert is_auth_or_permission_failure(git_error(tmp_path, message))


@pytest.mark.parametrize(
    "message",
    [
        "fatal: unable to access: Could not resolve host",
        "! [rejected] main -> main (non-fast-forward)",
        "error: failed to push some refs",
    ],
)
def test_auth_classifier_rejects_unrelated_push_failures(tmp_path: Path, message: str) -> None:
    assert not is_auth_or_permission_failure(git_error(tmp_path, message))


def test_policy_requires_every_predicate_before_probing(tmp_path: Path) -> None:
    error = git_error(tmp_path, "fatal: Authentication failed")
    cases = [
        context(is_known_github_repository=False),
        context(remote_url="git@github.com:acme/widgets.git"),
        context(is_organization_owned=False, authenticated_login="acme"),
    ]

    for candidate in cases:
        probe = Probe()
        assert not GitHubPushFallbackPolicy(probe).should_retry(error, candidate)
        assert probe.hosts == []


def test_probe_uncertainty_returns_original_failure_instead_of_raising(tmp_path: Path) -> None:
    error = git_error(tmp_path, "fatal: Authentication failed")

    assert not GitHubPushFallbackPolicy(FailingProbe()).should_retry(error, context())


def test_repository_push_retries_once_with_exact_helper_and_returns_success(tmp_path: Path) -> None:
    first = git_error(tmp_path, "fatal: Authentication failed")
    runner = PushRunner([first, result(tmp_path)])
    probe = Probe()
    service = RepositoryService(
        tmp_path,
        runner,
        github_push_fallback=GitHubPushFallbackPolicy(probe),
    )
    service._root = tmp_path.resolve()

    service.push("origin", "main", github_fallback_context=context())

    assert runner.calls == [
        ("push", "origin", "main"),
        (*GH_CREDENTIAL_CONFIG_ARGS, "push", "origin", "main"),
    ]
    assert probe.hosts == ["github.com"]


def test_repository_push_preserves_original_error_when_retry_fails(tmp_path: Path) -> None:
    original = git_error(tmp_path, "fatal: Authentication failed")
    retry = RuntimeError("gh helper process failed")
    runner = PushRunner([original, retry])
    service = RepositoryService(
        tmp_path,
        runner,
        github_push_fallback=GitHubPushFallbackPolicy(Probe()),
    )
    service._root = tmp_path.resolve()

    with pytest.raises(GitCommandError) as caught:
        service.push("origin", "main", github_fallback_context=context())

    assert caught.value is original
    assert caught.value.__cause__ is retry
    assert len(runner.calls) == 2


def test_happy_path_is_unchanged_and_probe_is_lazy(tmp_path: Path) -> None:
    runner = PushRunner([result(tmp_path)])
    probe = Probe()
    service = RepositoryService(
        tmp_path,
        runner,
        github_push_fallback=GitHubPushFallbackPolicy(probe),
    )
    service._root = tmp_path.resolve()

    service.push("origin", "main", github_fallback_context=context())

    assert runner.calls == [("push", "origin", "main")]
    assert probe.hosts == []
