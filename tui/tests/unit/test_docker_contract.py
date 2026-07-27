"""Static guardrails for the documented container installation contract."""

from __future__ import annotations

from pathlib import Path

TUI_ROOT = Path(__file__).resolve().parents[2]


def test_dockerfile_builds_and_installs_the_local_wheel_as_non_root() -> None:
    dockerfile = (TUI_ROOT / "Dockerfile").read_text(encoding="utf-8")
    pyproject = (TUI_ROOT / "pyproject.toml").read_text(encoding="utf-8")

    assert " AS builder" in dockerfile
    assert " AS runtime" in dockerfile
    assert "uv build --wheel --out-dir /dist" in dockerfile
    assert "--requirements /tmp/runtime-requirements.txt" in dockerfile
    assert "--no-deps \\\n      /dist/*.whl" in dockerfile
    assert "USER dmt" in dockerfile
    assert 'ENTRYPOINT ["desktop-material-tui"]' in dockerfile
    assert "GH_PROMPT_DISABLED" not in dockerfile
    assert '"Dockerfile"' in pyproject
    assert '".dockerignore"' in pyproject


def test_docker_quick_start_documents_interactive_xdg_persistence() -> None:
    readme = (TUI_ROOT / "README.md").read_text(encoding="utf-8")

    assert "docker build" in readme
    assert "docker run --rm -it --init" in readme
    assert "$PWD:/workspace" in readme
    for mount in (
        "/home/dmt/.config",
        "/home/dmt/.local/share",
        "/home/dmt/.local/state",
        "/home/dmt/.cache",
    ):
        assert mount in readme
