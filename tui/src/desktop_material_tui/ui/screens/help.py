"""Persistent terminal-native help and release-history destination."""

from __future__ import annotations

from typing import Any

from textual import on
from textual.app import ComposeResult
from textual.containers import Vertical, VerticalScroll
from textual.widgets import Button, Markdown, Tab, TabbedContent, TabPane

from ..i18n import Translator, get_translator
from ..widgets.responsive_layout import ScrollableToolbar
from .changelog import ChangelogPane

DOCUMENTATION_URL = "https://ding-ding-projects.github.io/desktop-material/"


class HelpPane(Vertical):
    """Guide and factual release history in one persistent app tab."""

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self._translator = get_translator()

    def compose(self) -> ComposeResult:
        with TabbedContent(initial="help-guide-tab", id="help-tabs"):
            with TabPane("Guide", id="help-guide-tab"):
                with VerticalScroll(id="help-guide-scroll"):
                    yield Markdown(self._guide_markdown(), id="help-guide-copy")
                with ScrollableToolbar(id="help-guide-actions"):
                    yield Button("Release history", id="help-open-changelog", variant="primary")
                    yield Button("Copy documentation URL", id="help-copy-docs-url")
            with TabPane("Release history", id="help-changelog-tab"):
                yield ChangelogPane(id="changelog-pane", classes="screen-layout")

    @on(Button.Pressed, "#help-open-changelog")
    def _open_changelog_pressed(self, _event: Button.Pressed) -> None:
        self.open_changelog()

    @on(Button.Pressed, "#help-copy-docs-url")
    def _copy_docs_url_pressed(self, _event: Button.Pressed) -> None:
        self.app.copy_to_clipboard(DOCUMENTATION_URL)
        self.app.notify("The documentation URL was copied.", title="Help")

    def open_guide(self) -> None:
        tabs = self.query_one("#help-tabs", TabbedContent)
        tabs.active = "help-guide-tab"
        self.call_after_refresh(self.query_one("#help-guide-scroll", VerticalScroll).focus)

    def open_changelog(self) -> None:
        tabs = self.query_one("#help-tabs", TabbedContent)
        tabs.active = "help-changelog-tab"
        self.query_one("#changelog-pane", ChangelogPane).ensure_loaded()
        self.call_after_refresh(self.query_one("#changelog-query").focus)

    def localize(self, translator: Translator | None = None) -> None:
        self._translator = translator or get_translator()
        self.query_one("#--content-tab-help-guide-tab", Tab).label = self._translator.t(
            "help.guide"
        )
        self.query_one("#--content-tab-help-changelog-tab", Tab).label = self._translator.t(
            "changelog.title"
        )
        self.query_one("#help-guide-copy", Markdown).update(self._guide_markdown())
        self.query_one("#help-open-changelog", Button).label = self._translator.t("changelog.title")
        self.query_one("#help-copy-docs-url", Button).label = self._translator.t(
            "help.copy_docs_url"
        )
        self.query_one("#changelog-pane", ChangelogPane).localize(self._translator)

    def _guide_markdown(self) -> str:
        return self._translator.t("help.guide_markdown", documentation_url=DOCUMENTATION_URL)


__all__ = ["DOCUMENTATION_URL", "HelpPane"]
