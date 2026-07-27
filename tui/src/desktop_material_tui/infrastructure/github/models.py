"""Typed GitHub domain models shared by the CLI adapter and application layer."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from .errors import GitHubResponseError, GitHubValidationError

_REPOSITORY_COMPONENT = re.compile(r"^[A-Za-z0-9_.-]+$")
_HOST = re.compile(r"^[A-Za-z0-9.-]+$")


def _mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _items(value: object) -> Sequence[object]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return value
    return ()


def _string(value: object, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _integer(value: object, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return default


def _boolean(value: object, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def _timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _first(mapping: Mapping[str, Any], *names: str) -> object:
    for name in names:
        if name in mapping:
            return mapping[name]
    return None


def _user(value: object) -> GitHubUser | None:
    mapping = _mapping(value)
    login = _string(mapping.get("login"))
    if not login:
        return None
    return GitHubUser(
        login=login,
        display_name=_optional_string(_first(mapping, "name", "displayName")),
        url=_optional_string(_first(mapping, "html_url", "url")),
        is_bot=_boolean(_first(mapping, "is_bot", "isBot")),
    )


def _labels(value: object) -> tuple[str, ...]:
    labels: list[str] = []
    for item in _items(value):
        candidate = item if isinstance(item, str) else _string(_mapping(item).get("name"))
        if candidate:
            labels.append(candidate)
    return tuple(labels)


def _users(value: object) -> tuple[GitHubUser, ...]:
    return tuple(user for item in _items(value) if (user := _user(item)) is not None)


def _required_mapping(value: object, *, operation: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise GitHubResponseError(
            "GitHub returned JSON with an unexpected shape.",
            operation=operation,
        )
    return value


class IssueState(str, Enum):
    """Supported issue lifecycle states."""

    OPEN = "OPEN"
    CLOSED = "CLOSED"


class PullRequestState(str, Enum):
    """Supported pull-request lifecycle states."""

    OPEN = "OPEN"
    CLOSED = "CLOSED"
    MERGED = "MERGED"


class ReviewDecision(str, Enum):
    """Events accepted by the GitHub pull-request review API."""

    APPROVE = "APPROVE"
    REQUEST_CHANGES = "REQUEST_CHANGES"
    COMMENT = "COMMENT"


class MergeMethod(str, Enum):
    """GitHub pull-request merge strategies."""

    MERGE = "merge"
    SQUASH = "squash"
    REBASE = "rebase"


@dataclass(frozen=True)
class RepositoryRef:
    """A validated repository coordinate."""

    owner: str
    name: str
    host: str = "github.com"

    def __post_init__(self) -> None:
        for label, value, maximum in (
            ("owner", self.owner, 100),
            ("repository", self.name, 100),
        ):
            if not value or len(value) > maximum or not _REPOSITORY_COMPONENT.fullmatch(value):
                raise GitHubValidationError(f"Invalid GitHub {label} name.")
        if (
            not self.host
            or len(self.host) > 253
            or not _HOST.fullmatch(self.host)
            or ".." in self.host
        ):
            raise GitHubValidationError("Invalid GitHub host name.")

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"

    @property
    def qualified_slug(self) -> str:
        if self.host.casefold() == "github.com":
            return self.slug
        return f"{self.host}/{self.slug}"

    @classmethod
    def parse(cls, value: str, *, default_host: str = "github.com") -> RepositoryRef:
        components = value.strip().strip("/").split("/")
        if len(components) == 2:
            return cls(components[0], components[1], default_host)
        if len(components) == 3:
            return cls(components[1], components[2], components[0])
        raise GitHubValidationError("Repository must be OWNER/NAME or HOST/OWNER/NAME.")


@dataclass(frozen=True)
class GitHubUser:
    login: str
    display_name: str | None = None
    url: str | None = None
    is_bot: bool = False


@dataclass(frozen=True)
class GitHubAuthStatus:
    host: str
    authenticated: bool
    login: str | None
    scopes: tuple[str, ...]


@dataclass(frozen=True)
class IssueComment:
    id: str
    body: str
    author: GitHubUser | None
    created_at: datetime | None
    updated_at: datetime | None
    url: str | None

    @classmethod
    def from_json(cls, value: object) -> IssueComment:
        mapping = _required_mapping(value, operation="parse issue comment")
        return cls(
            id=str(_first(mapping, "id", "databaseId") or ""),
            body=_string(mapping.get("body")),
            author=_user(_first(mapping, "author", "user")),
            created_at=_timestamp(_first(mapping, "createdAt", "created_at")),
            updated_at=_timestamp(_first(mapping, "updatedAt", "updated_at")),
            url=_optional_string(_first(mapping, "url", "html_url")),
        )


@dataclass(frozen=True)
class Issue:
    number: int
    title: str
    body: str
    state: IssueState
    url: str
    author: GitHubUser | None
    labels: tuple[str, ...]
    assignees: tuple[GitHubUser, ...]
    created_at: datetime | None
    updated_at: datetime | None
    closed_at: datetime | None
    comments: tuple[IssueComment, ...] = ()

    @classmethod
    def from_json(cls, value: object) -> Issue:
        mapping = _required_mapping(value, operation="parse issue")
        raw_state = _string(mapping.get("state"), "OPEN").upper()
        state = IssueState.CLOSED if raw_state == "CLOSED" else IssueState.OPEN
        return cls(
            number=_integer(mapping.get("number")),
            title=_string(mapping.get("title")),
            body=_string(mapping.get("body")),
            state=state,
            url=_string(_first(mapping, "url", "html_url")),
            author=_user(_first(mapping, "author", "user")),
            labels=_labels(mapping.get("labels")),
            assignees=_users(mapping.get("assignees")),
            created_at=_timestamp(_first(mapping, "createdAt", "created_at")),
            updated_at=_timestamp(_first(mapping, "updatedAt", "updated_at")),
            closed_at=_timestamp(_first(mapping, "closedAt", "closed_at")),
            comments=tuple(
                IssueComment.from_json(item) for item in _items(mapping.get("comments"))
            ),
        )


@dataclass(frozen=True)
class PullRequestReview:
    id: str
    state: str
    body: str
    author: GitHubUser | None
    submitted_at: datetime | None
    url: str | None

    @classmethod
    def from_json(cls, value: object) -> PullRequestReview:
        mapping = _required_mapping(value, operation="parse pull-request review")
        return cls(
            id=str(_first(mapping, "id", "databaseId") or ""),
            state=_string(mapping.get("state")).upper(),
            body=_string(mapping.get("body")),
            author=_user(_first(mapping, "author", "user")),
            submitted_at=_timestamp(_first(mapping, "submittedAt", "submitted_at")),
            url=_optional_string(_first(mapping, "url", "html_url")),
        )


@dataclass(frozen=True)
class PullRequest:
    number: int
    title: str
    body: str
    state: PullRequestState
    url: str
    author: GitHubUser | None
    head_ref: str
    head_sha: str | None
    base_ref: str
    draft: bool
    merge_state_status: str | None
    review_decision: str | None
    created_at: datetime | None
    updated_at: datetime | None
    merged_at: datetime | None
    comments: tuple[IssueComment, ...] = ()
    reviews: tuple[PullRequestReview, ...] = ()

    @classmethod
    def from_json(cls, value: object) -> PullRequest:
        mapping = _required_mapping(value, operation="parse pull request")
        merged_at = _timestamp(_first(mapping, "mergedAt", "merged_at"))
        raw_state = _string(mapping.get("state"), "OPEN").upper()
        if merged_at is not None or raw_state == "MERGED":
            state = PullRequestState.MERGED
        elif raw_state == "CLOSED":
            state = PullRequestState.CLOSED
        else:
            state = PullRequestState.OPEN

        head = _mapping(mapping.get("head"))
        base = _mapping(mapping.get("base"))
        return cls(
            number=_integer(mapping.get("number")),
            title=_string(mapping.get("title")),
            body=_string(mapping.get("body")),
            state=state,
            url=_string(_first(mapping, "url", "html_url")),
            author=_user(_first(mapping, "author", "user")),
            head_ref=_string(_first(mapping, "headRefName", "head_ref"))
            or _string(head.get("ref")),
            head_sha=_optional_string(_first(mapping, "headRefOid", "head_sha"))
            or _optional_string(head.get("sha")),
            base_ref=_string(_first(mapping, "baseRefName", "base_ref"))
            or _string(base.get("ref")),
            draft=_boolean(_first(mapping, "isDraft", "draft")),
            merge_state_status=_optional_string(
                _first(mapping, "mergeStateStatus", "mergeable_state")
            ),
            review_decision=_optional_string(_first(mapping, "reviewDecision", "review_decision")),
            created_at=_timestamp(_first(mapping, "createdAt", "created_at")),
            updated_at=_timestamp(_first(mapping, "updatedAt", "updated_at")),
            merged_at=merged_at,
            comments=tuple(
                IssueComment.from_json(item) for item in _items(mapping.get("comments"))
            ),
            reviews=tuple(
                PullRequestReview.from_json(item) for item in _items(mapping.get("reviews"))
            ),
        )


@dataclass(frozen=True)
class PullRequestMergeResult:
    merged: bool
    message: str
    sha: str | None

    @classmethod
    def from_json(cls, value: object) -> PullRequestMergeResult:
        mapping = _required_mapping(value, operation="parse pull-request merge")
        return cls(
            merged=_boolean(mapping.get("merged")),
            message=_string(mapping.get("message")),
            sha=_optional_string(mapping.get("sha")),
        )


@dataclass(frozen=True)
class Workflow:
    id: int
    name: str
    state: str
    path: str
    url: str | None
    created_at: datetime | None
    updated_at: datetime | None

    @classmethod
    def from_json(cls, value: object) -> Workflow:
        mapping = _required_mapping(value, operation="parse workflow")
        return cls(
            id=_integer(mapping.get("id")),
            name=_string(mapping.get("name")),
            state=_string(mapping.get("state")),
            path=_string(mapping.get("path")),
            url=_optional_string(_first(mapping, "html_url", "url")),
            created_at=_timestamp(_first(mapping, "created_at", "createdAt")),
            updated_at=_timestamp(_first(mapping, "updated_at", "updatedAt")),
        )


@dataclass(frozen=True)
class WorkflowStep:
    number: int
    name: str
    status: str
    conclusion: str | None
    started_at: datetime | None
    completed_at: datetime | None

    @classmethod
    def from_json(cls, value: object) -> WorkflowStep:
        mapping = _required_mapping(value, operation="parse workflow step")
        return cls(
            number=_integer(mapping.get("number")),
            name=_string(mapping.get("name")),
            status=_string(mapping.get("status")),
            conclusion=_optional_string(mapping.get("conclusion")),
            started_at=_timestamp(_first(mapping, "started_at", "startedAt")),
            completed_at=_timestamp(_first(mapping, "completed_at", "completedAt")),
        )


@dataclass(frozen=True)
class WorkflowRun:
    id: int
    name: str
    display_title: str
    event: str
    status: str
    conclusion: str | None
    branch: str | None
    head_sha: str
    attempt: int
    created_at: datetime | None
    updated_at: datetime | None
    url: str | None

    @classmethod
    def from_json(cls, value: object) -> WorkflowRun:
        mapping = _required_mapping(value, operation="parse workflow run")
        return cls(
            id=_integer(_first(mapping, "id", "databaseId")),
            name=_string(_first(mapping, "name", "workflowName")),
            display_title=_string(_first(mapping, "display_title", "displayTitle")),
            event=_string(mapping.get("event")),
            status=_string(mapping.get("status")),
            conclusion=_optional_string(mapping.get("conclusion")),
            branch=_optional_string(_first(mapping, "head_branch", "headBranch")),
            head_sha=_string(_first(mapping, "head_sha", "headSha")),
            attempt=_integer(_first(mapping, "run_attempt", "attempt"), 1),
            created_at=_timestamp(_first(mapping, "created_at", "createdAt")),
            updated_at=_timestamp(_first(mapping, "updated_at", "updatedAt")),
            url=_optional_string(_first(mapping, "html_url", "url")),
        )


@dataclass(frozen=True)
class WorkflowJob:
    id: int
    name: str
    status: str
    conclusion: str | None
    started_at: datetime | None
    completed_at: datetime | None
    url: str | None
    runner_name: str | None
    steps: tuple[WorkflowStep, ...]

    @classmethod
    def from_json(cls, value: object) -> WorkflowJob:
        mapping = _required_mapping(value, operation="parse workflow job")
        return cls(
            id=_integer(_first(mapping, "id", "databaseId")),
            name=_string(mapping.get("name")),
            status=_string(mapping.get("status")),
            conclusion=_optional_string(mapping.get("conclusion")),
            started_at=_timestamp(_first(mapping, "started_at", "startedAt")),
            completed_at=_timestamp(_first(mapping, "completed_at", "completedAt")),
            url=_optional_string(_first(mapping, "html_url", "url")),
            runner_name=_optional_string(_first(mapping, "runner_name", "runnerName")),
            steps=tuple(WorkflowStep.from_json(item) for item in _items(mapping.get("steps"))),
        )


@dataclass(frozen=True)
class WorkflowLogMetadata:
    resource_kind: str
    resource_id: int
    api_path: str
    available: bool
    http_status: int | None
    content_type: str | None
    content_length: int | None
    etag: str | None


@dataclass(frozen=True)
class ActionReceipt:
    operation: str
    accepted: bool
    resource_url: str | None = None


@dataclass(frozen=True)
class ReleaseAsset:
    id: int
    name: str
    label: str
    state: str
    size: int
    download_count: int
    content_type: str | None
    digest: str | None
    created_at: datetime | None
    updated_at: datetime | None
    url: str | None

    @classmethod
    def from_json(cls, value: object) -> ReleaseAsset:
        mapping = _required_mapping(value, operation="parse release asset")
        return cls(
            id=_integer(mapping.get("id")),
            name=_string(mapping.get("name")),
            label=_string(mapping.get("label")),
            state=_string(mapping.get("state")),
            size=_integer(mapping.get("size")),
            download_count=_integer(_first(mapping, "download_count", "downloadCount")),
            content_type=_optional_string(_first(mapping, "content_type", "contentType")),
            digest=_optional_string(mapping.get("digest")),
            created_at=_timestamp(_first(mapping, "created_at", "createdAt")),
            updated_at=_timestamp(_first(mapping, "updated_at", "updatedAt")),
            url=_optional_string(_first(mapping, "browser_download_url", "url")),
        )


@dataclass(frozen=True)
class Release:
    id: int
    tag_name: str
    name: str
    body: str
    draft: bool
    prerelease: bool
    target_commitish: str
    published_at: datetime | None
    created_at: datetime | None
    url: str | None
    assets: tuple[ReleaseAsset, ...]

    @classmethod
    def from_json(cls, value: object) -> Release:
        mapping = _required_mapping(value, operation="parse release")
        return cls(
            id=_integer(mapping.get("id")),
            tag_name=_string(_first(mapping, "tag_name", "tagName")),
            name=_string(mapping.get("name")),
            body=_string(mapping.get("body")),
            draft=_boolean(_first(mapping, "draft", "isDraft")),
            prerelease=_boolean(_first(mapping, "prerelease", "isPrerelease")),
            target_commitish=_string(_first(mapping, "target_commitish", "targetCommitish")),
            published_at=_timestamp(_first(mapping, "published_at", "publishedAt")),
            created_at=_timestamp(_first(mapping, "created_at", "createdAt")),
            url=_optional_string(_first(mapping, "html_url", "url")),
            assets=tuple(ReleaseAsset.from_json(item) for item in _items(mapping.get("assets"))),
        )


@dataclass(frozen=True)
class PackageVersion:
    id: int
    name: str
    url: str | None
    created_at: datetime | None
    updated_at: datetime | None
    metadata: Mapping[str, Any]

    @classmethod
    def from_json(cls, value: object) -> PackageVersion:
        mapping = _required_mapping(value, operation="parse package version")
        return cls(
            id=_integer(mapping.get("id")),
            name=_string(mapping.get("name")),
            url=_optional_string(_first(mapping, "html_url", "url")),
            created_at=_timestamp(_first(mapping, "created_at", "createdAt")),
            updated_at=_timestamp(_first(mapping, "updated_at", "updatedAt")),
            metadata=_mapping(mapping.get("metadata")),
        )


@dataclass(frozen=True)
class Package:
    id: int
    name: str
    package_type: str
    visibility: str
    url: str | None
    owner: GitHubUser | None
    version_count: int
    created_at: datetime | None
    updated_at: datetime | None

    @classmethod
    def from_json(cls, value: object) -> Package:
        mapping = _required_mapping(value, operation="parse package")
        return cls(
            id=_integer(mapping.get("id")),
            name=_string(mapping.get("name")),
            package_type=_string(_first(mapping, "package_type", "packageType")),
            visibility=_string(mapping.get("visibility")),
            url=_optional_string(_first(mapping, "html_url", "url")),
            owner=_user(mapping.get("owner")),
            version_count=_integer(_first(mapping, "version_count", "versionCount")),
            created_at=_timestamp(_first(mapping, "created_at", "createdAt")),
            updated_at=_timestamp(_first(mapping, "updated_at", "updatedAt")),
        )


@dataclass(frozen=True)
class Project:
    number: int
    title: str
    short_description: str
    closed: bool
    url: str | None
    owner_login: str | None
    updated_at: datetime | None

    @classmethod
    def from_json(cls, value: object) -> Project:
        mapping = _required_mapping(value, operation="parse project")
        owner = _mapping(mapping.get("owner"))
        return cls(
            number=_integer(_first(mapping, "number", "id")),
            title=_string(mapping.get("title")),
            short_description=_string(_first(mapping, "shortDescription", "short_description")),
            closed=_boolean(mapping.get("closed")),
            url=_optional_string(mapping.get("url")),
            owner_login=_optional_string(_first(owner, "login", "name")),
            updated_at=_timestamp(_first(mapping, "updatedAt", "updated_at")),
        )


@dataclass(frozen=True)
class ExplorerResponse:
    method: str
    path: str
    status: int | None
    headers: tuple[tuple[str, str], ...]
    data: Any
