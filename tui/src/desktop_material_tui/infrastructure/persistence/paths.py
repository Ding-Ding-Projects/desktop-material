"""XDG-compliant application paths.

The terminal application deliberately keeps its own state outside repositories
opened by the user.  This is especially important for Git-backed settings
history: creating a nested ``.git`` directory in a working copy would be both
surprising and unsafe.
"""

from __future__ import annotations

import contextlib
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

APPLICATION_ID = "desktop-material-tui"


def _absolute_xdg_path(
    environment: Mapping[str, str],
    variable: str,
    fallback: Path,
) -> Path:
    """Return an absolute XDG path, ignoring invalid relative overrides."""

    value = environment.get(variable)
    if value:
        candidate = Path(value).expanduser()
        if candidate.is_absolute():
            return candidate
    return fallback


@dataclass(frozen=True)
class XDGPaths:
    """All durable and ephemeral paths owned by Desktop Material TUI."""

    config_dir: Path
    data_dir: Path
    state_dir: Path
    cache_dir: Path
    runtime_dir: Path

    @classmethod
    def discover(
        cls,
        *,
        environment: Mapping[str, str] | None = None,
        home: Path | None = None,
        application_id: str = APPLICATION_ID,
    ) -> XDGPaths:
        """Resolve paths according to the XDG Base Directory specification.

        Relative XDG environment values are invalid according to the
        specification and are ignored.  ``home`` and ``environment`` are
        injectable so tests and embedders never need to modify process-global
        state.
        """

        env = os.environ if environment is None else environment
        resolved_home = home
        if resolved_home is None:
            env_home = env.get("HOME")
            resolved_home = Path(env_home).expanduser() if env_home else Path.home()
        resolved_home = resolved_home.resolve()

        config_root = _absolute_xdg_path(env, "XDG_CONFIG_HOME", resolved_home / ".config")
        data_root = _absolute_xdg_path(env, "XDG_DATA_HOME", resolved_home / ".local" / "share")
        state_root = _absolute_xdg_path(env, "XDG_STATE_HOME", resolved_home / ".local" / "state")
        cache_root = _absolute_xdg_path(env, "XDG_CACHE_HOME", resolved_home / ".cache")

        runtime_override = env.get("XDG_RUNTIME_DIR")
        if runtime_override and Path(runtime_override).expanduser().is_absolute():
            runtime_dir = Path(runtime_override).expanduser() / application_id
        else:
            runtime_dir = state_root / application_id / "run"

        return cls(
            config_dir=config_root / application_id,
            data_dir=data_root / application_id,
            state_dir=state_root / application_id,
            cache_dir=cache_root / application_id,
            runtime_dir=runtime_dir,
        )

    @property
    def config_file(self) -> Path:
        return self.config_dir / "config.toml"

    @property
    def database_file(self) -> Path:
        return self.data_dir / "desktop-material-tui.sqlite3"

    @property
    def profile_history_root(self) -> Path:
        return self.data_dir / "profile-history"

    @property
    def lock_dir(self) -> Path:
        return self.state_dir / "locks"

    def ensure(self) -> XDGPaths:
        """Create app-owned directories with private permissions when possible."""

        for directory in (
            self.config_dir,
            self.data_dir,
            self.state_dir,
            self.cache_dir,
            self.runtime_dir,
            self.profile_history_root,
            self.lock_dir,
        ):
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            with contextlib.suppress(OSError):
                directory.chmod(0o700)
        return self


# Friendly alias for callers that do not need to mention the XDG standard.
AppPaths = XDGPaths
