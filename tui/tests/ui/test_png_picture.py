from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pytest

from desktop_material_tui.ui.widgets.png_picture import (
    TerminalPngError,
    decode_png_bytes,
    decode_png_picture,
    render_terminal_picture,
)


def _chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def _png(path: Path, *, rgba: bool = False, filter_type: int = 0) -> None:
    width = height = 2
    color_type = 6 if rgba else 2
    channels = 4 if rgba else 3
    pixels = (
        bytes((255, 0, 0, 255, 0, 255, 0, 128))
        if rgba
        else bytes((255, 0, 0, 0, 255, 0))
    )
    lower = (
        bytes((0, 0, 255, 255, 255, 255, 255, 255))
        if rgba
        else bytes((0, 0, 255, 255, 255, 255))
    )
    if filter_type == 1:
        def sub(row: bytes) -> bytes:
            return bytes(
                (value - (row[index - channels] if index >= channels else 0)) & 0xFF
                for index, value in enumerate(row)
            )

        rows = bytes((1,)) + sub(pixels) + bytes((1,)) + sub(lower)
    else:
        rows = bytes((0,)) + pixels + bytes((0,)) + lower
    header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(rows))
        + _chunk(b"IEND", b"")
    )


@pytest.mark.parametrize("rgba", [False, True])
@pytest.mark.parametrize("filter_type", [0, 1])
def test_decoder_renders_real_rgb_and_rgba_pixels(
    tmp_path: Path, rgba: bool, filter_type: int
) -> None:
    path = tmp_path / "dish.png"
    _png(path, rgba=rgba, filter_type=filter_type)

    picture = decode_png_picture(path, columns=2, terminal_rows=1)
    rendered = render_terminal_picture(picture)

    assert picture.width == 2
    assert picture.height == 2
    assert picture.rows[0][0] == (255, 0, 0)
    assert rendered.plain == "▀▀"
    assert len(rendered.spans) == 2


def test_decoder_downsamples_without_exceeding_requested_cells(tmp_path: Path) -> None:
    path = tmp_path / "dish.png"
    _png(path)

    picture = decode_png_picture(path, columns=1, terminal_rows=1)

    assert picture.width == 1
    assert picture.height == 2
    assert render_terminal_picture(picture).plain == "▀"


def test_decoder_rejects_corrupt_and_oversized_input(tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.png"
    corrupt.write_bytes(b"not png")
    with pytest.raises(TerminalPngError):
        decode_png_picture(corrupt)

    too_large = tmp_path / "large.png"
    too_large.write_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * (8 * 1024 * 1024))
    with pytest.raises(TerminalPngError, match="between 1"):
        decode_png_picture(too_large)


def test_decode_png_bytes_renders_an_exact_git_blob(tmp_path: Path) -> None:
    path = tmp_path / "blob.png"
    _png(path, rgba=True, filter_type=1)

    picture = decode_png_bytes(path.read_bytes(), columns=2, terminal_rows=1)

    assert picture.width == 2
    assert picture.height == 2
