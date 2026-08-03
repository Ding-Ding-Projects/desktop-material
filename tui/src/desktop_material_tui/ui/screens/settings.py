"""Persisted terminal appearance, language, editor, and accessibility settings."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
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
    ListItem,
    ListView,
    Select,
    SelectionList,
    Static,
    TextArea,
)

from ...application.search import RegexFlags, SearchMode, SearchService
from ...application.version_history import VersionEntry, VersionHistoryService
from ..i18n import LanguageMode, Translator, get_translator
from ..widgets.responsive_layout import ResponsiveFormRow, ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState


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


@dataclass(frozen=True)
class SettingTarget:
    """One searchable, focusable setting or settings-owned action."""

    key: str
    selector: str
    english_name: str
    cantonese_name: str
    english_description: str
    cantonese_description: str
    keywords: tuple[str, ...] = ()

    def name(self, translator: Translator) -> str:
        mode = translator.preferences.mode
        if mode is LanguageMode.CANTONESE:
            return self.cantonese_name
        if mode is LanguageMode.BILINGUAL:
            return f"{self.english_name} · {self.cantonese_name}"
        return self.english_name

    def description(self, translator: Translator) -> str:
        mode = translator.preferences.mode
        if mode is LanguageMode.CANTONESE:
            return self.cantonese_description
        if mode is LanguageMode.BILINGUAL:
            return f"{self.english_description} · {self.cantonese_description}"
        return self.english_description


SETTINGS_TARGETS: tuple[SettingTarget, ...] = (
    SettingTarget(
        "theme",
        "#settings-theme",
        "Theme",
        "主題",
        "Light, dark, or system theme.",
        "淺色、深色或者跟系統主題。",
        ("appearance", "外觀"),
    ),
    SettingTarget(
        "density",
        "#settings-density",
        "Density",
        "密度",
        "Comfortable or compact control spacing.",
        "舒適或者緊湊嘅控制間距。",
        ("appearance", "spacing", "外觀", "間距"),
    ),
    SettingTarget(
        "accent",
        "#settings-accent",
        "Accent colour",
        "強調色",
        "Seed colour used by interactive controls.",
        "互動控制使用嘅主色。",
        ("appearance", "color", "colour", "外觀", "顏色"),
    ),
    SettingTarget(
        "language",
        "#settings-language",
        "Language mode",
        "語言模式",
        "English, Cantonese, or bilingual copy.",
        "英文、廣東話或者雙語介面。",
        ("locale", "translation", "語言", "翻譯"),
    ),
    SettingTarget(
        "funny-en",
        "#settings-funny-en",
        "English funny level",
        "英文搞笑程度",
        "Choose the English voice from serious to playful.",
        "揀英文語氣由認真到玩味。",
        ("tone", "playful", "語氣", "搞笑"),
    ),
    SettingTarget(
        "funny-yue",
        "#settings-funny-yue",
        "Cantonese funny level",
        "廣東話搞笑程度",
        "Choose the Cantonese voice from serious to playful.",
        "揀廣東話語氣由認真到玩味。",
        ("tone", "playful", "語氣", "搞笑"),
    ),
    SettingTarget(
        "editor",
        "#settings-editor",
        "External editor",
        "外部編輯器",
        "Command used to open files and repositories.",
        "用嚟開檔案同倉庫嘅指令。",
        ("code", "vscode", "編輯器"),
    ),
    SettingTarget(
        "detect-editors",
        "#settings-detect-editors",
        "Detect editors",
        "偵測編輯器",
        "Find supported editors installed on this computer.",
        "搵出呢部電腦已安裝嘅支援編輯器。",
        ("discover", "installed", "偵測", "已安裝"),
    ),
    SettingTarget(
        "terminal",
        "#settings-terminal",
        "Terminal command",
        "終端指令",
        "Optional command for opening a terminal.",
        "開終端用嘅可選指令。",
        ("shell", "console", "終端", "命令列"),
    ),
    SettingTarget(
        "narrator",
        "#settings-narrator",
        "Spoken narrator",
        "語音旁述",
        "Enable optional spoken app events.",
        "開啟可選嘅 app 事件語音旁述。",
        ("speech", "tts", "聲音", "旁述"),
    ),
    SettingTarget(
        "narrator-language",
        "#settings-narrator-language",
        "Narrator language",
        "旁述語言",
        "Speak English, Cantonese, or both in order.",
        "依次用英文、廣東話或者兩者旁述。",
        ("speech", "tts", "語音"),
    ),
    SettingTarget(
        "quiet-start",
        "#settings-quiet-start",
        "Quiet hours start",
        "靜音時段開始",
        "Time when optional sounds become quiet.",
        "可選聲音開始靜音嘅時間。",
        ("sound", "time", "靜音", "時間"),
    ),
    SettingTarget(
        "quiet-end",
        "#settings-quiet-end",
        "Quiet hours end",
        "靜音時段結束",
        "Time when optional sounds resume.",
        "可選聲音恢復嘅時間。",
        ("sound", "time", "靜音", "時間"),
    ),
    SettingTarget(
        "reduced-sound",
        "#settings-reduced-sound",
        "Reduced sound",
        "減少聲音",
        "Reduce optional sound effects and narration.",
        "減少可選音效同旁述。",
        ("audio", "quiet", "聲音", "靜音"),
    ),
    SettingTarget(
        "reduced-motion",
        "#settings-reduced-motion",
        "Reduced motion",
        "減少動效",
        "Reduce non-essential interface motion.",
        "減少非必要介面動效。",
        ("accessibility", "animation", "無障礙", "動畫"),
    ),
    SettingTarget(
        "screen-reader",
        "#settings-screen-reader",
        "Yield to screen readers",
        "讓路俾螢幕閱讀器",
        "Keep optional narration from competing with assistive technology.",
        "避免可選旁述同輔助科技一齊講。",
        ("accessibility", "assistive", "無障礙", "螢幕閱讀器"),
    ),
    SettingTarget(
        "element",
        "#settings-element",
        "Appearance target",
        "外觀目標",
        "Choose which rendered surface to customize.",
        "揀要自訂嘅介面元素。",
        ("element", "surface", "外觀", "元素"),
    ),
    SettingTarget(
        "element-foreground",
        "#settings-element-foreground",
        "Foreground colour",
        "前景色",
        "Text colour for the selected appearance target.",
        "所選外觀目標嘅文字顏色。",
        ("text", "color", "colour", "文字", "顏色"),
    ),
    SettingTarget(
        "element-background",
        "#settings-element-background",
        "Background colour",
        "背景色",
        "Surface colour for the selected appearance target.",
        "所選外觀目標嘅表面顏色。",
        ("surface", "color", "colour", "背景", "顏色"),
    ),
    SettingTarget(
        "element-style",
        "#settings-element-style",
        "Text and border styles",
        "文字同邊框樣式",
        "Bold, italic, underline, and heavy border options.",
        "粗體、斜體、底線同粗邊框選項。",
        ("typography", "border", "字款", "邊框"),
    ),
    SettingTarget(
        "preview",
        "#settings-preview",
        "Preview settings",
        "預覽設定",
        "Apply appearance changes for this session.",
        "今次工作階段即時套用外觀變更。",
        ("appearance", "apply", "外觀", "套用"),
    ),
    SettingTarget(
        "reset-element",
        "#settings-reset-element",
        "Reset element appearance",
        "重設元素外觀",
        "Return the selected element to theme defaults.",
        "將所選元素還原到主題預設值。",
        ("appearance", "default", "外觀", "預設"),
    ),
    SettingTarget(
        "save",
        "#settings-save",
        "Save settings",
        "儲存設定",
        "Persist settings and record a local history snapshot.",
        "保存設定並記錄本機歷史快照。",
        ("persist", "history", "保存", "歷史"),
    ),
    SettingTarget(
        "undo",
        "#settings-undo",
        "Undo settings",
        "復原設定",
        "Restore the previous settings snapshot.",
        "還原上一個設定快照。",
        ("history", "restore", "歷史", "還原"),
    ),
    SettingTarget(
        "redo",
        "#settings-redo",
        "Redo settings",
        "重做設定",
        "Reapply the next settings snapshot.",
        "重新套用下一個設定快照。",
        ("history", "restore", "歷史", "重做"),
    ),
    SettingTarget(
        "history",
        "#settings-history",
        "Open settings history",
        "開啟設定歷史",
        "Browse, compare, and restore local settings versions.",
        "瀏覽、比較同還原本機設定版本。",
        ("versions", "snapshots", "版本", "快照"),
    ),
)

_SETTINGS_TARGET_BY_KEY = {target.key: target for target in SETTINGS_TARGETS}


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
        self._search_state = SearchState()

    def compose(self) -> ComposeResult:
        yield Label("Search settings", id="settings-search-title", classes="modal-title")
        yield SearchBar(
            surface_id="settings",
            placeholder="Search setting names, descriptions, values, or keywords…",
            id="settings-search",
        )
        yield Static(
            "Search in English or Cantonese, then activate a result to focus its control.",
            id="settings-search-status",
        )
        yield ListView(id="settings-search-results")

        yield Label("Appearance", classes="modal-title")
        with ResponsiveFormRow():
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
        with ResponsiveFormRow():
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
        with ResponsiveFormRow():
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
        with ResponsiveFormRow():
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
        with ResponsiveFormRow():
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
        with ScrollableToolbar():
            yield Button("Preview", id="settings-preview")
            yield Button("Reset element", id="settings-reset-element")
            yield Button("Save settings", id="settings-save", variant="primary")

        yield Label("Settings history", classes="modal-title")
        yield Static(
            "Settings snapshots are committed to an isolated local Git repository under "
            "the app data directory—not inside any repository you open.",
            id="settings-history-status",
        )
        with ScrollableToolbar():
            yield Button("Undo", id="settings-undo")
            yield Button("Redo", id="settings-redo")
            yield Button("Open history", id="settings-history")

    def on_mount(self) -> None:
        self.query_one("#settings-search-results", ListView).display = False

    @on(SearchBar.Changed, "#settings-search")
    async def _settings_search_changed(self, event: SearchBar.Changed) -> None:
        self._search_state = event.state
        await self._populate_settings_search()

    @on(ListView.Selected, "#settings-search-results")
    def _settings_result_selected(self, event: ListView.Selected) -> None:
        item_id = event.item.id or ""
        prefix = "settings-result-"
        if item_id.startswith(prefix):
            self.focus_target(item_id.removeprefix(prefix))

    async def _populate_settings_search(self) -> None:
        results = self.query_one("#settings-search-results", ListView)
        status = self.query_one("#settings-search-status", Static)
        query = self._search_state.query.strip()
        if not query:
            await results.clear()
            results.display = False
            status.update(
                "Search in English or Cantonese, then activate a result to focus its control."
            )
            return
        try:
            mode = SearchMode(self._search_state.mode)
        except ValueError:
            mode = SearchMode.LITERAL
        flags = RegexFlags(
            ignore_case=not self._search_state.case_sensitive or "i" in self._search_state.flags,
            multiline="m" in self._search_state.flags,
            dot_all="s" in self._search_state.flags,
        )
        result = SearchService().search(
            SETTINGS_TARGETS,
            query,
            mode=mode,
            flags=flags,
            get_text=self._target_search_text,
        )
        translator = get_translator()
        items = [
            ListItem(
                Static(
                    f"[b]{target.name(translator)}[/]\n"
                    f"[dim]{target.description(translator)} · "
                    f"Current: {self._target_current_value(target)}[/]",
                    markup=True,
                ),
                id=f"settings-result-{target.key}",
            )
            for target in result.items
        ]
        await results.clear()
        await results.extend(items)
        results.display = bool(items)
        if result.error is not None:
            status.update(f"[red]{result.error}[/] · Existing settings remain available.")
        elif items:
            status.update(f"{len(items)} matching setting(s). Activate one to focus it.")
        else:
            status.update(f"No settings match {query!r}.")

    def _target_search_text(self, target: SettingTarget) -> tuple[str, ...]:
        return (
            target.english_name,
            target.cantonese_name,
            target.english_description,
            target.cantonese_description,
            *target.keywords,
            self._target_current_value(target),
        )

    def _target_current_value(self, target: SettingTarget) -> str:
        widget = self.query_one(target.selector)
        if isinstance(widget, Input):
            return widget.value or "empty"
        if isinstance(widget, Select):
            return "blank" if widget.value is Select.BLANK else str(widget.value)
        if isinstance(widget, Checkbox):
            return "enabled" if widget.value else "disabled"
        if isinstance(widget, SelectionList):
            return ", ".join(str(value) for value in widget.selected) or "default"
        if isinstance(widget, Button):
            return str(widget.label)
        return "available"

    def focus_target(self, key: str) -> bool:
        """Clear the result rail and focus one exact setting control."""

        target = _SETTINGS_TARGET_BY_KEY.get(key)
        if target is None:
            return False
        results = self.query_one("#settings-search-results", ListView)
        results.display = False
        widget = self.query_one(target.selector)
        widget.scroll_visible(animate=False)
        widget.focus()
        # ListView completes its own selection/focus bookkeeping after the
        # Selected handler returns. Reassert the destination once that refresh
        # finishes so mouse and keyboard activation both land on the setting,
        # rather than bouncing back to the now-hidden result rail.
        self.call_after_refresh(widget.focus)
        self.query_one("#settings-search-status", Static).update(
            f"Focused {target.name(get_translator())}."
        )
        return True

    def palette_targets(self) -> tuple[SettingTarget, ...]:
        """Expose the same canonical destinations to the command palette."""

        return SETTINGS_TARGETS

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
