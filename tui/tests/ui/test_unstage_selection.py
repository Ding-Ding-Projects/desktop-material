"""Real-Git coverage of complete, narrowly selected unstage operations."""

from __future__ import annotations

import pytest
from git_repository import DeterministicRepository
from textual.widgets import SelectionList

from .helpers import run_desktop_material


@pytest.mark.asyncio
@pytest.mark.parametrize("change_kind", ["rename", "modify", "delete", "copy"])
async def test_unstage_selection_preserves_unrelated_index_changes(
    deterministic_repository: DeterministicRepository,
    change_kind: str,
) -> None:
    repository = deterministic_repository
    original = repository.path / "notes.txt"
    original_bytes = original.read_bytes()
    selected = "notes.txt"
    expected_staged = {"README.md"}
    if change_kind == "rename":
        selected = "renamed.txt"
        repository.git("mv", "notes.txt", selected)
    elif change_kind == "delete":
        repository.git("rm", "notes.txt")
    elif change_kind == "modify":
        original.write_bytes(original_bytes + b"selected modification\n")
        repository.git("add", "--", "notes.txt")
    else:
        selected = "copied.txt"
        (repository.path / selected).write_bytes(original_bytes)
        original.write_bytes(original_bytes + b"independent source modification\n")
        repository.git("config", "status.renames", "copies")
        repository.git("add", "--", "notes.txt", selected)
        expected_staged.add("notes.txt")
    repository.git("add", "--", "README.md")
    index_before = repository.git("ls-files", "--stage").stdout

    async with run_desktop_material(repository.path) as (app, pilot):
        app.query_one("#changes-list", SelectionList).select(selected)
        assert await pilot.click("#changes-unstage")
        await app.workers.wait_for_complete()
        await pilot.pause()
        await app.workers.wait_for_complete()

    staged = repository.git("diff", "--cached", "--name-only", "-z").stdout
    assert set(staged.rstrip("\0").split("\0")) == expected_staged
    index_after = repository.git("ls-files", "--stage").stdout
    for path in expected_staged:
        assert next(line for line in index_before.splitlines() if line.endswith(f"\t{path}")) in (
            index_after.splitlines()
        )
    if change_kind in {"rename", "copy"}:
        assert (repository.path / selected).read_bytes() == original_bytes
    if change_kind == "rename":
        assert not original.exists()
        assert repository.git("show", ":notes.txt").stdout.encode() == original_bytes
