"""Real-Git acceptance for history, branch, stash, and tag parity controls."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import DataTable, Input, Select, SelectionList, TabbedContent, TextArea

from desktop_material_tui.ui.screens.dialogs import DecisionDialog

from .helpers import run_desktop_material, type_text


async def _wait_for_workers(app: object, pilot: object) -> None:
    await app.workers.wait_for_complete()  # type: ignore[attr-defined]
    await pilot.pause()  # type: ignore[attr-defined]
    await app.workers.wait_for_complete()  # type: ignore[attr-defined]
    await pilot.pause()  # type: ignore[attr-defined]


async def _replace_input(pilot: object, selector: str, value: str) -> None:
    target = pilot.app.screen.query_one(selector)  # type: ignore[attr-defined]
    target.scroll_visible(animate=False, force=True, immediate=True)
    await pilot.pause()  # type: ignore[attr-defined]
    assert await pilot.click(selector)  # type: ignore[attr-defined]
    await pilot.press("ctrl+shift+a", "backspace")  # type: ignore[attr-defined]
    await type_text(pilot, value)  # type: ignore[arg-type]


async def _click_visible(app: object, pilot: object, selector: str) -> None:
    target = app.query_one(selector)  # type: ignore[attr-defined]
    target.scroll_visible(animate=False, force=True, immediate=True)
    await pilot.pause()  # type: ignore[attr-defined]
    assert await pilot.click(selector)  # type: ignore[attr-defined]


def _row_for_value(table: DataTable[object], column: int, expected: str) -> int:
    return next(
        row
        for row in range(table.row_count)
        if str(table.get_row_at(row)[column]) == expected
    )


@pytest.mark.asyncio
async def test_commit_coauthor_control_writes_real_trailer(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        changes = app.query_one("#changes-list", SelectionList)
        changes.select("README.md")
        assert await pilot.click("#changes-stage")
        await _wait_for_workers(app, pilot)

        await _replace_input(pilot, "#commit-summary", "Commit with pair pilot")
        await _replace_input(
            pilot,
            "#commit-coauthors",
            "Pair Pilot <pair@example.test>",
        )
        assert await pilot.click("#commit-submit")
        await _wait_for_workers(app, pilot)

    message = deterministic_repository.git("show", "-s", "--format=%B", "HEAD").stdout
    assert "Co-authored-by: Pair Pilot <pair@example.test>" in message


@pytest.mark.asyncio
async def test_file_history_blame_and_reviewed_revert(
    deterministic_repository: DeterministicRepository,
) -> None:
    deterministic_repository.git("stash", "push", "-m", "clean before history acceptance")

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "history-tab"
        await pilot.pause()
        await _replace_input(pilot, "#history-file-path", "notes.txt")
        assert await pilot.click("#history-file")
        await _wait_for_workers(app, pilot)

        table = app.query_one("#history-table", DataTable)
        assert table.row_count == 2
        assert "Second fixture commit" in str(table.get_row_at(0)[1])

        assert await pilot.click("#history-blame")
        await _wait_for_workers(app, pilot)
        detail = app.query_one("#history-detail", TextArea)
        assert "desktop-material@example.invalid" in detail.text
        assert "second revision" in detail.text

        table.move_cursor(row=0)
        await pilot.pause()
        assert await pilot.click("#history-revert")
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        assert "Second fixture commit" in app.screen.body
        assert await pilot.click("#decision-confirm")
        await _wait_for_workers(app, pilot)

    assert (deterministic_repository.path / "notes.txt").read_text(encoding="utf-8") == (
        "first revision\n"
    )


@pytest.mark.asyncio
async def test_branch_sort_indicator_reviewed_merge_and_rename(
    deterministic_repository: DeterministicRepository,
) -> None:
    deterministic_repository.git("stash", "push", "-m", "clean before branch acceptance")
    deterministic_repository.git("switch", "feature/pilot")
    feature_file = deterministic_repository.path / "feature.txt"
    feature_file.write_text("feature payload\n", encoding="utf-8")
    deterministic_repository.git("add", "--", "feature.txt")
    deterministic_repository.git("commit", "--no-verify", "-m", "Feature branch payload")
    feature_oid = deterministic_repository.git("rev-parse", "HEAD").stdout.strip()
    deterministic_repository.git("switch", "main")

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "branches-tab"
        await pilot.pause()
        table = app.query_one("#branches-table", DataTable)
        feature_row = _row_for_value(table, 1, "feature/pilot")
        assert str(table.get_row_at(feature_row)[6]) == "local only"

        sort = app.query_one("#branches-sort", Select)
        sort.value = "alphabetical"
        await pilot.pause()
        names = [str(table.get_row_at(row)[1]) for row in range(table.row_count)]
        assert names == sorted(names, key=str.casefold)

        feature_row = _row_for_value(table, 1, "feature/pilot")
        table.move_cursor(row=feature_row)
        await pilot.pause()
        app.query_one("#branches-merge").scroll_visible(
            animate=False,
            force=True,
            immediate=True,
        )
        await pilot.pause()
        assert await pilot.click("#branches-merge")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        body = app.screen.body
        assert feature_oid in body
        assert "feature.txt" in body
        assert await pilot.click("#decision-confirm")
        await _wait_for_workers(app, pilot)
        assert feature_file.is_file()

        table = app.query_one("#branches-table", DataTable)
        feature_row = _row_for_value(table, 1, "feature/pilot")
        table.move_cursor(row=feature_row)
        await pilot.pause()
        await _replace_input(pilot, "#branch-new-name", "feature/renamed-pilot")
        await _click_visible(app, pilot, "#branch-rename")
        await _wait_for_workers(app, pilot)
        assert "feature/renamed-pilot" in {
            str(table.get_row_at(row)[1]) for row in range(table.row_count)
        }


@pytest.mark.asyncio
async def test_selective_stash_review_and_exact_branch_from(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "stashes-tab"
        await pilot.pause()
        await _replace_input(pilot, "#stash-message", "reviewed README stash")
        paths = app.query_one("#stash-paths", TextArea)
        paths.scroll_visible(animate=False, force=True, immediate=True)
        await pilot.pause()
        assert await pilot.click("#stash-paths")
        await type_text(pilot, "README.md")
        assert paths.text == "README.md"

        assert await pilot.click("#stash-create")
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        assert "README.md" in app.screen.body
        assert await pilot.click("#decision-confirm")
        await _wait_for_workers(app, pilot)

        table = app.query_one("#stashes-table", DataTable)
        assert table.row_count == 2
        assert "reviewed README stash" in str(table.get_row_at(0)[2])
        table.move_cursor(row=0)
        await pilot.pause()
        assert "Object:" in app.query_one("#stash-detail", TextArea).text

        await _replace_input(pilot, "#stash-branch-name", "recovered/reviewed-stash")
        assert await pilot.click("#stashes-branch")
        await _wait_for_workers(app, pilot)

    assert deterministic_repository.git("branch", "--show-current").stdout.strip() == (
        "recovered/reviewed-stash"
    )
    assert (deterministic_repository.path / "README.md").read_text(encoding="utf-8").endswith(
        "Working tree change for Pilot.\n"
    )


@pytest.mark.asyncio
async def test_tag_creation_and_typed_local_deletion(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.query_one("#main-tabs", TabbedContent).active = "tools-tab"
        await pilot.pause()
        await _replace_input(pilot, "#tag-name", "v-ui-test")
        await _replace_input(pilot, "#tag-target", "HEAD")
        await _replace_input(pilot, "#tag-message", "Reviewed UI tag")
        assert await pilot.click("#tag-create")
        await _wait_for_workers(app, pilot)

        table = app.query_one("#tags-table", DataTable)
        assert table.row_count == 1
        assert str(table.get_row_at(0)[0]) == "v-ui-test"
        table.move_cursor(row=0)
        await pilot.pause()
        assert await pilot.click("#tag-delete")
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        confirmation = app.screen.query_one("#decision-confirmation", Input)
        assert confirmation.has_focus
        await type_text(pilot, "delete-tag")
        assert await pilot.click("#decision-confirm")
        await _wait_for_workers(app, pilot)

    assert deterministic_repository.git("tag", "--list", "v-ui-test").stdout == ""
