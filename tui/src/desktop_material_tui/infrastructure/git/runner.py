"""Bounded, argv-only Git subprocess execution."""

from __future__ import annotations

import os
import re
import signal
import subprocess
import time
from collections.abc import Collection, Mapping, Sequence
from pathlib import Path
from typing import Any

from ...domain.errors import (
    GitCommandError,
    GitCommandTimeoutError,
    GitExecutableNotFoundError,
    GitProcessStartError,
    InvalidGitArgumentError,
)
from ...domain.models import GitCommandResult

_URL_CREDENTIALS = re.compile(r"(?i)\b(https?://)([^/@\s]+)@")
_AUTHORIZATION_VALUE = re.compile(r"(?i)(authorization\s*[:=]\s*)(?:basic|bearer)?\s*[^\s]+")
_SENSITIVE_CONFIG = re.compile(r"(?i)^(.*(?:extraheader|token|password|credential).*)=(.*)$")


def _decode(output: bytes | None) -> str:
    return (output or b"").decode("utf-8", errors="surrogateescape")


def redact_git_argument(argument: str) -> str:
    """Remove credential-shaped values before an argv reaches logs or errors."""

    redacted = _URL_CREDENTIALS.sub(r"\1***@", argument)
    match = _SENSITIVE_CONFIG.match(redacted)
    if match is not None:
        return f"{match.group(1)}=***"
    return _AUTHORIZATION_VALUE.sub(r"\1***", redacted)


def redact_git_argv(argv: Sequence[str]) -> tuple[str, ...]:
    return tuple(redact_git_argument(argument) for argument in argv)


class SubprocessGitRunner:
    """Execute Git directly, without a shell, and terminate the process group.

    Interactive credential prompts are disabled so a background operation can
    never seize the TUI indefinitely. Authentication is expected to be supplied
    by Git's configured credential helper or the application's secret adapter.
    """

    def __init__(
        self,
        executable: str | Path = "git",
        *,
        default_timeout: float = 30.0,
        environment: Mapping[str, str] | None = None,
    ) -> None:
        executable_text = os.fspath(executable)
        if not executable_text or "\x00" in executable_text:
            raise InvalidGitArgumentError("Git executable", "must be a non-empty path")
        if default_timeout <= 0:
            raise InvalidGitArgumentError("default timeout", "must be greater than zero")
        self.executable = executable_text
        self.default_timeout = float(default_timeout)
        self.environment = dict(environment or {})

    @classmethod
    def for_github_profile(
        cls,
        profile_directory: Path,
        *,
        executable: str | Path = "git",
        default_timeout: float = 30.0,
    ) -> SubprocessGitRunner:
        """Bind Git to an isolated gh profile without putting a token in env."""

        resolved = profile_directory.expanduser().resolve()
        if not resolved.is_dir():
            raise InvalidGitArgumentError(
                "GitHub profile directory",
                "must be an existing directory",
            )
        return cls(
            executable,
            default_timeout=default_timeout,
            environment={"GH_CONFIG_DIR": os.fspath(resolved)},
        )

    def run(
        self,
        args: Sequence[str],
        *,
        cwd: Path,
        timeout: float | None = None,
        input_data: str | bytes | None = None,
        allowed_exit_codes: Collection[int] = (0,),
    ) -> GitCommandResult:
        raw_args = self._validate_args(args)
        accepted = frozenset(allowed_exit_codes)
        if not accepted:
            raise InvalidGitArgumentError("allowed exit codes", "must contain at least one integer")
        if any(not isinstance(code, int) for code in accepted):
            raise InvalidGitArgumentError("allowed exit codes", "must contain integers only")

        effective_timeout = self.default_timeout if timeout is None else float(timeout)
        if effective_timeout <= 0:
            raise InvalidGitArgumentError("timeout", "must be greater than zero")

        working_directory = Path(cwd).expanduser().resolve()
        command = (self.executable, *raw_args)
        display_command = redact_git_argv(command)
        stdin_bytes = input_data.encode("utf-8") if isinstance(input_data, str) else input_data
        environment = os.environ.copy()
        environment.update(
            {
                "LC_ALL": "C",
                "LANG": "C",
                "GIT_PAGER": "cat",
                "PAGER": "cat",
                "GIT_TERMINAL_PROMPT": "0",
                "GCM_INTERACTIVE": "Never",
            }
        )
        environment.update(self.environment)

        popen_kwargs: dict[str, Any] = {
            "cwd": os.fspath(working_directory),
            "env": environment,
            "stdin": subprocess.PIPE if stdin_bytes is not None else subprocess.DEVNULL,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            "shell": False,
        }
        if os.name == "posix":
            popen_kwargs["start_new_session"] = True
        elif os.name == "nt":
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

        started = time.monotonic()
        try:
            # Every item was NUL-validated above and shell=False is invariant.
            process: subprocess.Popen[bytes] = subprocess.Popen(  # noqa: S603
                command, **popen_kwargs
            )
        except FileNotFoundError as error:
            if not working_directory.exists():
                raise GitProcessStartError(
                    display_command,
                    working_directory,
                    "working directory does not exist",
                ) from error
            raise GitExecutableNotFoundError(self.executable) from error
        except OSError as error:
            raise GitProcessStartError(display_command, working_directory, str(error)) from error

        try:
            stdout_bytes, stderr_bytes = process.communicate(
                input=stdin_bytes,
                timeout=effective_timeout,
            )
        except subprocess.TimeoutExpired:
            self._kill_process_group(process)
            try:
                stdout_bytes, stderr_bytes = process.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                stdout_bytes, stderr_bytes = process.communicate()
            duration = time.monotonic() - started
            raise GitCommandTimeoutError(
                display_command,
                working_directory,
                effective_timeout,
                duration,
                _decode(stdout_bytes),
                _decode(stderr_bytes),
            ) from None

        result = GitCommandResult(
            argv=display_command,
            cwd=working_directory,
            exit_code=process.returncode,
            stdout=_decode(stdout_bytes),
            stderr=_decode(stderr_bytes),
            duration_seconds=time.monotonic() - started,
        )
        if process.returncode not in accepted:
            raise GitCommandError(result)
        return result

    @staticmethod
    def _validate_args(args: Sequence[str]) -> tuple[str, ...]:
        validated = []
        for index, argument in enumerate(args):
            if not isinstance(argument, str):
                raise InvalidGitArgumentError(f"argv[{index}]", "must be a string")
            if "\x00" in argument:
                raise InvalidGitArgumentError(f"argv[{index}]", "must not contain a NUL byte")
            validated.append(argument)
        return tuple(validated)

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
            except ProcessLookupError:
                return
            except OSError:
                pass
        process.kill()
