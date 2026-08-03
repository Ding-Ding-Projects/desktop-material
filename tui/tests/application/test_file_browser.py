from __future__ import annotations

from pathlib import Path

import pytest

from desktop_material_tui.application.file_browser import (
    FileBrowserLimitError,
    FileBrowserPathError,
    RepositoryFileBrowser,
)


def _repository(tmp_path: Path) -> Path:
    root = tmp_path / "repository"
    (root / ".git").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / "docs" / "guide.md").write_text("# Guide\n\nHello 蝦餃\n", encoding="utf-8")
    (root / "src").mkdir()
    (root / "src" / "main.py").write_text("print('hello')\n", encoding="utf-8")
    (root / ".env").write_text("not-a-real-secret\n", encoding="utf-8")
    (root / ".git" / "config").write_text("internal\n", encoding="utf-8")
    return root


def test_inventory_lists_files_and_directories_but_never_git_metadata(
    tmp_path: Path,
) -> None:
    browser = RepositoryFileBrowser(_repository(tmp_path))

    entries = browser.list_entries()
    paths = [entry.relative_path for entry in entries]

    assert paths == ["docs", "docs/guide.md", "src", "src/main.py"]
    assert not any(path.startswith(".git") for path in paths)
    assert not any(path == ".env" for path in paths)
    assert entries[0].is_directory
    assert entries[1].size is not None


def test_hidden_files_are_an_explicit_choice_but_git_stays_excluded(tmp_path: Path) -> None:
    browser = RepositoryFileBrowser(_repository(tmp_path))

    paths = [entry.relative_path for entry in browser.list_entries(include_hidden=True)]

    assert ".env" in paths
    assert not any(path.startswith(".git") for path in paths)


def test_utf8_preview_preserves_unicode_and_reports_truncation(tmp_path: Path) -> None:
    root = _repository(tmp_path)
    browser = RepositoryFileBrowser(root, maximum_preview_bytes=12)

    preview = browser.preview("docs/guide.md")

    assert preview.relative_path == "docs/guide.md"
    assert not preview.binary
    assert preview.truncated
    assert "Preview stopped after 12" in preview.text


@pytest.mark.parametrize("payload", [b"PNG\0bytes", b"\xff\xfe\xfd"])
def test_binary_or_non_utf8_preview_never_renders_payload(
    tmp_path: Path, payload: bytes
) -> None:
    root = _repository(tmp_path)
    (root / "asset.bin").write_bytes(payload)
    browser = RepositoryFileBrowser(root)

    preview = browser.preview("asset.bin")

    assert preview.binary
    assert "file" in preview.text.lower()
    assert "bytes" in preview.text.lower()


@pytest.mark.parametrize(
    "requested",
    ["../outside.txt", "docs", "missing.txt"],
)
def test_preview_rejects_escape_directories_and_missing_files(
    tmp_path: Path, requested: str
) -> None:
    browser = RepositoryFileBrowser(_repository(tmp_path))

    with pytest.raises(FileBrowserPathError):
        browser.preview(requested)


def test_inventory_limit_fails_closed_instead_of_freezing_the_tui(tmp_path: Path) -> None:
    browser = RepositoryFileBrowser(_repository(tmp_path), maximum_entries=2)

    with pytest.raises(FileBrowserLimitError, match="exceeds 2 entries"):
        browser.list_entries()


def test_repository_root_must_exist_and_be_a_directory(tmp_path: Path) -> None:
    with pytest.raises(FileBrowserPathError):
        RepositoryFileBrowser(tmp_path / "missing")

    file_path = tmp_path / "file.txt"
    file_path.write_text("hello", encoding="utf-8")
    with pytest.raises(FileBrowserPathError):
        RepositoryFileBrowser(file_path)
