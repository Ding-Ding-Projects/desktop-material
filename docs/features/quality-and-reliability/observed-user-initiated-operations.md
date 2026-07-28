# Observed user-initiated operations

A promise that nobody watches cannot report its own failure. This document
describes why a rejected **Push origin** could surface as a generic "a
background action stopped unexpectedly" notice, how the push, force-push, pull,
and fetch entry points now observe the promise they start, and why observing
them presents the real error exactly **once** rather than twice.

## The failure

The renderer installs a last-resort containment handler in
`app/src/ui/index.tsx`:

```ts
window.addEventListener('unhandledrejection', ev => {
  // …report the original Error to the log and to non-fatal exception
  // reporting…
  showContainedBackgroundFailureNotice(
    'A background action stopped unexpectedly. Desktop Material contained the error so you can keep working.'
  )
  ev.preventDefault()
})
```

The notice is deliberately generic: an arbitrary rejection could carry a
credential or a private path, so the handler must not put the reason on screen.
That is the right trade-off for a genuinely unexpected rejection, and the wrong
outcome for a push the user just asked for — it says nothing about whether the
push ran or what to fix, and two failures arriving together deduplicate into a
"Reported 2 times" count.

React discards whatever a click handler returns, so the toolbar's push handler
started a promise and dropped it:

```ts
private push = () => {
  this.closeDropdown()
  this.props.dispatcher.push(this.props.repository) // ← nobody observes this
}
```

`AppStore._push` resolves the repository's canonical remote **before** Git is
allowed to talk to a remote (`withCanonicalRemoteForNetwork(repository, false,
…)`). When the hosted-repository lookup 404s — a transferred, renamed, deleted,
or newly-private repository — `repositoryWithCanonicalRemoteForNetwork` throws,
the preflight fails closed, and the rejection travels back to a caller that is
not listening. The generic notice is what the user sees.

## Why observing does not double-report

Two different failure classes come out of the same call, and only one of them is
already reported:

| Failure | Reported by the store? | Promise |
| --- | --- | --- |
| The Git push itself fails (rejected ref, auth, network) | **Yes** — `GitStore.performFailableOperation` catches it, calls `emitError`, and returns `undefined` | resolves |
| The canonical-remote preflight fails, the tip is unborn or detached, the temporary workspace guard refuses | **No** — it is raised before or outside the failable operation | **rejects** |

`AppStore`'s error emitter is wired to the dispatcher in `App`'s constructor
(`props.appStore.onDidError(error => props.dispatcher.postError(error))`), which
is the same machinery a call site reaches through `Dispatcher.postError`. So a
rejection arriving at a call site is, by construction, a failure nothing has
presented yet. Reporting it there presents it once; it can never duplicate a
failure the store already emitted.

`app/test/unit/push-rejection-observation-test.tsx` pins that invariant
directly: `Dispatcher.push` rejects and does **not** call `postError`.

## Behavior

`app/src/ui/lib/observed-operations.ts`
: Two helpers. `observeUserInitiatedOperation(operation, presenter,
  description)` presents a rejection through the normal error machinery and
  contains a failure of the presentation itself, so the reporting path can never
  become the very unhandled rejection it exists to prevent. `asReportableError`
  coerces a non-`Error` rejection reason. `containBackgroundOperation(operation,
  description)` writes a `log.warn` diagnostic and shows the user nothing.

Toolbar sync pill (`ui/toolbar/push-pull-button.tsx`)
: Push, force-push, pull, and fetch all observe their promise. Pull and fetch
  share the identical canonical-remote preflight, so they shared the identical
  defect.

Application menu (`ui/app.tsx`)
: <kbd>Ctrl</kbd>+<kbd>P</kbd> / **Repository → Push** and the force-push menu
  item observe `Dispatcher.push` and `Dispatcher.confirmOrForcePush`.

Force-push confirmation (`ui/rebase/confirm-force-push.tsx`)
: The dialog's confirm handler observes `Dispatcher.performForcePush` instead of
  awaiting it inside an `async` click handler whose promise React drops.

Workflow push rejection (`ui/workflow-push-rejected/workflow-push-rejected.tsx`)
: The push retried after a successful browser sign-in is observed.

Provider triage (`ui/repository-tools/provider-triage.tsx`)
: The refresh was `void`-ed, which discards a rejection just as effectively as
  ignoring it. It is now contained as a background diagnostic. The store already
  represents every expected failure in its own state — an `unavailable` or
  `error` channel the panel renders — so an escaping rejection there is a defect
  to log, not news to interrupt the user with.

## The preflight performs no Git push

`AppStore._push` calls `performPush` only through
`withCanonicalRemoteForNetwork`, which resolves the canonical remote first and
propagates a failure without invoking the wrapped function. A user-initiated
push passes `isBackgroundTask: false` and `allowUnverifiedRemote: false`, so it
fails closed: when the destination cannot be proven, no Git command runs at all.
Only non-mutating background checks are allowed to continue with an unverified
remote.

## Failure modes

The presentation itself fails
: Contained as a `log.warn` ("presenting the failure of …"). The user may see
  nothing, which is strictly better than a second unhandled rejection.

The operation rejects with a non-`Error`
: Coerced to an `Error` whose message is the stringified reason. If even
  stringifying throws, the message becomes "The operation rejected with an
  unreadable reason."

A rejection still escapes somewhere else
: The global containment in `ui/index.tsx` is unchanged and still catches it.
  These helpers narrow what reaches it; they do not replace it.

## Security considerations

The generic wording of the global notice exists so an arbitrary rejection cannot
copy a credential or a local path onto the screen, and it is untouched. What
changed is which rejections reach it: a user-initiated Git operation now goes
through `Dispatcher.postError`, the same handler chain that already decides how
much of a Git failure is safe to show. Background diagnostics go to the log,
which is subject to the app's existing redaction, and never to a toast.

## Verification

`app/test/unit/push-rejection-observation-test.tsx` — 17 tests:

- the helpers present exactly once, present nothing on success, coerce a
  non-`Error` reason, and contain a failing presentation with no second
  unhandled rejection;
- `containBackgroundOperation` logs a diagnostic and stays silent on success;
- `Dispatcher.push` rejects **without** reporting (the "once" invariant);
- a rendered `PushPullButton` click on a rejecting push posts the real error
  once and leaves nothing for Node's `unhandledRejection` to collect;
- every entry point is pinned to its helper in source;
- `AppStore._push` runs no push when the canonical remote cannot be proven, and
  pushes against the canonicalized repository when it can.

Run it with:

```sh
node script/test.mjs app/test/unit/push-rejection-observation-test.tsx
```
