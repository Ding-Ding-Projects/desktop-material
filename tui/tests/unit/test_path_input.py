"""Focused coverage for user-pasted repository paths."""

from __future__ import annotations

from pathlib import Path

import pytest

from desktop_material_tui.application.path_input import (
    normalize_path_input,
    path_from_user_input,
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
