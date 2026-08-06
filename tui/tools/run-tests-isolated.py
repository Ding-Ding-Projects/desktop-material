"""Run the TUI suite with a fresh interpreter for each app-heavy UI file.

Python 3.13 can segfault inside Textual's native syntax stack after several
independent app-heavy test files share one interpreter. Keeping the UI files
isolated preserves every test while preventing native state from crossing
pytest process boundaries. Non-UI tests stay in one fast process.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TUI_ROOT = Path(__file__).resolve().parents[1]
TEST_ROOT = TUI_ROOT / "tests"
UI_ROOT = TEST_ROOT / "ui"


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


def _run(label: str, files: tuple[Path, ...]) -> None:
    relative_files = tuple(path.relative_to(TUI_ROOT).as_posix() for path in files)
    sys.stdout.write(f"=== {label}: {len(relative_files)} test file(s) ===\n")
    sys.stdout.flush()
    subprocess.run(  # noqa: S603 - fixed interpreter and repository-owned test paths
        (sys.executable, "-m", "pytest", *relative_files),
        check=True,
        cwd=TUI_ROOT,
    )


def main() -> None:
    non_ui_files, ui_files = discover_test_files()
    _run("non-UI tests", non_ui_files)
    for ui_file in ui_files:
        _run(ui_file.relative_to(TUI_ROOT).as_posix(), (ui_file,))


if __name__ == "__main__":
    main()
