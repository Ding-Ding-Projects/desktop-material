"""Typed TOML configuration with locked, atomic persistence."""

from __future__ import annotations

import importlib
import re
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass, field, replace
from typing import Any, cast

import tomli_w

try:
    tomllib = importlib.import_module("tomllib")
except ModuleNotFoundError:  # pragma: no cover - exercised on Python 3.10
    tomllib = importlib.import_module("tomli")

from .atomic import atomic_write_text
from .locking import FileLock
from .paths import XDGPaths

CURRENT_CONFIG_VERSION = 1
LANGUAGE_MODES = frozenset(("english", "cantonese", "bilingual"))
THEMES = frozenset(("system", "light", "dark"))
DENSITIES = frozenset(("compact", "comfortable", "spacious"))
SEARCH_MODES = frozenset(("literal", "fuzzy", "regex"))
NARRATOR_LANGUAGES = frozenset(("english", "cantonese", "both", "en", "yue-HK"))
ELEMENT_TARGETS = frozenset(
    ("workspace", "repository-rail", "toolbar", "tabs", "diff", "notifications")
)
ELEMENT_STYLES = frozenset(("bold", "italic", "underline", "heavy-border"))
_CLOCK_TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class ConfigError(ValueError):
    """Configuration could not be parsed or validated."""


@dataclass(frozen=True)
class AppearanceConfig:
    theme: str = "system"
    density: str = "comfortable"
    accent: str = "#6750a4"
    unicode_borders: bool = True
    reduced_motion: bool = False
    repository_rail_width: int = 28
    element_overrides: dict[str, dict[str, object]] = field(default_factory=dict)

    def validate(self) -> None:
        if self.theme not in THEMES:
            raise ConfigError(f"Unsupported theme: {self.theme}")
        if self.density not in DENSITIES:
            raise ConfigError(f"Unsupported density: {self.density}")
        if not _is_hex_colour(self.accent):
            raise ConfigError("Accent must be a #RRGGBB colour")
        if (
            isinstance(self.repository_rail_width, bool)
            or not isinstance(self.repository_rail_width, int)
            or self.repository_rail_width < 20
        ):
            raise ConfigError("Repository rail width must be an integer of at least 20")
        for target, override in self.element_overrides.items():
            if target not in ELEMENT_TARGETS:
                raise ConfigError(f"Unsupported appearance target: {target}")
            for key in ("foreground", "background"):
                colour = override.get(key, "")
                if not isinstance(colour, str) or (colour and not _is_hex_colour(colour)):
                    raise ConfigError(f"{target}.{key} must be empty or a #RRGGBB colour")
            styles = override.get("styles", [])
            if not isinstance(styles, (list, tuple)) or any(
                not isinstance(style, str) or style not in ELEMENT_STYLES for style in styles
            ):
                raise ConfigError(f"{target}.styles contains an unsupported style")


@dataclass(frozen=True)
class LanguageConfig:
    mode: str = "english"
    english_funny_level: int = 1
    cantonese_funny_level: int = 1

    def validate(self) -> None:
        if self.mode not in LANGUAGE_MODES:
            raise ConfigError(f"Unsupported language mode: {self.mode}")
        _validate_funny_level(self.english_funny_level, "English")
        _validate_funny_level(self.cantonese_funny_level, "Cantonese")


@dataclass(frozen=True)
class InteractionConfig:
    mouse_enabled: bool = True
    confirm_destructive_actions: bool = True
    notification_timeout_seconds: int = 5
    editor: str = "auto"
    terminal: str = "auto"
    narrator_enabled: bool = False
    narrator_language: str = "english"
    quiet_hours_start: str = ""
    quiet_hours_end: str = ""
    reduced_sound: bool = False
    yield_to_screen_reader: bool = True

    def validate(self) -> None:
        if not 1 <= self.notification_timeout_seconds <= 60:
            raise ConfigError("Notification timeout must be between 1 and 60 seconds")
        _validate_command_preference(self.editor, "Editor")
        _validate_command_preference(self.terminal, "Terminal")
        if self.narrator_language not in NARRATOR_LANGUAGES:
            raise ConfigError(f"Unsupported narrator language: {self.narrator_language}")
        if bool(self.quiet_hours_start) != bool(self.quiet_hours_end):
            raise ConfigError("Quiet hours start and end must either both be set or both be empty")
        for value, name in (
            (self.quiet_hours_start, "Quiet hours start"),
            (self.quiet_hours_end, "Quiet hours end"),
        ):
            if value and _CLOCK_TIME_PATTERN.fullmatch(value) is None:
                raise ConfigError(f"{name} must use 24-hour HH:MM format")


@dataclass(frozen=True)
class SearchConfig:
    default_mode: str = "literal"
    case_sensitive: bool = False
    multiline: bool = False

    def validate(self) -> None:
        if self.default_mode not in SEARCH_MODES:
            raise ConfigError(f"Unsupported search mode: {self.default_mode}")


@dataclass(frozen=True)
class AppConfig:
    schema_version: int = CURRENT_CONFIG_VERSION
    active_profile: str = "local"
    appearance: AppearanceConfig = AppearanceConfig()
    language: LanguageConfig = LanguageConfig()
    interaction: InteractionConfig = InteractionConfig()
    search: SearchConfig = SearchConfig()

    def validate(self) -> None:
        if self.schema_version != CURRENT_CONFIG_VERSION:
            raise ConfigError(
                f"Unsupported config version {self.schema_version}; "
                f"expected {CURRENT_CONFIG_VERSION}"
            )
        if not self.active_profile.strip():
            raise ConfigError("Active profile cannot be empty")
        self.appearance.validate()
        self.language.validate()
        self.interaction.validate()
        self.search.validate()


class ConfigStore:
    """Read and update the application TOML file under one advisory lock."""

    def __init__(
        self,
        paths: XDGPaths,
        *,
        lock_timeout: float | None = 10.0,
    ) -> None:
        self.paths = paths
        self.path = paths.config_file
        self.lock_path = paths.lock_dir / "config.lock"
        self.lock_timeout = lock_timeout

    def load(self) -> AppConfig:
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            return self._load_unlocked()

    def load_or_default(self) -> AppConfig:
        """Load a valid config, returning defaults for a malformed file.

        The invalid file is not overwritten, so recovery remains reversible.
        """

        try:
            return self.load()
        except (ConfigError, OSError):
            return AppConfig()

    def save(self, config: AppConfig) -> None:
        config.validate()
        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            atomic_write_text(self.path, _toml_dumps(asdict(config)), mode=0o600)

    def update(self, transform: Callable[[AppConfig], AppConfig]) -> AppConfig:
        """Atomically perform a read/modify/write operation."""

        self.paths.ensure()
        with FileLock(self.lock_path, timeout=self.lock_timeout):
            current = self._load_unlocked()
            updated = transform(current)
            updated.validate()
            atomic_write_text(self.path, _toml_dumps(asdict(updated)), mode=0o600)
            return updated

    def _load_unlocked(self) -> AppConfig:
        if not self.path.exists():
            return AppConfig()
        try:
            with self.path.open("rb") as handle:
                raw = tomllib.load(handle)
        except (OSError, tomllib.TOMLDecodeError) as error:
            raise ConfigError(f"Unable to parse {self.path}: {error}") from error
        config = _config_from_mapping(raw)
        config.validate()
        return config


def _config_from_mapping(raw: Mapping[str, Any]) -> AppConfig:
    try:
        appearance_raw = _mapping(raw.get("appearance"))
        language_raw = _mapping(raw.get("language"))
        interaction_raw = _mapping(raw.get("interaction"))
        search_raw = _mapping(raw.get("search"))

        config = AppConfig(
            schema_version=_integer(
                raw.get("schema_version"), CURRENT_CONFIG_VERSION, "schema_version"
            ),
            active_profile=_string(raw.get("active_profile"), "local", "active_profile"),
            appearance=AppearanceConfig(
                theme=_string(appearance_raw.get("theme"), "system", "appearance.theme"),
                density=_string(
                    appearance_raw.get("density"),
                    "comfortable",
                    "appearance.density",
                ),
                accent=_string(appearance_raw.get("accent"), "#6750a4", "appearance.accent"),
                unicode_borders=_boolean(
                    appearance_raw.get("unicode_borders"),
                    True,
                    "appearance.unicode_borders",
                ),
                reduced_motion=_boolean(
                    appearance_raw.get("reduced_motion"),
                    False,
                    "appearance.reduced_motion",
                ),
                repository_rail_width=_integer(
                    appearance_raw.get("repository_rail_width"),
                    28,
                    "appearance.repository_rail_width",
                ),
                element_overrides=_element_overrides(appearance_raw.get("element_overrides")),
            ),
            language=LanguageConfig(
                mode=_string(language_raw.get("mode"), "english", "language.mode"),
                english_funny_level=_integer(
                    language_raw.get("english_funny_level"),
                    1,
                    "language.english_funny_level",
                ),
                cantonese_funny_level=_integer(
                    language_raw.get("cantonese_funny_level"),
                    1,
                    "language.cantonese_funny_level",
                ),
            ),
            interaction=InteractionConfig(
                mouse_enabled=_boolean(
                    interaction_raw.get("mouse_enabled"),
                    True,
                    "interaction.mouse_enabled",
                ),
                confirm_destructive_actions=_boolean(
                    interaction_raw.get("confirm_destructive_actions"),
                    True,
                    "interaction.confirm_destructive_actions",
                ),
                notification_timeout_seconds=_integer(
                    interaction_raw.get("notification_timeout_seconds"),
                    5,
                    "interaction.notification_timeout_seconds",
                ),
                editor=_string(interaction_raw.get("editor"), "auto", "interaction.editor"),
                terminal=_string(interaction_raw.get("terminal"), "auto", "interaction.terminal"),
                narrator_enabled=_boolean(
                    interaction_raw.get("narrator_enabled"),
                    False,
                    "interaction.narrator_enabled",
                ),
                narrator_language=_string(
                    interaction_raw.get("narrator_language"),
                    "english",
                    "interaction.narrator_language",
                ),
                quiet_hours_start=_string(
                    interaction_raw.get("quiet_hours_start"),
                    "",
                    "interaction.quiet_hours_start",
                ),
                quiet_hours_end=_string(
                    interaction_raw.get("quiet_hours_end"),
                    "",
                    "interaction.quiet_hours_end",
                ),
                reduced_sound=_boolean(
                    interaction_raw.get("reduced_sound"),
                    False,
                    "interaction.reduced_sound",
                ),
                yield_to_screen_reader=_boolean(
                    interaction_raw.get("yield_to_screen_reader"),
                    True,
                    "interaction.yield_to_screen_reader",
                ),
            ),
            search=SearchConfig(
                default_mode=_string(
                    search_raw.get("default_mode"), "literal", "search.default_mode"
                ),
                case_sensitive=_boolean(
                    search_raw.get("case_sensitive"),
                    False,
                    "search.case_sensitive",
                ),
                multiline=_boolean(search_raw.get("multiline"), False, "search.multiline"),
            ),
        )
    except TypeError as error:
        raise ConfigError(str(error)) from error
    return config


def _mapping(value: object) -> Mapping[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise TypeError("Configuration section must be a table")
    return cast(Mapping[str, Any], value)


def _element_overrides(value: object) -> dict[str, dict[str, object]]:
    raw_targets = _mapping(value)
    targets: dict[str, dict[str, object]] = {}
    for target, raw_override in raw_targets.items():
        override = _mapping(raw_override)
        raw_styles = override.get("styles", [])
        if not isinstance(raw_styles, (list, tuple)):
            raise TypeError(f"appearance.element_overrides.{target}.styles must be an array")
        targets[str(target)] = {
            "foreground": _string(
                override.get("foreground"),
                "",
                f"appearance.element_overrides.{target}.foreground",
            ),
            "background": _string(
                override.get("background"),
                "",
                f"appearance.element_overrides.{target}.background",
            ),
            "styles": [str(style) for style in raw_styles],
        }
    return targets


def _string(value: object, default: str, name: str) -> str:
    if value is None:
        return default
    if not isinstance(value, str):
        raise TypeError(f"{name} must be a string")
    return value


def _integer(value: object, default: int, name: str) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    return value


def _boolean(value: object, default: bool, name: str) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise TypeError(f"{name} must be a boolean")
    return value


def _validate_funny_level(value: int, language: str) -> None:
    if isinstance(value, bool) or not 1 <= value <= 5:
        raise ConfigError(f"{language} funny level must be between 1 and 5")


def _is_hex_colour(value: str) -> bool:
    if len(value) != 7 or not value.startswith("#"):
        return False
    return all(character in "0123456789abcdefABCDEF" for character in value[1:])


def _validate_command_preference(value: str, name: str) -> None:
    if "\0" in value or "\r" in value or "\n" in value:
        raise ConfigError(f"{name} preference contains an invalid control character")
    if len(value) > 4096:
        raise ConfigError(f"{name} preference is too long")


def _toml_dumps(value: Mapping[str, object]) -> str:
    return tomli_w.dumps(dict(value))


def load_toml_bytes(value: bytes) -> Mapping[str, Any]:
    """Parse a TOML history payload without exposing the parser dependency."""

    try:
        return cast(Mapping[str, Any], tomllib.loads(value.decode("utf-8")))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ConfigError(f"Unable to parse history TOML: {error}") from error


def app_config_from_mapping(value: Mapping[str, Any]) -> AppConfig:
    """Validate and hydrate a settings snapshot from local version history."""

    config = _config_from_mapping(value)
    config.validate()
    return config


def app_config_with_profile(config: AppConfig, profile: str) -> AppConfig:
    """Convenient typed update used by profile pickers."""

    updated = replace(config, active_profile=profile)
    updated.validate()
    return updated
