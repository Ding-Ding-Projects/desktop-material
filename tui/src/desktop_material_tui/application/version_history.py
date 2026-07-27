"""Application facade for isolated profile/settings version history."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from desktop_material_tui.infrastructure.persistence import (
    GitProfileHistory,
    ProfileRevision,
    ProfileSnapshot,
    XDGPaths,
)


@dataclass(frozen=True)
class VersionEntry:
    revision: str
    created_at: datetime
    label: str


@dataclass(frozen=True)
class VersionedSettings:
    settings: Mapping[str, Any]
    profile: Mapping[str, Any]


class VersionHistoryService:
    """Record, inspect, diff, and restore complete settings snapshots."""

    def __init__(
        self,
        paths: XDGPaths,
        profile_id: str = "local",
        *,
        git_binary: str = "git",
    ) -> None:
        self.history = GitProfileHistory(
            paths,
            profile_id,
            git_binary=git_binary,
        )

    @property
    def repository_path(self) -> str:
        return str(self.history.repository)

    def record(
        self,
        settings: Mapping[str, Any],
        *,
        label: str,
        profile: Mapping[str, Any] | None = None,
    ) -> VersionEntry:
        return _entry(self.history.record(settings, label=label, profile=profile))

    def list_versions(self, *, limit: int = 100) -> tuple[VersionEntry, ...]:
        return tuple(_entry(revision) for revision in self.history.list_revisions(limit=limit))

    def read(self, revision: str = "HEAD") -> VersionedSettings:
        snapshot = self.history.read(revision)
        return _settings(snapshot)

    def diff(self, older: str, newer: str = "HEAD") -> str:
        return self.history.diff(older, newer)

    def restore(
        self,
        revision: str,
        *,
        label: str | None = None,
    ) -> VersionEntry:
        return _entry(self.history.restore(revision, label=label))


def _entry(revision: ProfileRevision) -> VersionEntry:
    return VersionEntry(
        revision=revision.revision,
        created_at=revision.created_at,
        label=revision.label,
    )


def _settings(snapshot: ProfileSnapshot) -> VersionedSettings:
    return VersionedSettings(settings=snapshot.settings, profile=snapshot.profile)
