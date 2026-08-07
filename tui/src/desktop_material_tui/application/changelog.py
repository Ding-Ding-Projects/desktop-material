"""Offline, factual release history with bounded search, dates, copy, and export."""

from __future__ import annotations

import json
import os
from collections.abc import Iterable, Mapping, Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from .search import RegexFlags, SearchMode, SearchResult, SearchService

MAX_CATALOG_BYTES = 2_000_000
MAX_RELEASES = 1_000
MAX_ENTRIES = 10_000
MAX_ENTRY_LENGTH = 10_000
MAX_EXPORT_BYTES = 2_000_000
COMMIT_URL_ROOT = "https://github.com/Ding-Ding-Projects/desktop-material/commit"


class ChangelogError(ValueError):
    """The bundled catalog or a requested export is invalid."""


@dataclass(frozen=True)
class ChangelogEntry:
    category: str | None
    text: str
    commit: str | None

    @property
    def commit_url(self) -> str | None:
        return None if self.commit is None else f"{COMMIT_URL_ROOT}/{self.commit}"


@dataclass(frozen=True)
class ChangelogRelease:
    version: str
    released_on: date | None
    released_at: str | None
    entries: tuple[ChangelogEntry, ...]

    @property
    def date_label(self) -> str:
        if self.released_on is None:
            return "date unrecorded"
        suffix = f" {self.released_at}" if self.released_at is not None else ""
        return f"{self.released_on.isoformat()}{suffix}"


@dataclass(frozen=True)
class ChangelogCatalog:
    releases: tuple[ChangelogRelease, ...]
    dated_count: int
    unrecorded_count: int
    entry_count: int
    changelog_sha256: str
    release_dates_sha256: str

    @classmethod
    def load_default(cls) -> ChangelogCatalog:
        path = Path(__file__).resolve().parent.parent / "assets" / "changelog-catalog.json"
        return cls.load(path)

    @classmethod
    def load(cls, path: Path) -> ChangelogCatalog:
        try:
            size = path.stat().st_size
        except OSError as error:
            raise ChangelogError(
                f"The bundled changelog catalog is unavailable: {error}"
            ) from error
        if size > MAX_CATALOG_BYTES:
            raise ChangelogError(
                f"The bundled changelog catalog exceeds {MAX_CATALOG_BYTES} bytes."
            )
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise ChangelogError(f"The bundled changelog catalog is invalid: {error}") from error
        return cls._from_mapping(_mapping(raw, "catalog"))

    @classmethod
    def _from_mapping(cls, raw: Mapping[str, Any]) -> ChangelogCatalog:
        if raw.get("schema_version") != 1:
            raise ChangelogError("The bundled changelog schema is unsupported.")
        raw_releases = _sequence(raw.get("releases"), "releases")
        if len(raw_releases) > MAX_RELEASES:
            raise ChangelogError(f"The catalog exceeds the {MAX_RELEASES}-release limit.")
        releases: list[ChangelogRelease] = []
        total_entries = 0
        for index, value in enumerate(raw_releases):
            release = _release(_mapping(value, f"releases[{index}]"))
            total_entries += len(release.entries)
            if total_entries > MAX_ENTRIES:
                raise ChangelogError(f"The catalog exceeds the {MAX_ENTRIES}-entry limit.")
            releases.append(release)
        dated_count = sum(release.released_on is not None for release in releases)
        source = _mapping(raw.get("source"), "source")
        if raw.get("version_count") != len(releases):
            raise ChangelogError("The catalog release count does not match its records.")
        if raw.get("dated_count") != dated_count:
            raise ChangelogError("The catalog dated-release count does not match its records.")
        if raw.get("unrecorded_count") != len(releases) - dated_count:
            raise ChangelogError("The catalog undated-release count does not match its records.")
        if raw.get("entry_count") != total_entries:
            raise ChangelogError("The catalog entry count does not match its records.")
        return cls(
            releases=tuple(releases),
            dated_count=dated_count,
            unrecorded_count=len(releases) - dated_count,
            entry_count=total_entries,
            changelog_sha256=_digest(source.get("changelog_sha256"), "changelog_sha256"),
            release_dates_sha256=_digest(
                source.get("release_dates_sha256"), "release_dates_sha256"
            ),
        )

    def filter(
        self,
        query: str = "",
        *,
        mode: SearchMode = SearchMode.LITERAL,
        flags: RegexFlags | None = None,
        start: date | None = None,
        end: date | None = None,
        include_unrecorded: bool = False,
    ) -> SearchResult[ChangelogRelease]:
        if start is not None and end is not None and start > end:
            raise ChangelogError("The start date must not be after the end date.")
        date_filter_active = start is not None or end is not None
        candidates = tuple(
            release
            for release in self.releases
            if _date_in_range(
                release,
                start=start,
                end=end,
                include_unrecorded=include_unrecorded or not date_filter_active,
            )
        )
        return SearchService().search(
            candidates,
            query,
            mode=mode,
            flags=flags,
            get_text=_release_search_text,
        )

    def markdown(
        self,
        releases: Iterable[ChangelogRelease],
        *,
        scope: str = "current filtered view",
    ) -> str:
        materialized = tuple(releases)
        lines = [
            "# Desktop Material release history",
            "",
            f"Exported scope: {scope}.",
            "Source: bundled changelog.json entries, release-* Git tag dates, "
            "and referenced entry-commit dates.",
            "A release without either recorded timestamp is written as date "
            "unrecorded; no date is guessed.",
            "",
        ]
        if not materialized:
            lines.extend(("_No releases match the current filters._", ""))
        for release in materialized:
            lines.extend((f"## {release.version} — {release.date_label}", ""))
            if not release.entries:
                lines.extend(("_No recorded changes._", ""))
                continue
            for entry in release.entries:
                category = f"**{entry.category}:** " if entry.category is not None else ""
                commit = (
                    f" ([`{entry.commit[:10]}`]({entry.commit_url}))"
                    if entry.commit is not None and entry.commit_url is not None
                    else ""
                )
                lines.append(f"- {category}{entry.text}{commit}")
            lines.append("")
        rendered = "\n".join(lines)
        if len(rendered.encode("utf-8")) > MAX_EXPORT_BYTES:
            raise ChangelogError(f"The export exceeds the {MAX_EXPORT_BYTES}-byte limit.")
        return rendered

    def export_markdown(
        self,
        releases: Iterable[ChangelogRelease],
        destination: Path,
        *,
        scope: str = "current filtered view",
    ) -> Path:
        target = destination.expanduser().resolve()
        if target.exists():
            raise ChangelogError("The export destination already exists; choose a new file.")
        if not target.parent.is_dir():
            raise ChangelogError("The export destination directory does not exist.")
        rendered = self.markdown(releases, scope=scope)
        temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        if temporary.exists():
            raise ChangelogError("A temporary export already exists; choose another destination.")
        try:
            temporary.write_text(rendered, encoding="utf-8", newline="\n")
            temporary.replace(target)
        except OSError as error:
            with suppress(OSError):
                temporary.unlink(missing_ok=True)
            raise ChangelogError(f"The changelog could not be exported: {error}") from error
        return target


def parse_filter_date(value: str) -> date | None:
    """Parse a typed ISO date without erasing an incomplete value."""

    normalized = value.strip()
    if normalized == "":
        return None
    try:
        return date.fromisoformat(normalized)
    except ValueError as error:
        raise ChangelogError("Use a complete ISO date in YYYY-MM-DD form.") from error


def _release(raw: Mapping[str, Any]) -> ChangelogRelease:
    version = _bounded_text(raw.get("v"), "release version", 128)
    raw_date = raw.get("d")
    if raw_date is None:
        released_on = None
    elif isinstance(raw_date, str):
        try:
            released_on = date.fromisoformat(raw_date)
        except ValueError as error:
            raise ChangelogError(f"Release {version} has an invalid date.") from error
    else:
        raise ChangelogError(f"Release {version} has a non-text date.")
    raw_time = raw.get("t")
    released_at = None if raw_time is None else _bounded_text(raw_time, "release time", 5)
    if (released_on is None) != (released_at is None):
        raise ChangelogError(f"Release {version} has an incomplete timestamp.")
    entries = tuple(
        _entry(value, version, index)
        for index, value in enumerate(_sequence(raw.get("e"), f"entries for {version}"))
    )
    return ChangelogRelease(version, released_on, released_at, entries)


def _entry(value: Any, version: str, index: int) -> ChangelogEntry:
    raw = _sequence(value, f"entry {index} for {version}")
    if len(raw) != 3:
        raise ChangelogError(f"Entry {index} for {version} must contain three values.")
    category = None if raw[0] is None else _bounded_text(raw[0], "entry category", 64)
    text = _bounded_text(raw[1], "entry text", MAX_ENTRY_LENGTH)
    commit = None if raw[2] is None else _commit_digest(raw[2])
    return ChangelogEntry(category, text, commit)


def _release_search_text(release: ChangelogRelease) -> Sequence[str]:
    keys = [release.version, release.date_label]
    for entry in release.entries:
        keys.extend((entry.category or "uncategorized", entry.text, entry.commit or ""))
    return keys


def _date_in_range(
    release: ChangelogRelease,
    *,
    start: date | None,
    end: date | None,
    include_unrecorded: bool,
) -> bool:
    released_on = release.released_on
    if released_on is None:
        return include_unrecorded
    before_start = start is not None and released_on < start
    after_end = end is not None and released_on > end
    return not (before_start or after_end)


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ChangelogError(f"{label} must be an object.")
    return value


def _sequence(value: Any, label: str) -> Sequence[Any]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise ChangelogError(f"{label} must be an array.")
    return value


def _bounded_text(value: Any, label: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ChangelogError(f"{label} must be text.")
    normalized = value.strip()
    if not normalized:
        raise ChangelogError(f"{label} cannot be empty.")
    if len(normalized) > maximum:
        raise ChangelogError(f"{label} exceeds {maximum} characters.")
    return normalized


def _digest(value: Any, label: str) -> str:
    digest = _bounded_text(value, label, 64)
    if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise ChangelogError(f"{label} must be a full lowercase SHA-256 value.")
    return digest


def _commit_digest(value: Any) -> str:
    digest = _bounded_text(value, "entry commit", 40)
    if len(digest) != 40 or any(character not in "0123456789abcdef" for character in digest):
        raise ChangelogError("entry commit must be a full lowercase 40-hex Git commit SHA.")
    return digest
