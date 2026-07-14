# Post-merge cleanup and screenshot refresh

- **Run id:** `2026-07-13-post-merge-cleanup`
- **Mode:** `publish`
- **Milestone:** post-merge main verification and cleanup
- **Expected UI state:** unpackaged production Desktop Material opens the disposable fixture in the Material workspace; final capture shows a stable, nonblank, user-safe Material surface.
- **Ordered background interactions:** startup preflight; reproducible production build; isolated disposable fixture/profile; one uniquely named headless desktop; launch with `--disable-gpu` and only the disposable fixture; resolve the current app HWND; capture before input; exercise the relevant merged surface; re-capture after meaningful actions; inspect the final original-resolution PNG; promote only after acceptance; close the app and desktop and remove owned Temp paths.
- **Disposable fixture path:** unique owned directory beneath `%TEMP%`, recorded with the cleanup ledger at runtime.
- **Screenshot target/theme/dimensions:** current post-merge Material workspace evidence; light and/or dark state as exercised; original-resolution PNGs matching the target window dimensions.
- **Documentation allowlist:** this manifest, `README.md`, `HANDOFF.md`, `docs/assets/screenshots/`, and `docs/wiki/` only when the refreshed evidence is referenced there.
- **Declared checks:** `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`; focused post-merge tests discovered from repository scripts; lint/typecheck/build checks applicable to touched files; secret scan; screenshot hash and layout inspection.
- **Remote:** `origin` (`https://github.com/codingmachineedge/desktop-material.git`)
- **Expected branch:** `main`
- **Initial baseline:** clean worktree at `44506e89c789d7c93bea6a7224dfdebc29b6308f` (`main...origin/main`), with no linked worktrees reported.

## Runtime ledger

To be filled during the headless run: unique run root, desktop name, create state,
launch PID, resolved HWND, and cleanup/verification results.
