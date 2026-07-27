from __future__ import annotations

import time

import pytest

from desktop_material_tui.application.search import (
    MAX_REGEX_INPUT_LENGTH,
    MAX_REGEX_PATTERN_LENGTH,
    MAX_REGEX_TOTAL_INPUT_LENGTH,
    RegexFlags,
    RegexLimitError,
    RegexValidationError,
    SafeRegex,
    SearchMode,
    SearchService,
)


def test_search_is_literal_and_case_insensitive_by_default() -> None:
    service = SearchService()
    result = service.search(["README.*", "readme.md", "src"], "README.")

    assert result.items == ("README.*", "readme.md")
    assert result.error is None


def test_regex_supports_flags_unicode_multiline_and_dot_all() -> None:
    regex = SafeRegex.compile(
        r"^(?P<label>héllo).+END$",
        RegexFlags(ignore_case=True, multiline=True, dot_all=True),
    )
    evaluation = regex.evaluate("prefix\nHÉLLO\n世界\nend\nsuffix")

    assert len(evaluation.matches) == 1
    match = evaluation.matches[0]
    assert match.text == "HÉLLO\n世界\nend"
    assert match.groups[0].value == "HÉLLO"
    assert match.named_groups["label"].value == "HÉLLO"


def test_regex_enumerates_zero_width_matches_without_duplicates_or_looping() -> None:
    evaluation = SafeRegex.compile(r"^|$").evaluate("ab")

    assert [(match.start, match.end) for match in evaluation.matches] == [(0, 0), (2, 2)]


def test_regex_reports_optional_and_bounded_capture_previews() -> None:
    regex = SafeRegex.compile(r"(?P<required>a)(b)?(?P<long>c+)")
    evaluation = regex.evaluate("a" + ("c" * 200))
    match = evaluation.matches[0]

    assert match.groups[1].value is None
    assert match.groups[1].original_length is None
    assert len(match.named_groups["long"].value or "") == 120
    assert match.named_groups["long"].original_length == 200


@pytest.mark.parametrize("pattern", [r"(a)\1", r"(?=a)", r"(?<=a)b"])
def test_regex_rejects_constructs_outside_re2(pattern: str) -> None:
    with pytest.raises(RegexValidationError):
        SafeRegex.compile(pattern)


def test_regex_bounds_pattern_candidate_aggregate_and_match_enumeration() -> None:
    with pytest.raises(RegexLimitError):
        SafeRegex.compile("a" * (MAX_REGEX_PATTERN_LENGTH + 1))
    regex = SafeRegex.compile("a")
    with pytest.raises(RegexLimitError):
        regex.evaluate("a" * (MAX_REGEX_INPUT_LENGTH + 1))

    evaluation = regex.evaluate("a" * 5_100)
    assert len(evaluation.matches) == 5_000
    assert evaluation.truncated

    service = SearchService()
    aggregate = service.search(
        ["a" * 100_000] * ((MAX_REGEX_TOTAL_INPUT_LENGTH // 100_000) + 1),
        "a",
        mode=SearchMode.REGEX,
    )
    assert aggregate.items == ()
    assert aggregate.error is not None


def test_invalid_regex_preserves_candidates_and_returns_error() -> None:
    result = SearchService().search(
        ["one", "two"],
        "(",
        mode=SearchMode.REGEX,
    )

    assert result.items == ("one", "two")
    assert "Invalid or unsupported RE2" in (result.error or "")


def test_adversarial_nested_quantifier_stays_bounded_under_re2() -> None:
    started = time.monotonic()
    matched = SafeRegex.compile(r"(a+)+$").test("a" * 100_000)

    assert matched
    assert time.monotonic() - started < 2.0


def test_regex_flags_parser_rejects_unknown_flags() -> None:
    assert RegexFlags.parse("ims").letters == "ims"
    with pytest.raises(RegexValidationError):
        RegexFlags.parse("g")


def test_search_fuzzy_mode_orders_compact_matches_first() -> None:
    result = SearchService().search(
        ["desktop material", "distant-mountain"],
        "dm",
        mode=SearchMode.FUZZY,
    )

    assert result.items[0] == "desktop material"


def test_literal_and_fuzzy_search_preserve_unicode_source_indices() -> None:
    service = SearchService()

    literal = service.search(["Straße"], "STRASSE")
    fuzzy = service.search(["große"], "sse", mode=SearchMode.FUZZY)

    assert literal.hits[0].spans[0][0].text == "Straße"
    assert fuzzy.hits[0].spans[0][0].text == "ß"
