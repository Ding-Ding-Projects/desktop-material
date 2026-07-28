"""Native Git passthrough with explicit Cheap LFS push/pull phases."""

from __future__ import annotations

import hashlib
import os
import re
import stat
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from ..domain.cheap_lfs import (
    CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES,
    CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    CheapLfsPointer,
    parse_cheap_lfs_pointer,
    validate_cheap_lfs_tracked_path,
)
from ..domain.errors import GitCommandError
from ..domain.models import GitCommandResult
from ..domain.ports import GitRunner
from ..infrastructure.git.runner import SubprocessGitRunner, redact_git_argument
from .cheap_lfs import CheapLfsError, CheapLfsService
from .path_input import path_from_user_input

_BUFFER_SIZE = 1024 * 1024
_MAX_OUTGOING_OBJECTS = 1_000_000
_ALL_PROCESS_EXIT_CODES = range(-255, 256)
_PUSH_SOURCE_REF = re.compile(r"^(?:HEAD|refs/[^\x00-\x20~^:?*\\[]+)$")
_PUSH_OLD_OBJECT = re.compile(r"\b([0-9a-f]{7,64})\.\.\.?[0-9a-f]{7,64}\b")
_FULL_OBJECT_ID = re.compile(r"^[0-9a-f]{40,64}$")
_PUSH_OPTIONS_WITH_VALUE = frozenset(
    {
        "--exec",
        "--push-option",
        "--receive-pack",
        "--recurse-submodules",
        "--repo",
    }
)
_PUSH_SHORT_OPTIONS_WITH_VALUE = frozenset({"o"})
_PULL_OPTIONS_WITH_VALUE = frozenset(
    {
        "--cleanup",
        "--deepen",
        "--depth",
        "--filter",
        "--jobs",
        "--negotiation-tip",
        "--refmap",
        "--server-option",
        "--shallow-exclude",
        "--shallow-since",
        "--strategy",
        "--strategy-option",
        "--upload-pack",
    }
)
_PULL_SHORT_OPTIONS_WITH_VALUE = frozenset({"X", "j", "o", "s"})
_PULL_SHORT_OPTIONS_WITH_OPTIONAL_ATTACHED_VALUE = frozenset({"S", "r"})


@dataclass(frozen=True)
class GitWrapperPhase:
    """One display-safe phase in a wrapped Git operation."""

    name: str
    state: str
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    detail: str = ""


@dataclass(frozen=True)
class OversizedGitBlob:
    """An outgoing Git blob that must be converted deliberately."""

    oid: str
    path: str
    size_in_bytes: int


@dataclass(frozen=True)
class OversizedWorkingFile:
    """A working-tree payload that would bypass Cheap LFS if committed."""

    path: str
    size_in_bytes: int


@dataclass(frozen=True)
class GitWrapperReport:
    """Structured wrapper result used by human and JSON CLI renderers."""

    command: tuple[str, ...]
    exit_code: int
    dry_run: bool
    phases: tuple[GitWrapperPhase, ...]
    blocked_blobs: tuple[OversizedGitBlob, ...] = ()
    blocked_working_files: tuple[OversizedWorkingFile, ...] = ()
    restored_paths: tuple[str, ...] = ()
    already_materialized_paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class _IndexedPointer:
    relative_path: str
    pointer: CheapLfsPointer


@dataclass(frozen=True)
class _NativeOptionScan:
    """Command-level option positions after Git has consumed option values."""

    option_indices: frozenset[int]
    short_flags: frozenset[tuple[int, str]]
    delimiter_index: int | None = None
    missing_value_option: str | None = None


@dataclass(frozen=True)
class _PushPublication:
    """Source refs and locally provable remote bases from porcelain output."""

    source_refs: tuple[str, ...]
    old_object_names: tuple[str, ...]


class GitCommandWrapper:
    """Pass arbitrary Git argv through and add Cheap LFS push/pull handling.

    The wrapper never installs a ``git`` executable, Git filter, or hook. It
    never changes history, stages files, commits, or uploads provider assets.
    """

    def __init__(
        self,
        repository: str | Path,
        *,
        git_runner: GitRunner | None = None,
        cheap_lfs_factory: Callable[[Path], CheapLfsService] | None = None,
        automatic_pin_threshold: int = CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES,
        network_timeout: float = 3_600.0,
    ) -> None:
        if automatic_pin_threshold < 0:
            raise ValueError("Cheap LFS automatic-pin threshold cannot be negative.")
        if network_timeout <= 0:
            raise ValueError("Git wrapper network timeout must be greater than zero.")
        self._runner = git_runner or SubprocessGitRunner(default_timeout=network_timeout)
        requested = path_from_user_input(repository).resolve()
        if not requested.is_dir():
            raise CheapLfsError(f"Git working directory is not a directory: {requested}")
        self.working_directory = requested
        # Passthrough keeps the exact caller-selected cwd. Protected push/pull
        # resolves the repository root lazily before any Cheap LFS inspection.
        self.repository = requested
        self._repository_is_resolved = False
        self._cheap_lfs_factory = cheap_lfs_factory or CheapLfsService
        self.automatic_pin_threshold = automatic_pin_threshold
        self.network_timeout = float(network_timeout)

    def run(self, arguments: Sequence[str]) -> GitWrapperReport:
        """Run exact Git arguments, intercepting only a leading push or pull."""

        argv = tuple(arguments)
        if any(not isinstance(item, str) or "\x00" in item for item in argv):
            raise ValueError("Git wrapper arguments must be NUL-free strings.")
        command_index, command = self._native_subcommand(argv)
        option_scan: _NativeOptionScan | None = None
        if command in {"push", "pull"} and command_index is not None:
            option_scan = self._scan_command_options(argv, command_index, command)
            if self._is_informational(argv, option_scan) or self._global_is_informational(
                argv[:command_index]
            ):
                return self._passthrough(argv)
            self._ensure_repository_root()
            unsupported_global = self._unsupported_mutating_global(argv[:command_index])
            if unsupported_global is not None:
                raise CheapLfsError(
                    "Cheap LFS push/pull preflight cannot safely mirror native Git "
                    f"global option {unsupported_global!r}. Select the repository "
                    "before the wrapper instead, for example "
                    "`github -C PATH push ...`."
                )
        if command == "push" and command_index is not None and option_scan is not None:
            return self._push(argv, option_scan)
        if command == "pull" and command_index is not None and option_scan is not None:
            return self._pull(argv, option_scan)
        return self._passthrough(argv)

    def _passthrough(self, argv: tuple[str, ...]) -> GitWrapperReport:
        result = self._run_git(argv)
        _, command = self._native_subcommand(argv)
        name = f"git.{command}" if command else "git"
        return GitWrapperReport(
            command=self._safe_command(argv),
            exit_code=result.exit_code,
            dry_run=False,
            phases=(self._result_phase(name, result),),
        )

    def _push(
        self,
        argv: tuple[str, ...],
        option_scan: _NativeOptionScan,
    ) -> GitWrapperReport:
        dry_run = self._is_dry_run(argv, option_scan, command="push")
        phases: list[GitWrapperPhase] = []
        try:
            self._reject_recursive_submodule_push(argv, option_scan)
            preview_args = self._push_preview_args(argv, option_scan)
        except (CheapLfsError, GitCommandError, OSError, ValueError) as error:
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.preflight",
                    "failed",
                    detail=redact_git_argument(str(error)),
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                3,
                dry_run,
                tuple(phases),
            )
        preview = self._run_git(preview_args)
        phases.append(self._result_phase("git.push-dry-run", preview))
        if preview.exit_code != 0:
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.preflight",
                    "skipped",
                    detail="Native Git push dry-run failed; no push was attempted.",
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                preview.exit_code,
                dry_run,
                tuple(phases),
            )

        try:
            indexed = self._indexed_pointers()
            blocked_working_files = self._oversized_working_bypass_files(indexed)
            if blocked_working_files:
                phases.append(
                    GitWrapperPhase(
                        "cheap-lfs.preflight",
                        "failed",
                        detail=(
                            "Push refused: working-tree files strictly above "
                            f"{self.automatic_pin_threshold} bytes are not backed by "
                            "canonical indexed Cheap LFS pointers. Track them with Cheap LFS "
                            "or remove them before pushing."
                        ),
                    )
                )
                return GitWrapperReport(
                    self._safe_command(argv),
                    3,
                    dry_run,
                    tuple(phases),
                    blocked_working_files=blocked_working_files,
                )
            publication = self._parse_push_publication(preview.stdout)
            oversized = self._outgoing_oversized_blobs(publication)
            if oversized:
                detail = (
                    "Push refused: outgoing commits contain Git blobs strictly above "
                    f"{self.automatic_pin_threshold} bytes. Track the listed payloads "
                    "with Cheap LFS, then deliberately rewrite the affected commits; "
                    "this wrapper never rewrites history automatically."
                )
                phases.append(GitWrapperPhase("cheap-lfs.preflight", "failed", detail=detail))
                return GitWrapperReport(
                    self._safe_command(argv),
                    3,
                    dry_run,
                    tuple(phases),
                    blocked_blobs=oversized,
                )
            pointer_count, materialized = self._verify_indexed_pointers_for_push(indexed)
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.preflight",
                    "succeeded",
                    detail=(
                        "Inspected the porcelain publication set and validated "
                        f"{pointer_count} indexed "
                        "canonical pointer(s); "
                        f"{len(materialized)} materialized payload(s) matched index metadata."
                    ),
                )
            )
        except (CheapLfsError, GitCommandError, OSError, ValueError) as error:
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.preflight",
                    "failed",
                    detail=redact_git_argument(str(error)),
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                3,
                dry_run,
                tuple(phases),
            )

        if dry_run:
            phases.append(
                GitWrapperPhase(
                    "git.push",
                    "planned",
                    detail="Native --dry-run completed; no refs were published.",
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                0,
                True,
                tuple(phases),
                already_materialized_paths=materialized,
            )

        result = self._run_git(argv)
        phases.append(self._result_phase("git.push", result))
        return GitWrapperReport(
            self._safe_command(argv),
            result.exit_code,
            False,
            tuple(phases),
            already_materialized_paths=materialized,
        )

    def _pull(
        self,
        argv: tuple[str, ...],
        option_scan: _NativeOptionScan,
    ) -> GitWrapperReport:
        if option_scan.missing_value_option is not None:
            return GitWrapperReport(
                self._safe_command(argv),
                3,
                False,
                (
                    GitWrapperPhase(
                        "cheap-lfs.preflight",
                        "failed",
                        detail=(
                            "Pull refused before execution: native Git option "
                            f"{option_scan.missing_value_option!r} requires a value."
                        ),
                    ),
                ),
            )
        if self._is_dry_run(argv, option_scan, command="pull"):
            return GitWrapperReport(
                self._safe_command(argv),
                0,
                True,
                (
                    GitWrapperPhase(
                        "git.pull",
                        "planned",
                        detail=(
                            "Dry-run requested; native pull and Cheap LFS restoration "
                            "were not executed."
                        ),
                    ),
                ),
            )

        result = self._run_git(argv)
        phases = [self._result_phase("git.pull", result)]
        if result.exit_code != 0:
            materialized = self._materialized_indexed_paths()
            conflict_detail = "Native Git pull failed; no Cheap LFS files were changed."
            if materialized:
                conflict_detail = (
                    "Native Git pull failed while verified materialized Cheap LFS payload(s) "
                    "were present. They were not overwritten. Restore their canonical pointers "
                    "before retrying a pull that may update those paths: " + ", ".join(materialized)
                )
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.restore",
                    "skipped",
                    detail=conflict_detail,
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                result.exit_code,
                False,
                tuple(phases),
            )

        try:
            restored, already_materialized = self._restore_indexed_pointers()
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.restore",
                    "succeeded",
                    detail=(
                        f"Restored {len(restored)} canonical pointer(s); "
                        f"{len(already_materialized)} verified payload(s) were already "
                        "materialized."
                    ),
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                0,
                False,
                tuple(phases),
                restored_paths=restored,
                already_materialized_paths=already_materialized,
            )
        except (CheapLfsError, GitCommandError, OSError, ValueError) as error:
            phases.append(
                GitWrapperPhase(
                    "cheap-lfs.restore",
                    "failed",
                    detail=(
                        "Native Git pull succeeded, but Cheap LFS restoration failed "
                        "without overwriting the conflicting path: "
                        f"{redact_git_argument(str(error))}"
                    ),
                )
            )
            return GitWrapperReport(
                self._safe_command(argv),
                4,
                False,
                tuple(phases),
            )

    def _resolve_root(self, requested: Path) -> Path:
        result = self._runner.run(
            ("rev-parse", "--path-format=absolute", "--show-toplevel"),
            cwd=requested,
            timeout=30.0,
        )
        value = result.stdout.rstrip("\r\n")
        if not value:
            raise CheapLfsError("Git returned an empty working-tree root.")
        root = Path(value).resolve()
        if not root.is_dir():
            raise CheapLfsError(f"Git working-tree root is not a directory: {root}")
        return root

    def _ensure_repository_root(self) -> None:
        if self._repository_is_resolved:
            return
        self.repository = self._resolve_root(self.working_directory)
        self._repository_is_resolved = True

    def _run_git(self, argv: Sequence[str]) -> GitCommandResult:
        return self._runner.run(
            argv,
            cwd=self.working_directory,
            timeout=self.network_timeout,
            allowed_exit_codes=_ALL_PROCESS_EXIT_CODES,
        )

    @staticmethod
    def _is_informational(
        argv: Sequence[str],
        option_scan: _NativeOptionScan,
    ) -> bool:
        for index in option_scan.option_indices:
            if argv[index] in {"-h", "--help", "--version"}:
                return True
        return any(flag == "h" for _index, flag in option_scan.short_flags)

    @staticmethod
    def _global_is_informational(arguments: Sequence[str]) -> bool:
        options_with_value = frozenset(
            {
                "-C",
                "-c",
                "--exec-path",
                "--git-dir",
                "--work-tree",
                "--namespace",
                "--super-prefix",
                "--config-env",
            }
        )
        index = 0
        while index < len(arguments):
            value = arguments[index]
            if value in options_with_value:
                index += 2
                continue
            if value.startswith(("-C", "-c")) and value not in {"-C", "-c"}:
                index += 1
                continue
            if value in {"-h", "--help", "--version"}:
                return True
            index += 1
        return False

    @staticmethod
    def _is_dry_run(
        argv: Sequence[str],
        option_scan: _NativeOptionScan,
        *,
        command: str,
    ) -> bool:
        requested = False
        for index in sorted(option_scan.option_indices):
            value = argv[index]
            if value == "--dry-run":
                requested = True
            elif value == "--no-dry-run":
                requested = False
            elif command == "push" and (value == "-n" or (index, "n") in option_scan.short_flags):
                requested = True
        return requested

    @classmethod
    def _scan_command_options(
        cls,
        argv: Sequence[str],
        command_index: int,
        command: str,
    ) -> _NativeOptionScan:
        if command == "push":
            options_with_value = _PUSH_OPTIONS_WITH_VALUE
            short_options_with_value = _PUSH_SHORT_OPTIONS_WITH_VALUE
            short_options_with_optional_attached_value: frozenset[str] = frozenset()
        else:
            options_with_value = _PULL_OPTIONS_WITH_VALUE
            short_options_with_value = _PULL_SHORT_OPTIONS_WITH_VALUE
            short_options_with_optional_attached_value = (
                _PULL_SHORT_OPTIONS_WITH_OPTIONAL_ATTACHED_VALUE
            )

        option_indices: set[int] = set()
        short_flags: set[tuple[int, str]] = set()
        delimiter_index: int | None = None
        missing_value_option: str | None = None
        index = command_index + 1
        while index < len(argv):
            value = argv[index]
            if value == "--":
                delimiter_index = index
                break
            if value.startswith("--"):
                option_indices.add(index)
                option_name, has_equals, _option_value = value.partition("=")
                requires_separate_value = not has_equals and any(
                    candidate.startswith(option_name) for candidate in options_with_value
                )
                if requires_separate_value:
                    if index + 1 >= len(argv):
                        missing_value_option = value
                        break
                    index += 2
                else:
                    index += 1
                continue
            if value.startswith("-") and value != "-":
                option_indices.add(index)
                characters = value[1:]
                consumes_next = False
                for offset, character in enumerate(characters):
                    if character in short_options_with_value:
                        if offset + 1 == len(characters):
                            if index + 1 >= len(argv):
                                missing_value_option = f"-{character}"
                            else:
                                consumes_next = True
                        break
                    if character in short_options_with_optional_attached_value and offset + 1 < len(
                        characters
                    ):
                        break
                    short_flags.add((index, character))
                if missing_value_option is not None:
                    break
                index += 2 if consumes_next else 1
                continue
            index += 1
        return _NativeOptionScan(
            option_indices=frozenset(option_indices),
            short_flags=frozenset(short_flags),
            delimiter_index=delimiter_index,
            missing_value_option=missing_value_option,
        )

    def _reject_recursive_submodule_push(
        self,
        argv: Sequence[str],
        option_scan: _NativeOptionScan,
    ) -> None:
        mode: str | None = None
        for index in sorted(option_scan.option_indices):
            value = argv[index]
            option_name, has_equals, option_value = value.partition("=")
            if "--no-recurse-submodules".startswith(option_name):
                mode = "no"
            elif "--recurse-submodules".startswith(option_name):
                if has_equals:
                    mode = option_value.strip().casefold()
                elif index + 1 < len(argv):
                    mode = argv[index + 1].strip().casefold()
        if mode is None:
            configured = self._runner.run(
                ("config", "--get", "push.recurseSubmodules"),
                cwd=self.repository,
                timeout=30.0,
                allowed_exit_codes=(0, 1),
            )
            mode = configured.stdout.strip().casefold() or None
        if mode not in {None, "check", "false", "no"}:
            raise CheapLfsError(
                "Push refused: recursive submodule mode "
                f"{mode!r} can publish submodule histories that this repository "
                "preflight cannot inspect. Push each submodule through the wrapper "
                "first, then use --recurse-submodules=check or no."
            )

    @staticmethod
    def _native_subcommand(argv: Sequence[str]) -> tuple[int | None, str]:
        """Locate a Git command after common global options without changing argv."""

        options_with_value = frozenset(
            {
                "-C",
                "-c",
                "--exec-path",
                "--git-dir",
                "--work-tree",
                "--namespace",
                "--super-prefix",
                "--config-env",
            }
        )
        index = 0
        while index < len(argv):
            value = argv[index]
            if value == "--":
                return (index + 1, argv[index + 1]) if index + 1 < len(argv) else (None, "")
            if value in options_with_value:
                index += 2
                continue
            if value.startswith("-C") and value != "-C":
                index += 1
                continue
            if value.startswith("-c") and value != "-c":
                index += 1
                continue
            if value.startswith("-"):
                index += 1
                continue
            return index, value
        return None, ""

    @staticmethod
    def _unsupported_mutating_global(arguments: Sequence[str]) -> str | None:
        """Reject globals that would make preflight inspect different Git state."""

        harmless_flags = frozenset(
            {
                "--no-pager",
                "--paginate",
                "--no-optional-locks",
                "--literal-pathspecs",
                "--glob-pathspecs",
                "--noglob-pathspecs",
                "--icase-pathspecs",
            }
        )
        index = 0
        while index < len(arguments):
            value = arguments[index]
            if value == "-c":
                return "-c"
            if value.startswith("-c") and value != "-c":
                return "-c"
            if value in harmless_flags:
                index += 1
                continue
            return value
        return None

    @staticmethod
    def _push_preview_args(
        argv: tuple[str, ...],
        option_scan: _NativeOptionScan,
    ) -> tuple[str, ...]:
        if option_scan.missing_value_option is not None:
            raise CheapLfsError(
                "Push refused before execution: native Git option "
                f"{option_scan.missing_value_option!r} requires a value."
            )
        insertion_index = (
            option_scan.delimiter_index if option_scan.delimiter_index is not None else len(argv)
        )
        enforced = ("--dry-run", "--porcelain", "--no-quiet")
        return (
            *argv[:insertion_index],
            *enforced,
            *argv[insertion_index:],
        )

    @staticmethod
    def _parse_push_publication(output: str) -> _PushPublication:
        refs: list[str] = []
        old_object_names: list[str] = []
        status_rows = 0
        for line in output.splitlines():
            if len(line) < 2 or line[1] != "\t":
                continue
            status_rows += 1
            fields = line.split("\t", 2)
            if len(fields) < 3 or len(fields[0]) != 1 or fields[0] not in " =*+!-":
                raise CheapLfsError("Git push dry-run returned malformed porcelain output.")
            flag = fields[0]
            source, separator, _destination = fields[1].partition(":")
            if not separator:
                raise CheapLfsError("Git push dry-run returned malformed porcelain refs.")
            if flag == "=":
                continue
            if flag == "-":
                if source not in {"", "(delete)"}:
                    raise CheapLfsError("Git push dry-run returned malformed deletion status.")
                continue
            if flag == "!":
                raise CheapLfsError("Git push dry-run reported a rejected ref update.")
            if _PUSH_SOURCE_REF.fullmatch(source) is None:
                raise CheapLfsError("Git push dry-run returned an unsafe source ref.")
            if source not in refs:
                refs.append(source)
            old_match = _PUSH_OLD_OBJECT.search(fields[2])
            if old_match is not None and old_match.group(1) not in old_object_names:
                old_object_names.append(old_match.group(1))
        if status_rows == 0:
            raise CheapLfsError(
                "Git push dry-run returned no parseable porcelain ref status; "
                "the wrapper cannot prove which source history would be published."
            )
        return _PushPublication(tuple(refs), tuple(old_object_names))

    def _outgoing_oversized_blobs(
        self,
        publication: _PushPublication,
    ) -> tuple[OversizedGitBlob, ...]:
        if not publication.source_refs:
            return ()
        remote_bases = self._resolve_remote_bases(publication.old_object_names)
        revision_arguments: tuple[str, ...] = publication.source_refs
        if remote_bases:
            revision_arguments = (*revision_arguments, "--not", *remote_bases)
        objects = self._runner.run(
            ("rev-list", "--objects", *revision_arguments),
            cwd=self.repository,
            timeout=120.0,
        )
        paths_by_oid: dict[str, str] = {}
        for line in objects.stdout.splitlines():
            oid, separator, path = line.partition(" ")
            if not oid:
                continue
            paths_by_oid.setdefault(oid, path if separator else "")
            if len(paths_by_oid) > _MAX_OUTGOING_OBJECTS:
                raise CheapLfsError(
                    "Cheap LFS preflight exceeded the bounded outgoing-object limit."
                )
        if not paths_by_oid:
            return ()
        checked = self._runner.run(
            ("cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"),
            cwd=self.repository,
            timeout=120.0,
            input_data="".join(f"{oid}\n" for oid in paths_by_oid),
        )
        oversized: list[OversizedGitBlob] = []
        for line in checked.stdout.splitlines():
            fields = line.split(" ")
            if len(fields) != 3 or fields[1] != "blob":
                continue
            try:
                size = int(fields[2])
            except ValueError as error:
                raise CheapLfsError("Git returned an invalid outgoing object size.") from error
            if size > self.automatic_pin_threshold:
                oid = fields[0]
                oversized.append(
                    OversizedGitBlob(
                        oid=oid,
                        path=paths_by_oid.get(oid) or "(path unavailable)",
                        size_in_bytes=size,
                    )
                )
        return tuple(sorted(oversized, key=lambda item: (item.path.casefold(), item.oid)))

    def _resolve_remote_bases(self, names: Sequence[str]) -> tuple[str, ...]:
        """Resolve porcelain old-OID abbreviations without trusting stale refs.

        A dry-run summary names the actual destination object observed by the
        remote. When that object is present locally, excluding it makes the
        scan proportional to the publication delta. If it is absent or
        ambiguous, omitting the exclusion safely falls back to the complete
        reachable source history.
        """

        resolved: list[str] = []
        for name in names:
            result = self._runner.run(
                ("rev-parse", "--verify", f"{name}^{{object}}"),
                cwd=self.repository,
                timeout=30.0,
                allowed_exit_codes=(0, 1, 128),
            )
            value = result.stdout.strip()
            if result.exit_code != 0 or _FULL_OBJECT_ID.fullmatch(value) is None:
                continue
            if value not in resolved:
                resolved.append(value)
        return tuple(resolved)

    def _verify_indexed_pointers_for_push(
        self,
        indexed: Sequence[_IndexedPointer],
    ) -> tuple[int, tuple[str, ...]]:
        if not indexed:
            return 0, ()
        materialized: list[str] = []
        for item in indexed:
            state = self._working_pointer_state(item)
            if state == "pointer":
                continue
            if state == "materialized":
                materialized.append(item.relative_path)
            elif state == "missing":
                # A deleted or sparse working-tree path cannot bypass the index.
                continue
            else:  # pragma: no cover - all states are enumerated
                raise CheapLfsError(f"Unknown Cheap LFS working state: {state}")
        return len(indexed), tuple(materialized)

    def _materialized_indexed_paths(self) -> tuple[str, ...]:
        """Best-effort pull-conflict context; never obscures the native failure."""

        try:
            return tuple(
                item.relative_path
                for item in self._indexed_pointers()
                if self._working_pointer_state(item) == "materialized"
            )
        except (CheapLfsError, GitCommandError, OSError, ValueError):
            return ()

    def _oversized_working_bypass_files(
        self,
        indexed: Sequence[_IndexedPointer],
    ) -> tuple[OversizedWorkingFile, ...]:
        """Find bounded oversized candidates not represented by an indexed pointer."""

        pointer_paths = {item.relative_path for item in indexed}
        candidates = self._runner.run(
            ("ls-files", "-z", "--cached", "--others", "--exclude-standard"),
            cwd=self.repository,
            timeout=120.0,
        )
        blocked: list[OversizedWorkingFile] = []
        seen: set[str] = set()
        for raw_path in candidates.stdout.split("\x00"):
            if not raw_path or raw_path in seen:
                continue
            seen.add(raw_path)
            if len(seen) > _MAX_OUTGOING_OBJECTS:
                raise CheapLfsError("Cheap LFS preflight exceeded the bounded path limit.")
            normalized = validate_cheap_lfs_tracked_path(raw_path)
            if normalized is None:
                continue
            absolute = self.repository / Path(normalized)
            try:
                parent = absolute.parent.resolve(strict=True)
                if parent != absolute.parent.absolute() or (
                    parent != self.repository and self.repository not in parent.parents
                ):
                    continue
                file_stat = absolute.lstat()
            except (OSError, RuntimeError, ValueError):
                continue
            if (
                normalized in pointer_paths
                or not stat.S_ISREG(file_stat.st_mode)
                or absolute.is_symlink()
                or file_stat.st_nlink != 1
                or file_stat.st_size <= self.automatic_pin_threshold
            ):
                continue
            blocked.append(OversizedWorkingFile(normalized, file_stat.st_size))
        return tuple(sorted(blocked, key=lambda item: item.path.casefold()))

    def _restore_indexed_pointers(self) -> tuple[tuple[str, ...], tuple[str, ...]]:
        indexed = self._indexed_pointers()
        if not indexed:
            return (), ()
        service = self._cheap_lfs_factory(self.repository)
        restored: list[str] = []
        materialized: list[str] = []
        for item in indexed:
            state = self._working_pointer_state(item)
            if state == "pointer":
                plan = service.preview_restore(item.relative_path)
                service.restore(plan, confirmed=True)
                restored.append(item.relative_path)
            elif state == "materialized":
                materialized.append(item.relative_path)
            elif state == "missing":
                raise CheapLfsError(
                    f"{item.relative_path!r} is missing while its index entry is a pointer."
                )
        return tuple(restored), tuple(materialized)

    def _indexed_pointers(self) -> tuple[_IndexedPointer, ...]:
        matches = self._runner.run(
            (
                "grep",
                "--cached",
                "-l",
                "-z",
                "-e",
                f"^version {CHEAP_LFS_POINTER_VERSION}$",
                "--",
            ),
            cwd=self.repository,
            timeout=120.0,
            allowed_exit_codes=(0, 1),
        )
        pointers: list[_IndexedPointer] = []
        for raw_path in matches.stdout.split("\x00"):
            if not raw_path:
                continue
            normalized = validate_cheap_lfs_tracked_path(raw_path)
            if normalized is None:
                raise CheapLfsError("Git index contains an unsafe Cheap LFS pointer path.")
            oid = self._index_blob_oid(normalized)
            size_result = self._runner.run(
                ("cat-file", "-s", oid),
                cwd=self.repository,
                timeout=30.0,
            )
            try:
                size = int(size_result.stdout.strip())
            except ValueError as error:
                raise CheapLfsError("Git returned an invalid indexed blob size.") from error
            if size > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES:
                continue
            contents = self._runner.run(
                ("cat-file", "blob", oid),
                cwd=self.repository,
                timeout=30.0,
            ).stdout
            pointer = parse_cheap_lfs_pointer(contents)
            if pointer is not None:
                pointers.append(_IndexedPointer(normalized, pointer))
        return tuple(pointers)

    def _index_blob_oid(self, relative_path: str) -> str:
        staged = self._runner.run(
            ("ls-files", "--stage", "-z", "--", f":(literal){relative_path}"),
            cwd=self.repository,
            timeout=30.0,
        )
        entries = [item for item in staged.stdout.split("\x00") if item]
        stage_zero: list[str] = []
        for entry in entries:
            metadata, separator, _path = entry.partition("\t")
            fields = metadata.split()
            if separator and len(fields) == 3 and fields[2] == "0":
                stage_zero.append(fields[1])
        if len(stage_zero) != 1:
            raise CheapLfsError(f"{relative_path!r} has no unambiguous stage-zero index entry.")
        return stage_zero[0]

    def _working_pointer_state(self, indexed: _IndexedPointer) -> str:
        path = self.repository / Path(indexed.relative_path)
        try:
            before = path.lstat()
        except FileNotFoundError:
            return "missing"
        if not stat.S_ISREG(before.st_mode) or path.is_symlink() or before.st_nlink != 1:
            raise CheapLfsError(
                f"{indexed.relative_path!r} is not a safe regular working-tree file."
            )
        if before.st_size <= CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES:
            try:
                with path.open("rb") as handle:
                    data = handle.read(CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES + 1)
                text = data.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = ""
            pointer = parse_cheap_lfs_pointer(text)
            if pointer is not None:
                if pointer != indexed.pointer:
                    raise CheapLfsError(
                        f"{indexed.relative_path!r} differs from its indexed pointer."
                    )
                return "pointer"
        if before.st_size != indexed.pointer.size_in_bytes:
            raise CheapLfsError(
                f"{indexed.relative_path!r} materialized size does not match its indexed pointer."
            )
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(_BUFFER_SIZE), b""):
                digest.update(block)
        after = path.lstat()
        if self._stat_identity(before) != self._stat_identity(after):
            raise CheapLfsError(f"{indexed.relative_path!r} changed while it was being verified.")
        if digest.hexdigest() != indexed.pointer.sha256:
            raise CheapLfsError(
                f"{indexed.relative_path!r} materialized SHA-256 does not match its "
                "indexed pointer."
            )
        return "materialized"

    @staticmethod
    def _stat_identity(value: os.stat_result) -> tuple[int, int, int, int]:
        return (
            value.st_dev,
            value.st_ino,
            value.st_size,
            value.st_mtime_ns,
        )

    @staticmethod
    def _safe_command(argv: Sequence[str]) -> tuple[str, ...]:
        return ("git", *(redact_git_argument(item) for item in argv))

    @staticmethod
    def _result_phase(name: str, result: GitCommandResult) -> GitWrapperPhase:
        return GitWrapperPhase(
            name=name,
            state="succeeded" if result.exit_code == 0 else "failed",
            exit_code=result.exit_code,
            stdout=redact_git_argument(result.stdout),
            stderr=redact_git_argument(result.stderr),
        )
