# Single-flight user actions

Desktop Material prevents a rapid double-click, repeated Enter or Space key,
or a second control from starting the same consequential asynchronous action
twice. The protection follows the real operation lifetime. It is not a fixed
delay and it does not slow ordinary navigation, toggles, pagination, filter
chips, or other deliberately repeatable controls.

## Behavior

The shared renderer registry claims an action key synchronously before the
callback runs. A second claim for that key does not invoke its callback. The
claim remains active while the callback's returned promise is pending and is
released after fulfillment or rejection. A synchronous callback releases its
claim before returning, so existing repeatable controls retain their behavior.

Each shared `Button`, callback-style `LinkButton`, Material icon or text
button, toolbar button, and shared `Form` receives a stable per-instance key.
Callers may provide an explicit `activationKey` when two separate controls,
menus, shortcuts, or command-palette entries start the same operation. The
control exposes `aria-busy` and `aria-disabled` while its key is active without
moving keyboard focus. Cancel and stop actions use their own keys and remain
available.

The Linux terminal edition uses the same contract around Textual workers. The
initiating button is disabled before the worker starts, another press for the
same action ID is ignored, and the button is restored when the worker settles.
Synchronous terminal actions release immediately.

Every generated documentation page loads the shared `docs-action-flight.js`
module before its page controller. Clipboard actions on the documentation hub
and screenshot pages use one key per source or capture command, publish
`aria-busy` and `aria-disabled` while the browser clipboard promise is pending,
and reopen after either result. Pages without the module retain their existing
copy path rather than presenting an inert control.

Existing operation-level protections remain important. External editor and
file-manager launches, destructive operations, Git mutations, uploads,
downloads, installers, and release actions can have several entry paths. Those
operations keep their existing exact-target validation or idempotency boundary
in addition to the control-level claim.

## Configuration

There is no user-facing cooldown setting. The default key is local to one
control. Use an explicit semantic key only when separate entry paths represent
the same exact action and target. Include the target identity in the key when
different rows or files may run concurrently.

## Failure modes and recovery

- A rejected promise releases the claim so the user can retry.
- A synchronous exception releases the claim before it propagates.
- A removed renderer control unsubscribes from registry updates.
- A removed terminal control still releases its action ID; it is not updated
  after unmount.
- A callback that starts asynchronous work but does not return its promise
  cannot expose the real lifetime. Such a callback must return that promise or
  use the operation's explicit shared action key at its owner boundary.

No timeout guesses that an operation is finished. A slow action stays guarded,
and a fast failed action reopens as soon as its real result arrives.

## Security considerations

Action keys contain stable action and target identifiers, never credentials,
tokens, document contents, or user-entered secret values. Single-flight
coordination is a consistency boundary, not authorization. Every protected
operation still performs its normal permission, path, stale-object, and
destructive-confirmation checks.

## Verification

Focused renderer tests cover same-key suppression, independent keys,
synchronous repeatability, rejection and throw release, target-scoped
subscriptions, accessible busy state, shared keys across separate controls,
and the existing external-open process guard. UI tests exercise shared,
Material, link-style, and toolbar controls.

Focused terminal tests cover exact action claims, repeated Textual button
presses during a worker, button restoration after completion, and synchronous
repeatability. The real built-application interaction and capture records are
tracked separately in the universal-feature completeness inventory.

Documentation tests execute the real page module in jsdom and cover duplicate
promise suppression, independent and synchronous keys, rejection, throw
release, and busy semantics. The screenshot-page generator asserts one current
script entry across all generated pages.

## Suggested articles

- [Observed user-initiated operations](observed-user-initiated-operations.md)
- [Duplicate external-open guard](../integrations/duplicate-open-guard.md)
- [Responsiveness and resource lifecycle](responsiveness-and-resource-lifecycle.md)
