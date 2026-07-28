"""GitHub issues, pull requests, Actions, releases, packages, Projects, and API UI."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Callable
from typing import Any

from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
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


class GitHubPane(Vertical):
    """Networked GitHub workspace backed by the authenticated `gh` CLI."""

    git_service: Any | None = None
    github: Any | None = None
    issues: list[object]
    pull_requests: list[object]
    workflows: list[object]
    runs: list[object]
    releases: list[object]
    packages: list[object]
    projects: list[object]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.issues = []
        self.pull_requests = []
        self.workflows = []
        self.runs = []
        self.releases = []
        self.packages = []
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
                with Horizontal(classes="screen-toolbar"):
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
                    with Horizontal(classes="form-row"):
                        yield Button("Create issue", id="issue-create", variant="primary")
                        yield Input(
                            placeholder="Comment on selected issue",
                            id="issue-comment-body",
                            select_on_focus=False,
                        )
                        yield Button("Comment", id="issue-comment")

            with TabPane("Pull requests", id="github-pull-requests"):
                yield SearchBar(
                    surface_id="github-pull-requests",
                    placeholder="Search pull requests…",
                    id="github-pr-search",
                )
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="prs-refresh")
                    yield Button("Approve", id="pr-approve")
                    yield Button("Request changes", id="pr-request-changes")
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
                with Vertical(classes="form-panel"):
                    yield Input(
                        placeholder="Pull request title",
                        id="pr-title",
                        select_on_focus=False,
                    )
                    with Horizontal(classes="form-row"):
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
                    yield Button("Create pull request", id="pr-create", variant="primary")

            with TabPane("Actions", id="github-actions"):
                yield SearchBar(
                    surface_id="github-actions",
                    placeholder="Search workflows and runs…",
                    id="github-actions-search",
                )
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="actions-refresh")
                    yield Button("Rerun", id="action-rerun")
                    yield Button("Cancel…", id="action-cancel", variant="error")
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
                with Horizontal(classes="form-row"):
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
                    yield Button("Dispatch workflow", id="workflow-dispatch", variant="primary")

            with TabPane("Releases & packages", id="github-releases"):
                yield SearchBar(
                    surface_id="github-releases",
                    placeholder="Search releases, packages, and projects…",
                    id="github-releases-search",
                )
                with Horizontal(classes="screen-toolbar"):
                    yield Button("Refresh", id="releases-refresh")
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
                with Horizontal(classes="screen-split"):
                    yield DataTable(
                        cursor_type="row",
                        zebra_stripes=True,
                        id="packages-table",
                        classes="screen-list",
                    )
                    yield DataTable(
                        cursor_type="row",
                        zebra_stripes=True,
                        id="projects-table",
                        classes="screen-detail",
                    )

            with TabPane("API explorer", id="github-api"):
                yield Static(
                    "Responses are bounded. Read operations run directly; mutations require "
                    "an explicit decision and reject secret-looking fields.",
                    classes="help-copy",
                )
                with Horizontal(classes="form-row"):
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
        self.query_one("#workflows-table", DataTable).add_columns("ID", "Workflow", "State", "Path")
        self.query_one("#runs-table", DataTable).add_columns(
            "ID", "Run", "Status", "Conclusion", "Branch"
        )
        self.query_one("#releases-table", DataTable).add_columns(
            "Tag", "Name", "Published", "Assets"
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
        self._load_actions()
        self._load_releases()

    def _require_service(self) -> Any | None:
        if self.github is None:
            self.app.notify("Connect a GitHub-backed repository first.", severity="warning")
        return self.github

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
        table = self.query_one("#issues-table", DataTable)
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
        self.query_one("#issue-title", Input).value = ""
        self.query_one("#issue-body", TextArea).text = ""
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
        self.query_one("#issue-comment-body", Input).value = ""
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
        self._render_pull_requests(self.pull_requests)

    def _render_pull_requests(
        self,
        pull_requests: tuple[object, ...] | list[object],
    ) -> None:
        table = self.query_one("#prs-table", DataTable)
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
        self.query_one("#pr-detail", TextArea).text = (
            f"#{_field(pr, 'number')} · {_state(pr)}"
            f"{' · DRAFT' if _field(pr, 'draft', False) else ''}\n"
            f"{_field(pr, 'title')}\n"
            f"{_field(pr, 'head_ref')} → {_field(pr, 'base_ref')}\n"
            f"Merge: {_field(pr, 'merge_state_status', '—')} · "
            f"Review: {_field(pr, 'review_decision', '—')}\n"
            f"URL: {_field(pr, 'url')}\n\n{_field(pr, 'body')}"
        )

    def _selected_pr(self) -> object | None:
        source_index = _source_index(self.query_one("#prs-table", DataTable))
        if source_index is None or not (0 <= source_index < len(self.pull_requests)):
            return None
        return self.pull_requests[source_index]

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
        try:
            from ...infrastructure.github import ReviewDecision

            decision = ReviewDecision(event_name)
            await asyncio.to_thread(
                service.review_pull_request,
                _field(pr, "number"),
                event=decision,
                body="",
            )
        except Exception as error:
            self.app.notify(str(error), title="Review failed", severity="error")
            return
        self.app.notify(f"Review {event_name.lower()} submitted.", title="GitHub")
        self._load_pull_requests()

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
        try:
            workflows, runs = await asyncio.gather(
                asyncio.to_thread(service.list_workflows),
                asyncio.to_thread(service.list_workflow_runs, limit=100),
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
        workflows_table = self.query_one("#workflows-table", DataTable)
        runs_table = self.query_one("#runs-table", DataTable)
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

    @work(exclusive=True, group="actions-mutate")
    async def _dispatch_workflow(self) -> None:
        service = self._require_service()
        workflow = self.query_one("#workflow-id", Input).value.strip()
        ref = self.query_one("#workflow-ref", Input).value.strip()
        if service is None or not workflow or not ref:
            self.app.notify("Workflow ID and ref are required.", severity="warning")
            return
        try:
            await asyncio.to_thread(
                service.dispatch_workflow,
                workflow,
                ref=ref,
            )
        except Exception as error:
            self.app.notify(str(error), title="Dispatch failed", severity="error")
            return
        self.app.notify("Workflow dispatch accepted.", title="Actions")
        self._load_actions()

    @work(exclusive=True, group="actions-mutate")
    async def _rerun(self) -> None:
        service = self._require_service()
        run = self._selected_run()
        if service is None or run is None:
            self.app.notify("Select a workflow run first.", severity="warning")
            return
        try:
            await asyncio.to_thread(service.rerun_workflow, _field(run, "id"))
        except Exception as error:
            self.app.notify(str(error), title="Rerun failed", severity="error")
            return
        self.app.notify("Workflow rerun accepted.", title="Actions")

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
        release_table = self.query_one("#releases-table", DataTable)
        package_table = self.query_one("#packages-table", DataTable)
        project_table = self.query_one("#projects-table", DataTable)
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
            f"URL: {_field(release, 'url')}\n\n{_field(release, 'body')}\n\n"
            f"Assets\n{assets or 'No assets'}"
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
            "pr-request-changes": lambda: self._review_pr("REQUEST_CHANGES"),
            "pr-merge": self._confirm_merge_pr,
            "actions-refresh": self._load_actions,
            "workflow-dispatch": self._dispatch_workflow,
            "action-rerun": self._rerun,
            "action-cancel": self._confirm_cancel,
            "releases-refresh": self._load_releases,
            "api-execute": self._execute_api,
        }
        action = actions.get(event.button.id or "")
        if action:
            action()
