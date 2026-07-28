"""Responsive breakpoints and persisted language-mode loading."""

from __future__ import annotations

from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.widgets import Input, Select, SelectionList, Tab, TabbedContent

from desktop_material_tui.infrastructure.persistence import ConfigStore, XDGPaths
from desktop_material_tui.ui.i18n import LocalePreferences, Translator
from desktop_material_tui.ui.screens.settings import SettingsHistoryDialog

from .helpers import assert_visible_inside_app, run_desktop_material, type_text

_CONFIG_FIXTURES = Path(__file__).parents[1] / "fixtures" / "configs"


@pytest.mark.asyncio
async def test_responsive_layout_at_supported_terminal_sizes(
    deterministic_repository: DeterministicRepository,
) -> None:
    async with run_desktop_material(
        deterministic_repository.path,
        size=(80, 24),
    ) as (app, pilot):
        for width, height, narrow, compact in (
            (80, 24, True, True),
            (100, 30, True, True),
            (120, 36, False, True),
            (160, 48, False, False),
        ):
            await pilot.resize_terminal(width, height)
            await pilot.pause()
            assert app.size == (width, height)
            assert app.has_class("narrow") is narrow
            assert app.has_class("compact") is compact
            assert app.query_one("#repository-rail").display is (not narrow)
            assert app.query_one("#toolbar-editor").display is (not compact)
            for selector in (
                "#app-body",
                "#workspace",
                "#repository-toolbar",
                "#main-tabs",
            ):
                assert_visible_inside_app(app, selector)
            for selector in app._TAB_KEYS:
                tab = app.query_one(selector, Tab)
                assert tab.tooltip
                assert_visible_inside_app(app, selector)
                if compact:
                    assert str(tab.label) == app._COMPACT_TAB_LABELS[selector]


@pytest.mark.parametrize(
    ("fixture_name", "mode", "select_value", "expected_text"),
    [
        ("english.toml", "english", "en", "Desktop Material TUI"),
        ("cantonese.toml", "cantonese", "yue-HK", "Desktop Material 終端版"),
        (
            "bilingual.toml",
            "bilingual",
            "bilingual",
            "Desktop Material TUI\nDesktop Material 終端版",
        ),
    ],
)
@pytest.mark.asyncio
async def test_english_cantonese_and_bilingual_config_loading(
    fixture_name: str,
    mode: str,
    select_value: str,
    expected_text: str,
) -> None:
    paths = XDGPaths.discover().ensure()
    paths.config_file.write_bytes((_CONFIG_FIXTURES / fixture_name).read_bytes())

    loaded = ConfigStore(paths).load()
    assert loaded.language.mode == mode
    translator = Translator(
        LocalePreferences.from_values(
            mode=loaded.language.mode,
            english_funny_level=loaded.language.english_funny_level,
            cantonese_funny_level=loaded.language.cantonese_funny_level,
        )
    )
    assert translator.t("app.name") == expected_text

    async with run_desktop_material() as (app, _pilot):
        assert app._config is not None
        assert app._config.language.mode == mode
        assert app.query_one("#settings-language", Select).value == select_value


@pytest.mark.asyncio
async def test_cli_overrides_and_element_appearance_history(
    deterministic_repository: DeterministicRepository,
) -> None:
    from desktop_material_tui.app import DesktopMaterialTUI

    app = DesktopMaterialTUI(
        deterministic_repository.path,
        language_override="yue-HK",
        theme_override="light",
    )
    async with app.run_test(size=(120, 40), notifications=False) as pilot:
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert "終端版" in app.title
        assert app.theme == "textual-light"

        app.query_one("#main-tabs", TabbedContent).active = "settings-tab"
        element = app.query_one("#settings-element", Select)
        element.value = "diff"
        await pilot.pause()
        foreground = app.query_one("#settings-element-foreground", Input)
        foreground.scroll_visible(
            animate=False,
            top=True,
            force=True,
            immediate=True,
        )
        await pilot.pause()
        assert await pilot.click("#settings-element-foreground")
        await type_text(pilot, "#abcdef")
        styles = app.query_one("#settings-element-style", SelectionList)
        styles.select("bold")

        save = app.query_one("#settings-save")
        save.scroll_visible(
            animate=False,
            top=True,
            force=True,
            immediate=True,
        )
        await pilot.pause()
        assert await pilot.click("#settings-save")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert foreground.value == "#abcdef"
        assert app._config.appearance.element_overrides["diff"]["styles"] == ["bold"]

        history = app.query_one("#settings-history")
        history.scroll_visible(
            animate=False,
            top=True,
            force=True,
            immediate=True,
        )
        await pilot.pause()
        assert await pilot.click("#settings-history")
        await pilot.pause()
        assert isinstance(app.screen, SettingsHistoryDialog)
        assert app.screen.query_one("#settings-history-table").row_count >= 2
