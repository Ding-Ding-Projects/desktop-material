# Deleted upstream pull recovery

When a pull fails because the current branch's remote-tracking branch no longer
exists — someone deleted it after merging a pull request, or renamed it on the
remote — Desktop Material offers to check out the repository's default branch
and pull that instead, rather than leaving a raw Git error on screen. The offer
is also raised per repository from **Pull all** and reviewed batch sync, which
is where recovering by hand is most tedious.

## Behavior and configuration

- The offer is a modal decision and nothing more. Accepting it dismisses the
  dialog immediately; the branch switch, the optional branch deletion, and the
  retried pull all report their progress and their real result through
  non-blocking notifications in the notification centre.
- The dialog states which repository failed, which local branch is affected,
  which remote no longer advertises it, and under what name it was expected.
  It then names the exact default branch it would switch to.
- **Also delete the local branch** is off every time the dialog opens and is
  never pre-selected. A failed pull is not a reason to delete a branch.
- Before the checkbox is ticked, the dialog already says how much work the
  deletion would strand: the number of commits reachable from the stale branch
  but not from the default branch, computed with
  `git rev-list --left-right --count <default>...<stale>`. A branch fully
  contained in the default branch says so; a count that could not be
  established is reported as unknown and treated as though work would be
  stranded.
- Deletion is local only. The upstream branch is what disappeared in the first
  place, so nothing is pushed and no remote branch is deleted.
- Every string obeys the app language mode (English, playful Hong Kong-style
  Cantonese, bilingual). The dialog's opening line and the success notification
  additionally follow the per-language funny-level slider. The level changes the
  voice only: the repository, branch, remote, default branch, commit counts, and
  Git error text are identical at every level in both languages.
- The dialog is an `alertdialog` with an `aria-describedby` message region,
  keyboard-reachable actions, and `role="alert"` on every refusal and on the
  stranded-commit warning.

## The detection rule

Two independent conditions must both hold before recovery is offered.

1. **Git's own structured classification.** The failure must carry dugite's
   `GitError.NoExistingRemoteBranch`, dugite's classification of Git's
   "no such ref was fetched" diagnostic. Desktop Material never re-parses
   `stderr` itself for this.
2. **The remote's own answer.** The store then runs
   `git ls-remote --exit-code --heads -- <remote> refs/heads/<branch>` against
   the actual remote and only offers recovery when the remote answers that the
   branch is not there. The probe runs as a background task so a missing or
   refused credential fails closed instead of raising a credential prompt on
   the back of a failed pull.

The structured error alone is treated as a nomination, not as proof. A remote
that still advertises the branch, or a remote that cannot be reached or
authenticated with, declines the offer, and the original Git error keeps its
ordinary error surface.

## What is deliberately not offered

Recovery is **not** offered, and the failure keeps its normal Git error, when:

- the failure was anything other than `NoExistingRemoteBranch` — authentication
  failures, host-down and disconnection errors, merge or rebase conflicts,
  local changes that would be overwritten, hook failures, and lock files all
  fall into this group;
- the failing operation was not a pull. A push, merge, or checkout that reports
  the same Git failure is left alone, because switching branches is not the fix
  for it;
- the remote still advertises the branch, or never answered;
- the repository has no checked-out branch, no configured upstream, or no
  resolvable pull remote;
- the default branch is already checked out, so switching to it would recover
  nothing;
- the same repository already has an open recovery decision.

A single batch sync raises at most ten recovery dialogs. Repositories affected
beyond that cap still say so in their result row and are recovered by opening
them individually; they simply do not stack another modal.

## The dirty-worktree refusal

The switch is a real mutation of the user's worktree, so it is refused rather
than worked around. Desktop Material re-reads the repository immediately before
acting and returns a refusal — changing nothing at all — when:

| Refusal | Meaning |
| --- | --- |
| `no-default-branch` | No default branch is configured or discoverable. Desktop Material reports this instead of guessing at `main` or `master`. |
| `dirty-worktree` | Uncommitted changes are present. The switch never stashes, moves, or discards them. |
| `conflicted-worktree` | Unresolved conflicts are present. |
| `operation-in-progress` | Another push, pull, or fetch already holds the repository. |
| `already-on-default-branch` | The default branch is already checked out. |
| `no-current-branch` | Detached HEAD or an unborn branch. |

The checkout itself is issued with the confirmation uncommitted-changes
strategy pinned explicitly, so a profile configured to always stash cannot turn
this recovery into a silent stash. If the checkout still does not land on the
default branch, the recovery stops there and reports `checkout-failed` without
deleting a branch or attempting a pull.

## Failure modes and verification

The retried pull is reported as it actually ended. Git reports pull failures
through the repository's GitStore rather than by throwing, so the retry is
watched for the error it emits and a failure is reported with its Git message
intact — the notification never claims a success that did not happen. A stale
branch that could not be deleted says why it was kept.

Covered by `app/test/unit/pull-branch-deleted-test.ts`,
`app/test/unit/pull-branch-deleted-store-test.ts`, and
`app/test/unit/pull-branch-deleted-ui-test.ts`: the offer and each exclusion,
the branch-name validation that keeps an option-looking ref out of the
`ls-remote` argument list, an end-to-end `ls-remote` probe against a real local
remote, every refusal, the honest retry reporting, the unticked delete option
and its stranded-commit warning, per-repository batch offers and their cap, and
both languages at every funny level.
