# TUI external editor and local version history

> **Historical prototype record:** This page preserves the July 27, 2026 TUI
> experiment. It is not current supported-product guidance or a Windows-release
> blocker.

## External editor and terminal

Settings includes editable editor and terminal command preferences plus editor
detection. The toolbar's Editor action opens the active repository with the
chosen program. The Advanced pane's **Open terminal** action launches the saved
terminal command, or an auto-detected Linux terminal, in the active repository
or a validated child working directory.

Editor and terminal preferences are parsed as commands plus fixed arguments and
launched as argv sequences, not through `sh -c`. Newline, NUL, shell operators,
and shell-wrapper commands are rejected at the relevant boundary. Detection is
a convenience, not trust: review a custom executable before saving it.

If no editor is found, the TUI leaves repository state unchanged and displays a
clear notice. A terminal program that requires a graphical display can fail on a
headless host; choose a console-capable alternative.

Current scope is one global preference. Per-repository overrides, a complete
cross-platform editor catalog, exact file/line actions, remote SSH working
copies, and Windows/WSL bridge behavior are not claimed.

## Local Git-backed settings versions

The terminal edition owns a separate repository beneath:

```text
$XDG_DATA_HOME/desktop-material-tui/profile-history/<profile-id>
```

or `~/.local/share/...` when `XDG_DATA_HOME` is unset. This repository is never
placed inside the user's working copy and is never pushed unless a future user
action explicitly exports it.

A complete snapshot contains settings and profile metadata. The service can:

- record a labeled revision;
- list bounded revision history;
- read a selected revision;
- show a diff between two revisions;
- restore a selected snapshot by creating a new audit revision.

Restore does not rewrite or delete the old commits. The history repository uses
its own advisory lock and bounded, no-shell Git calls.

## Retention and export

The first preview exposes history operations but does not yet ship a polished
retention/pruning/export panel. Until it does:

- back up the complete profile-history directory while the TUI is closed;
- do not run arbitrary Git cleanup in that directory;
- do not copy it into a project repository or publish it automatically;
- treat diffs as potentially private because preferences can include local paths
  and program names.

A missing or damaged history repository does not authorize modifying the user's
project. Recover it from a backup or start a new app-owned history after
preserving the old directory for inspection.
