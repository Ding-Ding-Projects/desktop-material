"""Reusable containers that keep dense controls reachable at every width."""

from __future__ import annotations

from textual import events
from textual.containers import Horizontal, HorizontalScroll
from textual.geometry import Size
from textual.layout import DockArrangeResult


class ScrollableToolbar(HorizontalScroll):
    """A toolbar whose focused overflow control is always brought into view.

    The container deliberately keeps each control at its natural width. When
    those controls no longer fit, Textual exposes a horizontal scrollbar and
    the focus handler follows keyboard traversal through the overflow instead
    of leaving the newly focused control clipped beyond the viewport.
    """

    DEFAULT_CSS = """
    ScrollableToolbar {
        width: 100%;
        height: auto;
        min-height: 3;
        layout: horizontal;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-size-horizontal: 1;
    }

    ScrollableToolbar Button,
    ScrollableToolbar Select {
        width: auto;
        min-width: 9;
        height: 3;
    }
    """

    def __init__(
        self,
        *,
        id: str | None = None,  # noqa: A002 - mirrors Textual's widget API
        classes: str | None = None,
    ) -> None:
        class_names = "screen-toolbar"
        if classes:
            class_names = f"{class_names} {classes}"
        super().__init__(id=id, classes=class_names, can_focus=False)

    def on_descendant_focus(self, event: events.DescendantFocus) -> None:
        """Follow keyboard focus through controls beyond the visible edge."""

        self.call_after_refresh(
            self.scroll_to_widget,
            event.widget,
            animate=False,
            origin_visible=True,
            force=True,
            immediate=True,
        )
        self.call_after_refresh(
            event.widget.scroll_visible,
            animate=False,
            force=True,
            immediate=True,
        )

class ResponsiveFormRow(Horizontal):
    """A wide horizontal form row that stacks its controls in narrow mode."""

    # The breakpoint class lives on the App, outside this widget's CSS scope.
    # Keep these selectors global so hidden tab panes also reflow immediately
    # when they are revealed after a terminal resize.
    SCOPED_CSS = False

    DEFAULT_CSS = """
    ResponsiveFormRow {
        width: 100%;
        height: 3;
        layout: horizontal;
        overflow: hidden hidden;
    }

    ResponsiveFormRow Input,
    ResponsiveFormRow Select {
        width: 1fr;
    }

    ResponsiveFormRow Button {
        width: auto;
        min-width: 10;
    }

    .narrow ResponsiveFormRow,
    ResponsiveFormRow.-stacked {
        height: auto;
        min-height: 3;
        layout: vertical;
    }

    .narrow ResponsiveFormRow Input,
    .narrow ResponsiveFormRow Select,
    .narrow ResponsiveFormRow Button,
    .narrow ResponsiveFormRow Checkbox,
    ResponsiveFormRow.-stacked Input,
    ResponsiveFormRow.-stacked Select,
    ResponsiveFormRow.-stacked Button,
    ResponsiveFormRow.-stacked Checkbox {
        width: 100%;
        min-width: 0;
    }
    """

    def __init__(
        self,
        *,
        id: str | None = None,  # noqa: A002 - mirrors Textual's widget API
        classes: str | None = None,
    ) -> None:
        class_names = "form-row"
        if classes:
            class_names = f"{class_names} {classes}"
        super().__init__(id=id, classes=class_names)

    def on_mount(self) -> None:
        """Match the app's initial responsive mode after composition."""

        self._sync_responsive_mode()

    def on_show(self) -> None:
        """Refresh rows that were hidden when the latest resize occurred."""

        self._sync_responsive_mode()

    def on_resize(self, _event: events.Resize) -> None:
        """Re-evaluate stacking after the app updates its breakpoint class."""

        self.call_after_refresh(self._sync_responsive_mode)

    def on_descendant_focus(self, event: events.DescendantFocus) -> None:
        """Make a stacked control reachable through any scrolling ancestor."""

        self.call_after_refresh(
            event.widget.scroll_visible,
            animate=False,
            force=True,
            immediate=True,
        )

    def arrange(self, size: Size, optimal: bool = False) -> DockArrangeResult:
        """Synchronize hidden rows as soon as their tab is laid out again."""

        self._sync_responsive_mode()
        return super().arrange(size, optimal)

    def _sync_responsive_mode(self) -> None:
        stacked = self.app.has_class("narrow")
        self.set_class(stacked, "-stacked")
        # The shared legacy `.form-row` rule has class-level specificity. Set
        # the responsive dimensions inline so it cannot pin a stacked row back
        # to three lines after the breakpoint changes.
        self.styles.layout = "vertical" if stacked else "horizontal"
        self.styles.height = "auto" if stacked else 3
