# Worktree context-menu acceptance, 2026-09-01

## Scope

This receipt covers the linked-worktree **Merge…** and **Delete…** context
actions. The merge item opens the existing reviewed merge operation with the
exact linked local branch selected. Delete remains a separate non-force action
and keeps its existing main-worktree and locked-worktree protections.

The pre-existing gallery registry also contained one canonical output with no
tracked PNG. That output remains explicitly deferred rather than being
fabricated or copied from another surface.

## Source and build

- Base source: `83c91f6964cc1799fcc7e1d4fcd23f90e5e017f6`.
- Task branch: `codex/worktree-context-menu-actions`.
- Build command:
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`.
- Build result: exit code `0` in `337.36s`; the main, renderer, quick-action,
  CLI, and highlighter bundles completed. Existing Sass deprecation warnings
  remained warnings.

## Focused checks

- `multi-window-context-menu-test.ts`: 7 passed, 0 failed after the dispatcher
  seam was added.
- The merge-item negative regression was deliberately broken: 5 passed and 1
  failed. Restoring the item returned the focused suite to green.
- TypeScript no-emit: passed.
- Changed-file ESLint: passed.
- Prettier and `git diff --check`: passed.

## Hidden-desktop interaction

The exact production bundle ran through the cheap Lowlevel headless route on a
named off-screen desktop. Its Git configuration and renderer profile were
isolated under the owned temporary run root. The visible desktop, cursor,
keyboard focus, global Git configuration, and unrelated applications were not
used.

The disposable repository contained:

- `main` at `71224a08cba9e86340f97324db2074f39cf5b28f`.
- Linked `feature/menu-actions` at
  `c1d74d7cc897aa2b864689eba4bb28e35c9dbdee`, one commit ahead.

The reviewed interaction sequence was:

1. Open the Worktrees foldout.
2. Right-click the linked `feature/menu-actions` row.
3. Confirm **Merge…** and **Delete…** are both enabled and inside the viewport.
4. Activate **Merge…**.
5. Confirm the normal **Merge into main** review opens with
   `feature/menu-actions` selected and exactly one commit listed.

## Captures

| Capture | Dimensions | SHA-256 |
| --- | ---: | --- |
| `docs/assets/screenshots/worktree-context-menu-merge-delete.png` | 960×660 | `5C8FF8C70E5FC0DF7BAAC2FEE22EB6BFC5EC4CBEB7EF839830BB2CBB2419F180` |
| `docs/assets/screenshots/worktree-merge-preview-from-context-menu.png` | 960×660 | `2F5B3E8E56BDF2F7B09B98C81B3CB703D4D2CAFD23B9474ACE4F30AFAA791F59` |

Both PNGs were opened at original resolution. They are nonblank, use only
the synthetic fixture, contain no credentials or personal identity, keep text
and controls inside the 960×660 client frame, and show the exact states named
by their captions. An unrelated disposable-profile error frame was rejected
and was not promoted.

## Cleanup boundary

The application process, hidden desktop, and task-owned Lowlevel HTTP process
were closed after capture. The owned temporary fixture and profile remain only
until final task cleanup so the receipt can be checked against the promoted
files.
