# Root renderer resource lifecycle

## Behavior

The root `App` owns every long-lived renderer subscription and polling timer it
starts. Store, updater, drag-manager, and IPC listeners are collected in one
`CompositeDisposable`; telemetry and update-check timers retain explicit
handles. Unmount disposes that collection, clears all timers, releases document
drag/drop and focus handlers, and removes application-menu keyboard listeners.

Deferred launch work checks that the component is still mounted before starting
polling. The animation-frame appearance synchronization has the same guard.
This prevents a queued callback from resurrecting background work after the
window has begun shutting down.

The typed IPC wrapper returns a `Disposable` from `on()`. Callers can therefore
own IPC lifetime at the registration boundary instead of duplicating listener
identity and removal logic.

## Configuration

There is no user-facing setting. Telemetry and update-check cadence remain
unchanged; this contract only bounds their lifetime to the renderer that owns
them.

## Failure modes

- A renderer that does not unmount cannot use this cleanup path; normal process
  teardown remains the final operating-system boundary.
- An asynchronous callback already executing during unmount can finish its
  current synchronous work. Post-await UI mutations are guarded where the root
  update listener needs them.
- New root-level listeners must be added to the shared disposable collection or
  paired with explicit cleanup in `componentWillUnmount`.

## Security considerations

Cleanup prevents stale renderer instances from continuing to receive
certificate, menu, updater, and repository events. It does not change
certificate validation, update trust, telemetry contents, or IPC channel
authorization.

## Verification

`app/test/unit/app-lifecycle-resource-contract-test.ts` checks IPC disposal,
subscription ownership, timer retention/cleanup, global document/window handler
cleanup, and mounted guards. The focused suite passes 4/4 and ESLint passes for
the changed source and test files.

The production build cannot run in the current checkout because its dependency
tree is absent; the mandated `npx --no-install` command correctly refuses to
download missing `cross-env`. Repository-wide TypeScript likewise remains
blocked by missing baseline packages including `dugite`, `registry-js`,
`@github/copilot-sdk`, and `dexie`.
