from datetime import timedelta, timezone

import pytest

from desktop_material_tui.domain.errors import GitParseError
from desktop_material_tui.infrastructure.git.porcelain import (
    parse_branches,
    parse_history,
    parse_porcelain_v2,
    parse_stashes,
    parse_tags,
)

OID_A = "a" * 40
OID_B = "b" * 40
OID_C = "c" * 40


def test_parse_porcelain_v2_preserves_paths_and_branch_metadata() -> None:
    output = (
        f"# branch.oid {OID_A}\n"
        "# branch.head main\n"
        "# branch.upstream origin/main\n"
        "# branch.ab +2 -1\n"
        f"1 M. N... 100644 100644 100644 {OID_A} {OID_B} tracked file.txt\x00"
        "? untracked\nname.txt\x00"
        f"2 R. N... 100644 100644 100644 {OID_A} {OID_B} R100 new name.txt\x00"
        "old name.txt\x00"
    )

    status = parse_porcelain_v2(output)

    assert status.branch_oid == OID_A
    assert status.branch_head == "main"
    assert status.upstream == "origin/main"
    assert (status.ahead, status.behind) == (2, 1)
    assert status.staged_count == 2
    assert status.untracked_count == 1
    assert status.changes[1].path == "untracked\nname.txt"
    assert status.changes[2].original_path == "old name.txt"
    assert status.changes[2].score == "R100"


def test_parse_initial_and_detached_status() -> None:
    initial = parse_porcelain_v2("# branch.oid (initial)\n# branch.head main\n? first.txt\x00")
    detached = parse_porcelain_v2(f"# branch.oid {OID_A}\n# branch.head (detached)\n")

    assert initial.is_initial
    assert initial.branch_oid is None
    assert not initial.is_clean
    assert detached.is_detached
    assert detached.branch_head is None


def test_parse_unmerged_record() -> None:
    status = parse_porcelain_v2(
        f"u UU N... 100644 100644 100644 100644 {OID_A} {OID_B} {OID_C} conflict.txt\x00"
    )

    assert status.conflicted_count == 1
    assert status.changes[0].is_conflicted


def test_malformed_status_raises_structured_error() -> None:
    with pytest.raises(GitParseError, match="ordinary record"):
        parse_porcelain_v2("1 M. too-short\x00")


def test_parse_history_records() -> None:
    output = (
        f"{OID_A}\x00{OID_B} {OID_C}\x00Ada\x00ada@example.test\x001700000000"
        "\x002023-11-14T22:13:20+00:00\x00Subject\x00Body line\n\x00\n"
        f"{OID_B}\x00\x00Bob\x00bob@example.test\x001699999000"
        "\x002023-11-14T21:56:40+00:00\x00Root\x00\x00\n"
    )

    commits = parse_history(output)

    assert len(commits) == 2
    assert commits[0].parents == (OID_B, OID_C)
    assert commits[0].body == "Body line"
    assert commits[0].authored_at.tzinfo == timezone.utc
    assert commits[1].parents == ()


@pytest.mark.parametrize(
    ("iso_date", "expected_offset"),
    [
        ("2023-11-14T22:13:20Z", timedelta(0)),
        ("2023-11-14T22:13:20+05:30", timedelta(hours=5, minutes=30)),
    ],
)
def test_parse_history_accepts_utc_z_and_preserves_numeric_offsets(
    iso_date: str,
    expected_offset: timedelta,
) -> None:
    output = (
        f"{OID_A}\x00\x00Ada\x00ada@example.test\x001700000000\x00{iso_date}\x00Subject\x00\x00\n"
    )

    commit = parse_history(output)[0]

    assert commit.authored_at.utcoffset() == expected_offset


def test_parse_history_rejects_malformed_iso_timestamp() -> None:
    output = (
        f"{OID_A}\x00\x00Ada\x00ada@example.test\x001700000000"
        "\x00definitely-not-a-timestamp\x00Subject\x00\x00\n"
    )

    with pytest.raises(GitParseError, match="invalid ISO timestamp"):
        parse_history(output)


def test_parse_branches_filters_symbolic_remote_head() -> None:
    output = (
        f"refs/heads/main\x00main\x00{OID_A}\x00origin/main\x00ahead 2, behind 1"
        "\x00*\x002023-11-14T22:13:20+00:00\x00\x00\n"
        f"refs/remotes/origin/main\x00origin/main\x00{OID_B}\x00\x00\x00 \x00"
        "2023-11-14T22:13:20+00:00\x00\x00\n"
        f"refs/heads/gone\x00gone\x00{OID_C}\x00origin/gone\x00gone\x00 \x00"
        "2023-11-14T22:13:20+00:00\x00\x00\n"
        f"refs/remotes/origin/HEAD\x00origin/HEAD\x00{OID_B}\x00\x00\x00 \x00"
        "2023-11-14T22:13:20+00:00\x00refs/remotes/origin/main\x00\n"
    )

    branches = parse_branches(output)

    assert [branch.name for branch in branches] == ["main", "origin/main", "gone"]
    assert branches[0].is_current
    assert (branches[0].ahead, branches[0].behind) == (2, 1)
    assert branches[1].is_remote
    assert not branches[0].upstream_gone
    assert branches[2].upstream_gone


def test_parse_stashes_and_tags() -> None:
    stash_output = (
        f"stash@{{0}}\x00{OID_A}\x00Ada\x00ada@example.test\x00"
        "2023-11-14T22:13:20+00:00\x00On main: work\x00\n"
    )
    tag_output = (
        f"v1.0\x00{OID_A}\x00tag\x00{OID_B}\x00commit\x00Release 1.0\x00"
        "2023-11-14T22:13:20+00:00\x00\n"
        f"lightweight\x00{OID_C}\x00commit\x00\x00\x00Root\x00"
        "2023-11-14T22:13:20+00:00\x00\n"
    )

    stash = parse_stashes(stash_output)[0]
    tags = parse_tags(tag_output)

    assert stash.index == 0
    assert stash.message == "On main: work"
    assert tags[0].target_oid == OID_B
    assert tags[0].target_type == "commit"
    assert tags[1].target_oid == OID_C
