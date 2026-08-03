from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path

import pytest

from desktop_material_tui.application.accounts import GITHUB_REQUIRED_SCOPES
from desktop_material_tui.infrastructure.github.account_profiles import (
    GitHubAccountProfileManager,
    GitHubProfileError,
    InsecureGitHubCredentialStorageError,
)
from desktop_material_tui.infrastructure.github.transport import GhBinaryProcessResult


class Interactive:
    def __init__(self, *, hosts_yaml: str | None = None, return_code: int = 0) -> None:
        self.hosts_yaml = hosts_yaml
        self.return_code = return_code
        self.calls: list[tuple[tuple[str, ...], dict[str, str], float]] = []

    def run(
        self,
        argv: Sequence[str],
        *,
        environment: Mapping[str, str],
        timeout_seconds: float,
    ) -> int:
        copied = dict(environment)
        self.calls.append((tuple(argv), copied, timeout_seconds))
        if self.hosts_yaml is not None:
            Path(copied["GH_CONFIG_DIR"]).joinpath("hosts.yml").write_text(
                self.hosts_yaml,
                encoding="utf-8",
            )
        return self.return_code


class BinaryTransport:
    def __init__(self, payloads: list[object]) -> None:
        self.payloads = payloads
        self.calls: list[tuple[str, ...]] = []

    def run_binary(
        self,
        argv: Sequence[str],
        *,
        timeout_seconds: float,
        maximum_bytes: int,
    ) -> GhBinaryProcessResult:
        del timeout_seconds, maximum_bytes
        call = tuple(argv)
        self.calls.append(call)
        payload = json.dumps(self.payloads.pop(0)).encode()
        return GhBinaryProcessResult(call, 0, payload, "")

    def run(self, argv, *, timeout_seconds, stdin_text=None):  # type: ignore[no-untyped-def]
        raise AssertionError("text transport must not be used")


def status(*extra_scopes: str, source: str = "keyring") -> dict[str, object]:
    return {
        "hosts": {
            "github.com": [
                {
                    "active": True,
                    "host": "github.com",
                    "login": "octocat",
                    "scopes": [*GITHUB_REQUIRED_SCOPES, "gist", *extra_scopes],
                    "state": "success",
                    "tokenSource": source,
                }
            ]
        }
    }


def user() -> dict[str, object]:
    return {
        "id": 583231,
        "login": "octocat",
        "name": "The Octocat",
        "avatar_url": "https://avatars.githubusercontent.com/u/583231",
        "email": "octocat@example.test",
    }


def test_web_login_uses_random_isolated_profile_and_exact_interactive_argv(
    tmp_path: Path,
) -> None:
    interactive = Interactive()
    binary = BinaryTransport([status(), user()])
    environments: list[dict[str, str]] = []

    def factory(environment: Mapping[str, str]) -> BinaryTransport:
        environments.append(dict(environment))
        return binary

    manager = GitHubAccountProfileManager(
        tmp_path / "profiles",
        interactive_transport=interactive,
        headless_transport_factory=factory,
    )

    login = manager.sign_in_with_browser()

    argv, environment, _timeout = interactive.calls[0]
    assert argv == (
        "gh",
        "auth",
        "login",
        "--web",
        "--hostname",
        "github.com",
        "--git-protocol",
        "https",
        "--skip-ssh-key",
        "--scopes",
        ",".join(GITHUB_REQUIRED_SCOPES),
    )
    assert set(environment) == {"GH_CONFIG_DIR"}
    assert environment == environments[0]
    assert login.identity.provider_id == "583231"
    assert login.identity.account_key.endswith("#583231")
    assert login.identity.login not in environment["GH_CONFIG_DIR"]
    assert login.profile_id in environment["GH_CONFIG_DIR"]
    assert "--show-token" not in argv
    assert binary.calls == [
        (
            "gh",
            "auth",
            "status",
            "--hostname",
            "github.com",
            "--active",
            "--json",
            "hosts",
        ),
        ("gh", "api", "--hostname", "github.com", "user"),
    ]


def test_plaintext_gh_profile_is_rejected_and_removed_without_echoing_value(
    tmp_path: Path,
) -> None:
    credential_value = "not-a-real-token"
    interactive = Interactive(hosts_yaml=f"github.com:\n  oauth_token: {credential_value}\n")
    manager = GitHubAccountProfileManager(
        tmp_path / "profiles",
        interactive_transport=interactive,
        headless_transport_factory=lambda _environment: BinaryTransport([]),
    )

    with pytest.raises(InsecureGitHubCredentialStorageError) as caught:
        manager.sign_in_with_browser()

    assert credential_value not in str(caught.value)
    assert list((tmp_path / "profiles").iterdir()) == []


@pytest.mark.parametrize("unsafe_scope", ["delete_repo", "admin:org"])
def test_unsafe_granted_scope_is_rejected_and_profile_removed(
    tmp_path: Path,
    unsafe_scope: str,
) -> None:
    binary = BinaryTransport([status(unsafe_scope), user()])
    manager = GitHubAccountProfileManager(
        tmp_path / "profiles",
        interactive_transport=Interactive(),
        headless_transport_factory=lambda _environment: binary,
    )

    with pytest.raises(ValueError, match="destructive or administrative"):
        manager.sign_in_with_browser()

    assert list((tmp_path / "profiles").iterdir()) == []
    assert len(binary.calls) == 1


def test_non_keyring_token_source_fails_closed(tmp_path: Path) -> None:
    binary = BinaryTransport([status(source="oauth_token")])
    manager = GitHubAccountProfileManager(
        tmp_path / "profiles",
        interactive_transport=Interactive(),
        headless_transport_factory=lambda _environment: binary,
    )

    with pytest.raises(InsecureGitHubCredentialStorageError, match="secure keyring"):
        manager.sign_in_with_browser()

    assert list((tmp_path / "profiles").iterdir()) == []


def test_profile_reference_rejects_path_traversal(tmp_path: Path) -> None:
    manager = GitHubAccountProfileManager(tmp_path / "profiles")

    with pytest.raises(GitHubProfileError, match="profile id is invalid"):
        manager.environment_for("../../outside")
