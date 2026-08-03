"""Connection-file validation, response bounds, and NDJSON client tests."""

from __future__ import annotations

import json
import os
from io import StringIO
from pathlib import Path

import httpx
import pytest

from desktop_material_tui.application.agent_client import (
    AgentClient,
    AgentClientError,
    load_agent_connection,
    proxy_mcp_ndjson,
)


def _connection_file(tmp_path: Path, **changes: object) -> Path:
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "instanceId": "valid-instance-identifier",
        "endpoint": "http://127.0.0.1:32123",
        "token": "a" * 43,
    }
    payload.update(changes)
    path = tmp_path / "agent.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    path.chmod(0o600)
    return path


def test_connection_repr_never_contains_capability(tmp_path: Path) -> None:
    path = _connection_file(tmp_path)
    connection = load_agent_connection(path)

    assert connection.endpoint == "http://127.0.0.1:32123"
    assert connection.token not in repr(connection)
    assert "token=" not in repr(connection)


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://127.0.0.1:32123",
        "http://localhost:32123",
        "http://127.0.0.2:32123",
        "http://127.0.0.1:0",
        "http://127.0.0.1:99999",
        "http://user:password@127.0.0.1:32123",
        "http://127.0.0.1:32123/path",
        "http://127.0.0.1:32123?token=value",
        "http://127.0.0.1:32123#fragment",
        " http://127.0.0.1:32123",
        "http:\\127.0.0.1:32123",
    ],
)
def test_connection_rejects_non_exact_loopback_endpoints(
    tmp_path: Path, endpoint: str
) -> None:
    path = _connection_file(tmp_path, endpoint=endpoint)

    with pytest.raises(AgentClientError, match="endpoint"):
        load_agent_connection(path)


def test_connection_rejects_symlinks_wrong_shape_size_and_public_mode(tmp_path: Path) -> None:
    target = _connection_file(tmp_path)
    symlink = tmp_path / "linked.json"
    try:
        symlink.symlink_to(target)
    except OSError:
        symlink = None  # type: ignore[assignment]
    if symlink is not None:
        with pytest.raises(AgentClientError, match="symlink"):
            load_agent_connection(symlink)

    malformed = tmp_path / "malformed.json"
    malformed.write_text("{}", encoding="utf-8")
    malformed.chmod(0o600)
    with pytest.raises(AgentClientError, match="fields"):
        load_agent_connection(malformed)

    oversized = tmp_path / "oversized.json"
    oversized.write_bytes(b"x" * (8 * 1024 + 1))
    oversized.chmod(0o600)
    with pytest.raises(AgentClientError, match="size"):
        load_agent_connection(oversized)

    if os.name != "nt":
        target.chmod(0o644)
        with pytest.raises(AgentClientError, match="owner-private"):
            load_agent_connection(target)


def test_client_refuses_redirects_without_following(tmp_path: Path) -> None:
    path = _connection_file(tmp_path)
    requests: list[httpx.Request] = []

    def redirect(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            302,
            headers={"location": "https://attacker.example/capability"},
            request=request,
        )

    with (
        AgentClient(path, transport=httpx.MockTransport(redirect)) as client,
        pytest.raises(AgentClientError) as error,
    ):
        client.info()

    assert error.value.kind == "redirect"
    assert len(requests) == 1
    assert requests[0].url.host == "127.0.0.1"
    assert requests[0].headers["authorization"].endswith("a" * 43)


def test_client_bounds_advertised_streamed_and_malformed_responses(tmp_path: Path) -> None:
    path = _connection_file(tmp_path)
    responses = iter(
        (
            httpx.Response(
                200,
                headers={
                    "content-type": "application/json",
                    "content-length": str(2 * 1024 * 1024),
                },
            ),
            httpx.Response(
                200,
                headers={"content-type": "application/json"},
                content=b"x" * 2_000,
            ),
            httpx.Response(200, headers={"content-type": "text/html"}, content=b"{}"),
            httpx.Response(
                200, headers={"content-type": "application/json"}, content=b"not json"
            ),
        )
    )

    def handler(request: httpx.Request) -> httpx.Response:
        response = next(responses)
        response.request = request
        return response

    with AgentClient(
        path,
        max_response_bytes=1_024,
        transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(AgentClientError, match="bound"):
            client.info()
        with pytest.raises(AgentClientError, match="bound"):
            client.info()
        with pytest.raises(AgentClientError, match="non-JSON"):
            client.info()
        with pytest.raises(AgentClientError, match="malformed"):
            client.info()


def test_client_redacts_even_a_malicious_mock_server_response(tmp_path: Path) -> None:
    path = _connection_file(tmp_path)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={
                "result": {
                    "token": "server-controlled-capability",
                    "message": "Authorization: Bearer server-controlled-capability",
                }
            },
            request=request,
        )

    with AgentClient(path, transport=httpx.MockTransport(handler)) as client:
        result = client.call("anything")

    encoded = json.dumps(result)
    assert "server-controlled-capability" not in encoded
    assert "[REDACTED]" in encoded


def test_ndjson_proxy_outputs_one_response_per_line_and_never_connection_token(
    tmp_path: Path,
) -> None:
    path = _connection_file(tmp_path)

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={"jsonrpc": "2.0", "id": payload.get("id"), "result": {}},
            request=request,
        )

    source = StringIO(
        '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}\n'
        "not-json\n"
        "[]\n"
    )
    output = StringIO()
    with AgentClient(path, transport=httpx.MockTransport(handler)) as client:
        failures = proxy_mcp_ndjson(client, source, output)

    lines = output.getvalue().splitlines()
    assert failures == 2
    assert len(lines) == 3
    assert json.loads(lines[0])["result"] == {}
    assert json.loads(lines[1])["error"]["data"]["agentCode"] == "invalid_ndjson"
    assert json.loads(lines[2])["error"]["data"]["agentCode"] == "invalid_ndjson"
    assert "a" * 43 not in output.getvalue()


def test_ndjson_proxy_rejects_an_overlong_line_without_forwarding(tmp_path: Path) -> None:
    path = _connection_file(tmp_path)
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={"jsonrpc": "2.0", "id": 1, "result": {}},
            request=request,
        )

    output = StringIO()
    with AgentClient(path, transport=httpx.MockTransport(handler)) as client:
        failures = proxy_mcp_ndjson(client, StringIO("x" * 200_000 + "\n"), output)

    assert failures == 1
    assert calls == 0
    assert "64 KiB" in output.getvalue()
