"""GitHub issues, pull requests, Actions, releases, packages, Projects, and API UI."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Callable
from typing import Any, TypeVar

from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.widget import Widget
from textual.widgets import (
    Button,
    DataTable,
    Input,
    Select,
    Static,
    TabbedContent,
    TabPane,
    TextArea,
)

from ...application.search import RegexFlags, SearchMode, SearchService
from ..action_flight import single_flight_actions
from ..widgets.responsive_layout import ResponsiveFormRow, ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState
from .dialogs import DecisionDialog

_HTTPS_REMOTE = re.compile(
    r"^https?://(?P<host>[^/]+)/(?P<owner>[^/]+)/(?P<name>[^/]+?)(?:\.git)?/?$"
)
_SSH_REMOTE = re.compile(
    r"^(?:ssh://)?git@(?P<host>[^/:]+)(?::|/)(?P<owner>[^/]+)/(?P<name>[^/]+?)(?:\.git)?/?$"
)


def _field(value: object, name: str, default: Any = "") -> Any:
    return getattr(value, name, default)


def _state(value: object) -> str:
    state = _field(value, "state", "")
    return str(getattr(state, "value", state))


def _filtered(
    items: list[object],
    state: SearchState,
    *fields: str,
) -> tuple[object, ...]:
    """Filter GitHub models through the same bounded search contract."""

    try:
        mode = SearchMode(state.mode)
    except ValueError:
        mode = SearchMode.LITERAL
    flags = RegexFlags(
        ignore_case=not state.case_sensitive or "i" in state.flags,
        multiline="m" in state.flags,
        dot_all="s" in state.flags,
    )
    result = SearchService().search(
        items,
        state.query,
        mode=mode,
        flags=flags,
        get_text=lambda item: tuple(str(_field(item, field, "")) for field in fields),
    )
    return result.items if result.error is None else tuple(items)


def _source_index(table: DataTable[str]) -> int | None:
    if table.row_count == 0:
        return None
    try:
        source_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
        return int(source_key) if source_key is not None else None
    except (KeyError, TypeError, ValueError):
        return None


_W = TypeVar("_W", bound=Widget)


class GitHubPane(Vertical):
    """Networked GitHub workspace backed by the authenticated `gh` CLI."""

    git_service: Any | None = None
    github: Any | None = None
    issues: list[object]
    pull_requests: list[object]
    pull_request_files: list[object]
    pull_request_checks: list[object]
    pull_request_review_comments: list[object]
    effective_branch_rules: list[object]
    repository_notifications: list[object]
    current_pull_request: object | None
    workflows: list[object]
    runs: list[object]
    jobs: list[object]
    caches: list[object]
    artifacts: list[object]
    releases: list[object]
    release_assets: list[object]
    packages: list[object]
    package_versions: list[object]
    projects: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.issues = []
        self.pull_requests = []
        self.pull_request_files = []
        self.pull_request_checks = []
        self.pull_request_review_comments = []
        self.effective_branch_rules = []
        self.repository_notifications = []
        self.current_pull_request = None
        self.workflows = []
        self.runs = []
        self.jobs = []
        self.caches = []
        self.artifacts = []
        self.releases = []
        self.release_assets = []
        self.packages = []
        self.package_versions = []
        self.projects = []

    def compose(self) -> ComposeResult:
        yield Static(
            "Open a GitHub-backed repository to connect.",
            id="github-status",
        )
        with TabbedContent(initial="github-issues", id="github-tabs"):
            with TabPane("Issues", id="github-issues"):
                yield SearchBar(
                    surface_id="github-issues",
                    placeholder="Search issues…",
                    id="github-issues-search",
                )
                with ScrollableToolbar():
                    yield Button("Refresh", id="issues-refresh")
                    yield Button("Close…", id="issue-close", variant="error")
                with Horizontal(classes="screen-split"):
                    yield DataTable(
                        cursor_type="row",
                        zebra_stripes=True,
                        id="issues-table",
                        classes="screen-list",
                    )
                    yield TextArea(
                        "Select an issue.",
                        read_only=True,
                        id="issue-detail",
                        classes="screen-detail",
                    )
                with Vertical(classes="form-panel"):
                    yield Input(
                        placeholder="New issue title",
                        id="issue-title",
                        select_on_focus=False,
                    )
                    yield TextArea(
                        "",
                        placeholder="Issue body",
                        id="issue-body",
                        tab_behavior="focus",
                    )
                    with ResponsiveFormRow():
                        yield Button("Create issue", id="issue-create", variant="primary")
                        yield Input(
                            placeholder="Comment on selected issue",
                            id="issue-comment-body",
                            select_on_focus=False,
                        )
                        yield Button("Comment", id="issue-comment")

            with TabPane("Pull requests", id="github-pull-requests"):  # noqa: SIM117
                with TabbedContent(initial="pr-review", id="github-pr-tabs"):
                    with TabPane("Review", id="pr-review"):
                        yield SearchBar(
                            surface_id="github-pull-requests",
                            placeholder="Search pull requests…",
                            id="github-pr-search",
                        )
                        with ScrollableToolbar():
                            yield Button("Refresh", id="prs-refresh")
                            yield Button("Merge…", id="pr-merge", variant="primary")
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="prs-table",
                                classes="screen-list",
                            )
                            yield TextArea(
                                "Select a pull request.",
                                read_only=True,
                                id="pr-detail",
                                classes="screen-detail",
                            )
                        yield Static(
                            "Selecting a pull request loads at most 500 files, checks/statuses, "
                            "and review comments. Patches are capped at 120 KB per file. "
                            "Thread replies/resolution, full diff context expansion, and branch "
                            "checkout are not supported in this workspace.",
                            classes="help-copy",
                        )
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="pr-files-table",
                                classes="screen-list",
                            )
                            yield TextArea(
                                "Select a changed file to inspect its bounded patch.",
                                read_only=True,
                                id="pr-file-detail",
                                classes="screen-detail",
                            )
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="pr-checks-table",
                                classes="screen-list",
                            )
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="pr-review-comments-table",
                                classes="screen-detail",
                            )
                        with Vertical(classes="form-panel"):
                            yield TextArea(
                                "",
                                placeholder="Review body (required for comment/request changes)",
                                id="pr-review-body",
                                tab_behavior="focus",
                            )
                            with ScrollableToolbar():
                                yield Button("Submit approval", id="pr-approve")
                                yield Button("Submit comment review", id="pr-comment-review")
                                yield Button(
                                    "Submit request changes",
                                    id="pr-request-changes",
                                )
                            with ResponsiveFormRow():
                                yield Input(
                                    placeholder="Selected file path",
                                    id="pr-review-comment-path",
                                    select_on_focus=False,
                                )
                                yield Input(
                                    placeholder="Diff line",
                                    id="pr-review-comment-line",
                                    select_on_focus=False,
                                )
                                yield Select(
                                    (("Right/new", "RIGHT"), ("Left/old", "LEFT")),
                                    value="RIGHT",
                                    allow_blank=False,
                                    id="pr-review-comment-side",
                                )
                            with ResponsiveFormRow():
                                yield Input(
                                    placeholder="Line comment body",
                                    id="pr-review-comment-body",
                                    select_on_focus=False,
                                )
                                yield Button(
                                    "Post exact-head line comment",
                                    id="pr-review-comment-create",
                                )
                        with Vertical(classes="form-panel"):
                            yield Input(
                                placeholder="Pull request title",
                                id="pr-title",
                                select_on_focus=False,
                            )
                            with ResponsiveFormRow():
                                yield Input(
                                    placeholder="Head branch",
                                    id="pr-head",
                                    select_on_focus=False,
                                )
                                yield Input(
                                    value="main",
                                    placeholder="Base branch",
                                    id="pr-base",
                                    select_on_focus=False,
                                )
                            yield TextArea(
                                "",
                                placeholder="Pull request body",
                                id="pr-body",
                                tab_behavior="focus",
                            )
                            yield Button(
                                "Create pull request",
                                id="pr-create",
                                variant="primary",
                            )

                    with TabPane("Effective rules", id="pr-rules"):
                        yield SearchBar(
                            surface_id="github-effective-rules",
                            placeholder="Search effective branch rules…",
                            id="github-rules-search",
                        )
                        with ResponsiveFormRow():
                            yield Input(
                                value="main",
                                placeholder="Exact branch name",
                                id="rules-branch",
                                select_on_focus=False,
                            )
                            yield Button("Inspect active rules", id="rules-refresh")
                        yield Static(
                            "Read-only inspection shows active rules that currently apply to "
                            "one exact branch, including repository and organization rulesets. "
                            "Disabled/evaluate rules and wildcard targets are not returned by "
                            "this effective-rules endpoint.",
                            classes="help-copy",
                        )
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="rules-table",
                                classes="screen-list",
                            )
                            yield TextArea(
                                "Inspect an exact branch, then select a rule.",
                                language="json",
                                read_only=True,
                                id="rule-detail",
                                classes="screen-detail",
                            )

                    with TabPane("Notifications", id="pr-notifications"):
                        yield SearchBar(
                            surface_id="github-repository-notifications",
                            placeholder="Search repository notifications…",
                            id="github-notifications-search",
                        )
                        with ScrollableToolbar():
                            yield Button("Refresh", id="notifications-refresh")
                            yield Button("Mark selected read", id="notification-mark-read")
                        yield Static(
                            "Repository notification threads are listed with their reason and "
                            "read state. Marking read is scoped to the selected numeric thread. "
                            "Operating-system delivery and de-duplication are not provided here.",
                            classes="help-copy",
                        )
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="notifications-table",
                                classes="screen-list",
                            )
                            yield TextArea(
                                "Select a notification thread.",
                                read_only=True,
                                id="notification-detail",
                                classes="screen-detail",
                            )

            with (
                TabPane("Actions", id="github-actions"),
                TabbedContent(initial="actions-runs", id="github-actions-tabs"),
            ):
                    with TabPane("Runs", id="actions-runs"):
                        yield SearchBar(
                            surface_id="github-actions-runs",
                            placeholder="Search workflows and runs…",
                            id="github-actions-search",
                        )
                        with ScrollableToolbar():
                            yield Button("Refresh", id="actions-refresh")
                            yield Button("Rerun all", id="action-rerun")
                            yield Button("Rerun failed", id="action-rerun-failed")
                            yield Button("Inspect job log", id="action-job-log")
                            yield Button("Cancel…", id="action-cancel", variant="error")
                        with ResponsiveFormRow():
                            yield Input(
                                placeholder="Filter workflow ID or file",
                                id="actions-filter-workflow",
                                select_on_focus=False,
                            )
                            yield Input(
                                placeholder="Branch",
                                id="actions-filter-branch",
                                select_on_focus=False,
                            )
                            yield Input(
                                placeholder="Event, e.g. push",
                                id="actions-filter-event",
                                select_on_focus=False,
                            )
                            yield Input(
                                placeholder="Status or conclusion",
                                id="actions-filter-status",
                                select_on_focus=False,
                            )
                            yield Button("Apply filters", id="actions-apply-filters")
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="workflows-table",
                                classes="screen-list",
                            )
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="runs-table",
                                classes="screen-detail",
                            )
                        with Horizontal(classes="screen-split"):
                            yield DataTable(
                                cursor_type="row",
                                zebra_stripes=True,
                                id="jobs-table",
                                classes="screen-list",
                            )
                            yield TextArea(
                                "Select a run to inspect its jobs and steps.",
                                read_only=True,
                                id="job-detail",
                                classes="screen-detail",
                            )
                        with ResponsiveFormRow():
                            yield Input(
                                placeholder="Workflow ID or file",
                                id="workflow-id",
                                select_on_focus=False,
                            )
                            yield Input(
                                value="main",
                                placeholder="Git ref",
                                id="workflow-ref",
                                select_on_focus=False,
                            )
                            yield Input(
                                placeholder='Inputs JSON, e.g. {"deploy":true}',
                                id="workflow-inputs",
                                select_on_focus=False,
                            )
                            yield Button(
                                "Dispatch workflow",
                                id="workflow-dispatch",
                                variant="primary",
                            )

                    with TabPane("Caches", id="actions-caches"):
                        yield SearchBar(
                            surface_id="github-actions-caches",
                            placeholder="Search cache keys and refs…",
                            id="github-caches-search",
                        )
                        with ScrollableToolbar():
                            yield Button("Refresh", id="caches-refresh")
                            yield Button("Delete selected…", id="cache-delete", variant="error")
                        yield Static(
                            "Cache archives cannot be downloaded: GitHub exposes cache metadata "
                            "and deletion, but no supported cache-archive download API.",
                            classes="help-copy",
                        )
                        yield DataTable(
                            cursor_type="row",
                            zebra_stripes=True,
                            id="caches-table",
                        )

                    with TabPane("Artifacts", id="actions-artifacts"):
                        yield SearchBar(
                            surface_id="github-actions-artifacts",
                            placeholder="Search artifact names, runs, branches, and digests…",
                            id="github-artifacts-search",
                        )
                        with ScrollableToolbar():
                            yield Button("Refresh", id="artifacts-refresh")
                        yield DataTable(
                            cursor_type="row",
                            zebra_stripes=True,
                            id="artifacts-table",
                        )
                        with ResponsiveFormRow():
                            yield Input(
                                placeholder="Destination .zip path (must not already exist)",
                                id="artifact-destination",
                                select_on_focus=False,
                            )
                            yield Button(
                                "Download and verify",
                                id="artifact-download",
                                variant="primary",
                            )

            with TabPane("Releases & packages", id="github-releases"):
                yield SearchBar(
                    surface_id="github-releases",
                    placeholder="Search releases, packages, and projects…",
                    id="github-releases-search",
                )
                with ScrollableToolbar():
                    yield Button("Refresh", id="releases-refresh")
                    yield Button("Create draft", id="release-create")
                    yield Button("Save", id="release-save")
                    yield Button("Publish", id="release-publish", variant="primary")
                    yield Button("Delete…", id="release-delete", variant="error")
                yield Static(
                    "Release creation, editing, publishing, deletion, and verified asset "
                    "downloads are available. Asset upload is explicitly unavailable until "
                    "the bounded gh transport supports multipart binary request bodies.",
                    classes="help-copy",
                )
                with ResponsiveFormRow():
                    yield Input(
                        placeholder="Tag, e.g. v1.2.3",
                        id="release-tag",
                        select_on_focus=False,
                    )
                    yield Input(
                        placeholder="Release name",
                        id="release-name",
                        select_on_focus=False,
                    )
                    yield Input(
                        value="main",
                        placeholder="Target branch or SHA",
                        id="release-target",
                        select_on_focus=False,
                    )
                    yield Select(
                        (
                            ("Draft", "draft"),
                            ("Prerelease", "prerelease"),
                            ("Published", "published"),
                        ),
                        value="draft",
                        allow_blank=False,
                        id="release-state",
                    )
                with Horizontal(classes="screen-split"):
                    yield DataTable(
                        cursor_type="row",
                        zebra_stripes=True,
                        id="releases-table",
                        classes="screen-list",
                    )
                    yield TextArea(
                        "Select a release.",
                        read_only=True,
                        id="release-detail",
                        classes="screen-detail",
                    )
                yield TextArea(
                    "",
                    placeholder="Release notes",
                    id="release-body",
                    tab_behavior="focus",
                )
                yield DataTable(
                    cursor_type="row",
                    zebra_stripes=True,
                    id="release-assets-table",
                )
                with ResponsiveFormRow():
                    yield Input(
                        placeholder="Release asset destination path",
                        id="release-asset-destination",
                        select_on_focus=False,
                    )
                    yield Button(
                        "Download selected asset",
                        id="release-asset-download",
                    )
                with Horizontal(classes="screen-split"):
                    yield DataTable(
                        cursor_type="row",
                        zebra_stripes=True,
                        id="packages-table",
                        classes="screen-list",
                    )
                    with Vertical(classes="screen-detail"):
                        yield TextArea(
                            "Select a package to inspect versions. Package contents are "
                            "downloaded with their registry-native client; GitHub's package "
                            "REST API does not expose package-file transfer.",
                            read_only=True,
                            id="package-detail",
                        )
                        yield DataTable(
                            cursor_type="row",
                            zebra_stripes=True,
                            id="projects-table",
                        )

            with TabPane("API explorer", id="github-api"):
                yield Static(
                    "Responses are bounded. Read operations run directly; mutations require "
                    "an explicit decision and reject secret-looking fields.",
                    classes="help-copy",
                )
                with ResponsiveFormRow():
                    yield Select(
                        tuple(
                            (method, method) for method in ("GET", "POST", "PATCH", "PUT", "DELETE")
                        ),
                        value="GET",
                        allow_blank=False,
                        id="api-method",
                    )
                    yield Input(
                        placeholder="/repos/{owner}/{repo}",
                        id="api-path",
                        select_on_focus=False,
                    )
                    yield Button("Execute", id="api-execute", variant="primary")
                yield TextArea(
                    "",
                    placeholder='JSON body, e.g. {"title":"Example"}',
                    language="json",
                    id="api-body",
                    tab_behavior="focus",
                )
                yield TextArea(
                    "API response appears here.",
                    language="json",
                    read_only=True,
                    id="api-result",
                )

    def on_mount(self) -> None:
        self.query_one("#issues-table", DataTable).add_columns(
            "#", "State", "Title", "Labels", "Updated"
        )
        self.query_one("#prs-table", DataTable).add_columns(
            "#", "State", "Title", "Head", "Base", "Review"
        )
        self.query_one("#pr-files-table", DataTable).add_columns(
            "Status", "File", "+", "-", "Changes"
        )
        self.query_one("#pr-checks-table", DataTable).add_columns(
            "Source", "Check", "Status", "Conclusion"
        )
        self.query_one("#pr-review-comments-table", DataTable).add_columns(
            "File", "Line", "Author", "Comment"
        )
        self.query_one("#rules-table", DataTable).add_columns(
            "Type", "Source type", "Source", "Ruleset"
        )
        self.query_one("#notifications-table", DataTable).add_columns(
            "Unread", "Reason", "Type", "Subject", "Updated"
        )
        self.query_one("#workflows-table", DataTable).add_columns("ID", "Workflow", "State", "Path")
        self.query_one("#runs-table", DataTable).add_columns(
            "ID", "Run", "Event", "Status", "Conclusion", "Branch"
        )
        self.query_one("#jobs-table", DataTable).add_columns(
            "ID", "Job", "Status", "Conclusion", "Runner"
        )
        self.query_one("#caches-table", DataTable).add_columns(
            "ID", "Key", "Ref", "Size", "Last used"
        )
        self.query_one("#artifacts-table", DataTable).add_columns(
            "ID", "Artifact", "Run", "Branch", "Size", "Expires", "Digest"
        )
        self.query_one("#releases-table", DataTable).add_columns(
            "Tag", "Name", "Published", "Assets"
        )
        self.query_one("#release-assets-table", DataTable).add_columns(
            "ID", "Asset", "State", "Size", "Downloads", "Digest"
        )
        self.query_one("#packages-table", DataTable).add_columns(
            "Package", "Type", "Visibility", "Versions"
        )
        self.query_one("#projects-table", DataTable).add_columns(
            "#", "Project", "Status", "Updated"
        )

    def bind_git_repository(self, service: Any | None) -> None:
        self.git_service = service
        self.github = None
        if service is None:
            self.query_one("#github-status", Static).update("Open a repository to connect.")
            return
        self.connect()

    @work(exclusive=True, group="github-connect")
    async def connect(self) -> None:
        if self.git_service is None:
            return
        status = self.query_one("#github-status", Static)
        status.update("Discovering GitHub remote…")
        try:
            remotes = await asyncio.to_thread(self.git_service.remotes)
            slug = self._slug_from_remotes(remotes)
            if slug is None:
                status.update("No supported GitHub remote was found.")
                return
            from ...application.github_service import GitHubService

            self.github = GitHubService.from_slug(slug)
            auth = await asyncio.to_thread(self.github.auth_status)
        except Exception as error:
            status.update(f"[red]GitHub unavailable:[/] {error}")
            return
        login = _field(auth, "login", None) or "authenticated user"
        status.update(f"[green]Connected[/] to {slug} as {login}.")
        self.reload_all()

    @staticmethod
    def _slug_from_remotes(remotes: object) -> str | None:
        for remote in remotes if isinstance(remotes, (tuple, list)) else ():
            urls = (
                str(_field(remote, "fetch_url", "")),
                str(_field(remote, "push_url", "")),
                str(_field(remote, "url", "")),
            )
            for url in urls:
                match = _HTTPS_REMOTE.match(url) or _SSH_REMOTE.match(url)
                if not match:
                    continue
                name = match.group("name").removesuffix(".git")
                host = match.group("host")
                slug = f"{match.group('owner')}/{name}"
                return slug if host.casefold() == "github.com" else f"{host}/{slug}"
        return None

    def reload_all(self) -> None:
        self._load_issues()
        self._load_pull_requests()
        self._load_branch_rules()
        self._load_notifications()
        self._load_actions()
        self._load_caches()
        self._load_artifacts()
        self._load_releases()

    def _require_service(self) -> Any | None:
        if self.github is None:
            self.app.notify("Connect a GitHub-backed repository first.", severity="warning")
        return self.github

    def _live(self, selector: str, kind: type[_W]) -> _W | None:
        """The named widget, or nothing if this pane can no longer be reached.

        `_torn_down` catches the pane that has stopped running. It does not
        catch the pane that is still running with its children already gone,
        which is the same late arrival wearing a different hat and still
        raises `NoMatches` from inside the worker. Asking for the widget and
        accepting its absence covers both.
        """
        if self._torn_down:
            return None
        try:
            return self.query_one(selector, kind)
        except NoMatches:
            return None

    @property
    def _torn_down(self) -> bool:
        """Whether this pane has stopped running and its widgets are gone.

        Every loader below reaches the DOM again *after* awaiting network work,
        and the pane can be taken down inside that window — marking a
        notification read even starts a fresh load as its last act, once
        whoever asked has finished waiting on workers. Querying a torn-down
        pane raises `NoMatches` from inside the worker, which Textual reports
        as a crashed worker rather than as the harmless late arrival it is.
        """
        return not self.is_running

    @work(exclusive=True, group="issues-load")
    async def _load_issues(self) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            self.issues = list(await asyncio.to_thread(service.list_issues, limit=100))
        except Exception as error:
            self.app.notify(str(error), title="Issues failed", severity="error")
            return
        self._render_issues(self.issues)

    def _render_issues(self, issues: tuple[object, ...] | list[object]) -> None:
        table = self._live("#issues-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(issue): index for index, issue in enumerate(self.issues)}
        for issue in issues:
            table.add_row(
                str(_field(issue, "number")),
                _state(issue),
                str(_field(issue, "title")),
                ", ".join(_field(issue, "labels", ())),
                str(_field(issue, "updated_at")),
                key=str(source_indices[id(issue)]),
            )

    @on(SearchBar.Changed, "#github-issues-search")
    def _filter_issues(self, event: SearchBar.Changed) -> None:
        self._render_issues(
            _filtered(
                self.issues,
                event.state,
                "number",
                "state",
                "title",
                "body",
                "labels",
                "updated_at",
            )
        )

    @on(DataTable.RowHighlighted, "#issues-table")
    def _issue_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            issue = self.issues[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        author = _field(_field(issue, "author", None), "login", "unknown")
        comments = _field(issue, "comments", ())
        self.query_one("#issue-detail", TextArea).text = (
            f"#{_field(issue, 'number')} · {_state(issue)}\n"
            f"{_field(issue, 'title')}\n"
            f"Author: {author} · Labels: {', '.join(_field(issue, 'labels', ()))}\n"
            f"URL: {_field(issue, 'url')}\n\n"
            f"{_field(issue, 'body')}\n\n"
            f"{len(comments)} loaded comment(s)"
        )

    def _selected_issue(self) -> object | None:
        source_index = _source_index(self.query_one("#issues-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.issues)):
            return None
        return self.issues[source_index]

    @work(exclusive=True, group="issues-mutate")
    async def _create_issue(self) -> None:
        service = self._require_service()
        if service is None:
            return
        title = self.query_one("#issue-title", Input).value.strip()
        body = self.query_one("#issue-body", TextArea).text
        if not title:
            self.app.notify("Issue title is required.", severity="warning")
            self.query_one("#issue-title", Input).focus()
            return
        try:
            issue = await asyncio.to_thread(
                service.create_issue,
                title=title,
                body=body,
            )
        except Exception as error:
            self.app.notify(str(error), title="Create issue failed", severity="error")
            return
        title_input = self._live("#issue-title", Input)
        body_area = self._live("#issue-body", TextArea)
        if title_input is None or body_area is None:
            return
        title_input.value = ""
        body_area.text = ""
        self.app.notify(f"Created issue #{_field(issue, 'number')}.", title="GitHub")
        self._load_issues()

    @work(exclusive=True, group="issues-mutate")
    async def _comment_issue(self) -> None:
        service = self._require_service()
        issue = self._selected_issue()
        body = self.query_one("#issue-comment-body", Input).value.strip()
        if service is None or issue is None or not body:
            self.app.notify("Select an issue and enter a comment.", severity="warning")
            return
        try:
            await asyncio.to_thread(service.comment_issue, _field(issue, "number"), body)
        except Exception as error:
            self.app.notify(str(error), title="Comment failed", severity="error")
            return
        comment_input = self._live("#issue-comment-body", Input)
        if comment_input is None:
            return
        comment_input.value = ""
        self.app.notify("Comment posted.", title="GitHub")
        self._load_issues()

    def _confirm_close_issue(self) -> None:
        issue = self._selected_issue()
        if issue is None:
            self.app.notify("Select an issue first.", severity="warning")
            return
        number = int(_field(issue, "number"))

        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._close_issue(number)

        self.app.push_screen(
            DecisionDialog(
                f"Close issue #{number}?",
                "The issue remains searchable and may be reopened on GitHub.",
                confirm_label="Close issue",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="issues-mutate")
    async def _close_issue(self, number: int) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            await asyncio.to_thread(service.close_issue, number)
        except Exception as error:
            self.app.notify(str(error), title="Close issue failed", severity="error")
            return
        self.app.notify(f"Closed issue #{number}.", title="GitHub")
        self._load_issues()

    @work(exclusive=True, group="prs-load")
    async def _load_pull_requests(self) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            self.pull_requests = list(
                await asyncio.to_thread(service.list_pull_requests, limit=100)
            )
        except Exception as error:
            self.app.notify(str(error), title="Pull requests failed", severity="error")
            return
        self.current_pull_request = None
        self.pull_request_files = []
        self.pull_request_checks = []
        self.pull_request_review_comments = []
        self._render_pull_request_files(())
        self._render_pull_request_checks(())
        self._render_pull_request_review_comments(())
        self._render_pull_requests(self.pull_requests)

    def _render_pull_requests(
        self,
        pull_requests: tuple[object, ...] | list[object],
    ) -> None:
        table = self._live("#prs-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(pr): index for index, pr in enumerate(self.pull_requests)}
        for pr in pull_requests:
            table.add_row(
                str(_field(pr, "number")),
                _state(pr),
                str(_field(pr, "title")),
                str(_field(pr, "head_ref")),
                str(_field(pr, "base_ref")),
                str(_field(pr, "review_decision", "") or "—"),
                key=str(source_indices[id(pr)]),
            )

    @on(SearchBar.Changed, "#github-pr-search")
    def _filter_pull_requests(self, event: SearchBar.Changed) -> None:
        self._render_pull_requests(
            _filtered(
                self.pull_requests,
                event.state,
                "number",
                "state",
                "title",
                "body",
                "head_ref",
                "base_ref",
                "review_decision",
            )
        )

    @on(DataTable.RowHighlighted, "#prs-table")
    def _pr_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            pr = self.pull_requests[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        self.current_pull_request = pr
        self._render_pull_request_detail(pr)
        self._load_pull_request_review(int(_field(pr, "number")))

    def _render_pull_request_detail(self, pr: object) -> None:
        detail = self._live("#pr-detail", TextArea)
        if detail is None:
            return
        reviews = _field(pr, "reviews", ())
        comments = _field(pr, "comments", ())
        detail.text = (
            f"#{_field(pr, 'number')} · {_state(pr)}"
            f"{' · DRAFT' if _field(pr, 'draft', False) else ''}\n"
            f"{_field(pr, 'title')}\n"
            f"{_field(pr, 'head_ref')} → {_field(pr, 'base_ref')}\n"
            f"Merge: {_field(pr, 'merge_state_status', '—')} · "
            f"Review: {_field(pr, 'review_decision', '—')}\n"
            f"Head SHA: {_field(pr, 'head_sha', '—')}\n"
            f"URL: {_field(pr, 'url')}\n"
            f"Loaded activity: {len(reviews)} review(s), {len(comments)} conversation "
            f"comment(s)\n\n{_field(pr, 'body')}"
        )

    @work(exclusive=True, group="pr-review-load")
    async def _load_pull_request_review(self, number: int) -> None:
        service = self._require_service()
        if service is None:
            return
        selected = self._selected_pr()
        if selected is None or int(_field(selected, "number")) != number:
            return
        try:
            detail = await asyncio.to_thread(service.get_pull_request, number)
        except Exception as error:
            detail = selected
            self.app.notify(
                str(error),
                title="Pull request detail failed",
                severity="error",
            )

        head_sha = str(_field(detail, "head_sha", "") or "")
        calls = [
            asyncio.to_thread(service.list_pull_request_files, number, limit=500),
            asyncio.to_thread(
                service.list_pull_request_review_comments,
                number,
                limit=500,
            ),
        ]
        if head_sha:
            calls.append(
                asyncio.to_thread(service.list_pull_request_checks, head_sha, limit=500)
            )
        results = await asyncio.gather(*calls, return_exceptions=True)
        files_result, comments_result = results[:2]
        checks_result: object = results[2] if len(results) == 3 else ()

        selected = self._selected_pr()
        if selected is None or int(_field(selected, "number")) != number:
            return
        self.current_pull_request = detail
        for index, candidate in enumerate(self.pull_requests):
            if int(_field(candidate, "number")) == number:
                self.pull_requests[index] = detail
                break
        self._render_pull_request_detail(detail)
        self.pull_request_files = self._review_result(
            files_result,
            title="Pull-request files failed",
        )
        self.pull_request_review_comments = self._review_result(
            comments_result,
            title="Review comments failed",
        )
        self.pull_request_checks = self._review_result(
            checks_result,
            title="Pull-request checks failed",
        )
        self._render_pull_request_files(self.pull_request_files)
        self._render_pull_request_checks(self.pull_request_checks)
        self._render_pull_request_review_comments(self.pull_request_review_comments)

    def _review_result(self, result: object, *, title: str) -> list[object]:
        if isinstance(result, BaseException):
            self.app.notify(str(result), title=title, severity="error")
            return []
        if isinstance(result, (tuple, list)):
            return list(result)
        return []

    def _render_pull_request_files(self, files: list[object] | tuple[object, ...]) -> None:
        table = self._live("#pr-files-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(file): index for index, file in enumerate(self.pull_request_files)}
        for file in files:
            table.add_row(
                str(_field(file, "status")),
                str(_field(file, "filename")),
                str(_field(file, "additions", 0)),
                str(_field(file, "deletions", 0)),
                str(_field(file, "changes", 0)),
                key=str(source_indices[id(file)]),
            )

    def _render_pull_request_checks(self, checks: list[object] | tuple[object, ...]) -> None:
        table = self._live("#pr-checks-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(check): index for index, check in enumerate(self.pull_request_checks)}
        for check in checks:
            table.add_row(
                str(_field(check, "source")),
                str(_field(check, "name")),
                str(_field(check, "status")),
                str(_field(check, "conclusion", "") or "—"),
                key=str(source_indices[id(check)]),
            )

    def _render_pull_request_review_comments(
        self,
        comments: list[object] | tuple[object, ...],
    ) -> None:
        table = self._live("#pr-review-comments-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {
            id(comment): index for index, comment in enumerate(self.pull_request_review_comments)
        }
        for comment in comments:
            author = _field(_field(comment, "author", None), "login", "unknown")
            body = str(_field(comment, "body")).replace("\n", " ")
            table.add_row(
                str(_field(comment, "path")),
                str(_field(comment, "line", "") or "—"),
                str(author),
                body[:160],
                key=str(source_indices[id(comment)]),
            )

    @on(DataTable.RowHighlighted, "#pr-files-table")
    def _pr_file_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            file = self.pull_request_files[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        patch = _field(file, "patch", None)
        patch_note = "Patch was omitted by GitHub for this file."
        if patch:
            patch_note = str(patch)
            if _field(file, "patch_truncated", False):
                patch_note += "\n\n[Patch truncated at the 120 KB local safety limit.]"
        self.query_one("#pr-file-detail", TextArea).text = (
            f"{_field(file, 'filename')} · {_field(file, 'status')}\n"
            f"+{_field(file, 'additions', 0)} -{_field(file, 'deletions', 0)} "
            f"({_field(file, 'changes', 0)} changed)\n"
            f"Previous: {_field(file, 'previous_filename', None) or '—'}\n"
            f"Blob: {_field(file, 'blob_url', None) or '—'}\n\n{patch_note}"
        )
        self.query_one("#pr-review-comment-path", Input).value = str(
            _field(file, "filename")
        )

    @on(DataTable.RowHighlighted, "#pr-checks-table")
    def _pr_check_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            check = self.pull_request_checks[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        self.query_one("#pr-detail", TextArea).text = (
            f"{_field(check, 'name')} · {_field(check, 'source')}\n"
            f"Status: {_field(check, 'status')} · "
            f"Conclusion: {_field(check, 'conclusion', None) or '—'}\n"
            f"Started: {_field(check, 'started_at', None) or '—'}\n"
            f"Completed: {_field(check, 'completed_at', None) or '—'}\n"
            f"Details: {_field(check, 'details_url', None) or '—'}\n\n"
            f"{_field(check, 'description', '')}"
        )

    @on(DataTable.RowHighlighted, "#pr-review-comments-table")
    def _pr_review_comment_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            comment = self.pull_request_review_comments[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        author = _field(_field(comment, "author", None), "login", "unknown")
        self.query_one("#pr-detail", TextArea).text = (
            f"Review comment {_field(comment, 'id')} by {author}\n"
            f"{_field(comment, 'path')} · line {_field(comment, 'line', None) or '—'} "
            f"{_field(comment, 'side', None) or ''}\n"
            f"Commit: {_field(comment, 'commit_id', None) or '—'}\n"
            f"URL: {_field(comment, 'url', None) or '—'}\n\n"
            f"{_field(comment, 'body', '')}"
        )

    def _selected_pr(self) -> object | None:
        table = self._live("#prs-table", DataTable)
        if table is None:
            return None
        source_index = _source_index(table)
        if source_index is None or not (0 <= source_index < len(self.pull_requests)):
            return None
        selected = self.pull_requests[source_index]
        if (
            self.current_pull_request is not None
            and _field(self.current_pull_request, "number") == _field(selected, "number")
        ):
            return self.current_pull_request
        return selected

    @work(exclusive=True, group="prs-mutate")
    async def _create_pr(self) -> None:
        service = self._require_service()
        if service is None:
            return
        title = self.query_one("#pr-title", Input).value.strip()
        head = self.query_one("#pr-head", Input).value.strip()
        base = self.query_one("#pr-base", Input).value.strip()
        body = self.query_one("#pr-body", TextArea).text
        if not title or not head or not base:
            self.app.notify("Title, head, and base are required.", severity="warning")
            return
        try:
            pr = await asyncio.to_thread(
                service.create_pull_request,
                title=title,
                head=head,
                base=base,
                body=body,
            )
        except Exception as error:
            self.app.notify(str(error), title="Create pull request failed", severity="error")
            return
        self.app.notify(f"Created pull request #{_field(pr, 'number')}.", title="GitHub")
        self._load_pull_requests()

    @work(exclusive=True, group="prs-mutate")
    async def _review_pr(self, event_name: str) -> None:
        service = self._require_service()
        pr = self._selected_pr()
        if service is None or pr is None:
            self.app.notify("Select a pull request first.", severity="warning")
            return
        body_widget = self.query_one("#pr-review-body", TextArea)
        body = body_widget.text
        if event_name in {"COMMENT", "REQUEST_CHANGES"} and not body.strip():
            self.app.notify(
                "Enter a review body before submitting this review state.",
                severity="warning",
            )
            body_widget.focus()
            return
        head_sha = str(_field(pr, "head_sha", "") or "")
        if not head_sha:
            self.app.notify(
                "The selected pull request has no loaded head SHA; refresh its review data.",
                severity="warning",
            )
            return
        try:
            from ...infrastructure.github import ReviewDecision

            decision = ReviewDecision(event_name)
            await asyncio.to_thread(
                service.review_pull_request,
                _field(pr, "number"),
                event=decision,
                body=body,
                commit_id=head_sha,
            )
        except Exception as error:
            self.app.notify(str(error), title="Review failed", severity="error")
            return
        body_widget.text = ""
        self.app.notify(
            f"{event_name.replace('_', ' ').title()} review submitted against "
            f"{head_sha[:12]}.",
            title="GitHub",
        )
        self._load_pull_request_review(int(_field(pr, "number")))

    @work(exclusive=True, group="prs-mutate")
    async def _create_pr_review_comment(self) -> None:
        service = self._require_service()
        pr = self._selected_pr()
        if service is None or pr is None:
            self.app.notify("Select a pull request first.", severity="warning")
            return
        head_sha = str(_field(pr, "head_sha", "") or "")
        path_widget = self.query_one("#pr-review-comment-path", Input)
        line_widget = self.query_one("#pr-review-comment-line", Input)
        body_widget = self.query_one("#pr-review-comment-body", Input)
        path = path_widget.value.strip()
        body = body_widget.value.strip()
        try:
            line = int(line_widget.value.strip())
        except ValueError:
            line = 0
        side_value = self.query_one("#pr-review-comment-side", Select).value
        side = str(side_value) if isinstance(side_value, str) else ""
        if not head_sha or not path or line <= 0 or not body or side not in {"LEFT", "RIGHT"}:
            self.app.notify(
                "Select a loaded file, then enter a positive diff line and comment body.",
                severity="warning",
            )
            return
        try:
            await asyncio.to_thread(
                service.create_pull_request_review_comment,
                int(_field(pr, "number")),
                body=body,
                commit_id=head_sha,
                path=path,
                line=line,
                side=side,
            )
        except Exception as error:
            self.app.notify(str(error), title="Line comment failed", severity="error")
            return
        body_widget.value = ""
        self.app.notify(
            f"Posted {path}:{line} review comment against {head_sha[:12]}.",
            title="GitHub",
        )
        self._load_pull_request_review(int(_field(pr, "number")))

    @work(exclusive=True, group="branch-rules-load")
    async def _load_branch_rules(self) -> None:
        service = self._require_service()
        if service is None:
            return
        branch = self.query_one("#rules-branch", Input).value.strip()
        if not branch:
            self.app.notify("Enter an exact branch name.", severity="warning")
            return
        try:
            self.effective_branch_rules = list(
                await asyncio.to_thread(
                    service.list_effective_branch_rules,
                    branch,
                    limit=500,
                )
            )
        except Exception as error:
            self.app.notify(str(error), title="Effective rules failed", severity="error")
            return
        if self._torn_down:
            return
        self._render_branch_rules(self.effective_branch_rules)
        rule_detail = self._live("#rule-detail", TextArea)
        if rule_detail is None:
            return
        rule_detail.text = (
            f"{len(self.effective_branch_rules)} active effective rule(s) apply to "
            f"the exact branch {branch!r}."
        )

    def _render_branch_rules(
        self,
        rules: list[object] | tuple[object, ...],
        *,
        search_state: SearchState | None = None,
    ) -> None:
        table = self._live("#rules-table", DataTable)
        if table is None:
            return
        table.clear()
        active_state = search_state or self.query_one("#github-rules-search", SearchBar).state
        visible_rules = _filtered(
            list(rules),
            active_state,
            "type",
            "ruleset_source_type",
            "ruleset_source",
            "ruleset_id",
            "parameters",
        )
        source_indices = {
            id(rule): index for index, rule in enumerate(self.effective_branch_rules)
        }
        for rule in visible_rules:
            table.add_row(
                str(_field(rule, "type")),
                str(_field(rule, "ruleset_source_type")),
                str(_field(rule, "ruleset_source")),
                str(_field(rule, "ruleset_id", "") or "—"),
                key=str(source_indices[id(rule)]),
            )

    @on(SearchBar.Changed, "#github-rules-search")
    def _filter_branch_rules(self, event: SearchBar.Changed) -> None:
        self._render_branch_rules(
            self.effective_branch_rules,
            search_state=event.state,
        )

    @on(DataTable.RowHighlighted, "#rules-table")
    def _branch_rule_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            rule = self.effective_branch_rules[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        self.query_one("#rule-detail", TextArea).text = json.dumps(
            {
                "type": _field(rule, "type"),
                "ruleset_source_type": _field(rule, "ruleset_source_type"),
                "ruleset_source": _field(rule, "ruleset_source"),
                "ruleset_id": _field(rule, "ruleset_id", None),
                "parameters": _field(rule, "parameters", {}),
            },
            indent=2,
            default=str,
        )

    @work(exclusive=True, group="notifications-load")
    async def _load_notifications(self) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            self.repository_notifications = list(
                await asyncio.to_thread(
                    service.list_repository_notifications,
                    all_notifications=True,
                    participating=False,
                    limit=500,
                )
            )
        except Exception as error:
            self.app.notify(str(error), title="Notifications failed", severity="error")
            return
        self._render_notifications(self.repository_notifications)

    def _render_notifications(
        self,
        notifications: list[object] | tuple[object, ...],
        *,
        search_state: SearchState | None = None,
    ) -> None:
        table = self._live("#notifications-table", DataTable)
        if table is None:
            return
        table.clear()
        active_state = search_state or self.query_one(
            "#github-notifications-search", SearchBar
        ).state
        visible_notifications = _filtered(
            list(notifications),
            active_state,
            "id",
            "reason",
            "unread",
            "subject_type",
            "subject_title",
            "repository_full_name",
            "updated_at",
        )
        source_indices = {
            id(notification): index
            for index, notification in enumerate(self.repository_notifications)
        }
        for notification in visible_notifications:
            table.add_row(
                "Unread" if _field(notification, "unread", False) else "Read",
                str(_field(notification, "reason")),
                str(_field(notification, "subject_type")),
                str(_field(notification, "subject_title")),
                str(_field(notification, "updated_at", "") or "—"),
                key=str(source_indices[id(notification)]),
            )

    @on(SearchBar.Changed, "#github-notifications-search")
    def _filter_notifications(self, event: SearchBar.Changed) -> None:
        self._render_notifications(
            self.repository_notifications,
            search_state=event.state,
        )

    def _selected_notification(self) -> object | None:
        source_index = _source_index(self.query_one("#notifications-table", DataTable))
        if source_index is None or not 0 <= source_index < len(self.repository_notifications):
            return None
        return self.repository_notifications[source_index]

    @on(DataTable.RowHighlighted, "#notifications-table")
    def _notification_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            notification = self.repository_notifications[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        self.query_one("#notification-detail", TextArea).text = (
            f"Thread {_field(notification, 'id')} · "
            f"{'unread' if _field(notification, 'unread', False) else 'read'}\n"
            f"{_field(notification, 'subject_type')}: "
            f"{_field(notification, 'subject_title')}\n"
            f"Reason: {_field(notification, 'reason')}\n"
            f"Repository: {_field(notification, 'repository_full_name')}\n"
            f"Updated: {_field(notification, 'updated_at', None) or '—'}\n"
            f"Last read: {_field(notification, 'last_read_at', None) or '—'}\n"
            f"Subject API: {_field(notification, 'subject_url', None) or '—'}\n"
            f"Latest comment API: "
            f"{_field(notification, 'latest_comment_url', None) or '—'}"
        )

    @work(exclusive=True, group="notifications-mutate")
    async def _mark_notification_read(self) -> None:
        service = self._require_service()
        notification = self._selected_notification()
        if service is None or notification is None:
            self.app.notify("Select a notification thread first.", severity="warning")
            return
        thread_id = str(_field(notification, "id"))
        try:
            await asyncio.to_thread(service.mark_notification_read, thread_id)
        except Exception as error:
            self.app.notify(str(error), title="Mark notification read failed", severity="error")
            return
        self.app.notify(f"Marked notification thread {thread_id} read.", title="GitHub")
        self._load_notifications()

    def _confirm_merge_pr(self) -> None:
        pr = self._selected_pr()
        if pr is None:
            self.app.notify("Select a pull request first.", severity="warning")
            return
        number = int(_field(pr, "number"))

        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._merge_pr(number)

        self.app.push_screen(
            DecisionDialog(
                f"Merge pull request #{number}?",
                "This uses GitHub's standard merge method and changes the remote repository.",
                confirm_label="Merge",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="prs-mutate")
    async def _merge_pr(self, number: int) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            await asyncio.to_thread(service.merge_pull_request, number)
        except Exception as error:
            self.app.notify(str(error), title="Merge failed", severity="error")
            return
        self.app.notify(f"Merged pull request #{number}.", title="GitHub")
        self._load_pull_requests()

    @work(exclusive=True, group="actions-load")
    async def _load_actions(self) -> None:
        service = self._require_service()
        if service is None:
            return
        workflow_filter = self.query_one("#actions-filter-workflow", Input).value.strip()
        branch_filter = self.query_one("#actions-filter-branch", Input).value.strip()
        event_filter = self.query_one("#actions-filter-event", Input).value.strip()
        status_filter = self.query_one("#actions-filter-status", Input).value.strip()
        try:
            workflows, runs = await asyncio.gather(
                asyncio.to_thread(service.list_workflows),
                asyncio.to_thread(
                    service.list_workflow_runs,
                    workflow_id=workflow_filter or None,
                    branch=branch_filter or None,
                    event=event_filter or None,
                    status=status_filter or None,
                    limit=100,
                ),
            )
            self.workflows = list(workflows)
            self.runs = list(runs)
        except Exception as error:
            self.app.notify(str(error), title="Actions failed", severity="error")
            return
        self._render_actions(self.workflows, self.runs)

    def _render_actions(
        self,
        workflows: tuple[object, ...] | list[object],
        runs: tuple[object, ...] | list[object],
    ) -> None:
        workflows_table = self._live("#workflows-table", DataTable)
        if workflows_table is None:
            return
        runs_table = self._live("#runs-table", DataTable)
        if runs_table is None:
            return
        workflows_table.clear()
        runs_table.clear()
        workflow_indices = {id(workflow): index for index, workflow in enumerate(self.workflows)}
        run_indices = {id(run): index for index, run in enumerate(self.runs)}
        for workflow in workflows:
            workflows_table.add_row(
                str(_field(workflow, "id")),
                str(_field(workflow, "name")),
                str(_field(workflow, "state")),
                str(_field(workflow, "path")),
                key=str(workflow_indices[id(workflow)]),
            )
        for run in runs:
            runs_table.add_row(
                str(_field(run, "id")),
                str(_field(run, "display_title", _field(run, "name"))),
                str(_field(run, "event", "") or "—"),
                str(_field(run, "status")),
                str(_field(run, "conclusion", "") or "—"),
                str(_field(run, "branch", "") or "—"),
                key=str(run_indices[id(run)]),
            )

    @on(SearchBar.Changed, "#github-actions-search")
    def _filter_actions(self, event: SearchBar.Changed) -> None:
        workflows = _filtered(
            self.workflows,
            event.state,
            "id",
            "name",
            "state",
            "path",
        )
        runs = _filtered(
            self.runs,
            event.state,
            "id",
            "name",
            "display_title",
            "event",
            "status",
            "conclusion",
            "branch",
        )
        self._render_actions(workflows, runs)

    def _selected_run(self) -> object | None:
        source_index = _source_index(self.query_one("#runs-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.runs)):
            return None
        return self.runs[source_index]

    @on(DataTable.RowHighlighted, "#runs-table")
    def _run_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            run = self.runs[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        self._load_jobs(int(_field(run, "id")))

    @work(exclusive=True, group="actions-jobs")
    async def _load_jobs(self, run_id: int) -> None:
        service = self._require_service()
        if service is None:
            return
        detail = self.query_one("#job-detail", TextArea)
        detail.text = f"Loading jobs and log metadata for run {run_id}…"
        try:
            jobs, metadata = await asyncio.gather(
                asyncio.to_thread(service.list_workflow_jobs, run_id, limit=100),
                asyncio.to_thread(service.get_run_log_metadata, run_id),
            )
        except Exception as error:
            detail.text = str(error)
            self.app.notify(str(error), title="Workflow jobs failed", severity="error")
            return
        self.jobs = list(jobs)
        self._render_jobs(self.jobs)
        availability = "available" if _field(metadata, "available", False) else "unavailable"
        detail.text = (
            f"Run {run_id} logs: {availability}\n"
            f"HTTP: {_field(metadata, 'http_status', '—')} · "
            f"Type: {_field(metadata, 'content_type', '—')} · "
            f"Bytes: {_field(metadata, 'content_length', '—')}\n"
            "Select a job to inspect its steps, then choose Inspect job log."
        )

    def _render_jobs(self, jobs: tuple[object, ...] | list[object]) -> None:
        table = self._live("#jobs-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(job): index for index, job in enumerate(self.jobs)}
        for job in jobs:
            table.add_row(
                str(_field(job, "id")),
                str(_field(job, "name")),
                str(_field(job, "status")),
                str(_field(job, "conclusion", "") or "—"),
                str(_field(job, "runner_name", "") or "—"),
                key=str(source_indices[id(job)]),
            )

    def _selected_job(self) -> object | None:
        source_index = _source_index(self.query_one("#jobs-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.jobs)):
            return None
        return self.jobs[source_index]

    @on(DataTable.RowHighlighted, "#jobs-table")
    def _job_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            job = self.jobs[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        steps = "\n".join(
            f"{_field(step, 'number')}. {_field(step, 'name')} — "
            f"{_field(step, 'conclusion', None) or _field(step, 'status')}"
            for step in _field(job, "steps", ())
        )
        self.query_one("#job-detail", TextArea).text = (
            f"{_field(job, 'name')} · {_field(job, 'status')} · "
            f"{_field(job, 'conclusion', '') or '—'}\n"
            f"Runner: {_field(job, 'runner_name', '') or '—'}\n\n"
            f"Steps\n{steps or 'No steps were reported.'}"
        )

    @work(exclusive=True, group="actions-job-log")
    async def _inspect_job_log(self) -> None:
        service = self._require_service()
        job = self._selected_job()
        if service is None or job is None:
            self.app.notify("Select a workflow job first.", severity="warning")
            return
        detail = self.query_one("#job-detail", TextArea)
        try:
            log = await asyncio.to_thread(
                service.get_job_log,
                int(_field(job, "id")),
                maximum_bytes=1_000_000,
            )
        except Exception as error:
            self.app.notify(str(error), title="Job log failed", severity="error")
            return
        detail.text = str(_field(log, "text"))
        self.app.notify(
            f"Loaded {_field(log, 'byte_count')} bytes from the selected job log.",
            title="Actions",
        )

    @work(exclusive=True, group="actions-caches-load")
    async def _load_caches(self) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            self.caches = list(
                await asyncio.to_thread(service.list_actions_caches, limit=500)
            )
        except Exception as error:
            self.app.notify(str(error), title="Actions caches unavailable", severity="warning")
            return
        self._render_caches(self.caches)

    def _render_caches(self, caches: tuple[object, ...] | list[object]) -> None:
        table = self._live("#caches-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(cache): index for index, cache in enumerate(self.caches)}
        for cache in caches:
            table.add_row(
                str(_field(cache, "id")),
                str(_field(cache, "key")),
                str(_field(cache, "ref")),
                str(_field(cache, "size_in_bytes")),
                str(_field(cache, "last_accessed_at")),
                key=str(source_indices[id(cache)]),
            )

    @on(SearchBar.Changed, "#github-caches-search")
    def _filter_caches(self, event: SearchBar.Changed) -> None:
        self._render_caches(
            _filtered(
                self.caches,
                event.state,
                "id",
                "key",
                "ref",
                "version",
                "size_in_bytes",
                "created_at",
                "last_accessed_at",
            )
        )

    def _selected_cache(self) -> object | None:
        source_index = _source_index(self.query_one("#caches-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.caches)):
            return None
        return self.caches[source_index]

    def _confirm_delete_cache(self) -> None:
        cache = self._selected_cache()
        if cache is None:
            self.app.notify("Select an Actions cache first.", severity="warning")
            return
        cache_id = int(_field(cache, "id"))
        key = str(_field(cache, "key"))
        ref = str(_field(cache, "ref"))
        size = int(_field(cache, "size_in_bytes", 0))

        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._delete_cache(cache_id)

        self.app.push_screen(
            DecisionDialog(
                f"Delete Actions cache {cache_id}?",
                f"Key: {key}\nRef: {ref}\nSize: {size} bytes. This cannot be undone.",
                confirm_label="Delete cache",
                destructive=True,
                typed_confirmation=str(cache_id),
                typed_prompt=f"Type cache id {cache_id} to authorize deletion:",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="actions-cache-mutate")
    async def _delete_cache(self, cache_id: int) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            await asyncio.to_thread(service.delete_actions_cache, cache_id)
        except Exception as error:
            self.app.notify(str(error), title="Cache deletion failed", severity="error")
            return
        self.app.notify(f"Deleted Actions cache {cache_id}.", title="Actions")
        self._load_caches()

    @work(exclusive=True, group="actions-artifacts-load")
    async def _load_artifacts(self) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            self.artifacts = list(
                await asyncio.to_thread(service.list_workflow_artifacts, limit=500)
            )
        except Exception as error:
            self.app.notify(str(error), title="Actions artifacts unavailable", severity="warning")
            return
        self._render_artifacts(self.artifacts)

    def _render_artifacts(self, artifacts: tuple[object, ...] | list[object]) -> None:
        table = self._live("#artifacts-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {
            id(artifact): index for index, artifact in enumerate(self.artifacts)
        }
        for artifact in artifacts:
            table.add_row(
                str(_field(artifact, "id")),
                str(_field(artifact, "name")),
                str(_field(artifact, "workflow_run_id", "") or "—"),
                str(_field(artifact, "head_branch", "") or "—"),
                str(_field(artifact, "size_in_bytes")),
                str(_field(artifact, "expires_at")),
                str(_field(artifact, "digest", "") or "unverified"),
                key=str(source_indices[id(artifact)]),
            )

    @on(SearchBar.Changed, "#github-artifacts-search")
    def _filter_artifacts(self, event: SearchBar.Changed) -> None:
        self._render_artifacts(
            _filtered(
                self.artifacts,
                event.state,
                "id",
                "name",
                "workflow_run_id",
                "head_branch",
                "head_sha",
                "digest",
                "expires_at",
            )
        )

    def _selected_artifact(self) -> object | None:
        source_index = _source_index(self.query_one("#artifacts-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.artifacts)):
            return None
        return self.artifacts[source_index]

    @work(exclusive=True, group="actions-artifact-download")
    async def _download_artifact(self) -> None:
        service = self._require_service()
        artifact = self._selected_artifact()
        destination = self.query_one("#artifact-destination", Input).value.strip()
        if service is None or artifact is None:
            self.app.notify("Select a workflow artifact first.", severity="warning")
            return
        if not destination:
            self.app.notify("Enter a destination path first.", severity="warning")
            return
        try:
            receipt = await asyncio.to_thread(
                service.download_workflow_artifact,
                int(_field(artifact, "id")),
                destination,
            )
        except Exception as error:
            self.app.notify(str(error), title="Artifact download failed", severity="error")
            return
        verification = "SHA-256 verified" if _field(receipt, "verified", False) else "saved"
        self.app.notify(
            f"{verification}: {_field(receipt, 'destination')} "
            f"({_field(receipt, 'byte_count')} bytes).",
            title="Actions artifact",
        )

    @work(exclusive=True, group="actions-mutate")
    async def _dispatch_workflow(self) -> None:
        service = self._require_service()
        workflow = self.query_one("#workflow-id", Input).value.strip()
        ref = self.query_one("#workflow-ref", Input).value.strip()
        inputs_text = self.query_one("#workflow-inputs", Input).value.strip()
        if service is None or not workflow or not ref:
            self.app.notify("Workflow ID and ref are required.", severity="warning")
            return
        inputs: dict[str, str] | None = None
        if inputs_text:
            try:
                raw_inputs = json.loads(inputs_text)
            except json.JSONDecodeError as error:
                self.app.notify(str(error), title="Invalid workflow inputs", severity="error")
                return
            if not isinstance(raw_inputs, dict) or any(
                not isinstance(key, str)
                or isinstance(value, (dict, list))
                or value is None
                for key, value in raw_inputs.items()
            ):
                self.app.notify(
                    "Workflow inputs must be a JSON object of string, number, or boolean values.",
                    title="Invalid workflow inputs",
                    severity="error",
                )
                return
            inputs = {
                key: str(value).lower() if isinstance(value, bool) else str(value)
                for key, value in raw_inputs.items()
            }
        try:
            if inputs is None:
                await asyncio.to_thread(
                    service.dispatch_workflow,
                    workflow,
                    ref=ref,
                )
            else:
                await asyncio.to_thread(
                    service.dispatch_workflow,
                    workflow,
                    ref=ref,
                    inputs=inputs,
                )
        except Exception as error:
            self.app.notify(str(error), title="Dispatch failed", severity="error")
            return
        self.app.notify("Workflow dispatch accepted.", title="Actions")
        self._load_actions()

    @work(exclusive=True, group="actions-mutate")
    async def _rerun(self, *, failed_only: bool = False) -> None:
        service = self._require_service()
        run = self._selected_run()
        if service is None or run is None:
            self.app.notify("Select a workflow run first.", severity="warning")
            return
        try:
            await asyncio.to_thread(
                service.rerun_workflow,
                _field(run, "id"),
                failed_only=failed_only,
            )
        except Exception as error:
            self.app.notify(str(error), title="Rerun failed", severity="error")
            return
        scope = "failed jobs" if failed_only else "all jobs"
        self.app.notify(f"Workflow rerun accepted for {scope}.", title="Actions")

    def _confirm_cancel(self) -> None:
        run = self._selected_run()
        if run is None:
            self.app.notify("Select a workflow run first.", severity="warning")
            return
        run_id = int(_field(run, "id"))

        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._cancel_run(run_id)

        self.app.push_screen(
            DecisionDialog(
                f"Cancel workflow run {run_id}?",
                "GitHub will request cancellation for jobs that are still running.",
                confirm_label="Cancel run",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="actions-mutate")
    async def _cancel_run(self, run_id: int) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            await asyncio.to_thread(service.cancel_workflow, run_id)
        except Exception as error:
            self.app.notify(str(error), title="Cancel failed", severity="error")
            return
        self.app.notify("Workflow cancellation accepted.", title="Actions")

    @work(exclusive=True, group="releases-load")
    async def _load_releases(self) -> None:
        service = self._require_service()
        if service is None:
            return
        results = await asyncio.gather(
            asyncio.to_thread(service.list_releases, limit=100),
            asyncio.to_thread(service.list_packages, limit=100),
            asyncio.to_thread(service.list_projects),
            return_exceptions=True,
        )
        inventories = ("Releases", "Packages", "Projects")
        values: list[list[object]] = []
        for inventory, result in zip(inventories, results, strict=True):
            if isinstance(result, BaseException):
                values.append([])
                self.app.notify(
                    str(result),
                    title=f"{inventory} unavailable",
                    severity="warning",
                )
            else:
                values.append(list(result))
        self.releases, self.packages, self.projects = values
        self._render_inventory(self.releases, self.packages, self.projects)

    def _render_inventory(
        self,
        releases: tuple[object, ...] | list[object],
        packages: tuple[object, ...] | list[object],
        projects: tuple[object, ...] | list[object],
    ) -> None:
        release_table = self._live("#releases-table", DataTable)
        if release_table is None:
            return
        package_table = self._live("#packages-table", DataTable)
        project_table = self._live("#projects-table", DataTable)
        if package_table is None or project_table is None:
            return
        release_table.clear()
        package_table.clear()
        project_table.clear()
        release_indices = {id(release): index for index, release in enumerate(self.releases)}
        package_indices = {id(package): index for index, package in enumerate(self.packages)}
        project_indices = {id(project): index for index, project in enumerate(self.projects)}
        for release in releases:
            release_table.add_row(
                str(_field(release, "tag_name")),
                str(_field(release, "name")),
                str(_field(release, "published_at")),
                str(len(_field(release, "assets", ()))),
                key=str(release_indices[id(release)]),
            )
        for package in packages:
            package_table.add_row(
                str(_field(package, "name")),
                str(_field(package, "package_type")),
                str(_field(package, "visibility")),
                str(_field(package, "version_count")),
                key=str(package_indices[id(package)]),
            )
        for project in projects:
            project_table.add_row(
                str(_field(project, "number")),
                str(_field(project, "title")),
                "closed" if _field(project, "closed", False) else "open",
                str(_field(project, "updated_at")),
                key=str(project_indices[id(project)]),
            )

    @on(SearchBar.Changed, "#github-releases-search")
    def _filter_inventory(self, event: SearchBar.Changed) -> None:
        releases = _filtered(
            self.releases,
            event.state,
            "tag_name",
            "name",
            "body",
            "published_at",
            "target_commitish",
        )
        packages = _filtered(
            self.packages,
            event.state,
            "name",
            "package_type",
            "visibility",
            "version_count",
        )
        projects = _filtered(
            self.projects,
            event.state,
            "number",
            "title",
            "closed",
            "updated_at",
        )
        self._render_inventory(releases, packages, projects)

    @on(DataTable.RowHighlighted, "#releases-table")
    def _release_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            release = self.releases[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        assets = "\n".join(
            f"- {_field(asset, 'name')} ({_field(asset, 'size')} bytes)"
            for asset in _field(release, "assets", ())
        )
        self.query_one("#release-detail", TextArea).text = (
            f"{_field(release, 'tag_name')} · {_field(release, 'name')}\n"
            f"Target: {_field(release, 'target_commitish')}\n"
            f"Draft: {_field(release, 'draft')} · "
            f"Prerelease: {_field(release, 'prerelease')}\n"
            f"URL: {_field(release, 'url')}\n\n"
            f"Assets\n{assets or 'No assets'}"
        )
        self.query_one("#release-tag", Input).value = str(_field(release, "tag_name"))
        self.query_one("#release-name", Input).value = str(_field(release, "name"))
        self.query_one("#release-target", Input).value = str(
            _field(release, "target_commitish")
        )
        state = (
            "draft"
            if _field(release, "draft", False)
            else "prerelease"
            if _field(release, "prerelease", False)
            else "published"
        )
        self.query_one("#release-state", Select).value = state
        self.query_one("#release-body", TextArea).text = str(_field(release, "body"))
        self.release_assets = list(_field(release, "assets", ()))
        self._render_release_assets(self.release_assets)

    def _selected_release(self) -> object | None:
        source_index = _source_index(self.query_one("#releases-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.releases)):
            return None
        return self.releases[source_index]

    def _render_release_assets(self, assets: tuple[object, ...] | list[object]) -> None:
        table = self._live("#release-assets-table", DataTable)
        if table is None:
            return
        table.clear()
        source_indices = {id(asset): index for index, asset in enumerate(self.release_assets)}
        for asset in assets:
            table.add_row(
                str(_field(asset, "id")),
                str(_field(asset, "name")),
                str(_field(asset, "state")),
                str(_field(asset, "size")),
                str(_field(asset, "download_count")),
                str(_field(asset, "digest", "") or "unverified"),
                key=str(source_indices[id(asset)]),
            )

    def _selected_release_asset(self) -> object | None:
        source_index = _source_index(self.query_one("#release-assets-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.release_assets)):
            return None
        return self.release_assets[source_index]

    def _release_form(self) -> tuple[str, str, str, str, str]:
        return (
            self.query_one("#release-tag", Input).value.strip(),
            self.query_one("#release-name", Input).value.strip(),
            self.query_one("#release-target", Input).value.strip(),
            str(self.query_one("#release-state", Select).value),
            self.query_one("#release-body", TextArea).text,
        )

    @work(exclusive=True, group="release-mutate")
    async def _create_release(self) -> None:
        service = self._require_service()
        tag, name, target, state, body = self._release_form()
        if service is None or not tag or not name or not target:
            self.app.notify("Tag, name, and target are required.", severity="warning")
            return
        try:
            release = await asyncio.to_thread(
                service.create_release,
                tag_name=tag,
                name=name,
                target_commitish=target,
                body=body,
                draft=state == "draft",
                prerelease=state == "prerelease",
            )
        except Exception as error:
            self.app.notify(str(error), title="Create release failed", severity="error")
            return
        self.app.notify(
            f"Created release {_field(release, 'tag_name')} as {state}.",
            title="Releases",
        )
        self._load_releases()

    @work(exclusive=True, group="release-mutate")
    async def _save_release(self, *, publish: bool = False) -> None:
        service = self._require_service()
        release = self._selected_release()
        tag, name, target, state, body = self._release_form()
        if service is None or release is None:
            self.app.notify("Select a release first.", severity="warning")
            return
        if not tag or not name or not target:
            self.app.notify("Tag, name, and target are required.", severity="warning")
            return
        draft = False if publish else state == "draft"
        prerelease = state == "prerelease"
        try:
            updated = await asyncio.to_thread(
                service.update_release,
                int(_field(release, "id")),
                tag_name=tag,
                name=name,
                target_commitish=target,
                body=body,
                draft=draft,
                prerelease=prerelease,
            )
        except Exception as error:
            self.app.notify(str(error), title="Update release failed", severity="error")
            return
        verb = "Published" if publish else "Updated"
        self.app.notify(f"{verb} release {_field(updated, 'tag_name')}.", title="Releases")
        self._load_releases()

    def _confirm_delete_release(self) -> None:
        release = self._selected_release()
        if release is None:
            self.app.notify("Select a release first.", severity="warning")
            return
        release_id = int(_field(release, "id"))
        tag = str(_field(release, "tag_name"))

        def handle_decision(confirmed: bool | None) -> None:
            if confirmed:
                self._delete_release(release_id, tag)

        self.app.push_screen(
            DecisionDialog(
                f"Delete release {tag}?",
                "The release record and its uploaded assets will be deleted. "
                "The Git tag is not deleted automatically.",
                confirm_label="Delete release",
                destructive=True,
                typed_confirmation=tag,
                typed_prompt=f"Type release tag {tag!r} to authorize deletion:",
            ),
            handle_decision,
        )

    @work(exclusive=True, group="release-mutate")
    async def _delete_release(self, release_id: int, tag: str) -> None:
        service = self._require_service()
        if service is None:
            return
        try:
            await asyncio.to_thread(service.delete_release, release_id)
        except Exception as error:
            self.app.notify(str(error), title="Delete release failed", severity="error")
            return
        self.app.notify(f"Deleted release {tag}; its Git tag was retained.", title="Releases")
        self._load_releases()

    @work(exclusive=True, group="release-asset-download")
    async def _download_release_asset(self) -> None:
        service = self._require_service()
        asset = self._selected_release_asset()
        destination = self.query_one("#release-asset-destination", Input).value.strip()
        if service is None or asset is None:
            self.app.notify("Select a release asset first.", severity="warning")
            return
        if not destination:
            self.app.notify("Enter a destination path first.", severity="warning")
            return
        try:
            receipt = await asyncio.to_thread(
                service.download_release_asset,
                int(_field(asset, "id")),
                destination,
            )
        except Exception as error:
            self.app.notify(str(error), title="Release asset download failed", severity="error")
            return
        verification = "SHA-256 verified" if _field(receipt, "verified", False) else "saved"
        self.app.notify(
            f"{verification}: {_field(receipt, 'destination')} "
            f"({_field(receipt, 'byte_count')} bytes).",
            title="Release asset",
        )

    @on(DataTable.RowHighlighted, "#packages-table")
    def _package_highlighted(self, event: DataTable.RowHighlighted) -> None:
        try:
            source_key = event.row_key.value
            if source_key is None:
                return
            package = self.packages[int(source_key)]
        except (IndexError, TypeError, ValueError):
            return
        self._load_package_versions(package)

    @work(exclusive=True, group="package-versions-load")
    async def _load_package_versions(self, package: object) -> None:
        service = self._require_service()
        if service is None:
            return
        detail = self.query_one("#package-detail", TextArea)
        detail.text = f"Loading versions for {_field(package, 'name')}…"
        try:
            versions = await asyncio.to_thread(
                service.list_package_versions,
                str(_field(package, "name")),
                package_type=str(_field(package, "package_type")),
                limit=100,
            )
        except Exception as error:
            detail.text = str(error)
            self.app.notify(str(error), title="Package versions unavailable", severity="warning")
            return
        self.package_versions = list(versions)
        rendered_versions = "\n".join(
            f"- {_field(version, 'name')} · {_field(version, 'created_at')} · "
            f"{json.dumps(_field(version, 'metadata', {}), default=str)}"
            for version in self.package_versions
        )
        detail.text = (
            f"{_field(package, 'name')} · {_field(package, 'package_type')} · "
            f"{_field(package, 'visibility')}\n"
            f"URL: {_field(package, 'url')}\n\n"
            f"Versions\n{rendered_versions or 'No versions were returned.'}\n\n"
            "Package file transfer is unavailable here because GitHub's Packages REST API "
            "exposes metadata and lifecycle operations, not registry content downloads. "
            "Use the package type's registry-native client."
        )

    def _execute_api(self) -> None:
        method = str(self.query_one("#api-method", Select).value)
        path = self.query_one("#api-path", Input).value.strip()
        body_text = self.query_one("#api-body", TextArea).text.strip()
        if not path:
            self.app.notify("Enter an API path.", severity="warning")
            return
        body: object | None = None
        if body_text:
            try:
                body = json.loads(body_text)
            except json.JSONDecodeError as error:
                self.app.notify(str(error), title="Invalid JSON", severity="error")
                return
        if method != "GET":

            def handle_decision(confirmed: bool | None) -> None:
                if confirmed:
                    self._run_api(method, path, body, True)

            self.app.push_screen(
                DecisionDialog(
                    f"Execute {method} {path}?",
                    "This generic request may change GitHub data. Review the path and body first.",
                    confirm_label="Execute mutation",
                ),
                handle_decision,
            )
        else:
            self._run_api(method, path, body, False)

    @work(exclusive=True, group="api")
    async def _run_api(
        self,
        method: str,
        path: str,
        body: object | None,
        confirm_mutation: bool,
    ) -> None:
        service = self._require_service()
        if service is None:
            return
        result_widget = self.query_one("#api-result", TextArea)
        result_widget.text = "Request running…"
        try:
            response = await asyncio.to_thread(
                service.explore_rest,
                method=method,
                path=path,
                body=body,
                confirm_mutation=confirm_mutation,
            )
        except Exception as error:
            result_widget.text = str(error)
            self.app.notify(str(error), title="API request failed", severity="error")
            return
        result_widget.text = json.dumps(_field(response, "data", None), indent=2, default=str)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        actions: dict[str, Callable[[], object]] = {
            "issues-refresh": self._load_issues,
            "issue-create": self._create_issue,
            "issue-comment": self._comment_issue,
            "issue-close": self._confirm_close_issue,
            "prs-refresh": self._load_pull_requests,
            "pr-create": self._create_pr,
            "pr-approve": lambda: self._review_pr("APPROVE"),
            "pr-comment-review": lambda: self._review_pr("COMMENT"),
            "pr-request-changes": lambda: self._review_pr("REQUEST_CHANGES"),
            "pr-review-comment-create": self._create_pr_review_comment,
            "pr-merge": self._confirm_merge_pr,
            "rules-refresh": self._load_branch_rules,
            "notifications-refresh": self._load_notifications,
            "notification-mark-read": self._mark_notification_read,
            "actions-refresh": self._load_actions,
            "actions-apply-filters": self._load_actions,
            "workflow-dispatch": self._dispatch_workflow,
            "action-rerun": self._rerun,
            "action-rerun-failed": lambda: self._rerun(failed_only=True),
            "action-job-log": self._inspect_job_log,
            "action-cancel": self._confirm_cancel,
            "caches-refresh": self._load_caches,
            "cache-delete": self._confirm_delete_cache,
            "artifacts-refresh": self._load_artifacts,
            "artifact-download": self._download_artifact,
            "releases-refresh": self._load_releases,
            "release-create": self._create_release,
            "release-save": self._save_release,
            "release-publish": lambda: self._save_release(publish=True),
            "release-delete": self._confirm_delete_release,
            "release-asset-download": self._download_release_asset,
            "api-execute": self._execute_api,
        }
        action = actions.get(event.button.id or "")
        if action:
            button_id = event.button.id or "unknown"
            single_flight_actions.start(
                self, event.button, f"github:{button_id}", action
            )
