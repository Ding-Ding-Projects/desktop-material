"""Folder browsing and path-paste acceptance for repository dialogs."""

from __future__ import annotations

from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual import events
from textual.widgets import Button, Input

from desktop_material_tui.app import DesktopMaterialTUI
from desktop_material_tui.infrastructure.persistence import XDGPaths
from desktop_material_tui.ui.screens.dialogs import (
    CloneDialog,
    CloneRequest,
    FolderDirectoryTree,
    PathDialog,
    PathInput,
)

from .helpers import assert_visible_inside_app, run_desktop_material, type_text


async def _wait_for_root_children(
    tree: FolderDirectoryTree,
    pilot: object,
) -> None:
    for _attempt in range(20):
        if tree.root.children:
            return
        await pilot.pause(0.05)  # type: ignore[attr-defined]
    raise AssertionError("folder browser root did not load")


@pytest.mark.asyncio
async def test_path_input_normalizes_both_paste_routes_immediately(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        await pilot.press("ctrl+o")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)
        path_input = app.screen.query_one("#path-input", PathInput)

        path_input.value = ""
        await app.on_event(events.Paste(f'"{deterministic_repository.path}"'))
        await pilot.pause()
        assert path_input.value == str(deterministic_repository.path)

        path_input.value = ""
        app.copy_to_clipboard(f"'{deterministic_repository.path}'")
        await pilot.press("ctrl+v")
        await pilot.pause()
        assert path_input.value == str(deterministic_repository.path)

        path_input.value = ""
        app.copy_to_clipboard(f'"{deterministic_repository.path}"\nignored')
        await pilot.press("ctrl+v")
        await pilot.pause()
        assert path_input.value == str(deterministic_repository.path)

        path_input.value = ""
        await type_text(pilot, '"unmatched')
        assert path_input.value == '"unmatched'

        path_input.value = '""'
        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)
        assert path_input.value == ""
        assert path_input.has_focus

        path_input.value = f'"{deterministic_repository.path}"'
        await pilot.press("enter")
        await pilot.pause()
        assert not isinstance(app.screen, PathDialog)
        assert app.active_repository == deterministic_repository.path.resolve()


@pytest.mark.asyncio
async def test_clone_destination_uses_normalized_path_input(
    deterministic_repository: DeterministicRepository,
) -> None:
    captured: list[CloneRequest | None] = []
    clone_target = deterministic_repository.path.parent / "clone-target"

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.push_screen(
            CloneDialog(working_directory=deterministic_repository.path.parent),
            captured.append,
        )
        await pilot.pause()
        assert isinstance(app.screen, CloneDialog)

        url_input = app.screen.query_one("#clone-url", Input)
        destination_input = app.screen.query_one("#clone-destination", PathInput)
        assert destination_input.value == str(
            deterministic_repository.path.parent.resolve() / "repository"
        )
        url_input.value = "https://github.com/example/repository.git"
        await pilot.pause()
        assert destination_input.value == str(
            deterministic_repository.path.parent.resolve() / "repository"
        )
        assert await pilot.click("#clone-destination")
        await pilot.pause()
        destination_input.select_all()
        await app.on_event(events.Paste(f'  "{clone_target}"  '))
        await pilot.pause()
        assert destination_input.value == str(clone_target)

        url_input.value = "https://github.com/example/renamed.git"
        await pilot.pause()
        assert destination_input.value == str(clone_target)

        destination_input.value = "''"
        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, CloneDialog)
        assert destination_input.value == ""
        assert destination_input.has_focus
        assert captured == []

        app.copy_to_clipboard(f"'{clone_target}'")
        await pilot.press("ctrl+v")
        await pilot.pause()
        assert destination_input.value == str(clone_target)

        await pilot.press("enter")
        await pilot.pause()
        assert captured == [
            CloneRequest(
                url="https://github.com/example/renamed.git",
                destination=str(clone_target),
            )
        ]


@pytest.mark.asyncio
async def test_clone_browser_chooses_parent_and_rejects_occupied_destination(
    deterministic_repository: DeterministicRepository,
) -> None:
    captured: list[CloneRequest | None] = []

    async with run_desktop_material(
        deterministic_repository.path,
        size=(80, 24),
    ) as (app, pilot):
        app.push_screen(
            CloneDialog(working_directory=deterministic_repository.path.parent),
            captured.append,
        )
        await pilot.pause()
        assert isinstance(app.screen, CloneDialog)
        card = app.screen.query_one("#clone-card")
        tree = app.screen.query_one("#clone-browser", FolderDirectoryTree)
        destination = app.screen.query_one("#clone-destination", PathInput)
        url = app.screen.query_one("#clone-url", Input)
        assert card.has_class("browser-open")
        assert tree.display

        url.value = "git@github.com:example/fresh-clone.git"
        await pilot.pause()
        await _wait_for_root_children(tree, pilot)
        repository_node = next(
            child
            for child in tree.root.children
            if child.data is not None
            and child.data.path.resolve() == deterministic_repository.path.resolve()
        )
        tree.move_cursor(repository_node)
        tree.focus()
        await pilot.press("enter")
        await pilot.pause()
        assert destination.value == str(
            deterministic_repository.path.resolve() / "fresh-clone"
        )

        destination.value = str(deterministic_repository.path)
        assert await pilot.click("#clone-submit")
        await pilot.pause()
        assert captured == []
        assert "already contains" in str(app.screen.query_one("#clone-error").render())
        assert destination.has_focus

        assert await pilot.click("#clone-browser-working")
        await pilot.pause()
        assert Path(tree.path) == deterministic_repository.path.parent.resolve()

        for selector in (
            "#clone-card",
            "#clone-url",
            "#clone-destination-row",
            "#clone-destination",
            "#clone-browse",
            "#clone-browser-toolbar",
            "#clone-browser-up",
            "#clone-browser-home",
            "#clone-browser-working",
            "#clone-browser",
            "#clone-cancel",
            "#clone-submit",
        ):
            app.screen.query_one(selector).scroll_visible(
                animate=False,
                top=True,
                force=True,
                immediate=True,
            )
            await pilot.pause()
            assert_visible_inside_app(app.screen, selector)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_clone_dialog_rejects_credentials_embedded_in_http_url(
    deterministic_repository: DeterministicRepository,
) -> None:
    captured: list[CloneRequest | None] = []

    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app.push_screen(
            CloneDialog(working_directory=deterministic_repository.path.parent),
            captured.append,
        )
        await pilot.pause()
        url = app.screen.query_one("#clone-url", Input)
        url.value = "https://token@example.com/owner/repository.git"

        assert await pilot.click("#clone-submit")
        await pilot.pause()

        assert captured == []
        assert "credentials" in str(app.screen.query_one("#clone-error").render())
        assert url.has_focus


@pytest.mark.asyncio
async def test_folder_browser_mouse_keyboard_and_open_flow(
    deterministic_repository: DeterministicRepository,
) -> None:
    visible_file = deterministic_repository.path.parent / "browse-me.txt"
    visible_file.write_text("selecting me chooses my parent", encoding="utf-8")

    async with run_desktop_material(
        deterministic_repository.path,
        size=(80, 24),
    ) as (app, pilot):
        await pilot.press("ctrl+o")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)

        tree = app.screen.query_one("#path-browser", FolderDirectoryTree)
        path_input = app.screen.query_one("#path-input", PathInput)
        assert tree.display
        assert app.screen.query_one("#path-card").has_class("browser-open")

        await _wait_for_root_children(tree, pilot)
        child_names = {
            child.data.path.name for child in tree.root.children if child.data is not None
        }
        assert visible_file.name in child_names

        file_node = next(
            child
            for child in tree.root.children
            if child.data is not None and child.data.path.resolve() == visible_file.resolve()
        )
        tree.move_cursor(file_node)
        tree.focus()
        await pilot.press("enter")
        await pilot.pause()
        assert path_input.value == str(visible_file.parent.resolve())

        path_input.value = ""
        assert await pilot.click("#path-browser", offset=(4, 1))
        await pilot.pause()
        selected_path = tree.cursor_node.data.path.resolve()
        expected_path = selected_path if selected_path.is_dir() else selected_path.parent
        assert path_input.value == str(expected_path)

        await pilot.press("space")
        await pilot.pause()
        repository_node = next(
            child
            for child in tree.root.children
            if child.data is not None
            and child.data.path.resolve() == deterministic_repository.path.resolve()
        )
        tree.move_cursor(repository_node)
        tree.focus()
        await pilot.press("enter")
        await pilot.pause()
        assert path_input.value == str(deterministic_repository.path.resolve())
        assert path_input.cursor_position == len(path_input.value)
        assert path_input.selection.is_empty

        assert await pilot.click("#path-browse")
        await pilot.pause()
        assert path_input.has_focus
        await type_text(pilot, "-edited")
        assert path_input.value == f"{deterministic_repository.path.resolve()}-edited"
        path_input.value = str(deterministic_repository.path.resolve())

        for selector in (
            "#path-card",
            "#path-entry-row",
            "#path-browse",
            "#path-browser-toolbar",
            "#path-browser-up",
            "#path-browser-home",
            "#path-browser",
            "#path-cancel",
            "#path-open",
        ):
            assert_visible_inside_app(app.screen, selector)  # type: ignore[arg-type]

        assert await pilot.click("#path-open")
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert not isinstance(app.screen, PathDialog)
        assert app.active_repository == deterministic_repository.path.resolve()


@pytest.mark.asyncio
async def test_folder_browser_controls_are_keyboard_reachable(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(
        deterministic_repository.path,
        size=(80, 24),
    ) as (app, pilot):
        await pilot.press("ctrl+o")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)

        await pilot.press("tab")
        browse = app.screen.query_one("#path-browse", Button)
        assert browse.has_focus
        tree = app.screen.query_one("#path-browser", FolderDirectoryTree)
        original_root = Path(tree.path)

        await pilot.press("tab")
        up = app.screen.query_one("#path-browser-up", Button)
        assert up.has_focus
        await pilot.press("enter")
        await pilot.pause()
        assert Path(tree.path) == original_root.parent

        await pilot.press("tab")
        home = app.screen.query_one("#path-browser-home", Button)
        assert home.has_focus
        await pilot.press("enter")
        await pilot.pause()
        assert Path(tree.path) == Path.home()


@pytest.mark.asyncio
async def test_opening_repository_subdirectory_uses_one_canonical_root(
    deterministic_repository: DeterministicRepository,
) -> None:
    nested = deterministic_repository.path / "nested"
    nested.mkdir()

    async with run_desktop_material() as (app, pilot):
        canonical_root = deterministic_repository.path.resolve()
        app.open_repository_path(nested)
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert app.active_repository == canonical_root
        assert tuple(app.repository_services) == (canonical_root,)
        assert app.active_service is app.repository_services[canonical_root]

        app.open_repository_path(canonical_root)
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()

        assert app.active_repository == canonical_root
        assert tuple(app.repository_services) == (canonical_root,)


@pytest.mark.asyncio
@pytest.mark.parametrize("height", [18, 20, 21])
async def test_folder_browser_reflows_inside_short_terminal(
    deterministic_repository: DeterministicRepository,
    height: int,
) -> None:
    async with run_desktop_material(
        deterministic_repository.path,
        size=(80, height),
    ) as (app, pilot):
        assert app.has_class("short")
        await pilot.press("ctrl+o")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)

        card = app.screen.query_one("#path-card")
        for selector in (
            "#path-entry-row",
            "#path-browse",
            "#path-browser-toolbar",
            "#path-browser-up",
            "#path-browser-home",
            "#path-browser",
            "#path-cancel",
            "#path-open",
        ):
            assert_visible_inside_app(app.screen, selector)  # type: ignore[arg-type]
            assert card.region.contains_region(app.screen.query_one(selector).region)


@pytest.mark.asyncio
async def test_browser_navigation_does_not_submit_create_dialog(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(deterministic_repository.path) as (app, pilot):
        app._show_create_repository_dialog()
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)
        assert str(app.screen.query_one("#path-open", Button).label) == "Create repository"

        assert await pilot.click("#path-browser-home")
        await pilot.pause()

        tree = app.screen.query_one("#path-browser", FolderDirectoryTree)
        assert Path(tree.path) == Path.home()
        assert isinstance(app.screen, PathDialog)

        await pilot.press("escape")
        await pilot.pause()
        assert not isinstance(app.screen, PathDialog)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("config_name", "expected_labels"),
    [
        ("english.toml", ("Hide", "Browse", "Up", "Home", "Cancel", "Open")),
        ("cantonese.toml", ("收起", "瀏覽", "上一層", "主目錄", "取消", "開啟")),
        (
            "bilingual.toml",
            (
                "Hide · 收起",
                "Browse · 瀏覽",
                "Up · 上一層",
                "Home · 主目錄",
                "Cancel · 取消",
                "Open · 開啟",
            ),
        ),
    ],
)
async def test_localized_browser_controls_fit_at_narrow_width(
    deterministic_repository: DeterministicRepository,
    config_name: str,
    expected_labels: tuple[str, str, str, str, str, str],
) -> None:
    config_fixture = Path(__file__).parents[1] / "fixtures" / "configs" / config_name
    paths = XDGPaths.discover().ensure()
    paths.config_file.write_bytes(config_fixture.read_bytes())

    async with run_desktop_material(
        deterministic_repository.path,
        size=(80, 24),
    ) as (app, pilot):
        await pilot.press("ctrl+o")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)
        browse = app.screen.query_one("#path-browse", Button)
        assert str(browse.label) == expected_labels[0]

        selectors = (
            "#path-browser-up",
            "#path-browser-home",
            "#path-cancel",
            "#path-open",
        )
        for selector, expected_label in zip(selectors, expected_labels[2:], strict=True):
            assert str(app.screen.query_one(selector, Button).label) == expected_label
            assert_visible_inside_app(app.screen, selector)  # type: ignore[arg-type]

        assert await pilot.click("#path-browse")
        await pilot.pause()
        assert str(browse.label) == expected_labels[1]


@pytest.mark.asyncio
async def test_repository_dialog_controls_remain_reachable_in_narrow_bilingual_layout(
    deterministic_repository: DeterministicRepository,
) -> None:
    app = DesktopMaterialTUI(
        deterministic_repository.path,
        language_override="bilingual",
    )
    async with app.run_test(size=(40, 24), notifications=False) as pilot:
        await pilot.pause()
        await app.workers.wait_for_complete()

        await pilot.press("ctrl+o")
        await pilot.pause()
        assert isinstance(app.screen, PathDialog)
        for selector in (
            "#path-card",
            "#path-input",
            "#path-browse",
            "#path-browser-up",
            "#path-browser-home",
            "#path-browser",
            "#path-cancel",
            "#path-open",
        ):
            widget = app.screen.query_one(selector)
            if widget.can_focus:
                widget.focus()
                await pilot.pause()
            widget.scroll_visible(animate=False, force=True, immediate=True)
            await pilot.pause()
            assert_visible_inside_app(app.screen, selector)  # type: ignore[arg-type]

        await pilot.press("escape")
        await pilot.pause()
        await pilot.press("ctrl+p")
        await pilot.pause()
        await type_text(pilot, "clone")
        await pilot.pause()
        await pilot.click("#command-clone")
        await pilot.pause()
        assert isinstance(app.screen, CloneDialog)
        for selector in (
            "#clone-card",
            "#clone-url",
            "#clone-destination",
            "#clone-browse",
            "#clone-browser-up",
            "#clone-browser-home",
            "#clone-browser-working",
            "#clone-browser",
            "#clone-cancel",
            "#clone-submit",
        ):
            widget = app.screen.query_one(selector)
            if widget.can_focus:
                widget.focus()
                await pilot.pause()
            widget.scroll_visible(animate=False, force=True, immediate=True)
            await pilot.pause()
            assert_visible_inside_app(app.screen, selector)  # type: ignore[arg-type]
