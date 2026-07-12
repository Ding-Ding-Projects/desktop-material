# Desktop Material — Session Handoff

This document captures the working state and the environment setup needed to
build, run, and verify the app. The full feature plan lives in
[`PLAN.md`](PLAN.md); this file is the "how to pick up where we left off".

## What shipped this session (all on `main`)

| Area | Commit(s) | Notes |
| --- | --- | --- |
| **M0 — Publishing** | `d367c92` | README rewrite, Material Design 3 GitHub Pages site under `site/` (live at https://codingmachineedge.github.io/desktop-material/), wiki sources under `docs/wiki/`, screenshots in `docs/assets/screenshots/`, CI enabled on `main`. |
| **Installer + release** | `52b2abf` (+ `75a28a5`) | `.github/workflows/build-installers.yml` builds the **Windows** installer and publishes a **full GitHub release on every push to `main`** (direct-to-release, no artifacts; macOS dropped). |
| **CI fixes** | `e50a6df` | Formatted a pre-existing Prettier violation (`app/styles/ui/_button.scss`); switched CI off the unavailable `macos-14-xlarge` runner to `macos-14`. |
| **M1 — Per-account profiles** | `9826361` | Each account gets a git repo under `userData/profiles/<sanitized>/` that auto-commits UI-settings changes. Verified: 15 unit tests, built + passed Windows E2E-smoke on CI. |
| **M2 — Repository tabs** | `18b3876`, `007845c` | Browser-style tab strip + per-tab "Tab text style" editor. **Verified headlessly matching the design prototype.** |
| **M3 — Settings history manager** | `4114fa2`, `b89b9ce`, wiki `c818fd5` | Shared Git-backed history UI, lazy diffs, logical undo/redo, restore-to-point, audit commits, menu/shortcut wiring, tab/settings reconciliation, live screenshot, and published README/Pages/wiki docs. Verified live on an isolated Win32 Headless Desktop. |
| **M4 — Non-modal dialogs** | `690ea60a`, `e9cf5b3d` | Non-modal floating dialog framework: drag-by-header, bring-to-front, cascade, pointer-events-none layer so the app stays interactive behind open dialogs. Preferences rebuilt as the MD3 940×660 dialog (left rail + Active chip + pill footer). Verified live headless: the app is interactive behind open dialogs. |
| **M18 — MD3 shell visual clone** | 17 commits `…`→`80be0f6e` | Full visual clone of the design prototype: MD3 color/motion/shape tokens + 16 keyframes; app-bar branding + pill inline menu; floating pill toolbar with repo/branch chips + a sync pill with an ahead badge; left icon navigation rail (Changes badge/History/Branches/Settings/avatar); floating radius-24 workspace cards; full MD3 workspace surfaces (tri-state checkboxes, tonal status chips, token diff colors, inverse-surface undo banner, redesigned welcome flow + blank slate); repository & branch left side sheets; clone dialog restyle + tab-style popover. Verified live headless. |
| **Conformance Waves A/B** | `420e199`→`b5e0300` | Design-conformance sweep vs the prototype: composer 2-row description + ellipsized commit label; tab geometry (38px raised active tab); app-bar chip stagger + chevron rotate; rail icons 22px; Settings footer order; Changes panel header (H1 + count chip); diff header subline + `+adds`/`−dels` chips + open-in-editor; Settings branded "Settings" with a full-height rail; repository/branch side-sheet FAB + current markers + headers; inline tab-format button + 38px title bar. Fixed a real E2E regression from the non-modal work (`ebfd6bd`: dialog `data-busy` gates the app during in-flight ops). |
| **Gitignore manager** | `35cc6d9`, `2a75fa2` | Per-repo `.gitignore` manager (Repository → Manage .gitignore…): CC0 template catalog (~19, generated from the bundled github/gitignore), repo-content auto-suggest, searchable catalog, marker-section merge (idempotent/reversible). 37 tests. Verified live headless. |
| **Unhide gated features** | `0e63c2b`→`d2998bb` | Fork ships a **production** channel despite the beta tag, so beta-gated features were hidden. Flipped safe ones on: README-overwrite warning, previous-tag suggestions, accessible list tooltips, unhandled-rejection reporting, WSL shell detection, default git-hooks env. Plus the update-URL fix (stop polling upstream's updater). |
| **One-click Build & Run** | `bedd4ea`→`45bcba5` (+ `215523c`) | Detect build profile (node/pnpm/yarn, rust, go, dotnet, python, java, make/cmake) → auto-gitignore build outputs → install → build → run, streamed to an MD3 log panel; bounded auto-fix; **auto-install missing toolchains** (winget/corepack) with single-prompt UAC pre-elevation; **multiple .NET project picker**; **minimize** the log panel; per-repo Build & Run settings tab. |
| **M8 (partial) — UI scaling + auto-fit** | `44e450a` | Fixes "too big on small windows": `lib/zoom.ts`, AppStore as single zoom owner, 150ms-debounced auto-fit multiplier (on by default), Appearance 50–200% slider + auto-fit switch, composes with Ctrl +/−/0. |
| **De-stock (full Material)** | `749949b`, `3cb437c`… | Re-tinted the remaining stock surfaces through Material tokens (both themes): tooltips (vars were never remapped), autocomplete popup, segmented controls, split-buttons, diff-options, author-input, banners, app-menu rows, dialog internals, History/CI surfaces. |
| **M5 — Notification centre** | `6f5230a`, `14597ca` | Bell + right side sheet backed by its own local git repo; unread badges, mark read/unread, delete, mark-all; git-backed notification history (shared VersionedStoreHistory). |
| **M6 — Search + regex builder** | `6b9e76b`, `40e59df` | Fuzzy/substring/regex filter modes + case toggle + per-list filter chips across search bars; full regex builder (blocks, flags, live tester); inline MD3 filter chip row on Changes. |
| **User-feedback fixes** | `40e59df`→`c844912` | Account-picker selection by identity (bug); Word-like tab editor (searchable font picker, full color picker, size that enlarges the tab); settings/notification history clickability; fork auto-update via the GitHub releases feed. |

Working tree is clean; everything through `c844912ba2` is pushed. **Batch 2 is building in parallel worktrees** (layout/clipping fixes, cramped search row, History search bar, multi-remote manager, submodule manager, tab close-left/right/others + close-containing-regex, and M7 multi-clone). The full outstanding queue (with per-item detail) lives in the session task list; the milestone plan is [`PLAN.md`](PLAN.md).

## Working method (this session)

- **Parallel worktrees for speed.** Independent, file-disjoint features are built by concurrent Opus agents, each in its own git worktree (no shared `node_modules`, so agents self-review types/imports and a **merge integrator** runs `yarn lint` + `tsc` + the unit suite on `main` after each `--no-ff` merge, fixing trivia, then pushes and removes the worktree). Two waves have landed this way (5-feature + 6-feedback); a third is in flight.
- **Verification runtime.** The unit runner works on the system Node with `node script/test.mjs --no-experimental-webstorage` (Node 26 ships a `localStorage` global that otherwise collides); it **hangs at the tail** after reporting — scan the streamed output for failures (ignore only the environmental `get-shell-env` pwsh test) and kill the lingering worker. Latest full-suite baseline: **2,165 passing / 0 new failures**.
- **Headless viewport.** The default off-screen launch window is below the app's 1240×700 minimum at 150% display scale, which makes layouts falsely look clipped/too-big. Launch Electron with `--remote-debugging-port=9223` and resize via CDP page eval `window.resizeTo(2100,1250)` before judging (Electron's CDP lacks `Browser.setWindowBounds`); measure the real DOM over CDP. Only compare at ≥1240×700 CSS px.

## Published M3 state

- Published M3 content SHA: `b89b9cedb2d232b2ea313f7bc11b7508c1573d54`
  (the later handoff-only update does not alter the shipped app, site, or image).
- Code SHA `4114fa2bb00d8dfc67c84b7ed16d0f506050bb30` passed
  [CI](https://github.com/codingmachineedge/desktop-material/actions/runs/29176909891)
  and [Build Installers](https://github.com/codingmachineedge/desktop-material/actions/runs/29176909881).
- Documentation SHA `b89b9cedb2d232b2ea313f7bc11b7508c1573d54`
  passed [CI](https://github.com/codingmachineedge/desktop-material/actions/runs/29177022962)
  and [Deploy Pages](https://github.com/codingmachineedge/desktop-material/actions/runs/29177022975).
- The [live project site](https://codingmachineedge.github.io/desktop-material/)
  and its Settings history image return HTTP 200. The live PNG is 108,337
  bytes and exactly matches the tracked SHA-256
  `abbcc34aa02949d2144f008c9ed10b4414f721843890643d65d8e0b9360c3da1`.
- [Release `v3.6.3-beta3-build.8`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-build.8)
  is public, non-draft, non-prerelease, cites the exact code SHA, and contains
  three non-empty GitHub-digested assets (NUPKG, EXE, MSI).
- The [GitHub wiki](https://github.com/codingmachineedge/desktop-material/wiki)
  is initialized and all six canonical pages are published at wiki commit
  `c818fd5b6859a12ed297fe93334bd5a434fe9cc8`. Live `Home` and `User Guide`
  return HTTP 200, contain the M3 Settings History content, and render the exact
  raw-main screenshot URL.

## Published state after the visual clone (M18 shell + M4)

- The MD3 shell + M4 code shipped through `80be0f6e02`.
- A docs-accuracy pass then rewrote **README**, the **`site/`** Pages source, and the wiki
  **Home** and **User Guide** to split **Shipped today** (multi-account M1, repo tabs M2, settings
  history M3, non-modal dialogs M4, the full MD3 shell) from **On the roadmap** (notification centre,
  regex builder, multi-clone, automation, Actions panel, MCP server, gitignore manager, Build & Run,
  org support, UI scaling, GitLab/Bitbucket, desktop-plus parity). This corrects earlier docs that
  described notification centre, automation, and regex search as if shipped.
- New hero + gallery screenshots are tracked under `docs/assets/screenshots/`
  (`material-workspace-changes.png` is the hero). The wiki pages reference them via raw-main URLs.
- The Automation, Regex Guide, and Agent API wiki pages remain as roadmap design docs and are now
  labelled **Planned** on the wiki Home page.

## Critical environment setup

- Use the repository runtime from `.tool-versions` (**Node 24.15.0**). The M3 full
  suite was verified with the bundled Node 24.14 runtime. System Node 26 exposes an
  experimental global `localStorage` that collides with the test runner; run the unit
  suite with **`node --no-experimental-webstorage`** (the test-runner flag that
  disables that global) to run green on Node 26. Node 24.15.0 remains the release
  validation runtime.
- `node_modules/electron/dist/electron.exe` is present and the production build
  runs from the repository. If a future install loses native modules on VS 2026,
  refresh the repo-local `node-gyp` from a current global install, then run
  `npm rebuild` and `yarn run postinstall`.
- Do not download dependencies during an unattended capture. The reproducible
  build uses only installed packages.

## How to run and verify the UI without touching the real desktop

Use the exact lowlevel MCP checkout at
`C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp` (verified commit
`beed66ca6ed2503e6170ee1e1158247f1c2f0140`) through its HTTP endpoint
`http://127.0.0.1:8765/mcp`. The repeatable client and safety workflow live in
`.codex/skills/verify-desktop-material-headless/`.

1. Build through MCP `run_command`:
   `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`.
2. Create unique Temp fixture/user-data paths and one uniquely named Win32
   Headless Desktop.
3. Launch `node_modules/electron/dist/electron.exe --disable-gpu out/main.js`
   on that desktop with the isolated paths, then discover the current HWND.
4. Use only HWND-bound background clicks/keys and PrintWindow screenshots. Never
   call `show_headless_desktop`, focus a normal window, or send global input.
5. Inspect the Temp screenshot at original resolution before promoting it, then
   revalidate the exact HWND/PID, close the app and desktop, and remove owned
   Temp paths.

## M3 verification evidence

- Focused M3/regression suite: **56/56 passed**.
- Full unit suite under Node 24.14: **1,519 tests; 1,518 passed, 1 skipped, 0 failed**.
- Standalone popup regression under Node 26: **26/26 passed**.
- `yarn tsc --noEmit --skipLibCheck`: passed.
- Repository-wide `yarn lint`: passed.
- Production unpackaged build through the exact lowlevel MCP server: passed;
  webpack emitted `out/` successfully.
- Live UI smoke: Settings history opened on an isolated Headless Desktop, then
  Undo and Redo were exercised with HWND-bound background clicks.
- Promoted screenshot: `docs/assets/screenshots/settings-history-manager.png`,
  **1443×992**, SHA-256
  `abbcc34aa02949d2144f008c9ed10b4414f721843890643d65d8e0b9360c3da1`.
- `git diff --check` and the changed-file secret scan passed.

## Visual clone + M4 verification evidence (at `80be0f6e02`)

- Full unit suite: **1,521 tests; 1,520 passed, 1 skipped, 0 failed** (run under Node with
  `--no-experimental-webstorage`; see the environment note above).
- Production unpackaged build through the exact lowlevel MCP server: passed; webpack emitted `out/`.
- Live UI smoke on an isolated Win32 Headless Desktop, driven only by HWND-bound background input:
  - The **MD3 shell** renders — icon navigation rail, floating pill toolbar with repo/branch chips
    and the sync pill, repository tabs, and the floating Changes card.
  - The **repository and branch side sheets** open and list their content.
  - **Preferences** opens as the MD3 940×660 dialog with the left rail, Active chip, and pill footer.
  - **Non-modal interactivity confirmed**: with a dialog open, the app behind it still responds to
    input (the pointer-events-none dialog layer works as designed).
- Promoted screenshots (all fresh, verified): `material-workspace-changes.png` (hero),
  `material-history.png`, `material-welcome.png`, `material-settings.png`,
  `material-repositories-sheet.png`, `material-branches-sheet.png`.

## Architecture added (for continuing the plan)

- **Profiles (M1):** `app/src/models/profile.ts`, `app/src/lib/profiles/*`,
  `app/src/lib/stores/profile-store.ts`. Settings writes, tab writes, flushes,
  history reads, and history mutations share one per-profile queue so concurrent
  changes cannot be folded into an undo/redo operation or lost.
- **Tabs (M2):** `app/src/models/repository-tab.ts`,
  `app/src/lib/stores/repository-tabs-store.ts`,
  `app/src/ui/repository-tabs/*`, styles in
  `app/styles/ui/_repository-tabs.scss`. The strip mounts in `app.tsx`
  `renderApp()` above the toolbar; selection→tab is hooked in `index.tsx`.
- **History (M3):** `app/src/ui/version-history/*` is the reusable history UI;
  `app/src/ui/settings-history/*` is its settings wrapper. Profile history APIs
  provide paged commits, selected-file diffs, logical multi-level undo/redo, and
  restore-to-point without rewriting history. Menu, popup, dispatcher, and app
  store wiring make Settings history non-modal. Restores rebind an active tab by
  repository ID/path and refresh active diffs when whitespace settings change.

## Next up (see PLAN.md and the session task list for detail)

Shipped through `c844912ba2`: the MD3 shell clone, M4 dialogs, conformance A/B, gitignore manager,
unhide, Build & Run, UI scaling/auto-fit, the full de-stock pass, **M5** notification centre, and
**M6** search + regex builder, plus a wave of user-feedback fixes (account-picker bug, Word-like tab
editor, history clickability, fork auto-update).

**In flight (batch 2, parallel worktrees):** dark-theme clipping fixes (file-row + New-branch FAB),
menu-divider cleanup, cramped search-row layout, **History search bar**, **multi-remote manager**,
**full submodule manager**, tab close-left/right/others + close-containing (regex), and **M7**
multi-clone + export/import.

**Queued (from user feedback + PLAN):** version-history search/filters/regex (settings + notification,
shared component); branch search + "checkout branch as worktree"; then **M8** GitHub orgs → **M9**
automation (one-click commit+push, schedulers, merge-all) → **M10** Actions panel → **M11** agent
server (MCP + REST + CLI) → **M12–M15** desktop-plus parity → **M16** multi-window → **M17**
GitLab/Bitbucket + self-hosted GitLab PAT.

Overarching constraint: the UI must faithfully match the design prototype. It was adapted from
`Desktop Material v2.dc.html` in the supplied `Material Design UI Recreation.zip`; verify each
screen with the headless pipeline above (resize the window past 1240×700 first). The
screenshot/verify scripts live in the session workflow dir.

## Gotchas

- Keep settings, tabs, flushes, and history actions on the same profile queue;
  splitting them reintroduces lost updates and corrupt undo/redo semantics.
- Preserve restored-tab reconciliation by both repository ID and normalized path,
  and refresh active diffs after restoring whitespace preferences.
- Keep tokens out of profile repos, exports, and any agent bridge — the
  settings registry is an allowlist by construction.
- `build-installers.yml` cuts a release on every non-docs push to `main`; this
  is intentional (per request) but consumes CI minutes.
- The user commits directly to the repo too (e.g. `PLAN.md`) — pull before large
  local work.
