# Final bug-hunt verification run

- Run ID: `bug-hunt-20260728-final`
- Mode: `publish`
- Milestone: pull the current default branch, audit the full product and
  repository topology, fix every reproducible defect found in scope, verify the
  resulting Windows application off-screen, then publish a clean `main`.
- Initial source: `origin/main` at
  `80e0209a12f41df8a6a80ef52925b52ab9ecb1b0`
- Integration worktree:
  `C:\Users\cntow\Documents\GitHub\desktop-material-worktrees\bug-hunt-20260728`
- Canonical build worktree:
  `C:\Users\cntow\Documents\GitHub\desktop-material`
- Working branch: `codex/bug-hunt-20260728`
- Expected publication branch: `main`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Repository-affine GitHub account: `DingDingChae`
- Started: `2026-07-28 23:17:46 -04:00`
- Force push: prohibited

## Expected source and UI behavior

- Windows CRLF checkouts pass the Pages push contract without weakening the
  requirement for a standalone `git push`.
- Concurrent Cheap LFS restores keep one truthful visible owner: a stale
  operation cannot overwrite or clear the newer operation's progress.
- A Regex Builder opened from a search control inside a popover remains usable
  after focus, typing, pointer interaction, and Apply; an unrelated portal
  still counts as outside the popover.
- Enter or Space on an overflow row's Customize appearance button performs
  only customization and never switches the highlighted repository tab.
- Empty search results preserve native text-caret keys and expose no ARIA
  relationship to a listbox that is not mounted.
- Shared filter and Regex Builder chrome follows English, Hong Kong Cantonese,
  and bilingual language modes, including a mode change while open.
- Tab-group copy is grammatically truthful at zero, one, and many; shared
  controls meet the repository hit-target convention; focus-container
  descendant moves do not create redundant leave/re-enter renders or a stale
  animation-frame callback.
- The current-source updater-ready gallery frame exists and is generated only
  from the final built application.

## Ordered off-screen interaction plan

1. Reconfirm clean canonical and integration worktrees, branch ancestry,
   worktree/stash inventory, remote URL, repository-affine account, and
   `origin/main`.
2. Use only `scripts/lowlevel_mcp_client.py` against
   `http://127.0.0.1:8765/mcp` for host and GUI actions. Record startup,
   process, scheduled-task, and non-elevated execution preflight.
3. Fast-forward the canonical worktree to the reviewed integration tip, then
   invoke the production build through the MCP `run_command` tool. Stop on any
   failed exit code or missing final artifact.
4. Create a unique disposable fixture root and user-data directory under the
   system Temp directory. Launch the built application on a uniquely named
   off-screen Win32 Headless Desktop; never show or switch to that desktop.
5. Drive background HWND controls, or the repository's app-native Chromium
   verification hook when Chromium rejects background Win32 input. Exercise
   the tab-overflow search, open Regex Builder, focus/type/apply a pattern,
   activate Customize with Enter and Space, and confirm zero-result keyboard
   and accessibility state.
6. Run the current-source updater verifier against the same final build.
   Capture only the approved assets below at original pixels.
7. Inspect every candidate at original resolution, verify expected state,
   absence of unrelated windows/private data, and receipt integrity. Promote
   only passing candidates, then update README, canonical wiki, verification
   index, and `HANDOFF.md`.
8. Run the complete applicable static/unit/build gates, push `main`, verify
   remote ancestry and required Actions, then remove only worktrees/branches
   whose useful tips are ancestors of the pushed default branch.

## Exact write allowlist

- `%TEMP%\DesktopMaterial-bug-hunt-20260728-*`
- `docs/assets/screenshots/auto-updater-current-source-ready.png`
- `docs/assets/screenshots/bug-hunt-regex-builder-popover.png`
- `docs/verification/bug-hunt-2026-07-28/**`
- `README.md`
- `docs/readme-tabs/screenshots.md`
- `docs/wiki/Feature-Gallery.md`
- `docs/verification/README.md`
- `HANDOFF.md`

No untracked file outside the disposable Temp root and the repository paths
listed above is authorized.

## Required verification

- Changed-file Prettier and ESLint
- `npx --no-install tsc --noEmit`
- Focused regression suites for Pages, Cheap LFS routing, popovers, search,
  Regex Builder, tab groups, and focus handling
- Complete application unit suite
- Documentation catalog generation and checked parity generation
- Windows production build through the low-level MCP server
- Off-screen original-pixel visual inspection plus privacy scan
- Branch and final-default CI, including Windows x64, Windows arm64, and
  packaged Windows x64 E2E jobs

## Failure boundary

Any failed command, unexpected repository mutation, missing or stale artifact,
unreadable private fixture, unrelated captured window, receipt mismatch,
visual/accessibility mismatch, or remote ancestry discrepancy blocks
publication or issue closure. Historical images and local source evidence are
not substitutes for a fresh final-build receipt.

## Current-source updater acceptance — 2026-07-29

The updater part of this plan is complete and supersedes its earlier pending
state without changing the historical failure boundary above.

- Runtime source:
  `b069384ad7d8a65d1192ee06859a705fe484c9c8`.
- Publication commit:
  `e3967f1b81ec039624500797dca40a1ab6d98598`.
- Packaged development x64 tree: 6,210 files, 385 directories, 904,084,592
  bytes; SHA-256
  `1b728afc5c53c9a37b63b57af528a71356a726a1115458a458b6284fb05a7cdc`.
- `GitHubDesktop.exe`: 226,677,760 bytes; SHA-256
  `7930378e3675b12f337784dd29018c5110b4b789ec5bb79be2cec6c83a8a0c40`.
- Accepted screenshot:
  `docs/assets/screenshots/auto-updater-current-source-ready.png`, 960×660,
  47,086 bytes; SHA-256
  `0fc9caf5b13eb5b914121090f403c394545e02ea4303b11dd4598afcb3a2dfca`.
- Complete receipt: 12,299 bytes; SHA-256
  `50fe3ed0bcb5287786933a6ae1523021bd1417b1462a3fe5bb48d644d7527f3c`.

The real Electron/Squirrel event path used loopback and a disclosed inert,
no-executable `9000.0.1` full nupkg. The gate proved current development x64
source, frontmost About, onboarding absent, exact ready state, unchanged
protected install/external state, and complete cleanup. File Exit preceded the
graceful direct-quit fallback; **Quit and Install** was not clicked. All owned
process, registry, install, profile, temporary, ready-tree, and desktop
resources were removed, with a zero-window desktop list before close.

Original-resolution review rejected an earlier formally successful frame
because Welcome covered About. The verifier fixes now require the first-run
checklist to be absent and use `elementFromPoint` to attest that About is
frontmost. The legacy updater-migration frame remains separate immutable
historical evidence.

香港粵語：舊 Welcome 遮住 About 嗰張即使形式上跑完都唔收貨；新 gate 要
onboarding checklist 消失兼用 `elementFromPoint` 證明 About 喺最前，真
updater-ready 圖同清理 receipt 齊晒先正式發佈。

## Final regression and security sweep — 2026-07-29

The final application source for local regression was
`d0be4827e0bb636132006d2c361ce845dc579f15`; the only later working-tree
changes were the documentation records already included in the tests.

- Complete test harness: 873/873 discovered files accounted across four
  batches; 7,112 tests reported, 7,111 passed, one intentional skip, zero
  failures; exit 0 in 457.47 seconds.
- Script harness: 192 reported, 190 passed, two intentional skips, zero
  failures.
- Static validation: `yarn lint`, `yarn tsc`, and `yarn test:eslint` passed.
- Evidence contracts: 27/27 updater and Pages verifier contracts plus 17/17
  screenshot/wiki contracts passed.
- Documentation generation: 231 catalog entries regenerated without a tracked
  generated-file change.
- Dependency audit: zero dev-dependency vulnerabilities and zero open GitHub
  Dependabot alerts after moving to `brace-expansion` 5.0.8,
  `markdown-it` 14.3.0, and `linkify-it` 5.0.2.
- Code scanning: nine test-only false positives closed after exact,
  semantics-preserving assertion refactors. Alert 45 remains open because the
  native public client still ships its OAuth secret; device flow is disabled
  on the external app registration, and a secure broker/device-flow migration
  needs app-owner authority and credential rotation.

The complete test run itself found a 40-pixel shared-control override that
contradicted the dedicated 125%–200% zoom layout. The compact GitHub Releases
override is again 32 CSS pixels while normal layouts remain 40 CSS pixels; both
scopes now have non-conflicting regression coverage. It also found two
unformatted updater-verifier sources, which were formatted before the green
lint run.

香港粵語：full suite 最後係 873/873 個檔案、7,112 個 test、0 fail；三個
Dependabot 警報清零，九個 CodeQL 誤報亦用更精準斷言自動關閉。OAuth
secret 嗰個真警報要外部 app owner 開 device flow 或提供 broker，再做
憑證輪換，所以照實保持 open。
