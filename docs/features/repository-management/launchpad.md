# Launchpad

Launchpad is the repository workspace for reviewing the items that need
attention first. It groups repository-backed work into **Pinned**, **Ready to
merge**, **Unassigned**, **CI failing**, and **Merge conflicts**, and shows a
truthful count and empty state for every group.

## Behavior

- Select **Launchpad** from the repository rail to open its full-width page.
- Each group is independently collapsible and keeps its count visible while
  empty or populated.
- The view reports when an item was omitted because it does not match a
  Launchpad section instead of silently inventing a row.
- The repository shell does not reserve a sidebar while Launchpad is active;
  the page owns the available workspace width.
- The current implementation provides the local model, bounded preferences,
  accessible grouping, and navigation shell. Live provider adapters and
  provider-backed actions remain future work.

## Configuration

Launchpad uses the active repository and the app's persisted repository-view
preferences. No credentials or provider tokens are stored in the Launchpad
view. Empty groups are normal when the repository has no matching work.

## Failure modes

- A repository with no matching items shows five zero-count groups and an
  explicit empty-state sentence.
- An item that cannot be classified is omitted with a visible explanation;
  it is not placed in a misleading group.
- If a future provider adapter cannot refresh, the adapter must retain the
  last verified result and expose the refresh failure as a non-blocking
  notification rather than replacing the page with a blank surface.
- A blank rectangle beside the groups indicates a navigation-shell regression:
  Launchpad must render full-width because its sidebar body is intentionally
  empty.

## Security considerations

The view is read-only until provider-backed actions are connected. Classification
must use repository/provider metadata already authorized for the active account;
it must not broaden scopes, scrape unrelated repositories, or persist access
tokens in renderer state. Future actions must keep destructive or externally
mutating work behind the app's existing reviewed confirmation and audit paths.

## Verification

- `app/test/unit/repository-section-navigation-test.ts` verifies both halves of
  the full-width contract: Launchpad has no sidebar content and the shell does
  not mount the sidebar container.
- The exact development production build is run before hidden-desktop capture.
- Acceptance captures use a disposable Git repository with one committed file
  and one untracked work-in-progress file, so the empty Launchpad state is
  reproducible without a provider account.
- The promoted frame is
  `docs/assets/screenshots/material-launchpad-empty-full-width-20260806.png`
  at 960x660, 58,370 bytes, SHA-256
  `4B7A673ED99D67023A67C19E524C4B43BDE22E7496295819A6C721E13732453C`.

## Suggested articles

- [Repository list bulk actions](repository-list-bulk-actions.md) — manage
  several repository rows after discovering them.
- [Custom repository group management](repository-group-management.md) —
  organize repositories without changing their on-disk content.
- [Advanced history discovery](advanced-history-discovery.md) — inspect the
  commit context behind repository work.
