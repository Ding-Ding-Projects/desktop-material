"""Parser coverage for stable advanced Git formats."""

from __future__ import annotations

from datetime import timedelta

from desktop_material_tui.infrastructure.git.advanced import (
    parse_reflog,
    parse_submodule_status,
    parse_worktree_porcelain,
)


def test_parse_nul_delimited_worktrees_with_states() -> None:
    output = (
        "worktree /repo\0HEAD abcdef012345\0branch refs/heads/main\0\0"
        "worktree /repo feature\0HEAD 123456789abc\0detached\0"
        "locked maintenance\0prunable missing folder\0\0"
    )

    records = parse_worktree_porcelain(output)

    assert len(records) == 2
    assert records[0].display_branch == "main"
    assert records[1].path.as_posix() == "/repo feature"
    assert records[1].detached
    assert records[1].locked_reason == "maintenance"
    assert records[1].prunable_reason == "missing folder"


def test_parse_submodules_keeps_spaces_and_description() -> None:
    output = (
        " abcdef0123456789 modules/ready (heads/main)\n"
        "-123456789abcdef0 modules/not ready\n"
        "+fedcba9876543210 modules/path with spaces (v1.2-3-gfedcba9)\n"
    )

    records = parse_submodule_status(output)

    assert [record.path for record in records] == [
        "modules/ready",
        "modules/not ready",
        "modules/path with spaces",
    ]
    assert records[0].initialized
    assert not records[1].initialized
    assert records[2].description == "v1.2-3-gfedcba9"


def test_parse_reflog_handles_bad_dates_without_dropping_recovery_entry() -> None:
    output = (
        "abcdef\x1fHEAD@{0}\x1fcommit: useful\x1f2026-07-27T12:30:00Z\x1e"
        "123456\x1fHEAD@{1}\x1freset: moving\x1fnot-a-date\x1e"
    )

    records = parse_reflog(output)

    assert [record.selector for record in records] == ["HEAD@{0}", "HEAD@{1}"]
    assert records[0].authored_at is not None
    assert records[0].authored_at.utcoffset() == timedelta(0)
    assert records[1].authored_at is None
