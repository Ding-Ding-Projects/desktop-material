from __future__ import annotations

from pathlib import Path

import pytest

import desktop_material_tui
from desktop_material_tui.cli import main

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python 3.10 compatibility
    import tomli as tomllib


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TUI_ROOT = REPOSITORY_ROOT / "tui"
INSTALLER = REPOSITORY_ROOT / "script" / "install-linux-tui.sh"
BOOTSTRAP = REPOSITORY_ROOT / "script" / "bootstrap-linux-tui.sh"
INSTALLER_TEST = REPOSITORY_ROOT / "script" / "install-linux-tui-test.sh"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_package_version_and_lock_stay_in_step() -> None:
    project = tomllib.loads(_read(TUI_ROOT / "pyproject.toml"))["project"]
    lock = tomllib.loads(_read(TUI_ROOT / "uv.lock"))
    locked_project = next(
        package for package in lock["package"] if package["name"] == project["name"]
    )

    assert project["version"] == "0.2.0"
    assert locked_project["version"] == project["version"]
    assert desktop_material_tui.__version__ == project["version"]
    assert project["scripts"] == {
        "desktop-material-tui": "desktop_material_tui.__main__:main",
        "dmt": "desktop_material_tui.__main__:main",
        "github": "desktop_material_tui.__main__:main",
    }


@pytest.mark.parametrize("launcher", ["github", "dmt", "desktop-material-tui"])
def test_every_launcher_reports_the_package_version(
    launcher: str, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as exit_info:
        main(["--version"], prog=launcher)

    assert exit_info.value.code == 0
    assert capsys.readouterr().out == f"{launcher} {desktop_material_tui.__version__}\n"


def test_installer_is_pinned_and_user_scoped() -> None:
    source = _read(INSTALLER)

    assert source.startswith("#!/bin/sh\n")
    assert "UV_VERSION='0.11.26'" in source
    assert 'https://astral.sh/uv/$UV_VERSION/install.sh' in source
    assert "PYTHON_VERSION='3.12'" in source
    assert "GH_VERSION='2.97.0'" in source
    assert "BIN_DIRECTORY=$HOME/.local/bin" in source
    assert "UV_TOOL_BIN_DIR=$BIN_DIRECTORY" in source
    assert "https://api.github.com/repos/$REPOSITORY/releases?per_page=100" in source
    assert "DMT_INSTALL_TEST_MODE=1" in source


def test_installer_never_authenticates_or_changes_git_identity() -> None:
    source_lines = _read(INSTALLER).splitlines()

    assert not any("git config" in line for line in source_lines)
    auth_lines = [line.strip() for line in source_lines if "gh auth login" in line]
    expected_auth_line = (
        "log 'open a new shell (or source ~/.profile), then authenticate only when "
        "wanted with: gh auth login'"
    )
    assert auth_lines == [expected_auth_line]


def test_bootstrap_installs_curl_then_fetches_the_release_installer() -> None:
    source = _read(BOOTSTRAP)

    assert source.startswith("#!/bin/sh\n")
    for manager in ("apt-get", "dnf5", "dnf", "yum", "zypper", "pacman"):
        assert manager in source
    assert "ca-certificates curl" in source
    assert "--proto '=https' --proto-redir '=https' --tlsv1.2" in source
    assert "BOOTSTRAP_MAX_INSTALLER_BYTES=1048576" in source
    assert "bootstrap_validate_installer" in source
    assert "downloaded installer does not have the expected shell header" in source
    assert (
        "https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/"
        "download/install-linux-tui.sh"
    ) in source


def test_every_supported_native_package_manager_has_a_contract() -> None:
    source = _read(INSTALLER)
    tests = _read(INSTALLER_TEST)

    for manager in ("apt-get", "dnf5", "dnf", "yum", "zypper", "pacman"):
        assert manager in source
        assert manager in tests
    for dependency in (
        "ca-certificates",
        "curl",
        "git",
        "openssh",
        "libstdc++",
        "tar",
        "gzip",
        "vim",
        "xterm",
        "xdg-utils",
    ):
        assert dependency in source


def test_ci_publishes_and_exercises_the_complete_payload() -> None:
    # CI is split per operating system so neither lane can withhold the
    # other's release assets. The terminal edition's packaging lives in the
    # Linux lane.
    ci = _read(REPOSITORY_ROOT / ".github" / "workflows" / "ci-linux.yml")
    release = _read(
        REPOSITORY_ROOT / ".github" / "workflows" / "build-installers.yml"
    )

    for workflow in (ci, release):
        assert "install-linux-tui-test.sh --unit" in workflow
        assert "install-linux-tui-test.sh --debian-container" in workflow
        assert "uv export --locked --no-dev --no-emit-project --no-hashes" in workflow
        assert "runtime-requirements.txt" in workflow
    assert "install-linux-tui.sh" in release
    assert "bootstrap-linux-tui.sh" in release
    assert "TUI_CONSTRAINTS_NAME" in release
    assert "TUI_INSTALLER_NAME" in release
    assert "TUI_BOOTSTRAP_NAME" in release
