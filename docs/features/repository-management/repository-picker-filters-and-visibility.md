# Repository picker filters and visibility

The repository side sheet combines text search with account, provider, and
status filters so a large local workspace can be narrowed without changing its
saved repository list.

## Behavior

- The entire account, service, status, text-search, and regex-control area opens
  from one keyboard-reachable **Filters** disclosure. It starts collapsed so
  the repository list and its Add, Select, and More actions get the side
  sheet's scarce vertical space.
- The disclosure uses `aria-expanded` and `aria-controls` against the real
  filter panel. Collapsing does not unmount the controls, clear a query, change
  regex mode, or reset a selected scope. When filters are active, the compact
  button shows their count even while their controls are folded away. If the
  portalled Regex Builder is open, collapsing dismisses it and leaves focus on
  the disclosure so the builder never floats apart from a hidden search field.
- The three actions share the 390 px row equally. Bilingual label pairs stack
  inside their button, preserving one compact strip without clipping or
  overflow.
- **Clean**, **Changed**, **Ahead**, **Behind**, and **Missing / cloning** are
  toggle chips. Active status chips use OR semantics with one another and AND
  semantics with the text, account, and service filters. **All** clears the
  status selection.
- Clean means the repository has no uncommitted files. Ahead and behind are
  independent, so a clean repository can also match either synchronization
  status.
- **Hide repository** is available from a saved repository's context menu.
  Hidden repositories stay saved, retain their pin and group metadata, and are
  omitted from every duplicate group in the picker.
- When at least one saved repository is hidden, **Show hidden (N)** remains in
  the filter area even if no rows match. Recovered rows carry a **Hidden** badge
  and expose **Unhide repository** from the same context menu.

## Persistence and configuration

Hidden repository ids are stored on the local installation with the same
renderer-storage pattern used by repository pinning. They do not roam between
machines. The filter panel starts collapsed whenever the picker is recreated;
status filters and the temporary **Show hidden** state also reset then. Hiding
does not remove a repository from Desktop Material or alter files, Git refs,
remotes, pins, or custom groups.

## Failure modes and security

Malformed or duplicate persisted ids are ignored or normalized, and a tampered
list is capped at 5,000 stable ids. A stale id for a repository that is no
longer saved is not counted in the recovery control. Repositories still being
cloned cannot be hidden because their ids are temporary; they remain
discoverable through **Missing / cloning**.

Visibility is a local presentation choice only. It does not change provider
permissions, transmit repository metadata, or suppress background Git work.

## Verification

Focused tests cover the collapsed-by-default panel, its ARIA relationship, the
always-visible action row, state retention across collapse and expansion,
anchored Regex Builder dismissal and disclosure focus on collapse,
status classification and OR composition, hidden rows in pinned and ordinary
groups, persistence repair, context-menu reversibility, accessible pressed
states, the always-reachable recovery control, bilingual narrow-row bounds,
and compact chip wrapping/focus styling.
