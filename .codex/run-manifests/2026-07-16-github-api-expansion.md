# GitHub API expansion publish run

- Run ID: `20260716-github-api-expansion-01`
- Mode: `publish`
- Milestone: publish a complete GitHub API Explorer backed by the current 1,206-operation REST description and the existing safe GraphQL contract; visibly include all 10 operations added since the pinned March audit; restore the release-transfer IPC/account wiring found missing during the same end-to-end audit
- Expected UI state: a repository-bound **GitHub API** rail section shows the complete searchable catalog, a **New since March audit** filter returns exactly the 10 discovered operations, the selected repository custom-pattern read is expanded with synthetic owner/repository coordinates, and a deterministic synthetic response is safely rendered; signed-out, loading, bounded error, empty-search, mutation-review, and GraphQL states remain reachable and tested
- Ordered background interactions: start exact MCP server preflight; run the reproducible development build; create an owned disposable Git fixture and isolated user-data directory; create one uniquely named headless desktop; launch the built Electron app by absolute path; resolve its HWND dynamically; take a stable HWND-bound client capture; use the retained bounded CDP verifier as the documented app-native hook for resize/navigation because generic Win32 window management cannot resolve handles on this alternate desktop; revalidate with an HWND-bound final capture; close by revalidated HWND with the saved-PID fallback; remove only owned temporary paths
- Disposable fixture root: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-p0-ui-20260716-github-api-expansion-01`
- Headless desktop: `DesktopMaterial-GitHubAPI-20260716-01`
- Screenshot target: `docs/assets/screenshots/material-github-api-explorer.png`
- Screenshot requirements: client-only, 944 x 1000, repository-default light theme, populated deterministic state, nonblank, unclipped, and free of private data; the 944-pixel width is the exact stable client width supported by the isolated headless desktop and matches prior tall repository-workflow evidence
- Documentation and implementation allowlist: this manifest; `.codex/audits/github-rest-operations-2026-03-10.json`; `script/generate-github-api-operation-catalog.mjs`; GitHub API catalog/workbench/API files under `app/src/lib/`; GitHub API Explorer files under `app/src/ui/github-api-explorer/`; `app/src/lib/app-state.ts`; `app/src/ui/repository-sections.ts`; `app/src/ui/repository.tsx`; `app/src/main-process/main.ts` and a focused release-transfer IPC registration helper if extracted; `app/styles/_ui.scss`; a focused Explorer stylesheet under `app/styles/ui/`; matching focused tests under `app/test/unit/`; the owned fake-provider/verifier files under `.codex/verification/`; `README.md`; `site/index.html`; `docs/wiki/User-Guide.md`; `docs/wiki/Feature-Gallery.md`; `HANDOFF.md`; the final promoted screenshot
- Tests: generator/catalog exact-count and 10-operation delta contracts; workbench path/mutation/response bounds; API execution; Explorer interaction, account binding, stale cancellation, response, mutation review, empty and error UI; repository section order/completeness; release-transfer IPC registration/account seeding; fake-provider routes; TypeScript `--noEmit`; focused ESLint/Prettier/style contracts; repository unit gates; reproducible unpackaged production build
- Remote: `origin` (exact URL and active GitHub account to be recorded during preflight)
- Expected branch: `main`
- Publication authorization: the active goal explicitly says to always git push and screenshot as work progresses

## Initial baseline and automation preflight

- Default checkout: `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Initial project HEAD: `eee0c23b66f62f210591ef33831b7a76893881af`
- Initial dirty state: clean before this manifest; afterward only the run manifest is untracked
- Branch/remote state: local `main` and `origin/main` both at the initial HEAD; upstream is `origin/main`; zero observed divergence
- Remote URL: `https://github.com/codingmachineedge/desktop-material.git`
- Active GitHub account: `codingmachineedge`; HTTPS Git operations; `gist`, `read:org`, `repo`, and `workflow` scopes reported by GitHub CLI
- Branch/worktree/stash audit: only local `main`, only remote `origin/main`, one default worktree, and no stashes
- MCP startup: `ok: true`, scheduled task `LowLevelComputerUseMCP` running
- Scheduled MCP action: `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp\.venv\Scripts\python.exe -m lowlevel_computer_use_mcp.server --http --host 127.0.0.1 --port 8765`
- Scheduled MCP working directory: `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP checkout HEAD: `8d6940be6a5f6e7c37de3f73acd2259fa7651efe`
- All three MCP preflight calls returned `client_ok: true`; the two `run_command` calls also returned code `0` without timeout

## Current official API discovery

- Official stable REST version: `2026-03-10`; GitHub currently lists it and `2022-11-28` as supported versions.
- Official OpenAPI repository: `github/rest-api-description`; current `main` is `03ca9c1cac754ec9b8369dc75de8a8c753c6e087`; the current `api.github.com.json` file revision is `bf7e00771498` from 2026-07-16.
- Previous pinned inventory: 790 paths, 1,196 operations, 49 tags, 51 categories, and 270 webhooks.
- Current official inventory: 796 paths, 1,206 operations, 49 tags, 51 categories, and 270 webhooks.
- Exact additions: `copilot/copilot-enterprise-repos-one-day-report`; `copilot/copilot-organization-repos-one-day-report`; `secret-scanning/bulk-create-org-custom-patterns`; `secret-scanning/bulk-create-repo-custom-patterns`; `secret-scanning/bulk-delete-org-custom-patterns`; `secret-scanning/bulk-delete-repo-custom-patterns`; `secret-scanning/list-org-custom-patterns`; `secret-scanning/list-repo-custom-patterns`; `secret-scanning/update-org-custom-pattern`; `secret-scanning/update-repo-custom-pattern`.
- Runtime integrity discovery: release asset upload/download/cancellation are fully implemented and renderer-wired, but `app/src/main-process/main.ts` currently omits their IPC registration and active-account seeding. The milestone restores both and adds registration coverage.

## Production verification and accepted evidence

- The exact required MCP build command completed twice with `client_ok: true`, `returncode: 0`, and `timed_out: false`; the final rebuilt-source run completed in 126.5 seconds and emitted the minimized main/renderer/crash/CLI/highlighter bundles to `out`.
- The retained fixture exposed the current strict-origin matching contract by design: the repository remote was rebound from its synthetic public identity to the exact owned `http://localhost:57597` account origin and its no-longer-needed proxy was removed before the final run. This kept account/repository association fail-closed and exercised the current origin/port security rule.
- Provider PID `10232` (launcher `11380`) served only loopback port `57597`; the final Electron launch PID was `14260`, its runtime-resolved HWND was `40108488`, and its owned CDP port was `57776` on the uniquely named `DesktopMaterial-GitHubAPI-20260716-01` desktop.
- The first rebuilt interaction caught and rejected a real navigation defect: three legacy click/keyboard paths omitted the new section when converting visual indexes. The implementation now centralizes all click, numeric-shortcut, and Ctrl+Tab mapping in `getVisibleRepositorySections`; its regression contract, Explorer suite, TypeScript, formatting, and ESLint passed before the final rebuild.
- Final app-native receipt: physical client `944×1000`; CSS viewport `983×1041` at device pixel ratio `0.9599999785`; document/body client and scroll widths all `983`; horizontal-overflow and outside-viewport arrays empty; exact catalog text `10 of 10 shown`; 10 operation rows and 10 `New` badges; selected operation `secret-scanning/list-repo-custom-patterns`; expanded path `repos/material-fixture-owner/material-fixture/secret-scanning/custom-patterns`; response `200 OK`; both synthetic custom-pattern names present; no rendered error or forbidden credential text.
- The request log recorded four authorized, bodyless `GET /api/v3/repos/material-fixture-owner/material-fixture/secret-scanning/custom-patterns` responses at status 200 across the probe and repeated final verifier gates. No request body hash or private external endpoint was recorded.
- The authoritative accepted client-only app-native capture is `docs/assets/screenshots/material-github-api-explorer.png`, `944×1000`, 129,807 bytes, SHA-256 `0115fb552e5212d7d326eb36197e4499f03dd99707b0ebb18c5c3fddf6082228`. Original-resolution inspection confirmed the API rail selection, exact new-operation count, selected repository custom-pattern operation, 200 response, deterministic synthetic content, light theme, wrapping, and absence of private data. A later HWND `PrintWindow` frame was correctly rejected because it returned stale Changes pixels despite transport success.

## Cleanup ledger

- The exact development credential service/login was deleted and read back absent before fixture removal.
- Generic `window_action` cannot resolve alternate-desktop HWNDs in this fixed MCP revision, so each revalidated graceful-close attempt failed closed and only the saved Electron PID was terminated as the documented fallback. Final PID `14260` and provider PID `10232` were absent; ports `57776` and `57597` had zero listeners.
- `close_headless_desktop` returned `closed: true`; a subsequent list call returned Win32 not-found. The containment-checked run root `C:\Users\Administrator\AppData\Local\Temp\desktop-material-p0-ui-20260716-github-api-expansion-01` was removed by the retained cleanup helper and verified absent. The MCP service itself remained running.
