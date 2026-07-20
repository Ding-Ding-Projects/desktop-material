# Collection bulk actions and regex safety

Desktop Material gives collection search fields one shared fuzzy, substring,
and regular-expression contract. A tracked registry maps each real search
input to a stable surface ID and its regex builder. A second registry records
which collection managers support reviewed bulk work and which must remain
one-at-a-time because their topology or recovery requirements differ per item.

## Behavior and configuration

The mode control cycles through fuzzy, contiguous substring, and JavaScript
regular-expression matching. Substring and regex modes can match case. The
Regex Builder starts from the surface's current query, offers token categories,
all six supported flags, a live tester seeded with up to 50 visible items, and
an explanatory guide; applying a valid pattern switches that surface to regex
mode.

Implemented bulk surfaces retain operation-specific review. Examples include
rerunning completed or cancelling active workflow runs, deleting Actions
caches by key and ref, deleting exact branch tips, syncing selected
repositories, notification actions, publishing or deleting exact releases,
and reviewed tag updates. Submodules, subtrees, stashes, and worktrees are
explicit exclusions because a broad action would bypass their per-item
topology, dirty-state, ordering, or conflict review.

## Persistence

Each registered list persists only its selected match mode in local UI storage
under its stable surface ID. Case sensitivity, active filter chips, current
query, Regex Builder draft, tester sample, and dialog position remain transient
component state. Bulk actions are explicit user-reviewed requests rather than
a persisted schedule; their owning surface controls any progress or result
retention.

## Failure modes and recovery

An invalid regex or a pattern longer than 1,000 characters never empties or
crashes the collection. Matching returns the unfiltered candidates with a
human-readable regex error while the user repairs the expression. The Regex
Builder marks an invalid draft and disables Apply. Zero-width matches advance
explicitly, and match highlighting has a bounded loop.

Bulk eligibility is rechecked by the owning operation. Ineligible, stale, or
failed items are reported according to that feature's result contract instead
of allowing one broad UI selection to bypass its review boundary. Managers
whose safe common contract is not established remain excluded from bulk work.

## Security considerations

Regexes are compiled only in the renderer against already loaded display
strings; the shared matcher does not invoke a shell or provider. Pattern length
and highlight-loop bounds reduce accidental UI stalls. Stable registry IDs make
an unreviewed new search field fail the source audit until it adopts the same
invalid-regex and builder behavior.

Bulk operations pass operation-specific bounded identities, such as run IDs,
repository IDs, release fingerprints, or exact branch tips. Destructive
surfaces retain confirmation and fresh-state validation. Explicit exclusions
prevent a generic "apply all" path from weakening a safer individual workflow.

## Verification

`collection-surface-registry-test.ts` inventories native and shared search
inputs, proves one-to-one control and Regex Builder bindings, checks invalid
regex passthrough, and requires every audited bulk manager to be implemented or
explicitly excluded with a safety rationale. `filter-mode-surfaces-test.tsx`
and `diff-search-input-test.tsx` cover mode controls, case behavior, and builder
application. `regex-builder-v2-style-test.ts` and
`floating-surface-style-test.ts` guard the builder's accessible views and
compact-window reachability.
