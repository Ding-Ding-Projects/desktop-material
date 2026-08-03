"""Strict loopback-only Ollama model management for the Linux TUI."""

from __future__ import annotations

import json
import re
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import SplitResult, urlsplit

import httpx

_MAX_ENDPOINT_LENGTH = 2_048
_MAX_JSON_BYTES = 2 * 1_024 * 1_024
_MAX_ERROR_BYTES = 16 * 1_024
_MAX_PULL_BYTES = 8 * 1_024 * 1_024
_MAX_NDJSON_LINE_BYTES = 64 * 1_024
_MAX_PULL_EVENTS = 4_096
_MAX_MODELS = 512
_MAX_OBJECT_PROPERTIES = 256
_MAX_FAMILIES = 32
_MAX_CAPABILITIES = 64
_MAX_METADATA = 256
_MAX_MODEL_NAME = 512
_MAX_IDENTITY = 1_024
_MAX_LARGE_TEXT = 64 * 1_024
_MODEL_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/@:-]*$")


class OllamaError(RuntimeError):
    """A validation, transport, response, or model operation failed."""

    def __init__(self, kind: str, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code


@dataclass(frozen=True)
class OllamaVersion:
    version: str


@dataclass(frozen=True)
class OllamaModelDetails:
    parent_model: str | None = None
    format: str | None = None
    family: str | None = None
    families: tuple[str, ...] = ()
    parameter_size: str | None = None
    quantization_level: str | None = None


@dataclass(frozen=True)
class OllamaModel:
    name: str
    model: str
    modified_at: str | None = None
    size: int | None = None
    digest: str | None = None
    details: OllamaModelDetails | None = None


@dataclass(frozen=True)
class OllamaRunningModel(OllamaModel):
    expires_at: str | None = None
    size_vram: int | None = None
    context_length: int | None = None


@dataclass(frozen=True)
class OllamaModelInfo:
    modelfile: str | None = None
    parameters: str | None = None
    template: str | None = None
    system: str | None = None
    license: str | None = None
    modified_at: str | None = None
    capabilities: tuple[str, ...] = ()
    metadata: tuple[tuple[str, str | int | bool], ...] = ()
    details: OllamaModelDetails | None = None


@dataclass(frozen=True)
class OllamaPullProgress:
    status: str
    digest: str | None = None
    total: int | None = None
    completed: int | None = None

    @property
    def fraction(self) -> float | None:
        if self.total is None or self.completed is None or self.total <= 0:
            return None
        return min(1.0, self.completed / self.total)


def normalize_model_name(value: str) -> str:
    """Validate the exact name accepted by native Ollama model routes."""

    if (
        not value
        or len(value) > _MAX_MODEL_NAME
        or value != value.strip()
        or _MODEL_PATTERN.fullmatch(value) is None
    ):
        raise OllamaError("validation", "The Ollama model name is invalid.")
    return value


def normalize_management_endpoint(value: str, *, require_v1: bool = True) -> str:
    """Return the trusted loopback origin for an exact root or ``/v1`` URL."""

    if (
        not value
        or len(value) > _MAX_ENDPOINT_LENGTH
        or value != value.strip()
        or "\\" in value
        or "?" in value
        or "#" in value
    ):
        raise OllamaError("endpoint", "The Ollama endpoint is invalid.")
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise OllamaError("endpoint", "The Ollama endpoint is invalid.") from error
    _validate_endpoint_authority(parsed)
    path = parsed.path
    allowed = {"/v1", "/v1/"} if require_v1 else {"", "/", "/v1", "/v1/"}
    if path not in allowed:
        expected = "the exact /v1 API base" if require_v1 else "an origin or /v1 API base"
        raise OllamaError("endpoint", f"The Ollama endpoint must use {expected}.")
    host = parsed.hostname or ""
    rendered_host = f"[{host}]" if ":" in host else host
    port = f":{parsed.port}" if parsed.port is not None else ""
    return f"{parsed.scheme.lower()}://{rendered_host.lower()}{port}"


def _validate_endpoint_authority(parsed: SplitResult) -> None:
    if parsed.scheme.lower() not in {"http", "https"}:
        raise OllamaError("endpoint", "The Ollama endpoint must use HTTP or HTTPS.")
    if parsed.username is not None or parsed.password is not None or "@" in parsed.netloc:
        raise OllamaError("endpoint", "The Ollama endpoint must not contain credentials.")
    hostname = (parsed.hostname or "").lower()
    if not _is_loopback_hostname(hostname):
        raise OllamaError("endpoint", "The Ollama endpoint must use a loopback address.")
    try:
        port = parsed.port
    except ValueError as error:
        raise OllamaError("endpoint", "The Ollama endpoint port is invalid.") from error
    if port is not None and not 1 <= port <= 65_535:
        raise OllamaError("endpoint", "The Ollama endpoint port is invalid.")
    if parsed.query or parsed.fragment:
        raise OllamaError("endpoint", "The Ollama endpoint cannot contain a query or fragment.")


def _is_loopback_hostname(hostname: str) -> bool:
    if hostname in {"localhost", "::1"}:
        return True
    octets = hostname.split(".")
    if len(octets) != 4 or octets[0] != "127":
        return False
    return all(octet.isdigit() and 0 <= int(octet) <= 255 for octet in octets)


class OllamaClient:
    """Bounded native Ollama API client with injectable HTTP transport."""

    def __init__(
        self,
        endpoint: str,
        *,
        transport: httpx.BaseTransport | None = None,
        request_timeout_seconds: float = 30.0,
        pull_timeout_seconds: float = 6 * 60 * 60.0,
    ) -> None:
        if not 0 < request_timeout_seconds <= 600:
            raise OllamaError("validation", "The Ollama request timeout is invalid.")
        if not 0 < pull_timeout_seconds <= 24 * 60 * 60:
            raise OllamaError("validation", "The Ollama pull timeout is invalid.")
        self.origin = normalize_management_endpoint(endpoint, require_v1=True)
        self.request_timeout_seconds = request_timeout_seconds
        self.pull_timeout_seconds = pull_timeout_seconds
        self._client = httpx.Client(
            base_url=self.origin,
            transport=transport,
            follow_redirects=False,
            timeout=httpx.Timeout(request_timeout_seconds),
            headers={"Accept": "application/json", "User-Agent": "desktop-material-tui"},
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> OllamaClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def health(self) -> OllamaVersion:
        document = self._request_json("GET", "/api/version")
        record = _require_mapping(document, "Ollama returned a malformed version response.")
        version = _required_string(record, "version", 256, "Malformed Ollama version")
        return OllamaVersion(version)

    def list_models(self) -> tuple[OllamaModel, ...]:
        document = self._request_json("GET", "/api/tags")
        return tuple(_parse_models(document, running=False))

    def list_running_models(self) -> tuple[OllamaRunningModel, ...]:
        document = self._request_json("GET", "/api/ps")
        parsed = _parse_models(document, running=True)
        return tuple(model for model in parsed if isinstance(model, OllamaRunningModel))

    def show_model(self, name: str) -> OllamaModelInfo:
        document = self._request_json(
            "POST", "/api/show", payload={"name": normalize_model_name(name)}
        )
        record = _require_mapping(document, "Ollama returned malformed model information.")
        capabilities = _optional_string_sequence(
            record, "capabilities", _MAX_CAPABILITIES, _MAX_IDENTITY
        )
        metadata = _metadata(record.get("model_info"))
        return OllamaModelInfo(
            modelfile=_optional_string(record, "modelfile", _MAX_LARGE_TEXT),
            parameters=_optional_string(record, "parameters", _MAX_LARGE_TEXT),
            template=_optional_string(record, "template", _MAX_LARGE_TEXT),
            system=_optional_string(record, "system", _MAX_LARGE_TEXT),
            license=_optional_string(record, "license", _MAX_LARGE_TEXT),
            modified_at=_optional_string(record, "modified_at", 128),
            capabilities=capabilities,
            metadata=metadata,
            details=_parse_details(record.get("details")),
        )

    def pull_model(
        self,
        name: str,
        *,
        cancel_event: threading.Event | None = None,
        on_progress: Callable[[OllamaPullProgress], None] | None = None,
    ) -> OllamaPullProgress:
        """Pull a model through bounded NDJSON with cancellation and progress."""

        model = normalize_model_name(name)
        cancel = cancel_event or threading.Event()
        started = time.monotonic()
        events = 0
        total_bytes = 0
        buffer = bytearray()
        last: OllamaPullProgress | None = None
        try:
            with self._client.stream(
                "POST",
                "/api/pull",
                json={"name": model, "stream": True},
                timeout=httpx.Timeout(self.request_timeout_seconds, read=120.0),
            ) as response:
                self._raise_for_status(response)
                self._validate_content_length(response, _MAX_PULL_BYTES)
                for chunk in response.iter_bytes():
                    if cancel.is_set():
                        raise OllamaError("cancelled", "The Ollama pull was cancelled.")
                    if time.monotonic() - started > self.pull_timeout_seconds:
                        raise OllamaError("timeout", "The Ollama pull exceeded its total timeout.")
                    total_bytes += len(chunk)
                    if total_bytes > _MAX_PULL_BYTES:
                        raise OllamaError(
                            "response", "Ollama pull progress exceeded its size bound."
                        )
                    buffer.extend(chunk)
                    while b"\n" in buffer:
                        raw, _, remainder = buffer.partition(b"\n")
                        buffer = bytearray(remainder)
                        if len(raw) > _MAX_NDJSON_LINE_BYTES:
                            raise OllamaError("response", "An Ollama progress line was too large.")
                        progress = _parse_pull_line(bytes(raw))
                        if progress is None:
                            continue
                        events += 1
                        if events > _MAX_PULL_EVENTS:
                            raise OllamaError(
                                "response", "Ollama returned too many progress events."
                            )
                        last = progress
                        if on_progress is not None:
                            try:
                                on_progress(progress)
                            except Exception as error:
                                raise OllamaError(
                                    "callback", "The Ollama progress handler failed."
                                ) from error
                if buffer:
                    if len(buffer) > _MAX_NDJSON_LINE_BYTES:
                        raise OllamaError("response", "An Ollama progress line was too large.")
                    progress = _parse_pull_line(bytes(buffer))
                    if progress is not None:
                        events += 1
                        last = progress
                        if on_progress is not None:
                            on_progress(progress)
        except httpx.HTTPError as error:
            raise OllamaError("transport", "Ollama could not be reached.") from error
        if last is None or events > _MAX_PULL_EVENTS:
            raise OllamaError("response", "Ollama returned no valid pull progress.")
        return last

    def copy_model(self, source: str, destination: str) -> None:
        self._request_json(
            "POST",
            "/api/copy",
            payload={
                "source": normalize_model_name(source),
                "destination": normalize_model_name(destination),
            },
            allow_empty=True,
        )

    def rename_model(self, source: str, destination: str, *, confirmation: str) -> None:
        source_name = normalize_model_name(source)
        destination_name = normalize_model_name(destination)
        if confirmation != source_name:
            raise OllamaError("confirmation", "Type the exact source model name to rename it.")
        self.copy_model(source_name, destination_name)
        self._delete_model(source_name)

    def load_model(self, name: str, *, keep_alive: str = "5m") -> None:
        if not keep_alive or len(keep_alive) > 64 or "\x00" in keep_alive:
            raise OllamaError("validation", "The Ollama keep-alive value is invalid.")
        self._request_json(
            "POST",
            "/api/generate",
            payload={
                "model": normalize_model_name(name),
                "prompt": "",
                "keep_alive": keep_alive,
                "stream": False,
            },
        )

    def unload_model(self, name: str) -> None:
        self._request_json(
            "POST",
            "/api/generate",
            payload={
                "model": normalize_model_name(name),
                "prompt": "",
                "keep_alive": 0,
                "stream": False,
            },
        )

    def delete_model(self, name: str, *, confirmation: str) -> None:
        model = normalize_model_name(name)
        if confirmation != model:
            raise OllamaError("confirmation", "Type the exact model name to delete it.")
        self._delete_model(model)

    def selectable_models(self) -> tuple[str, ...]:
        """Return the installed inventory for provider-model synchronization."""

        return tuple(sorted({model.name for model in self.list_models()}, key=str.casefold))

    def _delete_model(self, name: str) -> None:
        self._request_json(
            "DELETE",
            "/api/delete",
            payload={"name": name},
            allow_empty=True,
        )

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: Mapping[str, object] | None = None,
        allow_empty: bool = False,
    ) -> object:
        try:
            with self._client.stream(
                method,
                path,
                json=dict(payload) if payload is not None else None,
            ) as response:
                self._raise_for_status(response)
                body = self._read_bounded(response, _MAX_JSON_BYTES)
        except httpx.HTTPError as error:
            raise OllamaError("transport", "Ollama could not be reached.") from error
        if not body and allow_empty:
            return {}
        if not body:
            raise OllamaError("response", "Ollama returned an empty response.")
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise OllamaError("response", "Ollama returned invalid JSON.") from error

    def _raise_for_status(self, response: httpx.Response) -> None:
        if 200 <= response.status_code < 300:
            return
        # Consume at most a tiny error body to release the connection, but do
        # not return provider-authored text that could contain private data.
        self._read_bounded(response, _MAX_ERROR_BYTES)
        raise OllamaError(
            "http",
            f"Ollama request failed with HTTP {response.status_code}.",
            status_code=response.status_code,
        )

    @staticmethod
    def _validate_content_length(response: httpx.Response, maximum: int) -> None:
        raw = response.headers.get("content-length")
        if raw is None:
            return
        if not raw.isdigit() or int(raw) > maximum:
            raise OllamaError("response", "Ollama returned an invalid response size.")

    @classmethod
    def _read_bounded(cls, response: httpx.Response, maximum: int) -> bytes:
        cls._validate_content_length(response, maximum)
        chunks: list[bytes] = []
        received = 0
        for chunk in response.iter_bytes():
            received += len(chunk)
            if received > maximum:
                raise OllamaError("response", "The Ollama response exceeded its size bound.")
            chunks.append(chunk)
        return b"".join(chunks)


def _require_mapping(value: object, message: str) -> Mapping[str, object]:
    if not isinstance(value, dict) or len(value) > _MAX_OBJECT_PROPERTIES:
        raise OllamaError("response", message)
    if any(not isinstance(key, str) for key in value):
        raise OllamaError("response", message)
    return value


def _optional_string(record: Mapping[str, object], key: str, maximum: int) -> str | None:
    value = record.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > maximum:
        raise OllamaError("response", f"Ollama returned an invalid {key} value.")
    return value


def _required_string(
    record: Mapping[str, object], key: str, maximum: int, message: str
) -> str:
    value = _optional_string(record, key, maximum)
    if value is None or not value.strip():
        raise OllamaError("response", message)
    return value


def _optional_integer(record: Mapping[str, object], key: str) -> int | None:
    value = record.get(key)
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise OllamaError("response", f"Ollama returned an invalid {key} value.")
    return value


def _optional_string_sequence(
    record: Mapping[str, object], key: str, maximum_items: int, maximum_length: int
) -> tuple[str, ...]:
    value = record.get(key)
    if value is None:
        return ()
    if not isinstance(value, list) or len(value) > maximum_items:
        raise OllamaError("response", f"Ollama returned an invalid {key} list.")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or len(item) > maximum_length:
            raise OllamaError("response", f"Ollama returned an invalid {key} list.")
        result.append(item)
    return tuple(result)


def _parse_details(value: object) -> OllamaModelDetails | None:
    if value is None:
        return None
    record = _require_mapping(value, "Ollama returned malformed model details.")
    return OllamaModelDetails(
        parent_model=_optional_string(record, "parent_model", _MAX_IDENTITY),
        format=_optional_string(record, "format", _MAX_IDENTITY),
        family=_optional_string(record, "family", _MAX_IDENTITY),
        families=_optional_string_sequence(
            record, "families", _MAX_FAMILIES, _MAX_IDENTITY
        ),
        parameter_size=_optional_string(record, "parameter_size", _MAX_IDENTITY),
        quantization_level=_optional_string(
            record, "quantization_level", _MAX_IDENTITY
        ),
    )


def _parse_models(
    value: object, *, running: bool
) -> Sequence[OllamaModel | OllamaRunningModel]:
    record = _require_mapping(value, "Ollama returned a malformed model list.")
    models = record.get("models")
    if not isinstance(models, list) or len(models) > _MAX_MODELS:
        raise OllamaError("response", "Ollama returned a malformed model list.")
    result: list[OllamaModel | OllamaRunningModel] = []
    for raw in models:
        model = _require_mapping(raw, "Ollama returned a malformed model record.")
        name = _optional_string(model, "name", _MAX_MODEL_NAME)
        identity = name or _optional_string(model, "model", _MAX_MODEL_NAME)
        if identity is None or not identity.strip():
            raise OllamaError("response", "Ollama returned a model without an identity.")
        common: dict[str, Any] = {
            "name": name or identity,
            "model": _optional_string(model, "model", _MAX_MODEL_NAME) or identity,
            "modified_at": _optional_string(model, "modified_at", 128),
            "size": _optional_integer(model, "size"),
            "digest": _optional_string(model, "digest", 256),
            "details": _parse_details(model.get("details")),
        }
        if running:
            result.append(
                OllamaRunningModel(
                    **common,
                    expires_at=_optional_string(model, "expires_at", 128),
                    size_vram=_optional_integer(model, "size_vram"),
                    context_length=_optional_integer(model, "context_length"),
                )
            )
        else:
            result.append(OllamaModel(**common))
    return result


def _metadata(value: object) -> tuple[tuple[str, str | int | bool], ...]:
    if value is None:
        return ()
    record = _require_mapping(value, "Ollama returned malformed model metadata.")
    if len(record) > _MAX_METADATA:
        raise OllamaError("response", "Ollama returned too much model metadata.")
    result: list[tuple[str, str | int | bool]] = []
    for key in sorted(record):
        if not key or len(key) > 256 or key in {"__proto__", "constructor", "prototype"}:
            raise OllamaError("response", "Ollama returned an invalid metadata key.")
        item = record[key]
        if isinstance(item, (bool, int)) or (
            isinstance(item, str) and len(item) <= 2_048
        ):
            result.append((key, item))
    return tuple(result)


def _parse_pull_line(raw: bytes) -> OllamaPullProgress | None:
    if not raw.strip():
        return None
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OllamaError("response", "Ollama returned invalid pull progress.") from error
    record = _require_mapping(value, "Ollama returned malformed pull progress.")
    provider_error = record.get("error")
    if provider_error is not None:
        # Do not print an arbitrary provider-authored error body; the operation
        # and status remain actionable without echoing untrusted local text.
        raise OllamaError("server", "Ollama rejected the model operation.")
    status = _required_string(record, "status", 512, "Missing Ollama pull status")
    return OllamaPullProgress(
        status=status,
        digest=_optional_string(record, "digest", 256),
        total=_optional_integer(record, "total"),
        completed=_optional_integer(record, "completed"),
    )
