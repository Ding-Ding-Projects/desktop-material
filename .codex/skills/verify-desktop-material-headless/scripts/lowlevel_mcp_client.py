"""Call one tool on the installed lowlevel-computer-use MCP HTTP server."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


# These tools depend on the in-memory desktop/window registry held by one
# persistent server process. A one-shot CLI fallback must fail clearly rather
# than creating a desktop that a later invocation cannot close.
PERSISTENT_HEADLESS_TOOLS = frozenset(
    {
        "create_headless_desktop",
        "create_headless_desktops",
        "close_headless_desktop",
        "launch_on_headless_desktop",
        "list_headless_desktops",
        "list_headless_windows",
    }
)


async def call_tool(
    url: str, tool: str, params: dict[str, Any], timeout_seconds: float
) -> dict[str, Any]:
    async with streamablehttp_client(
        url, timeout=timeout_seconds, sse_read_timeout=timeout_seconds
    ) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            available = await session.list_tools()
            definition = next((item for item in available.tools if item.name == tool), None)
            if definition is None:
                raise ValueError(f"MCP server does not expose tool: {tool}")

            properties = definition.inputSchema.get("properties", {})
            arguments = {"params": params} if "params" in properties else params
            result = await session.call_tool(
                tool,
                arguments,
                read_timeout_seconds=timedelta(seconds=timeout_seconds),
            )

    text_parts = [
        item.text for item in result.content if getattr(item, "type", None) == "text"
    ]
    if not text_parts:
        return {
            "ok": not bool(result.isError),
            "is_error": bool(result.isError),
            "content": [],
        }

    if len(text_parts) == 1:
        try:
            payload = json.loads(text_parts[0])
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass

    return {
        "ok": not bool(result.isError),
        "is_error": bool(result.isError),
        "content": text_parts,
    }


def _find_uv(runtime: str | None) -> str | None:
    """Resolve the local uv launcher without requiring a global install."""

    if runtime:
        return runtime if Path(runtime).exists() else shutil.which(runtime)

    found = shutil.which("uv")
    if found:
        return found

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidate = (
            Path(local_app_data) / "Microsoft" / "WinGet" / "Links" / "uv.exe"
        )
        if candidate.exists():
            return str(candidate)
    return None


def call_cheap_tool(
    tool: str,
    params: dict[str, Any],
    timeout_seconds: float,
    mcp_directory: str | None,
    runtime: str | None,
) -> dict[str, Any]:
    """Call the documented local CLI when the persistent HTTP route is absent."""

    if tool in PERSISTENT_HEADLESS_TOOLS:
        return {
            "ok": False,
            "error": (
                "HTTP endpoint unavailable; this headless lifecycle tool requires "
                "one persistent MCP server process"
            ),
            "transport": "cheap-cli",
            "persistent_required": True,
        }

    uv = _find_uv(runtime)
    if uv is None:
        return {
            "ok": False,
            "error": "HTTP endpoint unavailable and uv was not found for the local CLI fallback",
        }

    directory = Path(
        mcp_directory
        or Path.home() / "Documents" / "GitHub" / "lowlevel-computer-use-mcp"
    )
    if not directory.is_dir():
        return {
            "ok": False,
            "error": f"HTTP endpoint unavailable and MCP checkout is absent: {directory}",
        }

    command = [
        uv,
        "run",
        "--directory",
        str(directory),
        "lowlevel-computer-use-cheap",
        tool,
        "--json",
        json.dumps(params, ensure_ascii=False),
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=str(directory),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": f"local CLI fallback timed out after {timeout_seconds:g}s",
            "timed_out": True,
        }
    except OSError as error:
        return {"ok": False, "error": f"local CLI fallback could not start: {error}"}

    stdout = completed.stdout.strip()
    if not stdout:
        detail = completed.stderr.strip() or "local CLI returned no JSON"
        return {
            "ok": False,
            "error": detail,
            "returncode": completed.returncode,
            "transport": "cheap-cli",
        }

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "error": "local CLI returned non-JSON output",
            "stdout": stdout,
            "stderr": completed.stderr.strip(),
            "returncode": completed.returncode,
            "transport": "cheap-cli",
        }

    if not isinstance(payload, dict):
        return {
            "ok": False,
            "error": "local CLI returned a JSON value instead of an object",
            "returncode": completed.returncode,
            "transport": "cheap-cli",
        }
    payload.setdefault("returncode", completed.returncode)
    payload.setdefault("transport", "cheap-cli")
    if completed.returncode != 0:
        payload.setdefault("stderr", completed.stderr.strip())
        payload["ok"] = False
    return payload


def _endpoint_unavailable(error: Exception) -> bool:
    """Limit fallback to transport/setup failures, not a completed tool call."""

    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "connection refused",
            "connecterror",
            "all connection attempts failed",
            "unhandled errors in a taskgroup",
            "failed to connect",
        )
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("tool")
    parser.add_argument("params_json", nargs="?", default="{}")
    parser.add_argument(
        "--url", default="http://127.0.0.1:8765/mcp", help="MCP endpoint"
    )
    parser.add_argument(
        "--timeout", type=float, default=60, help="MCP call timeout in seconds"
    )
    parser.add_argument(
        "--no-cheap-fallback",
        action="store_true",
        help="Do not use the local CLI when the HTTP endpoint is unavailable",
    )
    parser.add_argument(
        "--cheap-directory",
        default=None,
        help="MCP checkout for the local CLI fallback",
    )
    parser.add_argument(
        "--cheap-runtime",
        default=None,
        help="uv executable for the local CLI fallback",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        params = json.loads(args.params_json)
        if not isinstance(params, dict):
            raise ValueError("params_json must decode to an object")
        try:
            payload = asyncio.run(call_tool(args.url, args.tool, params, args.timeout))
        except Exception as error:
            if args.no_cheap_fallback or not _endpoint_unavailable(error):
                raise
            payload = call_cheap_tool(
                args.tool,
                params,
                args.timeout,
                args.cheap_directory,
                args.cheap_runtime,
            )
            payload.setdefault("http_error", str(error))
    except Exception as error:
        payload = {"ok": False, "error": str(error)}

    success = payload.get("ok") is True
    if payload.get("timed_out") is True:
        success = False
    if "returncode" in payload and payload.get("returncode") != 0:
        success = False

    payload["client_ok"] = success
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
