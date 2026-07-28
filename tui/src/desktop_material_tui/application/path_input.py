"""Canonical parsing for paths entered or pasted by a user."""

from __future__ import annotations

from pathlib import Path


def normalize_path_input(value: str) -> str:
    """Trim surrounding whitespace and one matching pair of shell-style quotes.

    File managers and shells commonly copy paths as ``"/path/with spaces"`` or
    ``'C:\\path with spaces'``. Quotes are only treated as wrappers when the
    first and last non-whitespace characters are the same supported quote.
    Internal quotes and unmatched quote characters remain part of the path.
    """

    normalized = value.strip()
    if len(normalized) >= 2 and normalized[0] in {'"', "'"} and normalized[-1] == normalized[0]:
        return normalized[1:-1]
    return normalized


def path_from_user_input(value: str | Path) -> Path:
    """Return an expanded ``Path`` while normalizing only raw string input."""

    normalized: str | Path = normalize_path_input(value) if isinstance(value, str) else value
    return Path(normalized).expanduser()
