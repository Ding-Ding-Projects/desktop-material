"""Repository-confined local coding-agent repair for failed builds.

The desktop application can hand a failed Build & Run stage to Codex or
OpenCode.  This Linux port preserves the useful outcome without importing an
Electron trust boundary: every command is an immutable argv vector, prompts
travel only over stdin, captured failure text is bounded and redacted, and a
real verification callback decides whether the repair worked.  An agent exit
code is evidence about the child process, never evidence that the build is
fixed.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal, Protocol

from ..infrastructure.persistence.atomic import atomic_write_text
from ..infrastructure.persistence.paths import XDGPaths

AgentProvider = Literal["codex", "opencode"]
AgentStream = Literal["stdout", "stderr", "command", "meta"]
RepairStage = Literal["toolchain", "install", "build", "run"]

_SCHEMA = 1
_PROMPT_TAIL_CAP = 4_000
_USER_PROMPT_CAP = 8_000
_STREAM_LINE_CAP = 16_000
_OUTPUT_CAP = 4 * 1_024 * 1_024
_DETECT_OUTPUT_CAP = 8_000
_MAX_TIMEOUT_SECONDS = 6 * 60 * 60.0
_MAX_MODEL_LENGTH = 160
_SHELL_EXECUTABLES = frozenset(
    {"bash", "dash", "fish", "ksh", "sh", "zsh", "powershell", "pwsh", "cmd", "cmd.exe"}
)
_SHELL_COMMAND_FLAGS = frozenset({"-c", "/c", "-command", "-encodedcommand"})
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ASSIGNMENT_SECRET = re.compile(
    r"(?i)\b(authorization|password|passwd|secret|token|api[_-]?key)"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
_BEARER_SECRET = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}")
_KNOWN_TOKEN = re.compile(
    r"\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
    r"sk-[A-Za-z0-9_-]{20,})\b"
)
_URL_CREDENTIALS = re.compile(r"(https?://)[^/@\s]+@", re.IGNORECASE)


class LocalAIRepairError(RuntimeError):
    """A requested repair operation was unsafe, invalid, or lacked consent."""


@dataclass(frozen=True)
class AgentPreferences:
    """Non-secret per-repository provider preferences."""

    repository: str
    provider: AgentProvider = "codex"
    model: str = ""


@dataclass(frozen=True)
class AgentConsent:
    """Per-operation consent; none of these choices is persisted implicitly."""

    install: bool = False
    authenticate: bool = False
    auto_approve: bool = False


@dataclass(frozen=True)
class AgentStatus:
    """Credential-free detection result for one local CLI."""

    provider: AgentProvider
    installed: bool
    version: str | None
    authenticated: bool


@dataclass(frozen=True)
class AgentCommandPlan:
    """A reviewable, immutable command plan."""

    provider: AgentProvider
    purpose: Literal["install", "authenticate", "repair", "prompt"]
    argv: tuple[str, ...]
    cwd: Path | None
    stdin: str | None = None
    interactive: bool = False

    @property
    def label(self) -> str:
        return " ".join(self.argv)


@dataclass(frozen=True)
class AgentEvent:
    """One ordered, bounded child-process event."""

    sequence: int
    stream: AgentStream
    text: str


@dataclass(frozen=True)
class AgentProcessResult:
    """Observed process outcome, without making a repair-success claim."""

    exit_code: int
    output: str
    events: tuple[AgentEvent, ...]
    launched: bool = True
    cancelled: bool = False
    timed_out: bool = False
    output_truncated: bool = False


@dataclass(frozen=True)
class BuildFailure:
    """Bounded inputs used to construct one failed-build repair request."""

    stage: RepairStage
    exit_code: int
    output_tail: str
    working_directory: str = ""


@dataclass(frozen=True)
class RepairOutcome:
    """Agent evidence plus the independent verification verdict."""

    provider: AgentProvider
    process: AgentProcessResult
    verification_ran: bool
    verification_passed: bool
    verification_error: str | None = None

    @property
    def repaired(self) -> bool:
        """Return true only when the mandatory verification rerun passed."""

        return self.verification_ran and self.verification_passed


class AgentExecutor(Protocol):
    """Dependency boundary used by the service and deterministic tests."""

    def run(
        self,
        plan: AgentCommandPlan,
        *,
        timeout_seconds: float,
        cancel_event: threading.Event,
        on_event: Callable[[AgentStream, str], None] | None = None,
        environment: Mapping[str, str] | None = None,
    ) -> AgentProcessResult:
        """Execute one shell-free plan and return bounded evidence."""


def redact_sensitive_text(value: str) -> str:
    """Remove common credentials without retaining or describing their values."""

    cleaned = _CONTROL_CHARACTERS.sub("", value)
    cleaned = _BEARER_SECRET.sub("Bearer [REDACTED]", cleaned)
    cleaned = _ASSIGNMENT_SECRET.sub(r"\1\2[REDACTED]", cleaned)
    cleaned = _KNOWN_TOKEN.sub("[REDACTED]", cleaned)
    return _URL_CREDENTIALS.sub(r"\1[REDACTED]@", cleaned)


class ShellFreeAgentExecutor:
    """Bounded subprocess runner with complete process-group cancellation."""

    def __init__(self, *, maximum_output_bytes: int = _OUTPUT_CAP) -> None:
        if maximum_output_bytes < 1_024:
            raise LocalAIRepairError("Agent output bound must be at least 1024 bytes")
        self.maximum_output_bytes = maximum_output_bytes

    def run(
        self,
        plan: AgentCommandPlan,
        *,
        timeout_seconds: float,
        cancel_event: threading.Event,
        on_event: Callable[[AgentStream, str], None] | None = None,
        environment: Mapping[str, str] | None = None,
    ) -> AgentProcessResult:
        if plan.interactive:
            raise LocalAIRepairError(
                "Interactive authentication must be opened in the user's terminal"
            )
        _validate_timeout(timeout_seconds)
        _validate_argv(plan.argv)
        events: list[AgentEvent] = []
        output_parts: list[str] = []
        output_bytes = 0
        output_truncated = False
        lock = threading.Lock()

        def emit(stream: AgentStream, text: str) -> None:
            nonlocal output_bytes, output_truncated
            safe = redact_sensitive_text(text)
            if len(safe) > _STREAM_LINE_CAP:
                safe = f"{safe[: _STREAM_LINE_CAP - 1]}…"
            encoded = safe.encode("utf-8", errors="replace")
            with lock:
                remaining = self.maximum_output_bytes - output_bytes
                if remaining <= 0:
                    output_truncated = True
                    return
                if len(encoded) > remaining:
                    encoded = encoded[:remaining]
                    safe = encoded.decode("utf-8", errors="ignore")
                    output_truncated = True
                output_bytes += len(encoded)
                event = AgentEvent(len(events) + 1, stream, safe)
                events.append(event)
                if stream in {"stdout", "stderr"}:
                    output_parts.append(safe)
            if on_event is not None:
                on_event(stream, safe)

        emit("command", plan.label)
        child_environment = os.environ.copy()
        if environment is not None:
            for key, value in environment.items():
                if not key or "=" in key or "\x00" in key or "\x00" in value:
                    raise LocalAIRepairError("Agent environment contains an invalid entry")
                child_environment[key] = value
        child_environment.update(
            {"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "Never", "PAGER": "cat"}
        )

        try:
            process: subprocess.Popen[bytes] = subprocess.Popen(  # noqa: S603
                plan.argv,
                cwd=str(plan.cwd) if plan.cwd is not None else None,
                env=child_environment,
                stdin=subprocess.PIPE if plan.stdin is not None else subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                start_new_session=os.name == "posix",
                creationflags=(
                    getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                    if os.name == "nt"
                    else 0
                ),
            )
        except (OSError, ValueError) as error:
            emit("meta", f"Could not start {plan.argv[0]!r}: {error}")
            return AgentProcessResult(
                exit_code=-1,
                output="".join(output_parts),
                events=tuple(events),
                launched=False,
                output_truncated=output_truncated,
            )

        if plan.stdin is not None and process.stdin is not None:
            try:
                process.stdin.write(plan.stdin.encode("utf-8"))
                process.stdin.close()
            except (BrokenPipeError, OSError):
                pass

        def read_stream(pipe: object, stream: Literal["stdout", "stderr"]) -> None:
            if pipe is None or not hasattr(pipe, "read"):
                return
            read = pipe.read
            while True:
                chunk = read(8_192)
                if not chunk:
                    return
                emit(stream, bytes(chunk).decode("utf-8", errors="replace"))

        readers = (
            threading.Thread(target=read_stream, args=(process.stdout, "stdout"), daemon=True),
            threading.Thread(target=read_stream, args=(process.stderr, "stderr"), daemon=True),
        )
        for reader in readers:
            reader.start()

        deadline = time.monotonic() + timeout_seconds
        cancelled = False
        timed_out = False
        while process.poll() is None:
            if cancel_event.is_set():
                cancelled = True
                self._kill_process_group(process)
                break
            if time.monotonic() >= deadline:
                timed_out = True
                self._kill_process_group(process)
                break
            time.sleep(0.02)
        try:
            exit_code = process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            exit_code = process.wait()
        for reader in readers:
            reader.join(timeout=3)
        if cancelled:
            exit_code = 130
            emit("meta", "Agent operation cancelled; the process group was terminated.")
        elif timed_out:
            exit_code = 124
            emit("meta", "Agent operation timed out; the process group was terminated.")
        return AgentProcessResult(
            exit_code=exit_code,
            output="".join(output_parts),
            events=tuple(events),
            cancelled=cancelled,
            timed_out=timed_out,
            output_truncated=output_truncated,
        )

    @staticmethod
    def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        killpg = getattr(os, "killpg", None)
        try:
            if os.name == "posix" and killpg is not None:
                killpg(process.pid, signal.SIGTERM)
            else:
                process.terminate()
            process.wait(timeout=2)
        except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
            try:
                if os.name == "posix" and killpg is not None:
                    killpg(process.pid, getattr(signal, "SIGKILL", signal.SIGTERM))
                else:
                    process.kill()
            except (OSError, ProcessLookupError):
                pass


class LocalAIRepairService:
    """Persist provider choice and coordinate safe, verified repair runs."""

    def __init__(
        self,
        repository: str | Path,
        *,
        preferences_file: Path | None = None,
        executor: AgentExecutor | None = None,
    ) -> None:
        self.repository = Path(repository).expanduser().resolve()
        if not self.repository.is_dir():
            raise LocalAIRepairError("Repository path is not a directory")
        self.preferences_file = preferences_file or self._default_preferences_file()
        self.executor = executor or ShellFreeAgentExecutor()

    def load_preferences(self) -> AgentPreferences:
        if not self.preferences_file.exists():
            return AgentPreferences(repository=str(self.repository))
        try:
            document = json.loads(self.preferences_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise LocalAIRepairError(f"Could not read agent preferences: {error}") from error
        if not isinstance(document, dict) or document.get("schema") != _SCHEMA:
            raise LocalAIRepairError("Agent preferences use an unsupported schema")
        if document.get("repository") != str(self.repository):
            raise LocalAIRepairError("Agent preferences belong to another repository")
        provider = _validate_provider(document.get("provider"))
        preferences = AgentPreferences(
            repository=str(self.repository),
            provider=provider,
            model=str(document.get("model", "")),
        )
        self._validate_preferences(preferences)
        return preferences

    def save_preferences(self, preferences: AgentPreferences) -> None:
        self._validate_preferences(preferences)
        atomic_write_text(
            self.preferences_file,
            json.dumps(
                {"schema": _SCHEMA, **asdict(preferences)},
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            mode=0o600,
        )

    def status(
        self,
        provider: AgentProvider,
        *,
        timeout_seconds: float = 15.0,
    ) -> AgentStatus:
        provider = _validate_provider(provider)
        version_plan = AgentCommandPlan(
            provider,
            "prompt",
            (provider, "--version"),
            self.repository,
        )
        version = self.executor.run(
            version_plan,
            timeout_seconds=timeout_seconds,
            cancel_event=threading.Event(),
        )
        if not version.launched or version.exit_code != 0:
            return AgentStatus(provider, False, None, False)
        auth_argv = (
            ("codex", "login", "status")
            if provider == "codex"
            else ("opencode", "auth", "list")
        )
        auth = self.executor.run(
            AgentCommandPlan(provider, "prompt", auth_argv, self.repository),
            timeout_seconds=timeout_seconds,
            cancel_event=threading.Event(),
        )
        authenticated = auth.launched and auth.exit_code == 0
        if provider == "opencode":
            lowered = auth.output.casefold()
            authenticated = authenticated and not any(
                marker in lowered
                for marker in ("no credentials", "no providers", "0 credentials")
            )
        return AgentStatus(
            provider,
            True,
            _parse_version(version.output[:_DETECT_OUTPUT_CAP]),
            authenticated,
        )

    def install_plan(self, provider: AgentProvider) -> AgentCommandPlan:
        provider = _validate_provider(provider)
        package = "@openai/codex" if provider == "codex" else "opencode-ai@latest"
        return AgentCommandPlan(
            provider,
            "install",
            ("npm", "install", "--global", package),
            self.repository,
        )

    def install(
        self,
        provider: AgentProvider,
        *,
        consent: AgentConsent,
        timeout_seconds: float = 15 * 60.0,
        cancel_event: threading.Event | None = None,
        on_event: Callable[[AgentStream, str], None] | None = None,
    ) -> AgentProcessResult:
        if not consent.install:
            raise LocalAIRepairError("Installing a coding-agent CLI requires explicit consent")
        return self.executor.run(
            self.install_plan(provider),
            timeout_seconds=timeout_seconds,
            cancel_event=cancel_event or threading.Event(),
            on_event=on_event,
        )

    def authentication_plan(
        self,
        provider: AgentProvider,
        *,
        consent: AgentConsent,
    ) -> AgentCommandPlan:
        provider = _validate_provider(provider)
        if not consent.authenticate:
            raise LocalAIRepairError("Opening coding-agent sign-in requires explicit consent")
        argv = (
            ("codex", "login")
            if provider == "codex"
            else ("opencode", "auth", "login")
        )
        return AgentCommandPlan(
            provider,
            "authenticate",
            argv,
            self.repository,
            interactive=True,
        )

    def repair_plan(
        self,
        failure: BuildFailure,
        *,
        preferences: AgentPreferences | None = None,
        consent: AgentConsent | None = None,
    ) -> AgentCommandPlan:
        selected = preferences or self.load_preferences()
        operation_consent = consent or AgentConsent()
        self._validate_preferences(selected)
        cwd = self._resolve_working_directory(failure.working_directory)
        prompt = self._build_failure_prompt(failure, cwd)
        model = _validate_model(selected.model)
        if selected.provider == "codex":
            argv = (
                "codex",
                "--ask-for-approval",
                "never" if operation_consent.auto_approve else "on-request",
                "exec",
                "--sandbox",
                "workspace-write",
                "--disable",
                "hooks",
                "--ephemeral",
                "--ignore-user-config",
                "--ignore-rules",
                "--color",
                "never",
                *(("--model", model) if model else ()),
                "-",
            )
        else:
            argv = (
                "opencode",
                "run",
                *(("--auto",) if operation_consent.auto_approve else ()),
                "--dir",
                str(cwd),
                *(("--model", model) if model else ()),
            )
        return AgentCommandPlan(
            selected.provider,
            "repair",
            argv,
            cwd,
            stdin=prompt,
        )

    def repair_failed_build(
        self,
        failure: BuildFailure,
        *,
        verify: Callable[[], object],
        preferences: AgentPreferences | None = None,
        consent: AgentConsent | None = None,
        timeout_seconds: float = 60 * 60.0,
        cancel_event: threading.Event | None = None,
        on_event: Callable[[AgentStream, str], None] | None = None,
    ) -> RepairOutcome:
        """Run an agent, then always let independent verification judge the fix."""

        process = self.executor.run(
            self.repair_plan(failure, preferences=preferences, consent=consent),
            timeout_seconds=timeout_seconds,
            cancel_event=cancel_event or threading.Event(),
            on_event=on_event,
        )
        if not process.launched or process.cancelled or process.timed_out:
            return RepairOutcome(
                provider=(preferences or self.load_preferences()).provider,
                process=process,
                verification_ran=False,
                verification_passed=False,
            )
        try:
            verdict = verify()
            passed = verdict if isinstance(verdict, bool) else bool(getattr(verdict, "ok", False))
        except Exception as error:  # verification failures are reported, not hidden
            return RepairOutcome(
                provider=(preferences or self.load_preferences()).provider,
                process=process,
                verification_ran=True,
                verification_passed=False,
                verification_error=redact_sensitive_text(str(error))[:1_000],
            )
        return RepairOutcome(
            provider=(preferences or self.load_preferences()).provider,
            process=process,
            verification_ran=True,
            verification_passed=passed,
        )

    def free_form_plan(
        self,
        prompt: str,
        *,
        working_directory: str = "",
        preferences: AgentPreferences | None = None,
        consent: AgentConsent | None = None,
    ) -> AgentCommandPlan:
        """Build a bounded stdin-only request with the same repository guardrails."""

        bounded = redact_sensitive_text(prompt.strip())[:_USER_PROMPT_CAP]
        if not bounded:
            raise LocalAIRepairError("A blank agent prompt cannot be started")
        selected = preferences or self.load_preferences()
        base = self.repair_plan(
            BuildFailure("build", 1, "User-authored repository request", working_directory),
            preferences=selected,
            consent=consent,
        )
        guardrail = (
            "Work only inside this repository. Never force-push, rewrite or drop "
            "commits, switch branches, discard unrelated work, or contact external "
            "services. Do not commit or push. Make the smallest safe change and "
            "report the verification you actually ran."
        )
        return AgentCommandPlan(
            base.provider,
            "prompt",
            base.argv,
            base.cwd,
            stdin=f"{bounded}\n\n{guardrail}",
        )

    def _build_failure_prompt(self, failure: BuildFailure, cwd: Path) -> str:
        tail = redact_sensitive_text(failure.output_tail)[-_PROMPT_TAIL_CAP:]
        return "\n".join(
            (
                f"The {failure.stage} stage of this repository build failed with exit code "
                f"{failure.exit_code}.",
                f"Selected project directory: {json.dumps(str(cwd))}.",
                "Tail of the captured output (credentials have been redacted):",
                "",
                tail,
                "",
                "Diagnose the failure, make the smallest safe repository-confined changes, "
                "and run focused local checks. Never force-push, rewrite or drop commits, "
                "switch branches, discard unrelated work, use destructive commands, touch "
                "files outside this repository, or contact external services. Do not commit "
                "or push. This is an unattended repair: make the safest minimal choice and "
                "report remaining ambiguity instead of asking a question. The host will rerun "
                "Build & Run independently; do not claim success without that verification.",
            )
        )

    def _resolve_working_directory(self, value: str) -> Path:
        requested = Path(value) if value else Path()
        target = (self.repository / requested).resolve()
        try:
            target.relative_to(self.repository)
        except ValueError as error:
            raise LocalAIRepairError("Agent working directory escaped the repository") from error
        if not target.is_dir():
            raise LocalAIRepairError("Agent working directory does not exist")
        return target

    def _validate_preferences(self, preferences: AgentPreferences) -> None:
        if preferences.repository != str(self.repository):
            raise LocalAIRepairError("Agent preferences belong to another repository")
        _validate_provider(preferences.provider)
        _validate_model(preferences.model)

    def _default_preferences_file(self) -> Path:
        digest = hashlib.sha256(str(self.repository).encode("utf-8")).hexdigest()[:24]
        return XDGPaths.discover().state_dir / "agent-repair" / f"{digest}.json"


def _validate_provider(value: object) -> AgentProvider:
    if value not in {"codex", "opencode"}:
        raise LocalAIRepairError("Unsupported coding-agent provider")
    return value  # type: ignore[return-value]


def _validate_model(value: str) -> str:
    if (
        len(value) > _MAX_MODEL_LENGTH
        or "\x00" in value
        or "\n" in value
        or "\r" in value
        or value.startswith("-")
    ):
        raise LocalAIRepairError("Agent model selection is invalid")
    return value


def _validate_timeout(value: float) -> None:
    if not 0.05 <= value <= _MAX_TIMEOUT_SECONDS:
        raise LocalAIRepairError("Agent timeout is outside the supported range")


def _validate_argv(argv: Sequence[str]) -> None:
    if not argv or len(argv) > 64:
        raise LocalAIRepairError("Agent command has an invalid argument count")
    for argument in argv:
        if not argument or "\x00" in argument or "\n" in argument or "\r" in argument:
            raise LocalAIRepairError("Agent command contains an invalid argument")
    if Path(argv[0]).name.casefold() in _SHELL_EXECUTABLES and any(
        argument.casefold() in _SHELL_COMMAND_FLAGS for argument in argv[1:]
    ):
        raise LocalAIRepairError("Shell command modes are disabled for coding-agent operations")


def _parse_version(output: str) -> str | None:
    match = re.search(r"\d+\.\d+\.\d+(?:[-.\w]*)?", output)
    if match is not None:
        return match.group(0)
    compact = redact_sensitive_text(output).strip()
    return compact[:160] or None
