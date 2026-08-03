"""Clipping-resilient toolbar and form-layout acceptance matrix."""

from __future__ import annotations

from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.app import App, ComposeResult
from textual.pilot import Pilot
from textual.widget import Widget
from textual.widgets import Button, Input, Select, TabbedContent

from desktop_material_tui.app import DesktopMaterialTUI
from desktop_material_tui.ui.widgets.responsive_layout import (
    ResponsiveFormRow,
    ScrollableToolbar,
)

_SIZES = ((80, 24), (100, 30), (120, 36), (160, 48))
_LANGUAGES = (
    ("en", "Desktop Material TUI"),
    ("yue-HK", "Desktop Material 終端版"),
    ("bilingual", "Desktop Material TUI"),
)
_MAIN_SURFACES = (
    ("changes-tab", "#changes-pane"),
    ("history-tab", "#history-pane"),
    ("branches-tab", "#branches-pane"),
    ("stashes-tab", "#stashes-pane"),
    ("tools-tab", "#tools-pane"),
    ("cheap-lfs-tab", "#cheap-lfs-pane"),
    ("advanced-tab", "#advanced-pane"),
    ("github-tab", "#github-pane"),
    ("regex-tab", "#regex-pane"),
    ("help-tab", "#help-pane"),
    ("settings-tab", "#settings-pane"),
    ("notifications-tab", "#notifications-pane"),
)
_NESTED_SURFACES = {
    "advanced-tab": (
        "#advanced-tabs",
        (
            "advanced-worktrees-tab",
            "advanced-submodules-tab",
            "advanced-sparse-tab",
            "advanced-recovery-tab",
            "advanced-commands-tab",
        ),
    ),
    "github-tab": (
        "#github-tabs",
        (
            "github-issues",
            "github-pull-requests",
            "github-actions",
            "github-releases",
            "github-api",
        ),
    ),
}


def _focusable_children(toolbar: ScrollableToolbar) -> tuple[Widget, ...]:
    return tuple(child for child in toolbar.children if child.can_focus and child.display)


def _assert_toolbar_has_reachable_overflow(
    toolbar: ScrollableToolbar,
) -> None:
    """Prove clipping is either absent or backed by a real horizontal path."""

    viewport = toolbar.scrollable_content_region
    assert viewport.width > 0
    assert viewport.height > 0

    children = tuple(child for child in toolbar.children if child.display)
    assert children
    overflowed = any(not viewport.contains_region(child.region) for child in children)
    if overflowed:
        assert toolbar.max_scroll_x > 0
        assert toolbar.show_horizontal_scrollbar


def _assert_form_layout(row: ResponsiveFormRow, *, narrow: bool) -> None:
    expected_layout = "vertical" if narrow else "horizontal"
    assert row.styles.layout.name == expected_layout
    children = tuple(child for child in row.children if child.display)
    assert children
    if narrow:
        assert len({child.region.y for child in children}) == len(children)
        assert all(child.region.x == row.content_region.x for child in children)
        assert all(child.region.width <= row.content_region.width for child in children)
    else:
        assert len({child.region.y for child in children}) == 1


async def _assert_active_surface(
    app: DesktopMaterialTUI,
    pilot: Pilot[None],
    pane_selector: str,
    *,
    narrow: bool,
) -> None:
    pane = app.query_one(pane_selector)
    for _attempt in range(4):
        if pane.is_on_screen:
            break
        await pilot.pause()
    assert pane.is_on_screen

    for toolbar in pane.query(ScrollableToolbar):
        if not toolbar.is_on_screen:
            continue
        _assert_toolbar_has_reachable_overflow(toolbar)
        focusable = _focusable_children(toolbar)
        if toolbar.max_scroll_x and focusable:
            toolbar.scroll_home(animate=False)
            focusable[-1].focus()
            await pilot.pause()
            await pilot.pause()
            visible = focusable[-1].region.intersection(toolbar.scrollable_content_region)
            assert visible.width == min(
                focusable[-1].region.width,
                toolbar.scrollable_content_region.width,
            )
            assert visible.height == focusable[-1].region.height

    for row in pane.query(ResponsiveFormRow):
        if not row.is_on_screen:
            continue
        _assert_form_layout(row, narrow=narrow)


@pytest.mark.parametrize(("language", "expected_title"), _LANGUAGES)
@pytest.mark.asyncio
async def test_every_main_surface_across_size_and_language_matrix(
    deterministic_repository: DeterministicRepository,
    language: str,
    expected_title: str,
) -> None:
    """Exercise every main and nested surface at every supported terminal size."""

    app = DesktopMaterialTUI(
        deterministic_repository.path,
        language_override=language,
    )
    async with app.run_test(size=(160, 48), notifications=False) as pilot:
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert expected_title in app.title

        main_tabs = app.query_one("#main-tabs", TabbedContent)
        visited: set[tuple[tuple[int, int], str, str | None]] = set()
        for size in _SIZES:
            await pilot.resize_terminal(*size)
            await pilot.pause()
            narrow = size[0] < 120
            assert app.has_class("narrow") is narrow

            for tab_id, pane_selector in _MAIN_SURFACES:
                app.set_focus(None, scroll_visible=False)
                main_tabs.active = tab_id
                await pilot.pause()
                nested = _NESTED_SURFACES.get(tab_id)
                if nested is None:
                    await _assert_active_surface(
                        app,
                        pilot,
                        pane_selector,
                        narrow=narrow,
                    )
                    visited.add((size, tab_id, None))
                    continue

                nested_tabs = app.query_one(nested[0], TabbedContent)
                for nested_id in nested[1]:
                    app.set_focus(None, scroll_visible=False)
                    nested_tabs.active = nested_id
                    await pilot.pause()
                    await _assert_active_surface(
                        app,
                        pilot,
                        pane_selector,
                        narrow=narrow,
                    )
                    visited.add((size, tab_id, nested_id))

        expected_visits = sum(
            len(_NESTED_SURFACES.get(tab_id, ("", (None,)))[1])
            for tab_id, _pane_selector in _MAIN_SURFACES
        ) * len(_SIZES)
        assert len(visited) == expected_visits


class _LayoutProbe(App[None]):
    """Small surface for deterministic focus and representative label checks."""

    CSS = """
    Screen {
        layout: vertical;
    }

    #overflow-toolbar {
        width: 38;
    }
    """

    def compose(self) -> ComposeResult:
        with ScrollableToolbar(id="overflow-toolbar"):
            yield Button("Refresh repository state · 重新整理儲存庫狀態", id="probe-first")
            yield Button("Open in external editor · 喺外部編輯器開啟", id="probe-middle")
            yield Button(
                "Close tabs not containing this text · 關閉不含此文字的分頁",
                id="probe-last",
            )
        with ResponsiveFormRow(id="probe-form"):
            yield Input(placeholder="Repository name · 儲存庫名稱", id="probe-input")
            yield Select(
                (("Every matching workspace · 每個相符工作區", "all"),),
                value="all",
                allow_blank=False,
                id="probe-select",
            )
            yield Button("Apply safely · 安全套用", id="probe-apply")


async def _tab_to_widget(
    app: _LayoutProbe,
    pilot: Pilot[None],
    target: Widget,
    *,
    maximum_steps: int,
) -> None:
    for _step in range(maximum_steps):
        if app.focused is target:
            return
        await pilot.press("tab")
        await pilot.pause()
    pytest.fail(f"Tab traversal did not reach {target.id!r}")


@pytest.mark.asyncio
async def test_long_bilingual_toolbar_focus_scroll_and_form_reflow() -> None:
    """Keyboard focus follows overflow and narrow rows stack without clipping."""

    app = _LayoutProbe()
    async with app.run_test(size=(80, 24), notifications=False) as pilot:
        await pilot.pause()
        toolbar = app.query_one("#overflow-toolbar", ScrollableToolbar)
        first = app.query_one("#probe-first", Button)
        last = app.query_one("#probe-last", Button)
        assert toolbar.max_scroll_x > 0
        assert toolbar.show_horizontal_scrollbar

        toolbar.scroll_home(animate=False)
        first.focus()
        await pilot.pause()
        assert toolbar.scroll_x == 0
        await _tab_to_widget(app, pilot, last, maximum_steps=3)
        assert last.has_focus
        assert toolbar.scroll_x > 0
        visible = last.region.intersection(toolbar.scrollable_content_region)
        assert visible.width == min(last.region.width, toolbar.scrollable_content_region.width)

        row = app.query_one("#probe-form", ResponsiveFormRow)
        app.add_class("narrow")
        row._sync_responsive_mode()
        await pilot.pause()
        _assert_form_layout(row, narrow=True)

        app.remove_class("narrow")
        row._sync_responsive_mode()
        await pilot.pause()
        _assert_form_layout(row, narrow=False)


def test_screen_modules_use_responsive_containers() -> None:
    """Keep new screen-level toolbars and form rows on the shared foundation."""

    screens = Path(__file__).parents[2] / "src" / "desktop_material_tui" / "ui" / "screens"
    for name in (
        "repository_panes.py",
        "github.py",
        "advanced.py",
        "cheap_lfs.py",
        "regex_builder.py",
        "notifications.py",
        "settings.py",
        "help.py",
        "changelog.py",
    ):
        source = (screens / name).read_text(encoding="utf-8")
        assert 'Horizontal(classes="screen-toolbar")' not in source
        assert 'Horizontal(classes="form-row")' not in source
