# TUI security and failure modes

> **Historical prototype record:** This page preserves the July 27, 2026 TUI
> experiment. It is not current supported-product guidance or a Windows-release
> blocker.

<!-- markdownlint-disable MD013 -->

## Process execution

Git, GitHub CLI, editor, and terminal launches use argument arrays with
`shell=False`. NUL/control validation, explicit repository working directories,
stdin policy, captured output, and timeouts are owned at adapter boundaries.
User text is never concatenated into a shell command.

Git timeouts terminate the process group and collect final output under a short
bound. GitHub calls disable prompts, pagers, color, and update notices. Timeout
or cancellation does not imply the remote operation had no effect; refresh local
and remote state before retrying a mutation.

## Credentials and remote data

- Git credentials remain with configured Git credential helpers or SSH agents.
- GitHub credentials remain with `gh`; the TUI does not request a token field.
- Logs, notices, screenshots, parity evidence, and API response samples must not
  contain secrets.
- Provider URLs and repository identity are validated before calls.
- API explorer output is untrusted remote text and is rendered as text, not
  evaluated as terminal escape commands or code.

The app does not claim that a user is authorized merely because `gh` has a
credential. GitHub still enforces repository access and scopes.

## Filesystem and persistence

Resolved XDG roots keep app state outside working copies. Directories and files
request private Unix permissions. TOML writes are locked and atomic. SQLite uses
WAL, busy timeout, foreign keys, and migrations. Local history is isolated and
never auto-pushed.

Symlink, filesystem-permission, read-only mount, disk-full, and
concurrent-writer errors surface without replacing the last valid config.
App-owned state can contain private paths and notification content; protect
backups accordingly.

## Regex denial of service

Only google-re2 evaluates user patterns. Pattern/input/memory/match/capture
bounds apply before or during iteration. The app never falls back to Python `re`
or a shell tool for a rejected pattern. See
[Search and RE2](search-and-regex.md).

## Destructive operations

Decision dialogs are reserved for actions that need a choice. They name the
repository object and allow cancellation. A confirmation is not a stale-state
proof: Git and GitHub can still reject a changed branch, head SHA, lock, scope,
or repository.

The preview does not auto-remove index locks, reset repositories, force-push, or
delete project directories. Clone/new destinations are reviewed inputs.

## Failure table

| Failure                               | User-visible behavior                    | Safe recovery                                                                    |
| ------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| invalid/non-repository path           | open is refused                          | choose the intended Git working copy                                             |
| Git missing or timed out              | pane/action error notification           | install Git or inspect the active process, then refresh                          |
| repository lock/in-progress operation | Git error remains visible                | finish/abort the owning Git workflow deliberately                                |
| `gh` missing/signed out/scope short   | GitHub pane reports prerequisite         | use trusted `gh auth` flow outside the TUI                                       |
| provider rate limit/server error      | bounded failure, no infinite retry       | wait or inspect provider status, then refresh                                    |
| invalid/oversized regex               | validation/limit message                 | correct it or switch explicitly to Literal                                       |
| malformed config                      | defaults for the run; bad file preserved | move aside, compare, and repair the TOML                                         |
| SQLite unavailable                    | notice history degrades                  | repair XDG permissions/storage; primary Git action must not be undone implicitly |
| editor/terminal unavailable           | non-blocking notice                      | select an installed executable                                                   |
| narrow/limited terminal               | compact layout and scrolling             | enlarge it or use keyboard navigation                                            |

## Reporting

Include the version, OS/distribution, terminal and multiplexer, Python version,
Git version, `gh` version without authentication data, exact action, sanitized
error, and whether a remote mutation may have begun. Never attach config,
credential stores, environment dumps, or screenshots containing tokens/private
repository data without redaction at the source.
