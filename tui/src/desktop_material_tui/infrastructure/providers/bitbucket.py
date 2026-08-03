"""Strict Bitbucket Cloud identity and repository client."""

from __future__ import annotations

import base64
from collections.abc import Callable
from urllib.parse import quote

from ...domain.accounts import (
    AccountProvider,
    ProviderIdentity,
    ProviderRepository,
    normalize_account_endpoint,
)
from .gitlab import _limit, _object, _optional_text, _text
from .http import BoundedHttpClient, ProviderAuthenticationError, ProviderResponseError


class BitbucketClient:
    def __init__(
        self,
        login: str,
        secret_supplier: Callable[[], str | None],
        *,
        endpoint: str = "https://api.bitbucket.org/2.0",
        http: BoundedHttpClient | None = None,
    ) -> None:
        self._login = _text(login, "Bitbucket login", 255)
        self._secret_supplier = secret_supplier
        self._api_root = normalize_account_endpoint(endpoint)
        if not self._api_root.startswith("https://"):
            raise ValueError("Bitbucket credentials require an HTTPS endpoint")
        self._http = http or BoundedHttpClient()

    def identity(self) -> ProviderIdentity:
        value = self._http.get_json(
            f"{self._api_root}/user",
            headers=self._headers(),
        )
        item = _object(value, "Bitbucket user")
        provider_id = _text(item.get("uuid"), "Bitbucket user UUID", 64)
        login = _optional_text(item.get("nickname"), "Bitbucket nickname", 255) or self._login
        return ProviderIdentity(
            provider=AccountProvider.BITBUCKET,
            endpoint=self._api_root,
            provider_id=provider_id,
            login=login,
            display_name=_optional_text(
                item.get("display_name"),
                "Bitbucket display name",
                512,
            ),
            avatar_url=_link(item, "avatar", required=False),
        )

    def list_repositories(
        self,
        *,
        workspace: str | None = None,
        limit: int = 100,
    ) -> tuple[ProviderRepository, ...]:
        bounded = _limit(limit)
        owner = self._login if workspace is None else _text(workspace, "Bitbucket workspace", 255)
        value = self._http.get_json(
            f"{self._api_root}/repositories/{quote(owner, safe='')}",
            headers=self._headers(),
            params={"role": "member", "pagelen": bounded},
        )
        root = _object(value, "Bitbucket repositories")
        raw_values = root.get("values")
        if not isinstance(raw_values, list):
            raise ProviderResponseError("Bitbucket repositories response omitted its values array.")
        repositories: list[ProviderRepository] = []
        for raw in raw_values[:bounded]:
            item = _object(raw, "Bitbucket repository")
            full_name = _text(item.get("full_name"), "Bitbucket repository name", 512)
            if "/" not in full_name:
                raise ProviderResponseError("Bitbucket repository name omitted its owner.")
            repository_owner, name = full_name.split("/", 1)
            repositories.append(
                ProviderRepository(
                    provider_id=_text(
                        item.get("uuid") or item.get("slug"),
                        "Bitbucket repository id",
                        255,
                    ),
                    owner=repository_owner,
                    name=name,
                    web_url=_link(item, "html", required=True) or "",
                    clone_url=_clone_link(item),
                    private=_boolean(item.get("is_private"), "Bitbucket private state"),
                )
            )
        return tuple(repositories)

    def _headers(self) -> dict[str, str]:
        secret = self._secret_supplier()
        if not isinstance(secret, str) or not secret or len(secret.encode("utf-8")) > 65_536:
            raise ProviderAuthenticationError(401)
        encoded = base64.b64encode(f"{self._login}:{secret}".encode()).decode("ascii")
        return {"Accept": "application/json", "Authorization": f"Basic {encoded}"}


def _link(item: dict[str, object], name: str, *, required: bool) -> str | None:
    links = item.get("links")
    if not isinstance(links, dict):
        if required:
            raise ProviderResponseError("Bitbucket response omitted its links object.")
        return None
    link = links.get(name)
    if not isinstance(link, dict):
        if required:
            raise ProviderResponseError(f"Bitbucket response omitted its {name} link.")
        return None
    return _optional_text(link.get("href"), f"Bitbucket {name} link", 2048)


def _clone_link(item: dict[str, object]) -> str:
    links = item.get("links")
    if not isinstance(links, dict) or not isinstance(links.get("clone"), list):
        raise ProviderResponseError("Bitbucket response omitted its clone links.")
    for candidate in links["clone"]:
        if not isinstance(candidate, dict) or candidate.get("name") != "https":
            continue
        return _text(candidate.get("href"), "Bitbucket HTTPS clone link", 2048)
    raise ProviderResponseError("Bitbucket response omitted its HTTPS clone link.")


def _boolean(value: object, label: str) -> bool:
    if not isinstance(value, bool):
        raise ProviderResponseError(f"{label} must be a boolean.")
    return value
