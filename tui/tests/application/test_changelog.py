"""Factual, bounded release-history catalog and export contracts."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from desktop_material_tui.application.changelog import (
    ChangelogCatalog,
    ChangelogError,
    parse_filter_date,
)
from desktop_material_tui.application.search import RegexFlags, SearchMode


def test_real_packaged_catalog_loads_with_its_recorded_counts_and_digests() -> None:
    catalog = ChangelogCatalog.load_default()

    assert len(catalog.releases) == 707
    assert catalog.entry_count == 4_151
    assert catalog.dated_count == 668
    assert catalog.unrecorded_count == 39
    assert catalog.releases[0].version == "3.6.3-material22"
    assert catalog.releases[0].date_label == "2026-08-01 23:53"
    assert catalog.releases[0].entries[0].commit == ("ab8c26d7535c9861f81b761e73798d1363bd78e1")
    # Digest verification is switched off by request. The catalog still
    # carries both digests, and they are still checked for shape when it
    # loads, so the provenance they record is intact — this no longer re-reads
    # the two source files and compares. What that removes is the check that
    # the packaged catalog was generated from the tree it ships with, so a
    # stale catalog now passes here and has to be caught by regenerating it.
    assert len(catalog.changelog_sha256) == 64
    assert len(catalog.release_dates_sha256) == 64


def test_text_regex_and_date_filters_are_bounded_and_keep_undated_records_truthful() -> None:
    catalog = ChangelogCatalog.load_default()

    text = catalog.filter("dim sum")
    assert text.error is None
    assert text.items
    assert text.items[0].version == "3.6.3-material22"

    regex = catalog.filter(
        r"^3\.6\.3-material2[12]$",
        mode=SearchMode.REGEX,
        flags=RegexFlags(ignore_case=False),
    )
    assert regex.error is None
    assert {release.version for release in regex.items} == {
        "3.6.3-material21",
        "3.6.3-material22",
    }

    invalid = catalog.filter("(", mode=SearchMode.REGEX)
    assert invalid.error is not None
    assert len(invalid.items) == len(catalog.releases)

    dated_only = catalog.filter(start=date(1900, 1, 1))
    assert len(dated_only.items) == catalog.dated_count
    with_unrecorded = catalog.filter(
        start=date(1900, 1, 1),
        include_unrecorded=True,
    )
    assert len(with_unrecorded.items) == len(catalog.releases)


def test_typed_dates_report_partial_or_inverted_ranges_without_guessing() -> None:
    catalog = ChangelogCatalog.load_default()

    assert parse_filter_date("") is None
    assert parse_filter_date("2026-08-01") == date(2026, 8, 1)
    with pytest.raises(ChangelogError, match="complete ISO date"):
        parse_filter_date("2026-08")
    with pytest.raises(ChangelogError, match="start date"):
        catalog.filter(start=date(2026, 8, 2), end=date(2026, 8, 1))


def test_markdown_export_carries_commit_links_and_refuses_overwrite(tmp_path: Path) -> None:
    catalog = ChangelogCatalog.load_default()
    releases = catalog.releases[:2]
    destination = tmp_path / "release-history.md"

    exported = catalog.export_markdown(releases, destination, scope="two newest releases")

    rendered = exported.read_text(encoding="utf-8")
    assert "Exported scope: two newest releases." in rendered
    assert "3.6.3-material22 — 2026-08-01 23:53" in rendered
    assert "[`cce086ec70`]" in rendered
    assert (
        "https://github.com/Ding-Ding-Projects/desktop-material/commit/"
        "cce086ec7061672c7ba16124929d8fb516fddda6"
    ) in rendered
    with pytest.raises(ChangelogError, match="already exists"):
        catalog.export_markdown(releases, destination)
