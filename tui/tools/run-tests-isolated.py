"""Run the TUI suite with a fresh interpreter for each app-heavy UI test.

Python 3.13 can segfault inside Textual's native syntax stack after several
independent app-heavy test cases share one interpreter. Keeping each UI test
node isolated preserves every test while preventing native state from crossing
pytest process boundaries. Non-UI tests stay in one fast process.
"""

from __future__ import annotations

import signal
import subprocess
import sys
from pathlib import Path

TUI_ROOT = Path(__file__).resolve().parents[1]
TEST_ROOT = TUI_ROOT / "tests"
UI_ROOT = TEST_ROOT / "ui"
_MAX_NATIVE_CRASH_ATTEMPTS = 3


def discover_test_files() -> tuple[tuple[Path, ...], tuple[Path, ...]]:
    """Return non-UI files and UI files in deterministic order."""

    all_files = tuple(sorted(TEST_ROOT.rglob("test_*.py")))
    if not all_files:
        raise RuntimeError(f"No test files found below {TEST_ROOT}")

    ui_files = tuple(path for path in all_files if UI_ROOT in path.parents)
    non_ui_files = tuple(path for path in all_files if path not in ui_files)
    if not ui_files:
        raise RuntimeError(f"No UI test files found below {UI_ROOT}")
    if not non_ui_files:
        raise RuntimeError(f"No non-UI test files found below {TEST_ROOT}")
    return non_ui_files, ui_files


def _parse_collected_nodes(
    output: str,
    ui_files: tuple[Path, ...],
) -> tuple[str, ...]:
    """Extract pytest node IDs belonging to the discovered UI files."""

    prefixes = tuple(
        f"{path.relative_to(TUI_ROOT).as_posix()}::" for path in ui_files
    )
    nodes = tuple(
        line.strip()
        for line in output.splitlines()
        if any(line.strip().startswith(prefix) for prefix in prefixes)
    )
    if not nodes:
        raise RuntimeError(f"No UI test nodes collected below {UI_ROOT}")
    return nodes


def discover_ui_test_nodes(ui_files: tuple[Path, ...]) -> tuple[str, ...]:
    """Collect UI node IDs before launching one fresh process per node."""

    relative_files = tuple(path.relative_to(TUI_ROOT).as_posix() for path in ui_files)
    collected = subprocess.run(  # noqa: S603 - fixed interpreter and repository-owned paths
        (sys.executable, "-m", "pytest", "--collect-only", "-q", *relative_files),
        check=True,
        capture_output=True,
        text=True,
        cwd=TUI_ROOT,
    )
    return _parse_collected_nodes(collected.stdout, ui_files)


def _run(label: str, items: tuple[str, ...]) -> None:
    sys.stdout.write(f"=== {label}: {len(items)} pytest item(s) ===\n")
    sys.stdout.flush()
    command = (sys.executable, "-m", "pytest", *items)
    retry_native_crash = (
        sys.platform.startswith("linux")
        and sys.version_info >= (3, 13)
        and label.startswith("tests/ui/")
    )
    for attempt in range(1, _MAX_NATIVE_CRASH_ATTEMPTS + 1):
        result = subprocess.run(  # noqa: S603 - fixed interpreter and repository-owned test paths
            command,
            check=False,
            cwd=TUI_ROOT,
        )
        if result.returncode == 0:
            return
        if (
            not retry_native_crash
            or result.returncode not in (-signal.SIGABRT, -signal.SIGSEGV)
            or attempt == _MAX_NATIVE_CRASH_ATTEMPTS
        ):
            raise subprocess.CalledProcessError(result.returncode, command)
        sys.stderr.write(
            f"Retrying {label} after native crash "
            f"(attempt {attempt + 1}/{_MAX_NATIVE_CRASH_ATTEMPTS}).\n"
        )
        sys.stderr.flush()


def main() -> None:
    non_ui_files, ui_files = discover_test_files()
    _run(
        "non-UI tests",
        tuple(path.relative_to(TUI_ROOT).as_posix() for path in non_ui_files),
    )
    for node in discover_ui_test_nodes(ui_files):
        _run(node, (node,))


if __name__ == "__main__":
    main()
