# TUI architecture and XDG persistence

> **Historical prototype record:** This page preserves the July 27, 2026 TUI
> experiment. It is not current supported-product guidance or a Windows-release
> blocker.

<!-- markdownlint-disable MD013 -->

## Runtime boundaries

The terminal edition separates:

1. Textual widgets and screens under `ui/`;
2. workflow facades under `application/`;
3. immutable domain models and ports under `domain/`;
4. Git, GitHub CLI, SQLite, XDG, locking, and history adapters under
   `infrastructure/`.

Widgets do not assemble shell command strings. Git and `gh` adapters receive
argument arrays, run without a shell, apply timeouts, and return typed results
or typed errors. Blocking repository and provider work runs off the Textual UI
loop.

## XDG locations

With default Linux environment variables:

| Data                         | Default path                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| TOML configuration           | `~/.config/desktop-material-tui/config.toml`                       |
| SQLite data                  | `~/.local/share/desktop-material-tui/desktop-material-tui.sqlite3` |
| profile history repositories | `~/.local/share/desktop-material-tui/profile-history/`             |
| locks                        | `~/.local/state/desktop-material-tui/locks/`                       |
| fallback runtime files       | `~/.local/state/desktop-material-tui/run/`                         |
| cache                        | `~/.cache/desktop-material-tui/`                                   |

Absolute `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`,
and `XDG_RUNTIME_DIR` values override the corresponding roots. Relative XDG
overrides are invalid and ignored. App-owned directories request mode `0700`;
the TOML and SQLite files request `0600` where the filesystem supports Unix
permissions.

## Configuration

`config.toml` is versioned and typed. It persists:

- theme, density, accent, Unicode borders, and reduced motion;
- English/Cantonese/bilingual mode and separate 1–5 funny levels;
- mouse, destructive confirmation, notification timeout, editor, and terminal;
- narrator enabled/language, quiet hours, reduced sound, and screen-reader
  yielding;
- literal/fuzzy/regex default, case sensitivity, and multiline search.

Writes acquire an advisory lock, validate the complete next value, write a
private temporary file, and atomically replace the destination. A malformed file
is preserved and startup falls back to defaults; it is not silently overwritten.
Unsupported schema versions fail validation.

## SQLite

The app-owned SQLite database stores notifications and their read/dismissed
state. It enables foreign keys, a five-second busy timeout, and WAL mode, and
owns explicit schema migrations. UI shutdown closes its owned connection.

The database is not a credential vault. GitHub authentication remains owned by
the installed GitHub CLI and its credential storage.

## Isolated Git-backed history

Complete settings/profile snapshots live in an app-owned repository below
`profile-history/<profile-id>`. This deliberately avoids creating a `.git`
directory anywhere inside a repository the user opened. Revisions can be listed,
read, diffed, labeled, and restored; restore writes a new audit revision rather
than rewriting history.

Profile identifiers and revision inputs are validated before reaching Git.
History Git commands are bounded and executed without a shell. If Git is
missing, the app continues with ordinary config persistence and reports that
history is unavailable.

## Backups and recovery

To back up state, exit the TUI, then copy the config, SQLite database (including
`-wal`/`-shm` files if present), and profile-history directory from their
resolved XDG locations. Do not copy a live SQLite main file alone and assume it
contains committed WAL pages.

For a bad TOML edit, move the file aside and start with defaults; compare the
saved file before restoring selected values. For a locked config, first prove no
live TUI owns the lock. Never remove an app-state lock merely because a write is
slow.
