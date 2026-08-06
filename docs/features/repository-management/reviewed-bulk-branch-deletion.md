# Reviewed bulk branch deletion and merge cleanup

The Branches side sheet includes a compact cleanup panel for removing several
local branches in one reviewed batch. Current, default, and remote-only branches
never enter the candidate list.

The branch-row context menu also offers `Merge…` and `Merge and delete…` for an
eligible branch. The latter opens the normal merge preview and removes the
local source branch only after Git reports a completed merge or that the target
is already up to date. The side sheet's **Merge all into default** action is the
bulk form of the same rule: successful or already-up-to-date branches are
cleaned up, while a failed or skipped merge stays available.

## Behavior and configuration

- Select individual local branches, Select all, or Select none.
- Review up to 100 exact branch names and tip object IDs per batch.
- Confirm once, then receive an isolated result and recovery SHA for every
  branch.
- Remote branches and upstreams are never changed by this bulk workflow.
- Use the branch context menu to preview a merge, or to merge and delete a
  local source branch after a successful result.

There is no persistent configuration. Single-branch deletion and its optional
upstream behavior remain available from the normal branch context menu.

## Failure modes and recovery

The complete inventory is revalidated before the first mutation. If any branch
was deleted or moved after review, or is checked out in any linked worktree,
nothing starts and the panel asks for a fresh review. Each subsequent deletion
includes its expected old object ID, so a later race fails that row instead of
deleting the new tip. Failed rows remain listed; successful rows record the
12-character recovery ID.

For **Merge and delete…**, a merge conflict, hook failure, aborted operation,
or merge error never reaches cleanup. If the source branch moves after the
merge, the exact-tip review fails closed and the branch is kept with an error
notification. Cleanup affects the local branch only; an upstream remote branch
is not implicitly deleted.

## Security considerations

Branch names and full SHA-1/SHA-256 object IDs are bounded and validated. The
current and default branches are protected again in the store, not only hidden
by the renderer. Git's worktree inventory protects branches checked out in the
main or any linked worktree. The operation uses Git's exact
`update-ref -d REF OLD-OID` contract inside the repository mutation guard and
never executes a shell or deletes a remote ref.

## Verification

Real-repository tests cover exact multi-delete, current-branch and linked
worktree preservation, recovery identities, and all-before-any stale review
rejection. Renderer tests cover protected candidate filtering, exact reviewed
requests, confirmation, results, stale failures, and the branch context menu's
merge/merge-and-delete/delete actions, including the up-to-date-only cleanup
button and unknown-comparison guard. The merge operation's cleanup flag is
handled in both the direct-success and conflict-resolution completion paths;
bulk cleanup revalidates each branch tip before deletion.

## Suggested articles

- [Verified merge-and-cleanup repository sync](sync-merge-cleanup.md)
- [Reviewed batch repository sync](reviewed-batch-sync.md)
- [Branch switcher workflows](../identity-and-workspace/branch-switcher-workflows.md)
