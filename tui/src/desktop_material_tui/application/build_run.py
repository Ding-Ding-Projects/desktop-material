"""Bounded, terminal-native project detection and Build & Run execution.

The desktop application has a broad build-profile detector and a streaming
runner.  This module carries the same user outcome to Linux without importing
Electron assumptions: discovery is repository-confined and capped, commands
are immutable argv vectors, child processes never use a shell, output is
bounded, and cancellation terminates the complete process group.
"""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Literal

from ..infrastructure.persistence.atomic import atomic_write_text
from ..infrastructure.persistence.paths import XDGPaths

BuildStage = Literal["toolchain", "install", "build", "run"]
BuildStream = Literal["stdout", "stderr", "command", "meta"]
BuildEcosystem = Literal[
    "node",
    "deno",
    "rust",
    "go",
    "dotnet",
    "python",
    "java",
    "php",
    "ruby",
    "swift",
    "dart",
    "elixir",
    "scala",
    "haskell",
    "zig",
    "make",
    "cmake",
]

_MAX_WALK_DEPTH = 4
_MAX_WALK_ENTRIES = 4_000
_MAX_CANDIDATE_DIRECTORIES = 24
_MAX_PROFILES = 12
_MAX_MANIFEST_BYTES = 256 * 1_024
_MAX_OUTPUT_BYTES = 4 * 1_024 * 1_024
_MAX_COMMAND_ARGUMENTS = 128
_MAX_ARGUMENT_LENGTH = 4_096
_MAX_TIMEOUT_SECONDS = 6 * 60 * 60.0
_PROFILE_SCHEMA = 1
_MANAGED_IGNORE_BEGIN = "# desktop-material:build-artifacts begin"
_MANAGED_IGNORE_END = "# desktop-material:build-artifacts end"
_SHELL_EXECUTABLES = frozenset(
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
_SHELL_COMMAND_FLAGS = frozenset({"-c", "/c", "-command", "-encodedcommand"})

_SKIP_DIRECTORIES = frozenset(
    {
        ".git",
        ".venv",
        ".dart_tool",
        ".gradle",
        ".bundle",
        ".elixir_ls",
        "__pycache__",
        "bin",
        "build",
        "dist",
        "node_modules",
        "obj",
        "out",
        "target",
        "vendor",
    }
)

_MANIFEST_NAMES = frozenset(
    {
        "package.json",
        "deno.json",
        "deno.jsonc",
        "Cargo.toml",
        "go.mod",
        "pyproject.toml",
        "setup.py",
        "setup.cfg",
        "requirements.txt",
        "Pipfile",
        "poetry.lock",
        "environment.yml",
        "environment.yaml",
        "CMakeLists.txt",
        "Makefile",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "composer.json",
        "Gemfile",
        "Package.swift",
        "pubspec.yaml",
        "mix.exs",
        "build.sbt",
        "stack.yaml",
        "cabal.project",
        "build.zig",
        "main.py",
        "app.py",
        "manage.py",
    }
)


class BuildRunError(RuntimeError):
    """A build profile, filesystem operation, or child process was unsafe."""


@dataclass(frozen=True)
class BuildCommand:
    """One explicit executable invocation."""

    executable: str
    arguments: tuple[str, ...] = ()
    label: str = ""

    @property
    def argv(self) -> tuple[str, ...]:
        return (self.executable, *self.arguments)

    @property
    def display_label(self) -> str:
        return self.label or " ".join(self.argv)


@dataclass(frozen=True)
class BuildProfile:
    """A ranked, ready-to-review project profile."""

    id: str
    ecosystem: BuildEcosystem
    label: str
    working_directory: str
    toolchain: BuildCommand
    install: tuple[BuildCommand, ...] = ()
    build: tuple[BuildCommand, ...] = ()
    run: tuple[BuildCommand, ...] = ()
    ignore_patterns: tuple[str, ...] = ()
    score: int = 0
    reasons: tuple[str, ...] = ()

    @property
    def display_name(self) -> str:
        location = self.working_directory or "repository root"
        return f"{self.label} — {location}"


@dataclass(frozen=True)
class BuildEvent:
    """One ordered, bounded log event."""

    sequence: int
    stage: BuildStage
    stream: BuildStream
    text: str


@dataclass(frozen=True)
class BuildRunResult:
    """Observed result of a toolchain check and sequential stage execution."""

    profile_id: str
    exit_code: int
    completed_stages: tuple[BuildStage, ...]
    events: tuple[BuildEvent, ...]
    output: str
    duration_seconds: float
    cancelled: bool = False
    timed_out: bool = False
    output_truncated: bool = False

    @property
    def ok(self) -> bool:
        return (
            self.exit_code == 0
            and not self.cancelled
            and not self.timed_out
            and not self.output_truncated
        )

    def display_output(self, columns: int | None = None) -> str:
        """Return display-only truncation while preserving :attr:`output`."""

        if columns is None:
            return self.output
        if columns < 8:
            raise BuildRunError("Display width must be at least 8 columns")
        rendered = [
            line if len(line) <= columns else f"{line[: columns - 1]}…"
            for line in self.output.splitlines()
        ]
        return "\n".join(rendered)


@dataclass(frozen=True)
class BuildRunPreferences:
    """Non-secret, per-repository Build & Run preferences."""

    repository: str
    selected_profile_id: str = ""
    auto_ignore: bool = True
    auto_scroll: bool = True
    truncate_long_lines: bool = False
    truncate_columns: int = 160


@dataclass(frozen=True)
class IgnorePreview:
    """A reviewable managed `.gitignore` update."""

    path: Path
    previous_text: str
    next_text: str
    patterns: tuple[str, ...]

    @property
    def changed(self) -> bool:
        return self.previous_text != self.next_text


@dataclass(frozen=True)
class _RepositoryProbe:
    files: frozenset[str]
    candidates: tuple[str, ...]
    text: Mapping[str, str]

    def exists(self, directory: str, name: str) -> bool:
        path = _join_relative(directory, name)
        return path in self.files

    def read(self, directory: str, name: str) -> str | None:
        return self.text.get(_join_relative(directory, name))

    def top_level_suffixes(self, directory: str, suffix: str) -> tuple[str, ...]:
        prefix = f"{directory}/" if directory else ""
        matches = []
        for path in self.files:
            if not path.startswith(prefix):
                continue
            remaining = path[len(prefix) :]
            if "/" not in remaining and remaining.endswith(suffix):
                matches.append(remaining)
        return tuple(sorted(matches))


def _command(executable: str, *arguments: str, label: str = "") -> BuildCommand:
    return BuildCommand(executable, tuple(arguments), label)


def _join_relative(directory: str, name: str) -> str:
    return f"{directory}/{name}" if directory else name


def _safe_relative(value: str) -> str:
    normalized = value.replace("\\", "/").strip("/")
    path = PurePosixPath(normalized or ".")
    if path.is_absolute() or ".." in path.parts or "\x00" in normalized:
        raise BuildRunError("A detected project path escaped the repository")
    return "" if normalized in {"", "."} else normalized


class BuildRunService:
    """Detect, persist, prepare, and execute terminal-native build profiles."""

    def __init__(
        self,
        repository: str | Path,
        *,
        preferences_file: Path | None = None,
        maximum_output_bytes: int = _MAX_OUTPUT_BYTES,
    ) -> None:
        self.repository = Path(repository).expanduser().resolve()
        if not self.repository.is_dir():
            raise BuildRunError("Repository path is not a directory")
        if maximum_output_bytes < 1_024:
            raise BuildRunError("Output bound must be at least 1024 bytes")
        self.maximum_output_bytes = maximum_output_bytes
        self.preferences_file = preferences_file or self._default_preferences_file()

    def detect_profiles(self) -> tuple[BuildProfile, ...]:
        """Return at most twelve deterministic profiles from a bounded walk."""

        probe = self._probe_repository()
        profiles: list[BuildProfile] = []
        for directory in probe.candidates:
            profiles.extend(self._detect_directory(probe, directory))
        deduplicated = {profile.id: profile for profile in profiles}
        ranked = sorted(
            deduplicated.values(),
            key=lambda item: (-item.score, item.working_directory, item.label, item.id),
        )
        return tuple(ranked[:_MAX_PROFILES])

    def load_preferences(self) -> BuildRunPreferences:
        if not self.preferences_file.exists():
            return BuildRunPreferences(repository=str(self.repository))
        try:
            document = json.loads(self.preferences_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise BuildRunError(f"Could not read Build & Run preferences: {error}") from error
        if not isinstance(document, dict) or document.get("schema") != _PROFILE_SCHEMA:
            raise BuildRunError("Build & Run preferences use an unsupported schema")
        if document.get("repository") != str(self.repository):
            raise BuildRunError("Build & Run preferences belong to another repository")
        preferences = BuildRunPreferences(
            repository=str(self.repository),
            selected_profile_id=str(document.get("selected_profile_id", "")),
            auto_ignore=bool(document.get("auto_ignore", True)),
            auto_scroll=bool(document.get("auto_scroll", True)),
            truncate_long_lines=bool(document.get("truncate_long_lines", False)),
            truncate_columns=int(document.get("truncate_columns", 160)),
        )
        self._validate_preferences(preferences)
        return preferences

    def save_preferences(self, preferences: BuildRunPreferences) -> None:
        self._validate_preferences(preferences)
        document = {"schema": _PROFILE_SCHEMA, **asdict(preferences)}
        atomic_write_text(
            self.preferences_file,
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            mode=0o600,
        )

    def preview_auto_ignore(self, profile: BuildProfile) -> IgnorePreview:
        """Build an idempotent, reviewable managed artifacts section."""

        patterns = self._validated_ignore_patterns(profile.ignore_patterns)
        ignore_file = self.repository / ".gitignore"
        if ignore_file.is_symlink():
            raise BuildRunError("Refusing to replace a symlinked .gitignore")
        try:
            previous = ignore_file.read_text(encoding="utf-8") if ignore_file.exists() else ""
        except (OSError, UnicodeError) as error:
            raise BuildRunError(f"Could not read .gitignore: {error}") from error
        normalized = previous.replace("\r\n", "\n").replace("\r", "\n")
        next_text = self._replace_managed_ignore(normalized, patterns)
        return IgnorePreview(ignore_file, previous, next_text, patterns)

    def apply_auto_ignore(self, preview: IgnorePreview) -> None:
        """Apply an unchanged preview atomically, refusing a stale overwrite."""

        expected = self.repository / ".gitignore"
        if preview.path != expected or expected.is_symlink():
            raise BuildRunError("The Build & Run ignore preview is not repository-confined")
        try:
            current = expected.read_text(encoding="utf-8") if expected.exists() else ""
        except (OSError, UnicodeError) as error:
            raise BuildRunError(f"Could not re-read .gitignore: {error}") from error
        if current != preview.previous_text:
            raise BuildRunError(".gitignore changed after the preview; review it again")
        if preview.changed:
            atomic_write_text(expected, preview.next_text, mode=0o644)

    def run(
        self,
        profile: BuildProfile,
        *,
        include_install: bool = True,
        include_build: bool = True,
        include_run: bool = True,
        timeout_seconds: float = 30 * 60.0,
        cancel_event: threading.Event | None = None,
        on_event: Callable[[BuildEvent], None] | None = None,
        environment: Mapping[str, str] | None = None,
    ) -> BuildRunResult:
        """Check the toolchain and run selected stages sequentially."""

        if not 0 < timeout_seconds <= _MAX_TIMEOUT_SECONDS:
            raise BuildRunError(
                f"Timeout must be between 0 and {_MAX_TIMEOUT_SECONDS:g} seconds"
            )
        cancel = cancel_event or threading.Event()
        started = time.monotonic()
        events: list[BuildEvent] = []
        output_parts: list[str] = []
        output_bytes = 0
        sequence = 0
        completed: list[BuildStage] = []
        output_truncated = False
        timed_out = False
        cancelled = False
        exit_code = 0
        handler_error: Exception | None = None
        lock = threading.Lock()

        def emit(stage: BuildStage, stream: BuildStream, text: str) -> None:
            nonlocal sequence, output_bytes, output_truncated, handler_error
            clean = text.replace("\x00", "�")
            encoded = clean.encode("utf-8", errors="replace")
            with lock:
                if output_truncated:
                    return
                remaining = self.maximum_output_bytes - output_bytes
                if len(encoded) > remaining:
                    clean = encoded[:remaining].decode("utf-8", errors="ignore")
                    output_truncated = True
                    cancel.set()
                output_bytes += len(clean.encode("utf-8"))
                sequence += 1
                event = BuildEvent(sequence, stage, stream, clean)
                events.append(event)
                output_parts.append(clean)
            if on_event is not None and handler_error is None:
                try:
                    on_event(event)
                except Exception as error:  # callback belongs to the caller
                    handler_error = error
                    cancel.set()

        stages: list[tuple[BuildStage, tuple[BuildCommand, ...]]] = [
            ("toolchain", (profile.toolchain,))
        ]
        if include_install and profile.install:
            stages.append(("install", profile.install))
        if include_build and profile.build:
            stages.append(("build", profile.build))
        if include_run and profile.run:
            stages.append(("run", profile.run))

        cwd = self._resolve_profile_directory(profile.working_directory)
        child_environment = self._child_environment(environment)
        for stage, commands in stages:
            for command in commands:
                if cancel.is_set():
                    cancelled = not output_truncated
                    exit_code = 130
                    break
                elapsed = time.monotonic() - started
                remaining_timeout = timeout_seconds - elapsed
                if remaining_timeout <= 0:
                    timed_out = True
                    exit_code = 124
                    break
                emit(stage, "command", f"$ {command.display_label}\n")

                def emit_child(
                    stream: Literal["stdout", "stderr"],
                    text: str,
                    current_stage: BuildStage = stage,
                ) -> None:
                    emit(current_stage, stream, text)

                command_result = self._run_command(
                    command,
                    cwd=cwd,
                    environment=child_environment,
                    timeout_seconds=remaining_timeout,
                    cancel_event=cancel,
                    emit=emit_child,
                )
                exit_code, command_cancelled, command_timed_out = command_result
                if command_cancelled:
                    cancelled = not output_truncated
                if command_timed_out:
                    timed_out = True
                if exit_code != 0:
                    break
            if exit_code != 0 or cancel.is_set():
                break
            completed.append(stage)

        if handler_error is not None:
            raise BuildRunError(f"Build log handler failed: {handler_error}") from handler_error
        if output_truncated:
            emit_message = "Build output exceeded the configured bound; the process was stopped.\n"
            sequence += 1
            events.append(BuildEvent(sequence, stages[-1][0], "meta", emit_message))
            output_parts.append(emit_message)
            exit_code = 125
        return BuildRunResult(
            profile_id=profile.id,
            exit_code=exit_code,
            completed_stages=tuple(completed),
            events=tuple(events),
            output="".join(output_parts),
            duration_seconds=time.monotonic() - started,
            cancelled=cancelled,
            timed_out=timed_out,
            output_truncated=output_truncated,
        )

    def _probe_repository(self) -> _RepositoryProbe:
        files: set[str] = set()
        candidate_directories: set[str] = set()
        text: dict[str, str] = {}
        pending: list[tuple[Path, str, int]] = [(self.repository, "", 0)]
        entries_seen = 0
        while pending and entries_seen < _MAX_WALK_ENTRIES:
            directory, relative_directory, depth = pending.pop()
            try:
                entries = sorted(directory.iterdir(), key=lambda item: item.name.casefold())
            except OSError:
                continue
            for entry in entries:
                entries_seen += 1
                if entries_seen > _MAX_WALK_ENTRIES:
                    break
                relative = _join_relative(relative_directory, entry.name)
                try:
                    is_symlink = entry.is_symlink()
                    is_directory = entry.is_dir()
                except OSError:
                    continue
                if is_directory:
                    if (
                        depth < _MAX_WALK_DEPTH
                        and entry.name not in _SKIP_DIRECTORIES
                        and not is_symlink
                    ):
                        pending.append((entry, relative, depth + 1))
                    continue
                files.add(relative)
                if entry.name in _MANIFEST_NAMES or entry.suffix in {
                    ".sln",
                    ".slnx",
                    ".csproj",
                    ".fsproj",
                    ".vbproj",
                    ".cabal",
                }:
                    candidate_directories.add(relative_directory)
                if entry.name in _MANIFEST_NAMES:
                    try:
                        if entry.stat().st_size <= _MAX_MANIFEST_BYTES:
                            text[relative] = entry.read_text(encoding="utf-8")
                    except (OSError, UnicodeError):
                        pass
        ordered_candidates = sorted(
            candidate_directories,
            key=lambda value: (value.count("/"), value.casefold()),
        )[:_MAX_CANDIDATE_DIRECTORIES]
        return _RepositoryProbe(frozenset(files), tuple(ordered_candidates), text)

    def _detect_directory(
        self, probe: _RepositoryProbe, directory: str
    ) -> list[BuildProfile]:
        profiles: list[BuildProfile] = []
        detectors = (
            self._detect_node,
            self._detect_deno,
            self._detect_rust,
            self._detect_go,
            self._detect_dotnet,
            self._detect_python,
            self._detect_java,
            self._detect_php,
            self._detect_ruby,
            self._detect_swift,
            self._detect_dart,
            self._detect_elixir,
            self._detect_scala,
            self._detect_haskell,
            self._detect_zig,
            self._detect_make,
            self._detect_cmake,
        )
        for detector in detectors:
            profile = detector(probe, directory)
            if profile is not None:
                profiles.append(profile)
        return profiles

    def _profile(
        self,
        *,
        ecosystem: BuildEcosystem,
        directory: str,
        label: str,
        toolchain: BuildCommand,
        install: Sequence[BuildCommand] = (),
        build: Sequence[BuildCommand] = (),
        run: Sequence[BuildCommand] = (),
        ignores: Sequence[str] = (),
        score: int = 10,
        reasons: Sequence[str] = (),
    ) -> BuildProfile:
        directory = _safe_relative(directory)
        nested_penalty = directory.count("/") + (1 if directory else 0)
        digest = hashlib.sha256(f"{ecosystem}\0{directory}\0{label}".encode()).hexdigest()[:16]
        return BuildProfile(
            id=f"{ecosystem}:{digest}",
            ecosystem=ecosystem,
            label=label,
            working_directory=directory,
            toolchain=toolchain,
            install=tuple(install),
            build=tuple(build),
            run=tuple(run),
            ignore_patterns=tuple(ignores),
            score=score - nested_penalty,
            reasons=tuple(reasons),
        )

    def _detect_node(
        self, probe: _RepositoryProbe, directory: str
    ) -> BuildProfile | None:
        if not probe.exists(directory, "package.json"):
            return None
        raw = probe.read(directory, "package.json") or "{}"
        try:
            document = json.loads(raw)
        except json.JSONDecodeError:
            document = {}
        scripts = document.get("scripts", {}) if isinstance(document, dict) else {}
        scripts = scripts if isinstance(scripts, dict) else {}
        install_args: tuple[str, ...]
        if probe.exists(directory, "pnpm-lock.yaml"):
            manager, install_args = "pnpm", ("install", "--frozen-lockfile")
        elif probe.exists(directory, "yarn.lock"):
            manager, install_args = "yarn", ("install", "--frozen-lockfile")
        elif probe.exists(directory, "bun.lock") or probe.exists(directory, "bun.lockb"):
            manager, install_args = "bun", ("install", "--frozen-lockfile")
        else:
            manager = "npm"
            install_args = ("ci",) if probe.exists(directory, "package-lock.json") else ("install",)
        build = (_command(manager, "run", "build"),) if "build" in scripts else ()
        run_name = next((name for name in ("dev", "start", "serve") if name in scripts), None)
        run = (_command(manager, "run", run_name),) if run_name else ()
        return self._profile(
            ecosystem="node",
            directory=directory,
            label=f"Node ({manager})",
            toolchain=_command(manager, "--version"),
            install=(_command(manager, *install_args),),
            build=build,
            run=run,
            ignores=("node_modules/", "dist/", "build/", "coverage/", ".next/", "out/"),
            score=13 if install_args[0] in {"ci", "install"} else 10,
            reasons=("package.json found", f"{manager} selected"),
        )

    def _detect_deno(
        self, probe: _RepositoryProbe, directory: str
    ) -> BuildProfile | None:
        manifest = "deno.json" if probe.exists(directory, "deno.json") else "deno.jsonc"
        if not probe.exists(directory, manifest):
            return None
        raw = probe.read(directory, manifest) or ""
        build = (_command("deno", "task", "build"),) if '"build"' in raw else ()
        run_task = next((name for name in ("dev", "start", "serve") if f'"{name}"' in raw), None)
        run = (_command("deno", "task", run_task),) if run_task else ()
        return self._profile(
            ecosystem="deno",
            directory=directory,
            label="Deno",
            toolchain=_command("deno", "--version"),
            build=build,
            run=run,
            ignores=(".deno/", "coverage/"),
            reasons=(f"{manifest} found",),
        )

    def _detect_rust(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "Cargo.toml"):
            return None
        return self._profile(
            ecosystem="rust",
            directory=directory,
            label="Rust (Cargo)",
            toolchain=_command("cargo", "--version"),
            build=(_command("cargo", "build"),),
            run=(_command("cargo", "run"),),
            ignores=("target/",),
            reasons=("Cargo.toml found",),
        )

    def _detect_go(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "go.mod"):
            return None
        return self._profile(
            ecosystem="go",
            directory=directory,
            label="Go module",
            toolchain=_command("go", "version"),
            install=(_command("go", "mod", "download"),),
            build=(_command("go", "build", "./..."),),
            run=(_command("go", "run", "."),),
            ignores=("bin/", "coverage.out"),
            reasons=("go.mod found",),
        )

    def _detect_dotnet(
        self, probe: _RepositoryProbe, directory: str
    ) -> BuildProfile | None:
        projects = (
            probe.top_level_suffixes(directory, ".sln")
            + probe.top_level_suffixes(directory, ".slnx")
            + probe.top_level_suffixes(directory, ".csproj")
            + probe.top_level_suffixes(directory, ".fsproj")
            + probe.top_level_suffixes(directory, ".vbproj")
        )
        if not projects:
            return None
        target = projects[0]
        return self._profile(
            ecosystem="dotnet",
            directory=directory,
            label=f".NET ({target})",
            toolchain=_command("dotnet", "--version"),
            install=(_command("dotnet", "restore", target),),
            build=(_command("dotnet", "build", target, "--no-restore"),),
            run=(_command("dotnet", "run", "--project", target, "--no-build"),),
            ignores=("bin/", "obj/", ".vs/"),
            reasons=(f"{target} found",),
        )

    def _detect_python(
        self, probe: _RepositoryProbe, directory: str
    ) -> BuildProfile | None:
        markers = tuple(
            name
            for name in ("pyproject.toml", "setup.py", "requirements.txt", "Pipfile")
            if probe.exists(directory, name)
        )
        entry = next(
            (name for name in ("manage.py", "main.py", "app.py") if probe.exists(directory, name)),
            None,
        )
        if not markers and entry is None:
            return None
        install: tuple[BuildCommand, ...]
        run: tuple[BuildCommand, ...]
        if probe.exists(directory, "requirements.txt"):
            install = (_command("python3", "-m", "pip", "install", "-r", "requirements.txt"),)
        elif probe.exists(directory, "pyproject.toml") or probe.exists(directory, "setup.py"):
            install = (_command("python3", "-m", "pip", "install", "-e", "."),)
        else:
            install = ()
        run = ()
        if entry == "manage.py":
            run = (_command("python3", "manage.py", "runserver"),)
        elif entry is not None:
            run = (_command("python3", entry),)
        return self._profile(
            ecosystem="python",
            directory=directory,
            label="Python",
            toolchain=_command("python3", "--version"),
            install=install,
            build=(
                (_command("python3", "-m", "build"),)
                if probe.exists(directory, "pyproject.toml")
                else ()
            ),
            run=run,
            ignores=(".venv/", "venv/", "__pycache__/", "*.pyc", "dist/", "build/"),
            reasons=((*markers, entry) if entry is not None else markers),
        )

    def _detect_java(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        gradle = probe.exists(directory, "build.gradle") or probe.exists(
            directory, "build.gradle.kts"
        )
        maven = probe.exists(directory, "pom.xml")
        if not gradle and not maven:
            return None
        if gradle:
            executable = "./gradlew" if probe.exists(directory, "gradlew") else "gradle"
            return self._profile(
                ecosystem="java",
                directory=directory,
                label="Java/Kotlin (Gradle)",
                toolchain=_command(executable, "--version"),
                build=(_command(executable, "build"),),
                run=(_command(executable, "run"),),
                ignores=(".gradle/", "build/"),
                reasons=("Gradle build found",),
            )
        executable = "./mvnw" if probe.exists(directory, "mvnw") else "mvn"
        return self._profile(
            ecosystem="java",
            directory=directory,
            label="Java/Kotlin (Maven)",
            toolchain=_command(executable, "--version"),
            build=(_command(executable, "package"),),
            run=(_command(executable, "spring-boot:run"),),
            ignores=("target/",),
            reasons=("pom.xml found",),
        )

    def _detect_php(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "composer.json"):
            return None
        return self._profile(
            ecosystem="php",
            directory=directory,
            label="PHP (Composer)",
            toolchain=_command("php", "--version"),
            install=(_command("composer", "install", "--no-interaction"),),
            run=(_command("php", "-S", "127.0.0.1:8000", "-t", "public"),),
            ignores=("vendor/",),
            reasons=("composer.json found",),
        )

    def _detect_ruby(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "Gemfile"):
            return None
        run = (
            _command("bundle", "exec", "rails", "server")
            if probe.exists(directory, "config.ru")
            else _command("bundle", "exec", "ruby", "app.rb")
        )
        return self._profile(
            ecosystem="ruby",
            directory=directory,
            label="Ruby (Bundler)",
            toolchain=_command("ruby", "--version"),
            install=(_command("bundle", "install"),),
            run=(run,),
            ignores=(".bundle/", "vendor/bundle/", "log/", "tmp/"),
            reasons=("Gemfile found",),
        )

    def _detect_swift(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "Package.swift"):
            return None
        return self._profile(
            ecosystem="swift",
            directory=directory,
            label="Swift Package",
            toolchain=_command("swift", "--version"),
            build=(_command("swift", "build"),),
            run=(_command("swift", "run"),),
            ignores=(".build/", ".swiftpm/"),
            reasons=("Package.swift found",),
        )

    def _detect_dart(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "pubspec.yaml"):
            return None
        raw = probe.read(directory, "pubspec.yaml") or ""
        flutter = "flutter:" in raw
        executable = "flutter" if flutter else "dart"
        return self._profile(
            ecosystem="dart",
            directory=directory,
            label="Flutter" if flutter else "Dart",
            toolchain=_command(executable, "--version"),
            install=(_command(executable, "pub", "get"),),
            build=(_command(executable, "build", "bundle"),) if flutter else (),
            run=(_command(executable, "run"),),
            ignores=(".dart_tool/", "build/", ".packages"),
            reasons=("pubspec.yaml found",),
        )

    def _detect_elixir(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "mix.exs"):
            return None
        raw = probe.read(directory, "mix.exs") or ""
        run = _command("mix", "phx.server") if "Phoenix" in raw else _command("mix", "run")
        return self._profile(
            ecosystem="elixir",
            directory=directory,
            label="Elixir (Mix)",
            toolchain=_command("elixir", "--version"),
            install=(_command("mix", "deps.get"),),
            build=(_command("mix", "compile"),),
            run=(run,),
            ignores=("_build/", "deps/", ".elixir_ls/"),
            reasons=("mix.exs found",),
        )

    def _detect_scala(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "build.sbt"):
            return None
        return self._profile(
            ecosystem="scala",
            directory=directory,
            label="Scala (sbt)",
            toolchain=_command("sbt", "--version"),
            build=(_command("sbt", "compile"),),
            run=(_command("sbt", "run"),),
            ignores=("target/", "project/target/"),
            reasons=("build.sbt found",),
        )

    def _detect_haskell(
        self, probe: _RepositoryProbe, directory: str
    ) -> BuildProfile | None:
        stack = probe.exists(directory, "stack.yaml")
        cabal = probe.exists(directory, "cabal.project") or bool(
            probe.top_level_suffixes(directory, ".cabal")
        )
        if not stack and not cabal:
            return None
        executable = "stack" if stack else "cabal"
        return self._profile(
            ecosystem="haskell",
            directory=directory,
            label="Haskell (Stack)" if stack else "Haskell (Cabal)",
            toolchain=_command(executable, "--version"),
            build=(_command(executable, "build"),),
            run=(_command(executable, "run"),),
            ignores=(".stack-work/", "dist-newstyle/"),
            reasons=(("stack.yaml found",) if stack else ("Cabal project found",)),
        )

    def _detect_zig(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "build.zig"):
            return None
        return self._profile(
            ecosystem="zig",
            directory=directory,
            label="Zig",
            toolchain=_command("zig", "version"),
            build=(_command("zig", "build"),),
            run=(_command("zig", "build", "run"),),
            ignores=("zig-cache/", ".zig-cache/", "zig-out/"),
            reasons=("build.zig found",),
        )

    def _detect_make(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "Makefile"):
            return None
        return self._profile(
            ecosystem="make",
            directory=directory,
            label="Make",
            toolchain=_command("make", "--version"),
            build=(_command("make"),),
            ignores=("build/", "out/"),
            score=8,
            reasons=("Makefile found",),
        )

    def _detect_cmake(self, probe: _RepositoryProbe, directory: str) -> BuildProfile | None:
        if not probe.exists(directory, "CMakeLists.txt"):
            return None
        return self._profile(
            ecosystem="cmake",
            directory=directory,
            label="CMake",
            toolchain=_command("cmake", "--version"),
            install=(_command("cmake", "-S", ".", "-B", "build"),),
            build=(_command("cmake", "--build", "build"),),
            ignores=("build/", "CMakeFiles/", "CMakeCache.txt"),
            reasons=("CMakeLists.txt found",),
        )

    def _run_command(
        self,
        command: BuildCommand,
        *,
        cwd: Path,
        environment: Mapping[str, str],
        timeout_seconds: float,
        cancel_event: threading.Event,
        emit: Callable[[Literal["stdout", "stderr"], str], None],
    ) -> tuple[int, bool, bool]:
        argv = self._validated_argv(command, cwd)
        try:
            process: subprocess.Popen[bytes] = subprocess.Popen(  # noqa: S603
                argv,
                cwd=str(cwd),
                env=dict(environment),
                stdin=subprocess.DEVNULL,
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
            raise BuildRunError(f"Could not start {argv[0]!r}: {error}") from error

        def read_stream(
            pipe: object, stream: Literal["stdout", "stderr"]
        ) -> None:
            if pipe is None or not hasattr(pipe, "readline"):
                return
            readline = pipe.readline
            while True:
                chunk = readline(8_192)
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
        if timed_out:
            return 124, False, True
        if cancelled:
            return 130, True, False
        return exit_code, False, False

    def _validated_argv(self, command: BuildCommand, cwd: Path) -> tuple[str, ...]:
        argv = command.argv
        if not argv or len(argv) > _MAX_COMMAND_ARGUMENTS:
            raise BuildRunError("A build command has an invalid argument count")
        for argument in argv:
            if (
                not argument
                or "\x00" in argument
                or "\n" in argument
                or "\r" in argument
                or len(argument) > _MAX_ARGUMENT_LENGTH
            ):
                raise BuildRunError("A build command contains an invalid argument")
        executable = argv[0]
        if Path(executable).name.casefold() in _SHELL_EXECUTABLES and any(
            argument.casefold() in _SHELL_COMMAND_FLAGS for argument in argv[1:]
        ):
            raise BuildRunError(
                "Shell command modes are disabled; run a reviewed script file instead"
            )
        if executable.startswith(("./", "../")):
            resolved = (cwd / executable).resolve()
            try:
                resolved.relative_to(self.repository)
            except ValueError as error:
                raise BuildRunError("A build executable escaped the repository") from error
            if not resolved.is_file():
                raise BuildRunError(f"Build executable {executable!r} does not exist")
        return argv

    def _resolve_profile_directory(self, value: str) -> Path:
        relative = _safe_relative(value)
        target = (self.repository / relative).resolve()
        try:
            target.relative_to(self.repository)
        except ValueError as error:
            raise BuildRunError("Build profile working directory escaped the repository") from error
        if not target.is_dir():
            raise BuildRunError("Build profile working directory does not exist")
        return target

    @staticmethod
    def _child_environment(overrides: Mapping[str, str] | None) -> dict[str, str]:
        environment = os.environ.copy()
        if overrides is not None:
            for key, value in overrides.items():
                if not key or "=" in key or "\x00" in key or "\x00" in value:
                    raise BuildRunError("Build environment contains an invalid entry")
                environment[key] = value
        environment.update(
            {
                "GIT_TERMINAL_PROMPT": "0",
                "GCM_INTERACTIVE": "Never",
                "PAGER": "cat",
            }
        )
        return environment

    @staticmethod
    def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        kill_process_group = getattr(os, "killpg", None)
        try:
            if os.name == "posix" and kill_process_group is not None:
                kill_process_group(process.pid, signal.SIGTERM)
            else:
                process.terminate()
            process.wait(timeout=2)
        except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
            try:
                if os.name == "posix" and kill_process_group is not None:
                    kill_process_group(
                        process.pid,
                        getattr(signal, "SIGKILL", signal.SIGTERM),
                    )
                else:
                    process.kill()
            except (OSError, ProcessLookupError):
                pass

    @staticmethod
    def _validated_ignore_patterns(patterns: Sequence[str]) -> tuple[str, ...]:
        result: list[str] = []
        for pattern in patterns:
            normalized = pattern.strip().replace("\\", "/")
            if (
                not normalized
                or "\x00" in normalized
                or "\n" in normalized
                or normalized.startswith("/")
                or ".." in PurePosixPath(normalized).parts
            ):
                raise BuildRunError("A build artifact ignore pattern is unsafe")
            if normalized not in result:
                result.append(normalized)
        return tuple(result)

    @staticmethod
    def _replace_managed_ignore(text: str, patterns: Sequence[str]) -> str:
        lines = text.splitlines()
        try:
            start = lines.index(_MANAGED_IGNORE_BEGIN)
        except ValueError:
            start = -1
        try:
            end = lines.index(_MANAGED_IGNORE_END)
        except ValueError:
            end = -1
        if (start == -1) != (end == -1) or (start != -1 and end < start):
            raise BuildRunError("The managed Build & Run .gitignore section is malformed")
        section = [_MANAGED_IGNORE_BEGIN, *patterns, _MANAGED_IGNORE_END]
        if start == -1:
            while lines and not lines[-1]:
                lines.pop()
            if lines:
                lines.append("")
            lines.extend(section)
        else:
            lines[start : end + 1] = section
        return "\n".join(lines).rstrip("\n") + "\n"

    def _validate_preferences(self, preferences: BuildRunPreferences) -> None:
        if Path(preferences.repository).expanduser().resolve() != self.repository:
            raise BuildRunError("Build & Run preferences belong to another repository")
        if len(preferences.selected_profile_id) > 256 or "\x00" in preferences.selected_profile_id:
            raise BuildRunError("Selected Build & Run profile id is invalid")
        if not 40 <= preferences.truncate_columns <= 2_000:
            raise BuildRunError("Long-line display width must be between 40 and 2000")

    def _default_preferences_file(self) -> Path:
        paths = XDGPaths.discover().ensure()
        digest = hashlib.sha256(str(self.repository).encode()).hexdigest()
        return paths.config_dir / "build-run" / f"{digest}.json"
