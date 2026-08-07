"""Contract tests for the Python 3.13 test-process isolation runner."""

from __future__ import annotations

import importlib.util
from pathlib import Path

TUI_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = TUI_ROOT / "tools" / "run-tests-isolated.py"


def _runner_module():
    spec = importlib.util.spec_from_file_location("run_tests_isolated", RUNNER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_runner_discovers_all_tests_and_separates_ui_files() -> None:
    runner = _runner_module()
    non_ui_files, ui_files = runner.discover_test_files()
    all_files = (*non_ui_files, *ui_files)

    assert all_files
    assert len(all_files) == len(set(all_files))
    assert all(path.is_file() for path in all_files)
    assert all(runner.UI_ROOT in path.parents for path in ui_files)
    assert all(runner.UI_ROOT not in path.parents for path in non_ui_files)
    assert runner.TEST_ROOT / "test_agent_cli.py" in non_ui_files
    assert runner.UI_ROOT / "test_layout_matrix.py" in ui_files
