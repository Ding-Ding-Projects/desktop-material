from __future__ import annotations

import pytest

from desktop_material_tui.application.diff_preview import (
    DiffPreviewError,
    changed_path_entries,
    decode_text_preview,
    structured_diff,
)


def test_changed_path_entries_group_only_safe_relative_paths() -> None:
    entries = changed_path_entries(
        (
            "src/widgets/panel.py",
            "README.md",
            "../outside.txt",
            "/absolute.txt",
            "bad\nname.txt",
        )
    )

    by_path = {entry.path: entry for entry in entries}
    assert by_path["src/widgets/panel.py"].segments == ("src", "widgets", "panel.py")
    assert by_path["README.md"].grouped
    for unsafe in ("../outside.txt", "/absolute.txt", "bad\nname.txt"):
        assert not by_path[unsafe].grouped
        assert by_path[unsafe].segments == (unsafe,)


def test_structured_csv_diff_aligns_quoted_multiline_and_changed_cells() -> None:
    before = b'name,note\r\n"Har Gow","first\nline"\r\nSiu Mai,steady\r\n'
    after = b'name,note\n"Har Gow","second\nline"\nSiu Mai,steady\nCustard Bao,new\n'

    model = structured_diff(before, after, delimiter=",")

    assert model.column_count == 2
    assert [row.status for row in model.rows] == [
        "unchanged",
        "changed",
        "unchanged",
        "added",
    ]
    assert model.rows[1].before == ("Har Gow", "first\nline")
    assert model.rows[1].after == ("Har Gow", "second\nline")
    assert model.rows[-1].after == ("Custard Bao", "new")


def test_structured_tsv_and_text_preview_fail_closed_at_bounds() -> None:
    model = structured_diff(b"a\tb\n", b"a\tc\n", delimiter="\t")
    assert model.rows[0].status == "changed"

    with pytest.raises(DiffPreviewError, match="NUL"):
        decode_text_preview(b"unsafe\0payload", label="Markdown")
    with pytest.raises(DiffPreviewError, match="not valid UTF-8"):
        decode_text_preview(b"\xff", label="Markdown")
    with pytest.raises(DiffPreviewError, match="control"):
        decode_text_preview(b"escape\x1b[31m", label="Markdown")
    with pytest.raises(DiffPreviewError, match="500"):
        structured_diff(b"a\n" * 501, b"a\n", delimiter=",")
