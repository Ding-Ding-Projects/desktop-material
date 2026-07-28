"""Shared real-repository fixture for PTY tests."""

import sys
from pathlib import Path

_FIXTURE_DIRECTORY = Path(__file__).parents[1] / "fixtures"
sys.path.insert(0, str(_FIXTURE_DIRECTORY))

from git_repository import deterministic_repository  # noqa: E402

__all__ = ["deterministic_repository"]
