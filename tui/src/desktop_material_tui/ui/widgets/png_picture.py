"""Dependency-free terminal rendering for verified non-interlaced RGB PNGs."""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

from rich.color import Color
from rich.style import Style
from rich.text import Text

from ...application.dim_sum import PNG_SIGNATURE

MAX_PNG_PIXELS = 4_000_000
MAX_PNG_BYTES = 8 * 1024 * 1024

Rgb = tuple[int, int, int]


class TerminalPngError(ValueError):
    """A PNG cannot be safely rendered by the terminal-native decoder."""


@dataclass(frozen=True)
class TerminalPicture:
    """Downsampled true-color pixels ready for half-block rendering."""

    rows: tuple[tuple[Rgb, ...], ...]

    @property
    def width(self) -> int:
        return len(self.rows[0]) if self.rows else 0

    @property
    def height(self) -> int:
        return len(self.rows)


def decode_png_picture(
    path: Path,
    *,
    columns: int = 24,
    terminal_rows: int = 10,
) -> TerminalPicture:
    """Decode and downsample a bounded 8-bit RGB/RGBA PNG using the stdlib."""

    return decode_png_bytes(
        path.read_bytes(),
        columns=columns,
        terminal_rows=terminal_rows,
    )


def decode_png_bytes(
    payload: bytes,
    *,
    columns: int = 24,
    terminal_rows: int = 10,
) -> TerminalPicture:
    """Decode bounded in-memory PNG bytes, including exact Git blob snapshots."""

    if columns < 1 or terminal_rows < 1:
        raise ValueError("terminal picture dimensions must be positive")
    if not payload or len(payload) > MAX_PNG_BYTES:
        raise TerminalPngError(f"PNG must be between 1 and {MAX_PNG_BYTES:,} bytes")
    width, height, channels, scanlines = _decode_scanlines(payload)
    target_width = min(columns, width)
    target_height = min(terminal_rows * 2, height)
    sampled: list[tuple[Rgb, ...]] = []
    for target_y in range(target_height):
        source_y = min(height - 1, ((2 * target_y + 1) * height) // (2 * target_height))
        row = scanlines[source_y]
        pixels: list[Rgb] = []
        for target_x in range(target_width):
            source_x = min(
                width - 1,
                ((2 * target_x + 1) * width) // (2 * target_width),
            )
            offset = source_x * channels
            red, green, blue = row[offset : offset + 3]
            if channels == 4:
                alpha = row[offset + 3]
                red = red * alpha // 255
                green = green * alpha // 255
                blue = blue * alpha // 255
            pixels.append((red, green, blue))
        sampled.append(tuple(pixels))
    return TerminalPicture(rows=tuple(sampled))


def render_terminal_picture(picture: TerminalPicture) -> Text:
    """Render two image pixels per terminal cell with true-color half blocks."""

    output = Text(no_wrap=True, overflow="crop")
    rows = picture.rows
    for y in range(0, len(rows), 2):
        top = rows[y]
        bottom = rows[min(y + 1, len(rows) - 1)]
        for foreground, background in zip(top, bottom, strict=True):
            output.append(
                "▀",
                style=Style(
                    color=Color.from_rgb(*foreground),
                    bgcolor=Color.from_rgb(*background),
                ),
            )
        if y + 2 < len(rows):
            output.append("\n")
    return output


def _decode_scanlines(payload: bytes) -> tuple[int, int, int, tuple[bytes, ...]]:
    if payload[:8] != PNG_SIGNATURE:
        raise TerminalPngError("image is not a PNG")
    offset = 8
    width = height = channels = 0
    compressed = bytearray()
    saw_header = False
    saw_end = False
    while offset + 12 <= len(payload):
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        chunk_type = payload[offset + 4 : offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        crc_end = data_end + 4
        if crc_end > len(payload):
            raise TerminalPngError("PNG chunk extends beyond the file")
        data = payload[data_start:data_end]
        expected_crc = struct.unpack(">I", payload[data_end:crc_end])[0]
        if zlib.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            raise TerminalPngError(f"PNG {chunk_type!r} checksum is invalid")
        if chunk_type == b"IHDR":
            if saw_header or length != 13:
                raise TerminalPngError("PNG must contain one canonical IHDR")
            width, height, bit_depth, color_type, compression, filtering, interlace = (
                struct.unpack(">IIBBBBB", data)
            )
            if width <= 0 or height <= 0 or width * height > MAX_PNG_PIXELS:
                raise TerminalPngError("PNG dimensions exceed the terminal renderer limit")
            if bit_depth != 8 or color_type not in (2, 6):
                raise TerminalPngError("terminal renderer supports 8-bit RGB/RGBA PNG only")
            if compression != 0 or filtering != 0 or interlace != 0:
                raise TerminalPngError("compressed/filter variants or interlacing are unsupported")
            channels = 3 if color_type == 2 else 4
            saw_header = True
        elif chunk_type == b"IDAT":
            if not saw_header:
                raise TerminalPngError("PNG IDAT appears before IHDR")
            compressed.extend(data)
        elif chunk_type == b"IEND":
            saw_end = True
            break
        offset = crc_end
    if not saw_header or not saw_end or not compressed:
        raise TerminalPngError("PNG is missing IHDR, IDAT, or IEND")

    stride = width * channels
    expected = (stride + 1) * height
    try:
        raw = zlib.decompress(bytes(compressed))
    except zlib.error as error:
        raise TerminalPngError(f"PNG pixel stream is invalid: {error}") from error
    if len(raw) != expected:
        raise TerminalPngError(
            f"PNG pixel stream has {len(raw):,} bytes, expected {expected:,}"
        )

    rows: list[bytes] = []
    previous = bytes(stride)
    for y in range(height):
        start = y * (stride + 1)
        filter_type = raw[start]
        encoded = raw[start + 1 : start + 1 + stride]
        decoded = _unfilter(encoded, previous, channels, filter_type)
        rows.append(decoded)
        previous = decoded
    return width, height, channels, tuple(rows)


def _unfilter(encoded: bytes, previous: bytes, bpp: int, filter_type: int) -> bytes:
    if filter_type not in range(5):
        raise TerminalPngError(f"PNG uses unknown row filter {filter_type}")
    decoded = bytearray(len(encoded))
    for index, value in enumerate(encoded):
        left = decoded[index - bpp] if index >= bpp else 0
        above = previous[index]
        upper_left = previous[index - bpp] if index >= bpp else 0
        if filter_type == 0:
            predictor = 0
        elif filter_type == 1:
            predictor = left
        elif filter_type == 2:
            predictor = above
        elif filter_type == 3:
            predictor = (left + above) // 2
        else:
            predictor = _paeth(left, above, upper_left)
        decoded[index] = (value + predictor) & 0xFF
    return bytes(decoded)


def _paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    diagonal_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= diagonal_distance:
        return left
    if above_distance <= diagonal_distance:
        return above
    return upper_left
