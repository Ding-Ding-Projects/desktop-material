from __future__ import annotations

import subprocess
from collections.abc import Sequence
from datetime import timedelta
from pathlib import Path

import pytest

from desktop_material_tui.infrastructure.persistence import (
    GitProfileHistory,
    ProfileHistoryError,
    XDGPaths,
)

OID = "a" * 40


def _history_with_head_timestamp(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    timestamp: str,
) -> GitProfileHistory:
    history = GitProfileHistory(XDGPaths.discover(environment={}, home=tmp_path))

    def fake_run(
        arguments: Sequence[str],
        *,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        del arguments, check
        return subprocess.CompletedProcess(
            ("git",),
            0,
            stdout=f"{OID}\x1f{timestamp}\x1fSnapshot\n",
            stderr="",
        )

    monkeypatch.setattr(history, "_run_text", fake_run)
    return history


@pytest.mark.parametrize(
    ("timestamp", "expected_offset"),
    [
        ("2026-07-27T12:00:00Z", timedelta(0)),
        ("2026-07-27T12:00:00-04:00", -timedelta(hours=4)),
    ],
)
def test_profile_history_head_accepts_utc_z_and_preserves_numeric_offsets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    timestamp: str,
    expected_offset: timedelta,
) -> None:
    history = _history_with_head_timestamp(tmp_path, monkeypatch, timestamp)

    revision = history._head_unlocked()

    assert revision is not None
    assert revision.created_at.utcoffset() == expected_offset


def test_profile_history_head_rejects_malformed_timestamp(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    history = _history_with_head_timestamp(
        tmp_path,
        monkeypatch,
        "definitely-not-a-timestamp",
    )

    with pytest.raises(ProfileHistoryError, match="invalid profile history timestamp"):
        history._head_unlocked()
