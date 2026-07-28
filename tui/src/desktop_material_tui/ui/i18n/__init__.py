"""Persistable English, Hong Kong Cantonese, and bilingual localization."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum

from .catalogs import CANTONESE_CATALOG, ENGLISH_CATALOG, MessageValue


class LanguageMode(str, Enum):
    ENGLISH = "english"
    CANTONESE = "cantonese"
    BILINGUAL = "bilingual"

    @classmethod
    def parse(cls, value: object) -> LanguageMode:
        if isinstance(value, cls):
            return value
        normalized = str(value).strip().lower().replace("_", "-")
        aliases = {
            "en": cls.ENGLISH,
            "en-us": cls.ENGLISH,
            "english": cls.ENGLISH,
            "cantonese": cls.CANTONESE,
            "zh-hk": cls.CANTONESE,
            "yue": cls.CANTONESE,
            "bilingual": cls.BILINGUAL,
            "both": cls.BILINGUAL,
        }
        return aliases.get(normalized, cls.ENGLISH)


@dataclass(frozen=True)
class LocalePreferences:
    mode: LanguageMode = LanguageMode.ENGLISH
    english_funny_level: int = 1
    cantonese_funny_level: int = 1
    bilingual_separator: str = "\n"

    def __post_init__(self) -> None:
        object.__setattr__(self, "mode", LanguageMode.parse(self.mode))
        if isinstance(self.english_funny_level, bool) or not 1 <= self.english_funny_level <= 5:
            raise ValueError("English funny level must be between 1 and 5")
        if isinstance(self.cantonese_funny_level, bool) or not 1 <= self.cantonese_funny_level <= 5:
            raise ValueError("Cantonese funny level must be between 1 and 5")

    @classmethod
    def from_values(
        cls,
        *,
        mode: object = LanguageMode.ENGLISH,
        english_funny_level: int = 1,
        cantonese_funny_level: int = 1,
        bilingual_separator: str = "\n",
    ) -> LocalePreferences:
        return cls(
            mode=LanguageMode.parse(mode),
            english_funny_level=english_funny_level,
            cantonese_funny_level=cantonese_funny_level,
            bilingual_separator=bilingual_separator,
        )


class Translator:
    """Resolve localized copy with deterministic, safe fallback behavior."""

    def __init__(
        self,
        preferences: LocalePreferences | None = None,
        *,
        english_catalog: Mapping[str, MessageValue] = ENGLISH_CATALOG,
        cantonese_catalog: Mapping[str, MessageValue] = CANTONESE_CATALOG,
    ) -> None:
        self.preferences = preferences or LocalePreferences()
        self.english_catalog = english_catalog
        self.cantonese_catalog = cantonese_catalog

    def translate(self, key: str, **parameters: object) -> str:
        english = _resolve(
            self.english_catalog,
            key,
            self.preferences.english_funny_level,
        )
        if english is None:
            english = key
        cantonese = _resolve(
            self.cantonese_catalog,
            key,
            self.preferences.cantonese_funny_level,
        )
        if cantonese is None:
            cantonese = english

        if self.preferences.mode is LanguageMode.CANTONESE:
            return _format(cantonese, parameters)
        if self.preferences.mode is LanguageMode.BILINGUAL:
            formatted_english = _format(english, parameters)
            formatted_cantonese = _format(cantonese, parameters)
            if formatted_cantonese == formatted_english:
                return formatted_english
            return formatted_english + self.preferences.bilingual_separator + formatted_cantonese
        return _format(english, parameters)

    # Familiar short form for UI call sites.
    t = translate

    def with_preferences(
        self,
        *,
        mode: object | None = None,
        english_funny_level: int | None = None,
        cantonese_funny_level: int | None = None,
        bilingual_separator: str | None = None,
    ) -> Translator:
        preferences = LocalePreferences(
            mode=self.preferences.mode if mode is None else LanguageMode.parse(mode),
            english_funny_level=(
                self.preferences.english_funny_level
                if english_funny_level is None
                else english_funny_level
            ),
            cantonese_funny_level=(
                self.preferences.cantonese_funny_level
                if cantonese_funny_level is None
                else cantonese_funny_level
            ),
            bilingual_separator=(
                self.preferences.bilingual_separator
                if bilingual_separator is None
                else bilingual_separator
            ),
        )
        return Translator(
            preferences,
            english_catalog=self.english_catalog,
            cantonese_catalog=self.cantonese_catalog,
        )

    @property
    def available_keys(self) -> frozenset[str]:
        return frozenset((*self.english_catalog.keys(), *self.cantonese_catalog.keys()))


class _SafeParameters(dict[str, object]):
    def __missing__(self, key: str) -> str:
        # Missing runtime data should never crash the whole TUI. Keeping the
        # placeholder visible also makes the defect diagnosable.
        return "{" + key + "}"


def _resolve(
    catalog: Mapping[str, MessageValue],
    key: str,
    funny_level: int,
) -> str | None:
    value = catalog.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        return value
    eligible = [level for level in value if level <= funny_level]
    if not eligible:
        eligible = list(value)
    if not eligible:
        return None
    return value[max(eligible)]


def _format(template: str, parameters: Mapping[str, object]) -> str:
    try:
        return template.format_map(_SafeParameters(parameters))
    except (ValueError, TypeError):
        # Catalog content is trusted, but a bad runtime object's __format__
        # method must not take down a screen.
        return template


_default_translator = Translator()


def configure(preferences: LocalePreferences) -> Translator:
    global _default_translator
    _default_translator = Translator(preferences)
    return _default_translator


def get_translator() -> Translator:
    return _default_translator


def t(key: str, **parameters: object) -> str:
    return _default_translator.translate(key, **parameters)


__all__ = [
    "CANTONESE_CATALOG",
    "ENGLISH_CATALOG",
    "LanguageMode",
    "LocalePreferences",
    "Translator",
    "configure",
    "get_translator",
    "t",
]
