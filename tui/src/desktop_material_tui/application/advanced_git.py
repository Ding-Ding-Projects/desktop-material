"""Bounded advanced Git workflows for the interactive terminal workspace."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from ..domain.errors import GitCommandError, InvalidGitArgumentError, InvalidRepositoryError
from ..domain.models import GitCommandResult
from ..domain.ports import GitRunner
from ..infrastructure.git.advanced import (
    ReflogRecord,
    RemoteDiagnostic,
    RepositoryDiagnostics,
    SparseCheckoutState,
    SubmoduleRecord,
    TagDiagnostic,
    WorktreeRecord,
    parse_reflog,
    parse_submodule_status,
    parse_worktree_porcelain,
)
from ..infrastructure.git.runner import SubprocessGitRunner, redact_git_argument

_MAX_SPARSE_PATTERNS = 512
_MAX_REF_LENGTH = 1024
_MAX_WORKTREE_LOCK_REASON_LENGTH = 1024
_MAX_WORKTREE_NAME_LENGTH = 255


class AdvancedGitService:
    """Synchronous advanced Git operations suitable for a Textual worker."""

    def __init__(
        self,
        path: str | Path,
        runner: GitRunner | None = None,
        *,
        timeout: float = 30.0,
        long_timeout: float = 300.0,
    ) -> None:
        if timeout <= 0 or long_timeout <= 0:
            raise InvalidGitArgumentError("timeout", "must be greater than zero")
        self._requested_path = Path(path).expanduser()
        self._root: Path | None = None
        self._runner = runner or SubprocessGitRunner(default_timeout=timeout)
        self.timeout = float(timeout)
        self.long_timeout = float(long_timeout)

    @property
    def path(self) -> Path:
        return self._root or self._requested_path

    def validate(self) -> Path:
        if self._root is not None:
            return self._root
        candidate = self._requested_path.resolve()
        if not candidate.is_dir():
            raise InvalidRepositoryError(candidate, "Repository path is not a directory")
        try:
            result = self._runner.run(
                ["rev-parse", "--path-format=absolute", "--show-toplevel"],
                cwd=candidate,
                timeout=self.timeout,
            )
        except GitCommandError as error:
            raise InvalidRepositoryError(candidate) from error
        root_text = result.stdout.rstrip("\r\n")
        if not root_text:
            raise InvalidRepositoryError(candidate, "Git returned an empty top-level path")
        self._root = Path(root_text).resolve()
        return self._root

    def worktrees(self) -> tuple[WorktreeRecord, ...]:
        result = self._run(["worktree", "list", "--porcelain", "-z"])
        return parse_worktree_porcelain(result.stdout)

    def add_worktree(
        self,
        path: str | Path,
        *,
        branch: str | None = None,
        start_point: str | None = None,
        create_branch: bool = False,
        detach: bool = False,
    ) -> GitCommandResult:
        if create_branch and not branch:
            raise InvalidGitArgumentError("worktree branch", "is required when creating a branch")
        if create_branch and detach:
            raise InvalidGitArgumentError(
                "worktree options", "cannot create a branch and detach at the same time"
            )
        target = self._absolute_path(path, "worktree path")
        if target == self.validate():
            raise InvalidGitArgumentError("worktree path", "cannot be the primary worktree")
        args = ["worktree", "add"]
        if create_branch:
            args.extend(["-b", self._validate_branch(branch or "")])
        elif detach:
            args.append("--detach")
        elif branch:
            args.extend(["--checkout"])
        args.extend(["--", str(target)])
        if start_point:
            args.append(self._validate_refish(start_point, "worktree start point"))
        elif branch and not create_branch:
            args.append(self._validate_refish(branch, "worktree branch"))
        return self._run(args, timeout=self.long_timeout)

    def remove_worktree(
        self,
        path: str | Path,
        *,
        force: bool = False,
    ) -> GitCommandResult:
        target = self._registered_worktree(path)
        if target == self.validate():
            raise InvalidGitArgumentError("worktree path", "cannot remove the primary worktree")
        args = ["worktree", "remove"]
        if force:
            args.append("--force")
        args.extend(["--", str(target)])
        return self._run(args, timeout=self.long_timeout)

    def lock_worktree(
        self,
        path: str | Path,
        *,
        reason: str | None = None,
    ) -> GitCommandResult:
        """Prevent a linked worktree from being pruned or moved."""

        target = self._registered_linked_worktree(path)
        args = ["worktree", "lock"]
        if reason is not None and reason != "":
            args.extend(["--reason", self._validate_worktree_lock_reason(reason)])
        args.extend(["--", str(target)])
        return self._run(args)

    def unlock_worktree(self, path: str | Path) -> GitCommandResult:
        """Remove an existing linked-worktree lock."""

        target = self._registered_linked_worktree(path)
        return self._run(["worktree", "unlock", "--", str(target)])

    def move_worktree(
        self,
        path: str | Path,
        destination: str | Path,
    ) -> GitCommandResult:
        """Move a registered linked worktree and update Git's metadata."""

        source = self._registered_linked_worktree(path)
        target = self._absolute_path(destination, "worktree destination")
        if target == source:
            raise InvalidGitArgumentError(
                "worktree destination", "must differ from the current worktree path"
            )
        if target == self.validate():
            raise InvalidGitArgumentError(
                "worktree destination", "cannot replace the primary worktree"
            )
        return self._run(
            ["worktree", "move", "--", str(source), str(target)],
            timeout=self.long_timeout,
        )

    def rename_worktree(self, path: str | Path, new_name: str) -> GitCommandResult:
        """Rename a linked worktree within its current parent directory."""

        source = self._registered_linked_worktree(path)
        name = self._validate_worktree_name(new_name)
        return self.move_worktree(source, source.with_name(name))

    def repair_worktrees(
        self,
        paths: Sequence[str | Path] = (),
    ) -> GitCommandResult:
        """Repair administrative metadata after worktrees were moved manually."""

        normalized: list[str] = []
        seen: set[Path] = set()
        for path in paths:
            target = self._absolute_path(path, "worktree repair path")
            if not target.is_dir():
                raise InvalidGitArgumentError(
                    "worktree repair path", "must identify an existing directory"
                )
            if target in seen:
                raise InvalidGitArgumentError(
                    "worktree repair path", "must not contain duplicate paths"
                )
            seen.add(target)
            normalized.append(str(target))
        args = ["worktree", "repair"]
        if normalized:
            args.extend(["--", *normalized])
        return self._run(args, timeout=self.long_timeout)

    def prune_worktrees(self, *, dry_run: bool = True) -> GitCommandResult:
        args = ["worktree", "prune", "--verbose"]
        if dry_run:
            args.append("--dry-run")
        return self._run(args)

    def submodules(self) -> tuple[SubmoduleRecord, ...]:
        result = self._run(
            ["-c", "core.quotePath=false", "submodule", "status", "--recursive"],
            timeout=self.long_timeout,
        )
        return parse_submodule_status(result.stdout)

    def update_submodules(
        self,
        paths: Sequence[str | Path] = (),
        *,
        init: bool = True,
        recursive: bool = True,
    ) -> GitCommandResult:
        args = ["submodule", "update"]
        if init:
            args.append("--init")
        if recursive:
            args.append("--recursive")
        normalized = tuple(self._repository_relative_path(path, "submodule path") for path in paths)
        if normalized:
            args.extend(["--", *normalized])
        return self._run(args, timeout=self.long_timeout)

    def sync_submodules(self, *, recursive: bool = True) -> GitCommandResult:
        args = ["submodule", "sync"]
        if recursive:
            args.append("--recursive")
        return self._run(args)

    def deinit_submodule(
        self,
        path: str | Path,
        *,
        force: bool = False,
    ) -> GitCommandResult:
        normalized = self._repository_relative_path(path, "submodule path")
        registered = {module.path for module in self.submodules()}
        if normalized not in registered:
            raise InvalidGitArgumentError("submodule path", "is not a registered submodule")
        args = ["submodule", "deinit"]
        if force:
            args.append("--force")
        args.extend(["--", normalized])
        return self._run(args, timeout=self.long_timeout)

    def sparse_checkout(self) -> SparseCheckoutState:
        enabled = self._git_bool("core.sparseCheckout")
        cone_mode = self._git_bool("core.sparseCheckoutCone")
        if not enabled:
            return SparseCheckoutState(enabled=False, cone_mode=cone_mode)
        result = self._run(["sparse-checkout", "list"])
        patterns = tuple(line for line in result.stdout.splitlines() if line)
        return SparseCheckoutState(enabled=True, cone_mode=cone_mode, patterns=patterns)

    def set_sparse_checkout(
        self,
        patterns: Sequence[str],
        *,
        cone_mode: bool = True,
    ) -> GitCommandResult:
        normalized = tuple(self._validate_sparse_pattern(pattern) for pattern in patterns)
        if not normalized:
            raise InvalidGitArgumentError("sparse patterns", "must contain at least one pattern")
        if len(normalized) > _MAX_SPARSE_PATTERNS:
            raise InvalidGitArgumentError(
                "sparse patterns", f"cannot exceed {_MAX_SPARSE_PATTERNS} entries"
            )
        args = [
            "sparse-checkout",
            "set",
            "--cone" if cone_mode else "--no-cone",
            "--",
            *normalized,
        ]
        return self._run(args, timeout=self.long_timeout)

    def disable_sparse_checkout(self) -> GitCommandResult:
        return self._run(["sparse-checkout", "disable"], timeout=self.long_timeout)

    def reflog(self, *, limit: int = 200) -> tuple[ReflogRecord, ...]:
        if not 1 <= limit <= 5_000:
            raise InvalidGitArgumentError("reflog limit", "must be between 1 and 5000")
        result = self._run(
            [
                "reflog",
                "show",
                f"--max-count={limit}",
                "--date=iso-strict",
                "--format=%H%x1f%gd%x1f%gs%x1f%aI%x1e",
            ]
        )
        return parse_reflog(result.stdout)

    def diagnostics(self) -> RepositoryDiagnostics:
        root = self.validate()
        git_version = self._run(["--version"]).stdout.strip()
        git_directory = self._resolve_git_path(
            self._run(["rev-parse", "--path-format=absolute", "--git-dir"]).stdout
        )
        common_directory = self._resolve_git_path(
            self._run(["rev-parse", "--path-format=absolute", "--git-common-dir"]).stdout
        )
        head_result = self._run(
            ["rev-parse", "--short=12", "HEAD"],
            allowed_exit_codes=(0, 128),
        )
        head = head_result.stdout.strip() if head_result.exit_code == 0 else "(unborn)"
        object_statistics_list: list[tuple[str, str]] = []
        for line in self._run(["count-objects", "-v"]).stdout.splitlines():
            if ": " in line:
                key, value = line.split(": ", 1)
                object_statistics_list.append((key, value))
        return RepositoryDiagnostics(
            git_version=git_version,
            repository_root=root,
            git_directory=git_directory,
            common_directory=common_directory,
            head=head,
            object_statistics=tuple(object_statistics_list),
            remotes=self._remotes(),
            recent_tags=self._recent_tags(),
        )

    def _remotes(self) -> tuple[RemoteDiagnostic, ...]:
        names = tuple(line for line in self._run(["remote"]).stdout.splitlines() if line)
        records: list[RemoteDiagnostic] = []
        for name in names:
            validated = self._validate_remote(name)
            fetch = self._run(["remote", "get-url", validated]).stdout.strip()
            push_result = self._run(
                ["remote", "get-url", "--push", validated],
                allowed_exit_codes=(0, 2),
            )
            push = push_result.stdout.strip() if push_result.exit_code == 0 else fetch
            records.append(
                RemoteDiagnostic(
                    name=validated,
                    fetch_url=redact_git_argument(fetch),
                    push_url=redact_git_argument(push),
                )
            )
        return tuple(records)

    def _recent_tags(self) -> tuple[TagDiagnostic, ...]:
        result = self._run(
            [
                "for-each-ref",
                "--count=20",
                "--sort=-creatordate",
                "--format=%(refname:short)%00%(objectname:short)%00%(objecttype)%00%(subject)",
                "refs/tags",
            ]
        )
        tags: list[TagDiagnostic] = []
        for line in result.stdout.splitlines():
            fields = line.split("\0", 3)
            if len(fields) == 4:
                tags.append(TagDiagnostic(*fields))
        return tuple(tags)

    def _git_bool(self, key: str) -> bool:
        result = self._run(
            ["config", "--bool", "--get", key],
            allowed_exit_codes=(0, 1),
        )
        return result.exit_code == 0 and result.stdout.strip().lower() == "true"

    def _registered_worktree(self, path: str | Path) -> Path:
        target = self._absolute_path(path, "worktree path")
        registered = {record.path.resolve() for record in self.worktrees()}
        if target not in registered:
            raise InvalidGitArgumentError("worktree path", "is not a registered worktree")
        return target

    def _registered_linked_worktree(self, path: str | Path) -> Path:
        target = self._registered_worktree(path)
        if target == self.validate():
            raise InvalidGitArgumentError(
                "worktree path", "must identify a linked worktree, not the primary worktree"
            )
        return target

    def _repository_relative_path(self, path: str | Path, label: str) -> str:
        text = str(path)
        if not text or "\x00" in text:
            raise InvalidGitArgumentError(label, "must be a non-empty path without NUL bytes")
        candidate = Path(text).expanduser()
        target = (
            (self.validate() / candidate).resolve()
            if not candidate.is_absolute()
            else candidate.resolve()
        )
        try:
            relative = target.relative_to(self.validate())
        except ValueError as error:
            raise InvalidGitArgumentError(label, "must remain inside the repository") from error
        if str(relative) == ".":
            raise InvalidGitArgumentError(label, "must identify a repository child path")
        return relative.as_posix()

    @staticmethod
    def _absolute_path(path: str | Path, label: str) -> Path:
        text = str(path)
        if not text or "\x00" in text:
            raise InvalidGitArgumentError(label, "must be a non-empty path without NUL bytes")
        return Path(text).expanduser().resolve()

    @staticmethod
    def _validate_branch(value: str) -> str:
        if (
            not value
            or len(value) > _MAX_REF_LENGTH
            or value.startswith("-")
            or "\x00" in value
            or value.endswith((".", "/"))
            or ".." in value
            or "@{" in value
            or any(character.isspace() for character in value)
        ):
            raise InvalidGitArgumentError("branch", "is not a safe Git branch name")
        return value

    @staticmethod
    def _validate_refish(value: str, label: str) -> str:
        if (
            not value
            or len(value) > _MAX_REF_LENGTH
            or value.startswith("-")
            or "\x00" in value
            or any(character in value for character in ("\r", "\n"))
        ):
            raise InvalidGitArgumentError(label, "is not a safe revision")
        return value

    @staticmethod
    def _validate_remote(value: str) -> str:
        if (
            not value
            or value.startswith("-")
            or "\x00" in value
            or any(character.isspace() for character in value)
        ):
            raise InvalidGitArgumentError("remote", "is not a safe remote name")
        return value

    @staticmethod
    def _validate_sparse_pattern(value: str) -> str:
        if (
            not value
            or len(value) > 4_096
            or "\x00" in value
            or any(character in value for character in ("\r", "\n"))
            or value.startswith("-")
        ):
            raise InvalidGitArgumentError(
                "sparse pattern", "must be a non-empty single-line path or pattern"
            )
        return value

    @staticmethod
    def _validate_worktree_lock_reason(value: str) -> str:
        if (
            not value
            or len(value) > _MAX_WORKTREE_LOCK_REASON_LENGTH
            or "\x00" in value
            or any(character in value for character in ("\r", "\n"))
        ):
            raise InvalidGitArgumentError(
                "worktree lock reason",
                f"must be a non-empty single-line value of at most "
                f"{_MAX_WORKTREE_LOCK_REASON_LENGTH} characters",
            )
        return value

    @staticmethod
    def _validate_worktree_name(value: str) -> str:
        if (
            not value
            or len(value) > _MAX_WORKTREE_NAME_LENGTH
            or value in {".", ".."}
            or any(character in value for character in ("/", "\\", "\x00", "\r", "\n"))
            or any(ord(character) < 32 for character in value)
        ):
            raise InvalidGitArgumentError(
                "worktree name",
                f"must be one safe path component of at most {_MAX_WORKTREE_NAME_LENGTH} "
                "characters",
            )
        return value

    def _resolve_git_path(self, output: str) -> Path:
        value = Path(output.strip())
        if value.is_absolute():
            return value.resolve()
        return (self.validate() / value).resolve()

    def _run(
        self,
        args: Sequence[str],
        *,
        timeout: float | None = None,
        allowed_exit_codes: Sequence[int] = (0,),
    ) -> GitCommandResult:
        return self._runner.run(
            args,
            cwd=self.validate(),
            timeout=self.timeout if timeout is None else timeout,
            allowed_exit_codes=allowed_exit_codes,
        )


__all__ = ["AdvancedGitService"]
