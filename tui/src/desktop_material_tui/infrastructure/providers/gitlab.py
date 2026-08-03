"""Strict GitLab identity and repository client."""

from __future__ import annotations

from collections.abc import Callable

from ...domain.accounts import (
    AccountEmail,
    AccountProvider,
    ProviderIdentity,
    ProviderRepository,
    normalize_account_endpoint,
)
from .http import BoundedHttpClient, ProviderAuthenticationError, ProviderResponseError


class GitLabClient:
    def __init__(
        self,
        endpoint: str,
        secret_supplier: Callable[[], str | None],
        *,
        http: BoundedHttpClient | None = None,
    ) -> None:
        normalized = normalize_account_endpoint(endpoint)
        if not normalized.startswith("https://"):
            raise ValueError("GitLab credentials require an HTTPS endpoint")
        self._api_root = (
            normalized if normalized.endswith("/api/v4") else f"{normalized}/api/v4"
        )
        self._secret_supplier = secret_supplier
        self._http = http or BoundedHttpClient()

    def identity(self) -> ProviderIdentity:
        value = self._http.get_json(
            f"{self._api_root}/user",
            headers=self._headers(),
        )
        item = _object(value, "GitLab user")
        provider_id = _positive_int(item.get("id"), "GitLab user id")
        login = _text(item.get("username"), "GitLab username", 255)
        name = _optional_text(item.get("name"), "GitLab display name", 512)
        avatar = _optional_text(item.get("avatar_url"), "GitLab avatar URL", 2048)
        emails: list[AccountEmail] = []
        for key in ("email", "public_email"):
            address = _optional_text(item.get(key), f"GitLab {key}", 320)
            if address:
                emails.append(AccountEmail(address, primary=key == "email"))
        return ProviderIdentity(
            provider=AccountProvider.GITLAB,
            endpoint=self._api_root,
            provider_id=str(provider_id),
            login=login,
            display_name=name,
            avatar_url=avatar,
            emails=tuple(emails),
        )

    def list_repositories(self, *, limit: int = 100) -> tuple[ProviderRepository, ...]:
        bounded = _limit(limit)
        value = self._http.get_json(
            f"{self._api_root}/projects",
            headers=self._headers(),
            params={"membership": "true", "simple": "true", "per_page": bounded, "page": 1},
        )
        if not isinstance(value, list):
            raise ProviderResponseError("GitLab projects response must be an array.")
        repositories: list[ProviderRepository] = []
        for raw in value[:bounded]:
            item = _object(raw, "GitLab project")
            path_with_namespace = _text(
                item.get("path_with_namespace"),
                "GitLab project path",
                512,
            )
            if "/" not in path_with_namespace:
                raise ProviderResponseError("GitLab project path omitted its owner.")
            owner, name = path_with_namespace.rsplit("/", 1)
            repositories.append(
                ProviderRepository(
                    provider_id=str(_positive_int(item.get("id"), "GitLab project id")),
                    owner=owner,
                    name=name,
                    web_url=_text(item.get("web_url"), "GitLab project URL", 2048),
                    clone_url=_text(
                        item.get("http_url_to_repo"),
                        "GitLab clone URL",
                        2048,
                    ),
                    private=_text(item.get("visibility"), "GitLab visibility", 32)
                    != "public",
                )
            )
        return tuple(repositories)

    def _headers(self) -> dict[str, str]:
        secret = self._secret_supplier()
        if not isinstance(secret, str) or not secret or len(secret.encode("utf-8")) > 65_536:
            raise ProviderAuthenticationError(401)
        return {"Accept": "application/json", "PRIVATE-TOKEN": secret}


def _object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ProviderResponseError(f"{label} response must be an object.")
    return value


def _text(value: object, label: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ProviderResponseError(f"{label} must be text.")
    candidate = value.strip()
    if not candidate or len(candidate) > maximum or any(ord(char) < 32 for char in candidate):
        raise ProviderResponseError(f"{label} is invalid.")
    return candidate


def _optional_text(value: object, label: str, maximum: int) -> str | None:
    return None if value is None or value == "" else _text(value, label, maximum)


def _positive_int(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise ProviderResponseError(f"{label} must be a positive integer.")
    return value


def _limit(value: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 100:
        raise ValueError("provider repository limit must be between 1 and 100")
    return value
