"""Pure Cheap LFS v1 pointer and path compatibility model.

The Windows desktop application owns the format.  The terminal application
deliberately reads and writes that exact schema instead of introducing a
terminal-only dialect.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

CHEAP_LFS_POINTER_VERSION = "desktop-material/cheap-lfs/v1"
CHEAP_LFS_PART_SIZE_BYTES = 500 * 1024 * 1024
CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES = 2 * 1024 * 1024 * 1024
CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES = 512 * 1024
CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES = 100 * 1024 * 1024

_MAXIMUM_SAFE_INTEGER = (1 << 53) - 1
_SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")
_NON_NEGATIVE_INTEGER = re.compile(r"^(?:0|[1-9][0-9]*)$")
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f]")
_ECMASCRIPT_WHITESPACE = frozenset(
    "\u0009\u000b\u000c\u0020\u00a0\u1680"
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff\u000a\u000d"
)
_WINDOWS_INVALID_SEGMENT = re.compile(r'[<>:"|?*\x00-\x1f]')
_WINDOWS_RESERVED_BASENAME = re.compile(
    r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CheapLfsPart:
    """One ordered raw or raw-DEFLATE Release asset."""

    name: str
    size_in_bytes: int
    sha256: str
    deflated_size_in_bytes: int | None = None


@dataclass(frozen=True)
class CheapLfsPointer:
    """Canonical Windows-compatible Cheap LFS v1 pointer."""

    version: str
    release_tag: str
    asset_name: str
    size_in_bytes: int
    sha256: str
    parts: tuple[CheapLfsPart, ...] | None = None


@dataclass(frozen=True)
class CheapLfsPartRange:
    """One contiguous source range used by a new 500 MiB upload plan."""

    index: int
    offset: int
    length: int


def _utf16_length(value: str) -> int:
    """Match JavaScript ``String.length`` used by the Windows parser."""

    return len(value.encode("utf-16-le")) // 2


def pointer_text_size_in_bytes(text: str) -> int:
    return len(text.encode("utf-8"))


def plan_file_parts(
    total_size: int,
    part_size: int = CHEAP_LFS_PART_SIZE_BYTES,
) -> tuple[CheapLfsPartRange, ...]:
    """Split a size into the Windows writer's contiguous part ranges."""

    if (
        isinstance(total_size, bool)
        or isinstance(part_size, bool)
        or not isinstance(total_size, int)
        or not isinstance(part_size, int)
        or not 0 <= total_size <= _MAXIMUM_SAFE_INTEGER
        or not 1 <= part_size <= CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES
    ):
        raise ValueError("Cheap LFS cannot plan parts for these sizes.")
    if total_size <= part_size:
        return (CheapLfsPartRange(index=0, offset=0, length=total_size),)
    parts: list[CheapLfsPartRange] = []
    offset = 0
    index = 0
    while offset < total_size:
        length = min(part_size, total_size - offset)
        parts.append(CheapLfsPartRange(index=index, offset=offset, length=length))
        offset += length
        index += 1
    return tuple(parts)


def serialize_cheap_lfs_pointer(pointer: CheapLfsPointer) -> str:
    """Serialize the canonical five-line head and optional ordered parts."""

    _validate_pointer(pointer)
    lines = [
        f"version {pointer.version}",
        f"release-tag {pointer.release_tag}",
        f"asset-name {pointer.asset_name}",
        f"size {pointer.size_in_bytes}",
        f"sha256 {pointer.sha256}",
    ]
    if pointer.parts is not None:
        for part in pointer.parts:
            if part.deflated_size_in_bytes is None:
                lines.append(f"part {part.sha256} {part.size_in_bytes} {part.name}")
            else:
                lines.append(
                    "part-deflate "
                    f"{part.sha256} {part.size_in_bytes} "
                    f"{part.deflated_size_in_bytes} {part.name}"
                )
    text = "\n".join(lines) + "\n"
    if pointer_text_size_in_bytes(text) > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES:
        raise ValueError("Cheap LFS pointer exceeds the 512 KiB compatibility limit.")
    return text


def parse_cheap_lfs_pointer(text: object) -> CheapLfsPointer | None:
    """Parse the Windows v1 grammar, returning ``None`` for non-pointers."""

    if (
        not isinstance(text, str)
        or len(text) > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES
        or pointer_text_size_in_bytes(text) > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES
        or "\x00" in text
    ):
        return None
    normalized = _trim_ecmascript_whitespace(text.removeprefix("\ufeff"))
    if not normalized:
        return None
    head_lines: list[str] = []
    raw_parts: list[tuple[bool, str]] = []
    for line in re.split(r"\r?\n", normalized):
        if line.startswith("part "):
            raw_parts.append((False, line[len("part ") :]))
        elif line.startswith("part-deflate "):
            raw_parts.append((True, line[len("part-deflate ") :]))
        else:
            head_lines.append(line)
    if len(head_lines) != 5:
        return None

    fields: dict[str, str] = {}
    for line in head_lines:
        separator = line.find(" ")
        if separator <= 0:
            return None
        key = line[:separator]
        if key in fields:
            return None
        fields[key] = line[separator + 1 :]
    if set(fields) != {"version", "release-tag", "asset-name", "size", "sha256"}:
        return None

    version = fields["version"]
    release_tag = fields["release-tag"]
    asset_name = fields["asset-name"]
    raw_size = fields["size"]
    sha256 = fields["sha256"]
    if version != CHEAP_LFS_POINTER_VERSION:
        return None
    if not release_tag or any(_is_ecmascript_whitespace(character) for character in release_tag):
        return None
    if not asset_name:
        return None
    if _SHA256_HEX.fullmatch(sha256) is None:
        return None
    if _NON_NEGATIVE_INTEGER.fullmatch(raw_size) is None or len(raw_size) > len(
        str(_MAXIMUM_SAFE_INTEGER)
    ):
        return None
    size_in_bytes = int(raw_size)
    if size_in_bytes > _MAXIMUM_SAFE_INTEGER:
        return None

    if not raw_parts:
        return CheapLfsPointer(
            version=version,
            release_tag=release_tag,
            asset_name=asset_name,
            size_in_bytes=size_in_bytes,
            sha256=sha256,
        )

    parts: list[CheapLfsPart] = []
    parts_total = 0
    for deflated, raw in raw_parts:
        # Names may contain spaces; only the fixed numeric prefix is split.
        pieces = raw.split(" ", 3 if deflated else 2)
        expected_fields = 4 if deflated else 3
        if len(pieces) != expected_fields:
            return None
        part_sha = pieces[0]
        raw_original_size = pieces[1]
        raw_stored_size = pieces[2] if deflated else None
        name = pieces[3] if deflated else pieces[2]
        if (
            _SHA256_HEX.fullmatch(part_sha) is None
            or _NON_NEGATIVE_INTEGER.fullmatch(raw_original_size) is None
            or len(raw_original_size) > len(str(CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES))
            or not name
            # JavaScript's non-dotAll ``(.+)`` rejects every ECMAScript line
            # terminator, including lone CR and U+2028/U+2029.  Python splits
            # only CRLF/LF above, so keep this explicit for parser parity.
            or any(character in "\r\n\u2028\u2029" for character in name)
            or _utf16_length(name) > 255
        ):
            return None
        original_size = int(raw_original_size)
        if original_size > CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES:
            return None
        stored_size: int | None = None
        if raw_stored_size is not None:
            if _NON_NEGATIVE_INTEGER.fullmatch(raw_stored_size) is None or len(
                raw_stored_size
            ) > len(str(CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES)):
                return None
            stored_size = int(raw_stored_size)
            if (
                stored_size < 1
                or stored_size > CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES
                or stored_size >= original_size
            ):
                return None
        parts_total += original_size
        if parts_total > _MAXIMUM_SAFE_INTEGER:
            return None
        parts.append(
            CheapLfsPart(
                name=name,
                size_in_bytes=original_size,
                sha256=part_sha,
                deflated_size_in_bytes=stored_size,
            )
        )
    if parts_total != size_in_bytes:
        return None
    return CheapLfsPointer(
        version=version,
        release_tag=release_tag,
        asset_name=asset_name,
        size_in_bytes=size_in_bytes,
        sha256=sha256,
        parts=tuple(parts),
    )


def is_cheap_lfs_pointer_text(text: object) -> bool:
    """Cheap first-line probe shared by bounded repository inventory scans."""

    if not isinstance(text, str):
        return False
    prefix = text[:256]
    if "\x00" in prefix:
        return False
    first_line = _trim_ecmascript_whitespace(
        re.split(r"\r?\n", prefix.removeprefix("\ufeff"), maxsplit=1)[0]
    )
    return first_line == f"version {CHEAP_LFS_POINTER_VERSION}"


def validate_cheap_lfs_tracked_path(relative_path: str) -> str | None:
    """Return a forward-slash Windows-safe repository path, or ``None``."""

    if not isinstance(relative_path, str) or relative_path != relative_path.strip():
        return None
    normalized = relative_path.replace("\\", "/")
    segments = normalized.split("/")
    if (
        not normalized
        or _utf16_length(normalized) > 4096
        or _CONTROL_CHARACTERS.search(normalized) is not None
        or normalized.startswith("/")
        or re.match(r"^[A-Za-z]:/", normalized) is not None
        or any(segment in {"", ".", ".."} for segment in segments)
        or any(
            _utf16_length(segment) > 255
            or _WINDOWS_INVALID_SEGMENT.search(segment) is not None
            or segment.endswith((" ", "."))
            or _WINDOWS_RESERVED_BASENAME.fullmatch(segment) is not None
            for segment in segments
        )
        or segments[0].lower().startswith(".git")
    ):
        return None
    return normalized


def _validate_pointer(pointer: CheapLfsPointer) -> None:
    if pointer.version != CHEAP_LFS_POINTER_VERSION:
        raise ValueError("Cheap LFS pointer has an unsupported version.")
    if (
        not pointer.release_tag
        or any(_is_ecmascript_whitespace(character) for character in pointer.release_tag)
        or _CONTROL_CHARACTERS.search(pointer.release_tag) is not None
    ):
        raise ValueError("Cheap LFS release tag is invalid.")
    if not pointer.asset_name or _CONTROL_CHARACTERS.search(pointer.asset_name) is not None:
        raise ValueError("Cheap LFS asset name is invalid.")
    if (
        isinstance(pointer.size_in_bytes, bool)
        or not isinstance(pointer.size_in_bytes, int)
        or not 0 <= pointer.size_in_bytes <= _MAXIMUM_SAFE_INTEGER
        or _SHA256_HEX.fullmatch(pointer.sha256) is None
    ):
        raise ValueError("Cheap LFS whole-file size or SHA-256 is invalid.")
    if pointer.parts is None:
        return
    if not pointer.parts:
        raise ValueError("Cheap LFS multipart pointer must contain a part.")
    total = 0
    for part in pointer.parts:
        if (
            not part.name
            or _utf16_length(part.name) > 255
            or _CONTROL_CHARACTERS.search(part.name) is not None
            or _SHA256_HEX.fullmatch(part.sha256) is None
            or isinstance(part.size_in_bytes, bool)
            or not isinstance(part.size_in_bytes, int)
            or not 0 <= part.size_in_bytes <= CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES
        ):
            raise ValueError("Cheap LFS part metadata is invalid.")
        if part.deflated_size_in_bytes is not None and (
            isinstance(part.deflated_size_in_bytes, bool)
            or not isinstance(part.deflated_size_in_bytes, int)
            or part.deflated_size_in_bytes < 1
            or part.deflated_size_in_bytes > CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES
            or part.deflated_size_in_bytes >= part.size_in_bytes
        ):
            raise ValueError("Cheap LFS compressed part metadata is invalid.")
        total += part.size_in_bytes
    if total != pointer.size_in_bytes:
        raise ValueError("Cheap LFS part sizes do not equal the whole-file size.")


def _is_ecmascript_whitespace(character: str) -> bool:
    r"""Match ECMAScript WhiteSpace and LineTerminator code points exactly."""

    return character in _ECMASCRIPT_WHITESPACE


def _trim_ecmascript_whitespace(value: str) -> str:
    """Mirror JavaScript ``String.prototype.trim`` without Python-only C0 space."""

    start = 0
    end = len(value)
    while start < end and _is_ecmascript_whitespace(value[start]):
        start += 1
    while end > start and _is_ecmascript_whitespace(value[end - 1]):
        end -= 1
    return value[start:end]
