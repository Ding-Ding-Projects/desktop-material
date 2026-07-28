# No-op renderer update suppression

## Behavior

Changes and History share compare-form state. Selecting either repository
section used to send `showBranchList: false` after every section change, even
when the branch list was already closed. The store then merged the identical
value, emitted a global update, and made the root React tree render a second
time for one click.

Section navigation now dispatches the close request only while the branch list
is actually open. `AppStore` also checks partial compare-form updates against
the current values and returns without mutating or emitting when every supplied
field is identical. The store boundary protects keyboard, focus, and future
callers in addition to the navigation rail.

The semantic behavior is unchanged: an open branch list still closes when the
user leaves it, and real filter or visibility changes still update immediately.

## Configuration

There is no setting. Suppression is automatic and applies only when
`filterText` and/or `showBranchList` are exactly unchanged.

## Failure modes

- New compare-form fields must be added to
  `compareFormUpdateChangesState`; otherwise the equality helper will not know
  that the field is meaningful.
- This removes redundant renderer work. It does not cache real Git data or
  suppress a state update whose visible value changed.

## Security considerations

The check compares local UI state only. It does not inspect repository content,
credentials, remote URLs, or network responses, and it cannot suppress a Git
operation.

## Verification

The exact released build for
`9bdfdb8b25e458e4834bdaa26473d44a5602621d` was exercised through Lowlevel MCP
on an off-screen Win32 desktop. Its idle workspace held 122 sampled frames at
an average 16.51 ms with no frame over 25 ms, while twelve warmed
Changes/History switches measured 56–104 ms and generated six 59–67 ms long
tasks. A single Changes click produced 166 DOM mutation records and a 104 ms
event duration.

`compare-form-update-test.ts` proves identical and empty updates are rejected
while both meaningful fields still update. The focused responsiveness,
progressive-loading, lifecycle, and navigation gate passes 42/42.

Post-fix built-app timing is recorded in
`docs/verification/renderer-responsiveness-2026-07-28/` when the exact release
is available.
