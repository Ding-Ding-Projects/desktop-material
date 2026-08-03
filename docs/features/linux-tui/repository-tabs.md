# Repository tabs and saved sessions

Desktop Material TUI keeps every open repository in a persistent,
profile-scoped tab session. The compact strip provides immediate switching;
the **Tabs** workspace provides complete search, arrangement, grouping,
visibility, bulk-close, and session-transfer controls when the strip cannot fit
everything.

## Behavior

* Tabs retain a manual order, visible alias, active repository, pin, favourite,
  group membership, and hidden state in the app-owned SQLite database.
* Pinned tabs occupy a protected leading region. Sorting and movement cannot
  silently cross that boundary.
* Named groups retain membership and collapsed state. Collapsing changes the
  projection, not membership or the saved preference.
* The strip calculates a bounded visible projection from the current terminal
  width. Overflowed tabs remain available through the complete Tabs workspace;
  they are never clipped into invisibility.
* Literal, fuzzy, and explicit RE2 searches are local and bounded. Results name
  the repository, group, pin, favourite, and visibility state.
* **Close tabs containing text** and its exact inverse refuse empty or invalid
  patterns, preview the scope and affected count, exclude pinned tabs by
  default, and recheck working-tree changes plus draft commit text immediately
  before closing.
* Closing a tab is session-only. It never deletes a repository, directory,
  branch, commit, or working-tree change.
* JSON export is bounded, versioned, UTF-8, and atomic. Merge import keeps
  existing destination groups; replace import changes only the owned profile
  session after validation.

## Configuration

Tabs are scoped to the active local profile. Their SQLite state lives below the
app's XDG data directory, not inside any user repository. Appearance follows
the terminal theme and density. Desktop-only per-tab font and compositor
effects remain terminal-owned or explicitly incomplete in the parity ledger.

## Failure modes

<!-- markdownlint-disable MD013 -->

| Condition | Result |
| --- | --- |
| empty or invalid bulk-close query | no tab closes; inline validation explains why |
| a candidate is pinned | excluded unless the user deliberately includes pinned tabs |
| working changes or draft commit text appear after preview | that tab is blocked during the final live recheck |
| imported JSON is oversized, malformed, or has the wrong schema | the existing session remains unchanged |
| imported repository path is invalid or duplicated | validation rejects the record before mutation |
| saved repository no longer exists | restoration reports it without substituting another path |
| SQLite write fails | the current live tabs stay usable and the failure is reported truthfully |

<!-- markdownlint-enable MD013 -->

## Security and accessibility

Session operations never invoke a shell or inspect file contents for tab-title
matching. Imports are size- and schema-bounded; exports use an atomic temporary
file beside the selected destination. Tab rows, search, group controls,
move/sort actions, close review, and import/export are keyboard and mouse
reachable with visible focus. Narrow screens use scrolling rather than clipping
controls.

## Verification

Application tests cover persistence, group boundaries, pin order, collapse,
search modes, overflow, import merge/replace, invalid input, and close safety.
Textual Pilot coverage exercises real controls at wide and narrow sizes. The
[August 2 revival manifest](../../verification/linux-tui-revival-2026-08-02/run-manifest.md)
owns packaged-wheel tab switching and responsive evidence.

## Suggested articles

* [Repositories and Git](repositories-and-git.md)
* [Search and RE2](search-and-regex.md)
* [Repository file browser](file-browser.md)
* [Architecture and XDG persistence](architecture-and-persistence.md)
