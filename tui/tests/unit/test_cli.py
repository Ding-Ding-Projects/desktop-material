"""Launcher grammar, literal ``github`` alias, and safety help tests."""

from __future__ import annotations

import importlib
from io import StringIO
from pathlib import Path
from typing import Any, ClassVar

import pytest

import desktop_material_tui.cli as cli_module
from desktop_material_tui.cli import (
    ConfirmationRequiredError,
    _dispatch,
    build_parser,
    normalize_argv,
)


class _FakeRepositoryService:
    calls: ClassVar[list[tuple[Any, ...]]] = []

    def __init__(self, path: str) -> None:
        self.path = path

    def validate(self) -> Path:
        return Path(self.path)

    def rename_branch(self, old_name: str, new_name: str) -> dict[str, str]:
        self.calls.append(("rename_branch", old_name, new_name))
        return {"name": new_name}

    def add_remote(self, name: str, url: str) -> dict[str, str]:
        self.calls.append(("add_remote", name, url))
        return {"name": name}

    def set_remote_url(
        self,
        name: str,
        url: str,
        *,
        push: bool = False,
    ) -> dict[str, str]:
        self.calls.append(("set_remote_url", name, url, push))
        return {"name": name}

    def remove_remote(self, name: str) -> dict[str, str]:
        self.calls.append(("remove_remote", name))
        return {"name": name}

    def create_tag(
        self,
        name: str,
        message: str | None = None,
        target: str | None = None,
        force: bool = False,
    ) -> dict[str, str]:
        self.calls.append(("create_tag", name, message, target, force))
        return {"name": name}

    def delete_tag(self, name: str) -> dict[str, str]:
        self.calls.append(("delete_tag", name))
        return {"name": name}


@pytest.mark.parametrize(
    ("raw", "expected_command", "expected_repository"),
    [
        ([], "tui", None),
        (["/work/repo"], "tui", "/work/repo"),
        (
            ["/work/repo", "--language", "en", "--theme", "dark"],
            "tui",
            "/work/repo",
        ),
        (["--language", "en"], "tui", None),
    ],
)
def test_legacy_launcher_forms_keep_natural_flag_placement(
    raw: list[str],
    expected_command: str,
    expected_repository: str | None,
) -> None:
    args = build_parser("github").parse_args(normalize_argv(raw))

    assert args.command == expected_command
    assert args.repository == expected_repository


def test_root_global_before_noninteractive_subcommand() -> None:
    args = build_parser("github").parse_args(
        normalize_argv(["--language", "bilingual", "-C", "/repo", "status"])
    )

    assert args.command == "status"
    assert args.language == "bilingual"
    assert args.repository_path == "/repo"


def test_literal_github_prog_does_not_claim_to_replace_gh() -> None:
    help_text = build_parser("github").format_help()
    normalized_help = " ".join(help_text.split())

    assert help_text.startswith("usage: github")
    assert "does not replace GitHub CLI's `gh`" in normalized_help


def test_cheap_lfs_help_states_format_provider_and_confirmation(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit, match="0"):
        build_parser("github").parse_args(["cheap-lfs", "--help"])

    help_text = capsys.readouterr().out
    assert "desktop-material/cheap-lfs/v1" in help_text
    assert "OCI/GHCR/Docker writes" in help_text
    assert "--yes" in help_text
    assert "no asset clobbering" in help_text


def test_pyproject_installs_literal_github_console_script() -> None:
    try:
        tomllib = importlib.import_module("tomllib")
    except ModuleNotFoundError:  # pragma: no cover - Python 3.10 matrix
        tomllib = importlib.import_module("tomli")
    pyproject = Path(__file__).parents[2] / "pyproject.toml"
    with pyproject.open("rb") as handle:
        document = tomllib.load(handle)

    assert document["project"]["scripts"]["github"] == "desktop_material_tui.__main__:main"
    assert document["project"]["scripts"]["dmt"] == "desktop_material_tui.__main__:main"


@pytest.mark.parametrize(
    ("raw", "expected_call"),
    [
        (
            ["branch", "rename", "old-name", "new-name", "--yes"],
            ("rename_branch", "old-name", "new-name"),
        ),
        (
            ["remote", "add", "upstream", "https://example.com/acme/repo.git", "--yes"],
            ("add_remote", "upstream", "https://example.com/acme/repo.git"),
        ),
        (
            [
                "remote",
                "set-url",
                "origin",
                "https://example.com/acme/new.git",
                "--push",
                "--yes",
            ],
            ("set_remote_url", "origin", "https://example.com/acme/new.git", True),
        ),
        (
            ["remote", "remove", "upstream", "--yes"],
            ("remove_remote", "upstream"),
        ),
        (
            [
                "tag",
                "create",
                "v1.0.0",
                "--target",
                "HEAD",
                "--message",
                "Release 1.0.0",
                "--force",
                "--yes",
            ],
            ("create_tag", "v1.0.0", "Release 1.0.0", "HEAD", True),
        ),
        (
            ["tag", "delete", "v0.9.0", "--yes"],
            ("delete_tag", "v0.9.0"),
        ),
    ],
)
def test_existing_repository_mutations_are_reachable_from_cli(
    raw: list[str],
    expected_call: tuple[Any, ...],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _FakeRepositoryService.calls = []
    monkeypatch.setattr(cli_module, "RepositoryService", _FakeRepositoryService)
    args = build_parser("github").parse_args(raw)

    assert _dispatch(args, {}, StringIO()) == 0
    assert _FakeRepositoryService.calls == [expected_call]


def test_remote_mutation_preview_requires_confirmation_and_redacts_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _FakeRepositoryService.calls = []
    monkeypatch.setattr(cli_module, "RepositoryService", _FakeRepositoryService)
    output = StringIO()
    args = build_parser("github").parse_args(
        ["remote", "add", "origin", "https://secret@example.com/acme/repo.git"]
    )

    with pytest.raises(ConfirmationRequiredError):
        _dispatch(args, {}, output)

    assert _FakeRepositoryService.calls == []
    assert "secret" not in output.getvalue()
    assert "https://***@example.com/acme/repo.git" in output.getvalue()
