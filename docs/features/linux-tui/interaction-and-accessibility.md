# TUI interaction and accessibility

> **Historical prototype record:** This page preserves the July 27, 2026 TUI
> experiment. It is not current supported-product guidance or a Windows-release
> blocker.

<!-- markdownlint-disable MD013 -->

## Mouse interaction

Mouse support is enabled when the application starts. In a compatible terminal,
a user can:

- click repository rows and repository tabs;
- click workspace tabs such as Changes, History, GitHub, Regex, and Settings;
- click buttons for open, clone, create, stage, commit, fetch, pull, push,
  branch, stash, worktree, submodule, sparse-checkout, build/run, GitHub, and
  notification actions;
- expand the Open/Create folder browser, navigate Home or Up, and click a
  directory to place its path in the editable repository field;
- click list, selection-list, table, checkbox, and select control rows;
- place the caret in single-line and multiline text fields;
- drag text selection where the terminal and widget allow it;
- use the wheel over scrollable panes and text areas.

Terminal multiplexers must pass mouse reporting through. In tmux, this normally
means `set -g mouse on`. Holding the terminal emulator's selection modifier
(often Shift) may intentionally bypass application mouse handling so terminal
text can be copied.

## Text boxes

The TUI uses actual editable controls rather than simulating form entry with
single-key prompts:

| User data                                                          | Control                               |
| ------------------------------------------------------------------ | ------------------------------------- |
| repository path, clone URL, branch/stash name, search query       | single-line `Input`                   |
| worktree path/branch, submodule path, build/run/shell command     | single-line `Input`                   |
| commit summary                                                     | bounded single-line `Input`           |
| commit body, diff detail, issue/PR body, API payload, regex sample | multiline `TextArea`                  |
| theme, density, accent, language, search mode, flags               | `Select`, checkbox, or selection list |

Click a text control or reach it with Tab, type normally, use arrow keys to move
the caret, Backspace/Delete to edit, and Ctrl+A/C/X/V where the terminal exposes
those sequences. Multiline commit and provider bodies keep Enter for a newline;
the surrounding action is a separate button so text entry never submits by
accident.

Repository path inputs remove one matching outer single- or double-quote pair
from pasted text immediately and normalize once more on submission. They do
not evaluate shell syntax or remove internal, unmatched, or mismatched quotes.
The [repository path browser guide](repository-path-browser.md) records the
exact parsing, failure, and security contract.

## Keyboard interaction

Tab and Shift+Tab traverse focusable controls. Enter activates the focused
button or selected row; Space toggles checkboxes and selections. Arrow keys move
within tabs, lists, tables, selects, and text. Escape dismisses a decision
dialog or closes transient choice UI without performing the action.

Global bindings:

| Key          | Action                      |
| ------------ | --------------------------- |
| Ctrl+O       | open repository path dialog |
| Ctrl+P       | command palette             |
| Ctrl+R       | refresh repository          |
| Ctrl+Shift+F | regex builder               |
| F1           | help                        |
| F5           | fetch                       |
| Ctrl+Shift+P | push                        |
| Ctrl+Q       | quit                        |

Terminal and desktop window managers can reserve key combinations. The clickable
control remains the fallback.

## Focus, resizing, and clipping

Focused controls receive a visible focus treatment. The shell switches to
compact layout below 125 columns and narrow layout below 100 columns. Long
tables and details scroll instead of being silently clipped. The acceptance run
must exercise wide, compact, and narrow dimensions plus bilingual copy; a CSS
breakpoint alone is not evidence that every control remains reachable.

The terminal emulator owns cell dimensions, font family, font size, CJK glyph
fallback, zoom, and cursor rendering. The application owns control labels,
logical focus, color roles, borders, responsive placement, and scroll ranges.

## Assistive technology

- Controls use visible text labels and stable focus order; destructive actions
  name the target in a decision dialog.
- Status and errors are emitted as non-blocking notifications and retained in a
  reviewable Notification tab.
- Reduced-motion state persists. Narrator, quiet-hours, reduced-sound, and
  screen-reader-yield preferences are present but speech execution is not yet
  shipped; the parity contract marks narrator behavior partial.
- Color is not the only status signal: change markers, labels, text, and table
  columns carry the same meaning.
- English is the fallback for missing Cantonese copy.

Terminal screen-reader behavior varies by emulator, multiplexer, and platform.
The TUI cannot claim graphical ARIA semantics. Real assistive-technology
acceptance is tracked separately from keyboard and geometry checks and must
remain pending until exercised.

## Known interaction constraints

- Native drag-and-drop of a folder into a terminal is emulator-specific and is
  not claimed.
- Rich image diff, graphical lane, ripple, elevation, and per-pixel animation
  cannot be cloned faithfully in a character-cell interface.
- Some terminals intercept Ctrl+Shift combinations or disable mouse reporting.
- Shell scrollback and application scrolling are separate; use the pane's
  scrollbar/keys while the full-screen application is active.
