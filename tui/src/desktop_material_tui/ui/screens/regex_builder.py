"""Guided, bounded RE2 builder available from every search surface."""

from __future__ import annotations

from typing import ClassVar

import re2  # type: ignore[import-untyped]
from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, DataTable, Input, Label, SelectionList, Static, TextArea

from ...application.search import (
    MAX_REGEX_CAPTURE_WORK,
    MAX_REGEX_INPUT_LENGTH,
    MAX_REGEX_MATCH_COUNT,
    MAX_REGEX_PATTERN_LENGTH,
    RegexFlags,
    SafeRegex,
)
from ..widgets.search_bar import SearchState

MAX_PATTERN_LENGTH = MAX_REGEX_PATTERN_LENGTH
MAX_SAMPLE_LENGTH = MAX_REGEX_INPUT_LENGTH
MAX_MATCHES = MAX_REGEX_MATCH_COUNT
MAX_CAPTURE_WORK = MAX_REGEX_CAPTURE_WORK


class RegexBuilderPane(Vertical):
    """Full RE2 editor with guided blocks, flags, samples, and live captures."""

    current_surface_id = "global"

    TOKEN_BUTTONS: ClassVar[dict[str, tuple[str, str]]] = {
        "regex-literal": ("literal", "text"),
        "regex-any": (".", "any character"),
        "regex-class": ("[a-z]", "character class"),
        "regex-negated-class": ("[^a-z]", "negated class"),
        "regex-start": ("^", "start anchor"),
        "regex-end": ("$", "end anchor"),
        "regex-group": ("()", "capturing group"),
        "regex-noncapture": ("(?:)", "non-capturing group"),
        "regex-alternation": ("|", "alternation"),
        "regex-optional": ("?", "zero or one"),
        "regex-star": ("*", "zero or more"),
        "regex-plus": ("+", "one or more"),
        "regex-range": ("{1,3}", "bounded repeat"),
    }

    def compose(self) -> ComposeResult:
        yield Label("RE2 regex builder", classes="modal-title")
        yield Static(
            "Safe linear-time RE2 dialect · no look-around or backreferences · "
            "pattern ≤ 1,000 · sample ≤ 100,000",
            id="regex-dialect",
        )
        with Horizontal(id="regex-guided", classes="screen-toolbar"):
            yield Button("Literal", id="regex-literal")
            yield Button(".", id="regex-any")
            yield Button("[a-z]", id="regex-class")
            yield Button("[^a-z]", id="regex-negated-class")
            yield Button("^", id="regex-start")
            yield Button("$", id="regex-end")
            yield Button("( )", id="regex-group")
            yield Button("(?: )", id="regex-noncapture")
            yield Button("|", id="regex-alternation")
            yield Button("?", id="regex-optional")
            yield Button("*", id="regex-star")
            yield Button("+", id="regex-plus")
            yield Button("{1,3}", id="regex-range")
        with Horizontal(classes="form-row"):
            yield Input(
                placeholder="Pattern",
                id="regex-pattern",
                max_length=MAX_PATTERN_LENGTH,
                select_on_focus=False,
            )
            yield Button("Copy", id="regex-copy")
            yield Button("Apply to search", id="regex-apply", variant="primary")
        yield SelectionList[str](
            ("Case-insensitive (i)", "i", False),
            ("Multiline anchors (m)", "m", False),
            ("Dot matches newline (s)", "s", False),
            id="regex-flags",
            compact=True,
        )
        yield Static("Valid RE2 pattern.", id="regex-feedback")
        with Horizontal(classes="screen-split"):
            yield TextArea(
                "",
                placeholder="Paste sample text here. It stays local.",
                id="regex-sample",
                soft_wrap=True,
                tab_behavior="focus",
                classes="screen-list",
            )
            yield DataTable(
                cursor_type="row",
                zebra_stripes=True,
                id="regex-matches",
                classes="screen-detail",
            )

    def on_mount(self) -> None:
        self.query_one("#regex-matches", DataTable).add_columns(
            "#",
            "Span",
            "Match",
            "Capture groups",
        )
        self._evaluate()

    def load_state(self, state: SearchState, surface_id: str) -> None:
        """Load compact-search state into the full builder."""

        self.current_surface_id = surface_id
        self.query_one("#regex-pattern", Input).value = state.query
        flags = set(state.flags)
        if state.case_sensitive is False and state.mode == "regex" and "i" in state.flags:
            flags.add("i")
        selection = self.query_one("#regex-flags", SelectionList)
        selection.deselect_all()
        for flag in flags:
            if flag in {"i", "m", "s"}:
                selection.select(flag)
        self._evaluate()

    def state(self) -> SearchState:
        flags = "".join(
            flag for flag in "ims" if flag in self.query_one("#regex-flags", SelectionList).selected
        )
        return SearchState(
            query=self.query_one("#regex-pattern", Input).value,
            mode="regex",
            case_sensitive="i" not in flags,
            flags=flags,
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""
        if button_id in self.TOKEN_BUTTONS:
            fragment, description = self.TOKEN_BUTTONS[button_id]
            if fragment == "literal":
                fragment = re2.escape("text")
            self._insert(fragment)
            self.app.notify(f"Inserted {description}.")
        elif button_id == "regex-copy":
            self.app.copy_to_clipboard(self.query_one("#regex-pattern", Input).value)
            self.app.notify("Pattern copied.")
        elif button_id == "regex-apply":
            apply_callback = getattr(self.app, "apply_regex_builder", None)
            if callable(apply_callback):
                apply_callback(self.current_surface_id, self.state())

    def _insert(self, token: str) -> None:
        pattern = self.query_one("#regex-pattern", Input)
        cursor = pattern.cursor_position
        next_value = f"{pattern.value[:cursor]}{token}{pattern.value[cursor:]}"
        if len(next_value) > MAX_PATTERN_LENGTH:
            self.app.notify("Pattern limit reached.", severity="warning")
            return
        pattern.value = next_value
        pattern.cursor_position = cursor + len(token)
        pattern.focus()

    @on(Input.Changed, "#regex-pattern")
    def _pattern_changed(self) -> None:
        self._evaluate()

    @on(TextArea.Changed, "#regex-sample")
    def _sample_changed(self) -> None:
        sample = self.query_one("#regex-sample", TextArea)
        if len(sample.text) > MAX_SAMPLE_LENGTH:
            sample.text = sample.text[:MAX_SAMPLE_LENGTH]
            self.app.notify("Sample was clipped to 100,000 characters.", severity="warning")
        self._evaluate()

    @on(SelectionList.SelectedChanged, "#regex-flags")
    def _flags_changed(self) -> None:
        self._evaluate()

    def _evaluate(self) -> None:
        if not self.is_mounted:
            return
        pattern = self.query_one("#regex-pattern", Input).value
        sample = self.query_one("#regex-sample", TextArea).text
        flags = "".join(
            flag for flag in "ims" if flag in self.query_one("#regex-flags", SelectionList).selected
        )
        feedback = self.query_one("#regex-feedback", Static)
        table = self.query_one("#regex-matches", DataTable)
        table.clear()
        if not pattern:
            feedback.update("Enter a pattern. Plain-text search remains the default elsewhere.")
            return
        if len(pattern) > MAX_PATTERN_LENGTH:
            feedback.update("[red]Pattern exceeds the 1,000-character limit.[/]")
            return
        try:
            compiled = SafeRegex.compile(pattern, RegexFlags.parse(flags))
            evaluation = compiled.evaluate(sample, max_matches=MAX_MATCHES)
        except (ValueError, RuntimeError) as error:
            feedback.update(f"[red]Invalid RE2 pattern:[/] {error}")
            return
        for count, match in enumerate(evaluation.matches, start=1):
            display_match = "∅ (zero-width)" if match.start == match.end else match.text
            numbered = [
                f"{index + 1}: {preview.value!r}" for index, preview in enumerate(match.groups)
            ]
            named = [f"{name}: {preview.value!r}" for name, preview in match.named_groups.items()]
            omitted = [f"+{match.captures_omitted} omitted"] if match.captures_omitted else []
            table.add_row(
                str(count),
                f"{match.start}:{match.end}",
                display_match[:120].replace("\n", "↵"),
                " | ".join(numbered + named + omitted)[:240],
            )
        suffix = " (bounded preview truncated)" if evaluation.truncated else ""
        count = len(evaluation.matches)
        feedback.update(
            f"[green]Valid RE2 pattern.[/] {count} match{'es' if count != 1 else ''}{suffix}."
        )
