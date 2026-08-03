"""Repository-scoped application facade for GitHub workflows."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from desktop_material_tui.infrastructure.github import (
    ActionReceipt,
    ExplorerResponse,
    GhClient,
    GitHubAuthStatus,
    Issue,
    IssueComment,
    IssueState,
    MergeMethod,
    Package,
    PackageVersion,
    Project,
    PullRequest,
    PullRequestMergeResult,
    PullRequestReview,
    Release,
    ReleaseAsset,
    RepositoryRef,
    ReviewDecision,
    Workflow,
    WorkflowJob,
    WorkflowLogMetadata,
    WorkflowRun,
)
from desktop_material_tui.infrastructure.github.models import (
    ActionsCache,
    DownloadReceipt,
    EffectiveBranchRule,
    PullRequestCheck,
    PullRequestFile,
    PullRequestReviewComment,
    RepositoryNotification,
    WorkflowArtifact,
    WorkflowLogContent,
)


class GitHubService:
    """Expose GitHub operations for one repository without UI dependencies."""

    def __init__(
        self,
        repository: RepositoryRef,
        client: GhClient | None = None,
    ) -> None:
        self._repository = repository
        self._client = client or GhClient()

    @classmethod
    def from_slug(
        cls,
        repository: str,
        *,
        client: GhClient | None = None,
        default_host: str = "github.com",
    ) -> GitHubService:
        return cls(
            RepositoryRef.parse(repository, default_host=default_host),
            client=client,
        )

    @property
    def repository(self) -> RepositoryRef:
        return self._repository

    def auth_status(self, *, timeout_seconds: float | None = None) -> GitHubAuthStatus:
        return self._client.auth_status(
            host=self._repository.host,
            timeout_seconds=timeout_seconds,
        )

    def require_auth(
        self,
        scopes: Sequence[str] = (),
        *,
        timeout_seconds: float | None = None,
    ) -> GitHubAuthStatus:
        return self._client.require_auth(
            host=self._repository.host,
            scopes=scopes,
            timeout_seconds=timeout_seconds,
        )

    # Issues

    def list_issues(
        self,
        *,
        state: str = "open",
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Issue, ...]:
        return self._client.list_issues(
            self._repository,
            state=state,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_issue(
        self,
        number: int,
        *,
        timeout_seconds: float | None = None,
    ) -> Issue:
        return self._client.get_issue(
            self._repository,
            number,
            timeout_seconds=timeout_seconds,
        )

    def create_issue(
        self,
        *,
        title: str,
        body: str = "",
        labels: Sequence[str] = (),
        assignees: Sequence[str] = (),
        timeout_seconds: float | None = None,
    ) -> Issue:
        return self._client.create_issue(
            self._repository,
            title=title,
            body=body,
            labels=labels,
            assignees=assignees,
            timeout_seconds=timeout_seconds,
        )

    def comment_issue(
        self,
        number: int,
        body: str,
        *,
        timeout_seconds: float | None = None,
    ) -> IssueComment:
        return self._client.comment_issue(
            self._repository,
            number,
            body,
            timeout_seconds=timeout_seconds,
        )

    def update_issue(
        self,
        number: int,
        *,
        title: str | None = None,
        body: str | None = None,
        state: str | IssueState | None = None,
        labels: Sequence[str] | None = None,
        assignees: Sequence[str] | None = None,
        timeout_seconds: float | None = None,
    ) -> Issue:
        return self._client.update_issue(
            self._repository,
            number,
            title=title,
            body=body,
            state=state,
            labels=labels,
            assignees=assignees,
            timeout_seconds=timeout_seconds,
        )

    def close_issue(
        self,
        number: int,
        *,
        reason: str = "completed",
        timeout_seconds: float | None = None,
    ) -> Issue:
        return self._client.close_issue(
            self._repository,
            number,
            reason=reason,
            timeout_seconds=timeout_seconds,
        )

    # Pull requests

    def list_pull_requests(
        self,
        *,
        state: str = "open",
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequest, ...]:
        return self._client.list_pull_requests(
            self._repository,
            state=state,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_pull_request(
        self,
        number: int,
        *,
        timeout_seconds: float | None = None,
    ) -> PullRequest:
        return self._client.get_pull_request(
            self._repository,
            number,
            timeout_seconds=timeout_seconds,
        )

    def create_pull_request(
        self,
        *,
        title: str,
        head: str,
        base: str,
        body: str = "",
        draft: bool = False,
        maintainer_can_modify: bool = True,
        timeout_seconds: float | None = None,
    ) -> PullRequest:
        return self._client.create_pull_request(
            self._repository,
            title=title,
            head=head,
            base=base,
            body=body,
            draft=draft,
            maintainer_can_modify=maintainer_can_modify,
            timeout_seconds=timeout_seconds,
        )

    def review_pull_request(
        self,
        number: int,
        *,
        event: str | ReviewDecision,
        body: str = "",
        commit_id: str | None = None,
        timeout_seconds: float | None = None,
    ) -> PullRequestReview:
        return self._client.review_pull_request(
            self._repository,
            number,
            event=event,
            body=body,
            commit_id=commit_id,
            timeout_seconds=timeout_seconds,
        )

    def merge_pull_request(
        self,
        number: int,
        *,
        method: str | MergeMethod = MergeMethod.MERGE,
        commit_title: str | None = None,
        commit_message: str | None = None,
        expected_head_sha: str | None = None,
        timeout_seconds: float | None = None,
    ) -> PullRequestMergeResult:
        return self._client.merge_pull_request(
            self._repository,
            number,
            method=method,
            commit_title=commit_title,
            commit_message=commit_message,
            expected_head_sha=expected_head_sha,
            timeout_seconds=timeout_seconds,
        )

    def comment_pull_request(
        self,
        number: int,
        body: str,
        *,
        timeout_seconds: float | None = None,
    ) -> IssueComment:
        return self._client.comment_pull_request(
            self._repository,
            number,
            body,
            timeout_seconds=timeout_seconds,
        )

    def list_pull_request_files(
        self,
        number: int,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequestFile, ...]:
        return self._client.list_pull_request_files(
            self._repository,
            number,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def list_pull_request_checks(
        self,
        ref: str,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequestCheck, ...]:
        return self._client.list_pull_request_checks(
            self._repository,
            ref,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def list_pull_request_review_comments(
        self,
        number: int,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[PullRequestReviewComment, ...]:
        return self._client.list_pull_request_review_comments(
            self._repository,
            number,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def create_pull_request_review_comment(
        self,
        number: int,
        *,
        body: str,
        commit_id: str,
        path: str,
        line: int,
        side: str,
        timeout_seconds: float | None = None,
    ) -> PullRequestReviewComment:
        return self._client.create_pull_request_review_comment(
            self._repository,
            number,
            body=body,
            commit_id=commit_id,
            path=path,
            line=line,
            side=side,
            timeout_seconds=timeout_seconds,
        )

    def list_effective_branch_rules(
        self,
        branch: str,
        *,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[EffectiveBranchRule, ...]:
        return self._client.list_effective_branch_rules(
            self._repository,
            branch,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def list_repository_notifications(
        self,
        *,
        all_notifications: bool = True,
        participating: bool = False,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[RepositoryNotification, ...]:
        return self._client.list_repository_notifications(
            self._repository,
            all_notifications=all_notifications,
            participating=participating,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def mark_notification_read(
        self,
        thread_id: str,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        return self._client.mark_notification_read(
            self._repository,
            thread_id,
            timeout_seconds=timeout_seconds,
        )

    # Actions

    def list_workflows(
        self,
        *,
        limit: int = 100,
        timeout_seconds: float | None = None,
    ) -> tuple[Workflow, ...]:
        return self._client.list_workflows(
            self._repository,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def list_workflow_runs(
        self,
        *,
        workflow_id: int | str | None = None,
        branch: str | None = None,
        event: str | None = None,
        status: str | None = None,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[WorkflowRun, ...]:
        return self._client.list_workflow_runs(
            self._repository,
            workflow_id=workflow_id,
            branch=branch,
            event=event,
            status=status,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_workflow_run(
        self,
        run_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowRun:
        return self._client.get_workflow_run(
            self._repository,
            run_id,
            timeout_seconds=timeout_seconds,
        )

    def list_workflow_jobs(
        self,
        run_id: int,
        *,
        limit: int = 100,
        timeout_seconds: float | None = None,
    ) -> tuple[WorkflowJob, ...]:
        return self._client.list_workflow_jobs(
            self._repository,
            run_id,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_run_log_metadata(
        self,
        run_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowLogMetadata:
        return self._client.get_run_log_metadata(
            self._repository,
            run_id,
            timeout_seconds=timeout_seconds,
        )

    def get_job_log_metadata(
        self,
        job_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowLogMetadata:
        return self._client.get_job_log_metadata(
            self._repository,
            job_id,
            timeout_seconds=timeout_seconds,
        )

    def get_job_log(
        self,
        job_id: int,
        *,
        maximum_bytes: int | None = None,
        timeout_seconds: float | None = None,
    ) -> WorkflowLogContent:
        return self._client.get_job_log(
            self._repository,
            job_id,
            maximum_bytes=maximum_bytes,
            timeout_seconds=timeout_seconds,
        )

    def list_actions_caches(
        self,
        *,
        key: str | None = None,
        ref: str | None = None,
        sort: str = "last_accessed_at",
        direction: str = "desc",
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[ActionsCache, ...]:
        return self._client.list_actions_caches(
            self._repository,
            key=key,
            ref=ref,
            sort=sort,
            direction=direction,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def delete_actions_cache(
        self,
        cache_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        return self._client.delete_actions_cache(
            self._repository,
            cache_id,
            timeout_seconds=timeout_seconds,
        )

    def list_workflow_artifacts(
        self,
        *,
        run_id: int | None = None,
        name: str | None = None,
        limit: int = 500,
        timeout_seconds: float | None = None,
    ) -> tuple[WorkflowArtifact, ...]:
        return self._client.list_workflow_artifacts(
            self._repository,
            run_id=run_id,
            name=name,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_workflow_artifact(
        self,
        artifact_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> WorkflowArtifact:
        return self._client.get_workflow_artifact(
            self._repository,
            artifact_id,
            timeout_seconds=timeout_seconds,
        )

    def download_workflow_artifact(
        self,
        artifact_id: int,
        destination: str,
        *,
        maximum_bytes: int | None = None,
        overwrite: bool = False,
        timeout_seconds: float | None = None,
    ) -> DownloadReceipt:
        return self._client.download_workflow_artifact(
            self._repository,
            artifact_id,
            destination,
            maximum_bytes=maximum_bytes,
            overwrite=overwrite,
            timeout_seconds=timeout_seconds,
        )

    def dispatch_workflow(
        self,
        workflow_id: int | str,
        *,
        ref: str,
        inputs: Mapping[str, str] | None = None,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        return self._client.dispatch_workflow(
            self._repository,
            workflow_id,
            ref=ref,
            inputs=inputs,
            timeout_seconds=timeout_seconds,
        )

    def rerun_workflow(
        self,
        run_id: int,
        *,
        failed_only: bool = False,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        return self._client.rerun_workflow(
            self._repository,
            run_id,
            failed_only=failed_only,
            timeout_seconds=timeout_seconds,
        )

    def cancel_workflow(
        self,
        run_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        return self._client.cancel_workflow(
            self._repository,
            run_id,
            timeout_seconds=timeout_seconds,
        )

    # Releases

    def list_releases(
        self,
        *,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Release, ...]:
        return self._client.list_releases(
            self._repository,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_release(
        self,
        tag: str,
        *,
        timeout_seconds: float | None = None,
    ) -> Release:
        return self._client.get_release(
            self._repository,
            tag,
            timeout_seconds=timeout_seconds,
        )

    def list_release_assets(
        self,
        release_id: int,
        *,
        limit: int = 100,
        timeout_seconds: float | None = None,
    ) -> tuple[ReleaseAsset, ...]:
        return self._client.list_release_assets(
            self._repository,
            release_id,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_release_asset(
        self,
        asset_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ReleaseAsset:
        return self._client.get_release_asset(
            self._repository,
            asset_id,
            timeout_seconds=timeout_seconds,
        )

    def create_release(
        self,
        *,
        tag_name: str,
        target_commitish: str,
        name: str,
        body: str = "",
        draft: bool = True,
        prerelease: bool = False,
        timeout_seconds: float | None = None,
    ) -> Release:
        return self._client.create_release(
            self._repository,
            tag_name=tag_name,
            target_commitish=target_commitish,
            name=name,
            body=body,
            draft=draft,
            prerelease=prerelease,
            timeout_seconds=timeout_seconds,
        )

    def update_release(
        self,
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
        return self._client.update_release(
            self._repository,
            release_id,
            tag_name=tag_name,
            target_commitish=target_commitish,
            name=name,
            body=body,
            draft=draft,
            prerelease=prerelease,
            timeout_seconds=timeout_seconds,
        )

    def delete_release(
        self,
        release_id: int,
        *,
        timeout_seconds: float | None = None,
    ) -> ActionReceipt:
        return self._client.delete_release(
            self._repository,
            release_id,
            timeout_seconds=timeout_seconds,
        )

    def download_release_asset(
        self,
        asset_id: int,
        destination: str,
        *,
        maximum_bytes: int | None = None,
        overwrite: bool = False,
        timeout_seconds: float | None = None,
    ) -> DownloadReceipt:
        return self._client.download_release_asset(
            self._repository,
            asset_id,
            destination,
            maximum_bytes=maximum_bytes,
            overwrite=overwrite,
            timeout_seconds=timeout_seconds,
        )

    # Packages and Projects

    def list_packages(
        self,
        *,
        owner: str | None = None,
        owner_kind: str = "orgs",
        package_type: str = "container",
        visibility: str | None = None,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Package, ...]:
        return self._client.list_packages(
            self._repository,
            owner=owner,
            owner_kind=owner_kind,
            package_type=package_type,
            visibility=visibility,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_package(
        self,
        package_name: str,
        *,
        owner: str | None = None,
        owner_kind: str = "orgs",
        package_type: str = "container",
        timeout_seconds: float | None = None,
    ) -> Package:
        return self._client.get_package(
            self._repository,
            package_name,
            owner=owner,
            owner_kind=owner_kind,
            package_type=package_type,
            timeout_seconds=timeout_seconds,
        )

    def list_package_versions(
        self,
        package_name: str,
        *,
        owner: str | None = None,
        owner_kind: str = "orgs",
        package_type: str = "container",
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[PackageVersion, ...]:
        return self._client.list_package_versions(
            self._repository,
            package_name,
            owner=owner,
            owner_kind=owner_kind,
            package_type=package_type,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def list_projects(
        self,
        *,
        owner: str | None = None,
        limit: int = 50,
        timeout_seconds: float | None = None,
    ) -> tuple[Project, ...]:
        return self._client.list_projects(
            self._repository,
            owner=owner,
            limit=limit,
            timeout_seconds=timeout_seconds,
        )

    def get_project(
        self,
        number: int,
        *,
        owner: str | None = None,
        timeout_seconds: float | None = None,
    ) -> Project:
        return self._client.get_project(
            self._repository,
            number,
            owner=owner,
            timeout_seconds=timeout_seconds,
        )

    # Bounded API explorers

    def explore_rest(
        self,
        *,
        method: str,
        path: str,
        body: Mapping[str, Any] | Sequence[Any] | None = None,
        confirm_mutation: bool = False,
        timeout_seconds: float | None = None,
    ) -> ExplorerResponse:
        return self._client.explore_rest(
            self._repository,
            method=method,
            path=path,
            body=body,
            confirm_mutation=confirm_mutation,
            timeout_seconds=timeout_seconds,
        )

    def explore_graphql(
        self,
        *,
        query: str,
        variables: Mapping[str, Any] | None = None,
        confirm_mutation: bool = False,
        timeout_seconds: float | None = None,
    ) -> ExplorerResponse:
        return self._client.explore_graphql(
            self._repository,
            query=query,
            variables=variables,
            confirm_mutation=confirm_mutation,
            timeout_seconds=timeout_seconds,
        )
