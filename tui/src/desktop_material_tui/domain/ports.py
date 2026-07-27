"""Dependency-injection ports used by application services."""

from __future__ import annotations

from collections.abc import Collection, Sequence
from pathlib import Path
from typing import Protocol, runtime_checkable

from .models import GitCommandResult


@runtime_checkable
class GitRunner(Protocol):
    def run(
        self,
        args: Sequence[str],
        *,
        cwd: Path,
        timeout: float | None = None,
        input_data: str | bytes | None = None,
        allowed_exit_codes: Collection[int] = (0,),
    ) -> GitCommandResult:
        """Run one Git invocation without passing through a shell."""
