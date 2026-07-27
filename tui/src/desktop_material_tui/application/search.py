"""Bounded literal, fuzzy, and official RE2 search services."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any,
    Generic,
    TypeVar,
    cast,
)

import re2  # type: ignore[import-untyped]

SAFE_REGEX_DIALECT = "RE2"
MAX_REGEX_PATTERN_LENGTH = 1_000
MAX_REGEX_INPUT_LENGTH = 100_000
MAX_REGEX_TOTAL_INPUT_LENGTH = 1_000_000
MAX_REGEX_MATCH_COUNT = 5_000
MAX_REGEX_CAPTURE_WORK = 50_000
MAX_REGEX_CAPTURE_PREVIEWS = 24
MAX_REGEX_CAPTURE_PREVIEW_LENGTH = 120
RE2_MAX_MEMORY_BYTES = 8 * 1024 * 1024

T = TypeVar("T")
TextExtractor = Callable[[T], str | Sequence[str]]


class SearchMode(str, Enum):
    """Search stays literal unless the user deliberately selects another mode."""

    LITERAL = "literal"
    SUBSTRING = "substring"
    FUZZY = "fuzzy"
    REGEX = "regex"


@dataclass(frozen=True)
class RegexFlags:
    ignore_case: bool = False
    multiline: bool = False
    dot_all: bool = False

    @property
    def letters(self) -> str:
        return "".join(
            (
                "i" if self.ignore_case else "",
                "m" if self.multiline else "",
                "s" if self.dot_all else "",
            )
        )

    @classmethod
    def parse(cls, value: str) -> RegexFlags:
        unknown = set(value) - {"i", "m", "s"}
        if unknown:
            raise RegexValidationError(f"Unsupported RE2 flag(s): {''.join(sorted(unknown))}")
        return cls(
            ignore_case="i" in value,
            multiline="m" in value,
            dot_all="s" in value,
        )


class RegexValidationError(ValueError):
    """Pattern or flags are invalid or unsupported by RE2."""


class RegexLimitError(RegexValidationError):
    """A pattern or candidate exceeded an application safety bound."""


@dataclass(frozen=True)
class CapturePreview:
    value: str | None
    original_length: int | None


@dataclass(frozen=True)
class RegexMatch:
    start: int
    end: int
    text: str
    groups: tuple[CapturePreview, ...] = ()
    named_groups: Mapping[str, CapturePreview] = field(default_factory=dict)
    captures_omitted: int = 0


@dataclass(frozen=True)
class RegexEvaluation:
    matches: tuple[RegexMatch, ...]
    truncated: bool = False


@dataclass(frozen=True)
class SearchHit(Generic[T]):
    item: T
    spans: tuple[tuple[RegexMatch, ...], ...] = ()
    score: float = 1.0


@dataclass(frozen=True)
class SearchResult(Generic[T]):
    hits: tuple[SearchHit[T], ...]
    error: str | None = None

    @property
    def items(self) -> tuple[T, ...]:
        return tuple(hit.item for hit in self.hits)


class SafeRegex:
    """A renderer-safe adapter around the official ``google-re2`` binding."""

    def __init__(self, pattern: str, flags: RegexFlags, compiled: Any) -> None:
        self.pattern = pattern
        self.flags = flags
        self._compiled = compiled
        self.capture_group_count = int(compiled.groups)
        self.named_group_names = tuple(
            name
            for name, _index in sorted(
                cast(Mapping[str, int], compiled.groupindex).items(),
                key=lambda item: item[1],
            )
        )

    @classmethod
    def compile(
        cls,
        pattern: str,
        flags: RegexFlags | None = None,
    ) -> SafeRegex:
        regex_flags = RegexFlags() if flags is None else flags
        if len(pattern) > MAX_REGEX_PATTERN_LENGTH:
            raise RegexLimitError(f"RE2 pattern exceeds {MAX_REGEX_PATTERN_LENGTH} characters")
        options = re2.Options()
        options.case_sensitive = not regex_flags.ignore_case
        options.dot_nl = regex_flags.dot_all
        options.log_errors = False
        options.max_mem = RE2_MAX_MEMORY_BYTES
        # The binding does not expose a MULTILINE flag constant. RE2's inline
        # mode switch is part of the same safe dialect and does not create a
        # capturing group.
        effective_pattern = f"(?m:{pattern})" if regex_flags.multiline else pattern
        try:
            compiled = re2.compile(effective_pattern, options=options)
        except Exception as error:
            raise RegexValidationError(
                f"Invalid or unsupported {SAFE_REGEX_DIALECT} pattern: {error}"
            ) from error
        return cls(pattern, regex_flags, compiled)

    def test(self, text: str) -> bool:
        _validate_input_length(text)
        return self._compiled.search(text) is not None

    def maximum_match_count(self, requested: int = MAX_REGEX_MATCH_COUNT) -> int:
        bounded = max(0, min(requested, MAX_REGEX_MATCH_COUNT))
        if self.capture_group_count == 0:
            return bounded
        capture_bound = max(1, MAX_REGEX_CAPTURE_WORK // self.capture_group_count)
        return min(bounded, capture_bound)

    def evaluate(
        self,
        text: str,
        *,
        max_matches: int = MAX_REGEX_MATCH_COUNT,
        capture_first_match: bool = True,
    ) -> RegexEvaluation:
        _validate_input_length(text)
        limit = self.maximum_match_count(max_matches)
        retained: list[RegexMatch] = []
        truncated = False
        for match in _unique_matches(self._compiled.finditer(text)):
            if len(retained) >= limit:
                truncated = True
                break
            groups: list[CapturePreview] = []
            named_groups: dict[str, CapturePreview] = {}
            captures_omitted = 0
            if capture_first_match and not retained:
                raw_groups = match.groups()
                numbered_count = min(
                    len(raw_groups),
                    MAX_REGEX_CAPTURE_PREVIEWS,
                )
                groups.extend(
                    _capture_preview(raw_groups[index]) for index in range(numbered_count)
                )
                named_limit = max(0, MAX_REGEX_CAPTURE_PREVIEWS - len(groups))
                raw_named = match.groupdict()
                for name in self.named_group_names[:named_limit]:
                    named_groups[name] = _capture_preview(raw_named.get(name))
                captures_omitted = max(
                    0,
                    self.capture_group_count
                    + len(self.named_group_names)
                    - len(groups)
                    - len(named_groups),
                )
            start, end = match.span()
            retained.append(
                RegexMatch(
                    start=start,
                    end=end,
                    text=match.group(0) or "",
                    groups=tuple(groups),
                    named_groups=named_groups,
                    captures_omitted=captures_omitted,
                )
            )
        return RegexEvaluation(matches=tuple(retained), truncated=truncated)


class SearchService:
    """Shared bounded search contract for every collection surface."""

    def search(
        self,
        items: Iterable[T],
        query: str,
        *,
        mode: SearchMode = SearchMode.LITERAL,
        flags: RegexFlags | None = None,
        get_text: TextExtractor[T] | None = None,
    ) -> SearchResult[T]:
        materialized = tuple(items)
        extractor: TextExtractor[T]
        extractor = (lambda item: str(item)) if get_text is None else get_text

        normalized_keys: list[tuple[str, ...]] = []
        total_length = 0
        for item in materialized:
            raw_keys = extractor(item)
            keys = (raw_keys,) if isinstance(raw_keys, str) else tuple(raw_keys)
            for key in keys:
                if len(key) > MAX_REGEX_INPUT_LENGTH:
                    return SearchResult(
                        hits=(),
                        error=(f"Search input exceeds {MAX_REGEX_INPUT_LENGTH} characters"),
                    )
                total_length += len(key)
                if total_length > MAX_REGEX_TOTAL_INPUT_LENGTH:
                    return SearchResult(
                        hits=(),
                        error=(
                            "Aggregate search input exceeds "
                            f"{MAX_REGEX_TOTAL_INPUT_LENGTH} characters"
                        ),
                    )
            normalized_keys.append(keys)

        if mode is SearchMode.REGEX:
            return self._regex_search(
                materialized,
                normalized_keys,
                query,
                RegexFlags() if flags is None else flags,
            )
        if mode is SearchMode.FUZZY:
            return self._fuzzy_search(
                materialized,
                normalized_keys,
                query,
                False if flags is None else not flags.ignore_case,
            )
        return self._literal_search(
            materialized,
            normalized_keys,
            query,
            False if flags is None else not flags.ignore_case,
        )

    # Alias for collection-store callers.
    filter = search

    def _regex_search(
        self,
        items: Sequence[T],
        keys_by_item: Sequence[tuple[str, ...]],
        pattern: str,
        flags: RegexFlags,
    ) -> SearchResult[T]:
        try:
            regex = SafeRegex.compile(pattern, flags)
        except RegexValidationError as error:
            # Invalid patterns preserve the incoming list while visibly
            # reporting the error, matching the desktop contract.
            return SearchResult(
                hits=tuple(SearchHit(item=item) for item in items),
                error=str(error),
            )

        remaining = regex.maximum_match_count()
        hits: list[SearchHit[T]] = []
        for item, keys in zip(items, keys_by_item, strict=True):
            if not any(regex.test(key) for key in keys):
                continue
            key_matches: list[tuple[RegexMatch, ...]] = []
            for key in keys:
                evaluation = regex.evaluate(
                    key,
                    max_matches=remaining,
                    capture_first_match=False,
                )
                key_matches.append(evaluation.matches)
                remaining = max(0, remaining - len(evaluation.matches))
            hits.append(SearchHit(item=item, spans=tuple(key_matches)))
        return SearchResult(hits=tuple(hits))

    def _literal_search(
        self,
        items: Sequence[T],
        keys_by_item: Sequence[tuple[str, ...]],
        query: str,
        case_sensitive: bool,
    ) -> SearchResult[T]:
        if query == "":
            return SearchResult(hits=tuple(SearchHit(item=item) for item in items))
        hits: list[SearchHit[T]] = []
        for item, keys in zip(items, keys_by_item, strict=True):
            match_sets = tuple(
                _literal_matches(key, query, case_sensitive=case_sensitive) for key in keys
            )
            if any(match_sets):
                hits.append(SearchHit(item=item, spans=match_sets))
        return SearchResult(hits=tuple(hits))

    def _fuzzy_search(
        self,
        items: Sequence[T],
        keys_by_item: Sequence[tuple[str, ...]],
        query: str,
        case_sensitive: bool,
    ) -> SearchResult[T]:
        if query == "":
            return SearchResult(hits=tuple(SearchHit(item=item) for item in items))
        hits: list[SearchHit[T]] = []
        for item, keys in zip(items, keys_by_item, strict=True):
            best: tuple[float, tuple[RegexMatch, ...], int] | None = None
            all_spans: list[tuple[RegexMatch, ...]] = [() for _key in keys]
            for index, key in enumerate(keys):
                fuzzy = _fuzzy_matches(key, query, case_sensitive=case_sensitive)
                if fuzzy is None:
                    continue
                score, spans = fuzzy
                all_spans[index] = spans
                if best is None or score > best[0]:
                    best = (score, spans, index)
            if best is not None:
                hits.append(SearchHit(item=item, spans=tuple(all_spans), score=best[0]))
        hits.sort(key=lambda hit: hit.score, reverse=True)
        return SearchResult(hits=tuple(hits))


def compile_safe_regex(
    pattern: str,
    flags: RegexFlags | None = None,
) -> SafeRegex:
    return SafeRegex.compile(pattern, flags)


def _validate_input_length(text: str) -> None:
    if len(text) > MAX_REGEX_INPUT_LENGTH:
        raise RegexLimitError(f"RE2 input exceeds {MAX_REGEX_INPUT_LENGTH} characters")


def _unique_matches(matches: Iterator[Any]) -> Iterator[Any]:
    """Suppress a duplicate terminal empty match emitted by google-re2.

    The binding can yield the same zero-width terminal span twice for patterns
    such as ``^|$``. RE2 alternatives at one position are one match, so
    retaining one is both correct and prevents accidental work inflation.
    """

    previous_empty_span: tuple[int, int] | None = None
    for match in matches:
        span = cast(tuple[int, int], match.span())
        if span[0] == span[1] and span == previous_empty_span:
            continue
        previous_empty_span = span if span[0] == span[1] else None
        yield match


def _capture_preview(value: str | None) -> CapturePreview:
    if value is None:
        return CapturePreview(value=None, original_length=None)
    return CapturePreview(
        value=value[:MAX_REGEX_CAPTURE_PREVIEW_LENGTH],
        original_length=len(value),
    )


def _literal_matches(
    text: str,
    query: str,
    *,
    case_sensitive: bool,
) -> tuple[RegexMatch, ...]:
    if case_sensitive:
        haystack = text
        needle = query
        offset_map = tuple(range(len(text)))
    else:
        folded_parts: list[str] = []
        mapped: list[int] = []
        for index, character in enumerate(text):
            folded = character.casefold()
            folded_parts.append(folded)
            mapped.extend(index for _part in folded)
        haystack = "".join(folded_parts)
        needle = query.casefold()
        offset_map = tuple(mapped)
    if needle == "":
        return ()

    matches: list[RegexMatch] = []
    position = 0
    while len(matches) < MAX_REGEX_MATCH_COUNT:
        found = haystack.find(needle, position)
        if found < 0:
            break
        folded_end = found + len(needle)
        if not offset_map:
            break
        original_start = offset_map[found]
        original_end = offset_map[folded_end - 1] + 1
        matches.append(
            RegexMatch(
                start=original_start,
                end=original_end,
                text=text[original_start:original_end],
            )
        )
        position = max(folded_end, found + 1)
    return tuple(matches)


def _fuzzy_matches(
    text: str,
    query: str,
    *,
    case_sensitive: bool,
) -> tuple[float, tuple[RegexMatch, ...]] | None:
    if case_sensitive:
        source = text
        target = query
        offset_map = tuple(range(len(text)))
    else:
        folded_parts: list[str] = []
        mapped: list[int] = []
        for index, character in enumerate(text):
            folded = character.casefold()
            folded_parts.append(folded)
            mapped.extend(index for _part in folded)
        source = "".join(folded_parts)
        target = query.casefold()
        offset_map = tuple(mapped)
    folded_positions: list[int] = []
    cursor = 0
    for character in target:
        found = source.find(character, cursor)
        if found < 0:
            return None
        folded_positions.append(found)
        cursor = found + 1
    if not folded_positions:
        return 1.0, ()
    span_width = folded_positions[-1] - folded_positions[0] + 1
    compactness = len(folded_positions) / max(1, span_width)
    prefix_bonus = 0.25 if folded_positions[0] == 0 else 0.0
    length_bonus = len(folded_positions) / max(1, len(source))
    original_positions = tuple(dict.fromkeys(offset_map[index] for index in folded_positions))
    spans = tuple(
        RegexMatch(start=index, end=index + 1, text=text[index : index + 1])
        for index in original_positions
    )
    return compactness + prefix_bonus + length_bonus, spans
