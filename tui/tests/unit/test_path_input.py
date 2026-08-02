"""Focused coverage for user-pasted repository paths."""

from __future__ import annotations

from pathlib import Path

import pytest

from desktop_material_tui.application.path_input import (
    clone_destination_for_url,
    clone_url_embeds_http_credentials,
    inspect_clone_destination,
    normalize_path_input,
    path_from_user_input,
    repository_name_from_clone_url,
)
from desktop_material_tui.application.repository_service import RepositoryService


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('  "/home/example/My repository"  ', "/home/example/My repository"),
        (" \t'C:\\Users\\Example\\My repository'\r\n", "C:\\Users\\Example\\My repository"),
        ('"/home/example/repo\'s files"', "/home/example/repo's files"),
        ("'/home/example/\"quoted\" folder'", '/home/example/"quoted" folder'),
        ("  /home/example/repository  ", "/home/example/repository"),
        ('  "/home/example/repository  ', '"/home/example/repository'),
        ("  '/home/example/repository\"  ", "'/home/example/repository\""),
        ('  /home/example/"quoted"/repository  ', '/home/example/"quoted"/repository'),
        ("''", ""),
        ('""', ""),
    ],
)
def test_normalize_path_input_only_unwraps_matching_surrounding_quotes(
    raw: str,
    expected: str,
) -> None:
    assert normalize_path_input(raw) == expected


def test_path_from_user_input_preserves_quotes_in_structured_path() -> None:
    structured = Path('"literal repository name"')

    assert path_from_user_input(structured) == structured


def test_path_from_user_input_expands_normalized_text() -> None:
    assert path_from_user_input("  '~/repository with spaces'  ") == (
        Path.home() / "repository with spaces"
    )


def test_repository_service_uses_canonical_path_input_parser(tmp_path: Path) -> None:
    repository = tmp_path / "repository with spaces"
    repository.mkdir()

    service = RepositoryService(f'  "{repository}"  ')

    assert service.path == repository


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("https://github.com/example/material.git", "material"),
        ("https://github.com/example/material.git?ref=main#readme", "material"),
        ("ssh://git@github.com/example/material.git", "material"),
        ("git@github.com:example/material.git", "material"),
        ("file:///srv/git/material.git", "material"),
        ("../local/material", "material"),
        ("", "repository"),
        ("https://github.com/example/..", "repository"),
        ("https://github.com/example/%2e%2e%2fescape.git", "repository"),
        ("https://github.com/example/name%00escape.git", "repository"),
        ("https://github.com/example/name with spaces.git", "repository"),
        ("https://github.com/example/.hidden.git", "repository"),
    ],
)
def test_repository_name_from_clone_url_is_safe(source: str, expected: str) -> None:
    assert repository_name_from_clone_url(source) == expected


def test_clone_destination_is_exactly_one_child_of_working_directory(
    tmp_path: Path,
) -> None:
    working_directory = tmp_path / "workspace"
    working_directory.mkdir()

    destination = clone_destination_for_url(
        "git@github.com:example/material.git",
        working_directory,
    )

    assert destination == working_directory.resolve() / "material"
    assert destination.parent == working_directory.resolve()


def test_hostile_clone_source_cannot_escape_working_directory(tmp_path: Path) -> None:
    destination = clone_destination_for_url(
        "https://github.com/example/%2e%2e%2foutside.git",
        tmp_path,
    )

    assert destination == tmp_path.resolve() / "repository"
    assert destination.parent == tmp_path.resolve()


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("https://token@example.com/owner/repository.git", True),
        ("http://user:password@example.com/owner/repository.git", True),
        ("https://example.com/owner/repository.git", False),
        ("ssh://git@example.com/owner/repository.git", False),
        ("git@example.com:owner/repository.git", False),
    ],
)
def test_http_clone_credentials_are_detected(source: str, expected: bool) -> None:
    assert clone_url_embeds_http_credentials(source) is expected


def test_clone_destination_accepts_missing_path_and_empty_directory(tmp_path: Path) -> None:
    missing = tmp_path / "missing"
    empty = tmp_path / "empty"
    empty.mkdir()

    assert inspect_clone_destination(missing) == (missing.resolve(), None)
    assert inspect_clone_destination(empty) == (empty.resolve(), None)


def test_clone_destination_reports_occupied_and_missing_parent(tmp_path: Path) -> None:
    occupied = tmp_path / "occupied"
    occupied.mkdir()
    (occupied / "keep.txt").write_text("keep", encoding="utf-8")

    assert inspect_clone_destination(occupied) == (None, "occupied")
    assert inspect_clone_destination(tmp_path / "missing" / "repository") == (
        None,
        "parent",
    )


def test_clone_destination_rejects_symbolic_link(tmp_path: Path) -> None:
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "linked-target"
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symbolic links are unavailable: {error}")

    assert inspect_clone_destination(link) == (None, "symlink")
