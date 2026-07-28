# Canonical remote preflight warning

Network mutations that depend on a GitHub repository association now fail
closed when Desktop Material cannot prove the configured remote's canonical
destination. Instead of allowing that expected configuration problem to fall
through as a generic red background-action error, the app shows a yellow,
non-blocking warning with a **Change remote URL** action.

## Behavior

Before a push or another protected network mutation, Desktop Material asks the
provider for the canonical repository identity and verifies any required remote
URL update. If the provider cannot verify the repository, or the update cannot
be proven safe, the Git operation is not started.

The warning appears in the bounded corner notification stack, remains until the
user dismisses it, and is announced as an alert. Repeated failures for the same
repository deduplicate into one card with an occurrence count. Choosing
**Change remote URL** selects the exact repository and opens **Repository
settings → Remote**; it does not alter the URL automatically.

The same typed failure is observed by toolbar, menu, keyboard, and dispatcher
entry points. Background refreshes contain their own refresh errors, so they do
not create an unhandled rejection or the generic “background action stopped”
notice.

## Configuration and failure modes

There is no preference that weakens this preflight. The user can repair or
replace the remote in Repository Settings and retry the original operation.
Credential, authentication, ordinary network, and Git failures that are not a
canonical-remote verification failure continue through their existing error
paths.

If the repository was removed before the action is handled, the app reports
that bounded state instead of opening settings for a different repository.
Warnings are capped and stored in notification history so a dismissed event
remains reviewable.

## Security and privacy

The typed failure carries only the repository database ID and a bounded reason.
It deliberately carries no URL. A malformed URL that embeds a username, token,
or other credential therefore cannot be copied into the toast, notification
history, or error report. The recovery action is repository-ID scoped and never
performs a remote mutation itself.

## Verification

Focused tests prove that a failed canonical preflight attempts no push, produces
the yellow warning and recovery action, routes all app entry points through the
same handler, opens the exact repository's Remote settings, deduplicates
repeated warnings, and contains rejected background refreshes. TypeScript,
ESLint, formatting, and the production build are checkpoint gates; packaged
visual acceptance remains separate evidence.

This feature adds no HTTP endpoint, so a Postman collection is not applicable.
