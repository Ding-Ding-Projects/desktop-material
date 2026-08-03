"""Credential-free account identities shared by provider integrations."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from ipaddress import IPv6Address
from urllib.parse import quote, unquote, urlsplit, urlunsplit

MAX_ACCOUNTS = 100
MAX_ACCOUNT_EMAILS = 100
MAX_ACCOUNT_METADATA_BYTES = 1_048_576

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_BITBUCKET_UUID = re.compile(
    r"^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$"
)
_SCOPE = re.compile(r"^[A-Za-z0-9:_-]{1,128}$")


class AccountValidationError(ValueError):
    """Account metadata failed a bounded, credential-free validation rule."""


class AccountProvider(str, Enum):
    GITHUB = "github"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"


@dataclass(frozen=True)
class AccountEmail:
    address: str
    primary: bool = False
    verified: bool = False
    visibility: str | None = None

    def __post_init__(self) -> None:
        address = _bounded_text(self.address, "email address", 320)
        if "@" not in address or address.startswith("@") or address.endswith("@"):
            raise AccountValidationError("email address must contain a local and domain part")
        visibility = _optional_text(self.visibility, "email visibility", 32)
        object.__setattr__(self, "address", address)
        object.__setattr__(self, "visibility", visibility)

    def as_dict(self) -> dict[str, object]:
        return {
            "address": self.address,
            "primary": self.primary,
            "verified": self.verified,
            "visibility": self.visibility,
        }


@dataclass(frozen=True)
class ProviderIdentity:
    """Strict provider response converted into credential-free identity data."""

    provider: AccountProvider
    endpoint: str
    provider_id: str
    login: str
    display_name: str | None = None
    avatar_url: str | None = None
    emails: tuple[AccountEmail, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "endpoint",
            normalize_provider_endpoint(self.provider, self.endpoint),
        )
        object.__setattr__(
            self,
            "provider_id",
            normalize_provider_id(self.provider, self.provider_id),
        )
        object.__setattr__(self, "login", _bounded_text(self.login, "account login", 255))
        object.__setattr__(
            self,
            "display_name",
            _optional_text(self.display_name, "display name", 512),
        )
        object.__setattr__(self, "avatar_url", _optional_url(self.avatar_url, "avatar URL"))
        object.__setattr__(self, "emails", deduplicate_emails(self.emails))

    @property
    def account_key(self) -> str:
        return account_key(self.provider, self.endpoint, self.provider_id)


@dataclass(frozen=True)
class AccountMetadata:
    """Persistable account data; tokens and passwords have no field here."""

    provider: AccountProvider
    endpoint: str
    provider_id: str
    login: str
    display_name: str | None = None
    avatar_url: str | None = None
    emails: tuple[AccountEmail, ...] = ()
    granted_scopes: tuple[str, ...] = ()
    credential_ref: str | None = None
    gh_profile_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        identity = ProviderIdentity(
            provider=self.provider,
            endpoint=self.endpoint,
            provider_id=self.provider_id,
            login=self.login,
            display_name=self.display_name,
            avatar_url=self.avatar_url,
            emails=self.emails,
        )
        scopes = tuple(sorted({_scope(scope) for scope in self.granted_scopes}))
        if len(scopes) > 100:
            raise AccountValidationError("account cannot retain more than 100 scopes")
        credential_ref = _optional_identifier(
            self.credential_ref,
            "credential reference",
            128,
        )
        profile_id = _optional_identifier(self.gh_profile_id, "GitHub profile id", 128)
        if self.provider is AccountProvider.GITHUB:
            if credential_ref is not None:
                raise AccountValidationError("GitHub metadata cannot contain a vault reference")
        elif profile_id is not None:
            raise AccountValidationError("non-GitHub metadata cannot contain a gh profile id")
        object.__setattr__(self, "endpoint", identity.endpoint)
        object.__setattr__(self, "provider_id", identity.provider_id)
        object.__setattr__(self, "login", identity.login)
        object.__setattr__(self, "display_name", identity.display_name)
        object.__setattr__(self, "avatar_url", identity.avatar_url)
        object.__setattr__(self, "emails", identity.emails)
        object.__setattr__(self, "granted_scopes", scopes)
        object.__setattr__(self, "credential_ref", credential_ref)
        object.__setattr__(self, "gh_profile_id", profile_id)
        object.__setattr__(self, "created_at", _utc(self.created_at))
        object.__setattr__(self, "updated_at", _utc(self.updated_at))

    @classmethod
    def from_identity(
        cls,
        identity: ProviderIdentity,
        *,
        granted_scopes: tuple[str, ...] = (),
        credential_ref: str | None = None,
        gh_profile_id: str | None = None,
    ) -> AccountMetadata:
        return cls(
            provider=identity.provider,
            endpoint=identity.endpoint,
            provider_id=identity.provider_id,
            login=identity.login,
            display_name=identity.display_name,
            avatar_url=identity.avatar_url,
            emails=identity.emails,
            granted_scopes=granted_scopes,
            credential_ref=credential_ref,
            gh_profile_id=gh_profile_id,
        )

    @property
    def account_key(self) -> str:
        return account_key(self.provider, self.endpoint, self.provider_id)

    def size_payload(self) -> dict[str, object]:
        return {
            "account_key": self.account_key,
            "provider": self.provider.value,
            "endpoint": self.endpoint,
            "provider_id": self.provider_id,
            "login": self.login,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "emails": [email.as_dict() for email in self.emails],
            "granted_scopes": list(self.granted_scopes),
            "credential_ref": self.credential_ref,
            "gh_profile_id": self.gh_profile_id,
        }


@dataclass(frozen=True)
class ProviderRepository:
    provider_id: str
    owner: str
    name: str
    web_url: str
    clone_url: str
    private: bool

    def __post_init__(self) -> None:
        object.__setattr__(self, "provider_id", _bounded_text(self.provider_id, "id", 512))
        object.__setattr__(self, "owner", _bounded_text(self.owner, "owner", 255))
        object.__setattr__(self, "name", _bounded_text(self.name, "name", 255))
        object.__setattr__(self, "web_url", _required_url(self.web_url, "web URL"))
        object.__setattr__(self, "clone_url", _required_url(self.clone_url, "clone URL"))


def normalize_account_endpoint(value: str) -> str:
    raw = _bounded_text(value, "account endpoint", 2048)
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError as error:
        raise AccountValidationError("account endpoint is not a valid URL") from error
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or parsed.hostname is None:
        raise AccountValidationError("account endpoint must use HTTP or HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise AccountValidationError("account endpoint cannot contain credentials")
    if parsed.query or parsed.fragment:
        raise AccountValidationError("account endpoint cannot contain a query or fragment")
    hostname = parsed.hostname.rstrip(".").lower()
    if not hostname or _CONTROL.search(hostname):
        raise AccountValidationError("account endpoint hostname is invalid")
    if ":" in hostname:
        try:
            hostname = IPv6Address(hostname).compressed
        except ValueError as error:
            raise AccountValidationError("account endpoint hostname is invalid") from error
        rendered_hostname = f"[{hostname}]"
    else:
        try:
            rendered_hostname = hostname.encode("idna").decode("ascii")
        except UnicodeError as error:
            raise AccountValidationError("account endpoint hostname is invalid") from error
    default_port = (scheme == "https" and port == 443) or (scheme == "http" and port == 80)
    netloc = rendered_hostname if port is None or default_port else f"{rendered_hostname}:{port}"
    decoded_parts = [unquote(part) for part in parsed.path.split("/") if part]
    if any(part in {".", ".."} or _CONTROL.search(part) for part in decoded_parts):
        raise AccountValidationError("account endpoint path is invalid")
    path = "/" + "/".join(
        quote(part, safe=":@!$&'()*+,;=-._~") for part in decoded_parts
    )
    if path == "/":
        path = ""
    return urlunsplit((scheme, netloc, path, "", ""))


def normalize_provider_id(provider: AccountProvider, value: str) -> str:
    candidate = _bounded_text(str(value), "provider id", 512)
    if provider in {AccountProvider.GITHUB, AccountProvider.GITLAB}:
        if not candidate.isascii() or not candidate.isdecimal() or int(candidate) < 1:
            raise AccountValidationError(f"{provider.value} provider id must be a positive integer")
        return str(int(candidate))
    if not _BITBUCKET_UUID.fullmatch(candidate):
        raise AccountValidationError("bitbucket provider id must be a UUID")
    return candidate.strip("{}").lower()


def normalize_provider_endpoint(provider: AccountProvider, value: str) -> str:
    normalized = normalize_account_endpoint(value)
    suffix = "/api/v3" if provider is AccountProvider.GITHUB else "/api/v4"
    if provider in {AccountProvider.GITHUB, AccountProvider.GITLAB} and normalized.endswith(suffix):
        normalized = normalized[: -len(suffix)]
    return normalized


def account_key(provider: AccountProvider, endpoint: str, provider_id: str) -> str:
    normalized_endpoint = normalize_provider_endpoint(provider, endpoint)
    normalized_id = normalize_provider_id(provider, provider_id)
    return (
        f"{provider.value}:{quote(normalized_endpoint, safe='')}"
        f"#{quote(normalized_id, safe='')}"
    )


def deduplicate_emails(values: tuple[AccountEmail, ...]) -> tuple[AccountEmail, ...]:
    deduplicated: dict[str, AccountEmail] = {}
    for value in values:
        if not isinstance(value, AccountEmail):
            raise AccountValidationError("account emails must be AccountEmail values")
        key = value.address.casefold()
        previous = deduplicated.get(key)
        if previous is None or (value.primary and not previous.primary):
            deduplicated[key] = value
    if len(deduplicated) > MAX_ACCOUNT_EMAILS:
        raise AccountValidationError(f"account cannot retain more than {MAX_ACCOUNT_EMAILS} emails")
    return tuple(deduplicated.values())


def deduplicate_accounts(values: tuple[AccountMetadata, ...]) -> tuple[AccountMetadata, ...]:
    deduplicated: dict[str, AccountMetadata] = {}
    for value in values:
        if not isinstance(value, AccountMetadata):
            raise AccountValidationError("account metadata must be AccountMetadata values")
        deduplicated[value.account_key] = value
    if len(deduplicated) > MAX_ACCOUNTS:
        raise AccountValidationError(f"cannot retain more than {MAX_ACCOUNTS} accounts")
    encoded = json.dumps(
        [value.size_payload() for value in deduplicated.values()],
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    if len(encoded) > MAX_ACCOUNT_METADATA_BYTES:
        raise AccountValidationError(
            f"account metadata exceeds {MAX_ACCOUNT_METADATA_BYTES} UTF-8 bytes"
        )
    return tuple(deduplicated.values())


def _bounded_text(value: str, label: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise AccountValidationError(f"{label} must be text")
    candidate = value.strip()
    if not candidate or len(candidate) > maximum or _CONTROL.search(candidate):
        raise AccountValidationError(f"{label} must contain 1 to {maximum} safe characters")
    return candidate


def _optional_text(value: str | None, label: str, maximum: int) -> str | None:
    return None if value is None else _bounded_text(value, label, maximum)


def _optional_identifier(value: str | None, label: str, maximum: int) -> str | None:
    if value is None:
        return None
    candidate = _bounded_text(value, label, maximum)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", candidate):
        raise AccountValidationError(f"{label} contains unsupported characters")
    return candidate


def _scope(value: str) -> str:
    candidate = value.strip()
    if not _SCOPE.fullmatch(candidate):
        raise AccountValidationError("account scope is invalid")
    return candidate


def _optional_url(value: str | None, label: str) -> str | None:
    return None if value is None else _required_url(value, label)


def _required_url(value: str, label: str) -> str:
    normalized = normalize_account_endpoint(value)
    if not normalized.startswith("https://"):
        raise AccountValidationError(f"{label} must use HTTPS")
    return normalized


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
