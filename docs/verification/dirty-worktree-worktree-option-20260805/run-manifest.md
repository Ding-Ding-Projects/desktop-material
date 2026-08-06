# Dirty-worktree worktree option — headless verification manifest

- **Mode:** `publish`
- **Milestone:** Offer a separate linked worktree when switching branches with uncommitted work
- **Run id:** `dirty-worktree-worktree-option-20260805`
- **Task branch:** `codex/dirty-worktree-worktree-option`, based on `origin/main` at `bc63986119e2c71cc28d98e1465c9c8501c25f58`
- **Expected UI state:** the dirty-worktree branch-switch dialog renders a third choice, “Leave my changes here”, with copy explaining that a separate worktree will be created for the destination branch; selecting it changes the affirmative action to “Create worktree…”
- **Ordered interactions:** create a disposable Git fixture with a dirty current branch and a clean destination branch; launch the unpackaged Windows app on the uniquely named hidden desktop `DMMDirtyWtA6EED694`; open the branch switcher; select `main`; capture the decision dialog; select the new worktree choice; capture the prefilled Add worktree dialog; create the destination worktree inside the disposable run root; verify the source remains dirty and unstashed; close the app and remove only owned fixture/runtime paths
- **Disposable paths:** fixture, destination worktree, user data, and transient captures lived below the unique per-run temporary root; the root and its Git metadata were removed after verification
- **Screenshot targets:** `dirty-worktree-switch-dialog.png` and `add-worktree-prefilled.png` under this directory; both are genuine 960×660 PNG captures from the built Electron renderer and contain no private data
- **Capture method:** exact Electron page was resolved through the local DevTools endpoint; CDP `Page.captureScreenshot` captured the rendered surface while the application stayed on the hidden desktop
- **Build evidence:** the exact production build was attempted and reached successful main/highlighter compilation but exited before renderer emission because `origin/main` contains a pre-existing Sass error at `app/styles/ui/_launchpad.scss:278`; a disposable renderer-only build with that unrelated selector wrapped locally emitted the fresh renderer used for capture. The temporary wrapper was removed and is not part of the task diff
- **Runtime evidence:** the original fixture remained on `feature/worktree-switch` with `README.md` modified; the created destination was clean on `main`; the application switched into the destination and reported zero stashes
- **Tests:** focused UI test `1 passed, 0 failed`; targeted Prettier and ESLint passed; isolated TypeScript check passed; real-artifact hidden-desktop interaction verified
- **Documentation allowlist:** the dialog source, focused UI test, branch-switch feature article, wiki gallery, README reference, this manifest, cleanup ledger, promoted screenshots, and `HANDOFF.md`
- **Remote:** `origin` (`https://github.com/Ding-Ding-Projects/desktop-material.git`)
- **External state:** open issue scan was recorded in the task notes; do not claim remote verification until the pushed default-branch SHA is proven
