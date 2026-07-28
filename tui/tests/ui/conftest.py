"""Isolation and shared fixtures for Textual Pilot tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_FIXTURE_DIRECTORY = Path(__file__).parents[1] / "fixtures"
sys.path.insert(0, str(_FIXTURE_DIRECTORY))

from git_repository import (  # noqa: E402 - scoped fixture path is established above
    DeterministicRepository,
    deterministic_repository,
)


@pytest.fixture(autouse=True)
def isolated_xdg_environment(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> Path:
    """Keep every app-owned file inside the per-test temporary directory."""

    home = tmp_path / "home"
    home.mkdir(parents=True)
    roots = {
        "HOME": home,
        "XDG_CONFIG_HOME": tmp_path / "xdg-config",
        "XDG_DATA_HOME": tmp_path / "xdg-data",
        "XDG_STATE_HOME": tmp_path / "xdg-state",
        "XDG_CACHE_HOME": tmp_path / "xdg-cache",
        "XDG_RUNTIME_DIR": tmp_path / "xdg-runtime",
    }
    for variable, path in roots.items():
        monkeypatch.setenv(variable, str(path))
    monkeypatch.setenv("NO_COLOR", "1")

    # A real home directory exists. Pointing HOME at a path that does not is
    # not isolation, it is a machine no user has ever had, and surfaces that
    # sensibly refuse to navigate somewhere absent then look broken: the folder
    # browser's Home button stayed put and the test blamed the button.
    home.mkdir(parents=True, exist_ok=True)
    return home


__all__ = [
    "DeterministicRepository",
    "deterministic_repository",
    "isolated_xdg_environment",
]
