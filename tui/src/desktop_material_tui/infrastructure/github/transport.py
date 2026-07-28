"""No-shell subprocess transport for the installed GitHub CLI."""

from __future__ import annotations

import os
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class GhProcessResult:
    """Captured result from one bounded ``gh`` invocation."""

    argv: tuple[str, ...]
    return_code: int
    stdout: str
    stderr: str


class GhTransport(Protocol):
    """Injectable process boundary used by unit tests and the real client."""

    def run(
        self,
        argv: Sequence[str],
        *,
        timeout_seconds: float,
        stdin_text: str | None = None,
    ) -> GhProcessResult:
        """Execute one argv array without a command shell."""


class SubprocessGhTransport:
    """Launch ``gh`` directly with prompts, pagers, and colour disabled."""

    def __init__(self, environment: Mapping[str, str] | None = None) -> None:
        self._environment = dict(environment or {})

    def run(
        self,
        argv: Sequence[str],
        *,
        timeout_seconds: float,
        stdin_text: str | None = None,
    ) -> GhProcessResult:
        if not argv:
            raise ValueError("argv cannot be empty")

        environment = os.environ.copy()
        environment.update(self._environment)
        environment.update(
            {
                "GH_PROMPT_DISABLED": "1",
                "GH_NO_UPDATE_NOTIFIER": "1",
                "GH_PAGER": "cat",
                "PAGER": "cat",
                "NO_COLOR": "1",
                "CLICOLOR": "0",
            }
        )
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        if stdin_text is None:
            completed = subprocess.run(  # noqa: S603 - explicit argv, no shell.
                tuple(argv),
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                check=False,
                shell=False,
                env=environment,
                creationflags=creation_flags,
            )
        else:
            completed = subprocess.run(  # noqa: S603 - explicit argv, no shell.
                tuple(argv),
                input=stdin_text,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                check=False,
                shell=False,
                env=environment,
                creationflags=creation_flags,
            )
        return GhProcessResult(
            argv=tuple(argv),
            return_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )
