# Dirty-worktree worktree option — headless verification manifest

- **Mode:** `publish`
- **Milestone:** Offer a separate linked worktree when switching branches with uncommitted work
- **Run id:** `dirty-worktree-worktree-option-20260805`
- **Expected branch:** `codex/local-issue-fixing` during implementation; integrate into the default branch before completion
- **Initial worktree baseline:** clean main checkout at `db5d41e3f814e2f0ebd5e21dde18175ded399e55`; preserve the three existing linked Gerk Tong Hui and the pre-existing Lap Sap Tong on `codex/job-log-404-fix`
- **Expected UI state:** the dirty-worktree branch-switch dialog renders a third choice, “Leave my changes here”, with copy explaining that a separate worktree will be created for the destination branch; selecting it changes the affirmative action to “Create worktree…”
- **Ordered background interactions:** create a disposable Git fixture with a dirty current branch and a clean destination branch; launch the unpackaged Windows app on a uniquely named hidden desktop; open the branch switcher; select the destination branch; capture the decision dialog; select the new worktree choice; capture the prefilled Add worktree dialog; close the app and remove only owned fixture/runtime paths
- **Disposable fixture path:** unique directory below the per-run temporary root, recorded in the cleanup ledger after creation
- **Isolated user-data path:** unique directory below the same per-run temporary root
- **Headless desktop:** unique name, recorded in the cleanup ledger after creation
- **Screenshot targets:** `dirty-worktree-switch-dialog-1280x860.png` and `add-worktree-prefilled-1280x860.png` under this directory; promote only captures that show a real nonblank built app with no clipping or private data
- **Documentation allowlist:** the dialog source, focused UI test, branch-switch feature article, this manifest, cleanup ledger, promoted screenshots, and `HANDOFF.md`
- **Tests:** focused UI test, full unit suite, lint/typecheck, production unpackaged build, and the real-artifact hidden-desktop interaction
- **Remote:** `origin` (`https://github.com/Ding-Ding-Projects/desktop-material.git`)
- **External state:** report GitHui issue scan and CI state; do not claim remote verification until the pushed default-branch SHA is proven
