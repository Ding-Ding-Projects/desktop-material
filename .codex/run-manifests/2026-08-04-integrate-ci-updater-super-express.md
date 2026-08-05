# Integrate, repair CI, and Super Express updater release

- Run ID: `2026-08-04-integrate-ci-updater-super-express`
- Mode: `publish`
- Milestone: preserve and integrate every safe Desktop Material branch and
  linked-worktree change into `main`, repair the resulting CI failures, correct
  the installed app's false **no update available** result, and publish through
  the existing Super Express Squirrel.Windows release lane.
- Starting checkout: local `main` at
  `d7c8a71e623b358deb6bf4a22a0acb47e9801f80`, initially 72 commits behind
  `origin/main`, with pre-existing tracked and untracked work that must be
  reviewed and preserved rather than overwritten.
- Expected UI state: on an isolated off-screen Win32 desktop, an installed older
  Desktop Material build opens its update surface and detects the newly
  published greater Squirrel package instead of reporting that it is current;
  the ready state exposes the release version and the explicit restart/install
  action without blocking the rest of the app.
- Ordered background interactions: preflight the cheap Lowlevel MCP endpoint;
  build through MCP; create a unique owned Temp fixture/profile and named
  headless desktop; launch the exact installed/package subject directly;
  dynamically resolve its HWND; open the update surface with HWND-targeted
  input; capture and inspect the detected/ready state; close by revalidated HWND
  and saved PID fallback only; close the owned desktop and remove only ledgered
  Temp paths.
- Disposable fixture path: a unique child of
  `%TEMP%\\desktop-material-updater-super-express-20260804-*`, recorded in a
  cleanup ledger before creation.
- Screenshot target: unique owned Temp PNG at native window resolution. The
  current Windows-app-only scope keeps repository documentation and screenshot
  publication out of this run, so no tracked screenshot is promoted.
- Theme and dimensions: current app theme; validate at the captured native
  dimensions and additionally at a narrow supported width if the update surface
  remains reachable.
- Documentation allowlist: none. Repository documentation and TUI scope remain
  closed by the current Desktop Material scope override.
- Tests: focused updater/version/workflow tests; changed Windows-app unit tests;
  TypeScript, formatting/lint, production build through cheap Lowlevel MCP;
  applicable packaged/Squirrel checks; exact-SHA GitHui Actions and release/feed
  verification; installed-old-to-new headless updater acceptance.
- Remote and branch: `origin` / `main`; no force-push and no tag reuse.
- Cleanup authorization: the user explicitly supplied `mat day` for this pass.
  Delete only branches, linked checkouts, stale metadata, and stash entries
  whose source tips and work are proven contained in the pushed `origin/main`;
  retain and report anything not safely contained or load-bearing.
