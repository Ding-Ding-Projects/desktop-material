# Self-hosted server wizard

The Windows Preferences wizard provisions the repository's own
`services/desktop-material-server` container. The main process owns the Docker
and filesystem operations; the renderer receives only status, progress,
recoverable error information, and the one-time join URL. The administrator
token is stored in the Windows credential vault and is never sent to renderer
state, written to the server configuration, or printed by the acceptance
harness.

## Behavior and retry boundaries

The wizard detects Docker Desktop and Compose, optionally installs Docker
Desktop after explicit consent, waits for the engine, prepares an ACL-protected
configuration, starts the bundled server, verifies `/healthz`, and creates a
one-use join link. The state reducer in
`app/src/ui/preferences/self-hosted-server-wizard-state.ts` keeps progress,
success, cancellation, and failure transitions deterministic. A failure points
to the first safe step to retry; host initialization and unsupported-platform
failures restart from the beginning because no server step is safe to resume.

Credential failures are intentionally terminal for the current run. The user
must repair the Windows credential-vault state or remove the managed server
through a future repair flow before retrying. The renderer cannot provide or
replace the administrator token.

## Diagnostics and acceptance

Run the diagnostic harness on the Windows artifact:

```text
node script/self-hosted-server-wizard-acceptance.mjs --origin https://server.example
```

It reports Docker CLI/Compose/engine state and, when an origin is provided,
performs a real unauthenticated `/healthz` request. It never emits credentials.
It reports second-machine acceptance as `not-run`; that result requires a real
second Windows machine and is never simulated. On non-Windows hosts it reports
`unsupported-platform` rather than claiming a virtualization result.

## Verification

Focused state and host-boundary tests are:

```text
node --test app/test/unit/self-hosted-server-wizard-state-test.ts script/self-hosted-server-wizard-acceptance-test.mjs
```

The existing provisioning tests cover Docker probing, restart-safe bootstrap
writes, vault rollback, server health, join-link validation, and cancellation.
The repository still requires a real Windows packaged artifact and a second
Windows machine for final acceptance; no screenshot or virtualization result
is claimed without those environments.
