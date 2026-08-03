"""Build & Run detection, persistence, preparation, and process safety."""

from __future__ import annotations

import sys
import threading
from contextlib import suppress
from pathlib import Path

import pytest

from desktop_material_tui.application.build_run import (
    BuildCommand,
    BuildEcosystem,
    BuildProfile,
    BuildRunError,
    BuildRunPreferences,
    BuildRunService,
)


def _write_tree(root: Path, files: dict[str, str]) -> None:
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


@pytest.mark.parametrize(
    ("files", "expected"),
    [
        (
            {
                "package.json": '{"scripts":{"build":"tool","start":"tool"}}',
                "package-lock.json": "{}",
            },
            "node",
        ),
        ({"deno.json": '{"tasks":{"build":"x","start":"x"}}'}, "deno"),
        ({"Cargo.toml": "[package]\nname='demo'\n"}, "rust"),
        ({"go.mod": "module example.test/demo\n"}, "go"),
        ({"demo.csproj": "<Project />\n"}, "dotnet"),
        ({"main.py": "print('ok')\n"}, "python"),
        ({"build.gradle": "plugins {}\n"}, "java"),
        ({"composer.json": "{}\n"}, "php"),
        ({"Gemfile": "source 'https://rubygems.org'\n"}, "ruby"),
        ({"Package.swift": "// swift-tools-version: 6.0\n"}, "swift"),
        ({"pubspec.yaml": "name: demo\nflutter:\n  uses-material-design: true\n"}, "dart"),
        ({"mix.exs": "defmodule Demo.MixProject do\nend\n"}, "elixir"),
        ({"build.sbt": 'name := "demo"\n'}, "scala"),
        ({"stack.yaml": "resolver: lts-22.0\n"}, "haskell"),
        ({"build.zig": "const std = @import(\"std\");\n"}, "zig"),
        ({"Makefile": "all:\n\t@echo ok\n"}, "make"),
        ({"CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\n"}, "cmake"),
    ],
)
def test_detects_every_declared_ecosystem(
    tmp_path: Path,
    files: dict[str, str],
    expected: BuildEcosystem,
) -> None:
    _write_tree(tmp_path, files)

    profiles = BuildRunService(tmp_path).detect_profiles()

    matching = [profile for profile in profiles if profile.ecosystem == expected]
    assert len(matching) == 1
    assert matching[0].display_name.endswith("repository root")
    assert matching[0].toolchain.argv
    assert matching[0].reasons


def test_detection_is_bounded_ranked_nested_and_symlink_safe(tmp_path: Path) -> None:
    _write_tree(
        tmp_path,
        {
            "package.json": '{"scripts":{"start":"node index.js"}}',
            "package-lock.json": "{}",
            "apps/api/go.mod": "module example.test/api\n",
            "apps/api/main.go": "package main\n",
            "too/deep/for/the/walk/Cargo.toml": "[package]\nname='hidden'\n",
        },
    )
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (outside / "pyproject.toml").write_text("[project]\nname='outside'\n", encoding="utf-8")
    link = tmp_path / "linked-outside"
    with suppress(OSError):
        link.symlink_to(outside, target_is_directory=True)

    profiles = BuildRunService(tmp_path).detect_profiles()

    assert profiles[0].ecosystem == "node"
    assert any(
        profile.ecosystem == "go" and profile.working_directory == "apps/api"
        for profile in profiles
    )
    assert not any(profile.ecosystem == "rust" for profile in profiles)
    assert not any("linked-outside" in profile.working_directory for profile in profiles)
    assert len(profiles) <= 12


def test_node_lockfile_and_script_commands_are_explicit_argv(tmp_path: Path) -> None:
    _write_tree(
        tmp_path,
        {
            "package.json": '{"scripts":{"build":"webpack","dev":"vite"}}',
            "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
        },
    )

    profile = BuildRunService(tmp_path).detect_profiles()[0]

    assert profile.install[0].argv == ("pnpm", "install", "--frozen-lockfile")
    assert profile.build[0].argv == ("pnpm", "run", "build")
    assert profile.run[0].argv == ("pnpm", "run", "dev")
    assert "node_modules/" in profile.ignore_patterns


def test_preferences_are_atomic_bounded_and_repository_scoped(tmp_path: Path) -> None:
    preferences_file = tmp_path / "state" / "build-run.json"
    service = BuildRunService(tmp_path, preferences_file=preferences_file)
    preferences = BuildRunPreferences(
        repository=str(tmp_path.resolve()),
        selected_profile_id="node:abc",
        auto_ignore=False,
        auto_scroll=False,
        truncate_long_lines=True,
        truncate_columns=120,
    )

    service.save_preferences(preferences)

    assert service.load_preferences() == preferences
    assert preferences_file.exists()
    with pytest.raises(BuildRunError, match="another repository"):
        service.save_preferences(
            BuildRunPreferences(repository=str(tmp_path.parent), truncate_columns=120)
        )
    with pytest.raises(BuildRunError, match="between 40 and 2000"):
        service.save_preferences(
            BuildRunPreferences(repository=str(tmp_path.resolve()), truncate_columns=20)
        )


def test_auto_ignore_is_reviewable_idempotent_and_stale_safe(tmp_path: Path) -> None:
    ignore = tmp_path / ".gitignore"
    ignore.write_text("existing/\r\n", encoding="utf-8")
    service = BuildRunService(tmp_path)
    profile = _profile(tmp_path, ignores=("dist/", "coverage/", "dist/"))

    preview = service.preview_auto_ignore(profile)

    assert preview.changed
    assert preview.patterns == ("dist/", "coverage/")
    assert "existing/\n\n# desktop-material:build-artifacts begin" in preview.next_text
    service.apply_auto_ignore(preview)
    assert service.preview_auto_ignore(profile).changed is False

    stale = service.preview_auto_ignore(
        _profile(tmp_path, ignores=("dist/", "coverage/", "tmp/"))
    )
    ignore.write_text(ignore.read_text(encoding="utf-8") + "user-change/\n", encoding="utf-8")
    with pytest.raises(BuildRunError, match="changed after the preview"):
        service.apply_auto_ignore(stale)


def test_auto_ignore_rejects_escape_and_symlink(tmp_path: Path) -> None:
    service = BuildRunService(tmp_path)
    with pytest.raises(BuildRunError, match="unsafe"):
        service.preview_auto_ignore(_profile(tmp_path, ignores=("../escape",)))

    target = tmp_path / "real-ignore"
    target.write_text("", encoding="utf-8")
    ignore = tmp_path / ".gitignore"
    try:
        ignore.symlink_to(target)
    except OSError:
        pytest.skip("This host does not permit test symlinks")
    with pytest.raises(BuildRunError, match="symlinked"):
        service.preview_auto_ignore(_profile(tmp_path, ignores=("dist/",)))


def test_runner_streams_sequential_stages_and_preserves_full_output(tmp_path: Path) -> None:
    script = tmp_path / "runner.py"
    script.write_text(
        "import sys\nprint('stage=' + sys.argv[1])\nprint('wide=' + 'x' * 80)\n",
        encoding="utf-8",
    )
    executable = sys.executable
    profile = BuildProfile(
        id="python:test",
        ecosystem="python",
        label="Python test",
        working_directory="",
        toolchain=BuildCommand(executable, ("--version",)),
        install=(BuildCommand(executable, ("runner.py", "install")),),
        build=(BuildCommand(executable, ("runner.py", "build")),),
        run=(BuildCommand(executable, ("runner.py", "run")),),
    )
    observed: list[tuple[str, str]] = []

    result = BuildRunService(tmp_path).run(
        profile,
        on_event=lambda event: observed.append((event.stage, event.stream)),
    )

    assert result.ok
    assert result.completed_stages == ("toolchain", "install", "build", "run")
    assert "stage=install" in result.output
    assert "stage=build" in result.output
    assert "stage=run" in result.output
    assert "wide=" + "x" * 80 in result.output
    assert "…" in result.display_output(40)
    assert observed[0] == ("toolchain", "command")


def test_runner_cancels_process_group_and_reports_timeout(tmp_path: Path) -> None:
    script = tmp_path / "wait.py"
    script.write_text(
        "import time\nprint('started', flush=True)\ntime.sleep(30)\n",
        encoding="utf-8",
    )
    profile = _profile(
        tmp_path,
        toolchain=BuildCommand(sys.executable, ("--version",)),
        run=(BuildCommand(sys.executable, ("wait.py",)),),
    )
    cancel = threading.Event()

    cancelled = BuildRunService(tmp_path).run(
        profile,
        cancel_event=cancel,
        on_event=lambda event: cancel.set() if "started" in event.text else None,
    )
    timed_out = BuildRunService(tmp_path).run(profile, timeout_seconds=0.2)

    assert cancelled.cancelled
    assert cancelled.exit_code == 130
    assert timed_out.timed_out
    assert timed_out.exit_code == 124


def test_runner_stops_on_bounded_output_and_rejects_shell_mode(tmp_path: Path) -> None:
    script = tmp_path / "loud.py"
    script.write_text("print('x' * 10000, flush=True)\n", encoding="utf-8")
    loud = _profile(
        tmp_path,
        toolchain=BuildCommand(sys.executable, ("--version",)),
        run=(BuildCommand(sys.executable, ("loud.py",)),),
    )

    result = BuildRunService(tmp_path, maximum_output_bytes=1_024).run(loud)

    assert result.output_truncated
    assert result.exit_code == 125
    assert len(result.output.encode("utf-8")) <= 1_200

    shell = _profile(
        tmp_path,
        toolchain=BuildCommand("sh", ("-c", "printf unsafe")),
    )
    with pytest.raises(BuildRunError, match="Shell command modes are disabled"):
        BuildRunService(tmp_path).run(shell)


def _profile(
    repository: Path,
    *,
    toolchain: BuildCommand | None = None,
    run: tuple[BuildCommand, ...] = (),
    ignores: tuple[str, ...] = (),
) -> BuildProfile:
    del repository
    return BuildProfile(
        id="python:fixture",
        ecosystem="python",
        label="Fixture",
        working_directory="",
        toolchain=toolchain or BuildCommand(sys.executable, ("--version",)),
        run=run,
        ignore_patterns=ignores,
    )
