# Desktop Material diagnostic log server

This service receives bounded, structured diagnostics from Desktop Material
clients and keeps them searchable for operators and AI troubleshooting agents.
It is deliberately small enough for the ARM64 Docker host: one Node process,
JSON Lines storage, no database, a 192 MiB memory limit, and a configurable
retention/byte ceiling.

## Client configuration

Desktop Material remains local-only by default. Set these variables in the
client's launch environment to choose the destination:

<!-- markdownlint-disable MD013 -->

| Variable | Value |
| --- | --- |
| `DESKTOP_MATERIAL_LOG_DESTINATION` | `local`, `remote`, or `both` |
| `DESKTOP_MATERIAL_LOG_DIRECTORY` | Optional absolute directory for local logs |
| `DESKTOP_MATERIAL_LOG_SERVER_URL` | Server base URL, such as `http://192.168.50.242:4318` |
| `DESKTOP_MATERIAL_LOG_SERVER_TOKEN_FILE` | Absolute path to a private file containing the bearer token |
| `DESKTOP_MATERIAL_LOG_CLIENT_ID` | Optional stable ID using letters, digits, dot, underscore, or hyphen |

<!-- markdownlint-enable MD013 -->

The token itself never belongs in an environment variable, command line,
repository, log, URL, screenshot, or chat. Remote messages are redacted on the
client and again on the server. Remote delivery is best-effort and never blocks
Git, crash recovery, or shutdown.

## Storage choice and deployment

Copy this directory to a project-specific location on the Docker host. Create
`secrets/diagnostic-log-token` with mode `0600`, then set
`LOG_SERVER_STORAGE_PATH` in an untracked `.env` file to any dedicated
directory with enough free space. `docker compose up -d --build` deploys the
service without modifying other stacks.

The compose file runs as host UID/GID `1000:1000` by default so its private
token and data bind mounts stay writable without world permissions. Set
`LOG_SERVER_UID` and `LOG_SERVER_GID` when the deployment account differs.

The default policy retains 14 days and at most 5 GiB. Override
`LOG_SERVER_RETENTION_DAYS` or `LOG_SERVER_MAX_STORAGE_BYTES` in `.env`.
The container is read-only except for the selected `/data` bind mount, drops
all capabilities, and has CPU, memory, PID, log-rotation, and health limits.

Rollback is `docker compose down`; the selected host directory remains intact.
Move that directory only while the service is stopped, update
`LOG_SERVER_STORAGE_PATH`, and start it again.

## Agent and operator API

All data routes require `Authorization: Bearer …`. `/health` and the inert
dashboard shell are public; the dashboard cannot read data until its in-memory
token field is filled. Agents on the Docker host should read the token file
into the request without printing it:

```sh
curl -fsS \
  -H "Authorization: Bearer $(cat secrets/diagnostic-log-token)" \
  "http://127.0.0.1:4318/v1/logs?level=error&limit=200"
```

- `POST /v1/logs` accepts one event or up to 500 events.
- `GET /v1/logs` filters by `client`, `level`, `q`, and `limit`.
- `GET /v1/storage` reports retention, usage, file, and client counts.
- `GET /` serves a compact dashboard; the bearer token stays in page memory.
- `GET /health` supports container and external health checks.

The service rejects malformed client/session IDs, caps bodies and messages,
uses constant-time bearer-token comparison, escapes dashboard output as JSON,
and never offers arbitrary filesystem paths through the HTTP API.

## Failure modes

- A missing or short token prevents startup.
- An unavailable server never stops the desktop client; local logging remains
  available in `local` or `both` mode.
- A full disk causes ingestion to fail without deleting unrelated host data.
  The server prunes only its own dated JSONL files.
- A malformed log line is skipped during search, leaving other records usable.
- HTTP is suitable only on the trusted LAN. Put a TLS reverse proxy in front of
  the service before routing it outside that network.

Run `node --test test/*.test.mjs` for authorization, redaction, persistence,
search, and storage-metadata coverage.
