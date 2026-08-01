# Background Git reliability

Desktop Material contains two independent failures found in the July 31,
2026 production log so background maintenance cannot flood the notification
stack or silently stop.

## Behavior

- The Windows startup probe `git rev-parse --verify HEAD` retries a Git launcher
  failure after 75 ms and 250 ms. This exact probe is read-only and does not run
  hooks; no mutating command is eligible for the text-classified retry.
- The launcher prefix is matched independently of the localized Windows error
  text. Cancellation interrupts the backoff and prevents another process launch.
- Repository-indicator refresh contains a failure per repository, logs it, moves
  to the next repository, and reschedules the next cycle in `finally`.

## Configuration

There is no setting. Recovery is automatic and applies only to app-owned
background work. User repositories are never quarantined or rewritten.

## Failure modes

- A launcher failure that survives all three attempts enters normal Git error
  handling unchanged.
- Ordinary Git failures, hooks, filters, helpers, and mutating commands are
  attempted once.
- A repository-indicator failure leaves that repository's previous indicator
  intact while other repositories continue refreshing.

## Security considerations

All launcher matching and backoff happen locally. The retry allowlist contains
only the exact hook-free read probe. No user repository, settings history, or
app-owned history is rewritten by this recovery path.

## Verification

- `app/test/unit/git/transient-launch-retry-test.ts` covers localized launcher
  text, the bounded delays, mutation exclusion, and cancellation.
- `app/test/unit/repository-indicator-updater-test.ts` proves one rejected
  repository does not abort the cycle and that the next cycle is scheduled.

Suggested articles: [Observed user-initiated operations](observed-user-initiated-operations.md),
[Git operation auto-fix](git-operation-auto-fix.md), and
[Responsiveness and resource lifecycle](responsiveness-and-resource-lifecycle.md).
