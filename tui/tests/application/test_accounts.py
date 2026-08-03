from __future__ import annotations

from dataclasses import replace

import pytest

from desktop_material_tui.application.accounts import (
    GITHUB_CLI_MANDATORY_SCOPE,
    GITHUB_REQUIRED_SCOPES,
    AccountService,
    ScopePolicyError,
    audit_github_scopes,
)
from desktop_material_tui.domain.accounts import (
    AccountEmail,
    AccountMetadata,
    AccountProvider,
    AccountValidationError,
    ProviderIdentity,
    account_key,
    deduplicate_accounts,
)


class MemoryStore:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.values: dict[str, AccountMetadata] = {}

    def save_account(self, account: AccountMetadata) -> AccountMetadata:
        if self.fail:
            raise RuntimeError("metadata failed")
        self.values[account.account_key] = account
        return account

    def get_account(self, key: str) -> AccountMetadata | None:
        return self.values.get(key)

    def delete_account(self, key: str) -> bool:
        return self.values.pop(key, None) is not None


class MemoryVault:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.deleted: list[str] = []

    def put(self, reference: str, secret: str) -> None:
        self.values[reference] = secret

    def get(self, reference: str) -> str | None:
        return self.values.get(reference)

    def delete(self, reference: str) -> bool:
        self.deleted.append(reference)
        return self.values.pop(reference, None) is not None


def github_identity(*, login: str = "octocat") -> ProviderIdentity:
    return ProviderIdentity(
        AccountProvider.GITHUB,
        "https://GITHUB.com:443/",
        "0001",
        login,
    )


def gitlab_identity() -> ProviderIdentity:
    return ProviderIdentity(
        AccountProvider.GITLAB,
        "https://gitlab.example.test/api/v4/",
        "42",
        "operator",
    )


def test_account_key_is_stable_across_endpoint_and_login_spelling() -> None:
    first = github_identity(login="old-login")
    second = github_identity(login="new-login")

    assert first.account_key == second.account_key
    assert first.endpoint == "https://github.com"
    assert first.provider_id == "1"
    assert first.account_key == account_key(
        AccountProvider.GITHUB,
        "https://github.com/api/v3",
        "1",
    )


def test_bitbucket_identity_requires_a_stable_uuid() -> None:
    with pytest.raises(AccountValidationError, match="UUID"):
        ProviderIdentity(
            AccountProvider.BITBUCKET,
            "https://api.bitbucket.org/2.0",
            "mutable-login",
            "operator",
        )


def test_email_and_account_deduplication_prefers_primary_and_latest_metadata() -> None:
    first = AccountEmail("User@example.test")
    primary = AccountEmail("user@EXAMPLE.test", primary=True, verified=True)
    identity = ProviderIdentity(
        AccountProvider.GITHUB,
        "https://github.com",
        "1",
        "old",
        emails=(first, primary),
    )
    original = AccountMetadata.from_identity(identity, gh_profile_id="p_profile1234567890123456")
    updated = replace(original, login="new")

    assert identity.emails == (primary,)
    assert deduplicate_accounts((original, updated)) == (updated,)


def test_scope_audit_reports_gh_mandatory_gist_without_requesting_it() -> None:
    audit = audit_github_scopes((*GITHUB_REQUIRED_SCOPES, GITHUB_CLI_MANDATORY_SCOPE))

    assert audit.accepted
    assert audit.mandatory_cli_extra_present
    assert GITHUB_CLI_MANDATORY_SCOPE not in audit.requested


@pytest.mark.parametrize(
    "scope",
    [
        "delete_repo",
        "delete:packages",
        "admin:org",
        "admin:new",
        "write:org",
        "manage_runners:org",
        "codespace:secrets",
        "project",
    ],
)
def test_scope_audit_blocks_destructive_and_administrative_scopes(scope: str) -> None:
    audit = audit_github_scopes((*GITHUB_REQUIRED_SCOPES, scope))

    assert not audit.accepted
    with pytest.raises(ScopePolicyError, match="destructive or administrative"):
        audit.require_accepted()


def test_account_service_stores_only_vault_reference_for_token_provider() -> None:
    store = MemoryStore()
    vault = MemoryVault()

    account = AccountService(store, vault).add_token_account(
        gitlab_identity(),
        secret="not-a-real-token",  # noqa: S106 - inert test credential.
    )

    assert account.credential_ref in vault.values
    assert account.gh_profile_id is None
    assert "not-a-real-token" not in repr(account)
    assert store.values[account.account_key] == account


def test_account_service_rolls_back_vault_write_when_metadata_fails() -> None:
    vault = MemoryVault()

    with pytest.raises(RuntimeError, match="metadata failed"):
        AccountService(MemoryStore(fail=True), vault).add_token_account(
            gitlab_identity(),
            secret="not-a-real-token",  # noqa: S106 - inert test credential.
        )

    assert vault.values == {}
    assert len(vault.deleted) == 1


def test_github_account_requires_complete_safe_scopes() -> None:
    service = AccountService(MemoryStore(), MemoryVault())

    with pytest.raises(ScopePolicyError, match="missing required"):
        service.add_github(
            github_identity(),
            profile_id="p_profile1234567890123456",
            granted_scopes=("repo",),
        )
