"""Bounded advanced Git workflows for the interactive terminal workspace."""

from __future__ import annotations

import re
import threading
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from ..domain.errors import (
    GitCommandError,
    InvalidGitArgumentError,
    InvalidRepositoryError,
)
from ..domain.models import GitCommandResult
from ..domain.ports import GitRunner
from ..infrastructure.git.advanced import (
    BatchRepositorySnapshot,
    BatchSyncResult,
    BatchSyncReview,
    BranchDeletionResult,
    BulkBranchCandidate,
    BulkBranchReview,
    CommitMessageSuggestion,
    DeletedUpstreamReview,
    EffectiveGitAuthor,
    GitConfigValue,
    GitFailureDiagnosis,
    HistoryRecord,
    MergeAllReview,
    MergeTarget,
    MergeTargetResult,
    PullPreview,
    RebasePreview,
    ReflogRecord,
    RemoteDiagnostic,
    RepositoryDiagnostics,
    ShallowState,
    SparseCheckoutState,
    SubmoduleRecord,
    TagDiagnostic,
    WorktreeRecord,
    parse_config_value,
    parse_history_records,
    parse_name_status,
    parse_reflog,
    parse_submodule_status,
    parse_worktree_porcelain,
)
from ..infrastructure.git.runner import SubprocessGitRunner, redact_git_argument

_MAX_SPARSE_PATTERNS = 512
_MAX_REF_LENGTH = 1024
_MAX_WORKTREE_LOCK_REASON_LENGTH = 1024
_MAX_WORKTREE_NAME_LENGTH = 255
_MAX_ADVANCED_OUTPUT = 1_048_576
_MAX_BATCH_REPOSITORIES = 500
_MAX_BULK_BRANCHES = 100
_OBJECT_ID = re.compile(r"(?i)^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
_HISTORY_FORMAT = "%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1f%D%x1e"


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

    def effective_author(self) -> EffectiveGitAuthor:
        """Return effective author values together with their winning sources."""

        def read(key: str) -> GitConfigValue | None:
            result = self._run(
                ["config", "--show-scope", "--show-origin", "--get", key],
                allowed_exit_codes=(0, 1),
            )
            return parse_config_value(result.stdout) if result.exit_code == 0 else None

        name = read("user.name")
        email = read("user.email")
        return EffectiveGitAuthor(name=name, email=email)

    def suggest_commit_message(
        self,
        *,
        style: str = "concise",
        include_paths: bool = True,
    ) -> CommitMessageSuggestion:
        """Draft a deterministic message from the staged name/status inventory.

        This deliberately performs no network request and makes no provider or
        Copilot claim. Existing user text remains under UI control.
        """

        if style not in {"concise", "detailed"}:
            raise InvalidGitArgumentError("commit-message style", "must be concise or detailed")
        result = self._run(["diff", "--cached", "--name-status", "-z", "--no-renames"])
        self._bounded(result.stdout, "staged change inventory")
        changes = parse_name_status(result.stdout, limit=101)
        if not changes:
            raise InvalidGitArgumentError(
                "commit-message assistance", "requires at least one staged file"
            )
        if len(changes) > 100:
            raise InvalidGitArgumentError(
                "commit-message assistance", "cannot inspect more than 100 staged files"
            )
        verb_by_status = {"A": "Add", "D": "Remove", "M": "Update", "T": "Update"}
        if len(changes) == 1:
            status, path = changes[0]
            verb = verb_by_status.get(status[:1], "Update")
            summary = f"{verb} {path}"
        else:
            summary = f"Update {len(changes)} staged files"
        paths = tuple(path for _status, path in changes)
        body = ""
        if style == "detailed" or include_paths:
            body = "\n".join(f"- {status}: {path}" for status, path in changes)
        return CommitMessageSuggestion(
            summary=summary[:200],
            body=body,
            included_paths=paths,
        )

    def history_page(
        self,
        *,
        scope: str = "current",
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[HistoryRecord, ...]:
        """Load one bounded current-branch or branches/remotes/tags page."""

        if scope not in {"current", "all"}:
            raise InvalidGitArgumentError("history scope", "must be current or all")
        if not 0 <= skip <= 100_000:
            raise InvalidGitArgumentError("history offset", "must be between 0 and 100000")
        if not 1 <= limit <= 100:
            raise InvalidGitArgumentError("history page size", "must be between 1 and 100")
        args = [
            "log",
            "--topo-order",
            f"--skip={skip}",
            f"--max-count={limit}",
            f"--format={_HISTORY_FORMAT}",
        ]
        if scope == "all":
            args.extend(["--branches", "--remotes", "--tags"])
        else:
            args.append("HEAD")
        result = self._run(args, allowed_exit_codes=(0, 128))
        if result.exit_code == 128 and not result.stdout:
            return ()
        self._bounded(result.stdout, "history page")
        return parse_history_records(result.stdout)

    def create_branch_at(self, name: str, oid: str) -> GitCommandResult:
        branch = self._validate_branch(name)
        commit = self._validate_object_id(oid, "selected commit")
        self._require_object(commit)
        return self._run(["branch", branch, commit])

    def create_tag_at(self, name: str, oid: str) -> GitCommandResult:
        tag = self._validate_refish(name, "tag")
        commit = self._validate_object_id(oid, "selected commit")
        self._require_object(commit)
        return self._run(["tag", tag, commit])

    def checkout_commit_detached(self, oid: str) -> GitCommandResult:
        self._require_clean("checkout selected commit")
        commit = self._validate_object_id(oid, "selected commit")
        self._require_object(commit)
        return self._run(["switch", "--detach", commit])

    def bulk_branch_candidates(
        self,
        *,
        default_branch: str | None = None,
    ) -> tuple[BulkBranchCandidate, ...]:
        """Inventory exact local tips and annotate every protected branch."""

        current = self._current_branch(required=False)
        effective_default = (
            self._validate_branch(default_branch)
            if default_branch
            else self._discover_default_branch(required=False)
        )
        checked_out = {
            record.branch
            for record in self.worktrees()
            if record.branch is not None
        }
        result = self._run(
            [
                "for-each-ref",
                "--sort=refname",
                "--format=%(refname)%00%(refname:short)%00%(objectname)",
                "refs/heads",
            ]
        )
        self._bounded(result.stdout, "local branch inventory")
        candidates: list[BulkBranchCandidate] = []
        for line in result.stdout.splitlines():
            fields = line.split("\0")
            if len(fields) != 3:
                continue
            ref, name, oid = fields
            reason = (
                "current branch"
                if name == current
                else "default branch"
                if effective_default is not None and name == effective_default
                else "conventional default branch"
                if effective_default is None and name in {"main", "master"}
                else "checked out in a worktree"
                if name in checked_out
                else None
            )
            candidates.append(
                BulkBranchCandidate(name=name, ref=ref, oid=oid, protected_reason=reason)
            )
        return tuple(candidates)

    def review_bulk_branch_deletion(
        self,
        names: Sequence[str],
        *,
        default_branch: str | None = None,
    ) -> BulkBranchReview:
        if not names:
            raise InvalidGitArgumentError("bulk branch selection", "must not be empty")
        if len(names) > _MAX_BULK_BRANCHES:
            raise InvalidGitArgumentError(
                "bulk branch selection", f"cannot exceed {_MAX_BULK_BRANCHES} branches"
            )
        normalized = tuple(self._validate_branch(name) for name in names)
        if len(set(normalized)) != len(normalized):
            raise InvalidGitArgumentError("bulk branch selection", "must not contain duplicates")
        inventory = {
            candidate.name: candidate
            for candidate in self.bulk_branch_candidates(default_branch=default_branch)
        }
        reviewed: list[BulkBranchCandidate] = []
        for name in normalized:
            candidate = inventory.get(name)
            if candidate is None:
                raise InvalidGitArgumentError("bulk branch selection", f"{name!r} is not local")
            if candidate.protected_reason is not None:
                raise InvalidGitArgumentError(
                    "bulk branch selection",
                    f"{name!r} is protected: {candidate.protected_reason}",
                )
            reviewed.append(candidate)
        return BulkBranchReview(candidates=tuple(reviewed))

    def apply_bulk_branch_deletion(
        self,
        review: BulkBranchReview,
        *,
        default_branch: str | None = None,
    ) -> tuple[BranchDeletionResult, ...]:
        """Revalidate every reviewed tip before deleting the first ref."""

        if not review.candidates:
            raise InvalidGitArgumentError("bulk branch review", "must not be empty")
        fresh = {
            candidate.name: candidate
            for candidate in self.bulk_branch_candidates(default_branch=default_branch)
        }
        for candidate in review.candidates:
            current = fresh.get(candidate.name)
            if current is None or current.oid != candidate.oid:
                raise InvalidGitArgumentError(
                    "bulk branch review",
                    f"{candidate.name!r} changed after review; refresh before deleting",
                )
            if current.protected_reason is not None:
                raise InvalidGitArgumentError(
                    "bulk branch review",
                    f"{candidate.name!r} became protected: {current.protected_reason}",
                )
        results: list[BranchDeletionResult] = []
        for candidate in review.candidates:
            try:
                self._run(["update-ref", "-d", candidate.ref, candidate.oid])
            except GitCommandError as error:  # noqa: PERF203 - isolated recovery receipt
                results.append(
                    BranchDeletionResult(
                        name=candidate.name,
                        recovery_oid=candidate.oid,
                        deleted=False,
                        error=self._bounded_text(str(error)),
                    )
                )
            else:
                results.append(
                    BranchDeletionResult(
                        name=candidate.name,
                        recovery_oid=candidate.oid,
                        deleted=True,
                    )
                )
        return tuple(results)

    def prepare_pull_preview(
        self,
        *,
        commit_limit: int = 25,
        file_limit: int = 100,
    ) -> PullPreview:
        """Fetch first, then capture an exact bounded ordinary-pull snapshot."""

        if not 1 <= commit_limit <= 100 or not 1 <= file_limit <= 500:
            raise InvalidGitArgumentError("pull preview limit", "is outside the safe bound")
        branch, current_ref, _upstream_ref, remote = self._pull_context()
        self._run(["fetch", "--no-tags", remote], timeout=self.long_timeout)
        # Do not reuse pre-fetch tracking data.
        branch, current_ref, upstream_ref, remote = self._pull_context()
        current_oid = self._resolve_commit(current_ref, "current branch")
        upstream_oid = self._resolve_commit(upstream_ref, "configured upstream")
        merge_base = self._run(["merge-base", current_oid, upstream_oid]).stdout.strip()
        ahead, behind = self._ahead_behind(current_oid, upstream_oid)
        route = self._pull_route(branch)
        incoming = self._history_between(
            current_oid,
            upstream_oid,
            limit=commit_limit + 1,
        )
        files_result = self._run(
            [
                "diff",
                "--name-status",
                "-z",
                "--no-ext-diff",
                "--no-textconv",
                merge_base,
                upstream_oid,
                "--",
            ]
        )
        self._bounded(files_result.stdout, "incoming file inventory")
        file_records = parse_name_status(files_result.stdout, limit=file_limit + 1)
        clean = self._is_clean()
        unavailable: str | None = None
        if not clean:
            unavailable = "working tree or index is not clean"
        elif behind == 0:
            unavailable = "configured upstream has no incoming commits"
        elif route == "fast-forward-only" and ahead > 0:
            unavailable = "fast-forward-only pull cannot integrate divergent history"
        elif route == "interactive-rebase":
            unavailable = "interactive rebase requires an interactive terminal workflow"
        return PullPreview(
            current_branch=branch,
            current_ref=current_ref,
            current_oid=current_oid,
            upstream_ref=upstream_ref,
            upstream_oid=upstream_oid,
            remote=remote,
            merge_base_oid=merge_base,
            ahead=ahead,
            behind=behind,
            route=route,
            incoming_commits=incoming[:commit_limit],
            incoming_files=tuple(path for _status, path in file_records[:file_limit]),
            commits_truncated=len(incoming) > commit_limit,
            files_truncated=len(file_records) > file_limit,
            confirmable=unavailable is None,
            unavailable_reason=unavailable,
        )

    def apply_pull_preview(self, preview: PullPreview) -> GitCommandResult:
        """Integrate only the already-reviewed local object, without fetching."""

        if not preview.confirmable:
            raise InvalidGitArgumentError(
                "pull preview", preview.unavailable_reason or "is not confirmable"
            )
        self._require_clean("reviewed pull")
        branch, current_ref, upstream_ref, remote = self._pull_context()
        if (
            branch != preview.current_branch
            or current_ref != preview.current_ref
            or upstream_ref != preview.upstream_ref
            or remote != preview.remote
        ):
            raise InvalidGitArgumentError("pull preview", "branch or upstream changed after review")
        if self._resolve_commit(current_ref, "current branch") != preview.current_oid:
            raise InvalidGitArgumentError("pull preview", "current branch tip changed after review")
        if self._resolve_commit(upstream_ref, "configured upstream") != preview.upstream_oid:
            raise InvalidGitArgumentError("pull preview", "upstream tip changed after review")
        if self._pull_route(branch) != preview.route:
            raise InvalidGitArgumentError("pull preview", "integration route changed after review")
        if preview.route == "fast-forward-only":
            args = ["merge", "--ff-only", preview.upstream_oid]
        elif preview.route == "merge":
            args = ["merge", "--no-edit", preview.upstream_oid]
        elif preview.route == "rebase":
            args = ["rebase", preview.upstream_oid]
        elif preview.route == "rebase-merges":
            args = ["rebase", "--rebase-merges", preview.upstream_oid]
        else:
            raise InvalidGitArgumentError("pull preview", "unsupported integration route")
        return self._run(args, timeout=self.long_timeout)

    def review_deleted_upstream(
        self,
        *,
        default_branch: str | None = None,
    ) -> DeletedUpstreamReview:
        """Confirm the configured remote branch is genuinely absent."""

        current = self._current_branch(required=True)
        assert current is not None
        remote, remote_branch, upstream_ref = self._configured_upstream(current)
        probe = self._run(
            ["ls-remote", "--exit-code", "--heads", "--", remote, f"refs/heads/{remote_branch}"],
            timeout=self.long_timeout,
            allowed_exit_codes=(0, 2),
        )
        if probe.exit_code == 0:
            raise InvalidGitArgumentError(
                "deleted-upstream recovery", "remote still advertises the configured branch"
            )
        target = (
            self._validate_branch(default_branch)
            if default_branch
            else self._discover_default_branch(required=True)
        )
        assert target is not None
        if target == current:
            raise InvalidGitArgumentError(
                "deleted-upstream recovery", "default branch is already checked out"
            )
        current_oid = self._resolve_commit(f"refs/heads/{current}", "current branch")
        default_oid = self._resolve_commit(f"refs/heads/{target}", "default branch")
        count_result = self._run(
            ["rev-list", "--count", f"{default_oid}..{current_oid}"],
            allowed_exit_codes=(0, 128),
        )
        stranded = (
            int(count_result.stdout.strip())
            if count_result.exit_code == 0 and count_result.stdout.strip().isdigit()
            else None
        )
        return DeletedUpstreamReview(
            repository=self.validate(),
            current_branch=current,
            current_oid=current_oid,
            upstream_ref=upstream_ref,
            remote=remote,
            remote_branch=remote_branch,
            default_branch=target,
            default_oid=default_oid,
            stranded_commits=stranded,
        )

    def apply_deleted_upstream_recovery(
        self,
        review: DeletedUpstreamReview,
        *,
        delete_local: bool = False,
    ) -> tuple[GitCommandResult, ...]:
        """Switch safely, optionally delete only the reviewed local tip, then pull."""

        self._require_clean("deleted-upstream recovery")
        fresh = self.review_deleted_upstream(default_branch=review.default_branch)
        if fresh != review:
            raise InvalidGitArgumentError(
                "deleted-upstream recovery", "repository or refs changed after review"
            )
        results = [self._run(["switch", review.default_branch], timeout=self.long_timeout)]
        if self._current_branch(required=True) != review.default_branch:
            raise InvalidGitArgumentError(
                "deleted-upstream recovery", "checkout did not land on the default branch"
            )
        if delete_local:
            results.append(
                self._run(
                    [
                        "update-ref",
                        "-d",
                        f"refs/heads/{review.current_branch}",
                        review.current_oid,
                    ]
                )
            )
        results.append(self._run(["pull", "--ff-only"], timeout=self.long_timeout))
        return tuple(results)

    def preview_rebase(self, target: str, *, commit_limit: int = 25) -> RebasePreview:
        """Create an exact clean-tree rebase review for a searched ref."""

        if not 1 <= commit_limit <= 100:
            raise InvalidGitArgumentError("rebase preview limit", "must be between 1 and 100")
        self._require_clean("rebase preview")
        current = self._current_branch(required=True)
        assert current is not None
        target_ref = self._validate_refish(target, "rebase target")
        current_ref = f"refs/heads/{current}"
        current_oid = self._resolve_commit(current_ref, "current branch")
        target_oid = self._resolve_commit(target_ref, "rebase target")
        if target_oid == current_oid:
            raise InvalidGitArgumentError("rebase target", "already points at the current commit")
        ahead, behind = self._ahead_behind(current_oid, target_oid)
        commits = self._history_between(target_oid, current_oid, limit=commit_limit + 1)
        return RebasePreview(
            current_branch=current,
            current_ref=current_ref,
            current_oid=current_oid,
            target=target_ref,
            target_oid=target_oid,
            ahead=ahead,
            behind=behind,
            commits=commits[:commit_limit],
            commits_truncated=len(commits) > commit_limit,
        )

    def apply_rebase_preview(self, preview: RebasePreview) -> GitCommandResult:
        self._require_clean("reviewed rebase")
        if self._current_branch(required=True) != preview.current_branch:
            raise InvalidGitArgumentError("rebase preview", "current branch changed after review")
        if self._resolve_commit(preview.current_ref, "current branch") != preview.current_oid:
            raise InvalidGitArgumentError("rebase preview", "current tip changed after review")
        if self._resolve_commit(preview.target, "rebase target") != preview.target_oid:
            raise InvalidGitArgumentError("rebase preview", "target tip changed after review")
        return self._run(["rebase", preview.target_oid], timeout=self.long_timeout)

    def shallow_state(self) -> ShallowState:
        result = self._run(["rev-parse", "--is-shallow-repository"])
        return ShallowState(
            shallow=result.stdout.strip().casefold() == "true",
            remote=self._primary_remote(required=False),
        )

    def deepen(self, commits: int) -> GitCommandResult:
        if not 1 <= commits <= 1_000_000:
            raise InvalidGitArgumentError("deepen count", "must be between 1 and 1000000")
        state = self.shallow_state()
        if not state.shallow:
            raise InvalidGitArgumentError("deepen", "repository is already complete")
        if state.remote is None:
            raise InvalidGitArgumentError("deepen", "repository has no unambiguous remote")
        return self._run(
            ["fetch", f"--deepen={commits}", state.remote],
            timeout=self.long_timeout,
        )

    def unshallow(self) -> GitCommandResult:
        state = self.shallow_state()
        if not state.shallow:
            raise InvalidGitArgumentError("unshallow", "repository is already complete")
        if state.remote is None:
            raise InvalidGitArgumentError("unshallow", "repository has no unambiguous remote")
        return self._run(["fetch", "--unshallow", state.remote], timeout=self.long_timeout)

    def review_merge_all(self) -> MergeAllReview:
        """Review every distinct local-branch and linked-worktree tip."""

        self._require_clean("merge-all review")
        current = self._current_branch(required=True)
        assert current is not None
        current_oid = self._resolve_commit("HEAD", "current branch")
        targets: list[MergeTarget] = []
        seen: set[str] = {current_oid}
        branch_result = self._run(
            [
                "for-each-ref",
                "--sort=refname",
                "--format=%(refname)%00%(refname:short)%00%(objectname)",
                "refs/heads",
            ]
        )
        for line in branch_result.stdout.splitlines():
            fields = line.split("\0")
            if len(fields) != 3:
                continue
            ref, name, oid = fields
            if oid in seen:
                continue
            seen.add(oid)
            targets.append(
                MergeTarget(
                    label=name,
                    oid=oid,
                    ref=ref,
                    worktree=None,
                    conflicting_paths=self._merge_conflicts(current_oid, oid),
                )
            )
        for record in self.worktrees():
            path = record.path.resolve()
            if path == self.validate():
                continue
            status = self._run_at(path, ["status", "--porcelain=v2", "-z"])
            if status.stdout:
                raise InvalidGitArgumentError(
                    "merge-all review", f"linked worktree is dirty: {path}"
                )
            oid = self._run_at(path, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.strip()
            if oid in seen:
                continue
            seen.add(oid)
            targets.append(
                MergeTarget(
                    label=f"worktree:{path.name}",
                    oid=oid,
                    ref=None,
                    worktree=path,
                    conflicting_paths=self._merge_conflicts(current_oid, oid),
                )
            )
        return MergeAllReview(
            current_branch=current,
            current_oid=current_oid,
            targets=tuple(targets),
        )

    def apply_merge_all(self, review: MergeAllReview) -> tuple[MergeTargetResult, ...]:
        self._require_clean("reviewed merge-all")
        if self._current_branch(required=True) != review.current_branch:
            raise InvalidGitArgumentError("merge-all review", "current branch changed after review")
        if self._resolve_commit("HEAD", "current branch") != review.current_oid:
            raise InvalidGitArgumentError("merge-all review", "current tip changed after review")
        if any(target.conflicting_paths for target in review.targets):
            raise InvalidGitArgumentError(
                "merge-all review", "one or more reviewed targets has predicted conflicts"
            )
        for record in self.worktrees():
            path = record.path.resolve()
            if path == self.validate():
                continue
            status = self._run_at(path, ["status", "--porcelain=v2", "-z"])
            if status.stdout:
                raise InvalidGitArgumentError(
                    "merge-all review", f"linked worktree became dirty after review: {path}"
                )
        for target in review.targets:
            actual = (
                self._resolve_commit(target.ref, "merge-all branch")
                if target.ref is not None
                else self._run_at(
                    target.worktree or self.validate(),
                    ["rev-parse", "--verify", "HEAD^{commit}"],
                ).stdout.strip()
            )
            if actual != target.oid:
                raise InvalidGitArgumentError(
                    "merge-all review", f"{target.label!r} changed after review"
                )
        results: list[MergeTargetResult] = []
        for target in review.targets:
            try:
                self._run(["merge", "--no-edit", target.oid], timeout=self.long_timeout)
            except GitCommandError as error:  # noqa: PERF203 - exact failure receipt
                results.append(
                    MergeTargetResult(
                        label=target.label,
                        oid=target.oid,
                        merged=False,
                        error=self._bounded_text(str(error)),
                    )
                )
                break
            else:
                results.append(MergeTargetResult(label=target.label, oid=target.oid, merged=True))
        return tuple(results)

    @classmethod
    def review_batch_sync(
        cls,
        paths: Sequence[str | Path],
        *,
        operation: str,
    ) -> BatchSyncReview:
        """Resolve an exact, duplicate-free repository subset for review."""

        if operation not in {"fetch", "pull"}:
            raise InvalidGitArgumentError("batch sync operation", "must be fetch or pull")
        if not paths:
            raise InvalidGitArgumentError("batch repository selection", "must not be empty")
        if len(paths) > _MAX_BATCH_REPOSITORIES:
            raise InvalidGitArgumentError(
                "batch repository selection",
                f"cannot exceed {_MAX_BATCH_REPOSITORIES} repositories",
            )
        snapshots: list[BatchRepositorySnapshot] = []
        seen: set[Path] = set()
        for raw_path in paths:
            requested = Path(raw_path).expanduser().resolve()
            service = cls(requested)
            root = service.validate()
            if root != requested:
                raise InvalidGitArgumentError(
                    "batch repository selection", f"must name repository root exactly: {raw_path}"
                )
            if root in seen:
                raise InvalidGitArgumentError(
                    "batch repository selection", "must not contain duplicate repositories"
                )
            seen.add(root)
            branch = service._current_branch(required=False)
            oid = service._resolve_commit("HEAD", "repository HEAD") if branch else None
            upstream: str | None = None
            if branch:
                try:
                    _remote, _remote_branch, upstream = service._configured_upstream(branch)
                except InvalidGitArgumentError:
                    upstream = None
            snapshots.append(
                BatchRepositorySnapshot(
                    path=root,
                    current_branch=branch,
                    current_oid=oid,
                    upstream_ref=upstream,
                    operation=operation,
                )
            )
        return BatchSyncReview(operation=operation, repositories=tuple(snapshots))

    @classmethod
    def apply_batch_sync(
        cls,
        review: BatchSyncReview,
        *,
        max_concurrency: int = 3,
        cancellation: threading.Event | None = None,
        progress: Callable[[int, int, BatchSyncResult], None] | None = None,
    ) -> tuple[BatchSyncResult, ...]:
        """Run reviewed repositories with bounded concurrency and isolated rows."""

        if not 1 <= max_concurrency <= 3:
            raise InvalidGitArgumentError("batch concurrency", "must be between 1 and 3")
        fresh = cls.review_batch_sync(
            tuple(snapshot.path for snapshot in review.repositories),
            operation=review.operation,
        )
        if fresh != review:
            raise InvalidGitArgumentError(
                "batch sync review", "repository inventory changed after review"
            )
        cancel = cancellation or threading.Event()
        total = len(review.repositories)
        results_by_path: dict[Path, BatchSyncResult] = {}

        def run_one(snapshot: BatchRepositorySnapshot) -> BatchSyncResult:
            if cancel.is_set():
                return BatchSyncResult(snapshot.path, "cancelled", "Cancelled before start")
            service = cls(snapshot.path)
            try:
                if review.operation == "fetch":
                    service._run(["fetch", "--all", "--prune"], timeout=service.long_timeout)
                    return BatchSyncResult(snapshot.path, "success", "Fetched all remotes")
                if snapshot.current_branch is None:
                    return BatchSyncResult(snapshot.path, "skipped", "No checked-out branch")
                if snapshot.upstream_ref is None:
                    return BatchSyncResult(snapshot.path, "skipped", "Branch has no upstream")
                preview = service.prepare_pull_preview()
                if not preview.confirmable:
                    return BatchSyncResult(
                        snapshot.path,
                        "skipped",
                        preview.unavailable_reason or "Pull is not confirmable",
                    )
                service.apply_pull_preview(preview)
                return BatchSyncResult(snapshot.path, "success", "Pulled reviewed upstream")
            except Exception as error:
                return BatchSyncResult(
                    snapshot.path,
                    "failed",
                    cls._bounded_text(str(error)),
                )

        completed = 0
        with ThreadPoolExecutor(max_workers=max_concurrency, thread_name_prefix="tui-sync") as pool:
            futures = {
                pool.submit(run_one, snapshot): snapshot
                for snapshot in review.repositories
            }
            for future in as_completed(futures):
                result = future.result()
                results_by_path[result.path] = result
                completed += 1
                if progress is not None:
                    progress(completed, total, result)
        return tuple(results_by_path[snapshot.path] for snapshot in review.repositories)

    @staticmethod
    def diagnose_failure(
        operation: str,
        error_text: str,
        *,
        repository: str | Path | None = None,
        remote: str | None = None,
        branch: str | None = None,
        detached_head: bool = False,
    ) -> GitFailureDiagnosis:
        """Classify a bounded failure and build a work-preserving recovery prompt."""

        plain = AdvancedGitService._bounded_text(error_text.strip() or "Git operation failed")
        folded = plain.casefold()
        if "index.lock" in folded and (
            "file exists" in folded or "another git process" in folded
        ):
            kind = "stale-index-lock"
            summary = "An index lock may belong to another active or interrupted Git process."
        elif detached_head or "detached head" in folded or "not currently on a branch" in folded:
            kind = "detached-head"
            summary = "HEAD is detached; preserve the commit on a new branch before publishing."
        elif "non-fast-forward" in folded or "tip of your current branch is behind" in folded:
            kind = "non-fast-forward"
            summary = "The destination contains commits that are not in the local branch."
        elif "gc.log" in folded or "auto packing the repository" in folded:
            kind = "maintenance"
            summary = "Automatic repository maintenance interrupted the Git operation."
        elif "403" in folded or "permission denied" in folded:
            kind = "permission"
            summary = "The configured credential or repository permission was refused."
        else:
            kind = "unknown"
            summary = "The failure is not safe to repair automatically."
        context = [f"Operation: {operation[:120]}"]
        if repository is not None:
            context.append(f"Repository: {str(repository)[:1024]}")
        if remote:
            context.append(f"Remote: {remote[:1024]}")
        if branch:
            context.append(f"Branch: {branch[:1024]}")
        prompt = (
            "Diagnose this Git failure while preserving every existing commit and working-tree "
            "change. Do not force-push, rewrite or drop commits, reset history, delete refs, "
            "switch branches, or discard/stash files. Use read-only inspection first, name the "
            "root cause, and propose only reviewed work-preserving commands.\n\n"
            + "\n".join(context)
            + f"\nClassification: {kind}\nReported error:\n{plain}"
        )
        return GitFailureDiagnosis(
            kind=kind,
            summary=summary,
            original_error=plain,
            recovery_prompt=prompt,
            one_click_safe=False,
        )

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

    def _current_branch(self, *, required: bool) -> str | None:
        result = self._run(
            ["symbolic-ref", "--quiet", "--short", "HEAD"],
            allowed_exit_codes=(0, 1, 128),
        )
        branch = result.stdout.strip() if result.exit_code == 0 else ""
        if branch:
            return self._validate_branch(branch)
        if required:
            raise InvalidGitArgumentError("current branch", "requires an attached, born HEAD")
        return None

    def _resolve_commit(self, revision: str, label: str) -> str:
        refish = self._validate_refish(revision, label)
        result = self._run(["rev-parse", "--verify", f"{refish}^{{commit}}"])
        oid = result.stdout.strip()
        return self._validate_object_id(oid, label)

    def _require_object(self, oid: str) -> None:
        self._run(["cat-file", "-e", f"{oid}^{{commit}}"])

    def _is_clean(self) -> bool:
        result = self._run(["status", "--porcelain=v2", "-z", "--untracked-files=all"])
        self._bounded(result.stdout, "repository status")
        return result.stdout == ""

    def _require_clean(self, label: str) -> None:
        if not self._is_clean():
            raise InvalidGitArgumentError(label, "requires a clean working tree and index")

    def _ahead_behind(self, left_oid: str, right_oid: str) -> tuple[int, int]:
        result = self._run(
            ["rev-list", "--left-right", "--count", f"{left_oid}...{right_oid}"]
        )
        fields = result.stdout.split()
        if len(fields) != 2 or not all(field.isdigit() for field in fields):
            raise InvalidGitArgumentError("revision counts", "Git returned an invalid count")
        return int(fields[0]), int(fields[1])

    def _history_between(
        self,
        older_oid: str,
        newer_oid: str,
        *,
        limit: int,
    ) -> tuple[HistoryRecord, ...]:
        result = self._run(
            [
                "log",
                "--topo-order",
                f"--max-count={limit}",
                f"--format={_HISTORY_FORMAT}",
                f"{older_oid}..{newer_oid}",
            ]
        )
        self._bounded(result.stdout, "commit preview")
        return parse_history_records(result.stdout)

    def _configured_upstream(self, branch: str) -> tuple[str, str, str]:
        name = self._validate_branch(branch)
        remote_result = self._run(
            ["config", "--get", f"branch.{name}.remote"],
            allowed_exit_codes=(0, 1),
        )
        merge_result = self._run(
            ["config", "--get", f"branch.{name}.merge"],
            allowed_exit_codes=(0, 1),
        )
        if remote_result.exit_code != 0 or merge_result.exit_code != 0:
            raise InvalidGitArgumentError("configured upstream", "current branch has no upstream")
        remote = self._validate_remote(remote_result.stdout.strip())
        merge_ref = merge_result.stdout.strip()
        prefix = "refs/heads/"
        if remote == "." or not merge_ref.startswith(prefix):
            raise InvalidGitArgumentError(
                "configured upstream", "requires one named remote branch"
            )
        remote_branch = self._validate_branch(merge_ref[len(prefix) :])
        upstream_ref = f"refs/remotes/{remote}/{remote_branch}"
        return remote, remote_branch, upstream_ref

    def _pull_context(self) -> tuple[str, str, str, str]:
        branch = self._current_branch(required=True)
        assert branch is not None
        remote, _remote_branch, upstream_ref = self._configured_upstream(branch)
        return branch, f"refs/heads/{branch}", upstream_ref, remote

    def _pull_route(self, branch: str) -> str:
        def value(key: str) -> str | None:
            result = self._run(["config", "--get", key], allowed_exit_codes=(0, 1))
            return result.stdout.strip().casefold() if result.exit_code == 0 else None

        ff = value("pull.ff")
        if ff not in {None, "true", "false", "only"}:
            raise InvalidGitArgumentError("pull.ff", "contains an unsupported value")
        if ff == "only":
            return "fast-forward-only"
        rebase = value(f"branch.{self._validate_branch(branch)}.rebase")
        if rebase is None:
            rebase = value("pull.rebase")
        if rebase in {None, "false"}:
            return "merge"
        if rebase == "true":
            return "rebase"
        if rebase in {"merges", "preserve"}:
            return "rebase-merges"
        if rebase == "interactive":
            return "interactive-rebase"
        raise InvalidGitArgumentError("pull.rebase", "contains an unsupported value")

    def _primary_remote(self, *, required: bool) -> str | None:
        remotes = tuple(line.strip() for line in self._run(["remote"]).stdout.splitlines() if line)
        selected = "origin" if "origin" in remotes else remotes[0] if len(remotes) == 1 else None
        if selected is not None:
            return self._validate_remote(selected)
        if required:
            raise InvalidGitArgumentError("remote", "repository has no unambiguous remote")
        return None

    def _discover_default_branch(self, *, required: bool) -> str | None:
        remote = self._primary_remote(required=False)
        if remote is not None:
            symbolic = self._run(
                ["symbolic-ref", "--quiet", "--short", f"refs/remotes/{remote}/HEAD"],
                allowed_exit_codes=(0, 1, 128),
            )
            if symbolic.exit_code == 0:
                value = symbolic.stdout.strip()
                prefix = f"{remote}/"
                if value.startswith(prefix):
                    return self._validate_branch(value[len(prefix) :])
        branch_lines = self._run(
            ["for-each-ref", "--format=%(refname:short)", "refs/heads"]
        ).stdout.splitlines()
        branches = tuple(line.strip() for line in branch_lines if line.strip())
        if len(branches) == 1:
            return self._validate_branch(branches[0])
        if required:
            raise InvalidGitArgumentError(
                "default branch", "is not configured or discoverable; choose it explicitly"
            )
        return None

    def _merge_conflicts(self, current_oid: str, target_oid: str) -> tuple[str, ...]:
        result = self._run(
            [
                "merge-tree",
                "--write-tree",
                "--name-only",
                "-z",
                current_oid,
                target_oid,
            ],
            allowed_exit_codes=(0, 1),
        )
        if result.exit_code == 0:
            return ()
        fields = result.stdout.split("\0")
        conflicts: list[str] = []
        for field in fields[1:]:
            value = field.strip("\r\n")
            if not value or "\n" in value or value.startswith("CONFLICT "):
                break
            conflicts.append(value)
            if len(conflicts) >= 100:
                break
        return tuple(conflicts)

    def _run_at(
        self,
        path: Path,
        args: Sequence[str],
        *,
        timeout: float | None = None,
        allowed_exit_codes: Sequence[int] = (0,),
    ) -> GitCommandResult:
        target = path.expanduser().resolve()
        registered = {record.path.resolve() for record in self.worktrees()}
        if target not in registered:
            raise InvalidGitArgumentError("worktree path", "is not a registered worktree")
        return self._runner.run(
            args,
            cwd=target,
            timeout=self.timeout if timeout is None else timeout,
            allowed_exit_codes=allowed_exit_codes,
        )

    @staticmethod
    def _bounded_text(value: str, maximum: int = 16_384) -> str:
        text = value.replace("\x00", "�")
        return text if len(text) <= maximum else f"{text[:maximum]}\n… output truncated …"

    @staticmethod
    def _bounded(value: str, label: str) -> str:
        if len(value) > _MAX_ADVANCED_OUTPUT:
            raise InvalidGitArgumentError(label, "exceeded the bounded output limit")
        return value

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
    def _validate_object_id(value: str, label: str) -> str:
        if not _OBJECT_ID.fullmatch(value):
            raise InvalidGitArgumentError(label, "must be a full Git object ID")
        return value.casefold()

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
