# Repository path browser and quoted paste

The terminal edition's **Open repository**, **Create repository**, and **Clone
repository** dialogs
combine a real editable path field with a terminal-native folder browser. A
user can paste or type a path, or click through directories without leaving the
TUI.

## Behavior

- **Browse** expands a folder-only `DirectoryTree` below the path field.
- Clicking a directory copies its absolute path into the editable field.
- **Up** reloads the tree at the current root's parent; **Home** returns to the
  current operating-system user's home directory.
- **Hide** collapses the tree without discarding the selected or typed path.
- The Open/Create action and Enter submit the same normalized field value.
- Escape and Cancel dismiss the dialog without opening, creating, or changing
  a repository.
- Clone initially selects the process's current working directory as its parent
  folder; **Working** returns to that exact launch directory after browsing
  elsewhere.

The browser begins at the nearest existing directory represented by the field.
For a not-yet-created path, it walks up to an existing parent. Empty input starts
at the current directory. If resolving or inspecting a non-empty value fails,
the browser falls back to the user's home directory and then the current
directory. The folder tree intentionally hides files because a Git working tree
is a directory.

The path field remains the authoritative control. This keeps network mounts,
WSL paths, alternate Windows drives, and paths that cannot be enumerated by the
current terminal session reachable through direct entry.

## Quoted paste

File managers, terminals, and shell copy commands commonly place matching
quotes around paths that contain spaces. Bracketed terminal paste and Textual's
clipboard paste remove exactly one matching outer ASCII quote pair immediately:

| Pasted text | Field value |
| --- | --- |
| `"/home/me/My repository"` | `/home/me/My repository` |
| `'C:\Users\me\My repository'` | `C:\Users\me\My repository` |
| `"/home/me/repo's files"` | `/home/me/repo's files` |

Only the first line of a multiline paste is accepted as the path. Whitespace
outside the wrapper is trimmed. Internal quotes, unmatched quotes, mismatched
quote types, and a structured `Path` supplied by application code are
preserved. The parser does not call a shell, interpret escapes, expand
environment variables, or execute substitutions. Tilde expansion and absolute
resolution happen only at the existing path boundary.

Submission normalizes the value again, so typed wrapper quotes and terminals
without bracketed-paste reporting receive the same safe result.

## Configuration

There is no separate browser preference. The browser follows the persisted
language mode and uses English, playful Hong Kong-style Cantonese, or compact
bilingual labels. It follows the active theme, density, accent, and focus
treatment. Mouse use is optional: Tab, Shift+Tab, arrows, Enter, Space, and
Escape expose the same workflow.

## Failure modes

| Condition | Result |
| --- | --- |
| folder cannot be enumerated | the editable path remains available; choose a reachable parent or type the path |
| selected path is not a Git working tree | Open is refused and the existing non-blocking error notification names the failure |
| Create targets an existing non-empty non-repository folder | Git's argv-safe initialization result is reported without deleting content |
| pasted text has unmatched or internal quotes | those quotes remain literal instead of being guessed away |
| a path disappears between selection and Open | repository validation fails; no fallback directory is opened silently |

## Security and accessibility

Browsing reads directory metadata only. It does not launch a native graphical
picker, invoke a shell, follow a URL, or mutate the selected folder. Opening a
path resolves it and then passes it through the same Git top-level validation
used by typed and CLI paths.

The field, tree, toolbar controls, and actions have stable focus order, visible
focus treatment, localized labels, and mouse hit targets. The browser region
scrolls within a viewport-bounded modal so the action buttons remain on-screen
at supported terminal sizes.

## Verification

Focused pure tests cover POSIX and Windows paths, outside whitespace, matching,
unmatched, mismatched, and internal quotes, tilde expansion, structured `Path`
values, and repository-service wiring. Textual Pilot coverage exercises
keyboard and mouse opening, directory selection, Home/Up navigation, immediate
bracketed-paste normalization, clipboard paste, submission, cancellation, and
narrow geometry.

The current
[revival verification record](../../verification/linux-tui-revival-2026-08-02/run-manifest.md)
owns the packaged-wheel Clone/current-directory and browser acceptance. The
[July 27 record](../../verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md)
remains historical evidence for the earlier Open/Create implementation. Unit
tests alone are not presented as visual evidence.
