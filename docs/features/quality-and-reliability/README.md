# Quality and reliability

This category documents cross-cutting responsiveness, lifecycle, and recovery
contracts that span more than one user workflow.

## Features

- [Progressive asynchronous
  loading](progressive-lazy-loading.md) — reveal the usable shell before
  optional startup work, evaluate heavy inactive repository sections on first
  activation, and contain each load behind accessible local progress, retry,
  and newest-request-wins lifecycle guards.
- [Responsiveness and resource
  lifecycle](responsiveness-and-resource-lifecycle.md) — avoid redundant remote
  discovery, hard-bound advisory process cleanup, coalesce stalled proxy work,
  serialize credential prompts, coalesce high-frequency appearance writes, and
  release request and markdown-preview resources deterministically.
- [Peer-closed stream writes](peer-closed-stream-writes.md) — contain the write
  that finishes after its peer already went away (`write EOF`/`EPIPE`) in the
  Cheap LFS upload, trampoline, agent-server, and hooks-proxy transports, plus a
  narrowly-scoped process backstop that turns it into a non-blocking notice
  while every unknown exception stays fatal.
- [Observed user-initiated
  operations](observed-user-initiated-operations.md) — push, force-push, pull,
  and fetch observe the promise they start, so a failed canonical-remote
  preflight is presented once through the normal error machinery instead of
  reaching the global `unhandledrejection` containment as a generic "a
  background action stopped unexpectedly" notice; background refreshes are
  contained as diagnostics instead.
- [Git operation auto-fix](git-operation-auto-fix.md) — a pure classifier that
  recognizes fixable Git failures (stale index.lock, auto-gc/maintenance hang,
  non-fast-forward push, forbidden org-remote push, detached-HEAD commit),
  proposes a safety-classed remediation, and surfaces a localized one-click
  "Fix it" action on the transient error notice without ever force-pushing.
- [Canonical remote preflight
  warning](canonical-remote-preflight-warning.md) — stop a protected network
  mutation before Git runs when the remote destination cannot be proven, then
  show a persistent yellow non-blocking warning with a repository-scoped
  **Change remote URL** action and no credential-bearing URL text.
- [Git hook execution environment](git-hook-execution.md) — proxy the
  repository's own hooks through the user's configured shell, spool hook
  standard input to a real file so the bundled Windows Git can open it, and
  keep the app-generated Cheap LFS first-publish anchor on `--no-verify` while
  every reviewed push still runs hooks.
- [Native large-repository
  handling](native-large-repository-handling.md) — per-repository large mode
  that extends gc/maintenance suppression to status/add/checkout/fetch plus a
  controlled repack, fail-closed stale-`index.lock` removal, an explicit
  status-computing state, suspended polling with one persistent notification for
  deleted repositories, and confirm-class nested-`.git` compression.

## API applicability

These contracts change local desktop scheduling and cleanup behavior. They add
no HTTP endpoint, so a Postman collection is not applicable.
