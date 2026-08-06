# Headless verification manifest: multi-remote syncing

- Run id: `2026-08-05-remote-sync-multiple-remotes`
- Mode: `publish`
- Milestone: add multi-remote sync behavior when a repository exposes more than one remote
- Expected UI state: a repository with one remote keeps the existing `Fetch origin` presentation; a repository with multiple remotes exposes `Fetch all remotes` and explains that the action covers every configured remote without hiding the current fetch status.
- Ordered background interactions:
  1. Launch the built Windows app against a disposable repository fixture with two bare remotes (`origin` and `mirror`).
  2. Complete the first-run local setup and add the fixture through the real Add Existing Repository flow.
  3. Open the real Push/pull/fetch menu through the renderer and inspect its visible text and bounds.
  4. Capture the `Fetch all remotes` label and expanded status description from the real built renderer.
  5. Do not trigger the network action: the fixture was used for UI evidence, while the sequential multi-hui fetch selection is covered by focused unit tests.
- Disposable fixture path: unique owned directory under the run-specific Temp root, created during verification.
- Isolated user-data path: unique owned directory under the same run-specific Temp root.
- Screenshot target: unique run-specific Temp PNG; promote only if the changed UI is stable, nonblank, unclipped, and contains no private data.
- Documentation allowlist: affected feature documentation, `README.md`, `HANDOFF.md`, and screenshot references only when a real capture is promoted.
- Focused tests: remote-sync unit/component tests and the repository's applicable Windows desktop checks.
- Remote: `origin`
- Expected branch: `codex/remote-sync-multiple-remotes-20260805`

## Cleanup ledger

- Run root: `C:\Users\cntow\AppData\Local\Temp\desktop-material-remote-sync-multiple-remotes-b3c674b8a718434285f6ce6f1d005b24`
- Fixture: `C:\Users\cntow\AppData\Local\Temp\desktop-material-remote-sync-multiple-remotes-b3c674b8a718434285f6ce6f1d005b24\fixture`
- User data: `C:\Users\cntow\AppData\Local\Temp\desktop-material-remote-sync-multiple-remotes-b3c674b8a718434285f6ce6f1d005b24\user-data`
- Capture root: `C:\Users\cntow\AppData\Local\Temp\desktop-material-remote-sync-multiple-remotes-b3c674b8a718434285f6ce6f1d005b24\captures`
- Headless desktop: `DesktopMaterialRemoteSync-20260805-b3c6` (created, handle `1348`)
- Launch PIDs: `46480`, `22264`, and `50388` (the latter two were exact-PID restart attempts after the renderer startup probe)
- CDP ports: `9347` and `9348`
- Final capture target: `C:\Users\cntow\AppData\Local\Temp\desktop-material-remote-sync-multiple-remotes-b3c674b8a718434285f6ce6f1d005b24\captures\multi-remote-fetch.png`

## Verification result

- Focused tests: `19/19` passed with `node script/test.mjs app/test/unit/git-store-test.ts app/test/unit/ui/push-pull-button-test.tsx --test-concurrency=1`.
- Targeted ESLint: passed with the repository custom rules directory enabled.
- Production build: passed with `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`; packaging was intentionally skipped by `DESKTOP_SKIP_PACKAGE=1`.
- Headless UI: the real built renderer displayed `Fetch all remotes` and `Fetch the latest changes from every configured remote` for the two-hui fixture, with no clipping in the inspected 1000x687 frame. The unmodified development renderer also logged its existing `__webpack_module__ is not defined` startup error, so the capture probe used a temporary CDP startup shim; this was not committed. A later capture-only DOM-removal attempt triggered the disposable app's crash boundary and was not used as evidence.
- Capture disposition: retained only in the owned Temp run root; not promoted because it was not a clean screenshot artifact after the harness contamination.
- Cleanup: exact launch PID `50388` was verified against the disposable command line and terminated after the final probe; the headless desktop then reported zero windows and was closed. The exact run root was verified as a direct Temp child and removed successfully.
