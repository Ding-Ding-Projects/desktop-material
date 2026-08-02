"""Canonical parsing for paths entered or pasted by a user."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Literal
from urllib.parse import unquote, urlsplit

_SCP_CLONE_URL = re.compile(r"^[^/@\\]+@[^/:\\]+:(?P<path>.+)$")
_SAFE_REPOSITORY_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")

CloneDestinationProblem = Literal["invalid", "occupied", "parent", "symlink"]


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


def repository_name_from_clone_url(value: str) -> str:
    """Return one traversal-safe repository directory name for a clone URL.

    Git accepts HTTPS, SSH, ``file://`` and SCP-style sources. Only the final
    source path component is considered; credentials, hosts, query strings and
    fragments never become part of the local path. Malformed or unsafe names
    deliberately fall back to ``repository`` rather than being partially
    decoded into a surprising destination.
    """

    raw = value.strip()
    if not raw:
        return "repository"

    scp_match = _SCP_CLONE_URL.fullmatch(raw)
    if scp_match is not None:
        source_path = scp_match.group("path")
    else:
        parsed = urlsplit(raw)
        source_path = parsed.path if parsed.scheme else raw.split("#", 1)[0].split("?", 1)[0]

    source_path = source_path.rstrip("/\\")
    encoded_name = re.split(r"[/\\]", source_path)[-1] if source_path else ""
    name = unquote(encoded_name)
    if name.casefold().endswith(".git"):
        name = name[:-4]

    if (
        not name
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or any(ord(character) < 32 or ord(character) == 127 for character in name)
        or _SAFE_REPOSITORY_NAME.fullmatch(name) is None
    ):
        return "repository"
    return name


def clone_destination_for_url(value: str, working_directory: str | Path) -> Path:
    """Derive a clone destination that is exactly one child of ``working_directory``."""

    parent = path_from_user_input(working_directory).resolve()
    return parent / repository_name_from_clone_url(value)


def clone_url_embeds_http_credentials(value: str) -> bool:
    """Return whether an HTTP clone URL would expose userinfo in process arguments."""

    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return False
    return parsed.scheme.casefold() in {"http", "https"} and parsed.username is not None


def inspect_clone_destination(
    value: str | Path,
) -> tuple[Path | None, CloneDestinationProblem | None]:
    """Resolve a clone target and explain why Git must not write there.

    The destination may be absent or an existing empty directory. A symlink is
    rejected explicitly so a path cannot be swapped into an unrelated location
    between the dialog preflight and the background worker's matching recheck.
    """

    try:
        candidate = path_from_user_input(value)
        if candidate.is_symlink():
            return None, "symlink"
        if candidate.exists():
            if not candidate.is_dir() or any(candidate.iterdir()):
                return None, "occupied"
        elif not candidate.parent.is_dir():
            return None, "parent"
        return candidate.resolve(), None
    except (OSError, RuntimeError, ValueError):
        return None, "invalid"
