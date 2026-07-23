# Auto-updater version-order run manifest

- Run ID: `2026-07-22-auto-updater-version-order`
- Mode: `publish`
- User report: an installed Desktop Material build repeatedly reports that it
  is current even when a newer GitHub Release exists.
- Confirmed cause: local Squirrel package
  `3.6.3-beta3-s000000000201` compares above latest normal package
  `3.6.3-beta3-b0000040887`; both automatic and manual checks log that the local
  version is greater than the remote version.
- Intended repair: both release lanes use one validated
  `<base>-z<9-letter-base-26-GitHub-run-ID>` namespace, create immutable
  non-latest Releases, and reconcile the greatest valid package version for
  freshly revalidated current `main` before advancing the Squirrel feed. The
  alphabetic payload is required because packaged E2E proved that installed
  Squirrel overflows on an 11-digit numeric prerelease tail.
- Required UI acceptance: from the installed legacy `s…` build, open **About →
  Check for updates** on an isolated off-screen Win32 desktop and prove the
  newly published `z…` Release is offered instead of **You have the latest
  version**. Keep the user's visible desktop untouched.
- Headless evidence: use one unique owned directory below the system Temp
  folder named `desktop-material-updater-z-20260722-<nonce>`, with an isolated
  profile, disposable fixture, cleanup ledger, and off-screen desktop. Capture
  the accepted ready-to-install state at native resolution and promote it to
  `docs/assets/screenshots/auto-updater-update-ready.png` only after visual and
  Squirrel-log verification. The installed `s…` package is the acceptance
  subject, so this run intentionally launches that exact packaged executable
  instead of rebuilding and testing the unrelated dirty shared checkout.
- Owned implementation files: `.github/workflows/build-installers.yml`,
  `.github/workflows/super-express-release.yml`,
  `.github/scripts/promote-current-release.sh`, `script/release-version.js`,
  `script/release-version.d.ts`, `script/release-version-test.ts`,
  `app/test/e2e/mock-update-server.ts`,
  `app/test/unit/ci-workflow-safety-test.ts`, and
  `app/test/unit/super-express-release-workflow-test.ts`.
- Owned documentation files/hunks: `README.md`, `ROADMAP.md`,
  `docs/features/integrations/automated-updates-and-release-notes.md`,
  `docs/technical/packaging.md`, `docs/wiki/User-Guide.md`,
  `docs/assets/screenshots/auto-updater-update-ready.png`, and the final current
  completion receipt in `HANDOFF.md`, plus
  `docs/verification/auto-updater-version-order-2026-07-22.md` for the exact
  remote, Squirrel-log, installed-package, and off-screen UI evidence.
- Concurrent task boundary: the Cheap LFS commit-progress task owns its separate
  run manifest plus commit-message/progress, preferences, operations, styles,
  localization, focused tests, screenshot, and feature-document changes. Its
  files must be preserved and excluded from updater commits. Shared
  README/ROADMAP/wiki hunks require integration rather than replacement.
- Starting commit: `fbe0550cd3b5ba2ab06e1fb8eb433aef11d159ea` on local/remote `main`.
- Verification: focused version/workflow tests, script suite, relevant updater
  E2E, TypeScript, ESLint/Prettier, shell syntax, production build, remote CI and
  release assets/feed, installed legacy-to-`z` UI transition, Pages/wiki sync,
  and final branch/worktree/stash audit.
- Remote receipt: correction CI `29977738533` and installer run `29978844761`
  succeeded for exact source `04246fdf12`; automatic Release
  `v3.6.3-beta3-zadtberjmv` became Latest with six assets. Intentional same-SHA
  Super Express run `29980281736` then passed its complete unit/script gates and
  published/promoted six-asset `v3.6.3-beta3-zadtbhvdfc` for the visible UI
  receipt.
- Installed/UI receipt: the legacy `s000000000201` process automatically
  downloaded/applied the first `z` package. Its HWND-targeted manual check then
  visibly downloaded the greater `z` package and reached **Quit and Install
  Update**. The accepted 960×660 PNG is 49,195 bytes, SHA-256
  `a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d`.
  File → Exit ended the saved PID, no helper remained, the owned desktop had
  zero windows, and the desktop closed without exposing the user's session.
