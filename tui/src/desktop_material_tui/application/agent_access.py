"""Versioned, repository-bound command catalog for local agent access.

The catalog is transport agnostic: HTTP, MCP, stdio, and the CLI all invoke the
same validated definitions.  Mutation approval is deliberately a separate
in-process UI capability.  An agent can request a preview, but it cannot mint
the single-use token that authorizes the reviewed mutation.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
import secrets
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from ..domain.errors import GitCommandError, GitCommandTimeoutError
from ..infrastructure.git.runner import SubprocessGitRunner
from .automation import (
    AutomationSettingsStore,
    RepositoryAutomationService,
    resolve_automation_settings,
)
from .local_ai_repair import redact_sensitive_text

FunctionRisk = Literal["read", "write", "destructive"]

_COMMAND_NAME = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
_FUNCTION_NAME = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
_SAFE_ARGUMENT_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,127}$")
_SECRET_KEY = re.compile(
    r"(?i)(?:authorization|credential|password|passwd|passphrase|private[_-]?key|"
    r"secret|token|api[_-]?key)"
)
_MAX_COMMANDS = 128
_MAX_FUNCTIONS = 64
_MAX_ARGUMENT_ITEMS = 512
_MAX_ARGUMENT_DEPTH = 8
_MAX_STRING = 16_000
_MAX_RESPONSE_STRING = 64_000
_MAX_PREVIEWS = 64
_REVIEW_TTL_SECONDS = 5 * 60.0


class AgentAccessError(RuntimeError):
    """A command, function, payload, binding, or review token was refused."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class AgentCommandDefinition:
    name: str
    description: str
    input_schema: Mapping[str, object]
    handler: Callable[[Mapping[str, object]], object] = field(repr=False, compare=False)
    mutating: bool = False
    destructive: bool = False


@dataclass(frozen=True)
class MutationPreview:
    id: str
    command_name: str
    arguments: Mapping[str, object]
    fingerprint: str
    expires_at_monotonic: float


@dataclass(frozen=True)
class _ApprovedMutation:
    token_digest: str
    command_name: str
    fingerprint: str
    expires_at_monotonic: float


class MutationReviewStore:
    """In-memory, bounded, expiring UI review state."""

    def __init__(self, *, clock: Callable[[], float] | None = None) -> None:
        self.clock = clock or time.monotonic
        self._previews: dict[str, MutationPreview] = {}
        self._approved: dict[str, _ApprovedMutation] = {}
        self._lock = threading.Lock()

    def prepare(self, command_name: str, arguments: Mapping[str, object]) -> MutationPreview:
        now = self.clock()
        preview = MutationPreview(
            id=secrets.token_urlsafe(18),
            command_name=command_name,
            arguments=dict(arguments),
            fingerprint=_argument_fingerprint(command_name, arguments),
            expires_at_monotonic=now + _REVIEW_TTL_SECONDS,
        )
        with self._lock:
            self._prune(now)
            if len(self._previews) >= _MAX_PREVIEWS:
                oldest = next(iter(self._previews))
                self._previews.pop(oldest, None)
            self._previews[preview.id] = preview
        return preview

    def approve_from_ui(self, preview_id: str) -> str:
        """Mint one token after the TUI has shown and approved the preview."""

        now = self.clock()
        with self._lock:
            self._prune(now)
            preview = self._previews.pop(preview_id, None)
            if preview is None:
                raise AgentAccessError("review_expired", "Mutation review is missing or expired")
            token = secrets.token_urlsafe(32)
            self._approved[token] = _ApprovedMutation(
                hashlib.sha256(token.encode("utf-8")).hexdigest(),
                preview.command_name,
                preview.fingerprint,
                now + _REVIEW_TTL_SECONDS,
            )
            return token

    def consume(
        self,
        token: str | None,
        command_name: str,
        arguments: Mapping[str, object],
    ) -> bool:
        if not token:
            return False
        now = self.clock()
        with self._lock:
            self._prune(now)
            approved = self._approved.pop(token, None)
        if approved is None:
            return False
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        return (
            hmac.compare_digest(digest, approved.token_digest)
            and approved.command_name == command_name
            and hmac.compare_digest(
                approved.fingerprint,
                _argument_fingerprint(command_name, arguments),
            )
        )

    def _prune(self, now: float) -> None:
        self._previews = {
            key: value
            for key, value in self._previews.items()
            if value.expires_at_monotonic > now
        }
        self._approved = {
            key: value
            for key, value in self._approved.items()
            if value.expires_at_monotonic > now
        }


class AgentCommandRegistry:
    """Closed command registry shared by every local transport."""

    protocol_version = 1

    def __init__(self, *, reviews: MutationReviewStore | None = None) -> None:
        self.reviews = reviews or MutationReviewStore()
        self._commands: dict[str, AgentCommandDefinition] = {}

    def register(self, definition: AgentCommandDefinition) -> None:
        _validate_command_definition(definition)
        if definition.name in self._commands:
            raise AgentAccessError("duplicate_command", "Agent command is already registered")
        if len(self._commands) >= _MAX_COMMANDS:
            raise AgentAccessError("catalog_full", "Agent command catalog is full")
        self._commands[definition.name] = definition

    def definitions(self) -> tuple[AgentCommandDefinition, ...]:
        return tuple(self._commands[name] for name in sorted(self._commands))

    def prepare_mutation(
        self, name: str, arguments: Mapping[str, object]
    ) -> MutationPreview:
        definition = self._resolve(name)
        validated = validate_agent_arguments(arguments)
        _validate_against_schema(validated, definition.input_schema)
        if not definition.mutating:
            raise AgentAccessError("not_mutating", "Read commands do not require mutation review")
        return self.reviews.prepare(name, validated)

    def invoke(
        self,
        name: str,
        arguments: Mapping[str, object],
        *,
        review_token: str | None = None,
    ) -> object:
        definition = self._resolve(name)
        validated = validate_agent_arguments(arguments)
        _validate_against_schema(validated, definition.input_schema)
        if definition.mutating and not self.reviews.consume(
            review_token, definition.name, validated
        ):
            raise AgentAccessError(
                "review_required",
                "This mutation requires a fresh approval from the visible TUI review surface",
            )
        try:
            result = definition.handler(validated)
        except AgentAccessError:
            raise
        except (GitCommandError, GitCommandTimeoutError) as error:
            raise AgentAccessError(
                "git_failed", redact_sensitive_text(str(error))[:2_000]
            ) from error
        except Exception as error:
            raise AgentAccessError(
                "command_failed", redact_sensitive_text(str(error))[:2_000]
            ) from error
        return sanitize_agent_output(result)

    def _resolve(self, name: str) -> AgentCommandDefinition:
        definition = self._commands.get(name)
        if definition is None:
            raise AgentAccessError("unknown_command", "Unknown agent command")
        return definition


@dataclass(frozen=True)
class RepositoryBinding:
    repository_path: str
    path_fingerprint: str
    owner: str
    name: str
    endpoint: str
    account_key: str

    @classmethod
    def capture(
        cls,
        repository: str | Path,
        *,
        owner: str,
        name: str,
        endpoint: str,
        account_key: str,
    ) -> RepositoryBinding:
        repository_path = Path(repository).expanduser().resolve()
        if not repository_path.is_dir():
            raise AgentAccessError("missing_repository", "Bound repository is not a directory")
        resolved = str(repository_path)
        _validate_binding_text(owner, "owner")
        _validate_binding_text(name, "repository name")
        _validate_binding_text(account_key, "account key")
        fingerprint = hashlib.sha256(resolved.encode("utf-8")).hexdigest()
        return cls(
            resolved,
            fingerprint,
            owner,
            name,
            _validate_endpoint(endpoint),
            account_key,
        )


@dataclass(frozen=True)
class BoundAPIFunction:
    name: str
    description: str
    binding: RepositoryBinding
    argument_schema: Mapping[str, object]
    risk: FunctionRisk
    operation: str


class BoundAPIFunctionCatalog:
    """Exact-binding, bounded named API functions with fail-closed mutations."""

    def __init__(
        self,
        *,
        binding_resolver: Callable[[str], RepositoryBinding],
        caller: Callable[[BoundAPIFunction, Mapping[str, object]], object],
        reviews: MutationReviewStore | None = None,
    ) -> None:
        self.binding_resolver = binding_resolver
        self.caller = caller
        self.reviews = reviews or MutationReviewStore()
        self._functions: dict[str, BoundAPIFunction] = {}

    def add(self, definition: BoundAPIFunction) -> None:
        if not _FUNCTION_NAME.fullmatch(definition.name):
            raise AgentAccessError("invalid_function", "API function name is invalid")
        if definition.name in self._functions:
            raise AgentAccessError("duplicate_function", "API function already exists")
        if len(self._functions) >= _MAX_FUNCTIONS:
            raise AgentAccessError("catalog_full", "API function catalog is full")
        if definition.risk not in {"read", "write", "destructive"}:
            raise AgentAccessError("invalid_risk", "API function risk is invalid")
        _validate_schema(definition.argument_schema)
        self._functions[definition.name] = definition

    def definitions(self) -> tuple[BoundAPIFunction, ...]:
        return tuple(self._functions[name] for name in sorted(self._functions))

    def prepare_mutation(
        self, name: str, arguments: Mapping[str, object]
    ) -> MutationPreview:
        definition = self._resolve_live(name)
        if definition.risk == "read":
            raise AgentAccessError("not_mutating", "Read functions need no review")
        validated = validate_agent_arguments(arguments)
        _validate_against_schema(validated, definition.argument_schema)
        return self.reviews.prepare(f"github_api_{name}", validated)

    def invoke(
        self,
        name: str,
        arguments: Mapping[str, object],
        *,
        review_token: str | None = None,
    ) -> object:
        definition = self._resolve_live(name)
        validated = validate_agent_arguments(arguments)
        _validate_against_schema(validated, definition.argument_schema)
        if definition.risk != "read" and not self.reviews.consume(
            review_token, f"github_api_{name}", validated
        ):
            raise AgentAccessError(
                "review_required",
                "Write API functions require visible TUI mutation review",
            )
        return sanitize_agent_output(self.caller(definition, validated))

    def _resolve_live(self, name: str) -> BoundAPIFunction:
        definition = self._functions.get(name)
        if definition is None:
            raise AgentAccessError("unknown_function", "Unknown API function")
        current = self.binding_resolver(definition.binding.repository_path)
        if current != definition.binding:
            raise AgentAccessError(
                "stale_binding",
                "Repository, remote, endpoint, or account binding changed",
            )
        expected = hashlib.sha256(current.repository_path.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(expected, current.path_fingerprint):
            raise AgentAccessError("stale_binding", "Repository path binding is invalid")
        return definition


def build_repository_agent_registry(
    repository: str | Path,
    *,
    runner: SubprocessGitRunner | None = None,
    settings_store: AutomationSettingsStore | None = None,
    account_key: str = "",
    repository_key: str = "",
    reviews: MutationReviewStore | None = None,
) -> AgentCommandRegistry:
    """Build a useful single-repository catalog with reviewed mutations."""

    root = Path(repository).expanduser().resolve()
    if not root.is_dir():
        raise AgentAccessError("missing_repository", "Repository path is not a directory")
    git = runner or SubprocessGitRunner(default_timeout=120)
    store = settings_store or AutomationSettingsStore()
    automation = RepositoryAutomationService(root, runner=git, store=store)
    registry = AgentCommandRegistry(reviews=reviews)

    def run_git(
        args: Sequence[str], *, allowed_exit_codes: Sequence[int] = (0,)
    ) -> object:
        result = git.run(args, cwd=root, allowed_exit_codes=allowed_exit_codes)
        return {
            "exitCode": result.exit_code,
            "stdout": result.stdout[:_MAX_RESPONSE_STRING],
            "stderr": result.stderr[:_MAX_RESPONSE_STRING],
        }

    registry.register(
        AgentCommandDefinition(
            "get-status",
            "Read the current branch and porcelain repository status.",
            _object_schema({}),
            lambda _args: {
                "repository": root.name,
                "branch": git.run(
                    ("branch", "--show-current"), cwd=root, allowed_exit_codes=(0, 128)
                ).stdout.strip(),
                "status": git.run(("status", "--porcelain=v1"), cwd=root).stdout,
            },
        )
    )
    registry.register(
        AgentCommandDefinition(
            "list-branches",
            "List bounded local branch names and their object IDs.",
            _object_schema({}),
            lambda _args: run_git(
                (
                    "for-each-ref",
                    "--count=500",
                    "--format=%(refname:short)%09%(objectname)",
                    "refs/heads",
                )
            ),
        )
    )

    def commit(arguments: Mapping[str, object]) -> object:
        summary = str(arguments["summary"]).strip()
        description = str(arguments.get("description", "")).strip()
        git.run(("add", "--all"), cwd=root)
        argv = ("commit", "-m", summary, *(("-m", description) if description else ()))
        return run_git(argv)

    registry.register(
        AgentCommandDefinition(
            "commit",
            "Stage all repository changes and create one reviewed commit.",
            _object_schema(
                {
                    "summary": {"type": "string", "minLength": 1, "maxLength": 200},
                    "description": {"type": "string", "maxLength": 8000},
                },
                required=("summary",),
            ),
            commit,
            mutating=True,
        )
    )
    for name, argv, description in (
        ("fetch", ("fetch", "--prune"), "Fetch and prune the configured remotes."),
        ("pull", ("pull", "--ff-only"), "Fast-forward the current upstream branch."),
        ("push", ("push",), "Push the current branch without rewriting history."),
    ):
        def run_fixed_git(
            _arguments: Mapping[str, object], command: tuple[str, ...] = argv
        ) -> object:
            return run_git(command)

        registry.register(
            AgentCommandDefinition(
                name,
                description,
                _object_schema({}),
                run_fixed_git,
                mutating=True,
            )
        )

    registry.register(
        AgentCommandDefinition(
            "create-branch",
            "Create and switch to a reviewed local branch.",
            _object_schema(
                {"name": {"type": "string", "minLength": 1, "maxLength": 240}},
                required=("name",),
            ),
            lambda arguments: _create_branch(git, root, str(arguments["name"]), run_git),
            mutating=True,
        )
    )
    registry.register(
        AgentCommandDefinition(
            "merge-branch",
            "Merge one reviewed branch without deleting it.",
            _object_schema(
                {"name": {"type": "string", "minLength": 1, "maxLength": 240}},
                required=("name",),
            ),
            lambda arguments: _merge_branch(git, root, str(arguments["name"]), run_git),
            mutating=True,
        )
    )

    def automation_status(_arguments: Mapping[str, object]) -> object:
        effective = resolve_automation_settings(
            store.load(), account_key=account_key, repository_key=repository_key
        )
        return {"effective": asdict(effective), "guard": asdict(automation.inspect())}

    registry.register(
        AgentCommandDefinition(
            "get-automation-status",
            "Read effective automation settings and repository guard state.",
            _object_schema({}),
            automation_status,
        )
    )
    registry.register(
        AgentCommandDefinition(
            "run-automation",
            "Run one reviewed conservative repository automation action.",
            _object_schema(
                {"action": {"type": "string", "enum": ["commit-push", "pull"]}},
                required=("action",),
            ),
            lambda arguments: asdict(automation.run(str(arguments["action"]))),  # type: ignore[arg-type]
            mutating=True,
        )
    )
    return registry


def validate_agent_arguments(arguments: Mapping[str, object]) -> dict[str, object]:
    """Copy and bound a JSON-shaped argument object, rejecting secret input."""

    if not isinstance(arguments, Mapping):
        raise AgentAccessError("invalid_arguments", "Command arguments must be an object")
    items = 0

    def visit(value: object, depth: int, key: str | None = None) -> object:
        nonlocal items
        items += 1
        if items > _MAX_ARGUMENT_ITEMS or depth > _MAX_ARGUMENT_DEPTH:
            raise AgentAccessError("arguments_too_large", "Command arguments exceed their bound")
        if key is not None:
            if key in {"__proto__", "constructor", "prototype"}:
                raise AgentAccessError("invalid_arguments", "Prototype-shaped keys are refused")
            if not _SAFE_ARGUMENT_KEY.fullmatch(key):
                raise AgentAccessError("invalid_arguments", "Command argument key is invalid")
            if _SECRET_KEY.search(key):
                raise AgentAccessError("secret_argument", "Credential-shaped arguments are refused")
        if value is None or isinstance(value, (bool, int)):
            return value
        if isinstance(value, float):
            if not math.isfinite(value):
                raise AgentAccessError("invalid_arguments", "Non-finite numbers are refused")
            return value
        if isinstance(value, str):
            if len(value) > _MAX_STRING or "\x00" in value:
                raise AgentAccessError("invalid_arguments", "Command string argument is invalid")
            if redact_sensitive_text(value) != value:
                raise AgentAccessError("secret_argument", "Credential-shaped arguments are refused")
            return value
        if isinstance(value, Mapping):
            return {
                str(child_key): visit(child, depth + 1, str(child_key))
                for child_key, child in value.items()
            }
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            return [visit(child, depth + 1) for child in value]
        raise AgentAccessError("invalid_arguments", "Command arguments must be JSON values")

    result: dict[str, object] = {}
    for key, value in arguments.items():
        if not isinstance(key, str):
            raise AgentAccessError("invalid_arguments", "Command argument keys must be strings")
        result[key] = visit(value, 1, key)
    return result


def sanitize_agent_output(value: object) -> object:
    """Bound and redact a JSON-shaped result before it reaches any transport."""

    items = 0

    def visit(item: object, depth: int, key: str | None = None) -> object:
        nonlocal items
        items += 1
        if items > _MAX_ARGUMENT_ITEMS or depth > _MAX_ARGUMENT_DEPTH:
            return "[TRUNCATED]"
        if key is not None and _SECRET_KEY.search(key):
            return "[REDACTED]"
        if item is None or isinstance(item, (bool, int)):
            return item
        if isinstance(item, float):
            return item if math.isfinite(item) else "[NON_FINITE]"
        if isinstance(item, str):
            return redact_sensitive_text(item)[:_MAX_RESPONSE_STRING]
        if isinstance(item, Mapping):
            return {
                str(child_key)[:128]: visit(child, depth + 1, str(child_key))
                for child_key, child in list(item.items())[:_MAX_ARGUMENT_ITEMS]
            }
        if isinstance(item, Sequence) and not isinstance(item, (str, bytes, bytearray)):
            return [visit(child, depth + 1) for child in item[:_MAX_ARGUMENT_ITEMS]]
        return redact_sensitive_text(str(item))[:_MAX_RESPONSE_STRING]

    return visit(value, 0)


def _validate_command_definition(definition: AgentCommandDefinition) -> None:
    if not _COMMAND_NAME.fullmatch(definition.name):
        raise AgentAccessError("invalid_command", "Agent command name is invalid")
    if not definition.description or len(definition.description) > 1_000:
        raise AgentAccessError("invalid_command", "Agent command description is invalid")
    if definition.destructive and not definition.mutating:
        raise AgentAccessError("invalid_command", "Destructive commands must be mutating")
    _validate_schema(definition.input_schema)


def _object_schema(
    properties: Mapping[str, object], *, required: Sequence[str] = ()
) -> dict[str, object]:
    return {
        "type": "object",
        "properties": dict(properties),
        "required": list(required),
        "additionalProperties": False,
    }


def _validate_schema(schema: Mapping[str, object]) -> None:
    if schema.get("type") != "object" or schema.get("additionalProperties") is not False:
        raise AgentAccessError(
            "invalid_schema", "Agent schemas must be closed object schemas"
        )
    properties = schema.get("properties")
    required = schema.get("required", [])
    if (
        not isinstance(properties, Mapping)
        or not isinstance(required, Sequence)
        or isinstance(required, (str, bytes, bytearray))
    ):
        raise AgentAccessError("invalid_schema", "Agent schema properties are invalid")
    if len(properties) > 64 or len(required) > 64:
        raise AgentAccessError("invalid_schema", "Agent schema exceeds its bound")
    for key, child in properties.items():
        if not isinstance(key, str) or not _SAFE_ARGUMENT_KEY.fullmatch(key):
            raise AgentAccessError("invalid_schema", "Agent schema property is invalid")
        if _SECRET_KEY.search(key):
            raise AgentAccessError("invalid_schema", "Credential-shaped schema keys are refused")
        if not isinstance(child, Mapping) or child.get("type") not in {
            "string",
            "integer",
            "number",
            "boolean",
            "array",
            "object",
        }:
            raise AgentAccessError("invalid_schema", "Agent schema type is unsupported")
    if any(item not in properties for item in required):
        raise AgentAccessError("invalid_schema", "Required schema property is missing")


def _validate_against_schema(
    arguments: Mapping[str, object], schema: Mapping[str, object]
) -> None:
    properties = schema.get("properties", {})
    required = schema.get("required", [])
    if (
        not isinstance(properties, Mapping)
        or not isinstance(required, Sequence)
        or isinstance(required, (str, bytes, bytearray))
    ):
        raise AgentAccessError("invalid_schema", "Agent schema is malformed")
    unknown = set(arguments) - set(properties)
    missing = set(required) - set(arguments)
    if unknown:
        raise AgentAccessError("invalid_arguments", "Undeclared command arguments are refused")
    if missing:
        raise AgentAccessError("invalid_arguments", "Required command arguments are missing")
    for key, value in arguments.items():
        rule = properties[key]
        if not isinstance(rule, Mapping):
            raise AgentAccessError("invalid_schema", "Agent schema rule is malformed")
        expected = rule.get("type")
        valid = {
            "string": isinstance(value, str),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "number": isinstance(value, (int, float)) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
            "array": isinstance(value, list),
            "object": isinstance(value, dict),
        }.get(str(expected), False)
        if not valid:
            raise AgentAccessError("invalid_arguments", f"Argument {key!r} has the wrong type")
        if isinstance(value, str):
            minimum = int(rule.get("minLength", 0))
            maximum = int(rule.get("maxLength", _MAX_STRING))
            if len(value) < minimum or len(value) > maximum:
                raise AgentAccessError("invalid_arguments", f"Argument {key!r} has invalid length")
            choices = rule.get("enum")
            if (
                isinstance(choices, Sequence)
                and not isinstance(choices, (str, bytes, bytearray))
                and value not in choices
            ):
                raise AgentAccessError("invalid_arguments", f"Argument {key!r} is not allowed")


def _argument_fingerprint(name: str, arguments: Mapping[str, object]) -> str:
    canonical = json.dumps(
        {"name": name, "arguments": arguments},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _validate_binding_text(value: str, label: str) -> None:
    if not value or len(value) > 512 or any(character in value for character in "\x00\r\n"):
        raise AgentAccessError("invalid_binding", f"Repository {label} is invalid")


def _validate_endpoint(value: str) -> str:
    _validate_binding_text(value, "endpoint")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise AgentAccessError(
            "invalid_binding", "Repository endpoint must be credential-free HTTPS"
        )
    return value.rstrip("/")


def _validated_branch(
    git: SubprocessGitRunner, root: Path, name: str
) -> str:
    if not name or name.startswith("-") or "\x00" in name:
        raise AgentAccessError("invalid_arguments", "Branch name is invalid")
    checked = git.run(
        ("check-ref-format", "--branch", name),
        cwd=root,
        allowed_exit_codes=(0, 1, 128),
    )
    if checked.exit_code != 0:
        raise AgentAccessError("invalid_arguments", "Branch name is invalid")
    return name


def _create_branch(
    git: SubprocessGitRunner,
    root: Path,
    name: str,
    run_git: Callable[[Sequence[str]], object],
) -> object:
    return run_git(("switch", "-c", _validated_branch(git, root, name)))


def _merge_branch(
    git: SubprocessGitRunner,
    root: Path,
    name: str,
    run_git: Callable[[Sequence[str]], object],
) -> object:
    return run_git(("merge", "--no-edit", "--", _validated_branch(git, root, name)))
