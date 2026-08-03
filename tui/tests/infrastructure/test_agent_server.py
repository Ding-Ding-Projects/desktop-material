"""Adversarial loopback HTTP and sessionless MCP transport tests."""

from __future__ import annotations

import json
import os
import socket
import stat
import threading
from collections.abc import Iterator, Mapping
from pathlib import Path

import httpx
import pytest

from desktop_material_tui.application.agent_access import (
    AgentCommandDefinition,
    AgentCommandRegistry,
)
from desktop_material_tui.application.agent_client import AgentClient, AgentClientError
from desktop_material_tui.infrastructure.agent_server import (
    AgentAccessServer,
    AgentServerError,
)


def _schema(
    properties: Mapping[str, object] | None = None, *, required: tuple[str, ...] = ()
) -> dict[str, object]:
    return {
        "type": "object",
        "properties": dict(properties or {}),
        "required": list(required),
        "additionalProperties": False,
    }


def _registry() -> AgentCommandRegistry:
    registry = AgentCommandRegistry()
    registry.register(
        AgentCommandDefinition(
            "echo",
            "Echo one bounded value.",
            _schema(
                {"value": {"type": "string", "minLength": 1, "maxLength": 1000}},
                required=("value",),
            ),
            lambda arguments: {"value": arguments["value"]},
        )
    )
    registry.register(
        AgentCommandDefinition(
            "redacted",
            "Return an intentionally credential-shaped fixture.",
            _schema(),
            lambda _arguments: {
                "token": "fixture-capability",
                "message": "Authorization: Bearer fixture-capability",
            },
        )
    )
    registry.register(
        AgentCommandDefinition(
            "explode",
            "Raise a credential-shaped error fixture.",
            _schema(),
            lambda _arguments: (_ for _ in ()).throw(
                RuntimeError("Authorization: Bearer fixture-capability")
            ),
        )
    )
    registry.register(
        AgentCommandDefinition(
            "change",
            "Run one reviewed mutation fixture.",
            _schema(
                {"value": {"type": "string", "minLength": 1, "maxLength": 100}},
                required=("value",),
            ),
            lambda arguments: {"changed": arguments["value"]},
            mutating=True,
        )
    )
    return registry


@pytest.fixture
def running_server(tmp_path: Path) -> Iterator[tuple[AgentAccessServer, Path]]:
    connection_file = tmp_path / "private" / "agent.json"
    server = AgentAccessServer(_registry(), connection_file=connection_file)
    server.start(opt_in=True)
    try:
        yield server, connection_file
    finally:
        server.stop()


def _record(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def _headers(path: Path, **extra: str) -> dict[str, str]:
    token = _record(path)["token"]
    assert isinstance(token, str)
    return {
        "Authorization": f"Bearer {token}",
        "User-Agent": "transport-test",
        **extra,
    }


def test_start_requires_explicit_opt_in_and_never_uses_a_fixed_port(tmp_path: Path) -> None:
    connection_file = tmp_path / "agent.json"
    server = AgentAccessServer(_registry(), connection_file=connection_file)

    with pytest.raises(AgentServerError, match="opts in"):
        server.start()
    assert not server.running
    assert not connection_file.exists()

    endpoint = server.start(opt_in=True)
    try:
        assert endpoint.endpoint.startswith("http://127.0.0.1:")
        assert not endpoint.endpoint.endswith(":0")
        assert server.running
    finally:
        server.stop()
    assert not connection_file.exists()


def test_connection_file_is_private_bounded_and_info_never_contains_token(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    server, connection_file = running_server
    details = connection_file.stat()
    assert details.st_size < 8 * 1024
    if os.name != "nt":
        assert stat.S_IMODE(details.st_mode) == 0o600
    token = _record(connection_file)["token"]
    assert isinstance(token, str)

    with AgentClient(connection_file) as client:
        info = client.info()

    encoded = json.dumps(info)
    assert token not in encoded
    assert info["instanceId"] == server.instance_id
    assert info["protocolVersion"] == 1
    assert len(info["commands"]) == 4  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("headers", "expected"),
    [
        ({}, 401),
        ({"Authorization": "Bearer wrong-capability"}, 401),
        ({"Origin": "https://attacker.example"}, 403),
        ({"Referer": "https://attacker.example/page"}, 403),
        ({"Cookie": "session=browser"}, 403),
        ({"Sec-Fetch-Site": "cross-site"}, 403),
        ({"User-Agent": "Mozilla/5.0"}, 403),
        ({"Host": "attacker.example"}, 400),
    ],
)
def test_auth_host_and_browser_shaped_requests_are_refused(
    running_server: tuple[AgentAccessServer, Path],
    headers: dict[str, str],
    expected: int,
) -> None:
    server, connection_file = running_server
    assert server.endpoint is not None
    authorized = _headers(connection_file)
    authorized.update(headers)
    if headers == {} or set(headers) == {"Authorization"}:
        authorized = headers

    response = httpx.get(
        server.endpoint.endpoint + "/v1/info",
        headers=authorized,
        follow_redirects=False,
        trust_env=False,
    )

    assert response.status_code == expected
    assert "access-control-allow-origin" not in response.headers
    assert "fixture-capability" not in response.text


def test_methods_routes_content_type_json_and_request_size_fail_closed(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    server, connection_file = running_server
    assert server.endpoint is not None
    endpoint = server.endpoint.endpoint
    headers = _headers(connection_file)

    not_found = httpx.get(endpoint + "/missing", headers=headers, trust_env=False)
    method = httpx.options(endpoint + "/v1/info", headers=headers, trust_env=False)
    media = httpx.post(
        endpoint + "/v1/command", headers=headers, content=b"{}", trust_env=False
    )
    malformed = httpx.post(
        endpoint + "/v1/command",
        headers={**headers, "Content-Type": "application/json"},
        content=b"{",
        trust_env=False,
    )
    oversized = httpx.post(
        endpoint + "/v1/command",
        headers={**headers, "Content-Type": "application/json"},
        content=json.dumps({"name": "echo", "arguments": {"value": "x" * 66_000}}),
        trust_env=False,
    )

    assert not_found.status_code == 404
    assert method.status_code == 405
    assert media.status_code == 415
    assert malformed.status_code == 400
    assert oversized.status_code == 413


def test_duplicate_host_transfer_encoding_and_path_queries_are_refused(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    server, connection_file = running_server
    assert server.endpoint is not None
    port = int(server.endpoint.endpoint.rsplit(":", 1)[1])
    token = _record(connection_file)["token"]
    assert isinstance(token, str)
    common = f"Authorization: Bearer {token}\r\nUser-Agent: raw-test\r\n"

    duplicate_host = _raw_http(
        port,
        (
            "GET /v1/info HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{port}\r\n"
            "Host: attacker.example\r\n"
            f"{common}\r\n"
        ).encode("ascii"),
    )
    chunked = _raw_http(
        port,
        (
            "POST /v1/command HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{port}\r\n"
            f"{common}"
            "Content-Type: application/json\r\n"
            "Transfer-Encoding: chunked\r\n\r\n"
            "2\r\n{}\r\n0\r\n\r\n"
        ).encode("ascii"),
    )
    query = httpx.get(
        server.endpoint.endpoint + "/v1/info?browser=1",
        headers=_headers(connection_file),
        trust_env=False,
    )

    assert b" 400 " in duplicate_host
    assert b"invalid_host" in duplicate_host
    assert b" 400 " in chunked
    assert b"transfer_encoding" in chunked
    assert query.status_code == 404


def test_responses_have_defensive_headers_and_no_request_log(
    running_server: tuple[AgentAccessServer, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    server, connection_file = running_server
    assert server.endpoint is not None

    response = httpx.get(
        server.endpoint.endpoint + "/v1/info",
        headers=_headers(connection_file),
        trust_env=False,
    )

    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert "access-control-allow-origin" not in response.headers
    assert capsys.readouterr().err == ""


def test_rest_commands_redact_results_errors_and_secret_arguments(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    _, connection_file = running_server
    with AgentClient(connection_file) as client:
        assert client.call("echo", {"value": "hello"}) == {"value": "hello"}
        redacted = client.call("redacted")
        with pytest.raises(AgentClientError) as exploded:
            client.call("explode")
        with pytest.raises(AgentClientError) as secret_input:
            client.call("echo", {"value": "Authorization: Bearer should-not-cross"})

    encoded = json.dumps(redacted)
    assert "fixture-capability" not in encoded
    assert "[REDACTED]" in encoded
    assert "fixture-capability" not in str(exploded.value)
    assert secret_input.value.kind == "secret_argument"
    assert "should-not-cross" not in str(secret_input.value)


def test_mutation_requires_a_single_use_visible_review_capability(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    server, connection_file = running_server
    arguments = {"value": "reviewed"}
    with AgentClient(connection_file) as client:
        with pytest.raises(AgentClientError) as refused:
            client.call("change", arguments)
        preview = server.registry.prepare_mutation("change", arguments)
        review_token = server.registry.reviews.approve_from_ui(preview.id)
        assert client.call("change", arguments, review_token=review_token) == {
            "changed": "reviewed"
        }
        with pytest.raises(AgentClientError) as replayed:
            client.call("change", arguments, review_token=review_token)

    assert refused.value.kind == "review_required"
    assert replayed.value.kind == "review_required"


def test_token_rotation_invalidates_old_capability_and_client_reloads_file(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    server, connection_file = running_server
    assert server.endpoint is not None
    old_headers = _headers(connection_file)
    old_token = _record(connection_file)["token"]
    server.rotate_token()
    new_token = _record(connection_file)["token"]

    refused = httpx.get(
        server.endpoint.endpoint + "/v1/info",
        headers=old_headers,
        trust_env=False,
    )
    with AgentClient(connection_file) as client:
        assert client.info()["instanceId"] == server.instance_id

    assert old_token != new_token
    assert refused.status_code == 401


def test_stop_removes_owned_file_but_preserves_a_replacement(tmp_path: Path) -> None:
    connection_file = tmp_path / "agent.json"
    server = AgentAccessServer(_registry(), connection_file=connection_file)
    server.start(opt_in=True)
    replacement = {
        "schemaVersion": 1,
        "instanceId": "replacement-instance-id",
        "endpoint": "http://127.0.0.1:12345",
        "token": "a" * 43,
    }
    connection_file.write_text(json.dumps(replacement), encoding="utf-8")
    server.stop()

    assert json.loads(connection_file.read_text(encoding="utf-8")) == replacement


def test_mcp_initialize_ping_tools_call_and_errors_are_sessionless_and_redacted(
    running_server: tuple[AgentAccessServer, Path],
) -> None:
    _, connection_file = running_server
    with AgentClient(connection_file) as client:
        initialized = client.mcp(
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
        )
        ping = client.mcp({"jsonrpc": "2.0", "id": 2, "method": "ping", "params": {}})
        tools = client.tools()
        called = client.mcp(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "echo", "arguments": {"value": "mcp"}},
            }
        )
        failed = client.mcp(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "explode", "arguments": {}},
            }
        )
        missing = client.mcp(
            {"jsonrpc": "2.0", "id": 5, "method": "resources/list", "params": {}}
        )

    assert initialized["result"]["protocolVersion"] == "2025-06-18"  # type: ignore[index]
    assert ping["result"] == {}
    assert {item["name"] for item in tools} == {"change", "echo", "explode", "redacted"}
    assert called["result"]["structuredContent"] == {"value": "mcp"}  # type: ignore[index]
    assert failed["error"]["data"]["agentCode"] == "command_failed"  # type: ignore[index]
    assert "fixture-capability" not in json.dumps(failed)
    assert missing["error"]["code"] == -32601  # type: ignore[index]


def test_concurrency_is_bounded_before_new_request_threads_are_started(tmp_path: Path) -> None:
    entered = threading.Event()
    release = threading.Event()
    registry = AgentCommandRegistry()

    def slow(_arguments: Mapping[str, object]) -> object:
        entered.set()
        assert release.wait(timeout=5)
        return {"done": True}

    registry.register(AgentCommandDefinition("slow", "Block for a test.", _schema(), slow))
    connection_file = tmp_path / "agent.json"
    server = AgentAccessServer(registry, connection_file=connection_file, max_concurrency=1)
    server.start(opt_in=True)
    result: list[object] = []

    def call_slow() -> None:
        with AgentClient(connection_file) as client:
            result.append(client.call("slow"))

    worker = threading.Thread(target=call_slow)
    worker.start()
    try:
        assert entered.wait(timeout=5)
        assert server.endpoint is not None
        busy = httpx.get(
            server.endpoint.endpoint + "/v1/info",
            headers=_headers(connection_file),
            trust_env=False,
        )
        assert busy.status_code == 503
        assert busy.json()["error"]["code"] == "busy"
    finally:
        release.set()
        worker.join(timeout=5)
        server.stop()

    assert result == [{"done": True}]


def _raw_http(port: int, request: bytes) -> bytes:
    chunks: list[bytes] = []
    with socket.create_connection(("127.0.0.1", port), timeout=5) as client:
        client.sendall(request)
        while True:
            try:
                chunk = client.recv(8 * 1024)
            except ConnectionResetError:
                break
            if not chunk:
                break
            chunks.append(chunk)
    return b"".join(chunks)
