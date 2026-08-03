"""Secure credential-vault adapters."""

from .base import SecretVault, SecretVaultError, SecretVaultUnavailableError
from .keyring_vault import KeyringSecretVault

__all__ = [
    "KeyringSecretVault",
    "SecretVault",
    "SecretVaultError",
    "SecretVaultUnavailableError",
]
