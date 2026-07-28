"""Mouse, text-field, localization, and responsive coverage for Cheap LFS."""

from __future__ import annotations

from pathlib import Path

import pytest
from git_repository import DeterministicRepository
from textual.widgets import Button, Input, TabbedContent, TextArea

from desktop_material_tui.infrastructure.persistence import XDGPaths
from desktop_material_tui.ui.screens.dialogs import DecisionDialog

from .helpers import assert_visible_inside_app, run_desktop_material, type_text

_CONFIG_FIXTURES = Path(__file__).parents[1] / "fixtures" / "configs"


@pytest.mark.asyncio
async def test_cheap_lfs_mouse_fields_preview_confirmation_and_regex_builder(
    deterministic_repository: DeterministicRepository,
) -> None:
    payload = deterministic_repository.path / "artifacts" / "model.bin"
    payload.parent.mkdir()
    payload.write_bytes(b"interactive cheap lfs payload")

    async with run_desktop_material(
        deterministic_repository.path,
        size=(112, 47),
    ) as (app, pilot):
        assert await pilot.click("#--content-tab-cheap-lfs-tab")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "cheap-lfs-tab"

        path_input = app.query_one("#cheap-lfs-path", Input)
        tag_input = app.query_one("#cheap-lfs-tag", Input)
        repository_input = app.query_one("#cheap-lfs-repo", Input)
        assert await pilot.click("#cheap-lfs-path")
        await type_text(pilot, "artifacts/model.bin")
        assert await pilot.click("#cheap-lfs-tag")
        await pilot.press("ctrl+shift+a", "backspace")
        await type_text(pilot, "model-assets")
        assert await pilot.click("#cheap-lfs-repo")
        await type_text(pilot, "acme/widgets")
        assert path_input.value == "artifacts/model.bin"
        assert tag_input.value == "model-assets"
        assert repository_input.value == "acme/widgets"

        assert await pilot.click("#cheap-lfs-preview")
        await app.workers.wait_for_complete()
        await pilot.pause()
        plan = app.query_one("#cheap-lfs-plan", TextArea)
        assert "Local preview" in plan.text
        assert "artifacts/model.bin" in plan.text
        assert "acme/widgets" in plan.text
        assert "model-assets" in plan.text
        assert not payload.read_text(encoding="utf-8").startswith(
            "version desktop-material/cheap-lfs/v1"
        )

        assert await pilot.click("#cheap-lfs-track")
        await app.workers.wait_for_complete()
        await pilot.pause()
        assert isinstance(app.screen, DecisionDialog)
        confirmation = app.screen.query_one("#decision-confirmation", Input)
        assert confirmation.has_focus
        await type_text(pilot, "track")
        assert not app.screen.query_one("#decision-confirm", Button).disabled
        assert await pilot.click("#decision-cancel")
        await pilot.pause()

        assert await pilot.click("#cheap-lfs-inventory-builder")
        await pilot.pause()
        assert app.query_one("#main-tabs", TabbedContent).active == "regex-tab"
        assert app.query_one("#regex-pattern", Input).has_focus


@pytest.mark.asyncio
async def test_cheap_lfs_bilingual_narrow_form_stacks_without_clipping(
    deterministic_repository: DeterministicRepository,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paths = XDGPaths.discover().ensure()
    paths.config_file.write_bytes((_CONFIG_FIXTURES / "bilingual.toml").read_bytes())

    async with run_desktop_material(
        deterministic_repository.path,
        size=(100, 47),
    ) as (app, pilot):
        assert await pilot.click("#--content-tab-cheap-lfs-tab")
        await pilot.pause()

        preview = app.query_one("#cheap-lfs-preview", Button)
        assert "Preview track" in str(preview.label)
        assert "預覽追蹤" in str(preview.label)

        fields = [
            app.query_one("#cheap-lfs-path", Input),
            app.query_one("#cheap-lfs-tag", Input),
            app.query_one("#cheap-lfs-repo", Input),
        ]
        assert len({field.region.x for field in fields}) == 1
        assert fields[0].region.y < fields[1].region.y < fields[2].region.y
        assert len({field.region.width for field in fields}) == 1
        for selector in (
            "#cheap-lfs-path-label",
            "#cheap-lfs-path",
            "#cheap-lfs-tag-label",
            "#cheap-lfs-tag",
            "#cheap-lfs-repo-label",
            "#cheap-lfs-repo",
        ):
            assert_visible_inside_app(app, selector)

        warnings: list[dict[str, object]] = []

        def record_warning(message: str, **metadata: object) -> None:
            warnings.append({"message": message, **metadata})

        pane = app.query_one("#cheap-lfs-pane")
        pane.mutation_active = True
        pane.mutation_operation = "追蹤"
        monkeypatch.setattr(app, "notify", record_warning)
        await app.action_quit()

        assert app.is_running
        assert warnings[-1]["severity"] == "warning"
        assert warnings[-1]["timeout"] == 600
        assert "唔可以安全取消" in str(warnings[-1]["message"])
