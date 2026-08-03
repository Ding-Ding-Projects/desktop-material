from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from textual.app import App, ComposeResult
from textual.widgets import DataTable, Input, TabbedContent, TextArea

from desktop_material_tui.ui.screens.github import GitHubPane
from desktop_material_tui.ui.widgets.search_bar import SearchBar, SearchState


class _GitHubApp(App[None]):
    def compose(self) -> ComposeResult:
        yield GitHubPane(id="github-pane")


class _FakeGitHub:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def dispatch_workflow(
        self,
        workflow: str,
        *,
        ref: str,
        inputs: dict[str, str] | None = None,
    ) -> object:
        self.calls.append(("dispatch", (workflow, ref, inputs)))
        return SimpleNamespace(accepted=True)

    def rerun_workflow(self, run_id: int, *, failed_only: bool = False) -> object:
        self.calls.append(("rerun", (run_id, failed_only)))
        return SimpleNamespace(accepted=True)

    def get_job_log(self, job_id: int, *, maximum_bytes: int) -> object:
        self.calls.append(("job_log", (job_id, maximum_bytes)))
        return SimpleNamespace(text="setup\ntests passed\n", byte_count=19)

    def delete_actions_cache(self, cache_id: int) -> object:
        self.calls.append(("delete_cache", cache_id))
        return SimpleNamespace(accepted=True)

    def list_actions_caches(self, *, limit: int) -> tuple[object, ...]:
        self.calls.append(("list_caches", limit))
        return ()

    def list_workflows(self) -> tuple[object, ...]:
        return ()

    def list_workflow_runs(self, **_filters: object) -> tuple[object, ...]:
        return ()

    def list_workflow_artifacts(self, *, limit: int) -> tuple[object, ...]:
        self.calls.append(("list_artifacts", limit))
        return ()

    def list_releases(self, *, limit: int) -> tuple[object, ...]:
        return ()

    def list_packages(self, *, limit: int) -> tuple[object, ...]:
        return ()

    def list_projects(self) -> tuple[object, ...]:
        return ()

    def download_workflow_artifact(self, artifact_id: int, destination: str) -> object:
        self.calls.append(("download_artifact", (artifact_id, destination)))
        return SimpleNamespace(
            verified=True,
            destination=destination,
            byte_count=42,
        )

    def create_release(self, **values: object) -> object:
        self.calls.append(("create_release", values))
        return SimpleNamespace(tag_name=values["tag_name"])

    def update_release(self, release_id: int, **values: object) -> object:
        self.calls.append(("update_release", (release_id, values)))
        return SimpleNamespace(tag_name=values["tag_name"])

    def list_package_versions(
        self,
        package_name: str,
        *,
        package_type: str,
        limit: int,
    ) -> tuple[object, ...]:
        self.calls.append(("package_versions", (package_name, package_type, limit)))
        return (
            SimpleNamespace(
                name="sha256:abc",
                created_at="2026-08-02",
                metadata={"container": {"tags": ["latest"]}},
            ),
        )


@pytest.mark.asyncio
async def test_actions_inventory_filters_dispatch_rerun_and_inspects_logs(
    tmp_path: Path,
) -> None:
    app = _GitHubApp()
    async with app.run_test(size=(140, 46), notifications=False) as pilot:
        pane = app.query_one("#github-pane", GitHubPane)
        fake = _FakeGitHub()
        pane.github = fake

        pane.runs = [
            SimpleNamespace(
                id=20,
                name="CI",
                display_title="Linux TUI",
                event="workflow_dispatch",
                status="completed",
                conclusion="failure",
                branch="main",
            )
        ]
        pane._render_actions([], pane.runs)
        pane.jobs = [
            SimpleNamespace(
                id=30,
                name="Linux",
                status="completed",
                conclusion="failure",
                runner_name="GitHub Actions 1",
                steps=(),
            )
        ]
        pane._render_jobs(pane.jobs)

        app.query_one("#workflow-id", Input).value = "release.yml"
        app.query_one("#workflow-ref", Input).value = "main"
        app.query_one("#workflow-inputs", Input).value = '{"deploy":true,"count":2}'
        pane._dispatch_workflow()
        await app.workers.wait_for_complete()
        pane._rerun(failed_only=True)
        await app.workers.wait_for_complete()
        pane._inspect_job_log()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert (
            "dispatch",
            ("release.yml", "main", {"deploy": "true", "count": "2"}),
        ) in fake.calls
        assert ("rerun", (20, True)) in fake.calls
        assert ("job_log", (30, 1_000_000)) in fake.calls
        assert "tests passed" in app.query_one("#job-detail", TextArea).text

        pane.artifacts = [
            SimpleNamespace(
                id=51,
                name="linux-installer",
                workflow_run_id=20,
                head_branch="main",
                head_sha="a" * 40,
                size_in_bytes=42,
                expires_at="2026-09-01",
                digest="sha256:abc",
            ),
            SimpleNamespace(
                id=52,
                name="windows-installer",
                workflow_run_id=20,
                head_branch="main",
                head_sha="b" * 40,
                size_in_bytes=84,
                expires_at="2026-09-01",
                digest="sha256:def",
            ),
        ]
        pane._render_artifacts(pane.artifacts)
        app.query_one("#github-tabs", TabbedContent).active = "github-actions"
        app.query_one("#github-actions-tabs", TabbedContent).active = "actions-artifacts"
        await pilot.pause()
        search = app.query_one("#github-artifacts-search", SearchBar)
        search.set_state(SearchState(query="linux"), emit=True)
        await pilot.pause()
        assert app.query_one("#artifacts-table", DataTable).row_count == 1

        destination = tmp_path / "linux-installer.zip"
        app.query_one("#artifact-destination", Input).value = str(destination)
        pane._download_artifact()
        await app.workers.wait_for_complete()
        assert ("download_artifact", (51, str(destination))) in fake.calls


@pytest.mark.asyncio
async def test_cache_delete_is_reviewed_and_release_package_actions_are_wired() -> None:
    app = _GitHubApp()
    async with app.run_test(size=(140, 46), notifications=False) as pilot:
        pane = app.query_one("#github-pane", GitHubPane)
        fake = _FakeGitHub()
        pane.github = fake

        pane.caches = [
            SimpleNamespace(
                id=41,
                key="linux-main",
                ref="refs/heads/main",
                version="abc",
                size_in_bytes=512,
                created_at="2026-08-01",
                last_accessed_at="2026-08-02",
            )
        ]
        pane._render_caches(pane.caches)
        pane._confirm_delete_cache()
        await pilot.pause()
        assert "linux-main" in str(getattr(app.screen, "body", ""))
        app.screen.query_one("#decision-confirmation", Input).value = "41"
        await pilot.pause()
        await pilot.click("#decision-confirm")
        await app.workers.wait_for_complete()
        assert ("delete_cache", 41) in fake.calls

        app.query_one("#release-tag", Input).value = "v2.0.0"
        app.query_one("#release-name", Input).value = "2.0.0"
        app.query_one("#release-target", Input).value = "main"
        app.query_one("#release-body", TextArea).text = "Release notes"
        pane._create_release()
        await app.workers.wait_for_complete()
        assert any(name == "create_release" for name, _ in fake.calls)

        package = SimpleNamespace(
            name="desktop-material",
            package_type="container",
            visibility="public",
            url="https://github.com/orgs/acme/packages/container/package/desktop-material",
        )
        pane._load_package_versions(package)
        await app.workers.wait_for_complete()
        assert ("package_versions", ("desktop-material", "container", 100)) in fake.calls
        detail = app.query_one("#package-detail", TextArea).text
        assert "sha256:abc" in detail
        assert "registry-native client" in detail
