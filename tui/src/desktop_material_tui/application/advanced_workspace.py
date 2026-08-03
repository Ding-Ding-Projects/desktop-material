"""Safe, persisted build/run profiles for a repository workspace.

Commands are always parsed into an argv vector and started with ``shell=False``.
The service intentionally refuses shell command modes (``sh -c``, pipes, and
redirections); users who need orchestration can point it at a checked-in script.
"""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import shutil
import signal
import subprocess
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import BinaryIO

from ..infrastructure.persistence.atomic import atomic_write_text
from ..infrastructure.persistence.paths import XDGPaths

_MAX_COMMAND_LENGTH = 4_096
_MAX_OUTPUT_BYTES = 512 * 1_024
_MAX_TIMEOUT_SECONDS = 600.0
_SHELL_OPERATORS = frozenset(
    {
        "|",
        "||",
        "&",
        "&&",
        ";",
        "<",
        ">",
        ">>",
        "2>",
        "2>>",
    }
)
_SHELL_NAMES = frozenset(
    {
        "bash",
        "cmd",
        "cmd.exe",
        "dash",
        "fish",
        "ksh",
        "powershell",
        "powershell.exe",
        "pwsh",
        "sh",
        "zsh",
    }
)


class WorkspaceCommandError(ValueError):
    """A workspace command is unsafe, invalid, or could not be started."""


@dataclass(frozen=True)
class WorkspaceCommandProfile:
    repository: str
    build_command: str = ""
    run_command: str = ""
    working_directory: str = "."
    terminal_command: str = "auto"


@dataclass(frozen=True)
class WorkspaceCommandResult:
    argv: tuple[str, ...]
    cwd: Path
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float
    timed_out: bool = False
    output_truncated: bool = False

    @property
    def ok(self) -> bool:
        return self.exit_code == 0 and not self.timed_out and not self.output_truncated


@dataclass(frozen=True)
class BranchViewPreferences:
    """Repository-scoped visibility choices stored outside the repository."""

    pinned: tuple[str, ...] = ()
    hidden: tuple[str, ...] = ()
    solo: str | None = None
    default_branch: str | None = None


class BranchPreferenceStore:
    """Persist branch pin/hide/solo/default choices in the private XDG area."""

    def __init__(self, repository: str | Path, *, preference_file: Path | None = None) -> None:
        self.repository = Path(repository).expanduser().resolve()
        if not self.repository.is_dir():
            raise WorkspaceCommandError("Repository path is not a directory")
        self.preference_file = preference_file or self._default_preference_file()

    def load(self) -> BranchViewPreferences:
        if not self.preference_file.exists():
            return BranchViewPreferences()
        try:
            document = json.loads(self.preference_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise WorkspaceCommandError(f"Could not read branch preferences: {error}") from error
        if not isinstance(document, dict) or document.get("repository") != str(self.repository):
            raise WorkspaceCommandError("Branch preferences belong to another repository")
        preferences = BranchViewPreferences(
            pinned=self._names(document.get("pinned", ())),
            hidden=self._names(document.get("hidden", ())),
            solo=self._optional_name(document.get("solo")),
            default_branch=self._optional_name(document.get("default_branch")),
        )
        return preferences

    def save(self, preferences: BranchViewPreferences) -> None:
        normalized = BranchViewPreferences(
            pinned=self._names(preferences.pinned),
            hidden=self._names(preferences.hidden),
            solo=self._optional_name(preferences.solo),
            default_branch=self._optional_name(preferences.default_branch),
        )
        document = {
            "default_branch": normalized.default_branch,
            "hidden": list(normalized.hidden),
            "pinned": list(normalized.pinned),
            "repository": str(self.repository),
            "solo": normalized.solo,
        }
        atomic_write_text(
            self.preference_file,
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            mode=0o600,
        )

    def _default_preference_file(self) -> Path:
        paths = XDGPaths.discover().ensure()
        digest = hashlib.sha256(str(self.repository).encode("utf-8")).hexdigest()[:24]
        return paths.config_dir / "branch-preferences" / f"{digest}.json"

    @staticmethod
    def _optional_name(value: object) -> str | None:
        if value is None or value == "":
            return None
        names = BranchPreferenceStore._names((value,))
        return names[0]

    @staticmethod
    def _names(values: object) -> tuple[str, ...]:
        if not isinstance(values, (list, tuple)):
            raise WorkspaceCommandError("Branch preference names must be a list")
        if len(values) > 500:
            raise WorkspaceCommandError("Branch preferences cannot exceed 500 names")
        names: list[str] = []
        seen: set[str] = set()
        for value in values:
            if not isinstance(value, str):
                raise WorkspaceCommandError("Branch preference names must be text")
            if (
                not value
                or len(value) > 1_024
                or value.startswith("-")
                or "\x00" in value
                or any(character in value for character in ("\r", "\n"))
            ):
                raise WorkspaceCommandError("Branch preference contains an unsafe name")
            if value not in seen:
                seen.add(value)
                names.append(value)
        return tuple(names)


class WorkspaceCommandService:
    """Run bounded repository commands and persist their non-secret profile."""

    def __init__(
        self,
        repository: str | Path,
        *,
        profile_file: Path | None = None,
        max_output_bytes: int = _MAX_OUTPUT_BYTES,
    ) -> None:
        self.repository = Path(repository).expanduser().resolve()
        if not self.repository.is_dir():
            raise WorkspaceCommandError("Repository path is not a directory")
        if max_output_bytes < 1_024:
            raise WorkspaceCommandError("Output bound must be at least 1024 bytes")
        self.max_output_bytes = max_output_bytes
        self.profile_file = profile_file or self._default_profile_file()

    def load_profile(self) -> WorkspaceCommandProfile:
        if not self.profile_file.exists():
            return WorkspaceCommandProfile(repository=str(self.repository))
        try:
            document = json.loads(self.profile_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise WorkspaceCommandError(
                f"Could not read the workspace command profile: {error}"
            ) from error
        if not isinstance(document, dict) or document.get("repository") != str(self.repository):
            raise WorkspaceCommandError("Workspace command profile belongs to another repository")
        profile = WorkspaceCommandProfile(
            repository=str(self.repository),
            build_command=str(document.get("build_command", "")),
            run_command=str(document.get("run_command", "")),
            working_directory=str(document.get("working_directory", ".")),
            terminal_command=str(document.get("terminal_command", "auto")),
        )
        self._validate_profile(profile)
        return profile

    def save_profile(self, profile: WorkspaceCommandProfile) -> None:
        self._validate_profile(profile)
        if Path(profile.repository).expanduser().resolve() != self.repository:
            raise WorkspaceCommandError("Workspace command profile belongs to another repository")
        serialized = (
            json.dumps(asdict(profile), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )
        atomic_write_text(self.profile_file, serialized, mode=0o600)

    def parse_argv(self, command: str) -> tuple[str, ...]:
        if not command.strip():
            raise WorkspaceCommandError("Enter a command first")
        if len(command) > _MAX_COMMAND_LENGTH:
            raise WorkspaceCommandError(f"Command cannot exceed {_MAX_COMMAND_LENGTH} characters")
        if "\x00" in command or "\n" in command or "\r" in command:
            raise WorkspaceCommandError("Command must be a single line without NUL bytes")
        try:
            argv = tuple(shlex.split(command, posix=os.name != "nt"))
        except ValueError as error:
            raise WorkspaceCommandError(f"Command quoting is invalid: {error}") from error
        if not argv:
            raise WorkspaceCommandError("Enter a command first")
        if any(argument in _SHELL_OPERATORS for argument in argv):
            raise WorkspaceCommandError(
                "Shell operators are disabled; put the workflow in a script and run that script"
            )
        executable = Path(argv[0]).name.casefold()
        if executable in _SHELL_NAMES and any(
            argument.casefold() in {"-c", "/c", "-command", "-encodedcommand"}
            for argument in argv[1:]
        ):
            raise WorkspaceCommandError(
                "Shell command modes are disabled; run a script file through an argv command"
            )
        return argv

    def resolve_working_directory(self, value: str) -> Path:
        if "\x00" in value:
            raise WorkspaceCommandError("Working directory cannot contain a NUL byte")
        candidate = Path(value or ".").expanduser()
        target = (
            (self.repository / candidate).resolve()
            if not candidate.is_absolute()
            else candidate.resolve()
        )
        try:
            target.relative_to(self.repository)
        except ValueError as error:
            raise WorkspaceCommandError(
                "Working directory must remain inside the open repository"
            ) from error
        if not target.is_dir():
            raise WorkspaceCommandError("Working directory does not exist")
        return target

    def run(
        self,
        command: str,
        *,
        working_directory: str = ".",
        timeout: float = 120.0,
    ) -> WorkspaceCommandResult:
        if not 0 < timeout <= _MAX_TIMEOUT_SECONDS:
            raise WorkspaceCommandError(
                f"Timeout must be between 0 and {_MAX_TIMEOUT_SECONDS:g} seconds"
            )
        argv = self.parse_argv(command)
        cwd = self.resolve_working_directory(working_directory)
        environment = os.environ.copy()
        environment.update(
            {
                "GIT_TERMINAL_PROMPT": "0",
                "GCM_INTERACTIVE": "Never",
                "PAGER": "cat",
            }
        )
        started = time.monotonic()
        try:
            process: subprocess.Popen[bytes] = subprocess.Popen(  # noqa: S603
                argv,
                cwd=str(cwd),
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                start_new_session=os.name == "posix",
                creationflags=(
                    getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
                ),
            )
        except (OSError, ValueError) as error:
            raise WorkspaceCommandError(f"Could not start {argv[0]!r}: {error}") from error

        stdout = bytearray()
        stderr = bytearray()
        output_lock = threading.Lock()
        overflow = threading.Event()
        readers = (
            threading.Thread(
                target=self._read_bounded,
                args=(process.stdout, stdout, output_lock, overflow),
                daemon=True,
            ),
            threading.Thread(
                target=self._read_bounded,
                args=(process.stderr, stderr, output_lock, overflow),
                daemon=True,
            ),
        )
        for reader in readers:
            reader.start()

        timed_out = False
        deadline = started + timeout
        while process.poll() is None:
            if overflow.is_set():
                self._kill_process_group(process)
                break
            if time.monotonic() >= deadline:
                timed_out = True
                self._kill_process_group(process)
                break
            time.sleep(0.02)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        for reader in readers:
            reader.join(timeout=2)

        return WorkspaceCommandResult(
            argv=argv,
            cwd=cwd,
            exit_code=process.returncode,
            stdout=bytes(stdout).decode("utf-8", errors="replace"),
            stderr=bytes(stderr).decode("utf-8", errors="replace"),
            duration_seconds=time.monotonic() - started,
            timed_out=timed_out,
            output_truncated=overflow.is_set(),
        )

    def launch_terminal(
        self,
        terminal_command: str = "auto",
        *,
        working_directory: str = ".",
    ) -> tuple[str, ...]:
        cwd = self.resolve_working_directory(working_directory)
        argv = (
            self._detect_terminal()
            if terminal_command.strip().casefold() in {"", "auto"}
            else self.parse_argv(terminal_command)
        )
        try:
            subprocess.Popen(  # noqa: S603
                argv,
                cwd=cwd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
                start_new_session=os.name != "nt",
            )
        except OSError as error:
            raise WorkspaceCommandError(f"Could not open terminal {argv[0]!r}: {error}") from error
        return argv

    def _read_bounded(
        self,
        stream: BinaryIO | None,
        target: bytearray,
        lock: threading.Lock,
        overflow: threading.Event,
    ) -> None:
        if stream is None:
            return
        try:
            while not overflow.is_set():
                chunk = stream.read(8_192)
                if not chunk:
                    return
                with lock:
                    remaining = self.max_output_bytes - len(target)
                    if remaining <= 0:
                        overflow.set()
                        return
                    target.extend(chunk[:remaining])
                    if len(chunk) > remaining:
                        overflow.set()
                        return
        finally:
            stream.close()

    def _default_profile_file(self) -> Path:
        paths = XDGPaths.discover().ensure()
        digest = hashlib.sha256(str(self.repository).encode("utf-8")).hexdigest()[:24]
        return paths.config_dir / "workspace-commands" / f"{digest}.json"

    @staticmethod
    def _detect_terminal() -> tuple[str, ...]:
        candidates = (
            "x-terminal-emulator",
            "kgx",
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "mate-terminal",
            "alacritty",
            "kitty",
            "wezterm",
            "xterm",
        )
        for candidate in candidates:
            path = shutil.which(candidate)
            if path:
                return (path,)
        raise WorkspaceCommandError(
            "No graphical terminal was found; enter one in the Terminal command field"
        )

    @staticmethod
    def _validate_profile(profile: WorkspaceCommandProfile) -> None:
        for label, value in (
            ("build command", profile.build_command),
            ("run command", profile.run_command),
            ("working directory", profile.working_directory),
            ("terminal command", profile.terminal_command),
        ):
            if len(value) > _MAX_COMMAND_LENGTH or "\x00" in value:
                raise WorkspaceCommandError(
                    f"{label.capitalize()} is too long or contains a NUL byte"
                )

    @staticmethod
    def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        if os.name == "posix":
            kill_process_group = getattr(os, "killpg", None)
            kill_signal = getattr(signal, "SIGKILL", signal.SIGTERM)
            try:
                if kill_process_group is not None:
                    kill_process_group(process.pid, kill_signal)
                    return
            except (ProcessLookupError, OSError):
                pass
        process.kill()


__all__ = [
    "BranchPreferenceStore",
    "BranchViewPreferences",
    "WorkspaceCommandError",
    "WorkspaceCommandProfile",
    "WorkspaceCommandResult",
    "WorkspaceCommandService",
]
