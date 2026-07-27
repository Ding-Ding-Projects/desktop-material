"""Persisted terminal appearance, language, editor, and accessibility settings."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any, ClassVar, TypedDict

from textual import on, work
from textual.app import ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    Checkbox,
    DataTable,
    Input,
    Label,
    Select,
    SelectionList,
    Static,
    TextArea,
)

from ...application.version_history import VersionEntry, VersionHistoryService


class ElementOverride(TypedDict):
    """Terminal-safe appearance values for one UI surface."""

    foreground: str
    background: str
    styles: list[str]


class SettingsValues(TypedDict):
    """Validated values collected from the settings form."""

    theme: str
    density: str
    accent: str
    language: str
    funny_level_english: int
    funny_level_cantonese: int
    editor: str
    terminal: str
    narrator_enabled: bool
    narrator_language: str
    quiet_hours_start: str
    quiet_hours_end: str
    reduced_sound: bool
    reduced_motion: bool
    yield_to_screen_reader: bool
    element_overrides: dict[str, ElementOverride]


class SettingsHistoryDialog(ModalScreen[str | None]):
    """Browse, diff, and choose an isolated local settings revision."""

    BINDINGS: ClassVar[list[BindingType]] = [("escape", "close", "Close")]

    def __init__(
        self,
        entries: Sequence[VersionEntry],
        service: VersionHistoryService,
    ) -> None:
        super().__init__()
        self.entries = tuple(entries)
        self.service = service

    def compose(self) -> ComposeResult:
        with Vertical(id="settings-history-card", classes="modal-card"):
            yield Label("Settings version history", classes="modal-title")
            with Horizontal(classes="screen-split"):
                yield DataTable(
                    cursor_type="row",
                    zebra_stripes=True,
                    id="settings-history-table",
                    classes="screen-list",
                )
                yield TextArea(
                    "Select a revision to inspect its diff against the current settings.",
                    read_only=True,
                    id="settings-history-detail",
                    classes="screen-detail",
                )
            with Horizontal(classes="modal-actions"):
                yield Button("Close", id="settings-history-close")
                yield Button(
                    "Restore selected",
                    id="settings-history-restore",
                    variant="primary",
                )

    def on_mount(self) -> None:
        table = self.query_one("#settings-history-table", DataTable)
        table.add_columns("Revision", "When", "Label")
        for entry in self.entries:
            revision = entry.revision
            table.add_row(
                revision[:10],
                str(entry.created_at),
                entry.label,
                key=revision,
            )
        if table.row_count:
            table.focus()

    @on(DataTable.RowHighlighted, "#settings-history-table")
    def _revision_highlighted(self, event: DataTable.RowHighlighted) -> None:
        self._load_revision(str(event.row_key.value))

    @work(exclusive=True, group="settings-history-diff")
    async def _load_revision(self, revision: str) -> None:
        detail = self.query_one("#settings-history-detail", TextArea)
        detail.text = "Loading local diff…"
        try:
            snapshot, diff = await asyncio.gather(
                asyncio.to_thread(self.service.read, revision),
                asyncio.to_thread(self.service.diff, revision),
            )
        except Exception as error:
            detail.text = str(error)
            return
        settings = snapshot.settings
        detail.text = (
            f"Revision: {revision}\n"
            f"Profile: {settings.get('active_profile', 'local')}\n\n"
            f"{diff or 'This revision matches the current settings snapshot.'}"
        )

    def _selected_revision(self) -> str | None:
        table = self.query_one("#settings-history-table", DataTable)
        if table.row_count == 0:
            return None
        try:
            return str(table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value)
        except KeyError:
            return None

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "settings-history-close":
            self.dismiss(None)
        elif event.button.id == "settings-history-restore":
            revision = self._selected_revision()
            if revision is not None:
                self.dismiss(revision)

    def action_close(self) -> None:
        self.dismiss(None)


class SettingsPane(VerticalScroll):
    """Interactive settings form; the app owns persistence and live application."""

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.element_overrides: dict[str, ElementOverride] = {}
        self._active_element = "workspace"
        self._loading_element = False

    def compose(self) -> ComposeResult:
        yield Label("Appearance", classes="modal-title")
        with Horizontal(classes="form-row"):
            yield Select(
                (("Dark", "dark"), ("Light", "light"), ("System", "system")),
                value="dark",
                allow_blank=False,
                id="settings-theme",
            )
            yield Select(
                (("Comfortable", "comfortable"), ("Compact", "compact")),
                value="comfortable",
                allow_blank=False,
                id="settings-density",
            )
            yield Select(
                (
                    ("Violet", "violet"),
                    ("Blue", "blue"),
                    ("Green", "green"),
                    ("Amber", "amber"),
                    ("Rose", "rose"),
                ),
                value="violet",
                allow_blank=False,
                id="settings-accent",
            )
        yield Static(
            "The terminal emulator owns font family and point size. This app persists "
            "terminal-safe color, density, border, and emphasis choices.",
            classes="help-copy",
        )

        yield Label("Language and tone", classes="modal-title")
        with Horizontal(classes="form-row"):
            yield Select(
                (
                    ("English", "en"),
                    ("Playful Hong Kong Cantonese", "yue-HK"),
                    ("Bilingual", "bilingual"),
                ),
                value="en",
                allow_blank=False,
                id="settings-language",
            )
            yield Select(
                tuple((f"English funny level {level}", level) for level in range(1, 6)),
                value=3,
                allow_blank=False,
                id="settings-funny-en",
            )
            yield Select(
                tuple((f"Cantonese funny level {level}", level) for level in range(1, 6)),
                value=3,
                allow_blank=False,
                id="settings-funny-yue",
            )

        yield Label("External editor and shell", classes="modal-title")
        with Horizontal(classes="form-row"):
            yield Input(
                placeholder="Editor command, e.g. code",
                id="settings-editor",
                select_on_focus=False,
            )
            yield Button("Detect editors", id="settings-detect-editors")
        yield Input(
            placeholder="Terminal command (optional)",
            id="settings-terminal",
            select_on_focus=False,
        )

        yield Label("Narrator and sound", classes="modal-title")
        yield Checkbox("Enable optional spoken narrator", id="settings-narrator")
        with Horizontal(classes="form-row"):
            yield Select(
                (("English", "en"), ("Cantonese", "yue-HK"), ("Both", "both")),
                value="en",
                allow_blank=False,
                id="settings-narrator-language",
            )
            yield Input(
                placeholder="Quiet hours start, e.g. 22:00",
                id="settings-quiet-start",
                select_on_focus=False,
            )
            yield Input(
                placeholder="Quiet hours end, e.g. 07:00",
                id="settings-quiet-end",
                select_on_focus=False,
            )
        yield Checkbox("Reduced sound", id="settings-reduced-sound")
        yield Checkbox("Reduced motion", id="settings-reduced-motion")
        yield Checkbox("Yield narration to screen readers", value=True, id="settings-screen-reader")

        yield Label("Per-element terminal appearance", classes="modal-title")
        with Horizontal(classes="form-row"):
            yield Select(
                (
                    ("Workspace", "workspace"),
                    ("Repository rail", "repository-rail"),
                    ("Toolbar", "toolbar"),
                    ("Tabs", "tabs"),
                    ("Diff viewer", "diff"),
                    ("Notifications", "notifications"),
                ),
                value="workspace",
                allow_blank=False,
                id="settings-element",
            )
            yield Input(
                placeholder="Foreground #RRGGBB",
                id="settings-element-foreground",
                select_on_focus=False,
            )
            yield Input(
                placeholder="Background #RRGGBB",
                id="settings-element-background",
                select_on_focus=False,
            )
        yield SelectionList[str](
            ("Bold", "bold", False),
            ("Italic", "italic", False),
            ("Underline", "underline", False),
            ("Heavy border", "heavy-border", False),
            id="settings-element-style",
            compact=True,
        )
        with Horizontal(classes="screen-toolbar"):
            yield Button("Preview", id="settings-preview")
            yield Button("Reset element", id="settings-reset-element")
            yield Button("Save settings", id="settings-save", variant="primary")

        yield Label("Settings history", classes="modal-title")
        yield Static(
            "Settings snapshots are committed to an isolated local Git repository under "
            "the app data directory—not inside any repository you open.",
            id="settings-history-status",
        )
        with Horizontal(classes="screen-toolbar"):
            yield Button("Undo", id="settings-undo")
            yield Button("Redo", id="settings-redo")
            yield Button("Open history", id="settings-history")

    def load_settings(self, config: Any) -> None:
        """Load whichever typed config implementation the application provides."""

        appearance = getattr(config, "appearance", config)
        language = getattr(config, "language", config)
        interaction = getattr(config, "interaction", config)
        raw_overrides = getattr(appearance, "element_overrides", {})
        element_overrides: dict[str, ElementOverride] = {}
        if isinstance(raw_overrides, dict):
            for target, override in raw_overrides.items():
                if not isinstance(override, dict):
                    continue
                raw_styles = override.get("styles", [])
                styles = (
                    [str(style) for style in raw_styles]
                    if isinstance(raw_styles, (list, tuple))
                    else []
                )
                element_overrides[str(target)] = {
                    "foreground": str(override.get("foreground", "")),
                    "background": str(override.get("background", "")),
                    "styles": styles,
                }
        self.element_overrides = element_overrides
        language_modes = {
            "english": "en",
            "cantonese": "yue-HK",
            "bilingual": "bilingual",
        }
        accent = str(getattr(appearance, "accent", "#6750a4"))
        accent_names = {
            "#6750a4": "violet",
            "#0061a4": "blue",
            "#386a20": "green",
            "#825500": "amber",
            "#8c1d40": "rose",
        }
        values = {
            "#settings-theme": getattr(appearance, "theme", "dark"),
            "#settings-density": getattr(appearance, "density", "comfortable"),
            "#settings-accent": accent_names.get(accent.casefold(), "violet"),
            "#settings-language": language_modes.get(
                str(getattr(language, "mode", "english")),
                "en",
            ),
            "#settings-funny-en": getattr(language, "english_funny_level", 3),
            "#settings-funny-yue": getattr(language, "cantonese_funny_level", 3),
            "#settings-editor": getattr(interaction, "editor", ""),
            "#settings-terminal": getattr(interaction, "terminal", ""),
            "#settings-narrator": getattr(interaction, "narrator_enabled", False),
            "#settings-narrator-language": getattr(
                interaction,
                "narrator_language",
                "english",
            ),
            "#settings-quiet-start": getattr(interaction, "quiet_hours_start", ""),
            "#settings-quiet-end": getattr(interaction, "quiet_hours_end", ""),
            "#settings-reduced-sound": getattr(interaction, "reduced_sound", False),
            "#settings-reduced-motion": getattr(appearance, "reduced_motion", False),
            "#settings-screen-reader": getattr(
                interaction,
                "yield_to_screen_reader",
                True,
            ),
        }
        values["#settings-narrator-language"] = {
            "english": "en",
            "cantonese": "yue-HK",
            "both": "both",
            "en": "en",
            "yue-HK": "yue-HK",
        }.get(str(values["#settings-narrator-language"]), "en")
        for selector, value in values.items():
            widget = self.query_one(selector)
            if isinstance(widget, Select):
                widget.value = value
            elif isinstance(widget, Input):
                widget.value = str(value or "")
            elif isinstance(widget, Checkbox):
                widget.value = bool(value)
        self._active_element = str(self.query_one("#settings-element", Select).value)
        self._load_element_override(self._active_element)

    @on(Select.Changed, "#settings-element")
    def _element_changed(self, event: Select.Changed) -> None:
        if self._loading_element or event.value is Select.BLANK:
            return
        self._capture_element_override(self._active_element)
        self._active_element = str(event.value)
        self._load_element_override(self._active_element)

    def _capture_element_override(self, target: str) -> None:
        foreground = self.query_one(
            "#settings-element-foreground",
            Input,
        ).value.strip()
        background = self.query_one(
            "#settings-element-background",
            Input,
        ).value.strip()
        styles = list(self.query_one("#settings-element-style", SelectionList).selected)
        if foreground or background or styles:
            self.element_overrides[target] = {
                "foreground": foreground,
                "background": background,
                "styles": styles,
            }
        else:
            self.element_overrides.pop(target, None)

    def _load_element_override(self, target: str) -> None:
        override: ElementOverride = self.element_overrides.get(
            target,
            {
                "foreground": "",
                "background": "",
                "styles": [],
            },
        )
        self._loading_element = True
        try:
            self.query_one("#settings-element-foreground", Input).value = str(
                override.get("foreground", "")
            )
            self.query_one("#settings-element-background", Input).value = str(
                override.get("background", "")
            )
            selection = self.query_one(
                "#settings-element-style",
                SelectionList,
            )
            selection.deselect_all()
            for style in override.get("styles", []):
                selection.select(str(style))
        finally:
            self._loading_element = False

    def reset_selected_element(self) -> str:
        """Reset and return the selected appearance target."""

        target = str(self.query_one("#settings-element", Select).value)
        self.element_overrides.pop(target, None)
        self._load_element_override(target)
        return target

    def collect_settings(self) -> SettingsValues:
        """Return validated primitive settings for the persistence layer."""

        self._capture_element_override(self._active_element)
        return {
            "theme": str(self.query_one("#settings-theme", Select).value),
            "density": str(self.query_one("#settings-density", Select).value),
            "accent": str(self.query_one("#settings-accent", Select).value),
            "language": str(self.query_one("#settings-language", Select).value),
            "funny_level_english": self._integer_select_value("#settings-funny-en"),
            "funny_level_cantonese": self._integer_select_value("#settings-funny-yue"),
            "editor": self.query_one("#settings-editor", Input).value.strip(),
            "terminal": self.query_one("#settings-terminal", Input).value.strip(),
            "narrator_enabled": self.query_one("#settings-narrator", Checkbox).value,
            "narrator_language": str(self.query_one("#settings-narrator-language", Select).value),
            "quiet_hours_start": self.query_one("#settings-quiet-start", Input).value.strip(),
            "quiet_hours_end": self.query_one("#settings-quiet-end", Input).value.strip(),
            "reduced_sound": self.query_one("#settings-reduced-sound", Checkbox).value,
            "reduced_motion": self.query_one("#settings-reduced-motion", Checkbox).value,
            "yield_to_screen_reader": self.query_one("#settings-screen-reader", Checkbox).value,
            "element_overrides": {
                target: {
                    "foreground": str(override.get("foreground", "")),
                    "background": str(override.get("background", "")),
                    "styles": list(override.get("styles", [])),
                }
                for target, override in self.element_overrides.items()
            },
        }

    def _integer_select_value(self, selector: str) -> int:
        value = self.query_one(selector, Select).value
        if not isinstance(value, int):
            raise ValueError(f"{selector} must contain an integer selection")
        return value
