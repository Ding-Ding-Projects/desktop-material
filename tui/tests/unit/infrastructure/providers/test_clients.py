from __future__ import annotations

import json

import httpx
import pytest

from desktop_material_tui.infrastructure.providers import (
    BitbucketClient,
    BoundedHttpClient,
    GitLabClient,
    ProviderAuthenticationError,
    ProviderResponseError,
    ProviderResponseTooLargeError,
)
from desktop_material_tui.infrastructure.providers.http import require_same_origin


def json_response(payload: object, *, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status,
        content=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )


def bounded(handler: httpx.MockTransport) -> BoundedHttpClient:
    return BoundedHttpClient(httpx.Client(transport=handler, follow_redirects=False))


def test_gitlab_identity_and_repository_parsing_is_strict_and_bounded() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/user"):
            return json_response(
                {
                    "id": 42,
                    "username": "operator",
                    "name": "Operator",
                    "avatar_url": "https://gitlab.example.test/avatar.png",
                    "email": "operator@example.test",
                }
            )
        return json_response(
            [
                {
                    "id": 99,
                    "path_with_namespace": "group/project",
                    "web_url": "https://gitlab.example.test/group/project",
                    "http_url_to_repo": "https://gitlab.example.test/group/project.git",
                    "visibility": "private",
                }
            ]
        )

    client = GitLabClient(
        "https://gitlab.example.test",
        lambda: "not-a-real-token",
        http=bounded(httpx.MockTransport(handler)),
    )

    identity = client.identity()
    repositories = client.list_repositories(limit=1)

    assert identity.provider_id == "42"
    assert identity.endpoint == "https://gitlab.example.test"
    assert repositories[0].owner == "group"
    assert repositories[0].private
    assert requests[0].headers["private-token"] == "not-a-real-token"
    assert requests[1].url.params["per_page"] == "1"


def test_bitbucket_identity_and_repository_use_https_basic_auth() -> None:
    requests: list[httpx.Request] = []
    uuid = "{12345678-1234-1234-1234-123456789abc}"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/user"):
            return json_response(
                {
                    "uuid": uuid,
                    "nickname": "operator",
                    "display_name": "Operator",
                    "links": {
                        "avatar": {"href": "https://bitbucket.example.test/avatar.png"}
                    },
                }
            )
        return json_response(
            {
                "values": [
                    {
                        "uuid": uuid,
                        "full_name": "workspace/project",
                        "is_private": True,
                        "links": {
                            "html": {
                                "href": "https://bitbucket.org/workspace/project"
                            },
                            "clone": [
                                {
                                    "name": "https",
                                    "href": "https://bitbucket.org/workspace/project.git",
                                }
                            ],
                        },
                    }
                ]
            }
        )

    client = BitbucketClient(
        "operator",
        lambda: "not-a-real-password",
        http=bounded(httpx.MockTransport(handler)),
    )

    identity = client.identity()
    repositories = client.list_repositories(workspace="workspace")

    assert identity.provider_id == uuid.strip("{}").lower()
    assert repositories[0].name == "project"
    assert requests[0].headers["authorization"].startswith("Basic ")
    assert "not-a-real-password" not in requests[0].headers["authorization"]


def test_provider_auth_error_never_exposes_token_or_response_body() -> None:
    credential_value = "not-a-real-token"

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            content=f"credential={credential_value}".encode(),
            headers={"content-type": "text/plain"},
        )

    client = GitLabClient(
        "https://gitlab.example.test",
        lambda: credential_value,
        http=bounded(httpx.MockTransport(handler)),
    )

    with pytest.raises(ProviderAuthenticationError) as caught:
        client.identity()

    assert credential_value not in str(caught.value)


def test_streamed_response_and_advertised_length_are_both_bounded() -> None:
    oversized = b"{" + b" " * 2048 + b"}"

    def streamed(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=oversized,
            headers={"content-type": "application/json"},
        )

    client = BoundedHttpClient(
        httpx.Client(transport=httpx.MockTransport(streamed)),
        maximum_response_bytes=1024,
    )
    with pytest.raises(ProviderResponseTooLargeError):
        client.get_json("https://provider.example.test/data", headers={})

    def advertised(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"{}",
            headers={"content-type": "application/json", "content-length": "999999"},
        )

    client = BoundedHttpClient(
        httpx.Client(transport=httpx.MockTransport(advertised)),
        maximum_response_bytes=1024,
    )
    with pytest.raises(ProviderResponseTooLargeError):
        client.get_json("https://provider.example.test/data", headers={})


def test_redirects_insecure_urls_and_cross_origin_pagination_are_refused() -> None:
    def redirect(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://evil.example.test/steal"})

    client = bounded(httpx.MockTransport(redirect))
    with pytest.raises(Exception, match="untrusted redirect"):
        client.get_json("https://provider.example.test/data", headers={})
    with pytest.raises(ProviderResponseError, match="credential-free HTTPS"):
        client.get_json("http://provider.example.test/data", headers={})
    with pytest.raises(ProviderResponseError, match="leave its API origin"):
        require_same_origin(
            "https://provider.example.test/data",
            "https://evil.example.test/next",
        )


def test_malformed_provider_identity_fails_without_coercing_types() -> None:
    client = GitLabClient(
        "https://gitlab.example.test",
        lambda: "not-a-real-token",
        http=bounded(
            httpx.MockTransport(
                lambda _request: json_response({"id": "42", "username": "operator"})
            )
        ),
    )

    with pytest.raises(ProviderResponseError, match="positive integer"):
        client.identity()
