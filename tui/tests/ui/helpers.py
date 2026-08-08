"""Small helpers shared by headless Textual interaction tests."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from textual.app import App
from textual.pilot import Pilot
from textual.widgets import Static

from desktop_material_tui.app import DesktopMaterialTUI


def keys_for_text(value: str) -> tuple[str, ...]:
    """Translate ordinary fixture text into Textual Pilot key names."""

    aliases = {
        " ": "space",
        "\n": "enter",
        "\t": "tab",
    }
    return tuple(aliases.get(character, character) for character in value)


async def type_text(pilot: Pilot[object], value: str) -> None:
    """Type through Textual's key event path rather than assigning widget state."""

    await pilot.press(*keys_for_text(value))


@asynccontextmanager
async def run_desktop_material(
    repository: Path | None = None,
    *,
    size: tuple[int, int] = (120, 40),
) -> AsyncIterator[tuple[DesktopMaterialTUI, Pilot[None]]]:
    """Run the real app and wait for all initial background pane loads."""

    app = DesktopMaterialTUI(repository)
    async with app.run_test(size=size, notifications=False) as pilot:
        await pilot.pause()
        await app.workers.wait_for_complete()
        await pilot.pause()
        try:
            yield app, pilot
        finally:
            # Stop any worker started by the test before Textual tears down the
            # app. Otherwise a late UI callback can race the next fresh
            # interpreter's native syntax setup (notably tree-sitter on
            # Python 3.13) after this context has returned.
            app.workers.cancel_all()
            await app.workers.wait_for_complete()
            await pilot.pause()


def rendered_text(widget: Static) -> str:
    """Return the terminal-rendered text for Static-like widgets."""

    return str(widget.render())


def assert_visible_inside_app(app: App[object], selector: str) -> None:
    """Assert a visible widget remains within the current terminal viewport."""

    widget = app.query_one(selector)
    if not widget.display:
        return
    region = widget.region
    assert region.x >= 0
    assert region.y >= 0
    assert region.right <= app.size.width
    assert region.bottom <= app.size.height
