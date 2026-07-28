"""Cheap-LFS-aware native Git wrapper contracts."""

from __future__ import annotations

import hashlib
from collections.abc import Collection, Sequence
from io import StringIO
from pathlib import Path
from types import SimpleNamespace

import pytest

import desktop_material_tui.cli as cli_module
from desktop_material_tui.application.cheap_lfs import CheapLfsError
from desktop_material_tui.application.git_command_wrapper import (
    GitCommandWrapper,
    GitWrapperPhase,
    GitWrapperReport,
    _IndexedPointer,
)
from desktop_material_tui.domain.cheap_lfs import (
    CHEAP_LFS_POINTER_VERSION,
    CheapLfsPointer,
    serialize_cheap_lfs_pointer,
)
from desktop_material_tui.domain.models import GitCommandResult


class _Runner:
    def __init__(self, repository: Path, *, candidates: str = "", pull_exit_code: int = 0) -> None:
        self.repository = repository
        self.candidates = candidates
        self.pull_exit_code = pull_exit_code
        self.calls: list[tuple[str, ...]] = []
        self.cwd_calls: list[Path] = []

    def run(
        self,
        args: Sequence[str],
        *,
        cwd: Path,
        timeout: float | None = None,
        input_data: str | bytes | None = None,
        allowed_exit_codes: Collection[int] = (0,),
    ) -> GitCommandResult:
        del timeout, input_data, allowed_exit_codes
        argv = tuple(args)
        self.calls.append(argv)
        self.cwd_calls.append(cwd)
        exit_code = 0
        stdout = ""
        stderr = ""
        if argv[:3] == ("rev-parse", "--path-format=absolute", "--show-toplevel"):
            stdout = f"{self.repository}\n"
        elif argv[:2] == ("ls-files", "-z"):
            stdout = self.candidates
        elif "push" in argv and "--porcelain" in argv:
            stdout = "=\trefs/heads/main:refs/heads/main\t[up to date]\n"
        elif argv[:2] == ("rev-list", "--objects"):
            stdout = ""
        elif argv and argv[-1] == "pull":
            exit_code = self.pull_exit_code
            stderr = "local changes would be overwritten\n" if exit_code else ""
        return GitCommandResult(("git", *argv), cwd, exit_code, stdout, stderr, 0.0)


def _pointer(payload: bytes) -> CheapLfsPointer:
    return CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload.bin",
        len(payload),
        hashlib.sha256(payload).hexdigest(),
    )


def test_passthrough_preserves_native_global_options(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("-c", "protocol.version=2", "status", "--short"))

    assert report.exit_code == 0
    assert report.phases[0].name == "git.status"
    assert runner.calls[-1] == ("-c", "protocol.version=2", "status", "--short")


def test_passthrough_preserves_non_repository_subdirectory_cwd(tmp_path: Path) -> None:
    subdirectory = tmp_path / "nested"
    subdirectory.mkdir()
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(subdirectory, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("-C", "..", "status", "--short", "."))

    assert report.exit_code == 0
    assert runner.calls == [("-C", "..", "status", "--short", ".")]
    assert runner.cwd_calls == [subdirectory.resolve()]


def test_real_passthrough_can_initialize_from_non_repository(tmp_path: Path) -> None:
    wrapper = GitCommandWrapper(tmp_path)

    report = wrapper.run(("init", "created"))

    assert report.exit_code == 0
    assert (tmp_path / "created" / ".git").is_dir()


def test_exact_push_help_is_passthrough_without_repository_resolution(
    tmp_path: Path,
) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "--help"))

    assert report.exit_code == 0
    assert runner.calls == [("push", "--help")]


@pytest.mark.parametrize("option_value", ["-h", "--help", "--version"])
def test_push_option_values_named_like_help_do_not_bypass_preflight(
    tmp_path: Path,
    option_value: str,
) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "-o", option_value))

    push_calls = [call for call in runner.calls if "push" in call]
    assert report.exit_code == 0
    assert [phase.name for phase in report.phases] == [
        "git.push-dry-run",
        "cheap-lfs.preflight",
        "git.push",
    ]
    assert push_calls[-1] == ("push", "-o", option_value)
    assert "--dry-run" in push_calls[0]
    assert "--porcelain" in push_calls[0]
    assert "--no-quiet" in push_calls[0]


@pytest.mark.parametrize(
    "option",
    ["--push-opt", "--receive-p", "--rep"],
)
def test_abbreviated_push_options_consume_help_shaped_values(
    tmp_path: Path,
    option: str,
) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", option, "--help"))

    assert report.exit_code == 0
    assert any(phase.name == "cheap-lfs.preflight" for phase in report.phases)
    assert runner.calls[-1] == ("push", option, "--help")


def test_push_preview_forces_parseable_output_after_quiet(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "--quiet", "--dry-run"))

    preview = next(call for call in runner.calls if "push" in call)
    assert report.exit_code == 0
    assert report.dry_run is True
    assert preview[-3:] == ("--dry-run", "--porcelain", "--no-quiet")


def test_push_preview_inserts_safety_flags_before_option_terminator(
    tmp_path: Path,
) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "origin", "--", "main"))

    preview = next(call for call in runner.calls if "--porcelain" in call)
    delimiter = preview.index("--")
    assert report.exit_code == 0
    assert preview[delimiter - 3 : delimiter] == (
        "--dry-run",
        "--porcelain",
        "--no-quiet",
    )
    assert preview[delimiter + 1 :] == ("main",)
    assert runner.calls[-1] == ("push", "origin", "--", "main")


def test_push_missing_clustered_option_value_fails_before_git_push(
    tmp_path: Path,
) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "-qo"))

    assert report.exit_code == 3
    assert report.phases[-1].state == "failed"
    assert "requires a value" in report.phases[-1].detail
    assert not any("push" in call for call in runner.calls)


def test_push_rejects_recursive_submodule_publication_before_preview(
    tmp_path: Path,
) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "--recurse-submodules=on-demand"))

    assert report.exit_code == 3
    assert report.phases[-1].state == "failed"
    assert "submodule histories" in report.phases[-1].detail
    assert not any("push" in call for call in runner.calls)


def test_push_fails_closed_when_porcelain_has_no_ref_status(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)
    original_run = runner.run

    def run_without_status(
        args: Sequence[str],
        **kwargs: object,
    ) -> GitCommandResult:
        result = original_run(args, **kwargs)  # type: ignore[arg-type]
        if "push" in tuple(args) and "--porcelain" in tuple(args):
            return GitCommandResult(result.argv, result.cwd, 0, "Done\n", "", 0.0)
        return result

    runner.run = run_without_status  # type: ignore[method-assign]
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "--dry-run"))

    assert report.exit_code == 3
    assert report.phases[-1].name == "cheap-lfs.preflight"
    assert report.phases[-1].state == "failed"
    assert "no parseable porcelain" in report.phases[-1].detail


def test_push_dry_run_is_non_mutating_and_does_not_fetch_pointer_payloads(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)

    def unexpected_service(_repository: Path) -> object:
        raise AssertionError("push preflight must not contact or populate Cheap LFS cache")

    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=runner,  # type: ignore[arg-type]
        cheap_lfs_factory=unexpected_service,  # type: ignore[arg-type]
        automatic_pin_threshold=10,
    )

    report = wrapper.run(("push", "--dry-run", "origin", "main"))

    assert report.exit_code == 0
    assert report.dry_run is True
    assert all(call.count("push") == 0 or "--porcelain" in call for call in runner.calls)
    assert report.phases[-1].state == "planned"


def test_push_blocks_oversized_working_candidate(tmp_path: Path) -> None:
    candidate = tmp_path / "raw.bin"
    candidate.write_bytes(b"x" * 11)
    runner = _Runner(tmp_path, candidates="raw.bin\x00")
    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=runner,  # type: ignore[arg-type]
        automatic_pin_threshold=10,
    )

    report = wrapper.run(("push", "origin", "main"))

    assert report.exit_code == 3
    assert [(item.path, item.size_in_bytes) for item in report.blocked_working_files] == [
        ("raw.bin", 11)
    ]
    assert not any(call == ("push", "origin", "main") for call in runner.calls)


def test_push_blocks_oversized_source_history_blob(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)

    def run_with_blob(
        args: Sequence[str],
        **kwargs: object,
    ) -> GitCommandResult:
        result = _Runner.run(runner, args, **kwargs)  # type: ignore[arg-type]
        if "push" in tuple(args) and "--porcelain" in tuple(args):
            return GitCommandResult(
                result.argv,
                result.cwd,
                0,
                " \trefs/heads/main:refs/heads/main\t1111111..2222222\n",
                "",
                0.0,
            )
        if tuple(args)[:2] == ("rev-list", "--objects"):
            return GitCommandResult(result.argv, result.cwd, 0, "deadbeef large.bin\n", "", 0.0)
        if tuple(args)[:2] == (
            "cat-file",
            "--batch-check=%(objectname) %(objecttype) %(objectsize)",
        ):
            return GitCommandResult(result.argv, result.cwd, 0, "deadbeef blob 11\n", "", 0.0)
        return result

    runner.run = run_with_blob  # type: ignore[method-assign]
    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=runner,  # type: ignore[arg-type]
        automatic_pin_threshold=10,
    )

    report = wrapper.run(("push", "origin", "main"))

    assert report.exit_code == 3
    assert [(item.path, item.size_in_bytes) for item in report.blocked_blobs] == [("large.bin", 11)]
    assert ("rev-list", "--objects", "refs/heads/main") in runner.calls


def test_push_excludes_remote_base_observed_by_porcelain(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)
    remote_base = "1" * 40

    def run_with_remote_base(
        args: Sequence[str],
        **kwargs: object,
    ) -> GitCommandResult:
        result = _Runner.run(runner, args, **kwargs)  # type: ignore[arg-type]
        argv = tuple(args)
        if "push" in argv and "--porcelain" in argv:
            return GitCommandResult(
                result.argv,
                result.cwd,
                0,
                " \trefs/heads/main:refs/heads/main\t1111111..2222222\n",
                "",
                0.0,
            )
        if argv == ("rev-parse", "--verify", "1111111^{object}"):
            return GitCommandResult(result.argv, result.cwd, 0, f"{remote_base}\n", "", 0.0)
        return result

    runner.run = run_with_remote_base  # type: ignore[method-assign]
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("push", "--dry-run", "origin", "main"))

    assert report.exit_code == 0
    assert (
        "rev-list",
        "--objects",
        "refs/heads/main",
        "--not",
        remote_base,
    ) in runner.calls


def test_push_hash_verifies_materialized_payload_when_index_is_pointer(tmp_path: Path) -> None:
    payload = b"materialized"
    (tmp_path / "payload.bin").write_bytes(payload)
    runner = _Runner(tmp_path, candidates="payload.bin\x00")
    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=runner,  # type: ignore[arg-type]
        automatic_pin_threshold=10,
    )
    wrapper._indexed_pointers = lambda: (_IndexedPointer("payload.bin", _pointer(payload)),)  # type: ignore[method-assign]

    report = wrapper.run(("push", "--dry-run"))

    assert report.exit_code == 0
    assert report.already_materialized_paths == ("payload.bin",)


def test_push_accepts_working_pointer_identical_to_index(tmp_path: Path) -> None:
    payload = b"pointer payload"
    pointer = _pointer(payload)
    (tmp_path / "payload.bin").write_text(
        serialize_cheap_lfs_pointer(pointer),
        encoding="utf-8",
    )
    runner = _Runner(tmp_path, candidates="payload.bin\x00")
    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=runner,  # type: ignore[arg-type]
        automatic_pin_threshold=10,
    )
    wrapper._indexed_pointers = lambda: (_IndexedPointer("payload.bin", pointer),)  # type: ignore[method-assign]

    report = wrapper.run(("push", "--dry-run"))

    assert report.exit_code == 0
    assert report.already_materialized_paths == ()
    assert report.phases[-2].name == "cheap-lfs.preflight"
    assert report.phases[-2].state == "succeeded"


@pytest.mark.parametrize(
    "arguments",
    [
        ("-C", "other", "push"),
        ("-c", "core.worktree=other", "pull"),
        ("-ccore.worktree=other", "push"),
        ("--git-dir=.git", "pull"),
        ("--namespace=preview", "push"),
    ],
)
def test_push_pull_refuse_repository_changing_native_globals(
    tmp_path: Path,
    arguments: tuple[str, ...],
) -> None:
    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=_Runner(tmp_path),  # type: ignore[arg-type]
    )

    with pytest.raises(CheapLfsError, match=r"github -C PATH"):
        wrapper.run(arguments)


def test_pull_restores_canonical_pointer_from_cache(tmp_path: Path) -> None:
    payload = b"payload"
    pointer = _pointer(payload)
    (tmp_path / "payload.bin").write_text(serialize_cheap_lfs_pointer(pointer), encoding="utf-8")
    runner = _Runner(tmp_path)
    restored: list[str] = []

    class _CacheService:
        def preview_restore(self, path: str) -> str:
            return path

        def restore(self, plan: str, *, confirmed: bool) -> None:
            assert confirmed is True
            restored.append(plan)

    wrapper = GitCommandWrapper(
        tmp_path,
        git_runner=runner,  # type: ignore[arg-type]
        cheap_lfs_factory=lambda _repository: _CacheService(),  # type: ignore[arg-type]
    )
    wrapper._indexed_pointers = lambda: (_IndexedPointer("payload.bin", pointer),)  # type: ignore[method-assign]

    report = wrapper.run(("pull",))

    assert report.exit_code == 0
    assert restored == ["payload.bin"]
    assert report.restored_paths == ("payload.bin",)


def test_pull_failure_names_materialized_payload_without_overwriting_it(tmp_path: Path) -> None:
    payload = b"materialized"
    path = tmp_path / "payload.bin"
    path.write_bytes(payload)
    runner = _Runner(tmp_path, pull_exit_code=1)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]
    wrapper._indexed_pointers = lambda: (_IndexedPointer("payload.bin", _pointer(payload)),)  # type: ignore[method-assign]

    report = wrapper.run(("pull",))

    assert report.exit_code == 1
    assert path.read_bytes() == payload
    assert "They were not overwritten" in report.phases[-1].detail


def test_pull_short_n_keeps_native_no_stat_semantics(tmp_path: Path) -> None:
    runner = _Runner(tmp_path)
    wrapper = GitCommandWrapper(tmp_path, git_runner=runner)  # type: ignore[arg-type]

    report = wrapper.run(("pull", "-n"))

    assert report.exit_code == 0
    assert report.dry_run is False
    assert ("pull", "-n") in runner.calls
    assert report.phases[0].name == "git.pull"
    assert report.phases[0].state == "succeeded"


@pytest.mark.parametrize(
    ("argv", "expected"),
    [
        (
            ("push", "--force-with-lease", "origin", "main"),
            ("push", "--force-with-lease", "origin", "main"),
        ),
        (("pull", "--rebase"), ("pull", "--rebase")),
        (
            ("git", "-c", "protocol.version=2", "status", "--short"),
            ("-c", "protocol.version=2", "status", "--short"),
        ),
    ],
)
def test_cli_aliases_and_native_passthrough_keep_raw_argv(
    argv: tuple[str, ...],
    expected: tuple[str, ...],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[str, ...]] = []

    class _Wrapper:
        def __init__(self, _repository: str) -> None:
            pass

        def run(self, arguments: Sequence[str]) -> GitWrapperReport:
            seen.append(tuple(arguments))
            return GitWrapperReport(
                ("git", *arguments),
                0,
                False,
                (GitWrapperPhase("git.status", "succeeded"),),
            )

    monkeypatch.setattr(cli_module, "GitCommandWrapper", _Wrapper)
    preferences = SimpleNamespace(
        language=SimpleNamespace(mode="english", english_funny_level=1, cantonese_funny_level=1)
    )

    def load_preferences() -> object:
        return preferences

    monkeypatch.setattr(cli_module, "_load_preferences", load_preferences)

    assert cli_module.main(argv, stdout=StringIO(), stderr=StringIO()) == 0
    assert seen == [expected]
