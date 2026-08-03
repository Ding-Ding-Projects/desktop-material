"""Bounded, redirect-free JSON HTTP transport for provider APIs."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from urllib.parse import urlsplit

import httpx


class ProviderClientError(RuntimeError):
    """Display-safe provider failure that never includes headers or bodies."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int | None = None,
        retryable: bool = False,
    ) -> None:
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(message)


class ProviderAuthenticationError(ProviderClientError):
    def __init__(self, status_code: int) -> None:
        super().__init__(
            "The provider refused this account credential or its permissions.",
            code="provider_authentication_failed",
            status_code=status_code,
        )


class ProviderResponseError(ProviderClientError):
    def __init__(self, message: str = "The provider returned an invalid response.") -> None:
        super().__init__(message, code="provider_invalid_response")


class ProviderResponseTooLargeError(ProviderClientError):
    def __init__(self, maximum_bytes: int) -> None:
        super().__init__(
            f"The provider response exceeded the {maximum_bytes}-byte safety limit.",
            code="provider_response_too_large",
        )


class BoundedHttpClient:
    """Stream JSON into a hard byte cap and refuse redirects and insecure URLs."""

    def __init__(
        self,
        client: httpx.Client | None = None,
        *,
        timeout_seconds: float = 30.0,
        maximum_response_bytes: int = 4 * 1024 * 1024,
    ) -> None:
        if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive and finite")
        if not 1024 <= maximum_response_bytes <= 16 * 1024 * 1024:
            raise ValueError("maximum_response_bytes must be between 1 KiB and 16 MiB")
        self._client = client or httpx.Client(follow_redirects=False)
        self._owns_client = client is None
        self._timeout = float(timeout_seconds)
        self.maximum_response_bytes = maximum_response_bytes

    def get_json(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        params: Mapping[str, str | int] | None = None,
    ) -> object:
        _https_origin(url)
        try:
            with self._client.stream(
                "GET",
                url,
                headers=dict(headers),
                params=dict(params or {}),
                timeout=self._timeout,
                follow_redirects=False,
            ) as response:
                if response.status_code in {401, 403}:
                    raise ProviderAuthenticationError(response.status_code)
                if 300 <= response.status_code < 400:
                    raise ProviderClientError(
                        "The provider attempted an untrusted redirect.",
                        code="provider_redirect_refused",
                        status_code=response.status_code,
                    )
                if response.status_code >= 400:
                    raise ProviderClientError(
                        f"The provider request failed with HTTP {response.status_code}.",
                        code="provider_http_failed",
                        status_code=response.status_code,
                        retryable=response.status_code >= 500,
                    )
                content_length = response.headers.get("content-length")
                if content_length is not None:
                    try:
                        advertised = int(content_length)
                    except ValueError as error:
                        raise ProviderResponseError(
                            "The provider returned an invalid Content-Length header."
                        ) from error
                    if advertised < 0 or advertised > self.maximum_response_bytes:
                        raise ProviderResponseTooLargeError(self.maximum_response_bytes)
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
                is_json = content_type == "application/json" or content_type.endswith("+json")
                if content_type and not is_json:
                    raise ProviderResponseError("The provider response is not JSON.")
                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > self.maximum_response_bytes:
                        raise ProviderResponseTooLargeError(self.maximum_response_bytes)
                    chunks.append(chunk)
        except httpx.TimeoutException as error:
            raise ProviderClientError(
                "The provider request timed out.",
                code="provider_timeout",
                retryable=True,
            ) from error
        except httpx.HTTPError as error:
            raise ProviderClientError(
                "The provider connection failed.",
                code="provider_connection_failed",
                retryable=True,
            ) from error
        try:
            return json.loads(b"".join(chunks).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ProviderResponseError("The provider returned invalid JSON.") from error

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> BoundedHttpClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def require_same_origin(base_url: str, candidate_url: str) -> str:
    if _https_origin(base_url) != _https_origin(candidate_url):
        raise ProviderResponseError("Provider pagination attempted to leave its API origin.")
    return candidate_url


def _https_origin(url: str) -> tuple[str, str, int | None]:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise ProviderResponseError("Provider URL is invalid.") from error
    if (
        parsed.scheme.lower() != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise ProviderResponseError("Provider URL must be credential-free HTTPS.")
    return parsed.scheme.lower(), parsed.hostname.lower(), port
