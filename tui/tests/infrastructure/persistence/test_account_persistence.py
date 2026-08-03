"""Credential-free account persistence tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from desktop_material_tui.domain.accounts import (
    MAX_ACCOUNTS,
    AccountEmail,
    AccountMetadata,
    AccountProvider,
    ProviderIdentity,
)
from desktop_material_tui.infrastructure.persistence import PersistenceError, SQLiteStore


def account(provider_id: int, *, login: str | None = None) -> AccountMetadata:
    return AccountMetadata.from_identity(
        ProviderIdentity(
            AccountProvider.GITHUB,
            "https://github.com",
            str(provider_id),
            login or f"user-{provider_id}",
            emails=(AccountEmail(f"user-{provider_id}@example.test", primary=True),),
        ),
        granted_scopes=("gist", "repo"),
        gh_profile_id=f"p_profile_{provider_id:024d}",
    )


def large_account(provider_id: int) -> AccountMetadata:
    identity = ProviderIdentity(
        AccountProvider.GITHUB,
        "https://github.com",
        str(provider_id),
        f"user-{provider_id}",
        display_name="Display " + "x" * 500,
        emails=tuple(
            AccountEmail(f"{provider_id}-{index}-{'x' * 270}@example.test")
            for index in range(100)
        ),
    )
    return AccountMetadata.from_identity(
        identity,
        gh_profile_id=f"p_profile_{provider_id:024d}",
    )


def test_accounts_round_trip_and_batch_deduplicates_by_stable_key(tmp_path: Path) -> None:
    with SQLiteStore(tmp_path / "state.sqlite3") as database:
        original = account(1, login="before")
        updated = account(1, login="after")

        saved = database.save_accounts((original, updated))

        assert len(saved) == 1
        assert saved[0].login == "after"
        assert database.get_account(original.account_key) == saved[0]
        assert database.list_accounts() == saved
        assert database.delete_account(original.account_key)


def test_account_schema_has_no_credential_value_column(tmp_path: Path) -> None:
    path = tmp_path / "state.sqlite3"
    with SQLiteStore(path) as database:
        database.save_account(account(1))
    connection = sqlite3.connect(path)
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(accounts)")}
    finally:
        connection.close()

    assert "token" not in columns
    assert "password" not in columns
    assert "secret" not in columns
    assert {"credential_ref", "gh_profile_id"}.issubset(columns)


def test_account_count_is_bounded_without_silently_dropping_rows(tmp_path: Path) -> None:
    with SQLiteStore(tmp_path / "state.sqlite3") as database:
        database.save_accounts(tuple(account(index) for index in range(1, MAX_ACCOUNTS + 1)))

        with pytest.raises(PersistenceError, match="more than 100"):
            database.save_account(account(MAX_ACCOUNTS + 1))

        assert len(database.list_accounts()) == MAX_ACCOUNTS


def test_total_metadata_size_is_bounded_across_separate_writes(tmp_path: Path) -> None:
    with SQLiteStore(tmp_path / "state.sqlite3") as database:
        database.save_accounts(tuple(large_account(index) for index in range(1, 21)))

        with pytest.raises(PersistenceError, match="metadata exceeds"):
            database.save_accounts(tuple(large_account(index) for index in range(21, 41)))

        assert len(database.list_accounts()) == 20


def test_corrupt_stored_account_key_fails_closed(tmp_path: Path) -> None:
    path = tmp_path / "state.sqlite3"
    with SQLiteStore(path) as database:
        saved = database.save_account(account(1))
        database._connection.execute(
            "UPDATE accounts SET account_key = ? WHERE account_key = ?",
            ("github:corrupt#1", saved.account_key),
        )

        with pytest.raises(PersistenceError, match="does not match"):
            database.list_accounts()
