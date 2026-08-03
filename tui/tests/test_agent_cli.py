"""One-shot CLI and stdio proxy acceptance tests."""

from __future__ import annotations

import json
from io import StringIO
from pathlib import Path

from desktop_material_tui.agent_cli import main
from desktop_material_tui.application.agent_access import (
    AgentCommandDefinition,
    AgentCommandRegistry,
)
from desktop_material_tui.infrastructure.agent_server import AgentAccessServer


def _schema(*, value: bool = False) -> dict[str, object]:
    properties = (
        {"value": {"type": "string", "minLength": 1, "maxLength": 100}}
        if value
        else {}
    )
    return {
        "type": "object",
        "properties": properties,
        "required": ["value"] if value else [],
        "additionalProperties": False,
    }


def _server(tmp_path: Path) -> tuple[AgentAccessServer, Path]:
    registry = AgentCommandRegistry()
    registry.register(
        AgentCommandDefinition(
            "echo",
            "Echo one value.",
            _schema(value=True),
            lambda arguments: {"value": arguments["value"]},
        )
    )
    registry.register(
        AgentCommandDefinition(
            "change",
            "Change one reviewed value.",
            _schema(value=True),
            lambda arguments: {"changed": arguments["value"]},
            mutating=True,
        )
    )
    connection_file = tmp_path / "agent.json"
    server = AgentAccessServer(registry, connection_file=connection_file)
    server.start(opt_in=True)
    return server, connection_file


def test_info_tools_and_call_emit_bounded_json_without_capability(tmp_path: Path) -> None:
    server, connection_file = _server(tmp_path)
    token = json.loads(connection_file.read_text(encoding="utf-8"))["token"]
    try:
        info_output = StringIO()
        tools_output = StringIO()
        call_output = StringIO()
        assert (
            main(
                ["--connection-file", str(connection_file), "info"],
                output_stream=info_output,
                error_stream=StringIO(),
            )
            == 0
        )
        assert (
            main(
                ["--connection-file", str(connection_file), "tools"],
                output_stream=tools_output,
                error_stream=StringIO(),
            )
            == 0
        )
        assert (
            main(
                [
                    "--connection-file",
                    str(connection_file),
                    "call",
                    "echo",
                    "--arguments",
                    '{"value":"from-cli"}',
                ],
                output_stream=call_output,
                error_stream=StringIO(),
            )
            == 0
        )
    finally:
        server.stop()

    assert json.loads(info_output.getvalue())["protocolVersion"] == 1
    assert {item["name"] for item in json.loads(tools_output.getvalue())} == {
        "change",
        "echo",
    }
    assert json.loads(call_output.getvalue()) == {"value": "from-cli"}
    combined = info_output.getvalue() + tools_output.getvalue() + call_output.getvalue()
    assert token not in combined


def test_review_capability_is_read_from_stdin_once_and_never_rendered(tmp_path: Path) -> None:
    server, connection_file = _server(tmp_path)
    arguments = {"value": "reviewed"}
    preview = server.registry.prepare_mutation("change", arguments)
    review_token = server.registry.reviews.approve_from_ui(preview.id)
    stdout = StringIO()
    stderr = StringIO()
    try:
        exit_code = main(
            [
                "--connection-file",
                str(connection_file),
                "call",
                "change",
                "--arguments",
                json.dumps(arguments),
                "--review-token-stdin",
            ],
            input_stream=StringIO(review_token + "\n"),
            output_stream=stdout,
            error_stream=stderr,
        )
    finally:
        server.stop()

    assert exit_code == 0
    assert json.loads(stdout.getvalue()) == {"changed": "reviewed"}
    assert stderr.getvalue() == ""
    assert review_token not in stdout.getvalue()


def test_stdio_proxies_ndjson_mcp_and_reports_invalid_lines(tmp_path: Path) -> None:
    server, connection_file = _server(tmp_path)
    source = StringIO(
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
        '{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}\n'
        "oops\n"
    )
    stdout = StringIO()
    try:
        exit_code = main(
            ["--connection-file", str(connection_file), "stdio"],
            input_stream=source,
            output_stream=stdout,
            error_stream=StringIO(),
        )
    finally:
        server.stop()

    responses = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert exit_code == 1
    assert responses[0]["result"]["protocolVersion"] == "2025-06-18"
    assert responses[1]["result"] == {}
    assert responses[2]["error"]["data"]["agentCode"] == "invalid_ndjson"


def test_cli_errors_are_generic_and_do_not_echo_sensitive_arguments(tmp_path: Path) -> None:
    server, connection_file = _server(tmp_path)
    stdout = StringIO()
    stderr = StringIO()
    sensitive = "Authorization: Bearer should-never-be-printed"
    try:
        exit_code = main(
            [
                "--connection-file",
                str(connection_file),
                "call",
                "echo",
                "--arguments",
                json.dumps({"value": sensitive}),
            ],
            output_stream=stdout,
            error_stream=stderr,
        )
    finally:
        server.stop()

    assert exit_code == 1
    assert stdout.getvalue() == ""
    assert "should-never-be-printed" not in stderr.getvalue()
    assert json.loads(stderr.getvalue())["error"]["code"] == "secret_argument"

