# Repository list bulk actions

The repository side sheet keeps its frequent workspace actions on one compact
44 px row: **Add**, **Select**, and **More**. **More** contains repository-group
creation, workspace sync, and commit/push-all so the narrow sheet does not turn
five equal-weight pills into a three-line block. **Select** turns on a checkbox
per row and a contextual selection bar that can fetch, pull, favorite, group,
or forget several saved repositories in one reviewed pass.

## Behavior and configuration

- **Select all visible** covers exactly the rows the active filter is showing.
  The text filter, its match mode and case setting, the account and service
  selects, the status chips, and the hidden-row toggle all narrow that set. Rows
  that a filter is hiding are never selected or deselected, so an existing
  selection survives a filter change, and the checkbox shows an indeterminate
  state while only part of the visible set is selected.
- Pinned and Recent repeat a repository in a second group. The selection is
  keyed by repository id, so a repeated row is counted once.
- Clicking a row while multi-select is on toggles that row instead of switching
  the app to that repository, which keeps the side sheet open while reviewing.
- **Escape** and **Clear** both leave multi-select and drop the selection.
  Escape unwinds the removal confirmation first.
- The compact row remains keyboard reachable. Add and More expose
  `aria-haspopup="menu"` and deterministic localized names; Select preserves
  its pressed state while multi-select is active.
- **Fetch** and **Pull** run the selection through the existing reviewed batch
  sync, one repository at a time. **Favorite / Unfavorite**, **Assign to
  group / Remove from group**, and **Remove from list** apply immediately and
  report a count.
- The group field completes from the custom group names already in use. Assign
  is unavailable until a name is entered; Remove from group clears the name.
- Cloning rows and submodule rows are never selectable. A cloning row's id is
  temporary and a submodule cannot be removed from the list at all.

There is no persisted configuration. Multi-select, the selection, and the group
draft are transient component state; the mode resets when the picker is
recreated.

## Progress, cancellation, and reporting

Fetch and pull show a determinate progress row: an `N/M` counter, a
`role="progressbar"` track whose `aria-valuenow` is the completed count, and a
per-repository table of Repository, Status, and Detail. Each row moves from
Waiting to Working to Done, Failed, or Skipped.

**Cancel** stops the batch *between* repositories. The repository already in
flight always finishes its Git work; the rest are reported as **Not started**.
The final summary states how many completed, failed, were skipped, and never
started. Failure and detail text is sanitized before it is displayed: absolute
Windows, UNC, and POSIX paths become `<path>`, URL credentials and provider
tokens become `<redacted>`, whitespace is collapsed, and anything longer than
200 characters is elided.

## Failure modes and recovery

Each repository is submitted as its own reviewed single-repository batch, so the
store revalidates the id against the live persisted inventory before doing any
work. A repository removed between review and execution is reported as skipped
for that row only, and the remaining rows continue. The existing per-repository
pull review still applies unchanged: a missing repository, a missing remote, a
detached or unborn branch, a branch without an upstream, and an already-running
network operation are each skipped with their own reason. Authentication and
network failures affect only their own row.

A failed favorite or group change reports its sanitized reason instead of a
count. Selections for repositories that are no longer saved are pruned
automatically.

## Security considerations

Only bounded numeric repository ids cross into the store, and only through
`syncRepositories`, `changeRepositoryGroupName`, and `removeRepository`. No
remote URL, refspec, credential, or raw Git argument is assembled here.

**Remove from list is not a delete.** It is confirmation gated behind an
`alertdialog` that names every repository that will be removed and states that
nothing on disk is deleted. The bulk path always passes `moveToTrash: false`
and has no access to the move-to-trash or force-delete routes; a source
assertion in the collection-surface contract test enforces that. Single
repository removal keeps its own dialog, including the on-disk options.

## Verification

`repository-bulk-selection-test.ts` proves the selection state machine:
filter-aware select-all, deselect, the indeterminate and all-selected
predicates, dedupe, prune, and the Escape/Clear exit.
`bulk-repository-runner-test.ts` proves the determinate progression, strict
one-at-a-time execution, partial failure, skip versus failure, cancel between
items with the in-flight repository finishing, and every sanitizer rule.
`ui/repository-bulk-actions-test.tsx` renders the selection bar, progress row,
and removal confirmation, and pins the registered operations, the English and
Cantonese key parity, and the plain destructive copy.
`ui/repositories-list-actions-test.tsx` pins the compact row's accessible
controls and proves that group, sync, and commit/push actions remain reachable
through the More menu. `repository-list-filter-style-test.ts` requires the
single-row layout and 44 px minimum target height.
`collection-surface-registry-test.ts` requires each registered operation to
exist in the implementing source and asserts the removal safety exclusion.
