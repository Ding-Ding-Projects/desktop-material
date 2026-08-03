"""Credential-vault port and display-safe errors."""

from __future__ import annotations

from typing import Protocol


class SecretVaultError(RuntimeError):
    """A secret operation failed without exposing the secret value."""


class SecretVaultUnavailableError(SecretVaultError):
    """No backend known to provide encrypted operating-system storage exists."""


class SecretVault(Protocol):
    def put(self, reference: str, secret: str) -> None:
        """Store a secret under an opaque, non-secret reference."""

    def get(self, reference: str) -> str | None:
        """Resolve a secret in memory, or return ``None`` when absent."""

    def delete(self, reference: str) -> bool:
        """Delete a secret, returning whether a value existed."""
