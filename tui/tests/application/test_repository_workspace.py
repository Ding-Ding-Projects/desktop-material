from __future__ import annotations

import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from desktop_material_tui.application.repository_workspace import (
    MAX_SESSION_BYTES,
    SESSION_FORMAT,
    SESSION_FORMAT_VERSION,
    Arrangement,
    CloseMode,
    RepositoryWorkspaceError,
    RepositoryWorkspaceService,
)
from desktop_material_tui.application.search import RegexFlags, SearchMode
from desktop_material_tui.infrastructure.persistence import RepositoryRecord, SQLiteStore


@pytest.fixture
def workspace(tmp_path: Path) -> tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]]:
    database = SQLiteStore(tmp_path / "state.sqlite3")
    paths = [tmp_path / name for name in ("alpha", "beta", "gamma", "delta")]
    for path in paths:
        path.mkdir()
        database.save_repository(RepositoryRecord(path=path))
    service = RepositoryWorkspaceService(database, "test profile")
    try:
        yield service, database, paths
    finally:
        database.close()


def test_workspace_session_closes_tabs_without_deleting_records_or_directories(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, database, paths = workspace

    assert {record.path for record in service.snapshot().records} == set(paths)
    service.close_repositories(paths[1:])

    assert [record.path for record in service.snapshot().records] == [paths[0]]
    assert database.get_repository(paths[1]) is not None
    assert all(path.is_dir() for path in paths)
    assert database.get_session(service.session_id) is not None


def test_alias_pin_favorite_group_collapse_hide_and_restore_are_persistent(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, database, paths = workspace

    service.set_alias(paths[0], "  Production   API  ")
    service.set_favorite(paths[0], True)
    service.set_group(paths[0], "  Deploys  ")
    service.set_group(paths[1], "Deploys")
    service.set_pinned(paths[0], True)
    collapsed = service.set_group_collapsed("Deploys", True)

    first = database.get_repository(paths[0])
    second = database.get_repository(paths[1])
    assert first is not None
    assert second is not None
    assert first.alias == "Production API"
    assert first.favorite
    assert first.pinned
    assert second.pinned
    assert first.group_name == second.group_name == "Deploys"
    assert collapsed.collapsed_groups == frozenset({"Deploys"})

    hidden = service.set_hidden(paths[1], True)
    assert paths[1] not in {record.path for record in hidden.records}
    assert paths[1].is_dir()
    assert database.get_repository(paths[1]).hidden  # type: ignore[union-attr]
    service.set_hidden(paths[1], False)
    assert not database.get_repository(paths[1]).hidden  # type: ignore[union-attr]


def test_groups_cannot_cross_the_pin_boundary(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, _database, paths = workspace
    service.set_pinned(paths[0], True)
    service.set_group(paths[0], "Pinned")

    with pytest.raises(RepositoryWorkspaceError, match="cannot cross"):
        service.set_group(paths[1], "Pinned")


def test_manual_and_named_arrangements_keep_groups_as_stable_blocks(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, database, paths = workspace
    service.set_alias(paths[0], "Zulu")
    service.set_alias(paths[1], "Alpha")
    service.set_alias(paths[2], "Beta")
    service.set_group(paths[1], "Pair")
    service.set_group(paths[2], "Pair")
    service.set_favorite(paths[3], True)

    moved = service.move(paths[1], -1)
    moved_paths = [record.path for record in moved.records]
    assert moved_paths.index(paths[2]) == moved_paths.index(paths[1]) + 1

    arranged = service.arrange(Arrangement.LABEL_ASCENDING)
    labels = [record.alias or record.path.name for record in arranged.records]
    assert labels == ["Alpha", "Beta", "delta", "Zulu"]
    assert [record.group_name for record in arranged.records[:2]] == ["Pair", "Pair"]

    now = datetime.now(timezone.utc)
    for index, path in enumerate(paths):
        record = database.get_repository(path)
        assert record is not None
        database.save_repository(replace(record, last_opened_at=now + timedelta(minutes=index)))
    newest = service.arrange(Arrangement.NEWEST_OPENED)
    assert newest.records[0].path == paths[3]


def test_search_and_strip_projection_cover_alias_groups_and_overflow(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, _database, paths = workspace
    service.set_alias(paths[0], "Primary API")
    service.set_group(paths[1], "Services")
    service.set_group(paths[2], "Services")
    service.set_group_collapsed("Services", True)
    service.set_pinned(paths[0], True)
    service.set_active(paths[3])

    literal = service.search("primary")
    regex = service.search(
        r"Services|delta$",
        mode=SearchMode.REGEX,
        flags=RegexFlags(ignore_case=True),
    )
    projection = service.strip_projection(2)

    assert [record.path for record in literal.items] == [paths[0]]
    assert {record.path for record in regex.items} == {paths[1], paths[2], paths[3]}
    assert any(entry.pinned and entry.path == paths[0] for entry in projection.visible)
    assert any(entry.path == paths[3] for entry in projection.visible)
    assert projection.overflow_repository_count == 2


def test_bulk_close_preview_is_bounded_regex_safe_and_protects_work(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, database, paths = workspace
    service.set_alias(paths[0], "api-one")
    service.set_alias(paths[1], "api-two")
    service.set_pinned(paths[0], True)

    preview = service.preview_close(
        r"^api-",
        search_mode=SearchMode.REGEX,
        close_mode=CloseMode.CONTAINING,
        protected_paths=(paths[1],),
    )
    assert not preview.can_confirm
    assert [record.path for record in preview.protected_pinned] == [paths[0]]
    assert [record.path for record in preview.protected_unsaved] == [paths[1]]
    assert not preview.closing

    allowed = service.preview_close(
        r"^api-",
        search_mode=SearchMode.REGEX,
        include_pinned=True,
    )
    assert allowed.can_confirm
    service.close_repositories(record.path for record in allowed.closing)
    assert paths[0].is_dir()
    assert paths[1].is_dir()
    assert database.get_repository(paths[0]) is not None

    invalid = service.preview_close("(", search_mode=SearchMode.REGEX)
    empty_inverse = service.preview_close(
        "does-not-match",
        close_mode=CloseMode.NOT_CONTAINING,
    )
    assert invalid.error is not None
    assert "Invalid" in invalid.error
    assert empty_inverse.error == "No tab matches this query; nothing can be confirmed."


def test_portable_session_round_trip_preserves_destination_groups(
    tmp_path: Path,
) -> None:
    source_database = SQLiteStore(tmp_path / "source.sqlite3")
    destination_database = SQLiteStore(tmp_path / "destination.sqlite3")
    alpha = tmp_path / "alpha"
    beta = tmp_path / "beta"
    alpha.mkdir()
    beta.mkdir()
    try:
        source = RepositoryWorkspaceService(source_database, "source")
        source_database.save_repository(
            RepositoryRecord(
                path=alpha,
                alias="Source alias",
                pinned=True,
                favorite=True,
                group_name="Source-only group",
            )
        )
        source.close_repositories(())
        payload = source.export_payload()
        assert "group_name" not in json.dumps(payload)

        destination = RepositoryWorkspaceService(destination_database, "destination")
        destination_database.save_repository(
            RepositoryRecord(path=alpha, group_name="Destination group", pinned=False)
        )
        destination_database.save_repository(RepositoryRecord(path=beta))
        destination.close_repositories(())
        result = destination.import_payload(payload, merge=False)

        imported = destination_database.get_repository(alpha)
        assert imported is not None
        assert imported.group_name == "Destination group"
        assert not imported.pinned
        assert imported.favorite
        assert imported.alias == "Source alias"
        assert [record.path for record in destination.snapshot().records] == [alpha]
        assert result.skipped_paths == ()
    finally:
        source_database.close()
        destination_database.close()


def test_session_import_rejects_oversized_and_malformed_payloads(
    workspace: tuple[RepositoryWorkspaceService, SQLiteStore, list[Path]],
) -> None:
    service, _database, _paths = workspace
    with pytest.raises(RepositoryWorkspaceError, match="size limit"):
        service.import_payload(b"x" * (MAX_SESSION_BYTES + 1))
    with pytest.raises(RepositoryWorkspaceError, match="format or version"):
        service.import_payload({"format": SESSION_FORMAT, "version": 99, "tabs": []})
    with pytest.raises(RepositoryWorkspaceError, match="JSON"):
        service.import_payload("not json")
    with pytest.raises(RepositoryWorkspaceError, match="size limit"):
        service.import_payload(
            {
                "format": SESSION_FORMAT,
                "version": SESSION_FORMAT_VERSION,
                "tabs": [],
                "unknown": "x" * MAX_SESSION_BYTES,
            }
        )

    payload = {
        "format": SESSION_FORMAT,
        "version": SESSION_FORMAT_VERSION,
        "tabs": [{"path": "x" * 4_097}],
    }
    with pytest.raises(RepositoryWorkspaceError, match="bounded path"):
        service.import_payload(payload)
