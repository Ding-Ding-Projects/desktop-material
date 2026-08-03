"""Command-line and stdio entry points for an opted-in local agent server."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final, TextIO, cast

from .application.agent_access import sanitize_agent_output
from .application.agent_client import AgentClient, AgentClientError, proxy_mcp_ndjson

_MAX_ARGUMENT_BYTES: Final = 64 * 1024
_REVIEW_TOKEN: Final = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="desktop-material-agent",
        description="Use a private Desktop Material TUI local-agent connection.",
    )
    parser.add_argument(
        "--connection-file",
        required=True,
        type=Path,
        help="Private connection file written by the opted-in TUI server.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("info", help="Show non-secret server and catalog information.")
    commands.add_parser("tools", help="List the sessionless MCP tool catalog.")
    call = commands.add_parser("call", help="Invoke one named catalog command.")
    call.add_argument("name")
    call.add_argument(
        "--arguments",
        default="{}",
        help="Bounded JSON object. Credential-shaped fields are refused by the catalog.",
    )
    call.add_argument(
        "--review-token-stdin",
        action="store_true",
        help="Read a reviewed mutation capability from one private stdin line.",
    )
    commands.add_parser("stdio", help="Proxy newline-delimited sessionless MCP over stdio.")
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    input_stream: TextIO | None = None,
    output_stream: TextIO | None = None,
    error_stream: TextIO | None = None,
) -> int:
    """Run one CLI operation without ever rendering the bearer capability."""

    parser = build_parser()
    options = parser.parse_args(argv)
    stdin = input_stream or sys.stdin
    stdout = output_stream or sys.stdout
    stderr = error_stream or sys.stderr
    connection_file = cast(Path, options.connection_file)
    try:
        with AgentClient(connection_file) as client:
            if options.command == "stdio":
                return 1 if proxy_mcp_ndjson(client, stdin, stdout) else 0
            if options.command == "info":
                result: object = client.info()
            elif options.command == "tools":
                result = list(client.tools())
            elif options.command == "call":
                arguments = _parse_arguments(cast(str, options.arguments))
                review_token = (
                    _read_review_token(stdin)
                    if cast(bool, options.review_token_stdin)
                    else None
                )
                result = client.call(
                    cast(str, options.name), arguments, review_token=review_token
                )
            else:  # pragma: no cover - argparse enforces the subcommands
                raise AgentClientError("usage", "Unknown agent command")
        _write_json(stdout, result)
        return 0
    except AgentClientError as error:
        _write_json(
            stderr,
            {"error": {"code": error.kind, "message": str(error)}},
        )
        return 1


def _parse_arguments(value: str) -> dict[str, object]:
    if len(value.encode("utf-8")) > _MAX_ARGUMENT_BYTES:
        raise AgentClientError("arguments", "Command arguments exceed 64 KiB")
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError as error:
        raise AgentClientError("arguments", "Command arguments are not valid JSON") from error
    if not isinstance(decoded, dict):
        raise AgentClientError("arguments", "Command arguments must be a JSON object")
    return cast(dict[str, object], decoded)


def _read_review_token(stream: TextIO) -> str:
    value = stream.readline(130)
    if not value.endswith("\n") or not _REVIEW_TOKEN.fullmatch(value.rstrip("\r\n")):
        raise AgentClientError("review_token", "Mutation review capability is invalid")
    return value.rstrip("\r\n")


def _write_json(stream: TextIO, value: object) -> None:
    safe = sanitize_agent_output(value)
    stream.write(json.dumps(safe, ensure_ascii=False, separators=(",", ":")) + "\n")
    stream.flush()


if __name__ == "__main__":
    raise SystemExit(main())

