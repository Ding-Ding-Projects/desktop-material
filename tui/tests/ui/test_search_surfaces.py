"""Search-bar integration across the shell's principal data surfaces."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from textual.widgets import DataTable, Input, ListView, TextArea

from desktop_material_tui.ui.screens.github import GitHubPane
from desktop_material_tui.ui.screens.notifications import NotificationCentrePane
from desktop_material_tui.ui.widgets.search_bar import SearchBar, SearchState

from .helpers import run_desktop_material


@pytest.mark.asyncio
async def test_repository_notification_and_github_search_bars_filter_models(
    tmp_path: Path,
) -> None:
    async with run_desktop_material() as (app, pilot):
        alpha = tmp_path / "alpha-project"
        beta = tmp_path / "beta-project"
        app.repository_services = {alpha: object(), beta: object()}
        app._refresh_repository_list()
        await app.workers.wait_for_complete()

        repository_search = app.query_one("#repositories-search", SearchBar)
        repository_search.set_state(SearchState(query="beta"), emit=True)
        # Dispatch Changed before waiting for the exclusive refresh worker it starts.
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()
        repositories = app.query_one("#repository-list", ListView)
        assert len(repositories.children) == 1
        assert "beta-project" in repositories.children[0].path.name

        notifications = app.query_one(
            "#notifications-pane",
            NotificationCentrePane,
        )
        notifications.set_notifications(
            (
                SimpleNamespace(
                    level="info",
                    title="Fetch complete",
                    message="origin is current",
                    source="git",
                    created_at="2026-07-27T12:00:00Z",
                    is_read=True,
                    action=None,
                ),
                SimpleNamespace(
                    level="error",
                    title="Push failed",
                    message="remote rejected",
                    source="git",
                    created_at="2026-07-27T12:01:00Z",
                    is_read=False,
                    action=None,
                ),
            )
        )
        notification_search = app.query_one("#notifications-search", SearchBar)
        notification_search.set_state(
            SearchState(query=r"Push\s+failed", mode="regex"),
            emit=True,
        )
        await pilot.pause()
        assert app.query_one("#notifications-table", DataTable).row_count == 1

        github = app.query_one("#github-pane", GitHubPane)
        github.issues = [
            SimpleNamespace(
                number=1,
                state="OPEN",
                title="Alpha issue",
                body="first",
                labels=("bug",),
                updated_at="2026-07-27",
            ),
            SimpleNamespace(
                number=2,
                state="OPEN",
                title="Beta interaction",
                body="mouse click",
                labels=("enhancement",),
                updated_at="2026-07-27",
            ),
        ]
        github._render_issues(github.issues)
        issue_search = app.query_one("#github-issues-search", SearchBar)
        issue_search.set_state(SearchState(query="mouse click"), emit=True)
        await pilot.pause()
        issue_table = app.query_one("#issues-table", DataTable)
        assert issue_table.row_count == 1
        assert github._selected_issue().number == 2


@pytest.mark.asyncio
async def test_github_forms_call_keyword_only_service_contracts() -> None:
    class FakeGitHub:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def create_issue(self, *, title: str, body: str) -> object:
            self.calls.append(("create_issue", (title, body)))
            return SimpleNamespace(number=7)

        def list_issues(self, *, limit: int) -> tuple[object, ...]:
            return ()

        def create_pull_request(
            self,
            *,
            title: str,
            head: str,
            base: str,
            body: str,
        ) -> object:
            self.calls.append(("create_pr", (title, head, base, body)))
            return SimpleNamespace(number=8)

        def list_pull_requests(self, *, limit: int) -> tuple[object, ...]:
            return ()

        def dispatch_workflow(self, workflow: str, *, ref: str) -> object:
            self.calls.append(("dispatch", (workflow, ref)))
            return SimpleNamespace()

        def list_workflows(self) -> tuple[object, ...]:
            return ()

        def list_workflow_runs(self, *, limit: int) -> tuple[object, ...]:
            return ()

        def explore_rest(
            self,
            *,
            method: str,
            path: str,
            body: object,
            confirm_mutation: bool,
        ) -> object:
            self.calls.append(
                (
                    "api",
                    (method, path, body, confirm_mutation),
                )
            )
            return SimpleNamespace(data={"ok": True})

    async with run_desktop_material() as (app, _pilot):
        github = app.query_one("#github-pane", GitHubPane)
        fake = FakeGitHub()
        github.github = fake

        app.query_one("#issue-title", Input).value = "Keyboard works"
        app.query_one("#issue-body", TextArea).text = "Created from the TUI"
        github._create_issue()
        await app.workers.wait_for_complete()

        app.query_one("#pr-title", Input).value = "TUI pull request"
        app.query_one("#pr-head", Input).value = "feature/tui"
        app.query_one("#pr-base", Input).value = "main"
        app.query_one("#pr-body", TextArea).text = "Body"
        github._create_pr()
        await app.workers.wait_for_complete()

        app.query_one("#workflow-id", Input).value = "release.yml"
        app.query_one("#workflow-ref", Input).value = "main"
        github._dispatch_workflow()
        await app.workers.wait_for_complete()

        app.query_one("#api-path", Input).value = "/repos/example/project"
        github._execute_api()
        await app.workers.wait_for_complete()

        assert ("create_issue", ("Keyboard works", "Created from the TUI")) in fake.calls
        assert (
            "create_pr",
            ("TUI pull request", "feature/tui", "main", "Body"),
        ) in fake.calls
        assert ("dispatch", ("release.yml", "main")) in fake.calls
        assert (
            "api",
            ("GET", "/repos/example/project", None, False),
        ) in fake.calls
        assert '"ok": true' in app.query_one("#api-result", TextArea).text
