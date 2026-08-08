from __future__ import annotations

from types import SimpleNamespace

import pytest
from textual.app import App, ComposeResult
from textual.widgets import DataTable, Input, TabbedContent, TextArea

from desktop_material_tui.ui.screens.github import GitHubPane
from desktop_material_tui.ui.widgets.search_bar import SearchBar, SearchState


class _GitHubApp(App[None]):
    def compose(self) -> ComposeResult:
        yield GitHubPane(id="github-pane")


def _pull_request() -> SimpleNamespace:
    return SimpleNamespace(
        number=9,
        state=SimpleNamespace(value="OPEN"),
        title="Bound the review workspace",
        body="Review every API surface without loading the ocean.",
        url="https://github.com/acme/widgets/pull/9",
        head_ref="feature/review",
        head_sha="a" * 40,
        base_ref="main",
        draft=False,
        merge_state_status="CLEAN",
        review_decision="REVIEW_REQUIRED",
        reviews=(SimpleNamespace(state="COMMENTED"),),
        comments=(),
    )


class _FakeGitHub:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []
        self.pr = _pull_request()

    def get_pull_request(self, number: int) -> object:
        self.calls.append(("get_pr", number))
        return self.pr

    def list_pull_request_files(self, number: int, *, limit: int) -> tuple[object, ...]:
        self.calls.append(("files", (number, limit)))
        return (
            SimpleNamespace(
                sha="a" * 40,
                filename="src/review.py",
                status="modified",
                additions=5,
                deletions=2,
                changes=7,
                previous_filename=None,
                blob_url="https://github.com/acme/widgets/blob/a/src/review.py",
                patch="@@ -1 +1 @@\n-old\n+new",
                patch_truncated=False,
            ),
        )

    def list_pull_request_checks(self, ref: str, *, limit: int) -> tuple[object, ...]:
        self.calls.append(("checks", (ref, limit)))
        return (
            SimpleNamespace(
                id=301,
                source="check-run",
                name="Linux",
                status="completed",
                conclusion="success",
                description="All 22 checks passed",
                details_url="https://github.com/acme/widgets/actions/runs/1",
                started_at="2026-08-02T12:00:00Z",
                completed_at="2026-08-02T12:01:00Z",
            ),
        )

    def list_pull_request_review_comments(
        self,
        number: int,
        *,
        limit: int,
    ) -> tuple[object, ...]:
        self.calls.append(("comments", (number, limit)))
        return (
            SimpleNamespace(
                id=401,
                body="Keep this exact-head scoped.",
                path="src/review.py",
                line=7,
                side="RIGHT",
                commit_id="a" * 40,
                author=SimpleNamespace(login="reviewer"),
                url="https://github.com/acme/widgets/pull/9#discussion_r401",
            ),
        )

    def review_pull_request(self, number: int, **values: object) -> object:
        self.calls.append(("review", (number, values)))
        return SimpleNamespace(state=values["event"])

    def create_pull_request_review_comment(self, number: int, **values: object) -> object:
        self.calls.append(("line_comment", (number, values)))
        return SimpleNamespace(id=402)

    def list_effective_branch_rules(
        self,
        branch: str,
        *,
        limit: int,
    ) -> tuple[object, ...]:
        self.calls.append(("rules", (branch, limit)))
        return (
            SimpleNamespace(
                type="required_status_checks",
                ruleset_source_type="Repository",
                ruleset_source="acme/widgets",
                ruleset_id=77,
                parameters={"strict_required_status_checks_policy": True},
            ),
        )

    def list_repository_notifications(self, **values: object) -> tuple[object, ...]:
        self.calls.append(("notifications", values))
        return (
            SimpleNamespace(
                id="987",
                unread=True,
                reason="review_requested",
                updated_at="2026-08-02T12:00:00Z",
                last_read_at=None,
                subject_title="Bound the review workspace",
                subject_type="PullRequest",
                subject_url="https://api.github.com/repos/acme/widgets/pulls/9",
                latest_comment_url=None,
                repository_full_name="acme/widgets",
            ),
        )

    def mark_notification_read(self, thread_id: str) -> object:
        self.calls.append(("mark_read", thread_id))
        return SimpleNamespace(accepted=True)


@pytest.mark.asyncio
async def test_pull_request_review_workspace_uses_exact_head_and_bounded_lists() -> None:
    app = _GitHubApp()
    async with app.run_test(size=(150, 52), notifications=False) as pilot:
        pane = app.query_one("#github-pane", GitHubPane)
        fake = _FakeGitHub()
        pane.github = fake
        pane.pull_requests = [fake.pr]
        pane._render_pull_requests(pane.pull_requests)
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert app.query_one("#pr-files-table", DataTable).row_count == 1
        assert app.query_one("#pr-checks-table", DataTable).row_count == 1
        assert app.query_one("#pr-review-comments-table", DataTable).row_count == 1
        assert ("files", (9, 500)) in fake.calls
        assert ("checks", ("a" * 40, 500)) in fake.calls

        app.query_one("#pr-review-body", TextArea).text = "Please tighten the bound."
        pane._review_pr("REQUEST_CHANGES")
        await app.workers.wait_for_complete()
        await pilot.pause()
        await app.workers.wait_for_complete()
        review_call = next(value for name, value in fake.calls if name == "review")
        assert isinstance(review_call, tuple)
        review_number, review_values = review_call
        assert isinstance(review_values, dict)
        assert review_number == 9
        assert review_values["body"] == "Please tighten the bound."
        assert review_values["commit_id"] == "a" * 40


@pytest.mark.asyncio
async def test_pull_request_review_returns_no_selection_after_table_is_removed() -> None:
    app = _GitHubApp()
    async with app.run_test(size=(150, 52), notifications=False) as pilot:
        pane = app.query_one("#github-pane", GitHubPane)
        fake = _FakeGitHub()
        pane.github = fake
        pane.pull_requests = [fake.pr]
        pane._render_pull_requests(pane.pull_requests)
        await pilot.pause()

        app.query_one("#prs-table", DataTable).remove()
        await pilot.pause()

        assert pane._selected_pr() is None

        app.query_one("#pr-review-comment-path", Input).value = "src/review.py"
        app.query_one("#pr-review-comment-line", Input).value = "7"
        app.query_one("#pr-review-comment-body", Input).value = "Line-level note."
        pane._create_pr_review_comment()
        await app.workers.wait_for_complete()
        assert not any(name == "line_comment" for name, _value in fake.calls)


@pytest.mark.asyncio
async def test_rules_and_notifications_have_independent_search_and_scoped_mutation() -> None:
    app = _GitHubApp()
    async with app.run_test(size=(150, 52), notifications=False) as pilot:
        pane = app.query_one("#github-pane", GitHubPane)
        fake = _FakeGitHub()
        pane.github = fake

        app.query_one("#rules-branch", Input).value = "feature/review"
        pane._load_branch_rules()
        pane._load_notifications()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert app.query_one("#rules-table", DataTable).row_count == 1
        assert app.query_one("#notifications-table", DataTable).row_count == 1
        assert ("rules", ("feature/review", 500)) in fake.calls

        app.query_one("#github-tabs", TabbedContent).active = "github-pull-requests"
        app.query_one("#github-pr-tabs", TabbedContent).active = "pr-rules"
        await pilot.pause()
        rules_search = app.query_one("#github-rules-search", SearchBar)
        rules_search.set_state(SearchState(query="no-match"), emit=True)
        await pilot.pause()
        assert app.query_one("#rules-table", DataTable).row_count == 0
        pane._render_branch_rules(pane.effective_branch_rules)
        assert app.query_one("#rules-table", DataTable).row_count == 0

        app.query_one("#github-pr-tabs", TabbedContent).active = "pr-notifications"
        await pilot.pause()
        notifications_search = app.query_one("#github-notifications-search", SearchBar)
        notifications_search.set_state(SearchState(query="review"), emit=True)
        await pilot.pause()
        assert app.query_one("#notifications-table", DataTable).row_count == 1
        pane._render_notifications(pane.repository_notifications)
        assert app.query_one("#notifications-table", DataTable).row_count == 1

        pane._mark_notification_read()
        await app.workers.wait_for_complete()
        assert ("mark_read", "987") in fake.calls
