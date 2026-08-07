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

Add worktree flow. The freshness filter adds
`for-each-ref-test.ts`, `not-updated-with-default-test.ts`,
`merge-branch-filters-test.ts`, and the integrated merge chooser/filter suite.
The focused integrated run passed **28/28** tests, TypeScript and changed-file
ESLint passed, and the development build completed through Windows resource
preparation. The built-app capture below is the exact client-only frame from
the disposable `main` fixture: **960×660**, SHA-256
`DA046E4BC768324BAFF001B5DE0C7954F53F1CD498C25338081E8FDB83990346`.

![Merge into main chooser with Not updated with main active, showing only the stale fixture branch](../../assets/screenshots/not-updated-with-main-filter.png)

The capture shows `codex/not-updated-with-main` remaining visible while
`codex/updated-with-main` is removed by the active filter.

## Acceptance captures

The built Windows renderer shows the new choice selected and the follow-up
form with the destination branch and worktree name already filled in:

![Dirty-worktree switch dialog with Leave my changes here selected](../../verification/dirty-worktree-worktree-option-20260805/dirty-worktree-switch-dialog.png)

![Add worktree form prefilled for the destination branch](../../verification/dirty-worktree-worktree-option-20260805/add-worktree-prefilled.png)