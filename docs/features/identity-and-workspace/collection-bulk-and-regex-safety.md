# Collection bulk actions and regex safety

Desktop Material gives collection search fields one shared fuzzy, substring,
and regular-expression contract. A tracked registry maps each real search
input to a stable surface ID and its regex builder. A second registry records
which collection managers support reviewed bulk work and which must remain
one-at-a-time because their topology or recovery requirements differ per item.

## Behavior and configuration

The mode control cycles through fuzzy, contiguous substring, and safe RE2
regular-expression matching. Substring and regex modes can match case. The
Regex Builder starts from the surface's current query and case mode, offers
RE2-compatible token categories, a raw pattern editor, the supported
ignore-case flag, a live tester seeded with up to 50 visible items, and an
explanatory guide. Applying a valid pattern switches that surface to regex mode
and applies the exact same case choice that the preview used.

RE2 supports literals, classes, anchors, quantifiers, capture and non-capture
groups, named captures, and alternation. It deliberately rejects lookaround and
backreferences so evaluation remains linear-time. The tester highlights
matches, counts a bounded set, and shows numbered and named captures from the
first match; empty and unmatched captures are identified explicitly.
Each sample row is evaluated as an independent originating-list candidate, so
anchors retain per-item meaning and a pattern can never bridge two rows. The
global match/capture-work budget is shared across every row. Physical line
breaks therefore separate tester candidates; the palette intentionally omits a
newline chip that could not match in this row-oriented preview.

The Build/guide and token-category tablists use one Tab stop each. The
Build/guide row uses Left/Right, while the token-category rail also accepts
Up/Down for its desktop vertical layout and retains Left/Right for its compact
grid. Home and End jump to either edge; selection and focus move together while
every `aria-controls` target stays mounted and correctly hidden when inactive.

Implemented bulk surfaces retain operation-specific review. Examples include
rerunning completed or cancelling active workflow runs, deleting Actions
caches by key and ref, deleting exact branch tips, syncing selected
repositories, notification actions, publishing or deleting exact releases,
and reviewed tag updates. Submodules, subtrees, stashes, and worktrees are
explicit exclusions because a broad action would bypass their per-item
topology, dirty-state, ordering, or conflict review.

The repository picker is a second repository bulk surface, separate from the
Sync repositories dialog. Its selection is bounded to the filter-visible saved
rows; cloning and submodule rows are excluded because their ids are temporary
or cannot be removed at all. Fetch and pull are submitted one reviewed
single-repository batch at a time so the store revalidates every id and keeps
its per-repository pull review, cancellation only takes effect between
repositories, and removing repositories from the list is confirmation gated and
has no access to the move-to-trash or force-delete paths. See
`docs/features/repository-management/repository-list-bulk-actions.md`.

## Persistence

Each registered list persists only its selected match mode in local UI storage
under its stable surface ID. Case sensitivity, active filter chips, current
query, Regex Builder draft, tester sample, and dialog position remain transient
component state. Bulk actions are explicit user-reviewed requests rather than
a persisted schedule; their owning surface controls any progress or result
retention.

## Failure modes and recovery

An invalid or unsupported regex, or a pattern longer than 1,000 characters,
never crashes the collection. Matching returns the unfiltered candidates with a
localized regex error while the user repairs the expression. An input-size or
aggregate-size limit instead fails closed with no matches, so a compact surface
that does not render the error cannot silently show every item as though its
filter were active; the Actions surface renders that evaluation error directly.
The Regex Builder marks an invalid draft, connects the error to the raw editor,
and disables Apply. Its status chip stays concise, wraps safely, and points to
one detailed alert rather than repeating a long engine message through multiple
live regions. Each candidate/test sample is capped at 100,000 UTF-16 code units,
one list evaluation is capped at 1,000,000 total code units, match
enumeration stops at 5,000, and matcher work is additionally capped at 50,000
capture-group/match slots. Only 24 first-match capture previews are retained,
each with at most 120 UTF-16 code units. Zero-width matches advance in the RE2
matcher and are counted without creating empty highlight boxes.

Diff search keeps literal/fuzzy search available for large minified lines. Raw
regex mode applies the input caps above, while every mode shares one 5,000-hit
operation budget. Zero-width and capture-heavy matches consume that same budget
across every line and side-by-side column even when they cannot create a visible
highlight. The first bounded results remain navigable and the live region
explicitly announces truncation; a limit is never reported as a false "No
results" outcome. An invalid regex submission clears prior highlights instead
of leaving stale results beneath the error.

Notification automation rules saved under the former ECMAScript dialect remain
disarmed after load. A lookaround or backreference rule is visibly marked as
needing review and cannot be armed until the user edits it into safe RE2. Valid
leading and trailing whitespace is preserved when a rule is saved. The
automation-list search exposes the same localized regex error instead of
silently showing an unfiltered list. Duplicate IDs in an imported rules file are
repaired deterministically before id-keyed toggle or remove actions can reach
the model.

Bulk eligibility is rechecked by the owning operation. Ineligible, stale, or
failed items are reported according to that feature's result contract instead
of allowing one broad UI selection to bypass its review boundary. Managers
whose safe common contract is not established remain excluded from bulk work.

## Security considerations

User-authored app patterns are compiled only through the pure-JavaScript RE2
adapter against already loaded display strings; the shared matcher does not
invoke a shell or provider. Linear-time evaluation plus pattern, input,
aggregate, match, and capture bounds prevent regex denial of service in list
filters, diff search/highlighting, Actions run filtering, and
notification-automation title rules. Capture-heavy expressions receive a
compositional work budget rather than multiplying the independent group and
match limits. Stable registry IDs make an unreviewed new search field fail the
source audit until it adopts the same invalid-regex and builder behavior.

The published documentation site is a static web surface and keeps its existing
ECMAScript dialect and supported flag set. Both of its pattern surfaces — the
documentation hub at `/docs/` and the full-text search page at
`/docs/search.html` — share one evaluator and one deadline owner. A reader's
pattern never runs on the page thread: a fresh same-origin Web Worker
(`docs-hub-regex-worker.js`) evaluates each bounded request, the shared runner
in `docs-regex-job.js` terminates that worker at a hard 750 ms deadline from
the page, and worker unavailability fails closed rather than falling back to
the UI thread. Plain text is the default on both surfaces and is matched by
bounded substring scans that compile nothing at all; a regular expression is
treated as a pattern only after the reader opts in. Worker responses retain at
most 24 bounded captures from the first match and bounded match previews, and
the full-text scan returns match *offsets* into a corpus the page already
holds rather than slices of it, preventing structured-clone amplification.
Patterns are capped at 512 characters; the search corpus is capped at 200,000
characters per page, 2,000 pages, and 12,000,000 characters in total, with at
most 500 matches counted per page. No app or documentation search transmits or
persists a pattern or test sample.

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
application, including focus moving into the diff search's portalled builder.
`safe-regex-test.ts`, `match-with-mode-test.ts`,
`notification-automation-test.ts`, and `regex-test-area-test.tsx` cover
catastrophic shapes, invalid/unsupported patterns, Unicode indices, multiline
input, zero-width matches, captures, case behavior, every bound, and the audited
user-pattern call sites. The stress matrix includes 500 capture groups across a
100,000-code-unit sample, dense diff matches, legacy notification rules, and
leading/trailing pattern whitespace. `regex-builder-v2-style-test.ts` and
`floating-surface-style-test.ts` guard the builder's accessible views and
compact-window reachability. `docs-hub-regex-worker-test.mjs` proves bounded
search/highlight results, flags, captures, Unicode zero-width advancement,
invalid input, absence of network APIs, UI-thread fail-closed behavior, and
hard termination of a worker stuck in native backtracking. It also proves a
200-capture, 20,000-character sample produces a compact bounded worker response,
covers the full-text `pages` operation's offsets, per-page and per-corpus
bounds, and zero-width counting, and asserts that neither `docs-hub.js` nor
`docs-search.html` contains a bare `new RegExp(` — the regression guard for the
UI-thread compile that issue #69 reported. `docs-search-page-test.mjs` drives
the real `/docs/search.html` in jsdom against the real worker on a real thread,
covering plain-text default versus regex opt-in, match-case and whole-word
behavior, address round-tripping, index-load failure, worker-absent fail-closed
behavior, the regex builder and snippet buttons, and termination of `^(a+)+$`
against a 20,000-character non-matching page within the 750 ms deadline.
