"""Fail-closed operating-system keyring credential vault."""

from __future__ import annotations

import re
from typing import Any

import keyring

from .base import SecretVaultError, SecretVaultUnavailableError

_REFERENCE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
_SECURE_BACKEND_MODULES = (
    "keyring.backends.secretservice",
    "keyring.backends.windows",
    "keyring.backends.macos",
    "keyring.backends.kwallet",
    "keyring.backends.libsecret",
)


class KeyringSecretVault:
    """Use keyring only when its backend is demonstrably secure."""

    def __init__(
        self,
        *,
        service_name: str = "desktop-material-tui",
        backend: Any | None = None,
    ) -> None:
        if not service_name or len(service_name) > 128 or "\x00" in service_name:
            raise ValueError("service_name must be bounded text")
        self._backend = keyring.get_keyring() if backend is None else backend
        self._service_name = service_name
        if not _is_secure_backend(self._backend):
            raise SecretVaultUnavailableError(
                "A secure operating-system keyring is required; plaintext storage is disabled."
            )

    def put(self, reference: str, secret: str) -> None:
        validated = _reference(reference)
        if not isinstance(secret, str) or not secret or len(secret.encode("utf-8")) > 65_536:
            raise SecretVaultError("Credential value is empty or exceeds the secure size limit.")
        try:
            self._backend.set_password(self._service_name, validated, secret)
        except Exception as error:
            raise SecretVaultError(
                "The operating-system keyring rejected the credential."
            ) from error

    def get(self, reference: str) -> str | None:
        validated = _reference(reference)
        try:
            value = self._backend.get_password(self._service_name, validated)
        except Exception as error:
            raise SecretVaultError(
                "The operating-system keyring could not read the credential."
            ) from error
        if value is not None and not isinstance(value, str):
            raise SecretVaultError("The operating-system keyring returned an invalid credential.")
        return value

    def delete(self, reference: str) -> bool:
        validated = _reference(reference)
        if self.get(validated) is None:
            return False
        try:
            self._backend.delete_password(self._service_name, validated)
        except Exception as error:
            raise SecretVaultError(
                "The operating-system keyring could not delete the credential."
            ) from error
        return True


def _reference(value: str) -> str:
    if not isinstance(value, str) or _REFERENCE.fullmatch(value) is None:
        raise SecretVaultError("Credential reference is invalid.")
    return value


def _is_secure_backend(backend: Any) -> bool:
    explicit = getattr(backend, "secure_backend", None)
    if explicit is not None:
        return explicit is True
    module_name = type(backend).__module__.casefold()
    class_name = type(backend).__name__.casefold()
    if any(marker in module_name or marker in class_name for marker in ("fail", "null", "plain")):
        return False
    if module_name.startswith(_SECURE_BACKEND_MODULES):
        return True
    if module_name.startswith("keyring.backends.chainer"):
        children = tuple(getattr(backend, "backends", ()))
        return bool(children) and all(_is_secure_backend(child) for child in children)
    return False
