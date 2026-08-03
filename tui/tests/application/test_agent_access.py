"""Agent command validation, exact bindings, and visible mutation review."""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from desktop_material_tui.application.agent_access import (
    AgentAccessError,
    AgentCommandDefinition,
    AgentCommandRegistry,
    BoundAPIFunction,
    BoundAPIFunctionCatalog,
    MutationReviewStore,
    RepositoryBinding,
    build_repository_agent_registry,
    sanitize_agent_output,
    validate_agent_arguments,
)
from desktop_material_tui.application.automation import AutomationSettingsStore
from desktop_material_tui.infrastructure.git.runner import SubprocessGitRunner


def _schema(
    properties: dict[str, object] | None = None, required: tuple[str, ...] = ()
) -> dict[str, object]:
    return {
        "type": "object",
        "properties": properties or {},
        "required": list(required),
        "additionalProperties": False,
    }


def _read_definition(name: str = "read-value") -> AgentCommandDefinition:
    return AgentCommandDefinition(
        name,
        "Read one deterministic value.",
        _schema({"value": {"type": "string", "maxLength": 20}}),
        lambda arguments: {"value": arguments.get("value", "default")},
    )


def _init_repository(tmp_path: Path) -> tuple[Path, SubprocessGitRunner]:
    repo = tmp_path / "repo"
    repo.mkdir()
    runner = SubprocessGitRunner(default_timeout=30)
    runner.run(("init",), cwd=repo)
    runner.run(("config", "user.name", "Agent Test"), cwd=repo)
    runner.run(("config", "user.email", "agent@example.test"), cwd=repo)
    (repo / "tracked.txt").write_text("initial\n", encoding="utf-8")
    runner.run(("add", "tracked.txt"), cwd=repo)
    runner.run(("commit", "-m", "Initial"), cwd=repo)
    runner.run(("branch", "-M", "main"), cwd=repo)
    return repo, runner


def test_registry_is_closed_sorted_and_rejects_duplicate_or_invalid_definitions() -> None:
    registry = AgentCommandRegistry()
    registry.register(_read_definition("z-read"))
    registry.register(_read_definition("a-read"))

    assert [item.name for item in registry.definitions()] == ["a-read", "z-read"]
    with pytest.raises(AgentAccessError, match="already registered"):
        registry.register(_read_definition("a-read"))
    with pytest.raises(AgentAccessError, match="name is invalid"):
        registry.register(_read_definition("Upper_Case"))
    with pytest.raises(AgentAccessError, match="Destructive"):
        registry.register(
            AgentCommandDefinition(
                "bad-delete",
                "Bad destructive shape.",
                _schema(),
                lambda _args: None,
                destructive=True,
            )
        )


def test_read_invocation_validates_schema_and_sanitizes_response() -> None:
    registry = AgentCommandRegistry()
    registry.register(_read_definition())

    assert registry.invoke("read-value", {"value": "hello"}) == {"value": "hello"}
    with pytest.raises(AgentAccessError, match="Unknown"):
        registry.invoke("missing", {})
    with pytest.raises(AgentAccessError, match="Undeclared"):
        registry.invoke("read-value", {"extra": True})
    with pytest.raises(AgentAccessError, match="wrong type"):
        registry.invoke("read-value", {"value": 2})
    with pytest.raises(AgentAccessError, match="invalid length"):
        registry.invoke("read-value", {"value": "x" * 21})


@pytest.mark.parametrize(
    "arguments",
    [
        {"token": "anything"},
        {"value": "github_pat_abcdefghijklmnopqrstuvwxyz123456"},
        {"__proto__": {}},
        {"value": float("nan")},
        {"value": "x" * 16_001},
        {1: "not a string key"},
    ],
)
def test_argument_validator_rejects_secrets_prototypes_nonfinite_and_bounds(
    arguments: dict[object, object],
) -> None:
    with pytest.raises(AgentAccessError):
        validate_agent_arguments(arguments)  # type: ignore[arg-type]


def test_argument_validator_rejects_deep_or_huge_payloads() -> None:
    deep: dict[str, object] = {}
    cursor = deep
    for _ in range(10):
        child: dict[str, object] = {}
        cursor["child"] = child
        cursor = child
    with pytest.raises(AgentAccessError, match="bound"):
        validate_agent_arguments(deep)
    with pytest.raises(AgentAccessError, match="bound"):
        validate_agent_arguments({"items": list(range(600))})


def test_mutation_requires_ui_approval_and_token_is_exact_single_use() -> None:
    reviews = MutationReviewStore()
    registry = AgentCommandRegistry(reviews=reviews)
    calls: list[str] = []
    registry.register(
        AgentCommandDefinition(
            "write-value",
            "Write one reviewed value.",
            _schema(
                {"value": {"type": "string", "minLength": 1, "maxLength": 20}},
                ("value",),
            ),
            lambda arguments: calls.append(str(arguments["value"])) or {"ok": True},
            mutating=True,
        )
    )
    arguments = {"value": "reviewed"}

    with pytest.raises(AgentAccessError) as missing:
        registry.invoke("write-value", arguments)
    assert missing.value.code == "review_required"
    preview = registry.prepare_mutation("write-value", arguments)
    token = reviews.approve_from_ui(preview.id)

    with pytest.raises(AgentAccessError, match="fresh approval"):
        registry.invoke("write-value", {"value": "changed"}, review_token=token)
    assert calls == []
    token = reviews.approve_from_ui(
        registry.prepare_mutation("write-value", arguments).id
    )
    assert registry.invoke("write-value", arguments, review_token=token) == {"ok": True}
    assert calls == ["reviewed"]
    with pytest.raises(AgentAccessError, match="fresh approval"):
        registry.invoke("write-value", arguments, review_token=token)


def test_mutation_preview_and_approval_expire() -> None:
    now = 100.0
    reviews = MutationReviewStore(clock=lambda: now)
    registry = AgentCommandRegistry(reviews=reviews)
    registry.register(
        AgentCommandDefinition(
            "write-value",
            "Write reviewed state.",
            _schema(),
            lambda _args: True,
            mutating=True,
        )
    )
    preview = registry.prepare_mutation("write-value", {})
    now += 301
    with pytest.raises(AgentAccessError) as expired:
        reviews.approve_from_ui(preview.id)
    assert expired.value.code == "review_expired"


def test_agent_output_is_bounded_recursive_and_never_returns_secret_values() -> None:
    circular: dict[str, object] = {}
    circular["self"] = circular
    output = sanitize_agent_output(
        {
            "token": "top-secret",
            "message": "Authorization: Bearer abcdefghijklmnop",
            "nan": math.nan,
            "long": "x" * 70_000,
            "circular": circular,
        }
    )

    assert isinstance(output, dict)
    assert str(output["token"]).startswith("[RED")
    assert "abcdefghijklmnop" not in str(output["message"])
    assert output["nan"] == "[NON_FINITE]"
    assert len(str(output["long"])) == 64_000
    assert "[TRUNCATED]" in str(output["circular"])


def test_repository_binding_requires_existing_repo_and_credential_free_https(
    tmp_path: Path,
) -> None:
    binding = RepositoryBinding.capture(
        tmp_path,
        owner="team",
        name="project",
        endpoint="https://api.github.com/",
        account_key="github:https://api.github.com:123",
    )
    assert binding.endpoint == "https://api.github.com"
    assert len(binding.path_fingerprint) == 64
    with pytest.raises(AgentAccessError, match="not a directory"):
        RepositoryBinding.capture(
            tmp_path / "missing",
            owner="team",
            name="project",
            endpoint="https://api.github.com",
            account_key="account",
        )
    for endpoint in (
        "http://api.github.com",
        "https://user:secret@api.github.com",
        "https://api.github.com?token=x",
    ):
        with pytest.raises(AgentAccessError, match="credential-free HTTPS"):
            RepositoryBinding.capture(
                tmp_path,
                owner="team",
                name="project",
                endpoint=endpoint,
                account_key="account",
            )


def test_bound_function_revalidates_exact_live_binding_and_read_schema(tmp_path: Path) -> None:
    binding = RepositoryBinding.capture(
        tmp_path,
        owner="team",
        name="project",
        endpoint="https://api.github.com",
        account_key="account-a",
    )
    live = binding
    calls: list[dict[str, object]] = []
    catalog = BoundAPIFunctionCatalog(
        binding_resolver=lambda _path: live,
        caller=lambda _definition, arguments: calls.append(dict(arguments)) or {"ok": True},
    )
    catalog.add(
        BoundAPIFunction(
            "read_issue",
            "Read one issue.",
            binding,
            _schema({"number": {"type": "integer"}}, ("number",)),
            "read",
            "GET /repos/{owner}/{repo}/issues/{number}",
        )
    )

    assert catalog.invoke("read_issue", {"number": 3}) == {"ok": True}
    assert calls == [{"number": 3}]
    live = RepositoryBinding.capture(
        tmp_path,
        owner="another-team",
        name="project",
        endpoint="https://api.github.com",
        account_key="account-a",
    )
    with pytest.raises(AgentAccessError) as stale:
        catalog.invoke("read_issue", {"number": 3})
    assert stale.value.code == "stale_binding"


def test_bound_write_function_needs_visible_review(tmp_path: Path) -> None:
    binding = RepositoryBinding.capture(
        tmp_path,
        owner="team",
        name="project",
        endpoint="https://api.github.com",
        account_key="account",
    )
    reviews = MutationReviewStore()
    calls = 0

    def call(_definition: BoundAPIFunction, _arguments: dict[str, object]) -> object:
        nonlocal calls
        calls += 1
        return {"updated": True}

    catalog = BoundAPIFunctionCatalog(
        binding_resolver=lambda _path: binding,
        caller=call,  # type: ignore[arg-type]
        reviews=reviews,
    )
    catalog.add(
        BoundAPIFunction(
            "update_issue",
            "Update one issue.",
            binding,
            _schema({"title": {"type": "string", "maxLength": 100}}, ("title",)),
            "write",
            "PATCH /repos/{owner}/{repo}/issues/{number}",
        )
    )
    arguments = {"title": "Reviewed title"}
    with pytest.raises(AgentAccessError) as refused:
        catalog.invoke("update_issue", arguments)
    assert refused.value.code == "review_required"
    token = reviews.approve_from_ui(catalog.prepare_mutation("update_issue", arguments).id)
    assert catalog.invoke("update_issue", arguments, review_token=token) == {"updated": True}
    assert calls == 1


def test_real_repository_catalog_reads_and_performs_only_reviewed_commit(tmp_path: Path) -> None:
    repo, runner = _init_repository(tmp_path)
    reviews = MutationReviewStore()
    store = AutomationSettingsStore(
        settings_file=tmp_path / "state" / "automation.json",
        audit_file=tmp_path / "state" / "audit.json",
    )
    registry = build_repository_agent_registry(
        repo,
        runner=runner,
        settings_store=store,
        reviews=reviews,
    )
    names = {definition.name for definition in registry.definitions()}
    assert {
        "get-status",
        "list-branches",
        "commit",
        "fetch",
        "pull",
        "push",
        "create-branch",
        "merge-branch",
        "get-automation-status",
        "run-automation",
    } <= names
    status = registry.invoke("get-status", {})
    assert isinstance(status, dict)
    assert status["repository"] == "repo"
    branches = registry.invoke("list-branches", {})
    assert isinstance(branches, dict)
    assert "main" in str(branches["stdout"])

    (repo / "tracked.txt").write_text("reviewed change\n", encoding="utf-8")
    arguments = {"summary": "Reviewed local commit", "description": "Made by the test."}
    with pytest.raises(AgentAccessError, match="fresh approval"):
        registry.invoke("commit", arguments)
    before = runner.run(("rev-parse", "HEAD"), cwd=repo).stdout.strip()
    token = reviews.approve_from_ui(registry.prepare_mutation("commit", arguments).id)
    registry.invoke("commit", arguments, review_token=token)
    after = runner.run(("rev-parse", "HEAD"), cwd=repo).stdout.strip()
    assert after != before
    assert runner.run(("log", "-1", "--format=%s"), cwd=repo).stdout.strip() == arguments["summary"]


def test_real_repository_catalog_rejects_option_shaped_branch_after_review(
    tmp_path: Path,
) -> None:
    repo, runner = _init_repository(tmp_path)
    reviews = MutationReviewStore()
    registry = build_repository_agent_registry(repo, runner=runner, reviews=reviews)
    arguments = {"name": "--detach"}
    token = reviews.approve_from_ui(
        registry.prepare_mutation("create-branch", arguments).id
    )

    with pytest.raises(AgentAccessError, match="Branch name"):
        registry.invoke("create-branch", arguments, review_token=token)
    assert runner.run(("branch", "--show-current"), cwd=repo).stdout.strip() == "main"


def test_schema_requires_closed_object_and_rejects_secret_property() -> None:
    registry = AgentCommandRegistry()
    with pytest.raises(AgentAccessError, match="closed object"):
        registry.register(
            AgentCommandDefinition(
                "open-schema",
                "Invalid open schema.",
                {"type": "object", "properties": {}, "additionalProperties": True},
                lambda _args: None,
            )
        )
    with pytest.raises(AgentAccessError, match="Credential-shaped"):
        registry.register(
            AgentCommandDefinition(
                "secret-schema",
                "Invalid secret schema.",
                _schema({"api_token": {"type": "string"}}),
                lambda _args: None,
            )
        )
