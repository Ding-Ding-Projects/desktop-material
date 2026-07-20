# Parent-folder repository discovery

**Add Local Repository** can scan a chosen parent folder, preview every safely
detected Git working tree, and add the reviewed result in one action. This is a
local discovery aid for an existing workspace; it does not initialize, clone,
move, or modify repositories while scanning.

## Behavior and configuration

Choose **Auto-detect repositories…**, select one directory, and wait for the
deterministic breadth-first scan. The preview shows paths relative to the
selected folder and changes the confirmation label to the number of
repositories found. Confirming routes the exact resolved paths through the
ordinary multi-repository registration flow and selects the first returned
repository.

The scanner uses fixed safe defaults: at most six descendant levels, 100
repositories, 5,000 opened directories, 20,000 inspected entries overall, and
2,000 entries in one directory. It skips generated and dependency locations
such as `.git`, `node_modules`, `build`, `dist`, `out`, `vendor`, and virtual
environment directories. Reaching any bound produces an explicit truncated
result rather than implying that the folder was fully searched.

## Persistence

The chosen root, discovery results, truncation flag, and scan errors are dialog
state only. Changing the manual path or starting another selection invalidates
the prior request, and a late result cannot replace the newer state. Only the
normal repository registration performed after confirmation is persisted; the
scanner creates no background index or watched-folder setting.

Already registered working trees resolve to their existing repository entries.
New validated roots enter the same repositories store and remote/account
loading path as a repository added individually.

## Failure modes and recovery

An unreadable selected root produces an error and no preview. An unreadable
descendant, per-directory cap, total cap, repository cap, or depth cap marks the
otherwise usable result as truncated. The dialog tells the user to add the
found repositories and scan a narrower folder to find more.

Malformed, bare, unsafe, or otherwise rejected Git markers are treated as
repository boundaries but are not returned. The scanner does not descend
through them in search of nested repositories. If no valid roots are found,
confirmation stays disabled.

## Security considerations

The selected root must be an ordinary directory. Traversal never follows
symbolic links or Windows junctions, and linked `.git` markers are not accepted
as proof of a repository. Every candidate marker is revalidated through Git;
only a regular working tree whose reported top-level directory is exactly the
candidate path is returned.

Stopping at every Git marker prevents a malformed, bare, or unexpectedly large
working tree from becoming a new traversal root. Directory, entry, depth, and
result limits bound resource use. Scanning is read-only and does not invoke
repository hooks or provider authentication.

## Verification

`git/find-repositories-test.ts` creates real repositories and proves stable
discovery, heavy-directory and nested-worktree exclusion, depth/repository
bounds, Windows `.git` casing, link/junction refusal, root-read failure, and
partial results for unreadable descendants. `add-existing-repository-test.tsx`
covers the folder picker, preview, exact bulk registration, truncation guidance,
empty-state disablement, picker/scan errors, and stale-request protection.
