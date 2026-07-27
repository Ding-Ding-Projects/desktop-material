# ruff: noqa: RUF001
from __future__ import annotations

import pytest

from desktop_material_tui.ui.i18n import (
    LanguageMode,
    LocalePreferences,
    Translator,
)


def test_language_modes_and_bilingual_formatting() -> None:
    english = Translator(LocalePreferences(LanguageMode.ENGLISH))
    cantonese = Translator(LocalePreferences(LanguageMode.CANTONESE))
    bilingual = Translator(LocalePreferences(LanguageMode.BILINGUAL))

    assert english.translate("common.save") == "Save"
    assert cantonese.translate("common.save") == "儲存"
    assert bilingual.translate("common.save") == "Save\n儲存"


def test_funny_levels_are_independent_and_do_not_change_error_copy() -> None:
    translator = Translator(
        LocalePreferences(
            LanguageMode.BILINGUAL,
            english_funny_level=1,
            cantonese_funny_level=5,
        )
    )

    ready = translator.translate("status.ready")
    assert ready.startswith("Ready\n")
    assert "飲完茶" in ready
    assert translator.translate("error.git", detail="exit 1") == (
        "Git operation failed: exit 1\nGit 操作失敗：exit 1"
    )


def test_catalog_fallback_is_cantonese_to_english_to_key() -> None:
    translator = Translator(
        LocalePreferences(LanguageMode.CANTONESE),
        english_catalog={"english.only": "Fallback"},
        cantonese_catalog={},
    )

    assert translator.translate("english.only") == "Fallback"
    assert translator.translate("missing.key") == "missing.key"


def test_missing_format_values_stay_visible_instead_of_crashing() -> None:
    translator = Translator()
    assert translator.translate("error.permission") == "Permission denied: {path}"


@pytest.mark.parametrize(("english", "cantonese"), [(0, 1), (6, 1), (1, 0), (1, 8)])
def test_funny_levels_are_exactly_one_to_five(
    english: int,
    cantonese: int,
) -> None:
    with pytest.raises(ValueError, match="funny level"):
        LocalePreferences(
            english_funny_level=english,
            cantonese_funny_level=cantonese,
        )


def test_language_parser_safely_falls_back_to_english() -> None:
    assert LanguageMode.parse("zh-HK") is LanguageMode.CANTONESE
    assert LanguageMode.parse("not-a-locale") is LanguageMode.ENGLISH
    assert LocalePreferences(mode="zh-HK").mode is LanguageMode.CANTONESE  # type: ignore[arg-type]
