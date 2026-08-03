from __future__ import annotations

import hashlib
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
from desktop_material_tui.infrastructure.github.transport import GhBinaryProcessResult


class FakeGhTransport:
    def __init__(
        self,
        *responses: GhProcessResult | GhBinaryProcessResult | BaseException,
    ) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[tuple[str, ...], float, str | None]] = []
        self.binary_calls: list[tuple[tuple[str, ...], float, int]] = []

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
        if isinstance(response, GhBinaryProcessResult):
            raise AssertionError("Binary fake response used by text gh invocation")
        return GhProcessResult(
            argv=tuple(argv),
            return_code=response.return_code,
            stdout=response.stdout,
            stderr=response.stderr,
        )

    def run_binary(
        self,
        argv: Sequence[str],
        *,
        timeout_seconds: float,
        maximum_bytes: int,
    ) -> GhBinaryProcessResult:
        self.binary_calls.append((tuple(argv), timeout_seconds, maximum_bytes))
        if not self.responses:
            raise AssertionError(f"Unexpected binary gh invocation: {tuple(argv)!r}")
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        if isinstance(response, GhProcessResult):
            raise AssertionError("Text fake response used by binary gh invocation")
        return GhBinaryProcessResult(
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


def binary_result(
    payload: bytes,
    *,
    stderr: str = "",
    return_code: int = 0,
) -> GhBinaryProcessResult:
    return GhBinaryProcessResult(
        argv=("fake-gh",),
        return_code=return_code,
        stdout=payload,
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


def test_real_binary_transport_caps_bytes_loaded_into_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_run(argv: Sequence[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        captured.update(kwargs)
        kwargs["stdout"].write(b"0123456789")
        return subprocess.CompletedProcess(argv, 0, stdout=None, stderr=b"")

    monkeypatch.setattr(subprocess, "run", fake_run)
    transport = SubprocessGhTransport()

    response = transport.run_binary(
        ("gh", "api", "repos/acme/widgets/actions/artifacts/1/zip"),
        timeout_seconds=1,
        maximum_bytes=4,
    )

    assert response.stdout == b"01234"
    assert captured["shell"] is False
    assert captured["stdin"] is subprocess.DEVNULL


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
    submitted_review = client.review_pull_request(
        repository,
        9,
        event=ReviewDecision.APPROVE,
        body="Looks good",
    )
    assert submitted_review.author is not None
    assert submitted_review.author.login == "reviewer"
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


def test_pull_request_review_inventory_is_paginated_bounded_and_normalized(
    repository: RepositoryRef,
) -> None:
    files = [
        {
            "sha": "a" * 40,
            "filename": f"src/file-{index}.py",
            "status": "modified",
            "additions": 2,
            "deletions": 1,
            "changes": 3,
            "patch": "x" * 120_001 if index == 101 else "@@ -1 +1 @@",
        }
        for index in range(1, 102)
    ]
    check_run = {
        "id": 301,
        "name": "Linux",
        "status": "completed",
        "conclusion": "success",
        "details_url": "https://github.com/acme/widgets/actions/runs/1",
        "output": {"title": "Tests", "summary": "All green"},
    }
    status = {
        "id": 302,
        "context": "release/gate",
        "state": "pending",
        "description": "Waiting for approval",
        "target_url": "https://github.com/acme/widgets/actions/runs/2",
    }
    transport = FakeGhTransport(
        result(files[:100]),
        result(files[100:]),
        result({"total_count": 1, "check_runs": [check_run]}),
        result([status]),
    )
    client = GhClient(transport=transport)

    listed_files = client.list_pull_request_files(repository, 9, limit=101)
    checks = client.list_pull_request_checks(repository, "a" * 40, limit=3)

    assert len(listed_files) == 101
    assert listed_files[-1].patch is not None
    assert len(listed_files[-1].patch) == 120_000
    assert listed_files[-1].patch_truncated
    assert [check.source for check in checks] == ["check-run", "commit-status"]
    assert checks[0].description == "Tests · All green"
    assert checks[1].conclusion == "pending"
    assert "page=2" in transport.calls[1][0][2]
    assert "commits%2F" not in transport.calls[2][0][2]
    assert f"commits/{'a' * 40}/check-runs" in transport.calls[2][0][2]


def test_review_comments_are_exact_head_and_line_scoped(
    repository: RepositoryRef,
) -> None:
    review_comment = {
        "id": 401,
        "pull_request_review_id": 55,
        "body": "Please keep this bounded.",
        "path": "src/app.py",
        "line": 42,
        "side": "RIGHT",
        "commit_id": "a" * 40,
        "user": {"login": "reviewer"},
        "created_at": "2026-08-02T12:00:00Z",
        "html_url": "https://github.com/acme/widgets/pull/9#discussion_r401",
    }
    transport = FakeGhTransport(result([review_comment]), result(review_comment))
    client = GhClient(transport=transport)

    listed = client.list_pull_request_review_comments(repository, 9, limit=10)
    created = client.create_pull_request_review_comment(
        repository,
        9,
        body="Please keep this bounded.",
        commit_id="a" * 40,
        path="src/app.py",
        line=42,
        side="RIGHT",
    )

    assert listed[0].author is not None
    assert listed[0].author.login == "reviewer"
    assert created.line == 42
    create_stdin = transport.calls[1][2]
    assert create_stdin is not None
    assert json.loads(create_stdin) == {
        "body": "Please keep this bounded.",
        "commit_id": "a" * 40,
        "path": "src/app.py",
        "line": 42,
        "side": "RIGHT",
    }


def test_effective_rules_and_repository_notifications_are_explicitly_scoped(
    repository: RepositoryRef,
) -> None:
    rule = {
        "type": "required_status_checks",
        "ruleset_source_type": "Repository",
        "ruleset_source": "acme/widgets",
        "ruleset_id": 77,
        "parameters": {"required_status_checks": [{"context": "Linux"}]},
    }
    notification = {
        "id": "987",
        "unread": True,
        "reason": "review_requested",
        "updated_at": "2026-08-02T12:00:00Z",
        "subject": {
            "title": "Add keyboard and mouse support",
            "type": "PullRequest",
            "url": "https://api.github.com/repos/acme/widgets/pulls/9",
        },
        "repository": {"full_name": "acme/widgets"},
    }
    transport = FakeGhTransport(result([rule]), result([notification]), result(stdout=""))
    client = GhClient(transport=transport)

    rules = client.list_effective_branch_rules(repository, "feature/input", limit=10)
    notifications = client.list_repository_notifications(repository, limit=10)
    receipt = client.mark_notification_read(repository, "987")

    assert rules[0].parameters["required_status_checks"][0]["context"] == "Linux"
    assert notifications[0].repository_full_name == "acme/widgets"
    assert notifications[0].subject_type == "PullRequest"
    assert receipt.operation == "mark-notification-read"
    assert "rules/branches/feature%2Finput" in transport.calls[0][0][2]
    assert "repos/acme/widgets/notifications" in transport.calls[1][0][2]
    assert "notifications/threads/987" in transport.calls[2][0][2]

    call_count = len(transport.calls)
    with pytest.raises(GitHubValidationError, match="exact branch"):
        client.list_effective_branch_rules(repository, "release/*")
    with pytest.raises(GitHubValidationError, match="decimal digits"):
        client.mark_notification_read(repository, "987/../../read-all")
    assert len(transport.calls) == call_count


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


def test_actions_caches_are_paginated_and_delete_is_id_scoped(
    repository: RepositoryRef,
) -> None:
    caches = [
        {
            "id": index,
            "key": f"linux-{index}",
            "ref": "refs/heads/main",
            "version": f"version-{index}",
            "size_in_bytes": index * 10,
            "created_at": "2026-08-01T10:00:00Z",
            "last_accessed_at": "2026-08-02T10:00:00Z",
        }
        for index in range(1, 102)
    ]
    transport = FakeGhTransport(
        result({"total_count": 101, "actions_caches": caches[:100]}),
        result({"total_count": 101, "actions_caches": caches[100:]}),
        result(stdout=""),
    )
    client = GhClient(transport=transport)

    listed = client.list_actions_caches(repository, limit=101)
    assert len(listed) == 101
    assert listed[0].key == "linux-1"
    assert listed[-1].id == 101
    assert "page=1" in transport.calls[0][0][2]
    assert "page=2" in transport.calls[1][0][2]
    assert client.delete_actions_cache(repository, 101).operation == "delete-cache"
    assert any("actions/caches/101" in item for item in transport.calls[2][0])


def test_artifacts_are_paginated_and_downloaded_with_digest_verification(
    repository: RepositoryRef,
    tmp_path: Any,
) -> None:
    archive = b"PK\x03\x04fake-workflow-artifact"
    digest = f"sha256:{hashlib.sha256(archive).hexdigest()}"
    artifacts = [
        {
            "id": index,
            "name": f"linux-{index}",
            "size_in_bytes": len(archive),
            "expired": False,
            "digest": digest,
            "workflow_run": {
                "id": 900 + index,
                "head_branch": "main",
                "head_sha": "c" * 40,
            },
        }
        for index in range(1, 102)
    ]
    selected = artifacts[-1]
    transport = FakeGhTransport(
        result({"total_count": 101, "artifacts": artifacts[:100]}),
        result({"total_count": 101, "artifacts": artifacts[100:]}),
        result(selected),
        binary_result(archive),
    )
    client = GhClient(transport=transport, maximum_download_bytes=1024)

    listed = client.list_workflow_artifacts(repository, limit=101)
    assert len(listed) == 101
    assert listed[-1].workflow_run_id == 1001
    destination = tmp_path / "linux-101.zip"
    receipt = client.download_workflow_artifact(repository, 101, destination)
    assert destination.read_bytes() == archive
    assert receipt.verified
    assert receipt.sha256 == digest.removeprefix("sha256:")
    binary_argv = transport.binary_calls[0][0]
    assert any("actions/artifacts/101/zip" in item for item in binary_argv)
    assert "Accept: application/octet-stream" in binary_argv


def test_artifact_download_rejects_digest_mismatch_without_writing(
    repository: RepositoryRef,
    tmp_path: Any,
) -> None:
    artifact = {
        "id": 88,
        "name": "wrong.zip",
        "size_in_bytes": 4,
        "expired": False,
        "digest": f"sha256:{'0' * 64}",
    }
    client = GhClient(
        transport=FakeGhTransport(result(artifact), binary_result(b"nope")),
        maximum_download_bytes=1024,
    )
    destination = tmp_path / "wrong.zip"

    with pytest.raises(GitHubResponseError, match="did not match"):
        client.download_workflow_artifact(repository, 88, destination)
    assert not destination.exists()

    missing_digest_transport = FakeGhTransport(result({**artifact, "digest": None}))
    missing_digest = GhClient(
        transport=missing_digest_transport,
        maximum_download_bytes=1024,
    )
    with pytest.raises(GitHubResponseError, match="verified artifact download"):
        missing_digest.download_workflow_artifact(
            repository,
            88,
            tmp_path / "missing-digest.zip",
        )
    assert not missing_digest_transport.binary_calls


def test_job_log_inspection_is_binary_safe_and_bounded(repository: RepositoryRef) -> None:
    transport = FakeGhTransport(binary_result(b"step one\nall green\n"))
    client = GhClient(transport=transport, maximum_response_bytes=1024)

    log = client.get_job_log(repository, 30)
    assert log.text.splitlines() == ["step one", "all green"]
    assert log.byte_count == 19
    assert any("actions/jobs/30/logs" in item for item in transport.binary_calls[0][0])

    oversized = GhClient(
        transport=FakeGhTransport(binary_result(b"x" * 1025)),
        maximum_response_bytes=1024,
    )
    with pytest.raises(GitHubResponseTooLargeError):
        oversized.get_job_log(repository, 30)


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
    listed_package = client.list_packages(repository)[0]
    assert listed_package.owner is not None
    assert listed_package.owner.login == "acme"
    assert client.get_package(repository, "desktop-material").package_type == "container"
    assert client.list_package_versions(repository, "desktop-material")[0].id == 4
    assert client.list_projects(repository)[0].number == 5
    assert client.get_project(repository, 5).title == "TUI"

    package_argv = transport.calls[3][0]
    project_argv = transport.calls[6][0]
    assert "--method" in package_argv
    assert "GET" in package_argv
    assert project_argv[:3] == ("gh", "project", "list")


def test_release_mutations_and_verified_asset_download(
    repository: RepositoryRef,
    tmp_path: Any,
) -> None:
    payload = b"release-installer"
    digest = f"sha256:{hashlib.sha256(payload).hexdigest()}"
    asset = {
        "id": 72,
        "name": "desktop-material.tar.gz",
        "state": "uploaded",
        "size": len(payload),
        "download_count": 0,
        "content_type": "application/gzip",
        "digest": digest,
    }
    draft = {
        "id": 70,
        "tag_name": "v2.0.0",
        "name": "2.0.0",
        "body": "Draft notes",
        "draft": True,
        "prerelease": False,
        "target_commitish": "main",
        "assets": [],
    }
    published = {**draft, "draft": False, "body": "Published notes", "assets": [asset]}
    transport = FakeGhTransport(
        result(draft),
        result(published),
        result(asset),
        binary_result(payload),
        result(stdout=""),
    )
    client = GhClient(transport=transport, maximum_download_bytes=1024)

    created = client.create_release(
        repository,
        tag_name="v2.0.0",
        target_commitish="main",
        name="2.0.0",
        body="Draft notes",
    )
    assert created.draft
    updated = client.update_release(
        repository,
        70,
        tag_name="v2.0.0",
        target_commitish="main",
        name="2.0.0",
        body="Published notes",
        draft=False,
        prerelease=False,
    )
    assert not updated.draft
    destination = tmp_path / "desktop-material.tar.gz"
    receipt = client.download_release_asset(repository, 72, destination)
    assert receipt.verified
    assert destination.read_bytes() == payload
    assert client.delete_release(repository, 70).operation == "delete-release"

    create_payload = transport.calls[0][2]
    update_payload = transport.calls[1][2]
    assert create_payload is not None
    assert update_payload is not None
    assert json.loads(create_payload)["draft"] is True
    assert json.loads(update_payload)["draft"] is False


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
