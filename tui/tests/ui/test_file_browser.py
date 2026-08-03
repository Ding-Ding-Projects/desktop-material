from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from textual.app import App, ComposeResult
from textual.widgets import DataTable, Input, Label, TextArea

from desktop_material_tui.ui.screens.file_browser import FileBrowserPane

from .helpers import type_text


class _FileBrowserApp(App[None]):
    def __init__(self, repository: Path) -> None:
        super().__init__()
        self.repository = repository
        self.opened: Path | None = None

    def compose(self) -> ComposeResult:
        yield FileBrowserPane(id="files-pane")

    async def on_mount(self) -> None:
        self.query_one(FileBrowserPane).bind_repository(
            SimpleNamespace(path=self.repository)
        )

    def on_file_browser_pane_open_requested(
        self, event: FileBrowserPane.OpenRequested
    ) -> None:
        self.opened = event.path


def _repository(tmp_path: Path) -> Path:
    root = tmp_path / "repository"
    (root / ".git").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / "docs" / "guide.md").write_text("# Guide\nHello\n", encoding="utf-8")
    (root / "main.py").write_text("print('hello')\n", encoding="utf-8")
    (root / ".hidden").write_text("visible on request\n", encoding="utf-8")
    return root


@pytest.mark.asyncio
async def test_file_browser_lists_searches_previews_and_opens(tmp_path: Path) -> None:
    root = _repository(tmp_path)
    app = _FileBrowserApp(root)

    async with app.run_test(size=(100, 32), notifications=False) as pilot:
        await app.workers.wait_for_complete()
        table = app.query_one("#files-table", DataTable)
        assert table.row_count == 3
        assert "3 of 3" in str(app.query_one("#files-status", Label).render())

        query = app.query_one("#files-query", Input)
        query.focus()
        await type_text(pilot, "guide")
        await pilot.pause()
        assert table.row_count == 1
        assert "1 matching of 3" in str(app.query_one("#files-status", Label).render())

        table.focus()
        await pilot.press("enter")
        await app.workers.wait_for_complete()
        preview = app.query_one("#files-preview", TextArea)
        assert "# Guide" in preview.text

        await pilot.click("#files-open-editor")
        await pilot.pause()
        assert app.opened == root / "docs" / "guide.md"


@pytest.mark.asyncio
async def test_hidden_toggle_and_binary_preview_are_safe(tmp_path: Path) -> None:
    root = _repository(tmp_path)
    (root / "asset.bin").write_bytes(b"PNG\0control")
    app = _FileBrowserApp(root)

    async with app.run_test(size=(78, 24), notifications=False) as pilot:
        await app.workers.wait_for_complete()
        table = app.query_one("#files-table", DataTable)
        assert table.row_count == 4

        await pilot.click("#files-hidden")
        await app.workers.wait_for_complete()
        assert table.row_count == 5

        query = app.query_one("#files-query", Input)
        query.focus()
        await type_text(pilot, "asset.bin")
        await pilot.pause()
        table.focus()
        await pilot.press("enter")
        await app.workers.wait_for_complete()
        preview = app.query_one("#files-preview", TextArea)
        assert "Binary file" in preview.text
        assert "PNG" not in preview.text
