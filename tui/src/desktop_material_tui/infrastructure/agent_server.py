"""Private, loopback-only HTTP and MCP transport for local agent access.

The server is deliberately not started by construction.  A visible setting must
opt in at the call site by passing ``opt_in=True`` to :meth:`AgentAccessServer.start`.
The bearer capability is written only to a private connection file; it is never
returned by an endpoint or included in a representation.
"""

from __future__ import annotations

import hmac
import json
import os
import re
import secrets
import socket
import stat
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Final, cast

from ..application.agent_access import (
    AgentAccessError,
    AgentCommandDefinition,
    AgentCommandRegistry,
    sanitize_agent_output,
)

_MAX_REQUEST_BYTES: Final = 64 * 1024
_MAX_RESPONSE_BYTES: Final = 512 * 1024
_MAX_CONNECTION_BYTES: Final = 8 * 1024
_MAX_JSON_ITEMS: Final = 2_048
_MAX_JSON_DEPTH: Final = 16
_MCP_PROTOCOL_VERSION: Final = "2025-06-18"
_TOKEN_PATTERN: Final = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
_BROWSER_HEADERS: Final = frozenset(
    {
        "origin",
        "referer",
        "cookie",
        "access-control-request-method",
        "access-control-request-headers",
        "sec-gpc",
    }
)


class AgentServerError(RuntimeError):
    """The local agent transport could not safely start or persist state."""


@dataclass(frozen=True)
class AgentServerEndpoint:
    """Non-secret server identity safe to render in a settings surface."""

    instance_id: str
    endpoint: str
    connection_file: Path


class AgentAccessServer:
    """Serve one command registry over authenticated loopback HTTP and MCP."""

    def __init__(
        self,
        registry: AgentCommandRegistry,
        *,
        connection_file: str | Path,
        max_concurrency: int = 4,
    ) -> None:
        if not 1 <= max_concurrency <= 32:
            raise AgentServerError("Agent server concurrency must be between 1 and 32")
        self.registry = registry
        self.connection_file = Path(connection_file).expanduser()
        self.max_concurrency = max_concurrency
        self.instance_id = secrets.token_urlsafe(18)
        self._token = ""
        self._token_lock = threading.Lock()
        self._httpd: _BoundedThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._endpoint: AgentServerEndpoint | None = None

    @property
    def endpoint(self) -> AgentServerEndpoint | None:
        return self._endpoint

    @property
    def running(self) -> bool:
        thread = self._thread
        return thread is not None and thread.is_alive()

    def start(self, *, opt_in: bool = False) -> AgentServerEndpoint:
        """Start only after an explicit, visible opt-in from the caller."""

        if not opt_in:
            raise AgentServerError("Agent access is disabled until the user opts in")
        if self.running or self._httpd is not None:
            raise AgentServerError("Agent access server is already running")
        if self.connection_file.is_symlink() or self.connection_file.exists():
            raise AgentServerError("Agent connection file already exists")

        token = secrets.token_urlsafe(32)
        if not _TOKEN_PATTERN.fullmatch(token):  # pragma: no cover - secrets contract
            raise AgentServerError("Could not generate an agent access capability")
        httpd = _BoundedThreadingHTTPServer(self, self.max_concurrency)
        host, port = cast(tuple[str, int], httpd.server_address)
        if host != "127.0.0.1" or port <= 0:  # pragma: no cover - socket contract
            httpd.server_close()
            raise AgentServerError("Agent server did not bind to an ephemeral loopback port")
        endpoint = AgentServerEndpoint(
            instance_id=self.instance_id,
            endpoint=f"http://127.0.0.1:{port}",
            connection_file=self.connection_file,
        )
        with self._token_lock:
            self._token = token
        self._httpd = httpd
        self._endpoint = endpoint
        try:
            self._write_connection_file(token)
            thread = threading.Thread(
                target=httpd.serve_forever,
                kwargs={"poll_interval": 0.05},
                name="desktop-material-agent-http",
                daemon=True,
            )
            self._thread = thread
            thread.start()
        except Exception:
            httpd.server_close()
            self._httpd = None
            self._thread = None
            self._endpoint = None
            with self._token_lock:
                self._token = ""
            self._remove_owned_connection_file()
            raise
        return endpoint

    def rotate_token(self) -> None:
        """Invalidate the old capability and atomically publish a replacement."""

        if not self.running or self._endpoint is None:
            raise AgentServerError("Agent access server is not running")
        token = secrets.token_urlsafe(32)
        self._write_connection_file(token)
        with self._token_lock:
            self._token = token

    def stop(self) -> None:
        """Stop serving and remove only this instance's connection file."""

        httpd = self._httpd
        thread = self._thread
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=5)
        self._httpd = None
        self._thread = None
        self._remove_owned_connection_file()
        self._endpoint = None
        with self._token_lock:
            self._token = ""

    def token_matches(self, supplied: str) -> bool:
        with self._token_lock:
            expected = self._token
        return bool(expected) and hmac.compare_digest(supplied, expected)

    def info_payload(self) -> dict[str, object]:
        return {
            "protocolVersion": self.registry.protocol_version,
            "instanceId": self.instance_id,
            "transports": {
                "rest": {"info": "/v1/info", "command": "/v1/command"},
                "mcp": {"endpoint": "/mcp", "sessionless": True},
            },
            "commands": [_command_descriptor(item) for item in self.registry.definitions()],
        }

    def invoke(self, payload: Mapping[str, object]) -> object:
        allowed = {"name", "arguments", "reviewToken"}
        if set(payload) - allowed:
            raise AgentAccessError("invalid_request", "Unknown command request fields")
        name = payload.get("name")
        arguments = payload.get("arguments", {})
        review_token = _review_token(payload.get("reviewToken"))
        if not isinstance(name, str) or not isinstance(arguments, Mapping):
            raise AgentAccessError("invalid_request", "Command name or arguments are invalid")
        return self.registry.invoke(name, arguments, review_token=review_token)

    def _write_connection_file(self, token: str) -> None:
        endpoint = self._endpoint
        if endpoint is None:
            raise AgentServerError("Agent endpoint is unavailable")
        payload = json.dumps(
            {
                "schemaVersion": 1,
                "instanceId": self.instance_id,
                "endpoint": endpoint.endpoint,
                "token": token,
            },
            ensure_ascii=True,
            separators=(",", ":"),
        ).encode("utf-8")
        if len(payload) > _MAX_CONNECTION_BYTES:  # pragma: no cover - constant shape
            raise AgentServerError("Agent connection record exceeds its size bound")
        parent = self.connection_file.parent
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = parent / f".{self.connection_file.name}.{secrets.token_hex(8)}.tmp"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        descriptor = os.open(temporary, flags, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.chmod(0o600)
            temporary.replace(self.connection_file)
            self.connection_file.chmod(0o600)
        finally:
            temporary.unlink(missing_ok=True)

    def _remove_owned_connection_file(self) -> None:
        path = self.connection_file
        try:
            if path.is_symlink():
                return
            details = path.stat()
            if not stat.S_ISREG(details.st_mode) or details.st_size > _MAX_CONNECTION_BYTES:
                return
            raw = path.read_bytes()
            payload = json.loads(raw)
            if isinstance(payload, dict) and payload.get("instanceId") == self.instance_id:
                path.unlink(missing_ok=True)
        except (FileNotFoundError, OSError, UnicodeError, json.JSONDecodeError):
            return


class _BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer whose active request threads are strictly bounded."""

    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, owner: AgentAccessServer, max_concurrency: int) -> None:
        self.owner = owner
        self._slots = threading.BoundedSemaphore(max_concurrency)
        super().__init__(("127.0.0.1", 0), _AgentRequestHandler)

    def process_request(
        self,
        request: socket.socket | tuple[bytes, socket.socket],
        client_address: tuple[str, int],
    ) -> None:
        if not self._slots.acquire(blocking=False):
            body = b'{"error":{"code":"busy","message":"Agent server is busy"}}'
            response = (
                b"HTTP/1.1 503 Service Unavailable\r\n"
                b"Content-Type: application/json; charset=utf-8\r\n"
                b"Cache-Control: no-store\r\n"
                b"Connection: close\r\n"
                + f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
                + body
            )
            try:
                active_socket = request if isinstance(request, socket.socket) else request[1]
                active_socket.sendall(response)
                active_socket.shutdown(socket.SHUT_WR)
                active_socket.settimeout(0.05)
                drained = 0
                while drained <= _MAX_REQUEST_BYTES:
                    try:
                        chunk = active_socket.recv(min(8 * 1024, _MAX_REQUEST_BYTES - drained + 1))
                    except (TimeoutError, OSError):
                        break
                    if not chunk:
                        break
                    drained += len(chunk)
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(
        self,
        request: socket.socket | tuple[bytes, socket.socket],
        client_address: tuple[str, int],
    ) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


class _AgentRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "DesktopMaterialAgent"
    sys_version = ""

    @property
    def agent_server(self) -> AgentAccessServer:
        return cast(_BoundedThreadingHTTPServer, self.server).owner

    def do_GET(self) -> None:
        if not self._admit_request():
            return
        if self.path != "/v1/info":
            self._write_error(HTTPStatus.NOT_FOUND, "not_found", "Agent endpoint not found")
            return
        self._write_json(HTTPStatus.OK, self.agent_server.info_payload())

    def do_POST(self) -> None:
        if not self._admit_request():
            return
        if self.path not in {"/v1/command", "/mcp"}:
            self._write_error(HTTPStatus.NOT_FOUND, "not_found", "Agent endpoint not found")
            return
        try:
            payload = self._read_json_object()
            if self.path == "/v1/command":
                result = self.agent_server.invoke(payload)
                self._write_json(HTTPStatus.OK, {"result": result})
            else:
                self._handle_mcp(payload)
        except AgentAccessError as error:
            status = (
                HTTPStatus.FORBIDDEN
                if error.code == "review_required"
                else HTTPStatus.BAD_REQUEST
            )
            self._write_error(status, error.code, str(error))
        except _RequestError as error:
            self._write_error(error.status, error.code, error.message)

    def do_OPTIONS(self) -> None:
        self._write_error(HTTPStatus.METHOD_NOT_ALLOWED, "method", "Method not allowed")

    def do_PUT(self) -> None:
        self.do_OPTIONS()

    def do_PATCH(self) -> None:
        self.do_OPTIONS()

    def do_DELETE(self) -> None:
        self.do_OPTIONS()

    def do_TRACE(self) -> None:
        self.do_OPTIONS()

    def log_message(self, _format: str, *args: object) -> None:
        """Suppress BaseHTTPRequestHandler's path-bearing stderr log."""

    def _admit_request(self) -> bool:
        self.close_connection = True
        if self.client_address[0] != "127.0.0.1":
            self._write_error(HTTPStatus.FORBIDDEN, "loopback_only", "Loopback only")
            return False
        endpoint = self.agent_server.endpoint
        if endpoint is None:
            self._write_error(HTTPStatus.SERVICE_UNAVAILABLE, "stopped", "Server is stopping")
            return False
        expected_host = endpoint.endpoint.removeprefix("http://")
        hosts = self.headers.get_all("Host", failobj=[])
        if len(hosts) != 1 or hosts[0] != expected_host:
            self._write_error(HTTPStatus.BAD_REQUEST, "invalid_host", "Host header is invalid")
            return False
        for key in self.headers:
            lowered = key.casefold()
            if lowered in _BROWSER_HEADERS or lowered.startswith("sec-fetch-"):
                self._write_error(
                    HTTPStatus.FORBIDDEN,
                    "browser_refused",
                    "Browser-originated requests are refused",
                )
                return False
        user_agent = self.headers.get("User-Agent", "")
        if "mozilla/" in user_agent.casefold():
            self._write_error(
                HTTPStatus.FORBIDDEN,
                "browser_refused",
                "Browser-originated requests are refused",
            )
            return False
        authorizations = self.headers.get_all("Authorization", failobj=[])
        if len(authorizations) != 1 or not authorizations[0].startswith("Bearer "):
            self._write_error(
                HTTPStatus.UNAUTHORIZED,
                "unauthorized",
                "A valid local bearer capability is required",
            )
            return False
        supplied = authorizations[0][len("Bearer ") :]
        if not self.agent_server.token_matches(supplied):
            self._write_error(
                HTTPStatus.UNAUTHORIZED,
                "unauthorized",
                "A valid local bearer capability is required",
            )
            return False
        return True

    def _read_json_object(self) -> dict[str, object]:
        if self.headers.get("Transfer-Encoding") is not None:
            raise _RequestError(
                HTTPStatus.BAD_REQUEST, "transfer_encoding", "Transfer encoding is refused"
            )
        lengths = self.headers.get_all("Content-Length", failobj=[])
        if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
            raise _RequestError(
                HTTPStatus.LENGTH_REQUIRED, "content_length", "Content length is required"
            )
        length = int(lengths[0])
        if length <= 0 or length > _MAX_REQUEST_BYTES:
            if 0 < length <= _MAX_REQUEST_BYTES * 2:
                self._discard_body(length)
            raise _RequestError(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                "request_too_large",
                "Request body exceeds 64 KiB",
            )
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip()
        if content_type.casefold() != "application/json":
            raise _RequestError(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                "content_type",
                "Content type must be application/json",
            )
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise _RequestError(
                HTTPStatus.BAD_REQUEST, "incomplete_body", "Request body is incomplete"
            )
        try:
            decoded = raw.decode("utf-8")
            payload = json.loads(decoded)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise _RequestError(
                HTTPStatus.BAD_REQUEST, "invalid_json", "Request body is not valid JSON"
            ) from error
        if not isinstance(payload, dict):
            raise _RequestError(
                HTTPStatus.BAD_REQUEST, "invalid_json", "Request body must be an object"
            )
        _bound_json(payload)
        return cast(dict[str, object], payload)

    def _discard_body(self, length: int) -> None:
        """Drain only a tightly bounded near-limit body so HTTP can return 413."""

        remaining = length
        while remaining:
            chunk = self.rfile.read(min(remaining, 8 * 1024))
            if not chunk:
                break
            remaining -= len(chunk)

    def _handle_mcp(self, request: Mapping[str, object]) -> None:
        request_id = _mcp_request_id(request.get("id"))
        if request.get("jsonrpc") != "2.0":
            self._write_mcp_error(request_id, -32600, "Invalid Request", "invalid_request")
            return
        method = request.get("method")
        params = request.get("params", {})
        if not isinstance(method, str) or not isinstance(params, Mapping):
            self._write_mcp_error(request_id, -32600, "Invalid Request", "invalid_request")
            return
        try:
            if method == "initialize":
                result: object = {
                    "protocolVersion": _MCP_PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "desktop-material-tui", "version": "1"},
                    "instructions": "Commands are bound to the repository selected in the TUI.",
                }
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                if set(params) - {"cursor"}:
                    raise AgentAccessError("invalid_request", "Unknown tools/list fields")
                result = {
                    "tools": [_mcp_tool(item) for item in self.agent_server.registry.definitions()]
                }
            elif method == "tools/call":
                result = self._mcp_call(params)
            else:
                self._write_mcp_error(request_id, -32601, "Method not found", "unknown_method")
                return
        except AgentAccessError as error:
            self._write_mcp_error(request_id, -32000, str(error), error.code)
            return
        self._write_json(
            HTTPStatus.OK,
            {"jsonrpc": "2.0", "id": request_id, "result": result},
        )

    def _mcp_call(self, params: Mapping[str, object]) -> dict[str, object]:
        if set(params) - {"name", "arguments", "_meta"}:
            raise AgentAccessError("invalid_request", "Unknown tools/call fields")
        name = params.get("name")
        arguments = params.get("arguments", {})
        metadata = params.get("_meta", {})
        if not isinstance(name, str) or not isinstance(arguments, Mapping):
            raise AgentAccessError("invalid_request", "Tool name or arguments are invalid")
        if not isinstance(metadata, Mapping) or set(metadata) - {
            "desktopMaterialReviewToken"
        }:
            raise AgentAccessError("invalid_request", "Tool metadata is invalid")
        review_token = _review_token(metadata.get("desktopMaterialReviewToken"))
        result = self.agent_server.registry.invoke(
            name, arguments, review_token=review_token
        )
        structured = result if isinstance(result, Mapping) else {"value": result}
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        sanitize_agent_output(result),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                }
            ],
            "structuredContent": structured,
            "isError": False,
        }

    def _write_mcp_error(
        self, request_id: str | int | None, number: int, message: str, code: str
    ) -> None:
        self._write_json(
            HTTPStatus.OK,
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": number,
                    "message": message,
                    "data": {"agentCode": code},
                },
            },
        )

    def _write_error(self, status: HTTPStatus, code: str, message: str) -> None:
        self._write_json(status, {"error": {"code": code, "message": message}})

    def _write_json(self, status: HTTPStatus, payload: object) -> None:
        safe = sanitize_agent_output(payload)
        body = json.dumps(safe, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(body) > _MAX_RESPONSE_BYTES:
            status = HTTPStatus.INTERNAL_SERVER_ERROR
            body = (
                b'{"error":{"code":"response_too_large",'
                b'"message":"Response exceeded its bound"}}'
            )
        self.send_response_only(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return


@dataclass(frozen=True)
class _RequestError(Exception):
    status: HTTPStatus
    code: str
    message: str


def _command_descriptor(definition: AgentCommandDefinition) -> dict[str, object]:
    return {
        "name": definition.name,
        "description": definition.description,
        "inputSchema": dict(definition.input_schema),
        "mutating": definition.mutating,
        "destructive": definition.destructive,
    }


def _mcp_tool(definition: AgentCommandDefinition) -> dict[str, object]:
    return {
        "name": definition.name,
        "description": definition.description,
        "inputSchema": dict(definition.input_schema),
        "annotations": {
            "readOnlyHint": not definition.mutating,
            "destructiveHint": definition.destructive,
            "idempotentHint": not definition.mutating,
            "openWorldHint": False,
        },
    }


def _mcp_request_id(value: object) -> str | int | None:
    if value is None:
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and 0 < len(value) <= 128 and "\x00" not in value:
        return value
    return None


def _review_token(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not _TOKEN_PATTERN.fullmatch(value):
        raise AgentAccessError("invalid_request", "Mutation review capability is invalid")
    return value


def _bound_json(value: object) -> None:
    items = 0

    def visit(item: object, depth: int) -> None:
        nonlocal items
        items += 1
        if items > _MAX_JSON_ITEMS or depth > _MAX_JSON_DEPTH:
            raise _RequestError(
                HTTPStatus.BAD_REQUEST, "json_too_complex", "JSON request is too complex"
            )
        if item is None or isinstance(item, (bool, int, float)):
            return
        if isinstance(item, str):
            if "\x00" in item or len(item) > _MAX_REQUEST_BYTES:
                raise _RequestError(
                    HTTPStatus.BAD_REQUEST, "invalid_json", "JSON string is invalid"
                )
            return
        if isinstance(item, list):
            for child in item:
                visit(child, depth + 1)
            return
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str) or len(key) > 256 or "\x00" in key:
                    raise _RequestError(
                        HTTPStatus.BAD_REQUEST, "invalid_json", "JSON object key is invalid"
                    )
                visit(child, depth + 1)
            return
        raise _RequestError(HTTPStatus.BAD_REQUEST, "invalid_json", "JSON value is invalid")

    visit(value, 0)
