"""Bounded clients and an NDJSON bridge for the local agent access server."""

from __future__ import annotations

import json
import os
import re
import stat
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, TextIO, cast
from urllib.parse import urlsplit

import httpx

from .agent_access import sanitize_agent_output

_MAX_CONNECTION_BYTES: Final = 8 * 1024
_MAX_RESPONSE_BYTES: Final = 512 * 1024
_MAX_NDJSON_BYTES: Final = 64 * 1024
_TOKEN_PATTERN: Final = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
_INSTANCE_PATTERN: Final = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
_ERROR_CODE_PATTERN: Final = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")


class AgentClientError(RuntimeError):
    """A connection record or bounded local request failed closed."""

    def __init__(self, kind: str, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code


@dataclass(frozen=True)
class AgentConnection:
    """Validated connection metadata with a representation-safe capability."""

    instance_id: str
    endpoint: str
    token: str = field(repr=False, compare=False)


def load_agent_connection(path: str | Path) -> AgentConnection:
    """Read a private, regular, owner-only loopback connection file."""

    connection_file = Path(path).expanduser()
    try:
        if connection_file.is_symlink():
            raise AgentClientError("connection_file", "Agent connection file cannot be a symlink")
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(connection_file, flags)
    except AgentClientError:
        raise
    except OSError as error:
        raise AgentClientError("connection_file", "Agent connection file is unavailable") from error
    try:
        details = os.fstat(descriptor)
        if not stat.S_ISREG(details.st_mode):
            raise AgentClientError("connection_file", "Agent connection record is not a file")
        if details.st_size <= 0 or details.st_size > _MAX_CONNECTION_BYTES:
            raise AgentClientError("connection_file", "Agent connection record has invalid size")
        if os.name != "nt":
            if stat.S_IMODE(details.st_mode) & 0o077:
                raise AgentClientError(
                    "connection_file", "Agent connection file is not owner-private"
                )
            getuid = getattr(os, "getuid", None)
            if callable(getuid) and details.st_uid != getuid():
                raise AgentClientError(
                    "connection_file", "Agent connection file has a different owner"
                )
        chunks: list[bytes] = []
        remaining = _MAX_CONNECTION_BYTES + 1
        while remaining > 0:
            chunk = os.read(descriptor, min(remaining, 4_096))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
    finally:
        os.close(descriptor)
    if len(raw) > _MAX_CONNECTION_BYTES:
        raise AgentClientError("connection_file", "Agent connection record exceeds its bound")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AgentClientError("connection_file", "Agent connection record is malformed") from error
    if not isinstance(payload, dict) or set(payload) != {
        "schemaVersion",
        "instanceId",
        "endpoint",
        "token",
    }:
        raise AgentClientError("connection_file", "Agent connection record has invalid fields")
    if payload.get("schemaVersion") != 1:
        raise AgentClientError("connection_file", "Agent connection schema is unsupported")
    instance_id = payload.get("instanceId")
    endpoint = payload.get("endpoint")
    token = payload.get("token")
    if not isinstance(instance_id, str) or not _INSTANCE_PATTERN.fullmatch(instance_id):
        raise AgentClientError("connection_file", "Agent connection identity is invalid")
    if not isinstance(endpoint, str):
        raise AgentClientError("connection_file", "Agent endpoint is invalid")
    normalized = _validate_loopback_endpoint(endpoint)
    if not isinstance(token, str) or not _TOKEN_PATTERN.fullmatch(token):
        raise AgentClientError("connection_file", "Agent connection capability is invalid")
    return AgentConnection(instance_id, normalized, token)


class AgentClient:
    """Redirect-free, proxy-free HTTP client that reloads rotated capabilities."""

    def __init__(
        self,
        connection_file: str | Path,
        *,
        timeout_seconds: float = 5.0,
        max_response_bytes: int = _MAX_RESPONSE_BYTES,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not 0.1 <= timeout_seconds <= 60:
            raise AgentClientError("configuration", "Agent timeout is outside its bound")
        if not 1_024 <= max_response_bytes <= 2 * 1024 * 1024:
            raise AgentClientError("configuration", "Agent response bound is invalid")
        self.connection_file = Path(connection_file).expanduser()
        self.max_response_bytes = max_response_bytes
        self._client = httpx.Client(
            timeout=httpx.Timeout(timeout_seconds),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
            headers={"Accept": "application/json", "User-Agent": "desktop-material-agent-client"},
        )

    def __enter__(self) -> AgentClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def info(self) -> dict[str, object]:
        return self._request("GET", "/v1/info")

    def tools(self) -> tuple[dict[str, object], ...]:
        response = self.mcp(
            {"jsonrpc": "2.0", "id": "tools", "method": "tools/list", "params": {}}
        )
        result = response.get("result")
        if not isinstance(result, Mapping):
            raise AgentClientError("protocol", "Agent tools response is malformed")
        tools = result.get("tools")
        if not isinstance(tools, list) or len(tools) > 128:
            raise AgentClientError("protocol", "Agent tools response is malformed")
        checked: list[dict[str, object]] = []
        for item in tools:
            if not isinstance(item, dict):
                raise AgentClientError("protocol", "Agent tool definition is malformed")
            checked.append(cast(dict[str, object], item))
        return tuple(checked)

    def call(
        self,
        name: str,
        arguments: Mapping[str, object] | None = None,
        *,
        review_token: str | None = None,
    ) -> object:
        payload: dict[str, object] = {
            "name": name,
            "arguments": dict(arguments or {}),
        }
        if review_token is not None:
            payload["reviewToken"] = review_token
        response = self._request("POST", "/v1/command", payload)
        if "result" not in response:
            raise AgentClientError("protocol", "Agent command response is malformed")
        return response["result"]

    def mcp(self, request: Mapping[str, object]) -> dict[str, object]:
        return self._request("POST", "/mcp", dict(request))

    def _request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, object] | None = None,
    ) -> dict[str, object]:
        connection = load_agent_connection(self.connection_file)
        headers = {"Authorization": f"Bearer {connection.token}"}
        try:
            with self._client.stream(
                method,
                connection.endpoint + path,
                headers=headers,
                json=payload,
            ) as response:
                if 300 <= response.status_code < 400:
                    raise AgentClientError(
                        "redirect",
                        "Agent server redirects are refused",
                        status_code=response.status_code,
                    )
                body = _read_bounded_response(response, self.max_response_bytes)
                content_type = response.headers.get("content-type", "").split(";", 1)[0]
                if content_type.casefold().strip() != "application/json":
                    raise AgentClientError(
                        "protocol",
                        "Agent server returned a non-JSON response",
                        status_code=response.status_code,
                    )
        except AgentClientError:
            raise
        except httpx.TimeoutException as error:
            raise AgentClientError("timeout", "Agent server request timed out") from error
        except httpx.HTTPError as error:
            raise AgentClientError(
                "connection", "Could not reach the local agent server"
            ) from error
        try:
            decoded = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AgentClientError(
                "protocol", "Agent server returned malformed JSON", status_code=response.status_code
            ) from error
        if not isinstance(decoded, dict):
            raise AgentClientError(
                "protocol",
                "Agent server response must be an object",
                status_code=response.status_code,
            )
        safe = sanitize_agent_output(decoded)
        if not isinstance(safe, dict):  # pragma: no cover - object remains object
            raise AgentClientError("protocol", "Agent server response is malformed")
        if response.status_code >= 400:
            code = _safe_server_error_code(safe)
            raise AgentClientError(
                code,
                f"Agent server refused the request ({code})",
                status_code=response.status_code,
            )
        return cast(dict[str, object], safe)


def proxy_mcp_ndjson(
    client: AgentClient,
    input_stream: TextIO,
    output_stream: TextIO,
    *,
    on_error: Callable[[AgentClientError], None] | None = None,
) -> int:
    """Proxy newline-delimited, sessionless MCP messages without token output."""

    failures = 0
    while True:
        line = input_stream.readline(_MAX_NDJSON_BYTES + 2)
        if line == "":
            break
        if len(line.encode("utf-8")) > _MAX_NDJSON_BYTES or not line.endswith("\n"):
            error = AgentClientError("invalid_ndjson", "MCP input line exceeds 64 KiB")
            _write_ndjson_error(output_stream, None, error.kind, str(error))
            failures += 1
            if on_error is not None:
                on_error(error)
            if not line.endswith("\n"):
                _discard_overlong_line(input_stream)
            continue
        try:
            payload = json.loads(line)
            if not isinstance(payload, dict):
                raise AgentClientError("invalid_ndjson", "MCP input line must be an object")
            response = client.mcp(cast(dict[str, object], payload))
            output_stream.write(
                json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n"
            )
            output_stream.flush()
        except (UnicodeError, json.JSONDecodeError) as error:
            failure = AgentClientError("invalid_ndjson", "MCP input line is not valid JSON")
            _write_ndjson_error(output_stream, None, failure.kind, str(failure))
            failures += 1
            if on_error is not None:
                on_error(failure)
        except AgentClientError as error:
            _write_ndjson_error(output_stream, _safe_line_id(line), error.kind, str(error))
            failures += 1
            if on_error is not None:
                on_error(error)
    return failures


def _validate_loopback_endpoint(endpoint: str) -> str:
    if endpoint != endpoint.strip() or "\\" in endpoint:
        raise AgentClientError("connection_file", "Agent endpoint is invalid")
    try:
        parsed = urlsplit(endpoint)
        port = parsed.port
    except ValueError as error:
        raise AgentClientError("connection_file", "Agent endpoint is invalid") from error
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or parsed.username is not None
        or parsed.password is not None
        or port is None
        or not 1 <= port <= 65_535
        or parsed.netloc != f"127.0.0.1:{port}"
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise AgentClientError("connection_file", "Agent endpoint must be exact loopback HTTP")
    return f"http://127.0.0.1:{port}"


def _read_bounded_response(response: httpx.Response, maximum: int) -> bytes:
    advertised = response.headers.get("content-length")
    if advertised is not None:
        try:
            length = int(advertised)
        except ValueError as error:
            raise AgentClientError("protocol", "Agent response length is invalid") from error
        if length < 0 or length > maximum:
            raise AgentClientError("response_too_large", "Agent response exceeds its bound")
    chunks: list[bytes] = []
    size = 0
    for chunk in response.iter_bytes():
        size += len(chunk)
        if size > maximum:
            raise AgentClientError("response_too_large", "Agent response exceeds its bound")
        chunks.append(chunk)
    return b"".join(chunks)


def _safe_server_error_code(payload: Mapping[str, object]) -> str:
    error = payload.get("error")
    if isinstance(error, Mapping):
        code = error.get("code")
        if isinstance(code, str) and _ERROR_CODE_PATTERN.fullmatch(code):
            return code
    return "server_error"


def _write_ndjson_error(
    output_stream: TextIO, request_id: str | int | None, kind: str, message: str
) -> None:
    safe = sanitize_agent_output(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32000, "message": message, "data": {"agentCode": kind}},
        }
    )
    output_stream.write(json.dumps(safe, ensure_ascii=False, separators=(",", ":")) + "\n")
    output_stream.flush()


def _safe_line_id(line: str) -> str | int | None:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    value = payload.get("id")
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and 0 < len(value) <= 128 and "\x00" not in value:
        return value
    return None


def _discard_overlong_line(stream: TextIO) -> None:
    while True:
        remainder = stream.readline(_MAX_NDJSON_BYTES + 2)
        if remainder == "" or remainder.endswith("\n"):
            return
