# Central diagnostic logging

Desktop Material can keep logs locally, send them to a self-hosted diagnostic
server, or do both. Local-only remains the default. Operators select the
destination, optional local directory, server URL, private token file, and
non-identifying client ID through launch configuration; secret values are never
placed in arguments or environment variables.

The remote transport is best-effort. It acknowledges the application logger
before starting its five-second-bounded request, so a down server cannot block
Git operations, crash recovery, or shutdown. It emits structured time, level,
session, version, release-channel, and message fields. It does not send
repository files, diffs, credentials, account tokens, or a machine hostname.

The self-hosted service supplies:

- authenticated single or batched ingestion;
- double redaction, on the client and server;
- per-client, per-day JSONL storage in an operator-selected bind mount;
- 14-day and 5-GiB default retention ceilings;
- bounded text/level/client search for troubleshooting agents;
- storage metadata and health endpoints;
- a small browser dashboard;
- ARM64 Docker packaging with read-only filesystem, dropped capabilities,
  resource limits, health checks, and rotated container logs.

Configuration, deployment, rollback, endpoint details, and failure modes are in
the [service runbook](../../../services/diagnostic-log-server/README.md). The
[Postman collection](central-diagnostic-logging.postman_collection.json)
contains no token; supply it only from an unexported secret environment.

## Security considerations

Bearer authentication is mandatory for every data route and compared in
constant time. Request, batch, message, query, result, file-scan, retention,
memory, PID, and storage sizes are bounded. Client and session IDs cannot
contain path separators. The API never accepts a storage path: only the Docker
operator chooses the bind mount. Logs can still contain private project names
or paths after credential redaction, so remote logging must be deliberately
enabled and the storage directory treated as sensitive diagnostic data.

The current LAN deployment uses HTTP on the trusted private network. It must
not be exposed to the public internet; external routing requires HTTPS at a
trusted reverse proxy first.

## Verification

The service test starts a real server and proves unauthorized denial, accepted
ingestion, credential removal, JSONL persistence, search, and storage metadata.
The desktop unit suite proves endpoint validation, destination fallback, and
client-side redaction. The Cheap LFS regression independently proves the
cloud-workflow commit ignores a deliberately failing post-commit hook and
still publishes exactly the generated one-file commit.
