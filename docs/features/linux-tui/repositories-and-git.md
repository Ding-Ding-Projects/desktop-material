# TUI repository and Git workflows

## Repository entry

The repository rail supports:

- **Open**: enter an existing working-copy path;
- **Clone**: enter a remote URL and destination path;
- **New**: enter an empty/new directory to initialize;
- name/path filtering in literal, fuzzy, or RE2 mode;
- mouse or keyboard selection among open repositories and their tabs.

Paths are expanded and resolved before use. A candidate must validate as a Git
repository before repository panes bind to it. Clone and initialization use argv
arrays and an explicit `--` boundary where Git accepts one.

## Changes and commits

Changes lists the actual worktree status. A user can select changed files,
inspect a scrollable text diff, stage or unstage selected files, and discard
only after a target-naming confirmation. Commit uses a real summary `Input` and
multiline body `TextArea`, with amend and sign-off choices plus separate
**Commit** and **Commit & push** buttons.

Current scope is file-level. Hunk/line staging, graphical image/structured
diffs, syntax word diff, co-author UI, commit reordering, and undo parity remain
outside this preview and are marked partial or unavailable in the parity
contract.

## History, branches, stashes, tags, and remotes

- History loads bounded commit records, supports shared search, row selection,
  and commit detail. A graphical lane diagram is not claimed.
- Branches supports list/search plus create, switch, merge, and guarded
  deletion. Rename exists in the service but is not yet exposed in the pane.
- Stashes lists Git's real stash stack, including external entries, and supports
  a named stash plus apply, pop, and guarded drop.
- Repository tools expose searchable remote and tag inventories plus copy-path
  and editor actions.
- Advanced tools list, add, remove, and prune worktrees; initialize, update,
  synchronize, and deinitialize existing submodules; apply or disable sparse
  checkout; inspect bounded reflog and repository diagnostics; and run saved,
  bounded build/run commands.
- Tag mutation exists at the service boundary but is not exposed in this
  preview; complete reviewed tag lifecycle parity remains partial.

Worktree lock/move/rename/repair, provider-aware submodule add, the desktop
three-step sparse-checkout guide, patch series, signing, Git LFS administration,
and guided bisect remain outside this preview.

## Network operations

Fetch, pull, and push are explicit actions in the toolbar and command palette.
They run asynchronously so the UI can continue painting and accepting input. The
process runner applies a 30-second default bound and a longer explicit network
bound, disables stdin prompts at its boundary, captures bounded error text, and
terminates the process group after timeout.

The TUI does not invent credentials. Git uses the user's configured credential
helpers and SSH setup. A non-interactive failure is surfaced with the Git exit
status and sanitized message; retry after repairing authentication or remote
configuration.

## Destructive actions

Discard, branch deletion, stash drop, worktree removal, sparse-checkout changes,
workflow cancellation, and clearing notification history use decision dialogs.
The dialog identifies the target where available, defaults to a safe exit path,
and permits cancel by keyboard or mouse. Tag mutation is not exposed, so no
tag-deletion confirmation is claimed. Informational success, progress, and
ordinary errors remain non-blocking notifications.

This boundary does not make every Git operation reversible. Users should review
the active repository, branch, and selected row before confirming.

## Concurrency and refresh

Textual worker groups prevent duplicate pane loads from racing each other.
Mutation completion triggers a repository-wide refresh. Git operations still
observe the repository's own lock rules: a command can fail if another Git
client owns `index.lock`, a rebase/merge is in progress, or worktree state
changes between review and execution.

The preview never removes `.git/index.lock` automatically. Determine which
process owns it and whether an operation is active before attempting recovery.
