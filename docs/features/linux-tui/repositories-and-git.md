# TUI repository and Git workflows

## Repository entry

The repository rail supports:

- **Open**: enter an existing working-copy path;
- **Clone**: enter a remote URL and destination path, defaulting its parent
  chooser to the process's current working directory;
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

Diff controls provide bounded line/word/syntax modes and configurable context.
Changed paths can appear as a safe directory tree. CSV and TSV receive semantic
tables; Markdown renders a terminal-native, link-disabled preview; verified
RGB/RGBA PNGs render exact before/after terminal color blocks from Git and
worktree bytes. TGA and hardened SVG rendering remain explicitly unavailable.
Hunk/line staging and the complete desktop undo/reordering experience remain
partial in the parity contract.

## History, branches, stashes, tags, and remotes

- History loads bounded commit records, supports shared search, row selection,
  file history, commit detail, revert, and cherry-pick. A complete graphical
  lane diagram and arbitrary interactive reordering are not claimed.
- Branches supports list/search plus create, switch, merge, and guarded
  deletion, with sorting and exact merge-tree preview.
- Stashes lists Git's real stash stack, including external entries, and supports
  a named or selectively scoped stash plus apply, pop, and guarded drop.
- Repository tools expose searchable remote and tag inventories plus copy-path
  and editor actions. Tag creation is exposed; lifecycle gaps remain labelled.
- Advanced tools list, add, remove, and prune worktrees; initialize, update,
  synchronize, and deinitialize existing submodules; apply or disable sparse
  checkout; inspect bounded reflog and repository diagnostics; and run saved,
  bounded build/run commands.
- Commit composition accepts co-authors without asking Git to parse a shell
  command. Exact author identity, commit target, and publication state remain
  visible around the action.

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

The scriptable `github git`, `github push`, and `github pull` wrapper preserves
native Git argv and adds Cheap LFS-aware push/pull phases without a confirmation
flag. See [Cheap LFS-aware Git CLI wrapper](cheap-lfs-git-wrapper.md) for its
100 MiB preflight, dry-run, materialization, and repeated-pull boundaries.

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
