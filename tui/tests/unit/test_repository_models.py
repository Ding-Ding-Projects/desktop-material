from desktop_material_tui.domain.models import FileChange, RepositoryStatus


def test_repository_status_counts_ignore_ignored_files() -> None:
    status = RepositoryStatus(
        branch_oid=None,
        branch_head="main",
        upstream=None,
        ahead=0,
        behind=0,
        changes=(
            FileChange("staged.txt", "M", ".", "1"),
            FileChange("working.txt", ".", "M", "1"),
            FileChange("new.txt", "?", "?", "?"),
            FileChange("ignored.txt", "!", "!", "!"),
            FileChange("conflict.txt", "U", "U", "u"),
        ),
        is_initial=True,
    )

    assert status.staged_count == 2
    assert status.unstaged_count == 3
    assert status.untracked_count == 1
    assert status.conflicted_count == 1
    assert not status.is_clean
