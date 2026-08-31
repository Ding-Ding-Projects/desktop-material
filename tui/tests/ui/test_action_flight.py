from __future__ import annotations

import asyncio

import pytest
from textual import work
from textual.app import App, ComposeResult
from textual.widgets import Button

from desktop_material_tui.ui.action_flight import (
    ActionFlightRegistry,
    SingleFlightActions,
)


def test_registry_claims_exact_actions_and_releases_idempotently() -> None:
    registry = ActionFlightRegistry()

    assert registry.claim("save:one") is True
    assert registry.claim("save:one") is False
    assert registry.claim("save:two") is True
    assert registry.is_active("save:one") is True

    registry.release("save:one")
    registry.release("save:one")
    assert registry.is_active("save:one") is False
    assert registry.is_active("save:two") is True


class FlightTestApp(App[None]):
    def __init__(self) -> None:
        super().__init__()
        self.actions = SingleFlightActions()
        self.finish = asyncio.Event()
        self.async_starts = 0
        self.sync_starts = 0

    def compose(self) -> ComposeResult:
        yield Button("Run", id="run")
        yield Button("Toggle", id="toggle")

    @work(group="run-action")
    async def perform_run(self) -> None:
        self.async_starts += 1
        await self.finish.wait()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "run":
            self.actions.start(self, event.button, "run", self.perform_run)
        elif event.button.id == "toggle":
            self.actions.start(self, event.button, "toggle", self.toggle)

    def toggle(self) -> None:
        self.sync_starts += 1


@pytest.mark.asyncio
async def test_terminal_button_spam_starts_one_worker_and_reopens_after_settlement() -> None:
    app = FlightTestApp()

    async with app.run_test() as pilot:
        await pilot.click("#run")
        await pilot.click("#run")
        await pilot.pause()

        run_button = app.query_one("#run", Button)
        assert app.async_starts == 1
        assert run_button.disabled is True
        assert app.actions.registry.is_active("run") is True

        app.finish.set()
        await pilot.pause()
        assert run_button.disabled is False
        assert app.actions.registry.is_active("run") is False

        await pilot.click("#run")
        await pilot.pause()
        assert app.async_starts == 2


@pytest.mark.asyncio
async def test_terminal_synchronous_controls_remain_repeatable() -> None:
    app = FlightTestApp()

    async with app.run_test() as pilot:
        toggle = app.query_one("#toggle", Button)
        toggle.press()
        await pilot.pause()
        assert toggle.disabled is False
        toggle.press()
        await pilot.pause()

    assert app.sync_starts == 2
