"""Account metadata orchestration and provider-scope policy."""

from __future__ import annotations

import secrets
from contextlib import suppress
from dataclasses import dataclass
from typing import Protocol

from ..domain.accounts import AccountMetadata, AccountProvider, ProviderIdentity
from ..infrastructure.secrets.base import SecretVault

GITHUB_REQUIRED_SCOPES = (
    "notifications",
    "read:org",
    "repo",
    "user",
    "workflow",
    "write:packages",
)
# gh currently requires this extra scope for login/refresh even though this app
# does not use gists. It is reported separately rather than misrepresented as an
# application capability.
GITHUB_CLI_MANDATORY_SCOPE = "gist"

_BLOCKED_GITHUB_SCOPES = frozenset(
    {
        "admin:gpg_key",
        "admin:org",
        "admin:org_hook",
        "admin:public_key",
        "admin:repo_hook",
        "admin:ssh_signing_key",
        "delete:packages",
        "delete_repo",
    }
)


class AccountStore(Protocol):
    def save_account(self, account: AccountMetadata) -> AccountMetadata:
        """Persist one credential-free metadata record."""

    def get_account(self, account_key: str) -> AccountMetadata | None:
        """Return one metadata record."""

    def delete_account(self, account_key: str) -> bool:
        """Delete one metadata record."""


class ScopePolicyError(ValueError):
    """A GitHub scope set is missing required access or grants unsafe access."""


@dataclass(frozen=True)
class GitHubScopeAudit:
    requested: tuple[str, ...]
    granted: tuple[str, ...]
    missing: tuple[str, ...]
    blocked: tuple[str, ...]
    mandatory_cli_extra_present: bool

    @property
    def accepted(self) -> bool:
        return not self.missing and not self.blocked

    def require_accepted(self) -> None:
        if self.blocked:
            raise ScopePolicyError(
                "GitHub authentication grants destructive or administrative scopes: "
                + ", ".join(self.blocked)
            )
        if self.missing:
            raise ScopePolicyError(
                "GitHub authentication is missing required scopes: " + ", ".join(self.missing)
            )


def audit_github_scopes(granted_scopes: tuple[str, ...]) -> GitHubScopeAudit:
    granted = tuple(sorted({scope.strip() for scope in granted_scopes if scope.strip()}))
    missing = tuple(sorted(set(GITHUB_REQUIRED_SCOPES).difference(granted)))
    blocked = tuple(sorted(scope for scope in granted if _is_blocked_github_scope(scope)))
    return GitHubScopeAudit(
        requested=GITHUB_REQUIRED_SCOPES,
        granted=granted,
        missing=missing,
        blocked=blocked,
        mandatory_cli_extra_present=GITHUB_CLI_MANDATORY_SCOPE in granted,
    )


def _is_blocked_github_scope(scope: str) -> bool:
    if scope in _BLOCKED_GITHUB_SCOPES:
        return True
    if scope.startswith(("admin:", "delete", "manage_")):
        return True
    if scope.startswith("write:") and scope != "write:packages":
        return True
    return scope in {"codespace", "codespace:secrets", "copilot", "project"}


class AccountService:
    """Coordinate metadata with either a gh profile or a secure vault reference."""

    def __init__(self, store: AccountStore, vault: SecretVault) -> None:
        self._store = store
        self._vault = vault

    def add_github(
        self,
        identity: ProviderIdentity,
        *,
        profile_id: str,
        granted_scopes: tuple[str, ...],
    ) -> AccountMetadata:
        if identity.provider is not AccountProvider.GITHUB:
            raise ValueError("GitHub account creation requires a GitHub identity")
        audit = audit_github_scopes(granted_scopes)
        audit.require_accepted()
        account = AccountMetadata.from_identity(
            identity,
            granted_scopes=audit.granted,
            gh_profile_id=profile_id,
        )
        return self._store.save_account(account)

    def add_token_account(
        self,
        identity: ProviderIdentity,
        *,
        secret: str,
    ) -> AccountMetadata:
        if identity.provider is AccountProvider.GITHUB:
            raise ValueError("GitHub credentials must use an isolated gh profile")
        credential_ref = secrets.token_urlsafe(24)
        self._vault.put(credential_ref, secret)
        try:
            return self._store.save_account(
                AccountMetadata.from_identity(identity, credential_ref=credential_ref)
            )
        except BaseException:
            with suppress(Exception):
                self._vault.delete(credential_ref)
            raise
