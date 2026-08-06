# Settings tab docking

Repository Settings and application Settings use the same browser-style tab
strip. The strip can be docked on the **left**, **top**, **bottom**, or
**right** of its content. **Left** is the compiled-in default so existing
profiles keep their established layout.

## Behavior

Each surface has its own placement: Preferences and Repository Settings do not
share a position. Changing the **Settings tab position** control applies the
layout immediately and saves it in the renderer profile. Top and bottom docks
use a horizontal, scrollable tab strip; left and right docks use the vertical
strip. The strip keeps its existing search, overflow, pinning, selection, and
keyboard behavior in every orientation. Arrow keys follow the dock: Left/Right
for a horizontal strip and Up/Down for a vertical strip.

The control remains visible on the settings rail and is keyboard reachable. Its
description explains that the two surfaces save separately and that missing or
invalid stored values fall back to Left.

## Configuration

The renderer stores the two values under these local-storage keys:

| Surface | Key |
| --- | --- |
| Preferences | `settings-tab-dock-position.preferences` |
| Repository Settings | `settings-tab-dock-position.repository-settings` |

Valid values are `left`, `top`, `bottom`, and `right`. The value is a layout
preference only; it does not change which settings are enabled or which
repository data is edited.

## Failure modes

- A missing key uses `left`.
- An unknown or malformed value uses `left` rather than guessing a nearby
  placement.
- If renderer storage refuses a read or write, the current surface continues
  to work. A failed write affects persistence only and does not block changing
  the layout for the open dialog.
- A narrow dialog keeps the selected side where possible. Top and bottom remain
  horizontal, while left and right keep a compact vertical rail so the user's
  choice is not silently discarded.

## Security considerations

The preference contains no repository path, account token, credential, or
remote data. It is bounded to a four-value allowlist before it is read or
written. Invalid renderer storage is treated as untrusted input and cannot
inject CSS or change a repository operation.

## Verification

Focused coverage verifies the left default, independent persistence for both
surfaces, invalid-value fallback, all four control options, horizontal tablist
semantics, and orientation-specific keyboard navigation. The responsive style
contracts also assert that compact layouts preserve the selected dock.

## Suggested articles

- [Settings search](settings-search.md) — search settings pages and jump to a
  matching control.
- [Tab-strip overflow dropdown](tab-overflow-dropdown.md) — reach pages that
  do not fit in the active strip.
- [Owner-scoped appearance and history](owner-scoped-appearance-and-history.md)
  — customize the settings surface and audit its changes.
