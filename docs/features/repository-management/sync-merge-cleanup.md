# Verified merge-and-cleanup repository sync

The **Sync repositories** dialog includes a reviewed **Merge completed work
into main, push, then clean up** operation. It integrates eligible local branch
tips into `main`, pushes `main` without force, proves that the remote contains
the exact resulting commit, and only then removes branches and linked
worktrees whose identities are still safe to delete.

## Behavior

1. The user selects an exact set of persisted repositories and chooses the
   merge-and-cleanup operation.
2. The dialog explains the destructive phase and requires a separate
   confirmation checkbox. Changing the operation clears that confirmation, and
   the store rejects a merge-and-cleanup request that does not carry it.
3. For each selected repository, Desktop Material acquires the existing
   repository commit/materialization gate, refreshes canonical remote metadata,
   and requires a clean primary worktree with no conflicting Git operation.
4. The app requires both the configured default branch and a local branch to be
   named exactly `main`. Local `main` must track the exact `main` branch on an
   available remote, and another linked worktree must not own `main`.
5. The app fetches that remote, then inventories local and remote branches,
   linked worktrees, and stashes. More than 100 branch/worktree review items
   stops that repository without merging or deleting anything.
6. The fetched remote-`main` tip and each reviewed eligible branch tip are
   merged into local `main`. A tip already contained by `main` does not need a
   new merge.
7. Desktop Material pushes `main` through its ordinary non-force push path,
   reads remote `main` again, and requires its exact object ID to equal local
   `main`.
8. Every cleanup candidate is revalidated against that proved remote-main
   object before its remote branch, linked worktree, or local branch can be
   removed.

Up to three selected repositories use the existing bounded batch runner.
Progress and an isolated result remain visible for every repository, including
items that were skipped or retained for review.

## Codex and OpenCode conflict resolution

The operation uses the repository's persisted **Build & Run** fix-provider
choice: Codex or OpenCode. Desktop Material first checks that the selected
provider is installed and authenticated. The agent is launched only when Git
leaves an active merge conflict.

The conflict prompt identifies the reviewed branch tips and restricts the
agent to editing conflicted files. It explicitly forbids committing, pushing,
fetching, pulling, checking out or deleting branches, changing remotes,
stashing, and adding, moving, or removing worktrees. After the agent returns,
Desktop Material checks for unresolved paths and an active `MERGE_HEAD`, creates
the merge commit itself, and proves the reviewed tip is an ancestor of `main`.
If those checks fail, the app aborts that merge and retains the affected work.

Git inventory, merge commits, push proof, and every cleanup decision therefore
remain app-owned. The agent never receives authority to perform the destructive
phase.

## Cleanup proof and retained work

A local branch is removed only when its current object ID still equals the
reviewed ID and that commit is an ancestor of the proved remote `main`. Local
deletion uses the expected object ID, so a branch that moves after review is
retained.

A same-name remote branch is eligible only when it is the local branch's exact
tracked upstream. Desktop Material re-reads its tip, proves that tip is in
remote `main`, and asks the provider for strict actor and branch-deletion
permission. Deletion uses an exact
`--force-with-lease=refs/heads/<branch>:<expected-sha>` compare-and-delete
guard. The app then proves the remote ref is absent before proceeding with
local cleanup. This lease is not a force-push of replacement history; a moved
remote branch fails the comparison and is retained.

A linked worktree is removed without force only after a final inventory proves
the same branch ownership, unlocked and attached state, clean working
directory, and unchanged `HEAD`. Its local branch is then deleted with the
reviewed expected SHA.

The operation conservatively retains:

- dirty, locked, detached, ambiguous, moved, or otherwise changed linked
  worktrees;
- local branches whose current tip changed, is not contained by pushed remote
  `main`, or has ownership-uncertain remote state;
- same-name remote branches that are not the local branch's tracked upstream;
- remote-only branches, protected branches, unreadable remote refs, and refs
  whose deletion cannot be proved;
- any branch or worktree whose tip is not proved as merged into and pushed on
  remote `main`; and
- every stash. Stashes are inventoried and reported, but are never applied,
  dropped, or rewritten by this operation.

## Configuration

There is no scheduled or implicit cleanup mode. Every run starts from the
reviewed Sync repositories dialog and requires the destructive confirmation.
The only reused preference is the repository-scoped Codex/OpenCode provider
already configured for Build & Run.

The operation is limited to repositories whose default branch is `main` and
whose local `main` tracks remote `main`. A repository using another default
branch name must be managed manually; this workflow does not rename branches or
guess an equivalent ref.

## Failure modes and recovery

Missing repositories, temporary submodule workspaces, an active Cheap LFS clone
or restore, a dirty primary worktree, an in-progress Git operation, unavailable
agent credentials, missing or mismatched `main` tracking, and an unreadable
remote stop or skip the affected repository with a factual result. The
commit/materialization gate prevents commits and cleanup while Cheap LFS is
changing files.

A failed branch merge is aborted and reported while other independently safe
candidates may continue. If local `main` is not clean after integration, the
push does not run. If pushed remote `main` does not exactly match local `main`,
no cleanup runs. Later identity, ancestry, permission, lease, or absence-proof
failures retain the corresponding local branch or worktree and report that it
needs review.

The operation does not force-push `main`, discard stashes, use forced worktree
removal, or delete work merely because it shares a branch name.

## Security and accessibility

The renderer sends a bounded operation enum, numeric repository IDs, and the
explicit confirmation bit. The store resolves those IDs against the live
persisted inventory and revalidates the confirmation. Remote operations use the
existing account-aware credential path; no credential, remote URL, refspec, or
shell command is accepted from the dialog.

Branch names and expected SHA-1/SHA-256 identities are validated before remote
deletion. Strict provider branch-protection checks, exact ancestry tests,
expected-SHA local deletion, force-with-lease remote deletion, and final
remote-absence proof form independent barriers against deleting changed or
unowned work.

The operation selector, destructive confirmation, repository choices, and
actions have localized accessible names. The start action remains disabled
until at least one repository and the confirmation are selected. Running state
uses a labelled progress bar and polite live status, while the result table is
a keyboard-focusable labelled region. English, playful Hong Kong-style
Cantonese, and bilingual copy use the existing language-mode behavior.

## Verification

Focused unit coverage passed **10/10 tests** with:

```powershell
yarn test:unit app/test/unit/sync-merge-cleanup-test.ts app/test/unit/pull-all-ui-test.ts
```

The planning tests cover exact tracked candidates, retained dirty, detached,
locked, remote-only, and ownership-uncertain state, plus the agent's
non-Git-owning prompt. Renderer tests cover the explicit destructive
confirmation, the exact confirmed request, and the merged/pushed/cleaned result
summary alongside the existing reviewed batch-sync behavior.

These focused local tests verify the planning and user-interface contracts.
They do not by themselves claim that remote CI or a live-provider end-to-end
cleanup has succeeded.
