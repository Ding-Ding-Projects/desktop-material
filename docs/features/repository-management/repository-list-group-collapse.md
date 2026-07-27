# Repository list collapsible groups

The repository side sheet has always grouped rows — `Pinned`, `Recent`, a custom
group name, one heading per GitHub owner, one per Enterprise host, and `Other`
for everything ungrouped. Every group was permanently open, so a workspace with
thirty repositories spread over eight groups meant scrolling past seven groups
you were not looking at to reach the eighth.

Each group heading is now a disclosure control. Fold a group away and it stays
folded across restarts, because the collapsed set is an ordinary profile setting
with a readable diff and an undo entry in Settings history.

## Behaviour

### The heading is the control

`renderGroupHeader` in `app/src/ui/repositories-list/repositories-list.tsx`
renders a real `<button>` carrying the group label, a chevron, and — when the
group is folded — the exact number of repositories inside it.

- **Pointer**: click anywhere on the heading row. The button fills its whole
  36px virtualized slot, so the target is the row, not the glyph.
- **Keyboard**: <kbd>Enter</kbd> and <kbd>Space</kbd> toggle it. Both are
  handled explicitly and call `preventDefault()`, which suppresses the button's
  own synthesized click; without that, one press would toggle twice and land the
  group exactly where it started.

A folded group keeps saying what it is holding: the count pill is painted
beside the label, and the same count is in the accessible name.

### Virtualization

The list is a `SectionFilterList` over a `SectionList`, and both derive section
heights, row indices, and total scroll extent from one row model built in
`createStateUpdate` (`app/src/ui/lib/section-filter-list.tsx`). Collapsing is
therefore applied **while that model is built**, not while rows are painted:

```
groupRows = [header]                 // collapsed
groupRows = [header, ...itemRows]    // expanded
```

A folded group contributes exactly one row. There is no such thing as a hidden
row that could leave a phantom slot behind, `rowCount` and the per-row heights
stay consistent by construction, and the scroll extent shrinks and grows with
the model rather than drifting away from it.

Two consequences are deliberate:

- A group that renders **no** header (`showHeader === false`, or a list with no
  `renderGroupHeader`) is never collapsed. The header is the only control that
  reopens a group, so folding a headerless one would delete it from the list
  with no way back.
- Rows inside a folded group are not "visible" for any purpose. Select-all in
  bulk-selection mode, which is fed by `onVisibleItemsChanged`, therefore selects
  what is on screen rather than silently including rows the user folded away.

### A filter match is never swallowed

**While a text filter is active, no group renders folded.** That is the whole of
the rule, implemented in one place — `isRepositoryGroupCollapsed` in
`app/src/lib/stores/repository-group-collapse.ts` returns `false` whenever
`filterActive` is true.

The alternative considered was counting the matches hidden behind folds and
warning about them. It was rejected: it leaves the user's search result behind a
second interaction, and any bug in the counting turns straight back into a
silently swallowed hit. Auto-expansion has no such failure mode — the match is
simply on screen.

The persisted set is not touched, so clearing the filter restores exactly the
folds the user made. Because a folded group with no matches is dropped from the
model entirely (it has no items left), auto-expansion is only ever observable on
groups that really do contain a hit.

The list also says so out loud. `renderAutoExpandedGroupsNotice` paints a
`role="status"` line — *"Filtering opened 1 collapsed group so none of its
matches can hide."* — counted from the groups the filter actually left on
screen, reported by `onFilteredGroupsChanged`. A folded group with no matches is
never claimed to have been expanded.

### Edge states

| Case | Behaviour |
| --- | --- |
| Every member filtered out | The group is dropped from the model — no header, no phantom row, and it is not counted as auto-expanded. |
| Single member | The heading reads `…, 1 repository, …`; the singular is a separate resource, not a stripped `s`. |
| Ungrouped repositories | They live in `Other` and fold like any other group. |
| Cloning rows | A `CloningRepository` is an ordinary member of `Other`: it counts toward the member count and folds with the group. |
| Every group folded | The list renders headers only. It is not an empty list, so the "can't find that repository" blankslate is not shown. |
| Selected repository folded away | The row selection becomes empty; the app-wide repository selection is untouched, and re-expanding restores the row. |

## Persistence

The collapsed set is stored under the localStorage key
`repository-list-collapsed-groups` as a JSON array of **group keys** — the
values `getGroupKey` produces (`5:other`, `2:custom:clients`,
`3:dotcom:octocat`, `4:enterprise:ghe.example.com`). Nothing about a user's own
repository is written anywhere; in particular **no value is ever written into a
user's `.git/config` or working tree.**

That key is registered in
`app/src/lib/profiles/profile-settings-registry.ts`:

```ts
{ key: 'repository-list-collapsed-groups', label: 'collapsed repository groups' }
```

Registration is what routes this through the app's own Git-backed profile store
rather than leaving it as an invisible local preference:

1. `RepositoriesList.toggleGroupCollapsed` writes the set and calls
   `Dispatcher.recordRepositoryGroupCollapseChange()`.
2. That calls `ProfileStore.onAppStateChanged()`, which debounces
   (`SettingsDebounceMs`, 1s), snapshots every registered key
   (`captureSettingsSnapshot`), and describes what moved
   (`describeSettingsChange` → *"Change collapsed repository groups"*).
3. The description is handed to the profile's `ProfileCommitQueue`, which
   debounces again and composes one message with
   `composeProfileCommitMessage` before committing `settings.json` into the
   profile repository under `userData/profiles/<profile>`.

So the fold shows up in **Settings → History** as a normal entry with a real
`settings.json` diff, and `undoLastSettingsChange` / `redoLastSettingsChange` /
`restoreSettingsTo` (the buttons in
`app/src/ui/settings-history/settings-history-dialog.tsx`) move the folds back
and forward like any other setting. Undoing the first fold removes the key
entirely and every group reopens.

### Write cadence: bursts collapse into one entry

Collapsing is a fiddly, repeated interaction. One commit per press would bury
the rest of the settings history under folding noise.

No new debounce was invented for this. Both existing debounces in the
settings-persistence path already coalesce, and this feature simply rides them —
the same shape as the burst-safe appearance editors, which pass
`commitDelayMs` into `DedicatedSettingStore`:

- `onAppStateChanged` **restarts** its timer on every call, so a run of presses
  produces one snapshot capture at the end of the run.
- All folds live in **one** registered key, so that capture produces exactly one
  description no matter how many groups moved.
- `ProfileCommitQueue` debounces and concatenates whatever descriptions arrive
  in its window into a single commit.

Five folds in a row are therefore one history entry, and a separate burst later
is its own entry. Both are asserted in
`app/test/unit/repository-group-collapse-history-test.ts`.

The write to localStorage itself is synchronous and immediate, so a crash
between the fold and the debounced commit loses at most the history entry, never
the fold.

### Repairing a bad stored value

`getCollapsedRepositoryGroups` never trusts what it reads. Non-strings, blanks,
duplicates, keys longer than 512 characters, and anything past
`MaximumCollapsedRepositoryGroups` (500) are dropped, and the survivors are
sorted. Sorting is not cosmetic: it is what makes the `settings.json` diff a
user reads in Settings history show *which* group changed rather than the order
in which groups happened to be pressed.

## Accessibility

- The heading button carries `aria-expanded` and `aria-controls`. The
  `aria-controls` target is a real element: `SectionFilterList` passes
  `getSectionId` down to `SectionList`, which puts that id on the section's own
  row container. The id is derived injectively from the group key
  (`repositoryGroupRowsId`), escaping every character outside `[A-Za-z0-9-]` as
  `_<hex>_` because an IDREF cannot hold the spaces, colons, and dots that owner
  logins, hosts, and user-chosen group names can.
- The row `aria-label` in this list replaces the row's inner text for assistive
  technology. Group header rows deliberately get **no** row-level `aria-label`
  (`getRowAriaLabel` returns `undefined` for non-item rows), so the button's own
  `aria-label` is what is announced: `Other, 4 repositories, collapsed`. The
  chevron and the count pill are `aria-hidden` decoration; every fact they carry
  is in that sentence.
- Focus is visible: a 2px `--md-sys-color-primary` `:focus-visible` outline
  inset into the row.
- The chevron rotation is a `transform` transition, disabled both by the global
  `prefers-reduced-motion` rule and by an explicit rule at the component.

## Languages and funny level

Both required languages, both per-language funny levels:

| Level | English (collapsed) | Cantonese (collapsed) |
| --- | --- | --- |
| 1–2 | `Other, 4 repositories, collapsed` | `Other，4 個 repo，已摺埋` |
| 3 | `Other, 4 repositories, currently folded away` | `Other，4 個 repo，而家摺埋咗` |
| 4–5 | `Other, 4 repositories, folded up and hiding` | `Other，4 個 repo，摺埋晒匿咗喺入面` |

The playfulness moves the voice only. The group name and the member count are
interpolated identically into every band, in both languages — a test asserts the
exact count survives all five levels in both. The accessible name resolves to
the language mode's *primary* language rather than being stitched bilingually,
because a name is spoken once and a bilingual one would announce the count
twice.

The visible auto-expansion notice is different: it is read, not spoken once, so
it is built as per-language segments (`getAutoExpandedGroupsSegments`) exactly
like the row's sync line. Bilingual mode paints both, each `lang`-tagged and
each banded by **its own** funny level — English serious and Cantonese maximum
renders precisely that pair.

## Verification

| Concern | Test |
| --- | --- |
| Storage round-trip, repair, bounds, sorting | `app/test/unit/repository-group-collapse-test.ts` |
| Auto-expand policy and exact auto-expanded count | `app/test/unit/repository-group-collapse-test.ts` |
| Accessible names, count phrases, per-language funny bands, `aria-controls` id injectivity | `app/test/unit/repository-group-collapse-test.ts` |
| Focus visibility, count pill contrast pair, reduced motion | `app/test/unit/repository-group-collapse-test.ts` |
| Item-model row count changes and restores exactly | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| Pointer, <kbd>Enter</kbd>, and <kbd>Space</kbd> toggling | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| Fold survives a remount; `aria-controls` target exists | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| A filter match inside a folded group is **not** hidden | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| Single-member group, cloning row, all-members-filtered-out, all groups folded | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| Bulk "select all visible" excludes folded rows | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| Cantonese announcement and funny-level wording with an unchanged count | `app/test/unit/ui/repositories-list-collapse-test.tsx` |
| Burst coalescing, `settings.json` diff, undo | `app/test/unit/repository-group-collapse-history-test.ts` |

Each behaviour was confirmed to fail without its change: removing the
`filterActive` guard fails the filter-match tests, removing the collapse branch
from `createStateUpdate` fails the row-model tests, and unregistering the
settings key fails every history test.

## Security and privacy

- Only group keys are stored. Repository paths, remote URLs, and account
  identifiers are not.
- The write target is the app's own profile directory under `userData`. Nothing
  is written into a repository the user owns — no `.git/config` value, no file
  in a working tree.
- The persisted value is bounded and re-validated on every read, so a tampered
  or corrupted entry cannot grow the settings snapshot without limit or inject
  an unexpected type into the list.
