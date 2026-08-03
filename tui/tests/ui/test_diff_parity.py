"""Real-Git acceptance for bounded terminal review and diff modes."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.widgets import (
    DataTable,
    Markdown,
    RichLog,
    Select,
    SelectionList,
    Static,
    TextArea,
    Tree,
)

from desktop_material_tui.ui.screens.repository_panes import ChangesPane

from .helpers import rendered_text, run_desktop_material


async def _wait_for_workers(app: object, pilot: object) -> None:
    await app.workers.wait_for_complete()  # type: ignore[attr-defined]
    await pilot.pause()  # type: ignore[attr-defined]
    await app.workers.wait_for_complete()  # type: ignore[attr-defined]
    await pilot.pause()  # type: ignore[attr-defined]


def _highlight_path(changes: SelectionList[str], path: str) -> None:
    changes.highlighted = next(
        index
        for index in range(changes.option_count)
        if changes.get_option_at_index(index).value == path
    )


def _tree_paths(tree: Tree[str | None]) -> set[str]:
    paths: set[str] = set()
    pending = list(tree.root.children)
    while pending:
        node = pending.pop()
        if node.data is not None:
            paths.add(node.data)
        pending.extend(node.children)
    return paths


def _png(path: Path, color: tuple[int, int, int]) -> None:
    width = height = 2
    row = bytes((*color, *color))
    scanlines = bytes((0,)) + row + bytes((0,)) + row

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(scanlines))
        + chunk(b"IEND", b"")
    )


@pytest.mark.asyncio
async def test_tree_word_context_syntax_table_and_safe_markdown_controls(
    deterministic_repository: DeterministicRepository,
) -> None:
    root = deterministic_repository.path
    deterministic_repository.git("stash", "push", "-m", "clean before diff acceptance")
    nested = root / "nested"
    nested.mkdir()
    csv_path = nested / "menu.csv"
    markdown_path = nested / "guide.md"
    csv_path.write_text("name,note\nHar Gow,one\n", encoding="utf-8")
    markdown_path.write_text("# Before\n", encoding="utf-8")
    deterministic_repository.git("add", "--", "nested/menu.csv", "nested/guide.md")
    deterministic_repository.git("commit", "--no-verify", "-m", "Add diff fixtures")
    csv_path.write_text("name,note\nHar Gow,two words\n", encoding="utf-8")
    markdown_path.write_text(
        "# Safe preview\n\n[external](https://example.test/resource)\n",
        encoding="utf-8",
    )

    async with run_desktop_material(root, size=(160, 48)) as (app, pilot):
        changes = app.query_one("#changes-list", SelectionList)
        pane = app.query_one("#changes-pane", ChangesPane)
        _highlight_path(changes, "nested/menu.csv")
        await _wait_for_workers(app, pilot)

        app.query_one("#diff-word-mode", Select).value = "word"
        app.query_one("#diff-context", Select).value = "20"
        await _wait_for_workers(app, pilot)
        assert pane.diff_context_lines == 20
        assert "[-Gow,one-]" in pane.current_diff_text
        assert "{+Gow,two words+}" in pane.current_diff_text

        app.query_one("#diff-render-mode", Select).value = "syntax"
        await pilot.pause()
        assert app.query_one("#changes-syntax-diff", RichLog).display
        assert not app.query_one("#changes-diff", TextArea).display

        app.query_one("#changes-file-view", Select).value = "tree"
        await pilot.pause()
        tree = app.query_one("#changes-tree", Tree)
        assert tree.display
        assert _tree_paths(tree) == {"nested/guide.md", "nested/menu.csv"}
        assert any(str(node.label) == "nested" for node in tree.root.children)

        app.query_one("#diff-preview-mode", Select).value = "table"
        await _wait_for_workers(app, pilot)
        table = app.query_one("#changes-structured-table", DataTable)
        assert table.display
        assert table.row_count == 2
        assert "one → two words" in tuple(str(value) for value in table.get_row_at(1))

        app.query_one("#changes-file-view", Select).value = "flat"
        app.query_one("#diff-preview-mode", Select).value = "markdown"
        _highlight_path(changes, "nested/guide.md")
        await _wait_for_workers(app, pilot)
        markdown = app.query_one("#changes-markdown", Markdown)
        assert markdown.display
        assert markdown._open_links is False
        assert "# Safe preview" in markdown._markdown
        assert "https://example.test/resource" in markdown._markdown


@pytest.mark.asyncio
async def test_exact_png_before_after_preview_and_explicit_unsupported_formats(
    deterministic_repository: DeterministicRepository,
) -> None:
    root = deterministic_repository.path
    deterministic_repository.git("stash", "push", "-m", "clean before image acceptance")
    asset = root / "asset.png"
    _png(asset, (255, 0, 0))
    deterministic_repository.git("add", "--", "asset.png")
    deterministic_repository.git("commit", "--no-verify", "-m", "Add image fixture")
    _png(asset, (0, 0, 255))
    (root / "vector.svg").write_text("<svg></svg>\n", encoding="utf-8")

    async with run_desktop_material(root, size=(160, 48)) as (app, pilot):
        changes = app.query_one("#changes-list", SelectionList)
        _highlight_path(changes, "asset.png")
        app.query_one("#diff-preview-mode", Select).value = "image"
        await _wait_for_workers(app, pilot)

        before = app.query_one("#changes-image-before", Static)
        after = app.query_one("#changes-image-after", Static)
        status = app.query_one("#changes-image-status", Static)
        assert "▀" in rendered_text(before)
        assert "▀" in rendered_text(after)
        assert "exact bounded Git/worktree bytes" in rendered_text(status)

        _highlight_path(changes, "vector.svg")
        await _wait_for_workers(app, pilot)
        assert "TGA and SVG remain unavailable" in rendered_text(status)
