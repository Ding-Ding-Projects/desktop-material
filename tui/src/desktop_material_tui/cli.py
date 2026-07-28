# ruff: noqa: RUF001
"""Argparse command surface shared by ``github``, ``dmt``, and the TUI."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, is_dataclass, replace
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any, TextIO

from . import __version__
from .application.cheap_lfs import (
    CheapLfsError,
    CheapLfsRestorePlan,
    CheapLfsService,
    CheapLfsTrackPlan,
    summarize_provider_scope,
)
from .application.git_command_wrapper import GitCommandWrapper, GitWrapperReport
from .application.repository_service import RepositoryService
from .infrastructure.git.runner import redact_git_argument
from .infrastructure.persistence import ConfigStore, XDGPaths

_COMMANDS = frozenset(
    {
        "tui",
        "status",
        "history",
        "diff",
        "stage",
        "unstage",
        "discard",
        "commit",
        "fetch",
        "pull",
        "push",
        "branch",
        "stash",
        "remote",
        "tag",
        "git",
        "cheap-lfs",
        "preferences",
    }
)
_LANGUAGE_TO_CONFIG = {
    "en": "english",
    "yue-HK": "cantonese",
    "bilingual": "bilingual",
}
_CONFIG_TO_LANGUAGE = {value: key for key, value in _LANGUAGE_TO_CONFIG.items()}


class ConfirmationRequiredError(RuntimeError):
    """The command printed its preview but lacked explicit confirmation."""


def build_parser(prog: str = "github") -> argparse.ArgumentParser:
    """Build the complete non-interactive and TUI command grammar."""

    parser = argparse.ArgumentParser(
        prog=prog,
        description="Desktop Material: interactive TUI and scriptable Git/Cheap LFS CLI",
        epilog=(
            "The `github` command is an additional launcher; it does not replace "
            "GitHub CLI's `gh` command."
        ),
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument(
        "-C",
        "--repository-path",
        default=".",
        metavar="PATH",
        help="Git working tree to use (default: current directory)",
    )
    parser.add_argument("--json", dest="json_output", action="store_true")
    parser.add_argument(
        "--language",
        choices=("en", "yue-HK", "bilingual"),
        help="override the persisted output language for this invocation",
    )
    parser.add_argument(
        "--english-funny-level",
        type=_funny_level,
        metavar="1..5",
        help="override English tone (errors and safety copy remain plain)",
    )
    parser.add_argument(
        "--cantonese-funny-level",
        type=_funny_level,
        metavar="1..5",
        help="override Cantonese tone (errors and safety copy remain plain)",
    )
    parser.add_argument(
        "--save-preferences",
        action="store_true",
        help="persist supplied language/funny-level overrides before running",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    tui = subparsers.add_parser("tui", help="launch the full mouse-capable terminal UI")
    tui.add_argument("repository", nargs="?", help="repository path to open")
    tui.add_argument("--theme", choices=("dark", "light", "system"))
    tui.add_argument("--no-mouse", action="store_true", help="disable terminal mouse capture")
    tui.add_argument(
        "--language",
        choices=("en", "yue-HK", "bilingual"),
        default=argparse.SUPPRESS,
    )
    tui.add_argument(
        "--english-funny-level",
        type=_funny_level,
        default=argparse.SUPPRESS,
    )
    tui.add_argument(
        "--cantonese-funny-level",
        type=_funny_level,
        default=argparse.SUPPRESS,
    )
    tui.add_argument(
        "--save-preferences",
        action="store_true",
        default=argparse.SUPPRESS,
    )

    status = subparsers.add_parser("status", help="show branch and working-tree status")
    status.add_argument("--ignored", action="store_true", help="include ignored files")
    _add_json_option(status)

    history = subparsers.add_parser("history", help="list commits")
    history.add_argument("--limit", type=int, default=30)
    history.add_argument("--skip", type=int, default=0)
    history.add_argument("--revision")
    _add_json_option(history)

    diff = subparsers.add_parser("diff", help="print a working-tree or staged diff")
    diff.add_argument("paths", nargs="*")
    diff.add_argument("--staged", action="store_true")
    diff.add_argument("--revision")
    diff.add_argument("--context", type=int, default=3)
    _add_json_option(diff)

    stage = subparsers.add_parser("stage", help="stage literal repository paths")
    stage.add_argument("paths", nargs="+")
    stage.add_argument("--dry-run", action="store_true")
    _add_json_option(stage)

    unstage = subparsers.add_parser("unstage", help="unstage literal repository paths")
    unstage.add_argument("paths", nargs="+")
    unstage.add_argument("--dry-run", action="store_true")
    _add_json_option(unstage)

    discard = subparsers.add_parser("discard", help="discard tracked changes")
    discard.add_argument("paths", nargs="+")
    discard.add_argument("--staged", action="store_true")
    _add_mutation_options(discard)

    commit = subparsers.add_parser("commit", help="create a commit from the staged index")
    commit.add_argument("summary")
    commit.add_argument("--body")
    commit.add_argument("--amend", action="store_true")
    commit.add_argument("--signoff", action="store_true")
    _add_mutation_options(commit)

    fetch = subparsers.add_parser("fetch", help="fetch remote refs")
    fetch.add_argument("remote", nargs="?")
    fetch.add_argument("--prune", action="store_true")
    fetch.add_argument("--tags", action="store_true")
    fetch.add_argument("--dry-run", action="store_true")
    _add_json_option(fetch)

    git_command = subparsers.add_parser(
        "git",
        add_help=False,
        help="run native Git argv; push/pull add Cheap LFS phases",
    )
    _add_json_option(git_command)
    git_command.add_argument("git_args", nargs=argparse.REMAINDER)

    pull = subparsers.add_parser(
        "pull",
        add_help=False,
        help="native git pull plus safe Cheap LFS restoration",
    )
    _add_json_option(pull)
    pull.add_argument("git_args", nargs=argparse.REMAINDER)

    push = subparsers.add_parser(
        "push",
        add_help=False,
        help="Cheap LFS preflight followed by native git push",
    )
    _add_json_option(push)
    push.add_argument("git_args", nargs=argparse.REMAINDER)

    branches = subparsers.add_parser("branch", help="list and manage branches")
    branch_commands = branches.add_subparsers(dest="branch_command", required=True)
    branch_list = branch_commands.add_parser("list", help="list local and remote branches")
    branch_list.add_argument("--local-only", action="store_true")
    _add_json_option(branch_list)
    branch_create = branch_commands.add_parser("create", help="create a branch")
    branch_create.add_argument("name")
    branch_create.add_argument("--start-point")
    branch_create.add_argument("--no-checkout", action="store_true")
    branch_create.add_argument("--dry-run", action="store_true")
    _add_json_option(branch_create)
    branch_switch = branch_commands.add_parser("switch", help="switch branches")
    branch_switch.add_argument("name")
    branch_switch.add_argument("--dry-run", action="store_true")
    _add_json_option(branch_switch)
    branch_rename = branch_commands.add_parser("rename", help="rename a local branch")
    branch_rename.add_argument("old_name")
    branch_rename.add_argument("new_name")
    _add_mutation_options(branch_rename)
    branch_delete = branch_commands.add_parser("delete", help="delete a local branch")
    branch_delete.add_argument("name")
    branch_delete.add_argument("--force", action="store_true")
    _add_mutation_options(branch_delete)
    branch_merge = branch_commands.add_parser("merge", help="merge a branch")
    branch_merge.add_argument("name")
    branch_merge.add_argument("--no-ff", action="store_true")
    _add_mutation_options(branch_merge)

    stashes = subparsers.add_parser("stash", help="list and manage stashes")
    stash_commands = stashes.add_subparsers(dest="stash_command", required=True)
    stash_list = stash_commands.add_parser("list", help="list stashes")
    _add_json_option(stash_list)
    stash_push = stash_commands.add_parser("push", help="create a stash")
    stash_push.add_argument("paths", nargs="*")
    stash_push.add_argument("--message")
    stash_push.add_argument("--include-untracked", action="store_true")
    stash_push.add_argument("--keep-index", action="store_true")
    stash_push.add_argument("--dry-run", action="store_true")
    _add_json_option(stash_push)
    for action in ("apply", "pop"):
        stash_action = stash_commands.add_parser(action, help=f"{action} a stash")
        stash_action.add_argument("ref", nargs="?", default="stash@{0}")
        stash_action.add_argument("--index", action="store_true")
        _add_mutation_options(stash_action)
    stash_drop = stash_commands.add_parser("drop", help="permanently drop a stash")
    stash_drop.add_argument("ref", nargs="?", default="stash@{0}")
    _add_mutation_options(stash_drop)

    remotes = subparsers.add_parser("remote", help="list configured remotes")
    remote_commands = remotes.add_subparsers(dest="remote_command", required=True)
    remote_list = remote_commands.add_parser("list", help="list fetch and push URLs")
    _add_json_option(remote_list)
    remote_add = remote_commands.add_parser("add", help="add a remote")
    remote_add.add_argument("name")
    remote_add.add_argument("url")
    _add_mutation_options(remote_add)
    remote_set_url = remote_commands.add_parser("set-url", help="change a remote URL")
    remote_set_url.add_argument("name")
    remote_set_url.add_argument("url")
    remote_set_url.add_argument("--push", action="store_true")
    _add_mutation_options(remote_set_url)
    remote_remove = remote_commands.add_parser("remove", help="remove a remote")
    remote_remove.add_argument("name")
    _add_mutation_options(remote_remove)

    tags = subparsers.add_parser("tag", help="list tags")
    tag_commands = tags.add_subparsers(dest="tag_command", required=True)
    tag_list = tag_commands.add_parser("list", help="list tags")
    _add_json_option(tag_list)
    tag_create = tag_commands.add_parser("create", help="create a tag")
    tag_create.add_argument("name")
    tag_create.add_argument("--target")
    tag_create.add_argument("--message")
    tag_create.add_argument("--force", action="store_true")
    _add_mutation_options(tag_create)
    tag_delete = tag_commands.add_parser("delete", help="delete a local tag")
    tag_delete.add_argument("name")
    _add_mutation_options(tag_delete)

    _add_cheap_lfs_parser(subparsers)
    _add_preferences_parser(subparsers)
    return parser


def _add_cheap_lfs_parser(subparsers: Any) -> None:
    scope = "\n".join(f"- {line}" for line in summarize_provider_scope())
    cheap_lfs = subparsers.add_parser(
        "cheap-lfs",
        help="inspect and transfer Windows-compatible Cheap LFS pointers",
        description=(
            "Canonical Desktop Material Cheap LFS v1 support.\n\n"
            f"Provider scope:\n{scope}\n\n"
            "Preview/status never mutate files or GitHub. Track and restore require "
            "--yes; --dry-run prints the exact plan and performs no mutation."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    cheap_commands = cheap_lfs.add_subparsers(dest="cheap_lfs_command", required=True)

    status = cheap_commands.add_parser("status", help="list canonical pointer files")
    status.add_argument("paths", nargs="*")
    status.add_argument("--verify-cache", action="store_true")
    status.add_argument("--cache")
    _add_json_option(status)

    preview = cheap_commands.add_parser("preview", help="hash a payload and preview tracking")
    preview.add_argument("path")
    preview.add_argument("--release-tag", default="assets")
    preview.add_argument("--repo", metavar="OWNER/NAME")
    preview.add_argument("--cache")
    _add_json_option(preview)

    track = cheap_commands.add_parser(
        "track",
        help="upload/reuse Release assets and replace a payload with a v1 pointer",
    )
    track.add_argument("path")
    track.add_argument("--release-tag", default="assets")
    track.add_argument("--repo", metavar="OWNER/NAME")
    track.add_argument("--cache")
    track.add_argument("--stage", action="store_true")
    _add_mutation_options(track)

    restore = cheap_commands.add_parser(
        "restore",
        help="verify and atomically materialize a canonical v1 pointer",
    )
    restore.add_argument("path")
    restore.add_argument("--repo", metavar="OWNER/NAME")
    restore.add_argument("--cache")
    _add_mutation_options(restore)

    verify = cheap_commands.add_parser(
        "verify",
        help="verify cached payload bytes without replacing the pointer",
    )
    verify.add_argument("path")
    verify.add_argument("--fetch-missing", action="store_true")
    verify.add_argument("--repo", metavar="OWNER/NAME")
    verify.add_argument("--cache")
    _add_json_option(verify)


def _add_preferences_parser(subparsers: Any) -> None:
    preferences = subparsers.add_parser(
        "preferences",
        help="show or persist CLI/TUI language and funny levels",
    )
    commands = preferences.add_subparsers(dest="preferences_command", required=True)
    show = commands.add_parser("show")
    _add_json_option(show)
    set_preferences = commands.add_parser("set")
    set_preferences.add_argument("--language", choices=("en", "yue-HK", "bilingual"))
    set_preferences.add_argument("--english-funny-level", type=_funny_level)
    set_preferences.add_argument("--cantonese-funny-level", type=_funny_level)
    _add_json_option(set_preferences)


def _add_json_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--json",
        dest="json_output",
        action="store_true",
        default=argparse.SUPPRESS,
    )


def _add_mutation_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true", help="execute the printed mutation plan")
    _add_json_option(parser)


def _funny_level(value: str) -> int:
    parsed = int(value)
    if not 1 <= parsed <= 5:
        raise argparse.ArgumentTypeError("funny level must be between 1 and 5")
    return parsed


def normalize_argv(arguments: Sequence[str]) -> list[str]:
    """Preserve the historical ``desktop-material-tui [PATH]`` launcher form."""

    values = list(arguments)
    if not values:
        return ["tui"]
    if any(value in _COMMANDS for value in values):
        return values
    if len(values) == 1 and values[0] in {"-h", "--help", "--version"}:
        return values
    return ["tui", *values]


def _raw_git_wrapper_argv(values: Sequence[str]) -> tuple[int, str] | None:
    """Find a wrapper command while preserving every following native Git argv."""

    root_options_with_value = frozenset(
        {
            "-C",
            "--repository-path",
            "--language",
            "--english-funny-level",
            "--cantonese-funny-level",
        }
    )
    index = 0
    while index < len(values):
        value = values[index]
        if value in {"git", "pull", "push"}:
            return index, value
        if value in root_options_with_value:
            index += 2
            continue
        if value.startswith(("--repository-path=", "--language=")):
            index += 1
            continue
        if value.startswith(("--english-funny-level=", "--cantonese-funny-level=")):
            index += 1
            continue
        if value.startswith("-C") and value != "-C":
            index += 1
            continue
        if value in {"--json", "--save-preferences"}:
            index += 1
            continue
        return None
    return None


def main(
    argv: Sequence[str] | None = None,
    *,
    prog: str | None = None,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
) -> int:
    """Run one CLI command and return a process exit code."""

    output = stdout or sys.stdout
    errors = stderr or sys.stderr
    raw = sys.argv[1:] if argv is None else list(argv)
    program = prog or Path(sys.argv[0]).name or "github"
    normalized = normalize_argv(raw)
    wrapper = _raw_git_wrapper_argv(normalized)
    if wrapper is None:
        args = build_parser(program).parse_args(normalized)
    else:
        command_index, _command = wrapper
        args = build_parser(program).parse_args(normalized[: command_index + 1])
        args.git_args = normalized[command_index + 1 :]
    try:
        preferences = _load_preferences()
        if getattr(args, "save_preferences", False):
            preferences = _persist_root_overrides(args, preferences)
        locale = _effective_locale(args, preferences)
        return _dispatch(args, locale, output, errors)
    except ConfirmationRequiredError as error:
        print(str(error), file=errors)
        return 2
    except (CheapLfsError, OSError, ValueError, RuntimeError) as error:
        # Error and destructive safety copy remains plain at every funny level.
        print(f"error: {error}", file=errors)
        return 1


def _dispatch(
    args: argparse.Namespace,
    locale: Mapping[str, object],
    output: TextIO,
    errors: TextIO | None = None,
) -> int:
    if args.command == "tui":
        return _launch_tui(args)
    if args.command == "preferences":
        return _preferences_command(args, output)
    if args.command == "cheap-lfs":
        return _cheap_lfs_command(args, locale, output)
    if args.command in {"git", "pull", "push"}:
        return _git_wrapper_command(args, output, errors or output)

    service = RepositoryService(args.repository_path)
    service.validate()
    command = args.command
    if command == "status":
        _emit(service.status(include_ignored=args.ignored), args, output)
    elif command == "history":
        _emit(
            service.history(args.limit, args.skip, args.revision),
            args,
            output,
            human=_format_history,
        )
    elif command == "diff":
        result = service.diff(args.paths, args.staged, args.revision, args.context)
        _emit(result, args, output, human=lambda value: value.text)
    elif command in {"stage", "unstage"}:
        plan = {"operation": command, "paths": tuple(args.paths)}
        if args.dry_run:
            _emit(plan, args, output)
        else:
            receipt = (
                service.stage(args.paths) if command == "stage" else service.unstage(args.paths)
            )
            _emit(receipt, args, output)
    elif command == "discard":
        plan = {
            "operation": "discard",
            "paths": tuple(args.paths),
            "staged": args.staged,
        }
        _execute_confirmed(
            args,
            plan,
            lambda: service.discard(args.paths, staged=args.staged),
            output,
        )
    elif command == "commit":
        plan = {
            "operation": "commit",
            "summary": args.summary,
            "amend": args.amend,
            "signoff": args.signoff,
        }
        _execute_confirmed(
            args,
            plan,
            lambda: service.commit(args.summary, args.body, args.amend, args.signoff),
            output,
        )
    elif command == "fetch":
        plan = {
            "operation": "fetch",
            "remote": args.remote,
            "prune": args.prune,
            "tags": args.tags,
        }
        if args.dry_run:
            _emit(plan, args, output)
        else:
            _emit(service.fetch(args.remote, args.prune, args.tags), args, output)
    elif command == "branch":
        _branch_command(service, args, output)
    elif command == "stash":
        _stash_command(service, args, output)
    elif command == "remote":
        _remote_command(service, args, output)
    elif command == "tag":
        _tag_command(service, args, output)
    else:  # pragma: no cover - argparse makes this unreachable
        raise ValueError(f"Unsupported command: {command}")
    return 0


def _git_wrapper_command(
    args: argparse.Namespace,
    output: TextIO,
    errors: TextIO,
) -> int:
    git_args = tuple(args.git_args)
    if args.command in {"pull", "push"}:
        git_args = (args.command, *git_args)
    report = GitCommandWrapper(args.repository_path).run(git_args)
    if getattr(args, "json_output", False):
        _emit(report, args, output)
    else:
        _emit_git_wrapper_human(report, output, errors)
    return report.exit_code


def _emit_git_wrapper_human(
    report: GitWrapperReport,
    output: TextIO,
    errors: TextIO,
) -> None:
    phased = len(report.phases) > 1 or (
        report.phases and report.phases[0].name in {"git.pull", "git.push"}
    )
    for phase in report.phases:
        destination = errors if phase.state == "failed" else output
        if phased:
            print(f"[{phase.name}: {phase.state}]", file=destination)
        if phase.detail:
            print(phase.detail, file=destination)
        if phase.stdout:
            print(phase.stdout, end="" if phase.stdout.endswith("\n") else "\n", file=output)
        if phase.stderr:
            print(phase.stderr, end="" if phase.stderr.endswith("\n") else "\n", file=errors)
    if report.blocked_blobs:
        print("Oversized outgoing Git blobs:", file=errors)
        for blob in report.blocked_blobs:
            print(
                f"  {blob.path}  {blob.size_in_bytes} bytes  {blob.oid[:12]}",
                file=errors,
            )
    if report.blocked_working_files:
        print("Oversized working-tree files:", file=errors)
        for item in report.blocked_working_files:
            print(f"  {item.path}  {item.size_in_bytes} bytes", file=errors)


def _launch_tui(args: argparse.Namespace) -> int:
    from .app import DesktopMaterialTUI

    initial = args.repository or args.repository_path
    app = DesktopMaterialTUI(
        initial,
        language_override=args.language,
        theme_override=args.theme,
        english_funny_level_override=args.english_funny_level,
        cantonese_funny_level_override=args.cantonese_funny_level,
    )
    app.run(mouse=not args.no_mouse)
    return 0


def _branch_command(
    service: RepositoryService,
    args: argparse.Namespace,
    output: TextIO,
) -> None:
    action = args.branch_command
    if action == "list":
        _emit(
            service.branches(include_remote=not args.local_only),
            args,
            output,
            human=_format_branches,
        )
    elif action == "create":
        plan = {
            "operation": "branch.create",
            "name": args.name,
            "start_point": args.start_point,
            "checkout": not args.no_checkout,
        }
        if args.dry_run:
            _emit(plan, args, output)
        else:
            _emit(
                service.create_branch(args.name, args.start_point, not args.no_checkout),
                args,
                output,
            )
    elif action == "switch":
        plan = {"operation": "branch.switch", "name": args.name}
        if args.dry_run:
            _emit(plan, args, output)
        else:
            _emit(service.checkout_branch(args.name), args, output)
    elif action == "rename":
        _execute_confirmed(
            args,
            {
                "operation": "branch.rename",
                "old_name": args.old_name,
                "new_name": args.new_name,
            },
            lambda: service.rename_branch(args.old_name, args.new_name),
            output,
        )
    elif action == "delete":
        _execute_confirmed(
            args,
            {"operation": "branch.delete", "name": args.name, "force": args.force},
            lambda: service.delete_branch(args.name, args.force),
            output,
        )
    elif action == "merge":
        _execute_confirmed(
            args,
            {"operation": "branch.merge", "name": args.name, "no_ff": args.no_ff},
            lambda: service.merge_branch(args.name, args.no_ff),
            output,
        )


def _stash_command(
    service: RepositoryService,
    args: argparse.Namespace,
    output: TextIO,
) -> None:
    action = args.stash_command
    if action == "list":
        _emit(service.stashes(), args, output, human=_format_stashes)
    elif action == "push":
        plan = {
            "operation": "stash.push",
            "paths": tuple(args.paths),
            "message": args.message,
            "include_untracked": args.include_untracked,
            "keep_index": args.keep_index,
        }
        if args.dry_run:
            _emit(plan, args, output)
        else:
            _emit(
                service.stash_push(
                    args.message,
                    args.include_untracked,
                    args.keep_index,
                    args.paths,
                ),
                args,
                output,
            )
    elif action in {"apply", "pop"}:
        _execute_confirmed(
            args,
            {"operation": f"stash.{action}", "ref": args.ref, "index": args.index},
            lambda: service.stash_apply(args.ref, action == "pop", args.index),
            output,
        )
    elif action == "drop":
        _execute_confirmed(
            args,
            {"operation": "stash.drop", "ref": args.ref},
            lambda: service.stash_drop(args.ref),
            output,
        )


def _remote_command(
    service: RepositoryService,
    args: argparse.Namespace,
    output: TextIO,
) -> None:
    action = args.remote_command
    if action == "list":
        _emit(service.remotes(), args, output, human=_format_remotes)
    elif action == "add":
        _execute_confirmed(
            args,
            {
                "operation": "remote.add",
                "name": args.name,
                "url": redact_git_argument(args.url),
            },
            lambda: service.add_remote(args.name, args.url),
            output,
        )
    elif action == "set-url":
        _execute_confirmed(
            args,
            {
                "operation": "remote.set-url",
                "name": args.name,
                "url": redact_git_argument(args.url),
                "push": args.push,
            },
            lambda: service.set_remote_url(args.name, args.url, push=args.push),
            output,
        )
    elif action == "remove":
        _execute_confirmed(
            args,
            {"operation": "remote.remove", "name": args.name},
            lambda: service.remove_remote(args.name),
            output,
        )


def _tag_command(
    service: RepositoryService,
    args: argparse.Namespace,
    output: TextIO,
) -> None:
    action = args.tag_command
    if action == "list":
        _emit(service.tags(), args, output, human=_format_tags)
    elif action == "create":
        _execute_confirmed(
            args,
            {
                "operation": "tag.create",
                "name": args.name,
                "target": args.target,
                "annotated": args.message is not None,
                "force": args.force,
            },
            lambda: service.create_tag(
                args.name,
                target=args.target,
                message=args.message,
                force=args.force,
            ),
            output,
        )
    elif action == "delete":
        _execute_confirmed(
            args,
            {"operation": "tag.delete", "name": args.name},
            lambda: service.delete_tag(args.name),
            output,
        )


def _cheap_lfs_command(
    args: argparse.Namespace,
    locale: Mapping[str, object],
    output: TextIO,
) -> int:
    service = CheapLfsService(
        args.repository_path,
        repository_slug=getattr(args, "repo", None),
        cache_root=getattr(args, "cache", None),
    )
    action = args.cheap_lfs_command
    if action == "status":
        _emit(
            service.status(args.paths, verify=args.verify_cache),
            args,
            output,
            human=_format_cheap_lfs_inventory,
        )
    elif action == "preview":
        plan = service.preview_track(
            args.path,
            release_tag=args.release_tag,
            repository_slug=args.repo,
        )
        _emit(plan, args, output, human=_format_track_plan)
    elif action == "track":
        plan = service.preview_track(
            args.path,
            release_tag=args.release_tag,
            repository_slug=args.repo,
        )
        if args.dry_run or not args.yes:
            _emit(plan, args, output, human=_format_track_plan)
            if not args.dry_run:
                raise ConfirmationRequiredError(
                    "Track preview printed; rerun with --yes to upload assets and replace the file."
                )
        else:
            receipt = service.track(plan, confirmed=True, stage=args.stage)
            _emit(
                receipt,
                args,
                output,
                human=lambda value: _localized_success(
                    locale,
                    f"Tracked {value.relative_path} ({value.size_in_bytes} bytes).\n"
                    f"Recovery copy: {value.recovery_path}",
                    f"已追蹤 {value.relative_path}（{value.size_in_bytes} bytes）。\n"
                    f"復原副本：{value.recovery_path}",
                    playful_en="\nThe big bytes are safely parked.",
                    playful_yue="\n大嚿 bytes 已經泊好位。",
                ),
            )
    elif action == "restore":
        restore_plan = service.preview_restore(args.path, repository_slug=args.repo)
        if args.dry_run or not args.yes:
            _emit(restore_plan, args, output, human=_format_restore_plan)
            if not args.dry_run:
                raise ConfirmationRequiredError(
                    "Restore preview printed; rerun with --yes to replace the pointer."
                )
        else:
            restore_receipt = service.restore(restore_plan, confirmed=True)
            _emit(
                restore_receipt,
                args,
                output,
                human=lambda value: _localized_success(
                    locale,
                    f"Restored {value.relative_path} ({value.size_in_bytes} bytes).\n"
                    f"Recovery pointer: {value.recovery_path}",
                    f"已還原 {value.relative_path}（{value.size_in_bytes} bytes）。\n"
                    f"復原指標：{value.recovery_path}",
                    playful_en="\nPayload home, hashes happy.",
                    playful_yue="\nPayload 返到屋企，hash 都笑晒。",
                ),
            )
    elif action == "verify":
        entry = service.verify(
            args.path,
            fetch_missing=args.fetch_missing,
            repository_slug=args.repo,
        )
        _emit(entry, args, output, human=_format_cheap_lfs_inventory)
    return 0


def _execute_confirmed(
    args: argparse.Namespace,
    plan: object,
    action: Callable[[], object],
    output: TextIO,
) -> None:
    if args.dry_run or not args.yes:
        _emit(plan, args, output)
        if not args.dry_run:
            raise ConfirmationRequiredError(
                "Mutation preview printed; rerun with --yes to execute it."
            )
        return
    _emit(action(), args, output)


def _preferences_command(args: argparse.Namespace, output: TextIO) -> int:
    store = ConfigStore(XDGPaths.discover())
    config = store.load_or_default()
    if args.preferences_command == "set":
        if (
            args.language is None
            and args.english_funny_level is None
            and args.cantonese_funny_level is None
        ):
            raise ValueError("preferences set requires at least one value")
        language = replace(
            config.language,
            mode=(
                config.language.mode
                if args.language is None
                else _LANGUAGE_TO_CONFIG[args.language]
            ),
            english_funny_level=(
                config.language.english_funny_level
                if args.english_funny_level is None
                else args.english_funny_level
            ),
            cantonese_funny_level=(
                config.language.cantonese_funny_level
                if args.cantonese_funny_level is None
                else args.cantonese_funny_level
            ),
        )
        config = replace(config, language=language)
        store.save(config)
    value = {
        "language": _CONFIG_TO_LANGUAGE.get(config.language.mode, "en"),
        "english_funny_level": config.language.english_funny_level,
        "cantonese_funny_level": config.language.cantonese_funny_level,
        "path": store.path,
    }
    _emit(value, args, output)
    return 0


def _load_preferences() -> object:
    return ConfigStore(XDGPaths.discover()).load_or_default()


def _persist_root_overrides(args: argparse.Namespace, config: Any) -> Any:
    if (
        args.language is None
        and args.english_funny_level is None
        and args.cantonese_funny_level is None
    ):
        raise ValueError("--save-preferences requires a language or funny-level override")
    language = replace(
        config.language,
        mode=(
            config.language.mode if args.language is None else _LANGUAGE_TO_CONFIG[args.language]
        ),
        english_funny_level=(
            config.language.english_funny_level
            if args.english_funny_level is None
            else args.english_funny_level
        ),
        cantonese_funny_level=(
            config.language.cantonese_funny_level
            if args.cantonese_funny_level is None
            else args.cantonese_funny_level
        ),
    )
    updated = replace(config, language=language)
    ConfigStore(XDGPaths.discover()).save(updated)
    return updated


def _effective_locale(args: argparse.Namespace, config: Any) -> Mapping[str, object]:
    return {
        "language": (
            _CONFIG_TO_LANGUAGE.get(config.language.mode, "en")
            if args.language is None
            else args.language
        ),
        "english_funny_level": (
            config.language.english_funny_level
            if args.english_funny_level is None
            else args.english_funny_level
        ),
        "cantonese_funny_level": (
            config.language.cantonese_funny_level
            if args.cantonese_funny_level is None
            else args.cantonese_funny_level
        ),
    }


def _localized_success(
    locale: Mapping[str, object],
    english: str,
    cantonese: str,
    *,
    playful_en: str,
    playful_yue: str,
) -> str:
    english_text = english + (
        playful_en if _locale_level(locale, "english_funny_level") >= 5 else ""
    )
    cantonese_text = cantonese + (
        playful_yue if _locale_level(locale, "cantonese_funny_level") >= 5 else ""
    )
    language = locale["language"]
    if language == "yue-HK":
        return cantonese_text
    if language == "bilingual":
        return f"{english_text}\n{cantonese_text}"
    return english_text


def _locale_level(locale: Mapping[str, object], key: str) -> int:
    value = locale.get(key, 1)
    return value if isinstance(value, int) and not isinstance(value, bool) else 1


def _emit(
    value: object,
    args: argparse.Namespace,
    output: TextIO,
    *,
    human: Callable[[Any], str] | None = None,
) -> None:
    if getattr(args, "json_output", False):
        print(
            json.dumps(_jsonable(value), ensure_ascii=False, sort_keys=True),
            file=output,
        )
        return
    if human is not None:
        rendered = human(value)
    elif isinstance(value, str):
        rendered = value
    else:
        rendered = _format_generic(value)
    if rendered:
        print(rendered, file=output)


def _jsonable(value: object) -> object:
    if is_dataclass(value) and not isinstance(value, type):
        return _jsonable(asdict(value))
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (Path, datetime, date, Enum)):
        return str(value.value if isinstance(value, Enum) else value)
    return value


def _format_generic(value: object) -> str:
    data = _jsonable(value)
    if isinstance(data, Mapping):
        return "\n".join(f"{key}: {item}" for key, item in data.items())
    if isinstance(data, list):
        return "\n".join(_format_generic(item) for item in data)
    return str(data)


def _format_history(values: Sequence[Any]) -> str:
    return "\n".join(
        f"{item.oid[:10]}  {item.authored_at.isoformat()}  {item.subject}" for item in values
    )


def _format_branches(values: Sequence[Any]) -> str:
    return "\n".join(
        f"{'*' if item.is_current else ' '} {item.name}  {item.oid[:10]} "
        f"↑{item.ahead} ↓{item.behind}"
        for item in values
    )


def _format_stashes(values: Sequence[Any]) -> str:
    return "\n".join(f"{item.ref}  {item.oid[:10]}  {item.message}" for item in values)


def _format_remotes(values: Sequence[Any]) -> str:
    return "\n".join(
        f"{item.name}\tfetch {item.fetch_url}\tpush {item.push_url}" for item in values
    )


def _format_tags(values: Sequence[Any]) -> str:
    return "\n".join(f"{item.name}\t{item.target_oid[:10]}\t{item.subject}" for item in values)


def _format_cheap_lfs_inventory(value: object) -> str:
    values = value if isinstance(value, tuple) else (value,)
    if not values:
        return "No canonical Cheap LFS v1 pointers found."
    return "\n".join(
        f"{item.relative_path}\t{item.size_in_bytes} bytes\t"
        f"{item.cached_parts}/{item.asset_count} cached\t"
        f"{item.release_tag}\t{item.sha256[:12]}"
        for item in values
    )


def _format_track_plan(plan: CheapLfsTrackPlan) -> str:
    operations = "\n".join(f"  - {item}" for item in plan.provider_mutations)
    assets = "\n".join(
        f"  - {part.asset_name}: {part.length} bytes sha256:{part.sha256}" for part in plan.parts
    )
    return (
        "Cheap LFS track preview (no changes made)\n"
        f"Repository: {plan.repository_slug}\n"
        f"Path: {plan.relative_path}\n"
        f"Payload: {plan.size_in_bytes} bytes sha256:{plan.sha256}\n"
        f"Release: {plan.release_tag}\n"
        "Provider inventory: not contacted by this local preview; ownership and "
        "capacity are revalidated before upload\n"
        f"Assets:\n{assets}\n"
        f"Confirmed operations:\n{operations}"
    )


def _format_restore_plan(plan: CheapLfsRestorePlan) -> str:
    downloads = (
        "\n".join(f"  - {asset}" for asset in plan.download_assets)
        if plan.download_assets
        else "  - none; every part is verified in the local cache"
    )
    return (
        "Cheap LFS restore preview (no changes made)\n"
        f"Path: {plan.relative_path}\n"
        f"Payload: {plan.pointer.size_in_bytes} bytes sha256:{plan.pointer.sha256}\n"
        f"Release: {plan.pointer.release_tag}\n"
        f"Provider downloads:\n{downloads}\n"
        "Confirmed operation:\n"
        "  - atomically replace the unchanged pointer after full verification"
    )
