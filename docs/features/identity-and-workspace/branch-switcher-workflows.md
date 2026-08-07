# Branch switcher workflows

The branch sheet combines local and remote branches with text filtering,
recent branches, default-branch context, activity/alphabetical sorting, and
explicit hidden/solo visibility controls. Local branches without a working
upstream retain a visible publish state.

Branch creation can use bounded name presets emitted by an optional custom
integration. Presets show both a prefix/name and description, and the first nine
can be selected by keyboard. Repository Settings can override the default
branch used by comparisons and related workflows.

A checkout still passes through the existing dirty-worktree, conflict,
submodule, and in-progress-operation protections. Filter and visibility choices
do not delete refs. Invalid preset output is treated as display input and the
final branch name remains subject to Git ref validation.

When the current worktree has uncommitted changes, the switch dialog also
offers **Leave my changes here**. This keeps the current branch and its working
files exactly where they are, then opens the existing Add worktree flow with
the destination branch and a suggested worktree name prefilled. The new linked
worktree is created only after the user chooses and confirms an absolute path;
after creation, the app switches to that worktree. No stash entry is created,
and the current worktree is never checked out to the destination branch.

If the worktree creation fails, the current dirty worktree remains untouched
and the error is shown through the normal worktree error path. A destination
branch already checked out in another worktree continues to use the existing
worktree-switch behavior instead of offering a duplicate checkout.

Failures from a preset process are bounded by timeout/output limits and direct
the user back to Settings. Branch discovery remains usable without the custom
integration.

Verification includes `branch-preset-test.ts`,
`stash-and-switch-branch-dialog-test.tsx`, branch grouping/filter suites,
recent-branch Git tests, the checkout/branch dispatcher suites, and a real
Windows hidden-desktop capture of the dirty-worktree dialog and the prefilled
Add worktree flow.
