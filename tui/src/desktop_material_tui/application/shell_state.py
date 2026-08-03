"""Profile-local application-shell preferences stored beside terminal sessions."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Literal, cast

from ..infrastructure.persistence import SessionRecord, SQLiteStore

PaletteSize = Literal["card", "full"]


@dataclass(frozen=True)
class ShellPreferences:
    palette_size: PaletteSize = "card"


class ShellStateService:
    """Preserve shell choices without adding another persistence schema."""

    def __init__(self, database: SQLiteStore, profile: str = "local") -> None:
        normalized = " ".join(profile.split())[:128] or "local"
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
        self.database = database
        self.profile = normalized
        self.session_id = f"repository-tabs-{digest}"

    def load(self) -> ShellPreferences:
        session = self.database.get_session(self.session_id)
        if session is None:
            return ShellPreferences()
        raw = session.state.get("shell_preferences")
        if not isinstance(raw, Mapping):
            return ShellPreferences()
        size = raw.get("palette_size")
        return ShellPreferences(
            palette_size=cast(PaletteSize, size) if size in {"card", "full"} else "card"
        )

    def save_palette_size(self, value: str) -> ShellPreferences:
        if value not in {"card", "full"}:
            raise ValueError("Command palette size must be card or full.")
        palette_size = cast(PaletteSize, value)
        existing = self.database.get_session(self.session_id)
        state = dict(existing.state) if existing is not None else {}
        raw_preferences = state.get("shell_preferences")
        preferences = dict(raw_preferences) if isinstance(raw_preferences, Mapping) else {}
        preferences["palette_size"] = palette_size
        state["shell_preferences"] = preferences
        session = (
            replace(existing, state=state)
            if existing is not None
            else SessionRecord(
                session_id=self.session_id,
                name=f"Repository tabs · {self.profile}",
                state=state,
            )
        )
        self.database.save_session(session)
        return ShellPreferences(palette_size=palette_size)
