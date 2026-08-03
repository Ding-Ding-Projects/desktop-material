from __future__ import annotations

import hashlib
import json
import struct
import zlib
from datetime import datetime, timezone
from pathlib import Path

import pytest

from desktop_material_tui.application.dim_sum import (
    DimSumCatalogError,
    DimSumLaunchContext,
    DimSumSurpriseController,
    dim_sum_alt_text,
    dim_sum_display_name,
    is_within_quiet_hours,
    load_dim_sum_catalog,
    pick_dim_sum_dish,
    should_show_dim_sum,
)

TUI_ROOT = Path(__file__).resolve().parents[2]
PACKAGED_CATALOG = TUI_ROOT / "src" / "desktop_material_tui" / "assets" / "dim-sum"


def _png(width: int = 2, height: int = 3) -> bytes:
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = b"IHDR" + header
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + chunk + struct.pack(
        ">I", zlib.crc32(chunk) & 0xFFFFFFFF
    )


def _catalog(tmp_path: Path) -> tuple[Path, Path]:
    assets = tmp_path / "assets"
    assets.mkdir()
    payload = _png()
    image = assets / "har-gow.png"
    image.write_bytes(payload)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "dishes": [
                    {
                        "id": "hk-dish-0001",
                        "slug": "classic-har-gow",
                        "name": {"en": "Classic Har Gow", "zhHant": "蝦餃"},
                        "jyutping": "haa1 gaau2",
                        "category": "steamed-dim-sum",
                        "alt": {
                            "en": "Photograph of Classic Har Gow",
                            "yue": "茶樓枱上嘅蝦餃",
                        },
                        "file": image.name,
                        "bytes": len(payload),
                        "width": 2,
                        "height": 3,
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return manifest, assets


def test_catalog_verifies_bytes_digest_dimensions_and_bilingual_facts(
    tmp_path: Path,
) -> None:
    manifest, assets = _catalog(tmp_path)

    dishes = load_dim_sum_catalog(manifest, assets)

    assert len(dishes) == 1
    dish = dishes[0]
    assert dim_sum_display_name(dish, "english") == "Classic Har Gow · 蝦餃"
    assert dim_sum_display_name(dish, "cantonese") == "蝦餃 · Classic Har Gow"
    assert dim_sum_alt_text(dish, "english").startswith("Photograph of Classic Har Gow")
    assert dim_sum_alt_text(dish, "cantonese").startswith("茶樓枱上嘅蝦餃")


def test_all_repository_catalog_assets_are_packaged_and_verify_byte_for_byte() -> None:
    dishes = load_dim_sum_catalog(
        PACKAGED_CATALOG / "manifest.json",
        PACKAGED_CATALOG,
    )

    assert len(dishes) == 12
    assert len({dish.dish_id for dish in dishes}) == len(dishes)
    assert len({dish.sha256 for dish in dishes}) == len(dishes)
    assert all(dish.image_path.is_file() for dish in dishes)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, True),
        (0.099999, True),
        (0.1, False),
        (0.9999, False),
        (-1, False),
        (1, False),
        (float("nan"), False),
        ("0.01", False),
        (True, False),
    ],
)
def test_probability_is_exactly_the_bottom_tenth(value: object, expected: bool) -> None:
    assert should_show_dim_sum(value) is expected


def test_controller_draws_once_and_uses_an_independent_dish_draw(tmp_path: Path) -> None:
    manifest, assets = _catalog(tmp_path)
    dishes = load_dim_sum_catalog(manifest, assets)
    draws = iter((0.05, 0.75, 0.01, 0.0))
    controller = DimSumSurpriseController(dishes, random_draw=lambda: next(draws))

    first = controller.consider(DimSumLaunchContext())
    second = controller.consider(DimSumLaunchContext())

    assert first.dish == dishes[0]
    assert first.suppression is None
    assert second.dish is None
    assert second.suppression == "already-drawn"
    assert next(draws) == 0.01


@pytest.mark.parametrize(
    ("context", "reason"),
    [
        (DimSumLaunchContext(error_state=True, first_run=True), "error"),
        (DimSumLaunchContext(first_run=True), "first-run"),
        (DimSumLaunchContext(updating=True), "update"),
        (DimSumLaunchContext(modal_open=True), "modal"),
        (DimSumLaunchContext(quiet_hours=True), "quiet-hours"),
    ],
)
def test_suppression_spends_the_launch_draw_and_never_ambushes_later(
    tmp_path: Path, context: DimSumLaunchContext, reason: str
) -> None:
    manifest, assets = _catalog(tmp_path)
    controller = DimSumSurpriseController(
        load_dim_sum_catalog(manifest, assets), random_draw=lambda: 0.01
    )

    assert controller.consider(context).suppression == reason
    assert controller.consider(DimSumLaunchContext()).suppression == "already-drawn"


def test_pick_clamps_finite_values_and_falls_back_on_malformed_draw(tmp_path: Path) -> None:
    manifest, assets = _catalog(tmp_path)
    one = load_dim_sum_catalog(manifest, assets)[0]
    dishes = (one, one, one)

    assert pick_dim_sum_dish(dishes, -5) is dishes[0]
    assert pick_dim_sum_dish(dishes, 1) is dishes[-1]
    assert pick_dim_sum_dish(dishes, "bad") is dishes[0]
    assert pick_dim_sum_dish((), 0.5) is None


@pytest.mark.parametrize(
    ("start", "end", "hour", "expected"),
    [
        ("09:00", "17:00", 12, True),
        ("09:00", "17:00", 18, False),
        ("22:00", "08:00", 23, True),
        ("22:00", "08:00", 7, True),
        ("22:00", "08:00", 12, False),
        ("", "", 12, False),
        ("09:00", "09:00", 9, False),
        ("broken", "17:00", 12, False),
    ],
)
def test_quiet_hours_support_daytime_midnight_wrap_and_invalid_values(
    start: str, end: str, hour: int, expected: bool
) -> None:
    now = datetime(2026, 8, 2, hour, 30, tzinfo=timezone.utc)
    assert is_within_quiet_hours(start, end, now=now) is expected


@pytest.mark.parametrize("mutation", ["digest", "size", "dimensions", "filename"])
def test_catalog_rejects_unverified_or_escaping_assets(tmp_path: Path, mutation: str) -> None:
    manifest, assets = _catalog(tmp_path)
    source = json.loads(manifest.read_text(encoding="utf-8"))
    record = source["dishes"][0]
    if mutation == "digest":
        record["sha256"] = "0" * 64
    elif mutation == "size":
        record["bytes"] += 1
    elif mutation == "dimensions":
        record["width"] += 1
    else:
        record["file"] = "../har-gow.png"
    manifest.write_text(json.dumps(source), encoding="utf-8")

    with pytest.raises(DimSumCatalogError):
        load_dim_sum_catalog(manifest, assets)
