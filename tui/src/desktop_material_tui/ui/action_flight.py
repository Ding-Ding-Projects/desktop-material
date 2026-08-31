from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any, cast

from textual.dom import DOMNode
from textual.widgets import Button
from textual.worker import Worker


class ActionFlightRegistry:
    """Synchronously refuse duplicate terminal actions until their work settles."""

    def __init__(self) -> None:
        self._active: set[str] = set()

    def is_active(self, key: str) -> bool:
        return key in self._active

    def claim(self, key: str) -> bool:
        if key in self._active:
            return False
        self._active.add(key)
        return True

    def release(self, key: str) -> None:
        self._active.discard(key)

    def reset(self) -> None:
        """Clear process-local state for deterministic test teardown."""
        self._active.clear()


class SingleFlightActions:
    """Bind a Textual button and worker to one synchronous action claim."""

    def __init__(self, registry: ActionFlightRegistry | None = None) -> None:
        self.registry = registry or ActionFlightRegistry()

    def start(
        self,
        owner: DOMNode,
        button: Button,
        key: str,
        action: Callable[[], object],
    ) -> bool:
        if not self.registry.claim(key):
            return False

        was_disabled = button.disabled
        button.disabled = True
        button.add_class("single-flight-active")

        try:
            result = action()
        except BaseException:
            self._release(button, key, was_disabled)
            raise

        if isinstance(result, Worker):
            waitable: Awaitable[Any] = result.wait()
        elif inspect.isawaitable(result):
            waitable = cast(Awaitable[Any], result)
        else:
            self._release(button, key, was_disabled)
            return True

        owner.run_worker(
            self._monitor(waitable, button, key, was_disabled),
            name=f"single-flight:{key}",
            group=f"single-flight:{key}",
            exit_on_error=False,
        )
        return True

    async def _monitor(
        self,
        waitable: Awaitable[Any],
        button: Button,
        key: str,
        was_disabled: bool,
    ) -> None:
        try:
            await waitable
        finally:
            self._release(button, key, was_disabled)

    def _release(self, button: Button, key: str, was_disabled: bool) -> None:
        self.registry.release(key)
        if button.is_mounted:
            button.disabled = was_disabled
            button.remove_class("single-flight-active")


single_flight_actions = SingleFlightActions()
