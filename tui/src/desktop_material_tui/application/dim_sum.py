"""Verified dim-sum catalog and exactly-once startup surprise policy."""

from __future__ import annotations

import hashlib
import json
import math
import secrets
import struct
import zlib
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

DIM_SUM_SURPRISE_PROBABILITY = 0.1
DIM_SUM_SURPRISE_DURATION_SECONDS = 9.0
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

LanguagePrimary = Literal["english", "cantonese"]
SuppressionReason = Literal[
    "first-run",
    "error",
    "update",
    "modal",
    "quiet-hours",
    "already-drawn",
    "no-dishes",
]


class DimSumCatalogError(ValueError):
    """A bundled catalog record or PNG failed verification."""


@dataclass(frozen=True)
class DimSumDish:
    """One verified bundled dish and its bilingual factual metadata."""

    dish_id: str
    slug: str
    english_name: str
    cantonese_name: str
    jyutping: str
    category: str
    english_alt: str
    cantonese_alt: str
    filename: str
    byte_count: int
    width: int
    height: int
    sha256: str
    image_path: Path


@dataclass(frozen=True)
class DimSumLaunchContext:
    """State that may politely suppress the launch's single surprise draw."""

    first_run: bool = False
    error_state: bool = False
    updating: bool = False
    modal_open: bool = False
    quiet_hours: bool = False


@dataclass(frozen=True)
class DimSumDecision:
    """The final result of the one allowed consideration for a launch."""

    dish: DimSumDish | None
    suppression: SuppressionReason | Literal["probability-miss"] | None


def dim_sum_suppression_reason(
    context: DimSumLaunchContext,
    *,
    already_drawn: bool,
    dish_count: int,
) -> SuppressionReason | None:
    """Return the highest-priority reason a launch must not show a card."""

    if context.error_state:
        return "error"
    if context.first_run:
        return "first-run"
    if context.updating:
        return "update"
    if context.modal_open:
        return "modal"
    if context.quiet_hours:
        return "quiet-hours"
    if already_drawn:
        return "already-drawn"
    if dish_count <= 0:
        return "no-dishes"
    return None


def is_within_quiet_hours(
    start: str,
    end: str,
    *,
    now: datetime | None = None,
) -> bool:
    """Evaluate a configured HH:MM window, including midnight wrapping."""

    if not start or not end or start == end:
        return False

    def minute_of_day(value: str) -> int | None:
        pieces = value.split(":")
        if len(pieces) != 2 or not all(piece.isdigit() for piece in pieces):
            return None
        hour, minute = (int(piece) for piece in pieces)
        if hour not in range(24) or minute not in range(60):
            return None
        return hour * 60 + minute

    start_minute = minute_of_day(start)
    end_minute = minute_of_day(end)
    if start_minute is None or end_minute is None:
        return False
    current = now or datetime.now().astimezone()
    current_minute = current.hour * 60 + current.minute
    if start_minute < end_minute:
        return start_minute <= current_minute < end_minute
    return current_minute >= start_minute or current_minute < end_minute


def should_show_dim_sum(
    random_value: object,
    probability: float = DIM_SUM_SURPRISE_PROBABILITY,
) -> bool:
    """Return true for exactly the bottom tenth of a valid unit draw."""

    if isinstance(random_value, bool) or not isinstance(random_value, (int, float)):
        return False
    numeric = float(random_value)
    return math.isfinite(numeric) and 0 <= numeric < 1 and numeric < probability


def pick_dim_sum_dish(
    dishes: Sequence[DimSumDish], random_value: object
) -> DimSumDish | None:
    """Map a second independent draw onto one verified dish."""

    if not dishes:
        return None
    if isinstance(random_value, bool) or not isinstance(random_value, (int, float)):
        return dishes[0]
    numeric = float(random_value)
    if not math.isfinite(numeric):
        return dishes[0]
    clamped = min(1.0, max(0.0, numeric))
    index = min(len(dishes) - 1, math.floor(clamped * len(dishes)))
    return dishes[index]


def dim_sum_display_name(dish: DimSumDish, primary: LanguagePrimary) -> str:
    """Return both factual dish names with the active language first."""

    if primary == "cantonese":
        return f"{dish.cantonese_name} · {dish.english_name}"
    return f"{dish.english_name} · {dish.cantonese_name}"


def dim_sum_alt_text(dish: DimSumDish, primary: LanguagePrimary) -> str:
    """Describe the bundled photograph and name its dish in both languages."""

    name = dim_sum_display_name(dish, primary)
    if primary == "cantonese":
        return f"{dish.cantonese_alt} ({name})"
    return f"{dish.english_alt} ({name})"


class DimSumSurpriseController:
    """Spend exactly one surprise opportunity for this process launch."""

    def __init__(
        self,
        dishes: Sequence[DimSumDish],
        *,
        random_draw: Callable[[], float] | None = None,
    ) -> None:
        self.dishes = tuple(dishes)
        self._random_draw = random_draw or secrets.SystemRandom().random
        self._considered = False

    @property
    def considered(self) -> bool:
        return self._considered

    def consider(self, context: DimSumLaunchContext) -> DimSumDecision:
        """Make the launch's one decision; a suppressed launch never ambushes later."""

        reason = dim_sum_suppression_reason(
            context,
            already_drawn=self._considered,
            dish_count=len(self.dishes),
        )
        if self._considered:
            return DimSumDecision(dish=None, suppression="already-drawn")
        self._considered = True
        if reason is not None:
            return DimSumDecision(dish=None, suppression=reason)
        if not should_show_dim_sum(self._random_draw()):
            return DimSumDecision(dish=None, suppression="probability-miss")
        return DimSumDecision(
            dish=pick_dim_sum_dish(self.dishes, self._random_draw()),
            suppression=None,
        )


def load_dim_sum_catalog(manifest_path: Path, asset_root: Path) -> tuple[DimSumDish, ...]:
    """Load only records whose tracked PNG bytes and metadata verify exactly."""

    try:
        source = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise DimSumCatalogError(f"Dim-sum manifest could not be read: {error}") from error
    if not isinstance(source, Mapping) or not isinstance(source.get("dishes"), list):
        raise DimSumCatalogError("Dim-sum manifest must contain a dishes array.")
    verified: list[DimSumDish] = []
    identifiers: set[str] = set()
    filenames: set[str] = set()
    for index, raw in enumerate(source["dishes"]):
        try:
            dish = _coerce_dish(raw, asset_root)
        except (KeyError, TypeError, ValueError, OSError) as error:
            raise DimSumCatalogError(
                f"Dim-sum record {index} failed verification: {error}"
            ) from error
        if dish.dish_id in identifiers:
            raise DimSumCatalogError(f"Duplicate dim-sum id: {dish.dish_id}")
        if dish.filename in filenames:
            raise DimSumCatalogError(f"Duplicate dim-sum image: {dish.filename}")
        identifiers.add(dish.dish_id)
        filenames.add(dish.filename)
        verified.append(dish)
    return tuple(verified)


def _required_text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be non-empty text")
    return value


def _required_positive_int(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return value


def _coerce_dish(raw: Any, asset_root: Path) -> DimSumDish:
    if not isinstance(raw, Mapping):
        raise TypeError("record must be an object")
    names = raw["name"]
    alt = raw["alt"]
    if not isinstance(names, Mapping) or not isinstance(alt, Mapping):
        raise TypeError("name and alt must be objects")
    filename = _required_text(raw["file"], "file")
    if Path(filename).name != filename or "/" in filename or "\\" in filename:
        raise ValueError("file must be a plain filename")
    expected_size = _required_positive_int(raw["bytes"], "bytes")
    expected_width = _required_positive_int(raw["width"], "width")
    expected_height = _required_positive_int(raw["height"], "height")
    expected_digest = _required_text(raw["sha256"], "sha256").lower()
    if len(expected_digest) != 64 or any(
        character not in "0123456789abcdef" for character in expected_digest
    ):
        raise ValueError("sha256 must contain 64 lowercase hexadecimal characters")

    root = asset_root.resolve(strict=True)
    image_path = asset_root.joinpath(filename).resolve(strict=True)
    image_path.relative_to(root)
    payload = image_path.read_bytes()
    if len(payload) != expected_size:
        raise ValueError(
            f"{filename} has {len(payload)} bytes, expected {expected_size}"
        )
    actual_digest = hashlib.sha256(payload).hexdigest()
    if actual_digest != expected_digest:
        raise ValueError(f"{filename} SHA-256 does not match the manifest")
    width, height = read_png_dimensions(payload)
    if (width, height) != (expected_width, expected_height):
        raise ValueError(
            f"{filename} is {width}x{height}, expected {expected_width}x{expected_height}"
        )
    return DimSumDish(
        dish_id=_required_text(raw["id"], "id"),
        slug=_required_text(raw["slug"], "slug"),
        english_name=_required_text(names["en"], "name.en"),
        cantonese_name=_required_text(names["zhHant"], "name.zhHant"),
        jyutping=str(raw.get("jyutping", "")),
        category=_required_text(raw["category"], "category"),
        english_alt=_required_text(alt["en"], "alt.en"),
        cantonese_alt=_required_text(alt["yue"], "alt.yue"),
        filename=filename,
        byte_count=expected_size,
        width=expected_width,
        height=expected_height,
        sha256=expected_digest,
        image_path=image_path,
    )


def read_png_dimensions(payload: bytes) -> tuple[int, int]:
    """Validate the PNG signature/IHDR and return its positive dimensions."""

    if len(payload) < 33 or payload[:8] != PNG_SIGNATURE:
        raise ValueError("image is not a PNG")
    length = struct.unpack(">I", payload[8:12])[0]
    if length != 13 or payload[12:16] != b"IHDR":
        raise ValueError("PNG has no canonical IHDR")
    expected_crc = struct.unpack(">I", payload[29:33])[0]
    if zlib.crc32(payload[12:29]) & 0xFFFFFFFF != expected_crc:
        raise ValueError("PNG IHDR checksum is invalid")
    width, height = struct.unpack(">II", payload[16:24])
    if width <= 0 or height <= 0:
        raise ValueError("PNG dimensions must be positive")
    return width, height
