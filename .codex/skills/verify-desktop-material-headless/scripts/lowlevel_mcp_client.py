"""Call one tool on the installed lowlevel-computer-use MCP HTTP server."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import timedelta
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


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
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        params = json.loads(args.params_json)
        if not isinstance(params, dict):
            raise ValueError("params_json must decode to an object")
        payload = asyncio.run(call_tool(args.url, args.tool, params, args.timeout))
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
