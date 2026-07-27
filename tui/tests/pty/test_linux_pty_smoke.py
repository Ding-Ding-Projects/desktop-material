"""Exercise the installed console surface through a real Linux pseudo-terminal."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest
from git_repository import DeterministicRepository

pytestmark = pytest.mark.skipif(
    sys.platform != "linux",
    reason="Linux PTY semantics are validated only on Linux.",
)

_MOUSE_ENABLE_SEQUENCES = (
    b"\x1b[?1000h",
    b"\x1b[?1003h",
    b"\x1b[?1006h",
)


def _read_available(child: object, pexpect: object) -> bytes:
    try:
        return child.read_nonblocking(size=8192, timeout=0.5)
    except pexpect.TIMEOUT:
        return b""


def test_startup_mouse_resize_and_clean_exit(
    deterministic_repository: DeterministicRepository,
    tmp_path: Path,
) -> None:
    pexpect = pytest.importorskip("pexpect")
    project_root = Path(__file__).parents[2]
    environment = os.environ.copy()
    environment.update(
        {
            "HOME": str(tmp_path / "home"),
            "XDG_CONFIG_HOME": str(tmp_path / "config"),
            "XDG_DATA_HOME": str(tmp_path / "data"),
            "XDG_STATE_HOME": str(tmp_path / "state"),
            "XDG_CACHE_HOME": str(tmp_path / "cache"),
            "XDG_RUNTIME_DIR": str(tmp_path / "runtime"),
            "PYTHONPATH": str(project_root / "src"),
            "TERM": "xterm-256color",
            "NO_COLOR": "1",
        }
    )

    child = pexpect.spawn(
        sys.executable,
        ["-m", "desktop_material_tui", str(deterministic_repository.path)],
        cwd=str(project_root),
        env=environment,
        encoding=None,
        dimensions=(24, 80),
        timeout=15,
    )
    output = bytearray()
    deadline = time.monotonic() + 15
    try:
        while time.monotonic() < deadline and not all(
            sequence in output for sequence in _MOUSE_ENABLE_SEQUENCES
        ):
            output.extend(_read_available(child, pexpect))

        assert b"\x1b[?1049h" in output
        assert all(sequence in output for sequence in _MOUSE_ENABLE_SEQUENCES)

        child.setwinsize(48, 160)
        child.sendcontrol("q")
        child.expect(pexpect.EOF, timeout=15)
        child.close()
        assert child.exitstatus == 0
    finally:
        if child.isalive():
            child.sendcontrol("q")
            child.close(force=True)
