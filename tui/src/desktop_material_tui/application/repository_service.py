"""Application-facing repository workflows backed by safe Git subprocesses."""

from __future__ import annotations

import os
import re
from collections.abc import Collection, Sequence
from pathlib import Path

from ..domain.errors import (
    GitCommandError,
    InvalidGitArgumentError,
    InvalidRepositoryError,
)
from ..domain.models import (
    Branch,
    Commit,
    DiffResult,
    GitCommandResult,
    Remote,
    RepositoryStatus,
    StashEntry,
    Tag,
)
from ..domain.ports import GitRunner
from ..infrastructure.git.porcelain import (
    BRANCH_FORMAT,
    HISTORY_FORMAT,
    STASH_FORMAT,
    TAG_FORMAT,
    parse_branches,
    parse_history,
    parse_porcelain_v2,
    parse_stashes,
    parse_tags,
)
from ..infrastructure.git.runner import SubprocessGitRunner, redact_git_argument

_HTTP_USER_INFO = re.compile(r"(?i)^https?://[^/@\s]+@")
_STASH_REF = re.compile(r"^stash@\{\d+}$")


class RepositoryService:
    """Synchronous Git workflows suitable for running in a Textual worker."""

    def __init__(
        self,
        path: str | Path,
        runner: GitRunner | None = None,
        *,
        timeout: float = 30.0,
        network_timeout: float = 120.0,
    ) -> None:
        requested_path = Path(path).expanduser()
        if timeout <= 0 or network_timeout <= 0:
            raise InvalidGitArgumentError("timeout", "must be greater than zero")
        self._requested_path = requested_path
        self._root: Path | None = None
        self._runner = runner or SubprocessGitRunner(default_timeout=timeout)
        self.timeout = float(timeout)
        self.network_timeout = float(network_timeout)

    @property
    def path(self) -> Path:
        return self._root or self._requested_path

    def validate(self) -> Path:
        """Resolve and cache the repository's top-level working-tree path."""

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
        top_level = result.stdout.rstrip("\r\n")
        if not top_level:
            raise InvalidRepositoryError(candidate, "Git returned an empty top-level path")
        root = Path(top_level).resolve()
        if not root.is_dir():
            raise InvalidRepositoryError(root, "Git top-level path is not a directory")
        self._root = root
        return root

    def status(self, include_ignored: bool = False) -> RepositoryStatus:
        args = [
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ]
        if include_ignored:
            args.append("--ignored=matching")
        return parse_porcelain_v2(self._run(args).stdout)

    def history(
        self,
        limit: int = 100,
        skip: int = 0,
        revision: str | None = None,
    ) -> tuple[Commit, ...]:
        if not 1 <= limit <= 10_000:
            raise InvalidGitArgumentError("history limit", "must be between 1 and 10000")
        if not 0 <= skip <= 10_000_000:
            raise InvalidGitArgumentError("history skip", "must be between 0 and 10000000")
        if self.status().is_initial:
            return ()
        args = [
            "log",
            "--no-decorate",
            f"--max-count={limit}",
            f"--skip={skip}",
            f"--format={HISTORY_FORMAT}",
        ]
        if revision is not None:
            args.append(self._validate_refish(revision, "revision"))
        args.append("--")
        return parse_history(self._run(args).stdout)

    def branches(self, include_remote: bool = True) -> tuple[Branch, ...]:
        args = ["for-each-ref", f"--format={BRANCH_FORMAT}", "refs/heads"]
        if include_remote:
            args.append("refs/remotes")
        return parse_branches(self._run(args).stdout)

    def stashes(self) -> tuple[StashEntry, ...]:
        return parse_stashes(self._run(["stash", "list", f"--format={STASH_FORMAT}"]).stdout)

    def remotes(self) -> tuple[Remote, ...]:
        names = [line for line in self._run(["remote"]).stdout.splitlines() if line != ""]
        remotes: list[Remote] = []
        for name in names:
            validated_name = self._validate_remote_name(name)
            fetch_urls = self._run(
                ["remote", "get-url", "--all", validated_name]
            ).stdout.splitlines()
            push_urls = self._run(
                ["remote", "get-url", "--push", "--all", validated_name]
            ).stdout.splitlines()
            if not fetch_urls:
                continue
            fetch_url = redact_git_argument(fetch_urls[0])
            push_url = redact_git_argument(push_urls[0] if push_urls else fetch_urls[0])
            remotes.append(
                Remote(
                    name=validated_name,
                    fetch_url=fetch_url,
                    push_url=push_url,
                )
            )
        return tuple(remotes)

    def tags(self) -> tuple[Tag, ...]:
        return parse_tags(self._run(["for-each-ref", f"--format={TAG_FORMAT}", "refs/tags"]).stdout)

    def diff(
        self,
        paths: Sequence[str | Path] = (),
        staged: bool = False,
        revision: str | None = None,
        context_lines: int = 3,
    ) -> DiffResult:
        if not 0 <= context_lines <= 10_000:
            raise InvalidGitArgumentError("diff context", "must be between 0 and 10000 lines")
        normalized_paths = self._normalize_paths(paths, require_non_empty=False)
        args = [
            "diff",
            "--no-ext-diff",
            "--no-color",
            f"--unified={context_lines}",
        ]
        if staged:
            args.append("--cached")
        if revision is not None:
            args.append(self._validate_refish(revision, "revision"))
        args.append("--")
        args.extend(self._literal_pathspec(path) for path in normalized_paths)
        result = self._run(args)
        return DiffResult(
            text=result.stdout,
            staged=staged,
            revision=revision,
            paths=normalized_paths,
        )

    def stage(self, paths: Sequence[str | Path]) -> GitCommandResult:
        normalized = self._normalize_paths(paths)
        return self._run(["add", "--", *(self._literal_pathspec(path) for path in normalized)])

    def unstage(self, paths: Sequence[str | Path]) -> GitCommandResult:
        normalized = self._normalize_paths(paths)
        pathspecs = [self._literal_pathspec(path) for path in normalized]
        if self.status().is_initial:
            return self._run(["rm", "--cached", "-r", "--ignore-unmatch", "--", *pathspecs])
        return self._run(["restore", "--staged", "--", *pathspecs])

    def discard(
        self,
        paths: Sequence[str | Path],
        *,
        staged: bool = False,
    ) -> GitCommandResult:
        """Discard tracked changes after the UI has obtained confirmation.

        Untracked files are deliberately not deleted. A staged discard restores
        both the index and worktree from ``HEAD``; it is unavailable before the
        first commit because no safe source tree exists.
        """

        normalized = self._normalize_paths(paths)
        pathspecs = [self._literal_pathspec(path) for path in normalized]
        args = ["restore"]
        if staged:
            if self.status().is_initial:
                raise InvalidGitArgumentError(
                    "staged discard",
                    "cannot discard staged files before the first commit",
                )
            args.extend(["--source=HEAD", "--staged", "--worktree"])
        else:
            args.append("--worktree")
        return self._run([*args, "--", *pathspecs])

    def commit(
        self,
        summary: str,
        body: str | None = None,
        amend: bool = False,
        signoff: bool = False,
    ) -> Commit:
        self._validate_commit_summary(summary)
        if body is not None and "\x00" in body:
            raise InvalidGitArgumentError("commit body", "must not contain a NUL byte")
        args = ["commit", "-m", summary]
        if body:
            args.extend(["-m", body])
        if amend:
            args.append("--amend")
        if signoff:
            args.append("--signoff")
        self._run(args)
        commits = self.history(limit=1, revision="HEAD")
        if not commits:
            raise InvalidRepositoryError(
                self.validate(), "Git committed but HEAD could not be read"
            )
        return commits[0]

    def fetch(
        self,
        remote: str | None = None,
        prune: bool = False,
        tags: bool = False,
    ) -> GitCommandResult:
        args = ["fetch"]
        if prune:
            args.append("--prune")
        if tags:
            args.append("--tags")
        if remote is not None:
            args.append(self._validate_remote_name(remote))
        return self._run(args, timeout=self.network_timeout)

    def pull(
        self,
        remote: str | None = None,
        branch: str | None = None,
        rebase: bool = False,
        ff_only: bool = False,
    ) -> GitCommandResult:
        if branch is not None and remote is None:
            raise InvalidGitArgumentError("pull branch", "requires an explicit remote")
        args = ["pull", "--rebase" if rebase else "--no-rebase"]
        if ff_only:
            args.append("--ff-only")
        if remote is not None:
            args.append(self._validate_remote_name(remote))
        if branch is not None:
            args.append(self._validate_refish(branch, "pull branch"))
        return self._run(args, timeout=self.network_timeout)

    def push(
        self,
        remote: str | None = None,
        branch: str | None = None,
        set_upstream: bool = False,
        force_with_lease: bool = False,
        tags: bool = False,
    ) -> GitCommandResult:
        if branch is not None and remote is None:
            raise InvalidGitArgumentError("push branch", "requires an explicit remote")
        if set_upstream and (remote is None or branch is None):
            raise InvalidGitArgumentError("push upstream", "requires both a remote and branch")
        args = ["push"]
        if set_upstream:
            args.append("--set-upstream")
        if force_with_lease:
            args.append("--force-with-lease")
        if tags:
            args.append("--tags")
        if remote is not None:
            args.append(self._validate_remote_name(remote))
        if branch is not None:
            args.append(self._validate_refish(branch, "push branch"))
        return self._run(args, timeout=self.network_timeout)

    def create_branch(
        self,
        name: str,
        start_point: str | None = None,
        checkout: bool = True,
    ) -> Branch:
        branch_name = self._validate_branch_name(name)
        args = ["switch", "-c", branch_name] if checkout else ["branch", branch_name]
        if start_point is not None:
            args.append(self._validate_refish(start_point, "branch start point"))
        self._run(args)
        return self._branch_by_name(branch_name)

    def checkout_branch(self, name: str) -> GitCommandResult:
        branch_name = self._validate_refish(name, "branch")
        return self._run(["switch", "--", branch_name])

    def rename_branch(self, old_name: str, new_name: str) -> Branch:
        old_branch = self._validate_refish(old_name, "old branch")
        new_branch = self._validate_branch_name(new_name)
        self._run(["branch", "-m", old_branch, new_branch])
        return self._branch_by_name(new_branch)

    def delete_branch(self, name: str, force: bool = False) -> GitCommandResult:
        branch_name = self._validate_refish(name, "branch")
        return self._run(["branch", "-D" if force else "-d", branch_name])

    def merge_branch(self, name: str, no_ff: bool = False) -> GitCommandResult:
        branch_name = self._validate_refish(name, "branch")
        args = ["merge", "--no-edit"]
        if no_ff:
            args.append("--no-ff")
        args.append(branch_name)
        return self._run(args)

    def stash_push(
        self,
        message: str | None = None,
        include_untracked: bool = False,
        keep_index: bool = False,
        paths: Sequence[str | Path] = (),
    ) -> GitCommandResult:
        if message is not None:
            if "\x00" in message:
                raise InvalidGitArgumentError("stash message", "must not contain a NUL byte")
            if len(message) > 10_000:
                raise InvalidGitArgumentError("stash message", "must not exceed 10000 characters")
        args = ["stash", "push"]
        if message:
            args.extend(["-m", message])
        if include_untracked:
            args.append("--include-untracked")
        if keep_index:
            args.append("--keep-index")
        normalized = self._normalize_paths(paths, require_non_empty=False)
        if normalized:
            args.append("--")
            args.extend(self._literal_pathspec(path) for path in normalized)
        return self._run(args)

    def stash_apply(
        self,
        ref: str = "stash@{0}",
        pop: bool = False,
        index: bool = False,
    ) -> GitCommandResult:
        stash_ref = self._validate_stash_ref(ref)
        args = ["stash", "pop" if pop else "apply"]
        if index:
            args.append("--index")
        args.append(stash_ref)
        return self._run(args)

    def stash_drop(self, ref: str = "stash@{0}") -> GitCommandResult:
        return self._run(["stash", "drop", self._validate_stash_ref(ref)])

    def add_remote(self, name: str, url: str) -> Remote:
        remote_name = self._validate_remote_name(name)
        remote_url = self._validate_remote_url(url)
        self._run(["remote", "add", remote_name, remote_url])
        return next(remote for remote in self.remotes() if remote.name == remote_name)

    def set_remote_url(
        self,
        name: str,
        url: str,
        *,
        push: bool = False,
    ) -> Remote:
        remote_name = self._validate_remote_name(name)
        remote_url = self._validate_remote_url(url)
        args = ["remote", "set-url"]
        if push:
            args.append("--push")
        self._run([*args, remote_name, remote_url])
        return next(remote for remote in self.remotes() if remote.name == remote_name)

    def remove_remote(self, name: str) -> GitCommandResult:
        return self._run(["remote", "remove", self._validate_remote_name(name)])

    def create_tag(
        self,
        name: str,
        message: str | None = None,
        target: str | None = None,
        force: bool = False,
    ) -> Tag:
        tag_name = self._validate_tag_name(name)
        args = ["tag"]
        if force:
            args.append("--force")
        if message is not None:
            if "\x00" in message:
                raise InvalidGitArgumentError("tag message", "must not contain a NUL byte")
            args.extend(["-a", tag_name, "-m", message])
        else:
            args.append(tag_name)
        if target is not None:
            args.append(self._validate_refish(target, "tag target"))
        self._run(args)
        return next(tag for tag in self.tags() if tag.name == tag_name)

    def delete_tag(self, name: str) -> GitCommandResult:
        return self._run(["tag", "-d", self._validate_tag_name(name)])

    def _run(
        self,
        args: Sequence[str],
        *,
        timeout: float | None = None,
        allowed_exit_codes: Collection[int] = (0,),
    ) -> GitCommandResult:
        return self._runner.run(
            args,
            cwd=self.validate(),
            timeout=self.timeout if timeout is None else timeout,
            allowed_exit_codes=allowed_exit_codes,
        )

    def _normalize_paths(
        self,
        paths: Sequence[str | Path],
        *,
        require_non_empty: bool = True,
    ) -> tuple[str, ...]:
        if require_non_empty and not paths:
            raise InvalidGitArgumentError("paths", "at least one path is required")
        root = self.validate()
        root_text = os.fspath(root)
        normalized: list[str] = []
        for path in paths:
            path_text = os.fspath(path)
            if path_text == "" or "\x00" in path_text:
                raise InvalidGitArgumentError("path", "must be non-empty and contain no NUL byte")
            candidate_path = Path(path_text)
            candidate_base = (
                candidate_path if candidate_path.is_absolute() else root / candidate_path
            )
            # Use lexical normalization rather than Path.resolve(): resolving a
            # tracked symlink would follow its target outside the repository and
            # incorrectly prevent the user from staging the symlink itself.
            candidate = os.path.abspath(os.fspath(candidate_base))  # noqa: PTH100
            try:
                common = os.path.commonpath((root_text, candidate))
            except ValueError as error:
                raise InvalidGitArgumentError(
                    "path", "must be on the repository filesystem"
                ) from error
            if os.path.normcase(common) != os.path.normcase(root_text):
                raise InvalidGitArgumentError("path", "must stay within the repository")
            relative = os.path.relpath(candidate, root_text)
            normalized.append(Path(relative).as_posix())
        return tuple(normalized)

    @staticmethod
    def _literal_pathspec(path: str) -> str:
        return f":(literal){path}"

    def _validate_branch_name(self, name: str) -> str:
        branch_name = self._validate_refish(name, "branch")
        try:
            self._run(["check-ref-format", "--branch", branch_name])
        except GitCommandError as error:
            raise InvalidGitArgumentError(
                "branch", error.result.stderr.strip() or "invalid branch name"
            ) from error
        return branch_name

    def _validate_tag_name(self, name: str) -> str:
        tag_name = self._validate_refish(name, "tag")
        try:
            self._run(["check-ref-format", f"refs/tags/{tag_name}"])
        except GitCommandError as error:
            raise InvalidGitArgumentError(
                "tag", error.result.stderr.strip() or "invalid tag name"
            ) from error
        return tag_name

    @staticmethod
    def _validate_refish(value: str, field: str) -> str:
        if (
            not value
            or value.startswith("-")
            or "\x00" in value
            or any(character in value for character in ("\r", "\n"))
        ):
            raise InvalidGitArgumentError(
                field,
                "must be non-empty, must not begin with '-', and must contain no control line",
            )
        if len(value) > 1024:
            raise InvalidGitArgumentError(field, "must not exceed 1024 characters")
        return value

    @classmethod
    def _validate_remote_name(cls, name: str) -> str:
        validated = cls._validate_refish(name, "remote")
        if any(character.isspace() for character in validated):
            raise InvalidGitArgumentError("remote", "must not contain whitespace")
        return validated

    @staticmethod
    def _validate_remote_url(url: str) -> str:
        if not url or url.startswith("-") or "\x00" in url or "\r" in url or "\n" in url:
            raise InvalidGitArgumentError(
                "remote URL",
                "must be non-empty, option-safe, and contain no control line",
            )
        if _HTTP_USER_INFO.match(url):
            raise InvalidGitArgumentError(
                "remote URL",
                "HTTP(S) credentials must be stored in the credential vault, not the URL",
            )
        if len(url) > 8192:
            raise InvalidGitArgumentError("remote URL", "must not exceed 8192 characters")
        return url

    @staticmethod
    def _validate_stash_ref(ref: str) -> str:
        if _STASH_REF.fullmatch(ref) is None:
            raise InvalidGitArgumentError("stash reference", "must use the form stash@{number}")
        return ref

    @staticmethod
    def _validate_commit_summary(summary: str) -> None:
        if not summary.strip():
            raise InvalidGitArgumentError("commit summary", "must not be blank")
        if "\x00" in summary or "\r" in summary or "\n" in summary:
            raise InvalidGitArgumentError(
                "commit summary", "must be one line and contain no NUL byte"
            )
        if len(summary) > 10_000:
            raise InvalidGitArgumentError("commit summary", "must not exceed 10000 characters")

    def _branch_by_name(self, name: str) -> Branch:
        for branch in self.branches(include_remote=False):
            if branch.name == name:
                return branch
        raise InvalidRepositoryError(
            self.validate(), f"Git created branch {name!r} but it could not be read"
        )
