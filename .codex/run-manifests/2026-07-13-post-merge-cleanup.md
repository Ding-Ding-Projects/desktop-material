# Post-merge cleanup and screenshot refresh

- **Run id:** `2026-07-13-post-merge-cleanup`
- **Mode:** `publish`
- **Milestone:** post-merge main verification and cleanup
- **Expected UI state:** unpackaged production Desktop Material opens the disposable fixture in the Material workspace; final capture shows a stable, nonblank, user-safe Material surface.
- **Ordered background interactions:** startup preflight; reproducible production build; isolated disposable fixture/profile; one uniquely named headless desktop; launch with `--disable-gpu` and only the disposable fixture; resolve the current app HWND; capture before input; exercise the relevant merged surface; re-capture after meaningful actions; inspect the final original-resolution PNG; promote only after acceptance; close the app and desktop and remove owned Temp paths.
- **Disposable fixture path:** unique owned directory beneath `%TEMP%`, recorded with the cleanup ledger at runtime.
- **Screenshot target/theme/dimensions:** current post-merge Material production launch surface; light welcome state; original-resolution PNG matching the target window dimensions.
- **Documentation allowlist:** this manifest, `README.md`, `HANDOFF.md`, `docs/assets/screenshots/`, and `docs/wiki/` only when the refreshed evidence is referenced there.
- **Declared checks:** `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`; focused post-merge tests discovered from repository scripts; lint/typecheck/build checks applicable to touched files; secret scan; screenshot hash and layout inspection.
- **Remote:** `origin` (`https://github.com/codingmachineedge/desktop-material.git`)
- **Expected branch:** `main`
- **Initial baseline:** clean worktree at `44506e89c789d7c93bea6a7224dfdebc29b6308f` (`main...origin/main`), with no linked worktrees reported.

## Runtime ledger

- **Run root:** `C:\Users\Administrator\AppData\Local\Temp\desktop-material-post-merge-20260714`
- **Fixture:** loopback HTTPS provider on `https://127.0.0.1:51897/api/v3`; exact fixture PID `16156`; stopped before cleanup.
- **Headless desktop:** `DesktopMaterialPostMerge-20260714`; created successfully with hidden desktop handle `1092` and closed after capture.
- **Production app:** absolute Electron binary launched with PID `11460`; resolved Material HWND `25495462`; graceful close was unavailable after the server restart, so the saved PID/path was revalidated and terminated exactly as the documented fallback.
- **MCP:** low-level server revision `806d9ba85e4afbc2af58d7499496babfa7c68891`; startup preflight returned `installed=true` and `State=Running`.
- **Background-input result:** Chromium ignored the allowlisted background-posted interactions on the welcome flow. The run stopped at the stable launch surface; no global focus or visible desktop input was used.

## Build and checks

- Exact production build: `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` completed with exit code 0. The MCP client timeout occurred before the 131.86-second webpack process returned, but `C:\Windows\Temp\desktop-material-build-exact-final.log` records all webpack targets successful, packaging skipped, `Built to ...\\out`, and `Done in 131.86s.`
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` — pass.
- Focused core, roadmap, and post-cherry-pick Actions artifact suites — pass.
- The merged redirect lifecycle fixes retain response-body cancellation on 410/redirect paths, and the compatibility tests pass for legacy artifact/PR payloads.

## Screenshot receipt

| Promoted PNG | Dimensions | Bytes | SHA-256 | Inspection |
| --- | ---: | ---: | --- | --- |
| `docs/assets/screenshots/material-post-merge-welcome.png` | 960×660 | 150,763 | `c0e5cd5e56fe0cc839446256a8439789229627bc932b91421b418377fcf68d5a` | Original-resolution inspection passed; nonblank-pixel ratio `1.0`; no private fixture data. |

## Cleanup receipt

The exact fixture PID and app PID were checked against their recorded command/path
before termination. The named hidden desktop was closed, the owned Temp root is
the only disposable path in scope, and no normal desktop was shown, focused, or
used. Branch/worktree cleanup and the final main push are recorded in the final
commit and GitHub Actions receipt after publication.
