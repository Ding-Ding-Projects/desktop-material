# Local Agent HTTP API

Desktop Material ships an opt-in Agent API for trusted automation. The main
process owns one versioned command contract and publishes it through a REST
compatibility surface and sessionless MCP JSON-RPC. The renderer executes each
accepted command through the same stores and safety checks as the visible UI.

## Behavior and configuration

Open **Settings → Agent access**, choose **Local only (recommended)**, and turn
on **Enable agent server**. Desktop Material listens on `127.0.0.1` at a random
port and shows the effective base URL and desktop bearer token. The server is
off by default. Regenerating the token invalidates the previous desktop token;
stopping the server removes its runtime connection file.

The separately enabled **Paired LAN devices** mode binds a private IPv4
interface, exchanges a five-minute one-use pairing code for a per-device token,
and can use an explicitly configured HTTPS gateway. Direct LAN HTTP
authenticates but does not encrypt traffic. **YOLO LAN** requires explicit
confirmation, disables authentication, rejects HTTPS gateways, and returns to
local/off when the app restarts. It should be treated as unsafe.

### HTTP routes

- `GET /api/v1/info` requires bearer authentication except in YOLO LAN mode.
  It returns version 1 metadata, limits, and the static plus active
  named-function command catalog.
- `POST /api/v1/commands` is the preferred REST route. Its body is
  `{ "name": "<command>", "args": { ... } }`.
- `POST /api/v1/command/<name>` is the legacy REST route used by the shipped
  CLI. The JSON body is the command argument object.
- `POST /mcp` handles sessionless MCP JSON-RPC `initialize`, `ping`,
  `tools/list`, and `tools/call`. Notifications receive `202` with no body.
- `GET /api/v1/remote/status` publishes transport metadata without
  authentication. It never returns a pairing code or token.
- `POST /api/v1/remote/pair` exchanges a one-use pairing code for a new device
  token exactly once and is available only in Paired LAN mode.
- `GET /api/v1/remote/devices` lists bounded paired-device metadata and
  requires bearer authentication except in YOLO LAN mode.
- `DELETE /api/v1/remote/devices/<id>` revokes one paired device and its
  vault-backed token, then returns `204` on success. It has the same
  authentication rule as the device-list route.

Every POST route requires `Content-Type: application/json`. The current REST
route accepts only `name` and `args`; command arguments must be JSON objects.
REST command success returns `{ "ok": true, "data": ... }`; a command-level
failure returns HTTP `422` with `{ "ok": false, "error": ... }`. Transport
and validation failures use an HTTP status plus an `http_<status>` error code.

### Version 1 command catalog

- Discovery: `list-accounts`, `list-repositories`, `list-tabs`, `get-status`,
  `list-branches`, and `list-ssh-hosts`.
- Repository selection: `open-repository`, `select-repository`, `select-tab`,
  and `close-tab`.
- Clone and Git: `clone`, `clone-batch`, `clone-to-ssh`, `commit`, `fetch`,
  `pull`, `push`, `create-branch`, and `merge-branch`.
- Automation and provider actions: `get-automation-status`, `run-automation`,
  and `trigger-workflow`.
- Named API functions: `list-api-functions` and `invoke-api-function`.

Repository commands that require an exact target accept either `repositoryId`
or `path`. `clone-batch` accepts 1–50 items. A saved-host SSH clone accepts a
32-character lowercase hexadecimal host ID, a credential-free Git URL, and an
absolute or home-relative POSIX destination. `run-automation` accepts
`commit-and-push`, `merge-branches`, or `merge-worktrees`.

The active profile can add validated read functions as
`github_api_<function-name>`. They appear in both `/api/v1/info` and MCP
`tools/list`. REST callers can post function arguments directly to the dynamic
command name or use `invoke-api-function`. Write and destructive definitions
remain discoverable but cannot bypass the app's interactive mutation review.

## Postman workflow

Import either the [category
collection](desktop-material-agent-api.postman_collection.json) or the
[master collection](../../postman/desktop-material.postman_collection.json).
Create a private, unexported Postman environment with these values:

- `agentBaseUrl`: the exact address displayed by Desktop Material;
- `agentToken`: the displayed token, stored as a secret variable; and
- repository, tab, branch, clone, workflow, SSH-host, or named-function values
  only for the requests you intend to run.

The committed defaults use an unreachable port, `.invalid` URLs, empty secret
fields, and replace-me paths. Read request descriptions before sending a
mutation. Do not save a real token or pairing code into either collection, a
shared environment, an export, logs, screenshots, or source control. In Local
mode, omit the `Origin` header; browser-origin requests are rejected.

## Persistence and configuration boundaries

The access mode, remote-site setting, optional gateway, and preferred LAN port
are local application settings. The running app writes a restricted
`agent-server.json` discovery file for the shipped CLI and stdio proxy. It
contains live connection material and must not be copied into a repository or
opened merely to populate Postman. Paired-device display metadata is stored
separately from tokens; tokens live in the operating-system credential vault.
Repository credentials and provider tokens never appear in Agent API results.

## Failure modes and recovery

- `401` means the bearer token is absent, stale, or revoked. Copy the current
  token again or pair the device again.
- `403` means the network address, `Host`, or `Origin` failed the active mode's
  boundary. Use the exact displayed address and remove browser-only headers in
  Local mode.
- `404` covers an unknown route or command, an unavailable pairing route, or a
  missing paired device.
- `413` means the body exceeded 64 KiB; `415` means the content type was not
  JSON. Invalid shape or credential-like arguments return `400`.
- A saturated server returns a retryable `queue_full` command error. At most
  eight commands execute concurrently and 64 more wait in the bounded queue.
- Token rotation, server shutdown, changed repository bindings, invalid named
  functions, and visible-UI preconditions fail closed. Re-read `/api/v1/info`
  or MCP `tools/list`, refresh repository state, and retry only when the error
  is explicitly retryable.

## Security considerations

Local mode accepts only loopback clients and validates the exact `Host` header.
All modes cap request bodies, bound concurrency, reject credential-shaped keys
and pathological nesting before renderer execution, redact credential-shaped
output, and send `no-store` plus defensive response headers. The bearer token
protects Local and Paired LAN modes; paired tokens are independently
revocable. Pairing secrets are rate-limited, expire after five minutes, and
are consumed before vault storage so they cannot be replayed after a partial
failure.

Mutating commands change repositories or provider state. Use exact repository
selectors, inspect status first, and keep the Postman examples pointed at
disposable fixtures until their effects are understood. Never expose a Paired
LAN port outside a trusted private network without the configured HTTPS
gateway, and do not use YOLO LAN on a network containing untrusted clients.

## Verification

The implementation contract lives in `app/src/lib/agent-commands.ts` and the
HTTP/MCP routing in `app/src/main-process/agent-server/`. Unit coverage verifies
the current and legacy REST forms, MCP discovery and calls, dynamic named
functions, token rejection and rotation, Host/Origin policy, body limits,
pairing expiry and one-use exchange, device revocation, LAN mode boundaries,
gateway policy, queue bounds, shutdown, redaction, the CLI, and the stdio
proxy. The checked-in Postman files are parsed as JSON and audited against all
eight shipped route patterns and all 24 static command names.
