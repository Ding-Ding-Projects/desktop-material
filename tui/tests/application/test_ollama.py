"""Loopback trust, response bounds, and Ollama lifecycle tests."""

from __future__ import annotations

import json
import threading
from collections.abc import Callable

import httpx
import pytest

from desktop_material_tui.application.ollama import (
    OllamaClient,
    OllamaError,
    normalize_management_endpoint,
    normalize_model_name,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("http://127.0.0.1:11434/v1", "http://127.0.0.1:11434"),
        ("http://127.42.3.9/v1/", "http://127.42.3.9"),
        ("http://localhost:11434/v1", "http://localhost:11434"),
        ("http://[::1]:11434/v1", "http://[::1]:11434"),
    ],
)
def test_endpoint_accepts_only_exact_loopback_v1(value: str, expected: str) -> None:
    assert normalize_management_endpoint(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "",
        " http://127.0.0.1:11434/v1",
        "ftp://127.0.0.1:11434/v1",
        "http://192.168.1.5:11434/v1",
        "http://127.1:11434/v1",
        "http://user:password@127.0.0.1:11434/v1",
        "http://127.0.0.1:11434/",
        "http://127.0.0.1:11434/api",
        "http://127.0.0.1:11434/%2e%2e/v1",
        "http://127.0.0.1:11434/v1?token=secret",
        "http://127.0.0.1:11434/v1#fragment",
        "http://127.0.0.1:0/v1",
        "http://127.0.0.1:99999/v1",
        "http:\\127.0.0.1:11434\\v1",
    ],
)
def test_endpoint_rejects_remote_ambiguous_or_credentialed_urls(value: str) -> None:
    with pytest.raises(OllamaError):
        normalize_management_endpoint(value)


@pytest.mark.parametrize(
    "value",
    ["", " model", "model ", "model name", "../model", "model?token=x", "a" * 513],
)
def test_model_names_are_strict(value: str) -> None:
    with pytest.raises(OllamaError, match="model name is invalid"):
        normalize_model_name(value)
    assert normalize_model_name("registry.example/team/model:7b") == (
        "registry.example/team/model:7b"
    )


def test_health_inventory_running_and_show_are_strictly_parsed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/version":
            return _json(request, {"version": "0.9.1"})
        if request.url.path == "/api/tags":
            return _json(
                request,
                {
                    "models": [
                        {
                            "name": "qwen3:8b",
                            "model": "qwen3:8b",
                            "size": 8_000,
                            "digest": "sha256:abc",
                            "details": {
                                "format": "gguf",
                                "family": "qwen3",
                                "families": ["qwen3"],
                                "parameter_size": "8B",
                                "quantization_level": "Q4_K_M",
                            },
                        }
                    ]
                },
            )
        if request.url.path == "/api/ps":
            return _json(
                request,
                {
                    "models": [
                        {
                            "name": "qwen3:8b",
                            "model": "qwen3:8b",
                            "expires_at": "2026-08-02T10:00:00Z",
                            "size_vram": 7_500,
                            "context_length": 32_768,
                        }
                    ]
                },
            )
        if request.url.path == "/api/show":
            return _json(
                request,
                {
                    "modelfile": "FROM qwen3:8b",
                    "parameters": "temperature 0.7",
                    "capabilities": ["completion", "tools"],
                    "model_info": {
                        "general.architecture": "qwen3",
                        "general.layers": 36,
                        "general.chat": True,
                        "ignored": {"nested": "object"},
                    },
                    "details": {"family": "qwen3"},
                },
            )
        raise AssertionError(request.url.path)

    with _client(handler) as client:
        assert client.health().version == "0.9.1"
        model = client.list_models()[0]
        assert model.name == "qwen3:8b"
        assert model.details is not None
        assert model.details.parameter_size == "8B"
        running = client.list_running_models()[0]
        assert running.size_vram == 7_500
        assert running.context_length == 32_768
        info = client.show_model("qwen3:8b")

    assert info.capabilities == ("completion", "tools")
    assert info.metadata == (
        ("general.architecture", "qwen3"),
        ("general.chat", True),
        ("general.layers", 36),
    )


def test_pull_streams_bounded_progress_and_honours_cancellation() -> None:
    payload = (
        b'{"status":"pulling manifest"}\n'
        b'{"status":"downloading","digest":"sha256:a","total":100,"completed":40}\n'
        b'{"status":"success","total":100,"completed":100}\n'
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/pull"
        assert json.loads(request.content) == {"name": "qwen3:8b", "stream": True}
        return httpx.Response(200, content=payload, request=request)

    observed: list[str] = []
    with _client(handler) as client:
        result = client.pull_model(
            "qwen3:8b", on_progress=lambda progress: observed.append(progress.status)
        )

    assert observed == ["pulling manifest", "downloading", "success"]
    assert result.status == "success"
    assert result.fraction == 1.0

    cancel = threading.Event()
    cancel.set()
    with _client(handler) as client, pytest.raises(OllamaError) as caught:
        client.pull_model("qwen3:8b", cancel_event=cancel)
    assert caught.value.kind == "cancelled"


def test_pull_rejects_malformed_provider_error_and_callback_failure() -> None:
    bodies = iter(
        (
            b'{"error":"private local path and token must not escape"}\n',
            b'{"status":"downloading"}\n',
            b"{" + b"x" * (65 * 1_024) + b"}\n",
        )
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=next(bodies), request=request)

    with _client(handler) as client, pytest.raises(OllamaError) as provider:
        client.pull_model("qwen3:8b")
    assert provider.value.kind == "server"
    assert "private local path" not in str(provider.value)

    with _client(handler) as client, pytest.raises(OllamaError) as callback:
        client.pull_model(
            "qwen3:8b",
            on_progress=lambda _progress: (_ for _ in ()).throw(RuntimeError("boom")),
        )
    assert callback.value.kind == "callback"

    with _client(handler) as client, pytest.raises(OllamaError, match="too large"):
        client.pull_model("qwen3:8b")


def test_copy_rename_load_unload_and_guarded_delete_use_exact_routes() -> None:
    requests: list[tuple[str, str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(
            (
                request.method,
                request.url.path,
                json.loads(request.content) if request.content else None,
            )
        )
        if request.url.path == "/api/generate":
            return _json(request, {"done": True})
        return httpx.Response(200, content=b"", request=request)

    with _client(handler) as client:
        client.copy_model("source:1", "copy:1")
        with pytest.raises(OllamaError, match="exact source"):
            client.rename_model("source:1", "renamed:1", confirmation="wrong")
        client.rename_model("source:1", "renamed:1", confirmation="source:1")
        client.load_model("renamed:1", keep_alive="10m")
        client.unload_model("renamed:1")
        with pytest.raises(OllamaError, match="exact model name"):
            client.delete_model("renamed:1", confirmation="wrong")
        client.delete_model("renamed:1", confirmation="renamed:1")

    assert requests == [
        ("POST", "/api/copy", {"source": "source:1", "destination": "copy:1"}),
        ("POST", "/api/copy", {"source": "source:1", "destination": "renamed:1"}),
        ("DELETE", "/api/delete", {"name": "source:1"}),
        (
            "POST",
            "/api/generate",
            {"model": "renamed:1", "prompt": "", "keep_alive": "10m", "stream": False},
        ),
        (
            "POST",
            "/api/generate",
            {"model": "renamed:1", "prompt": "", "keep_alive": 0, "stream": False},
        ),
        ("DELETE", "/api/delete", {"name": "renamed:1"}),
    ]


def test_selectable_models_are_deduplicated_and_sorted() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _json(
            request,
            {
                "models": [
                    {"name": "zeta:latest"},
                    {"name": "Alpha:7b"},
                    {"name": "zeta:latest"},
                ]
            },
        )

    with _client(handler) as client:
        assert client.selectable_models() == ("Alpha:7b", "zeta:latest")


def test_response_size_shape_and_http_errors_fail_closed() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                200,
                headers={"content-length": str(3 * 1_024 * 1_024)},
                content=b"",
                request=request,
            )
        if calls == 2:
            return _json(request, {"models": [{}]})
        return httpx.Response(
            403,
            content=b"private-token-and-path",
            request=request,
        )

    with _client(handler) as client:
        with pytest.raises(OllamaError, match="response size"):
            client.list_models()
        with pytest.raises(OllamaError, match="without an identity"):
            client.list_models()
        with pytest.raises(OllamaError) as forbidden:
            client.list_models()

    assert forbidden.value.status_code == 403
    assert "private-token" not in str(forbidden.value)


def test_model_and_object_caps_are_enforced() -> None:
    oversized_models = {"models": [{"name": f"m{index}"} for index in range(513)]}
    oversized_record = {f"key-{index}": index for index in range(257)}
    calls = iter((oversized_models, oversized_record))

    def handler(request: httpx.Request) -> httpx.Response:
        return _json(request, next(calls))

    with _client(handler) as client:
        with pytest.raises(OllamaError, match="malformed model list"):
            client.list_models()
        with pytest.raises(OllamaError, match="malformed version"):
            client.health()


def _json(
    request: httpx.Request, payload: object, *, status: int = 200
) -> httpx.Response:
    return httpx.Response(status, json=payload, request=request)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> OllamaClient:
    return OllamaClient(
        "http://127.0.0.1:11434/v1",
        transport=httpx.MockTransport(handler),
    )

