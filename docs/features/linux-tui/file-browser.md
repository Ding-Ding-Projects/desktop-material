# Repository file browser

The **Files** workspace tab is a first-class, terminal-native browser for the
active repository. It lists the real working tree, filters paths locally, shows
a bounded preview, and opens the selected file in the configured external
editor. It is not a sample tree and never invents files.

## Behavior

* The table follows the active repository and refreshes whenever repository
  context changes.
* Literal search is the default. Fuzzy search and explicit RE2 search use the
  same bounded `SearchBar` contract as other collections, with the full regex
  builder attached to this field rather than hidden in a global dialog.
* Hidden files are excluded by default and can be included deliberately.
* Directories and files sort predictably; `.git` is always excluded.
* Selecting a UTF-8 text file loads a read-only preview of at most 256 KiB.
* Binary, non-UTF-8, oversized, unreadable, and vanished files receive a
  factual summary instead of raw control bytes or a guessed decoding.
* **Open in editor** resolves the path again, proves that the final target is
  still inside the active repository, and launches the configured editor with
  the repository as its workspace root.

The table and preview reflow at narrow widths. Both remain scrollable and
keyboard reachable; changing terminal size does not move the selection to a
different file silently.

## Configuration

The Files tab uses the app's persisted theme, density, accent, language, search
mode, and external-editor preference. Hidden-file visibility is a local control
for the current view. Editor discovery includes configured commands and the
supported installed-editor catalog; a missing editor produces a non-blocking
recovery notice.

## Failure modes

<!-- markdownlint-disable MD013 -->

| Condition | Result |
| --- | --- |
| repository contains more than 20,000 entries | enumeration stops at the documented bound and reports that the list is incomplete |
| selected path leaves the repository through a symbolic link | preview and editor launch are refused |
| selected file exceeds 256 KiB | metadata is shown without loading the entire file |
| file is binary or invalid UTF-8 | a safe binary summary replaces raw bytes |
| file changes or disappears after selection | the action revalidates it and reports the current failure |
| editor is missing | the repository remains open and a non-blocking notice points to Settings |

<!-- markdownlint-enable MD013 -->

## Security and accessibility

Enumeration is local and repository confined. It never reads `.git`, follows a
resolved target outside the working tree, invokes a shell, sends content to a
provider, or persists preview text. Path and byte bounds protect memory and
terminal rendering. The query, hidden toggle, table, preview, and editor action
have stable names, focus states, keyboard paths, and mouse targets.

## Verification

Application tests cover ordering, hidden files, the entry cap, symbolic-link
escape, UTF-8 preview, binary and oversized files, and disappeared paths.
Textual Pilot tests cover search modes, selection, preview, active-repository
rebinding, external-editor arguments, and narrow geometry. The
[August 2 revival manifest](../../verification/linux-tui-revival-2026-08-02/run-manifest.md)
records the packaged-wheel Files interaction and screenshot evidence.

## Suggested articles

* [Repository path browser and quoted paste](repository-path-browser.md)
* [External editor and local version history](external-editor-and-version-history.md)
* [Search and RE2](search-and-regex.md)
* [Security and failure modes](security-and-failure-modes.md)
