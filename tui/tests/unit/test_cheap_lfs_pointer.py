"""Windows/TUI Cheap LFS pointer-schema compatibility tests."""

from __future__ import annotations

import hashlib

import pytest

from desktop_material_tui.domain.cheap_lfs import (
    CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES,
    CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
    CHEAP_LFS_PART_SIZE_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    CheapLfsPart,
    CheapLfsPointer,
    is_cheap_lfs_pointer_text,
    parse_cheap_lfs_pointer,
    plan_file_parts,
    serialize_cheap_lfs_pointer,
    validate_cheap_lfs_tracked_path,
)

_EMPTY_SHA = hashlib.sha256(b"").hexdigest()
_A_SHA = hashlib.sha256(b"a").hexdigest()
_B_SHA = hashlib.sha256(b"b").hexdigest()


def test_five_line_pointer_round_trips_byte_for_byte() -> None:
    pointer = CheapLfsPointer(
        version=CHEAP_LFS_POINTER_VERSION,
        release_tag="assets",
        asset_name="payload.bin",
        size_in_bytes=0,
        sha256=_EMPTY_SHA,
    )
    text = (
        "version desktop-material/cheap-lfs/v1\n"
        "release-tag assets\n"
        "asset-name payload.bin\n"
        "size 0\n"
        f"sha256 {_EMPTY_SHA}\n"
    )

    assert serialize_cheap_lfs_pointer(pointer) == text
    assert parse_cheap_lfs_pointer(text) == pointer
    assert parse_cheap_lfs_pointer("\ufeff" + text.replace("\n", "\r\n")) == pointer
    assert parse_cheap_lfs_pointer("\ufeff" + text.replace("\n", "\r\n") + "\ufeff") == pointer
    assert parse_cheap_lfs_pointer(text + "\x1c") is None
    assert is_cheap_lfs_pointer_text(text)


def test_ordered_raw_and_deflated_parts_match_windows_grammar() -> None:
    pointer = CheapLfsPointer(
        version=CHEAP_LFS_POINTER_VERSION,
        release_tag="assets-2",
        asset_name="payload.bin",
        size_in_bytes=3,
        sha256=hashlib.sha256(b"abb").hexdigest(),
        parts=(
            CheapLfsPart("payload.bin.part001", 1, _A_SHA),
            CheapLfsPart("payload.bin.part002.deflate", 2, _B_SHA, 1),
        ),
    )

    parsed = parse_cheap_lfs_pointer(serialize_cheap_lfs_pointer(pointer))

    assert parsed == pointer
    assert parsed is not None
    assert parsed.parts is not None
    assert [part.name for part in parsed.parts] == [
        "payload.bin.part001",
        "payload.bin.part002.deflate",
    ]


@pytest.mark.parametrize("line_terminator", ["\r", "\u2028", "\u2029"])
def test_part_names_reject_javascript_regex_line_terminators(
    line_terminator: str,
) -> None:
    text = (
        "version desktop-material/cheap-lfs/v1\n"
        "release-tag assets\n"
        "asset-name payload\n"
        "size 1\n"
        f"sha256 {_A_SHA}\n"
        f"part {_A_SHA} 1 before{line_terminator}after\n"
    )

    assert parse_cheap_lfs_pointer(text) is None


@pytest.mark.parametrize(
    "text",
    [
        "",
        "version desktop-material/cheap-lfs/v2\n",
        (
            "version desktop-material/cheap-lfs/v1\n"
            "release-tag assets\ufeffhidden\n"
            "asset-name payload\n"
            "size 1\n"
            f"sha256 {_A_SHA}\n"
        ),
        (
            "version desktop-material/cheap-lfs/v1\n"
            "release-tag assets\n"
            "asset-name payload\n"
            "size 1\n"
            f"sha256 {_A_SHA}\n"
            f"part {_A_SHA} 2 payload.part001\n"
        ),
        (
            "version desktop-material/cheap-lfs/v1\n"
            "release-tag assets\n"
            "asset-name payload\n"
            "size 1\n"
            "sha256 ABCD\n"
        ),
    ],
)
def test_malformed_or_oversized_text_is_not_a_pointer(text: str) -> None:
    assert parse_cheap_lfs_pointer(text) is None


def test_oversized_text_is_not_a_pointer() -> None:
    text = "x" * (CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES + 1)

    assert parse_cheap_lfs_pointer(text) is None


def test_pathological_decimal_fields_fail_closed_without_integer_conversion() -> None:
    huge_decimal = "9" * 5_000
    huge_head = (
        "version desktop-material/cheap-lfs/v1\n"
        "release-tag assets\n"
        "asset-name payload\n"
        f"size {huge_decimal}\n"
        f"sha256 {_A_SHA}\n"
    )
    huge_part = (
        "version desktop-material/cheap-lfs/v1\n"
        "release-tag assets\n"
        "asset-name payload\n"
        "size 1\n"
        f"sha256 {_A_SHA}\n"
        f"part {_A_SHA} {huge_decimal} payload.part001\n"
    )
    huge_deflated_size = (
        "version desktop-material/cheap-lfs/v1\n"
        "release-tag assets\n"
        "asset-name payload\n"
        "size 2\n"
        f"sha256 {_A_SHA}\n"
        f"part-deflate {_A_SHA} 2 {huge_decimal} payload.deflate\n"
    )

    assert parse_cheap_lfs_pointer(huge_head) is None
    assert parse_cheap_lfs_pointer(huge_part) is None
    assert parse_cheap_lfs_pointer(huge_deflated_size) is None


def test_new_parts_are_500_mib_and_legacy_parser_accepts_exactly_2_gib() -> None:
    planned = plan_file_parts(CHEAP_LFS_PART_SIZE_BYTES + 1)

    assert [part.length for part in planned] == [CHEAP_LFS_PART_SIZE_BYTES, 1]

    legacy = (
        "version desktop-material/cheap-lfs/v1\n"
        "release-tag assets\n"
        "asset-name legacy.bin\n"
        f"size {CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES}\n"
        f"sha256 {_A_SHA}\n"
        f"part {_A_SHA} {CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES} legacy.bin\n"
    )
    assert parse_cheap_lfs_pointer(legacy) is not None
    assert (
        parse_cheap_lfs_pointer(
            legacy.replace(
                str(CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES),
                str(CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES + 1),
            )
        )
        is None
    )


@pytest.mark.parametrize(
    ("total_size", "part_size"),
    [
        (1.5, 1),
        (1, 1.5),
        (True, 1),
        (1, False),
    ],
)
def test_part_planner_requires_real_integers(
    total_size: object,
    part_size: object,
) -> None:
    with pytest.raises(ValueError, match="cannot plan parts"):
        plan_file_parts(total_size, part_size)  # type: ignore[arg-type]


def test_serializer_rejects_non_integer_sizes() -> None:
    pointer = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload.bin",
        1.5,  # type: ignore[arg-type]
        _A_SHA,
    )
    with pytest.raises(ValueError, match="whole-file size"):
        serialize_cheap_lfs_pointer(pointer)

    multipart = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload.bin",
        1,
        _A_SHA,
        (
            CheapLfsPart(
                "payload.bin.deflate",
                1,
                _A_SHA,
                0.5,  # type: ignore[arg-type]
            ),
        ),
    )
    with pytest.raises(ValueError, match="compressed part metadata"):
        serialize_cheap_lfs_pointer(multipart)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("models/large file.bin", "models/large file.bin"),
        (r"models\part.bin", "models/part.bin"),
        ("../escape.bin", None),
        ("/absolute.bin", None),
        ("C:/drive.bin", None),
        (".git/config", None),
        (".github/workflow.yml", None),
        ("folder/NUL.txt", None),
        ("folder/trailing. ", None),
        ("folder/a:b.bin", None),
    ],
)
def test_tracked_paths_are_windows_safe_even_on_linux(
    raw: str,
    expected: str | None,
) -> None:
    assert validate_cheap_lfs_tracked_path(raw) == expected


def test_serializer_refuses_a_pointer_larger_than_512_kib() -> None:
    parts = tuple(CheapLfsPart(f"{index:06d}-{'x' * 230}", 0, _EMPTY_SHA) for index in range(2_200))
    pointer = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload",
        0,
        _EMPTY_SHA,
        parts,
    )

    with pytest.raises(ValueError, match="512 KiB"):
        serialize_cheap_lfs_pointer(pointer)
