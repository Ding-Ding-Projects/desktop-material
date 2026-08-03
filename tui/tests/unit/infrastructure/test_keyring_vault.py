from __future__ import annotations

import pytest

from desktop_material_tui.infrastructure.secrets import (
    KeyringSecretVault,
    SecretVaultError,
    SecretVaultUnavailableError,
)


class SecureBackend:
    secure_backend = True

    def __init__(self) -> None:
        self.values: dict[tuple[str, str], str] = {}

    def set_password(self, service: str, username: str, password: str) -> None:
        self.values[(service, username)] = password

    def get_password(self, service: str, username: str) -> str | None:
        return self.values.get((service, username))

    def delete_password(self, service: str, username: str) -> None:
        del self.values[(service, username)]


class InsecureBackend(SecureBackend):
    secure_backend = False


def test_vault_fails_closed_for_unknown_or_insecure_backend() -> None:
    with pytest.raises(SecretVaultUnavailableError, match="plaintext storage is disabled"):
        KeyringSecretVault(backend=InsecureBackend())


def test_secure_backend_round_trip_uses_only_opaque_reference() -> None:
    backend = SecureBackend()
    vault = KeyringSecretVault(backend=backend)
    reference = "opaque_reference_1234567890"

    vault.put(reference, "not-a-real-token")

    assert vault.get(reference) == "not-a-real-token"
    assert list(backend.values) == [("desktop-material-tui", reference)]
    assert vault.delete(reference)
    assert vault.get(reference) is None


def test_vault_errors_never_echo_secret_values() -> None:
    vault = KeyringSecretVault(backend=SecureBackend())
    credential_value = "not-a-real-token"

    with pytest.raises(SecretVaultError) as caught:
        vault.put("bad", credential_value)

    assert credential_value not in str(caught.value)
