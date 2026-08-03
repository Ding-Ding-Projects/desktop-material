"""Conservative repository automation with layered, persisted settings.

Automation is disabled by default.  When a user enables it, every scheduled or
immediate operation re-reads the repository state, preserves draft messages,
skips conflicts and multi-commit operations, and invokes Git through immutable
argv vectors.  A failed push never rewrites history and a partial local commit
is reported honestly for later recovery.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Protocol

from ..domain.errors import GitCommandError, GitCommandTimeoutError
from ..domain.models import GitCommandResult
from ..infrastructure.git.runner import SubprocessGitRunner
from ..infrastructure.persistence.atomic import atomic_write_text
from ..infrastructure.persistence.paths import XDGPaths
from .local_ai_repair import redact_sensitive_text

AutomationAction = Literal["commit-push", "pull"]
AutomationStatus = Literal["done", "skipped", "partial", "failed"]
AutomationInterval = Literal[5, 15, 30, 60]

_SCHEMA = 1
_INTERVALS = frozenset({5, 15, 30, 60})
_MAX_SCOPE_ENTRIES = 256
_MAX_AUDIT_EVENTS = 1_000
_MAX_CHANGED_PATHS = 10
_MAX_DETAIL = 2_000


class AutomationError(RuntimeError):
    """Automation settings, repository state, or execution was invalid."""


class AutomationGitRunner(Protocol):
    def run(
        self,
        args: Sequence[str],
        *,
        cwd: Path,
        timeout: float | None = None,
        input_data: str | bytes | None = None,
        allowed_exit_codes: Sequence[int] = (0,),
    ) -> GitCommandResult:
        """Run one argv-only Git command."""


@dataclass(frozen=True)
class AutomationSettings:
    auto_commit_push_enabled: bool = False
    auto_commit_push_interval: AutomationInterval = 30
    auto_pull_enabled: bool = False
    auto_pull_interval: AutomationInterval = 15


@dataclass(frozen=True)
class AutomationOverrides:
    auto_commit_push_enabled: bool | None = None
    auto_commit_push_interval: AutomationInterval | None = None
    auto_pull_enabled: bool | None = None
    auto_pull_interval: AutomationInterval | None = None


@dataclass(frozen=True)
class AutomationSettingsState:
    global_settings: AutomationSettings = field(default_factory=AutomationSettings)
    accounts: Mapping[str, AutomationOverrides] = field(default_factory=dict)
    repositories: Mapping[str, AutomationOverrides] = field(default_factory=dict)


@dataclass(frozen=True)
class AutomationGuardState:
    tip_is_valid: bool
    branch_name: str | None
    has_changes: bool
    has_conflict: bool
    has_multi_commit_operation: bool
    operation_in_progress: bool
    has_draft_commit_message: bool
    has_upstream: bool


@dataclass(frozen=True)
class AutomationDecision:
    safe: bool
    reason: str = ""


@dataclass(frozen=True)
class AutomationRunResult:
    action: AutomationAction
    status: AutomationStatus
    detail: str
    generated_summary: str | None = None
    commit_oid: str | None = None


@dataclass(frozen=True)
class AutomationTarget:
    repository: Path
    account_key: str = ""
    repository_key: str = ""
    draft_commit_message: str = ""


@dataclass(frozen=True)
class AutomationAuditEvent:
    timestamp: str
    repository_id: str
    repository_name: str
    action: AutomationAction
    status: AutomationStatus
    detail: str
    commit_oid: str | None = None


class AutomationSettingsStore:
    """Atomic settings and bounded audit history outside user repositories."""

    def __init__(
        self,
        *,
        settings_file: Path | None = None,
        audit_file: Path | None = None,
    ) -> None:
        paths = XDGPaths.discover()
        self.settings_file = settings_file or paths.state_dir / "automation" / "settings.json"
        self.audit_file = audit_file or paths.state_dir / "automation" / "audit.json"

    def load(self) -> AutomationSettingsState:
        if not self.settings_file.exists():
            return AutomationSettingsState()
        try:
            document = json.loads(self.settings_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise AutomationError(f"Could not read automation settings: {error}") from error
        if not isinstance(document, dict) or document.get("schema") != _SCHEMA:
            raise AutomationError("Automation settings use an unsupported schema")
        state = AutomationSettingsState(
            global_settings=_parse_settings(document.get("global")),
            accounts=_parse_override_map(document.get("accounts")),
            repositories=_parse_override_map(document.get("repositories")),
        )
        _validate_state(state)
        return state

    def save(self, state: AutomationSettingsState) -> None:
        _validate_state(state)
        document = {
            "schema": _SCHEMA,
            "global": asdict(state.global_settings),
            "accounts": {key: asdict(value) for key, value in state.accounts.items()},
            "repositories": {
                key: asdict(value) for key, value in state.repositories.items()
            },
        }
        atomic_write_text(
            self.settings_file,
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            mode=0o600,
        )

    def load_audit(self) -> tuple[AutomationAuditEvent, ...]:
        if not self.audit_file.exists():
            return ()
        try:
            document = json.loads(self.audit_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise AutomationError(f"Could not read automation history: {error}") from error
        if not isinstance(document, list):
            raise AutomationError("Automation history is malformed")
        events: list[AutomationAuditEvent] = []
        for raw in document[-_MAX_AUDIT_EVENTS:]:
            if not isinstance(raw, dict):
                continue
            try:
                events.append(
                    AutomationAuditEvent(
                        timestamp=str(raw["timestamp"])[:64],
                        repository_id=str(raw["repository_id"])[:64],
                        repository_name=str(raw["repository_name"])[:256],
                        action=_validate_action(raw["action"]),
                        status=_validate_status(raw["status"]),
                        detail=str(raw["detail"])[:_MAX_DETAIL],
                        commit_oid=(
                            str(raw["commit_oid"])[:64]
                            if raw.get("commit_oid") is not None
                            else None
                        ),
                    )
                )
            except (KeyError, AutomationError):
                continue
        return tuple(events)

    def append_audit(self, event: AutomationAuditEvent) -> None:
        events = [*self.load_audit(), event][-_MAX_AUDIT_EVENTS:]
        atomic_write_text(
            self.audit_file,
            json.dumps(
                [asdict(item) for item in events],
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            mode=0o600,
        )


def resolve_automation_settings(
    state: AutomationSettingsState,
    *,
    account_key: str = "",
    repository_key: str = "",
) -> AutomationSettings:
    """Resolve global, account, then repository overrides in precedence order."""

    _validate_state(state)
    values: dict[str, object] = asdict(state.global_settings)
    for overrides in (
        state.accounts.get(account_key) if account_key else None,
        state.repositories.get(repository_key) if repository_key else None,
    ):
        if overrides is None:
            continue
        values.update({key: value for key, value in asdict(overrides).items() if value is not None})
    return AutomationSettings(**values)  # type: ignore[arg-type]


def can_auto_commit_push(state: AutomationGuardState) -> AutomationDecision:
    if not state.tip_is_valid or state.branch_name is None:
        return AutomationDecision(False, "A local branch must be checked out.")
    if not state.has_changes:
        return AutomationDecision(False, "There are no changes to commit.")
    if state.has_draft_commit_message:
        return AutomationDecision(False, "A draft commit message is present.")
    return _common_guard(state)


def can_auto_pull(state: AutomationGuardState) -> AutomationDecision:
    if not state.tip_is_valid or state.branch_name is None or not state.has_upstream:
        return AutomationDecision(False, "The current branch has no upstream.")
    if state.has_changes:
        return AutomationDecision(False, "The working tree is not clean.")
    return _common_guard(state)


def _common_guard(state: AutomationGuardState) -> AutomationDecision:
    if state.has_conflict or state.has_multi_commit_operation:
        return AutomationDecision(False, "A conflict or multi-commit operation is in progress.")
    if state.operation_in_progress:
        return AutomationDecision(False, "Another Git operation is in progress.")
    return AutomationDecision(True)


class RepositoryAutomationService:
    """Inspect and run automation for one exact repository."""

    def __init__(
        self,
        repository: str | Path,
        *,
        runner: AutomationGitRunner | None = None,
        store: AutomationSettingsStore | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = Path(repository).expanduser().resolve()
        if not self.repository.is_dir():
            raise AutomationError("Automation repository is not a directory")
        self.runner = runner or SubprocessGitRunner(default_timeout=120)
        self.store = store or AutomationSettingsStore()
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self._operation_lock = threading.Lock()

    def inspect(self, *, draft_commit_message: str = "") -> AutomationGuardState:
        tip = self._git(
            ("rev-parse", "--verify", "HEAD"), allowed_exit_codes=(0, 128)
        )
        branch = self._git(
            ("symbolic-ref", "--quiet", "--short", "HEAD"),
            allowed_exit_codes=(0, 1, 128),
        )
        status = self._git(
            ("status", "--porcelain=v1", "--untracked-files=all", "-z")
        )
        upstream = self._git(
            ("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
            allowed_exit_codes=(0, 128),
        )
        markers = tuple(
            self._git(("rev-parse", "--verify", "-q", name), allowed_exit_codes=(0, 1)).exit_code
            == 0
            for name in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD")
        )
        has_conflict = any(
            entry[:2] in {"DD", "AU", "UD", "UA", "DU", "AA", "UU"}
            for entry in status.stdout.split("\0")
            if len(entry) >= 2
        )
        return AutomationGuardState(
            tip_is_valid=tip.exit_code == 0,
            branch_name=branch.stdout.strip() if branch.exit_code == 0 else None,
            has_changes=bool(status.stdout),
            has_conflict=has_conflict,
            has_multi_commit_operation=any(markers) or self._has_rebase_state(),
            operation_in_progress=self._operation_lock.locked(),
            has_draft_commit_message=bool(draft_commit_message.strip()),
            has_upstream=upstream.exit_code == 0,
        )

    def run(
        self,
        action: AutomationAction,
        *,
        draft_commit_message: str = "",
        record_audit: bool = True,
    ) -> AutomationRunResult:
        action = _validate_action(action)
        if not self._operation_lock.acquire(blocking=False):
            result = AutomationRunResult(action, "skipped", "Another Git operation is in progress.")
            return self._record(result) if record_audit else result
        try:
            state = self.inspect(draft_commit_message=draft_commit_message)
            # inspect observes our owned lock; it is not evidence of a competing operation.
            state = AutomationGuardState(**{**asdict(state), "operation_in_progress": False})
            decision = (
                can_auto_commit_push(state)
                if action == "commit-push"
                else can_auto_pull(state)
            )
            if not decision.safe:
                result = AutomationRunResult(action, "skipped", decision.reason)
            elif action == "commit-push":
                result = self._commit_and_push()
            else:
                result = self._pull()
        except (GitCommandError, GitCommandTimeoutError, OSError, UnicodeError) as error:
            result = AutomationRunResult(action, "failed", _safe_detail(str(error)))
        finally:
            self._operation_lock.release()
        return self._record(result) if record_audit else result

    def _commit_and_push(self) -> AutomationRunResult:
        self._git(("add", "--all"), timeout=120)
        staged = self._git(("diff", "--cached", "--quiet"), allowed_exit_codes=(0, 1))
        if staged.exit_code == 0:
            return AutomationRunResult("commit-push", "skipped", "There are no staged changes.")
        changed = self._git(("diff", "--cached", "--name-only", "-z"))
        paths = tuple(path for path in changed.stdout.split("\0") if path)[:_MAX_CHANGED_PATHS]
        summary, description = build_fallback_commit_message(paths, self.clock())
        self._git(("commit", "-m", summary, "-m", description), timeout=120)
        oid = self._git(("rev-parse", "HEAD")).stdout.strip()
        try:
            self._git(("push",), timeout=10 * 60)
        except (GitCommandError, GitCommandTimeoutError) as error:
            return AutomationRunResult(
                "commit-push",
                "partial",
                "The local commit was created, but the push failed: " + _safe_detail(str(error)),
                summary,
                oid,
            )
        return AutomationRunResult(
            "commit-push",
            "done",
            "Committed all changes and pushed the current branch.",
            summary,
            oid,
        )

    def _pull(self) -> AutomationRunResult:
        self._git(("pull", "--ff-only"), timeout=10 * 60)
        return AutomationRunResult("pull", "done", "Pulled the upstream with fast-forward only.")

    def _has_rebase_state(self) -> bool:
        for name in ("rebase-merge", "rebase-apply"):
            result = self._git(("rev-parse", "--git-path", name))
            raw = result.stdout.strip()
            path = Path(raw)
            if not path.is_absolute():
                path = self.repository / path
            try:
                if path.exists():
                    return True
            except OSError:
                return True
        return False

    def _record(self, result: AutomationRunResult) -> AutomationRunResult:
        resolved = self.repository.resolve()
        self.store.append_audit(
            AutomationAuditEvent(
                timestamp=self.clock().astimezone(timezone.utc).isoformat(),
                repository_id=hashlib.sha256(str(resolved).encode("utf-8")).hexdigest()[:24],
                repository_name=resolved.name[:256],
                action=result.action,
                status=result.status,
                detail=result.detail[:_MAX_DETAIL],
                commit_oid=result.commit_oid,
            )
        )
        return result

    def _git(
        self,
        args: Sequence[str],
        *,
        timeout: float | None = None,
        allowed_exit_codes: Sequence[int] = (0,),
    ) -> GitCommandResult:
        return self.runner.run(
            args,
            cwd=self.repository,
            timeout=timeout,
            allowed_exit_codes=allowed_exit_codes,
        )


class AutomationScheduler:
    """Tick-driven scheduler; it opens no thread and runs only enabled actions."""

    def __init__(
        self,
        store: AutomationSettingsStore,
        *,
        service_factory: Callable[[Path], RepositoryAutomationService] | None = None,
    ) -> None:
        self.store = store
        self.service_factory = service_factory or (
            lambda path: RepositoryAutomationService(path, store=store)
        )
        self._last_runs: dict[tuple[str, AutomationAction], datetime] = {}

    def tick(
        self,
        targets: Sequence[AutomationTarget],
        *,
        now: datetime | None = None,
    ) -> tuple[tuple[AutomationTarget, AutomationRunResult], ...]:
        """Run each due action sequentially; one repository failure is isolated."""

        instant = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        state = self.store.load()
        outcomes: list[tuple[AutomationTarget, AutomationRunResult]] = []
        for target in targets[:_MAX_SCOPE_ENTRIES]:
            repository = target.repository.expanduser().resolve()
            key = target.repository_key or hashlib.sha256(
                str(repository).encode("utf-8")
            ).hexdigest()[:24]
            effective = resolve_automation_settings(
                state,
                account_key=target.account_key,
                repository_key=key,
            )
            due: tuple[tuple[AutomationAction, bool, AutomationInterval], ...] = (
                (
                    "commit-push",
                    effective.auto_commit_push_enabled,
                    effective.auto_commit_push_interval,
                ),
                ("pull", effective.auto_pull_enabled, effective.auto_pull_interval),
            )
            for action, enabled, interval in due:
                run_key = (str(repository), action)
                previous = self._last_runs.get(run_key)
                if not enabled or (
                    previous is not None and instant - previous < timedelta(minutes=interval)
                ):
                    continue
                self._last_runs[run_key] = instant
                try:
                    service = self.service_factory(repository)
                    result = service.run(
                        action,
                        draft_commit_message=target.draft_commit_message,
                    )
                except Exception as error:  # one broken target never starves the rest
                    result = AutomationRunResult(
                        action,
                        "failed",
                        _safe_detail(str(error)),
                    )
                outcomes.append((target, result))
        return tuple(outcomes)


def build_fallback_commit_message(
    paths: Sequence[str], now: datetime
) -> tuple[str, str]:
    """Port the desktop's deterministic offline fallback commit message."""

    instant = now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    summary = f"Auto commit {instant.replace('T', ' ')}"
    listed = [f"- {path}" for path in paths[:_MAX_CHANGED_PATHS]]
    description = f"{len(paths)} file{'s' if len(paths) != 1 else ''} changed"
    if listed:
        description += "\n\n" + "\n".join(listed)
    return summary, description


def _parse_settings(value: object) -> AutomationSettings:
    raw = value if isinstance(value, dict) else {}
    return AutomationSettings(
        auto_commit_push_enabled=bool(raw.get("auto_commit_push_enabled", False)),
        auto_commit_push_interval=_parse_interval(raw.get("auto_commit_push_interval"), 30),
        auto_pull_enabled=bool(raw.get("auto_pull_enabled", False)),
        auto_pull_interval=_parse_interval(raw.get("auto_pull_interval"), 15),
    )


def _parse_override_map(value: object) -> dict[str, AutomationOverrides]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, AutomationOverrides] = {}
    for key, item in list(value.items())[:_MAX_SCOPE_ENTRIES]:
        if not isinstance(key, str) or not isinstance(item, dict):
            continue
        result[key] = AutomationOverrides(
            auto_commit_push_enabled=_optional_bool(item.get("auto_commit_push_enabled")),
            auto_commit_push_interval=_optional_interval(item.get("auto_commit_push_interval")),
            auto_pull_enabled=_optional_bool(item.get("auto_pull_enabled")),
            auto_pull_interval=_optional_interval(item.get("auto_pull_interval")),
        )
    return result


def _validate_state(state: AutomationSettingsState) -> None:
    _validate_settings(state.global_settings)
    for mapping in (state.accounts, state.repositories):
        if len(mapping) > _MAX_SCOPE_ENTRIES:
            raise AutomationError("Automation override map exceeds its bound")
        for key, overrides in mapping.items():
            if not key or len(key) > 256 or any(character in key for character in "\x00\r\n"):
                raise AutomationError("Automation override key is invalid")
            _validate_overrides(overrides)


def _validate_settings(settings: AutomationSettings) -> None:
    _validate_interval(settings.auto_commit_push_interval)
    _validate_interval(settings.auto_pull_interval)


def _validate_overrides(overrides: AutomationOverrides) -> None:
    if overrides.auto_commit_push_interval is not None:
        _validate_interval(overrides.auto_commit_push_interval)
    if overrides.auto_pull_interval is not None:
        _validate_interval(overrides.auto_pull_interval)


def _parse_interval(value: object, default: AutomationInterval) -> AutomationInterval:
    return value if value in _INTERVALS else default  # type: ignore[return-value]


def _optional_interval(value: object) -> AutomationInterval | None:
    return value if value in _INTERVALS else None  # type: ignore[return-value]


def _validate_interval(value: int) -> None:
    if value not in _INTERVALS:
        raise AutomationError("Automation interval must be 5, 15, 30, or 60 minutes")


def _optional_bool(value: object) -> bool | None:
    return value if isinstance(value, bool) else None


def _validate_action(value: object) -> AutomationAction:
    if value not in {"commit-push", "pull"}:
        raise AutomationError("Unsupported automation action")
    return value  # type: ignore[return-value]


def _validate_status(value: object) -> AutomationStatus:
    if value not in {"done", "skipped", "partial", "failed"}:
        raise AutomationError("Unsupported automation status")
    return value  # type: ignore[return-value]


def _safe_detail(value: str) -> str:
    compact = " ".join(redact_sensitive_text(value).split())
    return compact[:_MAX_DETAIL] or "Unknown automation failure."
