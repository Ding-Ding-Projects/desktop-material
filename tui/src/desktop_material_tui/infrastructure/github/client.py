"""Typed GitHub integration implemented exclusively through the installed ``gh`` CLI."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.parse import quote, urlencode

from .errors import (
    GitHubAuthenticationError,
    GitHubCliNotFoundError,
    GitHubCommandError,
    GitHubResponseError,
    GitHubResponseTooLargeError,
    GitHubScopeError,
    GitHubTimeoutError,
    GitHubUnsafeOperationError,
    GitHubValidationError,
    extract_http_status,
    extract_required_scopes,
    sanitize_cli_text,
)
from .models import (
    ActionReceipt,
    ActionsCache,
    DownloadReceipt,
    EffectiveBranchRule,
    ExplorerResponse,
    GitHubAuthStatus,
    Issue,
    IssueComment,
    IssueState,
    MergeMethod,
    Package,
    PackageVersion,
    Project,
    PullRequest,
    PullRequestCheck,
    PullRequestFile,
    PullRequestMergeResult,
    PullRequestReview,
    PullRequestReviewComment,
    Release,
    ReleaseAsset,
    RepositoryNotification,
    RepositoryRef,
    ReviewDecision,
    Workflow,
    WorkflowArtifact,
    WorkflowJob,
    WorkflowLogContent,
    WorkflowLogMetadata,
    WorkflowRun,
)
from .transport import (
    GhBinaryProcessResult,
    GhProcessResult,
    GhTransport,
    SubprocessGhTransport,
)

_NO_PAYLOAD = object()
_AUTH_LOGIN = re.compile(r"account\s+([A-Za-z0-9_.-]+)", re.IGNORECASE)
_AUTH_SCOPES = re.compile(r"Token scopes:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_HTTP_HEADER = re.compile(r"^HTTP/\S+\s+([1-5][0-9]{2})\b", re.MULTILINE)
_SENSITIVE_KEY = re.compile(
    r"(?:^|_)(?:access_?token|authorization|client_?secret|password|"
    r"private_?key|refresh_?token|secret)(?:$|_)",
    re.IGNORECASE,
)
_SENSITIVE_QUERY = re.compile(
    r"(?i)(?:[?&])(?:access_token|authorization|client_secret|key|"
    r"password|private_key|refresh_token|secret|sig|signature|token)="
)
_SENSITIVE_VALUE = re.compile(
    r"(?:\bgh[pousr]_[A-Za-z0-9_]{12,}\b|"
    r"\bgithub_pat_[A-Za-z0-9_]{12,}\b|"
    r"\bBearer\s+\S+)",
    re.IGNORECASE,
)
_ALLOWED_REST_METHODS = frozenset({"GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"})
_SAFE_REST_METHODS = frozenset({"GET", "HEAD"})
_PACKAGE_TYPES = frozenset({"container", "docker", "maven", "npm", "nuget", "rubygems"})
_PROJECT_OWNER = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_SAFE_RESPONSE_HEADERS = frozenset(
    {
        "content-length",
        "content-type",
        "etag",
        "last-modified",
        "link",
        "x-github-api-version-selected",
        "x-github-request-id",
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
        "x-ratelimit-resource",
        "x-ratelimit-used",
    }
)


class GhClient:
    """Bounded, injectable wrapper around GitHub CLI argv invocations."""

    def __init__(
        self,
        *,
        transport: GhTransport | None = None,
        command_prefix: Sequence[str] = ("gh",),
        default_timeout_seconds: float = 30.0,
        maximum_timeout_seconds: float = 120.0,
        maximum_response_bytes: int = 2_000_000,
        maximum_request_bytes: int = 65_536,
        maximum_download_bytes: int = 128_000_000,
        maximum_graphql_depth: int = 12,
    ) -> None:
        if (
            isinstance(command_prefix, (str, bytes))
            or not command_prefix
            or any(
                not isinstance(item, str) or not item or "\x00" in item for item in command_prefix
            )
        ):
            raise GitHubValidationError("GitHub CLI command prefix cannot be empty.")
        if (
            not math.isfinite(default_timeout_seconds)
            or default_timeout_seconds <= 0
            or not math.isfinite(maximum_timeout_seconds)
            or maximum_timeout_seconds <= 0
            or default_timeout_seconds > maximum_timeout_seconds
        ):
            raise GitHubValidationError("Invalid GitHub CLI timeout configuration.")
        if (
            maximum_response_bytes < 1024
            or maximum_request_bytes < 256
            or maximum_download_bytes < 1024
        ):
            raise GitHubValidationError("GitHub CLI size limits are too small.")
        if not 1 <= maximum_graphql_depth <= 32:
            raise GitHubValidationError("GraphQL depth limit must be between 1 and 32.")

        self._transport = transport or SubprocessGhTransport()
        self._command_prefix = tuple(command_prefix)
        self._default_timeout_seconds = default_timeout_seconds
        self._maximum_timeout_seconds = maximum_timeout_seconds
        self._maximum_response_bytes = maximum_response_bytes
        self._maximum_request_bytes = maximum_request_bytes
        self._maximum_download_bytes = maximum_download_bytes
        self._maximum_graphql_depth = maximum_graphql_depth

    # Authentication -----------------------------------------------------

    def auth_status(
        self,
        *,
        host: str = "github.com",
        timeout_seconds: float | None = None,
    ) -> GitHubAuthStatus:
        RepositoryRef("probe", "probe", host)
        try:
            result = self._execute(
                ("auth", "status", "--active", "--hostname", host),
                operation="check GitHub authentication",
                timeout_seconds=timeout_seconds,
            )
        except GitHubAuthenticationError:
            return GitHubAuthStatus(
                host=host,
                authenticated=False,
                login=None,
                scopes=(),
            )

        combined = f"{result.stdout}\n{result.stderr}"
        login_match = _AUTH_LOGIN.search(combined)
        scope_match = _AUTH_SCOPES.search(combined)
        scopes: tuple[str, ...] = ()
        if scope_match is not None:
            scopes = tuple(
                sorted(
                    {
                        candidate.strip(" '\"")
                        for candidate in scope_match.group(1).split(",")
                        if candidate.strip(" '\"")
                    }
                )
            )
        return GitHubAuthStatus(
            host=host,
            authenticated=True,
            login=login_match.group(1) if login_match is not None else None,
            scopes=scopes,
        )

    def require_auth(
        self,
        *,
        host: str = "github.com",
        scopes: Sequence[str] = (),
        timeout_seconds: float | None = None,
    ) -> GitHubAuthStatus:
        status = self.auth_status(host=host, timeout_seconds=timeout_seconds)
        if not status.authenticated:
            raise GitHubAuthenticationError(operation="require GitHub authentication")
        missing = tuple(sorted(set(scopes).difference(status.scopes)))
        if missing:
            raise GitHubScopeError(missing, operation="require GitHub authentication")
        return status

    # Issues -------------------------------------------------------------

    def list_issues(
        self,
        repository: RepositoryRef,
        *,
        state: str = "open",
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Issue, ...]:
        normalized_state = self._choice(state, {"open", "closed", "all"}, "issue state")
        bounded_limit = self._limit(limit)
        value = self._run_json(
            (
                "issue",
                "list",
                "--repo",
                repository.qualified_slug,
                "--state",
                normalized_state,
                "--limit",
                str(bounded_limit),
                "--json",
                (
                    "number,title,body,state,url,author,labels,assignees,"
                    "createdAt,updatedAt,closedAt"
                ),
            ),
            operation="list issues",
            timeout_seconds=timeout_seconds,
        )
        return tuple(Issue.from_json(item) for item in self._json_sequence(value, "list issues"))

    def get_issue(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        timeout_seconds: float | None = None,
    ) -> Issue:
        value = self._run_json(
            (
                "issue",
                "view",
                str(self._positive_id(number, "issue")),
                "--repo",
                repository.qualified_slug,
                "--json",
                (
                    "number,title,body,state,url,author,labels,assignees,"
                    "createdAt,updatedAt,closedAt,comments"
                ),
            ),
            operation="view issue",
            timeout_seconds=timeout_seconds,
        )
        return Issue.from_json(value)

    def create_issue(
        self,
        repository: RepositoryRef,
        *,
        title: str,
        body: str = "",
        labels: Sequence[str] = (),
        assignees: Sequence[str] = (),
        timeout_seconds: float | None = None,
    ) -> Issue:
        payload: dict[str, Any] = {
            "title": self._title(title),
            "body": self._body(body),
        }
        if labels:
            payload["labels"] = self._names(labels, "label")
        if assignees:
            payload["assignees"] = self._names(assignees, "assignee")
        value = self._api_json(
            repository,
            "POST",
            "issues",
            payload=payload,
            operation="create issue",
            timeout_seconds=timeout_seconds,
        )
        return Issue.from_json(value)

    def comment_issue(
        self,
        repository: RepositoryRef,
        number: int,
        body: str,
        *,
        timeout_seconds: float | None = None,
    ) -> IssueComment:
        value = self._api_json(
            repository,
            "POST",
            f"issues/{self._positive_id(number, 'issue')}/comments",
            payload={"body": self._nonempty_body(body)},
            operation="comment on issue",
            timeout_seconds=timeout_seconds,
        )
        return IssueComment.from_json(value)

    def update_issue(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        title: str | None = None,
        body: str | None = None,
        state: str | IssueState | None = None,
        labels: Sequence[str] | None = None,
        assignees: Sequence[str] | None = None,
        timeout_seconds: float | None = None,
    ) -> Issue:
        payload: dict[str, Any] = {}
        if title is not None:
            payload["title"] = self._title(title)
        if body is not None:
            payload["body"] = self._body(body)
        if state is not None:
            state_value = state.value if isinstance(state, IssueState) else state
            payload["state"] = self._choice(state_value.lower(), {"open", "closed"}, "issue state")
        if labels is not None:
            payload["labels"] = self._names(labels, "label")
        if assignees is not None:
            payload["assignees"] = self._names(assignees, "assignee")
        if not payload:
            raise GitHubValidationError(
                "At least one issue field must be updated.",
                operation="update issue",
            )
        value = self._api_json(
            repository,
            "PATCH",
            f"issues/{self._positive_id(number, 'issue')}",
            payload=payload,
            operation="update issue",
            timeout_seconds=timeout_seconds,
        )
        return Issue.from_json(value)

    def close_issue(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        reason: str = "completed",
        timeout_seconds: float | None = None,
    ) -> Issue:
        normalized_reason = self._choice(reason, {"completed", "not_planned"}, "issue close reason")
        value = self._api_json(
            repository,
            "PATCH",
            f"issues/{self._positive_id(number, 'issue')}",
            payload={"state": "closed", "state_reason": normalized_reason},
            operation="close issue",
            timeout_seconds=timeout_seconds,
        )
        return Issue.from_json(value)

    # Pull requests ------------------------------------------------------

    def list_pull_requests(
        self,
        repository: RepositoryRef,
        *,
        state: str = "open",
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequest, ...]:
        normalized_state = self._choice(
            state, {"open", "closed", "merged", "all"}, "pull-request state"
        )
        value = self._run_json(
            (
                "pr",
                "list",
                "--repo",
                repository.qualified_slug,
                "--state",
                normalized_state,
                "--limit",
                str(self._limit(limit)),
                "--json",
                (
                    "number,title,body,state,url,author,headRefName,headRefOid,"
                    "baseRefName,isDraft,mergeStateStatus,reviewDecision,"
                    "createdAt,updatedAt,mergedAt"
                ),
            ),
            operation="list pull requests",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            PullRequest.from_json(item) for item in self._json_sequence(value, "list pull requests")
        )

    def get_pull_request(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        timeout_seconds: float | None = None,
    ) -> PullRequest:
        value = self._run_json(
            (
                "pr",
                "view",
                str(self._positive_id(number, "pull request")),
                "--repo",
                repository.qualified_slug,
                "--json",
                (
                    "number,title,body,state,url,author,headRefName,headRefOid,"
                    "baseRefName,isDraft,mergeStateStatus,reviewDecision,"
                    "createdAt,updatedAt,mergedAt,comments,reviews"
                ),
            ),
            operation="view pull request",
            timeout_seconds=timeout_seconds,
        )
        return PullRequest.from_json(value)

    def create_pull_request(
        self,
        repository: RepositoryRef,
        *,
        title: str,
        head: str,
        base: str,
        body: str = "",
        draft: bool = False,
        maintainer_can_modify: bool = True,
        timeout_seconds: float | None = None,
    ) -> PullRequest:
        value = self._api_json(
            repository,
            "POST",
            "pulls",
            payload={
                "title": self._title(title),
                "head": self._ref(head, "head"),
                "base": self._ref(base, "base"),
                "body": self._body(body),
                "draft": draft,
                "maintainer_can_modify": maintainer_can_modify,
            },
            operation="create pull request",
            timeout_seconds=timeout_seconds,
        )
        return PullRequest.from_json(value)

    def review_pull_request(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        event: str | ReviewDecision,
        body: str = "",
        commit_id: str | None = None,
        timeout_seconds: float | None = None,
    ) -> PullRequestReview:
        event_value = event.value if isinstance(event, ReviewDecision) else event.upper()
        normalized_event = self._choice(
            event_value,
            {item.value for item in ReviewDecision},
            "review event",
        )
        if normalized_event == ReviewDecision.REQUEST_CHANGES.value and not body.strip():
            raise GitHubValidationError(
                "A request-changes review requires a body.",
                operation="review pull request",
            )
        payload: dict[str, Any] = {
            "event": normalized_event,
            "body": self._body(body),
        }
        if commit_id is not None:
            payload["commit_id"] = self._sha(commit_id)
        value = self._api_json(
            repository,
            "POST",
            f"pulls/{self._positive_id(number, 'pull request')}/reviews",
            payload=payload,
            operation="review pull request",
            timeout_seconds=timeout_seconds,
        )
        return PullRequestReview.from_json(value)

    def merge_pull_request(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        method: str | MergeMethod = MergeMethod.MERGE,
        commit_title: str | None = None,
        commit_message: str | None = None,
        expected_head_sha: str | None = None,
        timeout_seconds: float | None = None,
    ) -> PullRequestMergeResult:
        method_value = method.value if isinstance(method, MergeMethod) else method
        payload: dict[str, Any] = {
            "merge_method": self._choice(
                method_value,
                {item.value for item in MergeMethod},
                "merge method",
            )
        }
        if commit_title is not None:
            payload["commit_title"] = self._title(commit_title)
        if commit_message is not None:
            payload["commit_message"] = self._body(commit_message)
        if expected_head_sha is not None:
            payload["sha"] = self._sha(expected_head_sha)
        value = self._api_json(
            repository,
            "PUT",
            f"pulls/{self._positive_id(number, 'pull request')}/merge",
            payload=payload,
            operation="merge pull request",
            timeout_seconds=timeout_seconds,
        )
        return PullRequestMergeResult.from_json(value)

    def comment_pull_request(
        self,
        repository: RepositoryRef,
        number: int,
        body: str,
        *,
        timeout_seconds: float | None = None,
    ) -> IssueComment:
        return self.comment_issue(
            repository,
            number,
            body,
            timeout_seconds=timeout_seconds,
        )

    def list_pull_request_files(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequestFile, ...]:
        items = self._paginated_sequence_items(
            repository,
            f"pulls/{self._positive_id(number, 'pull request')}/files",
            fixed_query={},
            limit=self._collection_limit(limit),
            operation="list pull-request files",
            timeout_seconds=timeout_seconds,
        )
        return tuple(PullRequestFile.from_json(item) for item in items)

    def list_pull_request_checks(
        self,
        repository: RepositoryRef,
        ref: str,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequestCheck, ...]:
        normalized_limit = self._collection_limit(limit)
        normalized_ref = quote(self._ref(ref, "check ref"), safe="")
        check_runs = self._paginated_mapping_items(
            repository,
            f"commits/{normalized_ref}/check-runs",
            key="check_runs",
            fixed_query={"filter": "latest"},
            limit=normalized_limit,
            operation="list pull-request check runs",
            timeout_seconds=timeout_seconds,
        )
        remaining = normalized_limit - len(check_runs)
        statuses: tuple[object, ...] = ()
        if remaining:
            statuses = self._paginated_sequence_items(
                repository,
                f"commits/{normalized_ref}/statuses",
                fixed_query={},
                limit=remaining,
                operation="list pull-request commit statuses",
                timeout_seconds=timeout_seconds,
            )
        return (
            *(PullRequestCheck.from_check_run_json(item) for item in check_runs),
            *(PullRequestCheck.from_status_json(item) for item in statuses),
        )

    def list_pull_request_review_comments(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequestReviewComment, ...]:
        items = self._paginated_sequence_items(
            repository,
            f"pulls/{self._positive_id(number, 'pull request')}/comments",
            fixed_query={"sort": "created", "direction": "asc"},
            limit=self._collection_limit(limit),
            operation="list pull-request review comments",
            timeout_seconds=timeout_seconds,
        )
        return tuple(PullRequestReviewComment.from_json(item) for item in items)

    def create_pull_request_review_comment(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        body: str,
        commit_id: str,
        path: str,
        line: int,
        side: str,
        timeout_seconds: float | None = None,
    ) -> PullRequestReviewComment:
        value = self._api_json(
            repository,
            "POST",
            f"pulls/{self._positive_id(number, 'pull request')}/comments",
            payload={
                "body": self._nonempty_body(body),
                "commit_id": self._sha(commit_id),
                "path": self._single_line(path, "review path", maximum=1_024),
                "line": self._positive_id(line, "review line"),
                "side": self._choice(side.upper(), {"LEFT", "RIGHT"}, "review side"),
            },
            operation="create pull-request review comment",
            timeout_seconds=timeout_seconds,
        )
        return PullRequestReviewComment.from_json(value)

    def list_effective_branch_rules(
        self,
        repository: RepositoryRef,
        branch: str,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[EffectiveBranchRule, ...]:
        normalized_branch = self._ref(branch, "branch")
        if any(character in normalized_branch for character in "*?["):
            raise GitHubValidationError(
                "Effective branch-rule inspection requires an exact branch name.",
                operation="list effective branch rules",
            )
        items = self._paginated_sequence_items(
            repository,
            f"rules/branches/{quote(normalized_branch, safe='')}",
            fixed_query={},
            limit=self._collection_limit(limit),
            operation="list effective branch rules",
            timeout_seconds=timeout_seconds,
        )
        return tuple(EffectiveBranchRule.from_json(item) for item in items)

    def list_repository_notifications(
        self,
        repository: RepositoryRef,
        *,
        all_notifications: bool = True,
        participating: bool = False,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[RepositoryNotification, ...]:
        items = self._paginated_sequence_items(
            repository,
            "notifications",
            fixed_query={
                "all": str(all_notifications).lower(),
                "participating": str(participating).lower(),
            },
            limit=self._collection_limit(limit),
            operation="list repository notifications",
            timeout_seconds=timeout_seconds,
        )
        return tuple(RepositoryNotification.from_json(item) for item in items)

    def mark_notification_read(
        self,
        repository: RepositoryRef,
        thread_id: str,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        normalized_id = self._single_line(thread_id, "notification thread id", maximum=100)
        if not normalized_id.isdigit():
            raise GitHubValidationError(
                "Notification thread id must contain decimal digits only.",
                operation="mark notification read",
            )
        self._global_api_json(
            repository.host,
            "PATCH",
            f"notifications/threads/{quote(normalized_id, safe='')}",
            operation="mark notification read",
            timeout_seconds=timeout_seconds,
        )
        return ActionReceipt(operation="mark-notification-read", accepted=True)

    # GitHub Actions -----------------------------------------------------

    def list_workflows(
        self,
        repository: RepositoryRef,
        *,
        limit: int = 100,
        timeout_seconds: float | None = None,
    ) -> tuple[Workflow, ...]:
        value = self._api_json(
            repository,
            "GET",
            "actions/workflows",
            query={"per_page": self._limit(limit)},
            operation="list workflows",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            Workflow.from_json(item)
            for item in self._mapping_sequence(value, "workflows", "list workflows")
        )

    def list_workflow_runs(
        self,
        repository: RepositoryRef,
        *,
        workflow_id: int | str | None = None,
        branch: str | None = None,
        event: str | None = None,
        status: str | None = None,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[WorkflowRun, ...]:
        endpoint = "actions/runs"
        if workflow_id is not None:
            endpoint = f"actions/workflows/{quote(str(workflow_id), safe='')}/runs"
        query: dict[str, object] = {"per_page": self._limit(limit)}
        for key, candidate in (("branch", branch), ("event", event), ("status", status)):
            if candidate is not None:
                query[key] = self._single_line(candidate, key, maximum=200)
        value = self._api_json(
            repository,
            "GET",
            endpoint,
            query=query,
            operation="list workflow runs",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            WorkflowRun.from_json(item)
            for item in self._mapping_sequence(value, "workflow_runs", "list workflow runs")
        )

    def get_workflow_run(
        self,
        repository: RepositoryRef,
        run_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowRun:
        value = self._api_json(
            repository,
            "GET",
            f"actions/runs/{self._positive_id(run_id, 'workflow run')}",
            operation="view workflow run",
            timeout_seconds=timeout_seconds,
        )
        return WorkflowRun.from_json(value)

    def list_workflow_jobs(
        self,
        repository: RepositoryRef,
        run_id: int,
        *,
        limit: int = 100,
        timeout_seconds: float | None = None,
    ) -> tuple[WorkflowJob, ...]:
        value = self._api_json(
            repository,
            "GET",
            f"actions/runs/{self._positive_id(run_id, 'workflow run')}/jobs",
            query={"filter": "all", "per_page": self._limit(limit)},
            operation="list workflow jobs",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            WorkflowJob.from_json(item)
            for item in self._mapping_sequence(value, "jobs", "list workflow jobs")
        )

    def get_run_log_metadata(
        self,
        repository: RepositoryRef,
        run_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowLogMetadata:
        normalized_id = self._positive_id(run_id, "workflow run")
        return self._log_metadata(
            repository,
            resource_kind="run",
            resource_id=normalized_id,
            suffix=f"actions/runs/{normalized_id}/logs",
            timeout_seconds=timeout_seconds,
        )

    def get_job_log_metadata(
        self,
        repository: RepositoryRef,
        job_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowLogMetadata:
        normalized_id = self._positive_id(job_id, "workflow job")
        return self._log_metadata(
            repository,
            resource_kind="job",
            resource_id=normalized_id,
            suffix=f"actions/jobs/{normalized_id}/logs",
            timeout_seconds=timeout_seconds,
        )

    def get_job_log(
        self,
        repository: RepositoryRef,
        job_id: int,
        *,
        maximum_bytes: int | None = None,
        timeout_seconds: float | None = None,
    ) -> WorkflowLogContent:
        normalized_id = self._positive_id(job_id, "workflow job")
        limit = self._download_limit(
            maximum_bytes,
            ceiling=self._maximum_response_bytes,
            operation="inspect workflow job log",
        )
        payload = self._api_binary(
            repository,
            "GET",
            f"actions/jobs/{normalized_id}/logs",
            accept="text/plain",
            maximum_bytes=limit,
            operation="inspect workflow job log",
            timeout_seconds=timeout_seconds,
        )
        return WorkflowLogContent(
            resource_kind="job",
            resource_id=normalized_id,
            text=payload.decode("utf-8", errors="replace"),
            byte_count=len(payload),
        )

    def list_actions_caches(
        self,
        repository: RepositoryRef,
        *,
        key: str | None = None,
        ref: str | None = None,
        sort: str = "last_accessed_at",
        direction: str = "desc",
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[ActionsCache, ...]:
        total_limit = self._collection_limit(limit)
        normalized_sort = self._choice(
            sort,
            {"created_at", "last_accessed_at", "size_in_bytes"},
            "cache sort",
        )
        normalized_direction = self._choice(
            direction,
            {"asc", "desc"},
            "cache direction",
        )
        fixed_query: dict[str, object] = {
            "sort": normalized_sort,
            "direction": normalized_direction,
        }
        if key is not None:
            fixed_query["key"] = self._single_line(key, "cache key", maximum=512)
        if ref is not None:
            fixed_query["ref"] = self._ref(ref, "cache ref")
        return tuple(
            ActionsCache.from_json(item)
            for item in self._paginated_mapping_items(
                repository,
                "actions/caches",
                key="actions_caches",
                fixed_query=fixed_query,
                limit=total_limit,
                operation="list Actions caches",
                timeout_seconds=timeout_seconds,
            )
        )

    def delete_actions_cache(
        self,
        repository: RepositoryRef,
        cache_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        normalized_id = self._positive_id(cache_id, "Actions cache")
        self._api_empty(
            repository,
            "DELETE",
            f"actions/caches/{normalized_id}",
            operation="delete Actions cache",
            timeout_seconds=timeout_seconds,
        )
        return ActionReceipt(operation="delete-cache", accepted=True)

    def list_workflow_artifacts(
        self,
        repository: RepositoryRef,
        *,
        run_id: int | None = None,
        name: str | None = None,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[WorkflowArtifact, ...]:
        total_limit = self._collection_limit(limit)
        suffix = "actions/artifacts"
        if run_id is not None:
            suffix = f"actions/runs/{self._positive_id(run_id, 'workflow run')}/artifacts"
        fixed_query: dict[str, object] = {}
        if name is not None:
            fixed_query["name"] = self._single_line(name, "artifact name", maximum=255)
        return tuple(
            WorkflowArtifact.from_json(item)
            for item in self._paginated_mapping_items(
                repository,
                suffix,
                key="artifacts",
                fixed_query=fixed_query,
                limit=total_limit,
                operation="list workflow artifacts",
                timeout_seconds=timeout_seconds,
            )
        )

    def get_workflow_artifact(
        self,
        repository: RepositoryRef,
        artifact_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowArtifact:
        normalized_id = self._positive_id(artifact_id, "workflow artifact")
        value = self._api_json(
            repository,
            "GET",
            f"actions/artifacts/{normalized_id}",
            operation="view workflow artifact",
            timeout_seconds=timeout_seconds,
        )
        return WorkflowArtifact.from_json(value)

    def download_workflow_artifact(
        self,
        repository: RepositoryRef,
        artifact_id: int,
        destination: str | os.PathLike[str],
        *,
        maximum_bytes: int | None = None,
        overwrite: bool = False,
        timeout_seconds: float | None = None,
    ) -> DownloadReceipt:
        artifact = self.get_workflow_artifact(
            repository,
            artifact_id,
            timeout_seconds=timeout_seconds,
        )
        if artifact.expired:
            raise GitHubValidationError(
                "Expired workflow artifacts cannot be downloaded.",
                operation="download workflow artifact",
            )
        if artifact.digest is None:
            raise GitHubResponseError(
                "GitHub did not provide a SHA-256 digest; verified artifact "
                "download is unavailable.",
                operation="download workflow artifact",
            )
        limit = self._download_limit(
            maximum_bytes,
            ceiling=self._maximum_download_bytes,
            operation="download workflow artifact",
        )
        if artifact.size_in_bytes > limit:
            raise GitHubResponseTooLargeError(
                artifact.size_in_bytes,
                limit,
                operation="download workflow artifact",
            )
        payload = self._api_binary(
            repository,
            "GET",
            f"actions/artifacts/{artifact.id}/zip",
            accept="application/octet-stream",
            maximum_bytes=limit,
            operation="download workflow artifact",
            timeout_seconds=timeout_seconds,
        )
        return self._store_download(
            payload,
            destination,
            resource_kind="artifact",
            resource_id=artifact.id,
            expected_digest=artifact.digest,
            overwrite=overwrite,
            operation="download workflow artifact",
        )

    def dispatch_workflow(
        self,
        repository: RepositoryRef,
        workflow_id: int | str,
        *,
        ref: str,
        inputs: Mapping[str, str] | None = None,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        payload: dict[str, Any] = {"ref": self._ref(ref, "workflow ref")}
        if inputs is not None:
            if len(inputs) > 25:
                raise GitHubValidationError(
                    "Workflow dispatch accepts at most 25 inputs.",
                    operation="dispatch workflow",
                )
            payload["inputs"] = {
                self._single_line(str(key), "workflow input name", maximum=100): self._body(
                    str(value), maximum_bytes=10_000
                )
                for key, value in inputs.items()
            }
        self._api_empty(
            repository,
            "POST",
            (f"actions/workflows/{quote(str(workflow_id), safe='')}/dispatches"),
            payload=payload,
            operation="dispatch workflow",
            timeout_seconds=timeout_seconds,
        )
        return ActionReceipt(operation="dispatch", accepted=True)

    def rerun_workflow(
        self,
        repository: RepositoryRef,
        run_id: int,
        *,
        failed_only: bool = False,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        normalized_id = self._positive_id(run_id, "workflow run")
        action = "rerun-failed-jobs" if failed_only else "rerun"
        self._api_empty(
            repository,
            "POST",
            f"actions/runs/{normalized_id}/{action}",
            operation="rerun workflow",
            timeout_seconds=timeout_seconds,
        )
        return ActionReceipt(operation=action, accepted=True)

    def cancel_workflow(
        self,
        repository: RepositoryRef,
        run_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        normalized_id = self._positive_id(run_id, "workflow run")
        self._api_empty(
            repository,
            "POST",
            f"actions/runs/{normalized_id}/cancel",
            operation="cancel workflow",
            timeout_seconds=timeout_seconds,
        )
        return ActionReceipt(operation="cancel", accepted=True)

    # Releases -----------------------------------------------------------

    def list_releases(
        self,
        repository: RepositoryRef,
        *,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Release, ...]:
        value = self._api_json(
            repository,
            "GET",
            "releases",
            query={"per_page": self._limit(limit)},
            operation="list releases",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            Release.from_json(item) for item in self._json_sequence(value, "list releases")
        )

    def get_release(
        self,
        repository: RepositoryRef,
        tag: str,
        *,
        timeout_seconds: float | None = None,
    ) -> Release:
        normalized_tag = self._single_line(tag, "release tag", maximum=255)
        value = self._api_json(
            repository,
            "GET",
            f"releases/tags/{quote(normalized_tag, safe='')}",
            operation="view release",
            timeout_seconds=timeout_seconds,
        )
        return Release.from_json(value)

    def list_release_assets(
        self,
        repository: RepositoryRef,
        release_id: int,
        *,
        limit: int = 100,
        timeout_seconds: float | None = None,
    ) -> tuple[ReleaseAsset, ...]:
        value = self._api_json(
            repository,
            "GET",
            f"releases/{self._positive_id(release_id, 'release')}/assets",
            query={"per_page": self._limit(limit)},
            operation="list release assets",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            ReleaseAsset.from_json(item)
            for item in self._json_sequence(value, "list release assets")
        )

    def get_release_asset(
        self,
        repository: RepositoryRef,
        asset_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ReleaseAsset:
        normalized_id = self._positive_id(asset_id, "release asset")
        value = self._api_json(
            repository,
            "GET",
            f"releases/assets/{normalized_id}",
            operation="view release asset",
            timeout_seconds=timeout_seconds,
        )
        return ReleaseAsset.from_json(value)

    def create_release(
        self,
        repository: RepositoryRef,
        *,
        tag_name: str,
        target_commitish: str,
        name: str,
        body: str = "",
        draft: bool = True,
        prerelease: bool = False,
        timeout_seconds: float | None = None,
    ) -> Release:
        payload = {
            "tag_name": self._ref(tag_name, "release tag"),
            "target_commitish": self._ref(target_commitish, "release target"),
            "name": self._single_line(name, "release name", maximum=255),
            "body": self._body(body),
            "draft": bool(draft),
            "prerelease": bool(prerelease),
        }
        value = self._api_json(
            repository,
            "POST",
            "releases",
            payload=payload,
            operation="create release",
            timeout_seconds=timeout_seconds,
        )
        return Release.from_json(value)

    def update_release(
        self,
        repository: RepositoryRef,
        release_id: int,
        *,
        tag_name: str,
        target_commitish: str,
        name: str,
        body: str,
        draft: bool,
        prerelease: bool,
        timeout_seconds: float | None = None,
    ) -> Release:
        normalized_id = self._positive_id(release_id, "release")
        payload = {
            "tag_name": self._ref(tag_name, "release tag"),
            "target_commitish": self._ref(target_commitish, "release target"),
            "name": self._single_line(name, "release name", maximum=255),
            "body": self._body(body),
            "draft": bool(draft),
            "prerelease": bool(prerelease),
        }
        value = self._api_json(
            repository,
            "PATCH",
            f"releases/{normalized_id}",
            payload=payload,
            operation="update release",
            timeout_seconds=timeout_seconds,
        )
        return Release.from_json(value)

    def delete_release(
        self,
        repository: RepositoryRef,
        release_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        normalized_id = self._positive_id(release_id, "release")
        self._api_empty(
            repository,
            "DELETE",
            f"releases/{normalized_id}",
            operation="delete release",
            timeout_seconds=timeout_seconds,
        )
        return ActionReceipt(operation="delete-release", accepted=True)

    def download_release_asset(
        self,
        repository: RepositoryRef,
        asset_id: int,
        destination: str | os.PathLike[str],
        *,
        maximum_bytes: int | None = None,
        overwrite: bool = False,
        timeout_seconds: float | None = None,
    ) -> DownloadReceipt:
        asset = self.get_release_asset(
            repository,
            asset_id,
            timeout_seconds=timeout_seconds,
        )
        limit = self._download_limit(
            maximum_bytes,
            ceiling=self._maximum_download_bytes,
            operation="download release asset",
        )
        if asset.size > limit:
            raise GitHubResponseTooLargeError(
                asset.size,
                limit,
                operation="download release asset",
            )
        payload = self._api_binary(
            repository,
            "GET",
            f"releases/assets/{asset.id}",
            accept="application/octet-stream",
            maximum_bytes=limit,
            operation="download release asset",
            timeout_seconds=timeout_seconds,
        )
        return self._store_download(
            payload,
            destination,
            resource_kind="release-asset",
            resource_id=asset.id,
            expected_digest=asset.digest,
            overwrite=overwrite,
            operation="download release asset",
        )

    # Packages and Projects ---------------------------------------------

    def list_packages(
        self,
        repository: RepositoryRef,
        *,
        owner: str | None = None,
        owner_kind: str = "orgs",
        package_type: str = "container",
        visibility: str | None = None,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Package, ...]:
        normalized_owner = self._owner(owner or repository.owner)
        normalized_kind = self._choice(owner_kind, {"orgs", "users"}, "package owner kind")
        normalized_type = self._choice(package_type, _PACKAGE_TYPES, "package type")
        query: dict[str, object] = {
            "package_type": normalized_type,
            "per_page": self._limit(limit),
        }
        if visibility is not None:
            query["visibility"] = self._choice(
                visibility, {"public", "private", "internal"}, "package visibility"
            )
        value = self._global_api_json(
            repository.host,
            "GET",
            f"{normalized_kind}/{quote(normalized_owner, safe='')}/packages",
            query=query,
            operation="list packages",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            Package.from_json(item) for item in self._json_sequence(value, "list packages")
        )

    def get_package(
        self,
        repository: RepositoryRef,
        package_name: str,
        *,
        owner: str | None = None,
        owner_kind: str = "orgs",
        package_type: str = "container",
        timeout_seconds: float | None = None,
    ) -> Package:
        normalized_owner = self._owner(owner or repository.owner)
        normalized_kind = self._choice(owner_kind, {"orgs", "users"}, "package owner kind")
        normalized_type = self._choice(package_type, _PACKAGE_TYPES, "package type")
        normalized_name = self._single_line(package_name, "package name", maximum=255)
        value = self._global_api_json(
            repository.host,
            "GET",
            (
                f"{normalized_kind}/{quote(normalized_owner, safe='')}/packages/"
                f"{quote(normalized_type, safe='')}/{quote(normalized_name, safe='')}"
            ),
            operation="view package",
            timeout_seconds=timeout_seconds,
        )
        return Package.from_json(value)

    def list_package_versions(
        self,
        repository: RepositoryRef,
        package_name: str,
        *,
        owner: str | None = None,
        owner_kind: str = "orgs",
        package_type: str = "container",
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[PackageVersion, ...]:
        normalized_owner = self._owner(owner or repository.owner)
        normalized_kind = self._choice(owner_kind, {"orgs", "users"}, "package owner kind")
        normalized_type = self._choice(package_type, _PACKAGE_TYPES, "package type")
        normalized_name = self._single_line(package_name, "package name", maximum=255)
        value = self._global_api_json(
            repository.host,
            "GET",
            (
                f"{normalized_kind}/{quote(normalized_owner, safe='')}/packages/"
                f"{quote(normalized_type, safe='')}/{quote(normalized_name, safe='')}"
                "/versions"
            ),
            query={"per_page": self._limit(limit)},
            operation="list package versions",
            timeout_seconds=timeout_seconds,
        )
        return tuple(
            PackageVersion.from_json(item)
            for item in self._json_sequence(value, "list package versions")
        )

    def list_projects(
        self,
        repository: RepositoryRef,
        *,
        owner: str | None = None,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Project, ...]:
        normalized_owner = self._owner(owner or repository.owner)
        value = self._run_json(
            (
                "project",
                "list",
                "--owner",
                normalized_owner,
                "--limit",
                str(self._limit(limit)),
                "--format",
                "json",
            ),
            operation="list projects",
            timeout_seconds=timeout_seconds,
        )
        items = value.get("projects", ()) if isinstance(value, Mapping) else value
        return tuple(
            Project.from_json(item) for item in self._json_sequence(items, "list projects")
        )

    def get_project(
        self,
        repository: RepositoryRef,
        number: int,
        *,
        owner: str | None = None,
        timeout_seconds: float | None = None,
    ) -> Project:
        normalized_owner = self._owner(owner or repository.owner)
        value = self._run_json(
            (
                "project",
                "view",
                str(self._positive_id(number, "project")),
                "--owner",
                normalized_owner,
                "--format",
                "json",
            ),
            operation="view project",
            timeout_seconds=timeout_seconds,
        )
        return Project.from_json(value)

    # Bounded API explorers ---------------------------------------------

    def explore_rest(
        self,
        repository: RepositoryRef,
        *,
        method: str,
        path: str,
        body: Mapping[str, Any] | Sequence[Any] | None = None,
        confirm_mutation: bool = False,
        timeout_seconds: float | None = None,
    ) -> ExplorerResponse:
        normalized_method = method.upper()
        if normalized_method not in _ALLOWED_REST_METHODS:
            raise GitHubUnsafeOperationError(
                "REST explorer method is not permitted.",
                operation="explore REST API",
            )
        if normalized_method not in _SAFE_REST_METHODS and not confirm_mutation:
            raise GitHubUnsafeOperationError(
                "REST mutations require explicit confirmation.",
                operation="explore REST API",
            )
        if normalized_method in _SAFE_REST_METHODS and body is not None:
            raise GitHubUnsafeOperationError(
                "GET and HEAD explorer requests cannot carry a body.",
                operation="explore REST API",
            )
        if normalized_method == "DELETE" and body is not None:
            raise GitHubUnsafeOperationError(
                "DELETE explorer requests cannot carry a body.",
                operation="explore REST API",
            )
        normalized_path = self._explorer_path(path)
        payload: object = _NO_PAYLOAD
        if body is not None:
            self._ensure_explorer_payload_safe(body)
            payload = body

        result = self._api_included(
            repository.host,
            normalized_method,
            normalized_path,
            payload=payload,
            operation="explore REST API",
            timeout_seconds=timeout_seconds,
        )
        status, headers, data = self._parse_included_response(
            result.stdout,
            operation="explore REST API",
        )
        return ExplorerResponse(
            method=normalized_method,
            path=normalized_path,
            status=status,
            headers=headers,
            data=data,
        )

    def explore_graphql(
        self,
        repository: RepositoryRef,
        *,
        query: str,
        variables: Mapping[str, Any] | None = None,
        confirm_mutation: bool = False,
        timeout_seconds: float | None = None,
    ) -> ExplorerResponse:
        normalized_query = query.strip()
        if not normalized_query or len(normalized_query) > 32_768:
            raise GitHubValidationError(
                "GraphQL query must contain 1 to 32,768 characters.",
                operation="explore GraphQL API",
            )
        query_without_comments = re.sub(r"(?m)#.*$", "", normalized_query)
        is_mutation = re.search(r"\bmutation\b", query_without_comments) is not None
        if is_mutation and not confirm_mutation:
            raise GitHubUnsafeOperationError(
                "GraphQL mutations require explicit confirmation.",
                operation="explore GraphQL API",
            )
        if re.search(r"\bsubscription\b", query_without_comments):
            raise GitHubUnsafeOperationError(
                "GraphQL subscriptions are not supported.",
                operation="explore GraphQL API",
            )
        if self._graphql_depth(query_without_comments) > self._maximum_graphql_depth:
            raise GitHubUnsafeOperationError(
                "GraphQL query exceeds the configured nesting-depth limit.",
                operation="explore GraphQL API",
            )

        normalized_variables = dict(variables or {})
        self._ensure_explorer_payload_safe(normalized_query)
        self._ensure_explorer_payload_safe(normalized_variables)
        payload = {"query": normalized_query, "variables": normalized_variables}
        stdin_text = self._payload_text(payload, operation="explore GraphQL API")
        result = self._execute(
            (
                "api",
                "graphql",
                "--hostname",
                repository.host,
                "--include",
                "--input",
                "-",
            ),
            operation="explore GraphQL API",
            timeout_seconds=timeout_seconds,
            stdin_text=stdin_text,
        )
        status, headers, data = self._parse_included_response(
            result.stdout,
            operation="explore GraphQL API",
        )
        return ExplorerResponse(
            method="POST",
            path="graphql",
            status=status,
            headers=headers,
            data=data,
        )

    # Internal process and API helpers ----------------------------------

    def _execute(
        self,
        args: Sequence[str],
        *,
        operation: str,
        timeout_seconds: float | None,
        stdin_text: str | None = None,
    ) -> GhProcessResult:
        timeout = self._timeout(timeout_seconds)
        argv = (*self._command_prefix, *args)
        try:
            result = self._transport.run(
                argv,
                timeout_seconds=timeout,
                stdin_text=stdin_text,
            )
        except FileNotFoundError as error:
            raise GitHubCliNotFoundError(operation=operation) from error
        except subprocess.TimeoutExpired as error:
            raise GitHubTimeoutError(timeout, operation=operation) from error
        except OSError as error:
            raise GitHubCommandError(
                sanitize_cli_text(str(error)) or "GitHub CLI could not be launched.",
                operation=operation,
                exit_code=-1,
            ) from error

        actual_size = len(result.stdout.encode("utf-8", errors="replace")) + len(
            result.stderr.encode("utf-8", errors="replace")
        )
        if actual_size > self._maximum_response_bytes:
            raise GitHubResponseTooLargeError(
                actual_size,
                self._maximum_response_bytes,
                operation=operation,
            )
        if result.return_code != 0:
            self._raise_process_error(result, operation=operation)
        return result

    def _execute_binary(
        self,
        args: Sequence[str],
        *,
        operation: str,
        timeout_seconds: float | None,
        maximum_bytes: int,
    ) -> GhBinaryProcessResult:
        timeout = self._timeout(timeout_seconds)
        argv = (*self._command_prefix, *args)
        try:
            result = self._transport.run_binary(
                argv,
                timeout_seconds=timeout,
                maximum_bytes=maximum_bytes,
            )
        except FileNotFoundError as error:
            raise GitHubCliNotFoundError(operation=operation) from error
        except subprocess.TimeoutExpired as error:
            raise GitHubTimeoutError(timeout, operation=operation) from error
        except OSError as error:
            raise GitHubCommandError(
                sanitize_cli_text(str(error)) or "GitHub CLI could not be launched.",
                operation=operation,
                exit_code=-1,
            ) from error

        diagnostics_size = len(result.stderr.encode("utf-8", errors="replace"))
        actual_size = len(result.stdout)
        if actual_size > maximum_bytes:
            raise GitHubResponseTooLargeError(
                actual_size,
                maximum_bytes,
                operation=operation,
            )
        if diagnostics_size > self._maximum_response_bytes:
            raise GitHubResponseTooLargeError(
                diagnostics_size,
                self._maximum_response_bytes,
                operation=operation,
            )
        if result.return_code != 0:
            self._raise_process_error(
                GhProcessResult(
                    argv=result.argv,
                    return_code=result.return_code,
                    stdout=result.stdout.decode("utf-8", errors="replace"),
                    stderr=result.stderr,
                ),
                operation=operation,
            )
        return result

    def _raise_process_error(self, result: GhProcessResult, *, operation: str) -> None:
        combined = f"{result.stderr}\n{result.stdout}"
        required_scopes = extract_required_scopes(combined)
        if required_scopes:
            raise GitHubScopeError(required_scopes, operation=operation)

        http_status = extract_http_status(combined)
        lowered = combined.casefold()
        if (
            http_status == 401
            or "authentication required" in lowered
            or "bad credentials" in lowered
            or "not logged in" in lowered
            or "gh auth login" in lowered
        ):
            raise GitHubAuthenticationError(
                operation=operation,
                http_status=http_status,
            )
        retryable = (
            http_status in {408, 425, 429, 500, 502, 503, 504}
            or "rate limit" in lowered
            or "temporarily unavailable" in lowered
        )
        message = sanitize_cli_text(combined)
        if not message:
            message = "GitHub CLI command failed."
        raise GitHubCommandError(
            message,
            operation=operation,
            exit_code=result.return_code,
            http_status=http_status,
            retryable=retryable,
        )

    def _run_json(
        self,
        args: Sequence[str],
        *,
        operation: str,
        timeout_seconds: float | None,
    ) -> Any:
        result = self._execute(
            args,
            operation=operation,
            timeout_seconds=timeout_seconds,
        )
        return self._decode_json(result.stdout, operation=operation)

    def _api_json(
        self,
        repository: RepositoryRef,
        method: str,
        suffix: str,
        *,
        payload: object = _NO_PAYLOAD,
        query: Mapping[str, object] | None = None,
        operation: str,
        timeout_seconds: float | None,
    ) -> Any:
        endpoint = f"repos/{repository.slug}/{suffix.lstrip('/')}"
        return self._global_api_json(
            repository.host,
            method,
            endpoint,
            payload=payload,
            query=query,
            operation=operation,
            timeout_seconds=timeout_seconds,
        )

    def _api_binary(
        self,
        repository: RepositoryRef,
        method: str,
        suffix: str,
        *,
        accept: str,
        maximum_bytes: int,
        operation: str,
        timeout_seconds: float | None,
    ) -> bytes:
        endpoint = f"repos/{repository.slug}/{suffix.lstrip('/')}"
        result = self._execute_binary(
            (
                "api",
                endpoint,
                "--hostname",
                repository.host,
                "--method",
                method,
                "--header",
                f"Accept: {accept}",
                "--header",
                "X-GitHub-Api-Version: 2022-11-28",
            ),
            operation=operation,
            timeout_seconds=timeout_seconds,
            maximum_bytes=maximum_bytes,
        )
        return result.stdout

    def _paginated_mapping_items(
        self,
        repository: RepositoryRef,
        suffix: str,
        *,
        key: str,
        fixed_query: Mapping[str, object],
        limit: int,
        operation: str,
        timeout_seconds: float | None,
    ) -> tuple[object, ...]:
        items: list[object] = []
        page = 1
        while len(items) < limit:
            page_size = min(100, limit - len(items))
            query = {**fixed_query, "per_page": page_size, "page": page}
            value = self._api_json(
                repository,
                "GET",
                suffix,
                query=query,
                operation=operation,
                timeout_seconds=timeout_seconds,
            )
            batch = tuple(self._mapping_sequence(value, key, operation))
            items.extend(batch[:page_size])
            if len(batch) < page_size:
                break
            page += 1
        return tuple(items[:limit])

    def _paginated_sequence_items(
        self,
        repository: RepositoryRef,
        suffix: str,
        *,
        fixed_query: Mapping[str, object],
        limit: int,
        operation: str,
        timeout_seconds: float | None,
    ) -> tuple[object, ...]:
        items: list[object] = []
        page = 1
        while len(items) < limit:
            page_size = min(100, limit - len(items))
            query = {**fixed_query, "per_page": page_size, "page": page}
            value = self._api_json(
                repository,
                "GET",
                suffix,
                query=query,
                operation=operation,
                timeout_seconds=timeout_seconds,
            )
            batch = tuple(self._json_sequence(value, operation))
            items.extend(batch[:page_size])
            if len(batch) < page_size:
                break
            page += 1
        return tuple(items[:limit])

    def _global_api_json(
        self,
        host: str,
        method: str,
        endpoint: str,
        *,
        payload: object = _NO_PAYLOAD,
        query: Mapping[str, object] | None = None,
        operation: str,
        timeout_seconds: float | None,
    ) -> Any:
        normalized_endpoint = self._with_query(endpoint, query)
        args = [
            "api",
            normalized_endpoint,
            "--hostname",
            host,
            "--method",
            method,
            "--header",
            "Accept: application/vnd.github+json",
            "--header",
            "X-GitHub-Api-Version: 2022-11-28",
        ]
        stdin_text: str | None = None
        if payload is not _NO_PAYLOAD:
            args.extend(("--input", "-"))
            stdin_text = self._payload_text(payload, operation=operation)
        result = self._execute(
            tuple(args),
            operation=operation,
            timeout_seconds=timeout_seconds,
            stdin_text=stdin_text,
        )
        if not result.stdout.strip():
            return None
        return self._decode_json(result.stdout, operation=operation)

    def _api_empty(
        self,
        repository: RepositoryRef,
        method: str,
        suffix: str,
        *,
        payload: object = _NO_PAYLOAD,
        operation: str,
        timeout_seconds: float | None,
    ) -> None:
        self._api_json(
            repository,
            method,
            suffix,
            payload=payload,
            operation=operation,
            timeout_seconds=timeout_seconds,
        )

    def _api_included(
        self,
        host: str,
        method: str,
        endpoint: str,
        *,
        payload: object = _NO_PAYLOAD,
        operation: str,
        timeout_seconds: float | None,
    ) -> GhProcessResult:
        args = [
            "api",
            endpoint,
            "--hostname",
            host,
            "--method",
            method,
            "--include",
            "--header",
            "Accept: application/vnd.github+json",
            "--header",
            "X-GitHub-Api-Version: 2022-11-28",
        ]
        stdin_text: str | None = None
        if payload is not _NO_PAYLOAD:
            args.extend(("--input", "-"))
            stdin_text = self._payload_text(payload, operation=operation)
        return self._execute(
            tuple(args),
            operation=operation,
            timeout_seconds=timeout_seconds,
            stdin_text=stdin_text,
        )

    def _log_metadata(
        self,
        repository: RepositoryRef,
        *,
        resource_kind: str,
        resource_id: int,
        suffix: str,
        timeout_seconds: float | None,
    ) -> WorkflowLogMetadata:
        endpoint = f"repos/{repository.slug}/{suffix}"
        try:
            result = self._api_included(
                repository.host,
                "HEAD",
                endpoint,
                operation=f"inspect {resource_kind} logs",
                timeout_seconds=timeout_seconds,
            )
        except GitHubCommandError as error:
            if error.http_status in {404, 409}:
                return WorkflowLogMetadata(
                    resource_kind=resource_kind,
                    resource_id=resource_id,
                    api_path=endpoint,
                    available=False,
                    http_status=error.http_status,
                    content_type=None,
                    content_length=None,
                    etag=None,
                )
            raise
        status, headers, _ = self._parse_included_response(
            result.stdout,
            operation=f"inspect {resource_kind} logs",
        )
        header_map = dict(headers)
        length_value = header_map.get("content-length")
        return WorkflowLogMetadata(
            resource_kind=resource_kind,
            resource_id=resource_id,
            api_path=endpoint,
            available=status is None or 200 <= status < 400,
            http_status=status,
            content_type=header_map.get("content-type"),
            content_length=int(length_value)
            if length_value is not None and length_value.isdigit()
            else None,
            etag=header_map.get("etag"),
        )

    def _parse_included_response(
        self,
        value: str,
        *,
        operation: str,
    ) -> tuple[int | None, tuple[tuple[str, str], ...], Any]:
        normalized = value.replace("\r\n", "\n")
        matches = list(_HTTP_HEADER.finditer(normalized))
        if not matches:
            if not normalized.strip():
                return None, (), None
            return 200, (), self._decode_json(normalized, operation=operation)

        last = matches[-1]
        status = int(last.group(1))
        separator = normalized.find("\n\n", last.start())
        if separator < 0:
            header_text = normalized[last.start() :]
            body_text = ""
        else:
            header_text = normalized[last.start() : separator]
            body_text = normalized[separator + 2 :]
        headers: list[tuple[str, str]] = []
        for line in header_text.splitlines()[1:]:
            name, separator_text, raw_value = line.partition(":")
            normalized_name = name.strip().casefold()
            if separator_text and normalized_name in _SAFE_RESPONSE_HEADERS:
                headers.append(
                    (
                        normalized_name,
                        sanitize_cli_text(raw_value.strip(), maximum_length=500),
                    )
                )
        data: Any = None
        if body_text.strip():
            data = self._decode_json(body_text, operation=operation)
        return status, tuple(headers), data

    @staticmethod
    def _store_download(
        payload: bytes,
        destination: str | os.PathLike[str],
        *,
        resource_kind: str,
        resource_id: int,
        expected_digest: str | None,
        overwrite: bool,
        operation: str,
    ) -> DownloadReceipt:
        target = Path(destination).expanduser().resolve()
        if not target.name or not target.parent.is_dir():
            raise GitHubValidationError(
                "Download destination must be a file inside an existing directory.",
                operation=operation,
            )
        if target.exists() and not overwrite:
            raise GitHubValidationError(
                "Download destination already exists; choose a new path.",
                operation=operation,
            )

        actual_sha256 = hashlib.sha256(payload).hexdigest()
        verified = False
        if expected_digest:
            algorithm, separator, expected_value = expected_digest.partition(":")
            if algorithm.casefold() != "sha256" or not separator:
                raise GitHubResponseError(
                    "GitHub returned an unsupported download digest.",
                    operation=operation,
                )
            if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_value):
                raise GitHubResponseError(
                    "GitHub returned a malformed SHA-256 download digest.",
                    operation=operation,
                )
            if actual_sha256 != expected_value.casefold():
                raise GitHubResponseError(
                    "Downloaded bytes did not match GitHub's SHA-256 digest.",
                    operation=operation,
                )
            verified = True

        temporary_name: str | None = None
        try:
            with NamedTemporaryFile(
                mode="wb",
                dir=target.parent,
                prefix=f".{target.name}.",
                suffix=".part",
                delete=False,
            ) as temporary:
                temporary.write(payload)
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_name = temporary.name
            Path(temporary_name).replace(target)
            temporary_name = None
        finally:
            if temporary_name is not None:
                Path(temporary_name).unlink(missing_ok=True)

        return DownloadReceipt(
            resource_kind=resource_kind,
            resource_id=resource_id,
            destination=str(target),
            byte_count=len(payload),
            sha256=actual_sha256,
            verified=verified,
            expected_digest=expected_digest,
        )

    # Validation helpers -------------------------------------------------

    def _timeout(self, timeout_seconds: float | None) -> float:
        timeout = self._default_timeout_seconds if timeout_seconds is None else timeout_seconds
        if not math.isfinite(timeout) or timeout <= 0 or timeout > self._maximum_timeout_seconds:
            raise GitHubValidationError(
                "GitHub operation timeout must be positive and no greater than "
                f"{self._maximum_timeout_seconds:g} seconds."
            )
        return timeout

    @staticmethod
    def _positive_id(value: int, label: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise GitHubValidationError(f"{label.capitalize()} id must be positive.")
        return value

    @staticmethod
    def _limit(value: int) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 100:
            raise GitHubValidationError("List limit must be between 1 and 100.")
        return value

    @staticmethod
    def _collection_limit(value: int) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 1000:
            raise GitHubValidationError("Collection limit must be between 1 and 1000.")
        return value

    @staticmethod
    def _download_limit(
        value: int | None,
        *,
        ceiling: int,
        operation: str,
    ) -> int:
        normalized = ceiling if value is None else value
        if (
            isinstance(normalized, bool)
            or not isinstance(normalized, int)
            or not 1 <= normalized <= ceiling
        ):
            raise GitHubValidationError(
                f"Download limit must be between 1 and {ceiling} bytes.",
                operation=operation,
            )
        return normalized

    @staticmethod
    def _choice(value: str, choices: set[str] | frozenset[str], label: str) -> str:
        if value not in choices:
            rendered = ", ".join(sorted(choices))
            raise GitHubValidationError(f"Invalid {label}; expected one of: {rendered}.")
        return value

    def _title(self, value: str) -> str:
        return self._single_line(value, "title", maximum=256)

    def _body(self, value: str, *, maximum_bytes: int | None = None) -> str:
        limit = maximum_bytes or self._maximum_request_bytes
        if "\x00" in value:
            raise GitHubValidationError("Body cannot contain NUL characters.")
        size = len(value.encode("utf-8"))
        if size > limit:
            raise GitHubValidationError(f"Body exceeds the configured {limit}-byte limit.")
        return value

    def _nonempty_body(self, value: str) -> str:
        normalized = self._body(value)
        if not normalized.strip():
            raise GitHubValidationError("Comment body cannot be empty.")
        return normalized

    @staticmethod
    def _single_line(value: str, label: str, *, maximum: int) -> str:
        normalized = value.strip()
        if (
            not normalized
            or len(normalized) > maximum
            or any(ord(character) < 32 for character in normalized)
        ):
            raise GitHubValidationError(
                f"{label.capitalize()} must be a non-empty single line of at most "
                f"{maximum} characters."
            )
        return normalized

    def _ref(self, value: str, label: str) -> str:
        return self._single_line(value, label, maximum=255)

    @staticmethod
    def _sha(value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", normalized):
            raise GitHubValidationError("Commit SHA must contain 40 to 64 hex digits.")
        return normalized.lower()

    def _names(self, values: Sequence[str], label: str) -> list[str]:
        if len(values) > 100:
            raise GitHubValidationError(f"At most 100 {label}s are accepted.")
        return [self._single_line(value, label, maximum=100) for value in values]

    @staticmethod
    def _owner(value: str) -> str:
        normalized = value.strip()
        if not _PROJECT_OWNER.fullmatch(normalized):
            raise GitHubValidationError("Invalid GitHub owner name.")
        return normalized

    def _payload_text(self, payload: object, *, operation: str) -> str:
        try:
            rendered = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            )
        except (TypeError, ValueError) as error:
            raise GitHubValidationError(
                "Request body must be valid finite JSON.",
                operation=operation,
            ) from error
        actual_size = len(rendered.encode("utf-8"))
        if actual_size > self._maximum_request_bytes:
            raise GitHubValidationError(
                (
                    "Request body exceeds the configured limit "
                    f"({actual_size} bytes > {self._maximum_request_bytes} bytes)."
                ),
                operation=operation,
            )
        return rendered

    @staticmethod
    def _with_query(
        endpoint: str,
        query: Mapping[str, object] | None,
    ) -> str:
        if not query:
            return endpoint
        separator = "&" if "?" in endpoint else "?"
        return f"{endpoint}{separator}{urlencode(query)}"

    @staticmethod
    def _decode_json(value: str, *, operation: str) -> Any:
        try:
            return json.loads(value)
        except json.JSONDecodeError as error:
            raise GitHubResponseError(
                "GitHub CLI returned malformed JSON.",
                operation=operation,
            ) from error

    @staticmethod
    def _json_sequence(value: object, operation: str) -> Sequence[object]:
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            return value
        raise GitHubResponseError(
            "GitHub returned JSON with an unexpected list shape.",
            operation=operation,
        )

    @classmethod
    def _mapping_sequence(
        cls,
        value: object,
        key: str,
        operation: str,
    ) -> Sequence[object]:
        if not isinstance(value, Mapping):
            raise GitHubResponseError(
                "GitHub returned JSON with an unexpected object shape.",
                operation=operation,
            )
        return cls._json_sequence(value.get(key), operation)

    def _explorer_path(self, value: str) -> str:
        normalized = value.strip().lstrip("/")
        if (
            not normalized
            or len(normalized) > 2048
            or "://" in normalized
            or "\\" in normalized
            or any(ord(character) < 32 for character in normalized)
            or any(segment == ".." for segment in normalized.split("?")[0].split("/"))
            or normalized.split("?")[0].rstrip("/").casefold() == "graphql"
        ):
            raise GitHubUnsafeOperationError(
                "REST explorer path must be a relative GitHub API path.",
                operation="explore REST API",
            )
        if _SENSITIVE_QUERY.search(f"?{normalized.split('?', 1)[-1]}"):
            raise GitHubUnsafeOperationError(
                "Credentials and signatures are not accepted in explorer URLs.",
                operation="explore REST API",
            )
        return normalized

    def _ensure_explorer_payload_safe(
        self,
        value: object,
        *,
        depth: int = 0,
    ) -> None:
        if depth > 20:
            raise GitHubUnsafeOperationError(
                "Explorer body exceeds the configured nesting-depth limit.",
                operation="explore API",
            )
        if isinstance(value, Mapping):
            for key, nested in value.items():
                if _SENSITIVE_KEY.search(str(key)):
                    raise GitHubUnsafeOperationError(
                        "Credentials and secret fields are not accepted by the explorer.",
                        operation="explore API",
                    )
                self._ensure_explorer_payload_safe(nested, depth=depth + 1)
        elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            for nested in value:
                self._ensure_explorer_payload_safe(nested, depth=depth + 1)
        elif isinstance(value, str) and _SENSITIVE_VALUE.search(value):
            raise GitHubUnsafeOperationError(
                "Credential-shaped values are not accepted by the explorer.",
                operation="explore API",
            )

    @staticmethod
    def _graphql_depth(query: str) -> int:
        depth = 0
        maximum = 0
        in_string = False
        escaped = False
        for character in query:
            if in_string:
                if escaped:
                    escaped = False
                elif character == "\\":
                    escaped = True
                elif character == '"':
                    in_string = False
                continue
            if character == '"':
                in_string = True
            elif character == "{":
                depth += 1
                maximum = max(maximum, depth)
            elif character == "}":
                depth -= 1
                if depth < 0:
                    raise GitHubValidationError(
                        "GraphQL query has unbalanced braces.",
                        operation="explore GraphQL API",
                    )
        if in_string or depth != 0:
            raise GitHubValidationError(
                "GraphQL query has unterminated syntax.",
                operation="explore GraphQL API",
            )
        return maximum
