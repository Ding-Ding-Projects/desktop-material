from __future__ import annotations

import json
import subprocess
from collections.abc import Sequence
from typing import Any

import pytest

from desktop_material_tui.infrastructure.github import (
    GhClient,
    GhProcessResult,
    GitHubAuthStatus,
    GitHubCliNotFoundError,
    GitHubResponseError,
    GitHubResponseTooLargeError,
    GitHubScopeError,
    GitHubTimeoutError,
    GitHubUnsafeOperationError,
    GitHubValidationError,
    IssueState,
    MergeMethod,
    RepositoryRef,
    ReviewDecision,
    SubprocessGhTransport,
)


class FakeGhTransport:
    def __init__(self, *responses: GhProcessResult | BaseException) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[tuple[str, ...], float, str | None]] = []

    def run(
        self,
        argv: Sequence[str],
        *,
        timeout_seconds: float,
        stdin_text: str | None = None,
    ) -> GhProcessResult:
        self.calls.append((tuple(argv), timeout_seconds, stdin_text))
        if not self.responses:
            raise AssertionError(f"Unexpected gh invocation: {tuple(argv)!r}")
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return GhProcessResult(
            argv=tuple(argv),
            return_code=response.return_code,
            stdout=response.stdout,
            stderr=response.stderr,
        )


def result(
    payload: Any = None,
    *,
    stdout: str | None = None,
    stderr: str = "",
    return_code: int = 0,
) -> GhProcessResult:
    rendered = json.dumps(payload) if stdout is None else stdout
    return GhProcessResult(
        argv=("fake-gh",),
        return_code=return_code,
        stdout=rendered,
        stderr=stderr,
    )


@pytest.fixture
def repository() -> RepositoryRef:
    return RepositoryRef("acme", "widgets")


def issue_json(number: int = 7, *, state: str = "OPEN") -> dict[str, Any]:
    return {
        "number": number,
        "title": "Clickable text boxes",
        "body": "Keep the mouse support.",
        "state": state,
        "url": f"https://github.com/acme/widgets/issues/{number}",
        "author": {"login": "octocat"},
        "labels": [{"name": "enhancement"}],
        "assignees": [{"login": "maintainer"}],
        "createdAt": "2026-07-27T10:00:00Z",
        "updatedAt": "2026-07-27T11:00:00Z",
        "comments": [
            {
                "id": "IC_1",
                "body": "Working on it",
                "author": {"login": "maintainer"},
                "createdAt": "2026-07-27T10:30:00Z",
                "url": "https://github.com/acme/widgets/issues/7#issuecomment-1",
            }
        ],
    }


def pull_request_json(number: int = 9) -> dict[str, Any]:
    return {
        "number": number,
        "title": "Add keyboard and mouse support",
        "body": "Interactive everywhere.",
        "state": "OPEN",
        "url": f"https://github.com/acme/widgets/pull/{number}",
        "author": {"login": "contributor"},
        "headRefName": "feature/input",
        "headRefOid": "a" * 40,
        "baseRefName": "main",
        "isDraft": False,
        "mergeStateStatus": "CLEAN",
        "reviewDecision": "REVIEW_REQUIRED",
        "createdAt": "2026-07-27T10:00:00Z",
        "updatedAt": "2026-07-27T11:00:00Z",
    }


def test_missing_executable_and_timeout_are_structured(repository: RepositoryRef) -> None:
    missing = GhClient(
        transport=FakeGhTransport(FileNotFoundError()),
        command_prefix=("missing-gh",),
    )
    with pytest.raises(GitHubCliNotFoundError) as missing_error:
        missing.list_issues(repository)
    assert missing_error.value.code == "gh_not_found"

    timeout = GhClient(
        transport=FakeGhTransport(subprocess.TimeoutExpired(cmd=("gh",), timeout=0.01)),
        command_prefix=("gh",),
        default_timeout_seconds=0.01,
    )
    with pytest.raises(GitHubTimeoutError) as timeout_error:
        timeout.list_issues(repository)
    assert timeout_error.value.retryable
    assert timeout_error.value.operation == "list issues"


def test_real_transport_never_inherits_tui_stdin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_run(argv: Sequence[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        captured.update(kwargs)
        return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    transport = SubprocessGhTransport()

    transport.run(("gh", "issue", "list"), timeout_seconds=1)

    assert captured["shell"] is False
    assert captured["stdin"] is subprocess.DEVNULL
    assert "input" not in captured


def test_command_prefix_is_runtime_validated() -> None:
    with pytest.raises(GitHubValidationError):
        GhClient(command_prefix="gh")
    with pytest.raises(GitHubValidationError):
        GhClient(command_prefix=("gh\x00spoof",))


def test_auth_status_and_required_scopes_are_safe() -> None:
    transport = FakeGhTransport(
        result(
            stdout=(
                "github.com\n"
                "  ✓ Logged in to github.com account octocat (keyring)\n"
                "  - Token: ghp_************************************\n"
                "  - Token scopes: 'read:org', 'repo', 'workflow'\n"
            )
        ),
        result(
            stdout=(
                "github.com\n"
                "  ✓ Logged in to github.com account octocat (keyring)\n"
                "  - Token scopes: 'repo'\n"
            )
        ),
    )
    client = GhClient(transport=transport)

    status = client.auth_status()
    assert status == GitHubAuthStatus(
        host="github.com",
        authenticated=True,
        login="octocat",
        scopes=("read:org", "repo", "workflow"),
    )
    with pytest.raises(GitHubScopeError) as caught:
        client.require_auth(scopes=("read:project",))
    assert caught.value.required_scopes == ("read:project",)
    assert "ghp_" not in str(caught.value)


def test_cli_scope_error_never_exposes_a_token(repository: RepositoryRef) -> None:
    transport = FakeGhTransport(
        result(
            stdout="",
            stderr=(
                "error: your authentication token ghp_abcdefghijklmnopqrstuvwxyz1234 "
                "is missing required scopes [read:project]"
            ),
            return_code=1,
        )
    )
    client = GhClient(transport=transport)

    with pytest.raises(GitHubScopeError) as caught:
        client.list_projects(repository)

    assert caught.value.required_scopes == ("read:project",)
    assert "abcdefghijklmnopqrstuvwxyz" not in str(caught.value)
    assert "abcdefghijklmnopqrstuvwxyz" not in json.dumps(caught.value.as_dict())


def test_issue_read_list_create_update_comment_and_close(
    repository: RepositoryRef,
) -> None:
    transport = FakeGhTransport(
        result([issue_json()]),
        result(issue_json()),
        result(issue_json(8)),
        result(
            {
                "id": 100,
                "body": "Shipped safely",
                "user": {"login": "maintainer"},
                "created_at": "2026-07-27T12:00:00Z",
                "html_url": "https://github.com/acme/widgets/issues/8#issuecomment-100",
            }
        ),
        result(issue_json(8)),
        result(issue_json(8, state="CLOSED")),
    )
    client = GhClient(transport=transport)

    issues = client.list_issues(repository, limit=25)
    assert issues[0].labels == ("enhancement",)
    assert issues[0].assignees[0].login == "maintainer"
    assert client.get_issue(repository, 7).comments[0].body == "Working on it"

    created = client.create_issue(
        repository,
        title="Clickable; still literal",
        body="A body with $(not-a-command)",
        labels=("enhancement",),
    )
    assert created.number == 8
    create_argv, _, create_stdin = transport.calls[2]
    assert create_argv[:3] == ("gh", "api", "repos/acme/widgets/issues")
    assert "Clickable; still literal" not in create_argv
    assert create_stdin is not None
    assert json.loads(create_stdin)["body"] == "A body with $(not-a-command)"

    comment = client.comment_issue(repository, 8, "Shipped safely")
    assert comment.id == "100"
    assert (
        client.update_issue(
            repository,
            8,
            state=IssueState.OPEN,
            labels=(),
        ).number
        == 8
    )
    assert client.close_issue(repository, 8, reason="completed").state is IssueState.CLOSED
    close_stdin = transport.calls[-1][2]
    assert close_stdin is not None
    assert json.loads(close_stdin) == {"state": "closed", "state_reason": "completed"}


def test_issue_input_bounds_are_enforced_without_invoking_gh(
    repository: RepositoryRef,
) -> None:
    transport = FakeGhTransport()
    client = GhClient(transport=transport, maximum_request_bytes=1024)

    with pytest.raises(GitHubValidationError):
        client.create_issue(repository, title="", body="")
    with pytest.raises(GitHubValidationError):
        client.comment_issue(repository, 1, "   ")
    with pytest.raises(GitHubValidationError):
        client.update_issue(repository, 1)
    with pytest.raises(GitHubValidationError):
        client.create_issue(repository, title="valid", body="x" * 1025)

    assert transport.calls == []


def test_pull_request_operations_use_typed_json_and_stdin(
    repository: RepositoryRef,
) -> None:
    review = {
        "id": 55,
        "state": "APPROVED",
        "body": "Looks good",
        "user": {"login": "reviewer"},
        "submitted_at": "2026-07-27T12:00:00Z",
        "html_url": "https://github.com/acme/widgets/pull/9#pullrequestreview-55",
    }
    transport = FakeGhTransport(
        result([pull_request_json()]),
        result({**pull_request_json(), "reviews": [review], "comments": []}),
        result(pull_request_json(10)),
        result(review),
        result({"merged": True, "message": "Pull Request successfully merged", "sha": "b" * 40}),
        result(
            {
                "id": 200,
                "body": "Thanks",
                "user": {"login": "maintainer"},
                "created_at": "2026-07-27T12:01:00Z",
            }
        ),
    )
    client = GhClient(transport=transport)

    assert client.list_pull_requests(repository)[0].head_ref == "feature/input"
    assert client.get_pull_request(repository, 9).reviews[0].state == "APPROVED"
    assert (
        client.create_pull_request(
            repository,
            title="Safe PR",
            head="feature/input",
            base="main",
            draft=True,
        ).number
        == 10
    )
    assert (
        client.review_pull_request(
            repository,
            9,
            event=ReviewDecision.APPROVE,
            body="Looks good",
        ).author.login
        == "reviewer"
    )
    merged = client.merge_pull_request(
        repository,
        9,
        method=MergeMethod.SQUASH,
        expected_head_sha="a" * 40,
    )
    assert merged.merged
    assert merged.sha == "b" * 40
    assert client.comment_pull_request(repository, 9, "Thanks").body == "Thanks"

    create_stdin = transport.calls[2][2]
    review_stdin = transport.calls[3][2]
    merge_stdin = transport.calls[4][2]
    assert create_stdin is not None
    assert json.loads(create_stdin)["draft"] is True
    assert review_stdin is not None
    assert json.loads(review_stdin)["event"] == "APPROVE"
    assert merge_stdin is not None
    assert json.loads(merge_stdin)["merge_method"] == "squash"


def test_actions_read_and_control_operations(repository: RepositoryRef) -> None:
    workflow = {
        "id": 10,
        "name": "CI",
        "state": "active",
        "path": ".github/workflows/ci.yml",
        "html_url": "https://github.com/acme/widgets/actions/workflows/ci.yml",
    }
    run = {
        "id": 20,
        "name": "CI",
        "display_title": "Test TUI",
        "event": "push",
        "status": "completed",
        "conclusion": "success",
        "head_branch": "main",
        "head_sha": "c" * 40,
        "run_attempt": 1,
        "html_url": "https://github.com/acme/widgets/actions/runs/20",
    }
    job = {
        "id": 30,
        "name": "Linux",
        "status": "completed",
        "conclusion": "success",
        "steps": [
            {
                "number": 1,
                "name": "Tests",
                "status": "completed",
                "conclusion": "success",
            }
        ],
    }
    included_headers = (
        "HTTP/2 302 Found\r\n"
        "Content-Type: application/zip\r\n"
        "Content-Length: 321\r\n"
        "Location: https://signed.example.test/archive?token=secret\r\n"
        "ETag: safe-etag\r\n\r\n"
    )
    transport = FakeGhTransport(
        result({"workflows": [workflow]}),
        result({"workflow_runs": [run]}),
        result(run),
        result({"jobs": [job]}),
        result(stdout=included_headers),
        result(stdout=""),
        result(stdout=""),
        result(stdout=""),
    )
    client = GhClient(transport=transport)

    assert client.list_workflows(repository)[0].name == "CI"
    assert client.list_workflow_runs(repository, workflow_id=10)[0].id == 20
    assert client.get_workflow_run(repository, 20).conclusion == "success"
    assert client.list_workflow_jobs(repository, 20)[0].steps[0].name == "Tests"
    metadata = client.get_run_log_metadata(repository, 20)
    assert metadata.available
    assert metadata.content_length == 321
    assert "signed.example.test" not in repr(metadata)

    assert client.dispatch_workflow(
        repository,
        10,
        ref="main",
        inputs={"mode": "full"},
    ).accepted
    assert client.rerun_workflow(repository, 20, failed_only=True).operation == (
        "rerun-failed-jobs"
    )
    assert client.cancel_workflow(repository, 20).operation == "cancel"
    dispatch_stdin = transport.calls[5][2]
    assert dispatch_stdin is not None
    assert json.loads(dispatch_stdin) == {"ref": "main", "inputs": {"mode": "full"}}


def test_release_package_and_project_metadata_are_read_only(
    repository: RepositoryRef,
) -> None:
    asset = {
        "id": 2,
        "name": "installer.tar.gz",
        "state": "uploaded",
        "size": 123,
        "download_count": 4,
        "content_type": "application/gzip",
        "digest": "sha256:abc",
        "browser_download_url": "https://example.test/installer.tar.gz",
    }
    release = {
        "id": 1,
        "tag_name": "v1.0.0",
        "name": "1.0.0",
        "draft": False,
        "prerelease": False,
        "target_commitish": "main",
        "assets": [asset],
    }
    package = {
        "id": 3,
        "name": "desktop-material",
        "package_type": "container",
        "visibility": "public",
        "version_count": 2,
        "owner": {"login": "acme"},
    }
    version = {"id": 4, "name": "sha256:abc", "metadata": {"container": {"tags": ["latest"]}}}
    project = {
        "number": 5,
        "title": "TUI",
        "shortDescription": "Linux clone",
        "closed": False,
        "url": "https://github.com/orgs/acme/projects/5",
    }
    transport = FakeGhTransport(
        result([release]),
        result(release),
        result([asset]),
        result([package]),
        result(package),
        result([version]),
        result({"projects": [project]}),
        result(project),
    )
    client = GhClient(transport=transport)

    assert client.list_releases(repository)[0].assets[0].digest == "sha256:abc"
    assert client.get_release(repository, "v1.0.0").tag_name == "v1.0.0"
    assert client.list_release_assets(repository, 1)[0].download_count == 4
    assert client.list_packages(repository)[0].owner.login == "acme"
    assert client.get_package(repository, "desktop-material").package_type == "container"
    assert client.list_package_versions(repository, "desktop-material")[0].id == 4
    assert client.list_projects(repository)[0].number == 5
    assert client.get_project(repository, 5).title == "TUI"

    package_argv = transport.calls[3][0]
    project_argv = transport.calls[6][0]
    assert "--method" in package_argv
    assert "GET" in package_argv
    assert project_argv[:3] == ("gh", "project", "list")


def test_rest_and_graphql_explorers_are_bounded_and_confirm_mutations(
    repository: RepositoryRef,
) -> None:
    transport = FakeGhTransport(
        result(
            stdout=(
                "HTTP/2 200 OK\r\n"
                "Content-Type: application/json\r\n"
                "X-RateLimit-Remaining: 42\r\n\r\n"
                '{"ok":true}'
            )
        ),
        result(
            stdout=(
                "HTTP/2 200 OK\r\n"
                "Content-Type: application/json\r\n\r\n"
                '{"data":{"viewer":{"login":"octocat"}}}'
            )
        ),
    )
    client = GhClient(transport=transport)

    response = client.explore_rest(
        repository,
        method="GET",
        path="repos/acme/widgets",
    )
    assert response.status == 200
    assert response.data == {"ok": True}
    assert dict(response.headers)["x-ratelimit-remaining"] == "42"

    graphql = client.explore_graphql(
        repository,
        query="query Viewer { viewer { login } }",
    )
    assert graphql.data["data"]["viewer"]["login"] == "octocat"
    graphql_stdin = transport.calls[1][2]
    assert graphql_stdin is not None
    assert json.loads(graphql_stdin)["query"].startswith("query Viewer")

    with pytest.raises(GitHubUnsafeOperationError):
        client.explore_rest(
            repository,
            method="POST",
            path="repos/acme/widgets/issues",
            body={"title": "No confirmation"},
        )
    with pytest.raises(GitHubUnsafeOperationError):
        client.explore_rest(
            repository,
            method="GET",
            path="https://evil.example.test/",
        )
    with pytest.raises(GitHubUnsafeOperationError):
        client.explore_rest(
            repository,
            method="POST",
            path="repos/acme/widgets/issues",
            body={"access_token": "never"},
            confirm_mutation=True,
        )
    with pytest.raises(GitHubUnsafeOperationError):
        client.explore_rest(
            repository,
            method="POST",
            path="repos/acme/widgets/issues",
            body={"note": "ghp_abcdefghijklmnopqrstuvwxyz1234"},
            confirm_mutation=True,
        )
    with pytest.raises(GitHubUnsafeOperationError):
        client.explore_graphql(
            repository,
            query="mutation Close { closeIssue(input: {}) { clientMutationId } }",
        )
    with pytest.raises(GitHubUnsafeOperationError):
        client.explore_graphql(
            repository,
            query=("query Viewer { viewer { login } } # Bearer ghp_abcdefghijklmnopqrstuvwxyz1234"),
        )

    assert len(transport.calls) == 2


def test_malformed_and_oversized_json_are_structured(repository: RepositoryRef) -> None:
    malformed = GhClient(transport=FakeGhTransport(result(stdout="{bad json")))
    with pytest.raises(GitHubResponseError):
        malformed.list_issues(repository)

    oversized = GhClient(
        transport=FakeGhTransport(result(stdout=json.dumps("x" * 1024))),
        maximum_response_bytes=1024,
    )
    with pytest.raises(GitHubResponseTooLargeError):
        oversized.list_issues(repository)

    oversized_diagnostics = GhClient(
        transport=FakeGhTransport(result([], stderr="x" * 1024)),
        maximum_response_bytes=1024,
    )
    with pytest.raises(GitHubResponseTooLargeError):
        oversized_diagnostics.list_issues(repository)
