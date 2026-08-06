# Cleanup ledger

| Resource | Created for | Final state |
| --- | --- | --- |
| Temporary Git fixture | Dirty `feature/worktree-switch` source branch and clean `main` destination | Removed |
| Temporary destination worktree | Real creation-path acceptance | Removed with `git worktree remove --force` after proving it was clean and owned by the fixture |
| Temporary Electron user data | Isolated launch profile | Removed |
| Hidden desktop `DMMDirtyWtA6EED694` | Off-screen application verification | Closed; desktop inventory returned zero desktops |
| Packaged/built runtime copies and transient captures | Disposable renderer and CDP capture | Removed; only the two inspected PNGs were promoted into this directory |

The source fixture was verified before cleanup: `feature/worktree-switch`
retained one modified `README.md`, while the new `main` worktree was clean and
the application reported zero repository stashes after switching into it.
