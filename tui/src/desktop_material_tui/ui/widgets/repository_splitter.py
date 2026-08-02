"""Keyboard- and mouse-operable repository rail splitter."""

from __future__ import annotations

from typing import ClassVar

from textual import events
from textual.binding import Binding, BindingType
from textual.message import Message
from textual.widgets import Static


class RepositoryRailSplitter(Static, can_focus=True):
    """One-cell handle that requests live or persisted repository rail widths."""

    DEFAULT_WIDTH: ClassVar[int] = 28
    MINIMUM_WIDTH: ClassVar[int] = 20
    WORKSPACE_MINIMUM_WIDTH: ClassVar[int] = 40
    KEYBOARD_LARGE_STEP: ClassVar[int] = 5

    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("left", "resize(-1)", "Narrow repository list", show=False),
        Binding("right", "resize(1)", "Widen repository list", show=False),
        Binding("shift+left", "resize(-5)", "Narrow repository list by 5", show=False),
        Binding("shift+right", "resize(5)", "Widen repository list by 5", show=False),
        Binding("home", "default_width", "Reset repository list width", show=False),
        Binding("end", "maximum_width", "Maximize repository list", show=False),
    ]

    class ResizeRequested(Message):
        """Ask the app to resize the rail, optionally persisting the result."""

        def __init__(self, width: int, *, persist: bool) -> None:
            super().__init__()
            self.width = width
            self.persist = persist

    def __init__(
        self,
        *,
        id: str | None = None,  # noqa: A002 - mirrors Textual's widget API
    ) -> None:
        super().__init__(
            "│",
            id=id,
            name="Resize repository and workspace panels",
            markup=False,
        )
        self.tooltip = "Resize repository list · drag, Left/Right, Shift+Left/Right, Home, or End"
        self._repository_width = self.DEFAULT_WIDTH
        self._maximum_width = self.DEFAULT_WIDTH
        self._dragging = False
        self._drag_origin_x = 0
        self._drag_origin_width = self.DEFAULT_WIDTH
        self._drag_requested_width = self.DEFAULT_WIDTH

    @property
    def repository_width(self) -> int:
        """Return the currently rendered repository rail width."""

        return self._repository_width

    @property
    def maximum_width(self) -> int:
        """Return the current terminal-dependent maximum rail width."""

        return self._maximum_width

    @property
    def dragging(self) -> bool:
        """Return whether the splitter currently owns a pointer drag."""

        return self._dragging

    def set_width_limits(self, width: int, maximum_width: int) -> None:
        """Synchronize the rendered rail width and its current dynamic maximum."""

        self._maximum_width = max(self.MINIMUM_WIDTH, maximum_width)
        self._repository_width = self._clamp(width)

    def action_resize(self, delta: int) -> None:
        """Resize by one keyboard step and persist that explicit action."""

        requested = self._clamp(self._repository_width + delta)
        if requested != self._repository_width:
            self.post_message(self.ResizeRequested(requested, persist=True))

    def action_default_width(self) -> None:
        """Restore the default rail width and persist that explicit action."""

        requested = self._clamp(self.DEFAULT_WIDTH)
        if requested != self._repository_width:
            self.post_message(self.ResizeRequested(requested, persist=True))

    def action_maximum_width(self) -> None:
        """Use the current terminal-dependent maximum and persist it."""

        if self._maximum_width != self._repository_width:
            self.post_message(self.ResizeRequested(self._maximum_width, persist=True))

    def on_mouse_down(self, event: events.MouseDown) -> None:
        """Begin a primary-button drag and capture pointer events."""

        if event.button != 1:
            return
        self.focus()
        self.capture_mouse()
        self._dragging = True
        self._drag_origin_x = self._screen_x(event)
        self._drag_origin_width = self._repository_width
        self._drag_requested_width = self._repository_width
        event.stop()

    def on_mouse_move(self, event: events.MouseMove) -> None:
        """Apply drag movement live without writing configuration history."""

        if not self._dragging:
            return
        requested = self._drag_origin_width + self._screen_x(event) - self._drag_origin_x
        self._drag_requested_width = self._clamp(requested)
        self.post_message(self.ResizeRequested(self._drag_requested_width, persist=False))
        event.stop()

    def on_mouse_up(self, event: events.MouseUp) -> None:
        """Finish a primary-button drag and persist its final width once."""

        if not self._dragging or event.button != 1:
            return
        requested = self._drag_origin_width + self._screen_x(event) - self._drag_origin_x
        self._drag_requested_width = self._clamp(requested)
        self._finish_drag(persist=True)
        event.stop()

    def on_blur(self, _event: events.Blur) -> None:
        """Never leave mouse capture behind when focus moves elsewhere."""

        if self._dragging:
            self._finish_drag(persist=True)

    def on_hide(self, _event: events.Hide) -> None:
        """Release capture if a resize hides the repository rail mid-drag."""

        if self._dragging:
            self._finish_drag(persist=True)

    def on_unmount(self) -> None:
        """Release owned mouse capture during application teardown."""

        if self._dragging:
            self._dragging = False
            self.release_mouse()

    def _finish_drag(self, *, persist: bool) -> None:
        """Release capture and report the final drag width."""

        self._dragging = False
        self.release_mouse()
        if self._drag_requested_width != self._drag_origin_width:
            self.post_message(self.ResizeRequested(self._drag_requested_width, persist=persist))

    def _clamp(self, width: int) -> int:
        return min(max(width, self.MINIMUM_WIDTH), self._maximum_width)

    def _screen_x(self, event: events.MouseEvent) -> int:
        return round(event.screen_x)
