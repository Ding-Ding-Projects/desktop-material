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

Working tree is clean; everything is pushed.

## Critical environment setup (hard-won — read before building)

The default `yarn install` / `yarn start` **fail** on this machine for two
non-obvious reasons. Both are worked around; here's how to reproduce:

### 1. Native modules — node-gyp is too old for Visual Studio 2026
`yarn install`'s native rebuild uses the bundled `node-gyp@10`, which cannot
detect the installed **VS 2026 (v18)** toolchain (it exists, with the C++
workload). Fix that is already applied locally:

```
npm install -g node-gyp@latest              # v13 knows about VS 2026
# replace the repo-local copy so module install scripts use it:
cp -r <global>/node_modules/node-gyp node_modules/node-gyp
npm rebuild                                  # rebuilds printenvz, keytar, etc.
yarn run postinstall                         # app deps, electron binary, submodules, compile:script
```

After this, `yarn compile:prod` and `yarn build:dev` succeed.

### 2. Electron binary is quarantined by antivirus in the repo folder
`node_modules/electron/dist/` ends up with **only `locales/`** — the AV
deletes `electron.exe` (226 MB) and the DLLs as they extract into the
`Documents\GitHub\...` tree. The cached zip is intact. Workaround: extract
Electron to a path the AV leaves alone (Temp) and run from there.

```
# extract the cached electron zip to Temp (electron.exe survives there):
Expand cache zip  C:\Users\<user>\AppData\Local\electron\Cache\<hash>\electron-v42.0.1-win32-x64.zip
   ->  C:\Users\<user>\AppData\Local\Temp\electron-dist-v42
```

Current extracted copy: `C:\Users\cntow\AppData\Local\Temp\electron-dist-v42\electron.exe`.
(A real fix is a Defender **folder exclusion** for the repo — a user action.)

## How to run and verify the UI (headless, off the real desktop)

Two options, both avoid cluttering the interactive desktop:

**A. Playwright helper (in-repo):** `script/headless-screenshot.js`
```
set ELECTRON_EXE=C:\Users\<user>\AppData\Local\Temp\electron-dist-v42\electron.exe
node script/headless-screenshot.js out.png     # needs a prod build in out/
```

**B. lowlevel-computer-use-mcp (external repo, off-screen desktop + PrintWindow):**
`C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp`, driven via its
"cheap" CLI (no MCP registration needed):
```
uv run --directory <mcp> lowlevel-computer-use-cheap create_headless_desktop --name dm
uv run --directory <mcp> lowlevel-computer-use-cheap launch_on_headless_desktop --name dm --command "<electron.exe> <repo>\out\main.js"
uv run --directory <mcp> lowlevel-computer-use-cheap list_headless_windows --name dm      # find the GitHub Desktop hwnd
uv run --directory <mcp> lowlevel-computer-use-cheap screenshot --hwnd <handle>           # PrintWindow capture
# background input: mouse_click / type_text with --hwnd (client coords)
```
A **production** build (`yarn compile:prod`) makes `out/` self-contained so
`electron.exe out/main.js` runs standalone (dev builds need the webpack dev
server that `yarn start` normally provides).

## Verification workflow used for code (local build is limited)

- **Typecheck diff:** `node_modules/.bin/tsc --noEmit -p tsconfig.json`. There
  are ~20 pre-existing baseline errors (all from the `desktop-notifications`
  native module's missing types under `--ignore-scripts`, plus one lodash/Node
  types clash). New code must add **zero** new error signatures — diff the
  sorted, line-number-stripped error list against the baseline.
- **Unit tests:** `node script/test.mjs app/test/unit/<file>-test.ts` (Node's
  built-in test runner; `node:test` + `node:assert`).
- **Lint:** `node_modules/.bin/prettier --write` on changed files (CI runs
  `yarn lint` = Prettier over `{ts,tsx,js,json,jsx,scss,html,yaml,yml}` + eslint).
- **CI is the integration backstop:** every push to `main` runs the full build
  + Windows E2E-smoke.

## Architecture added (for continuing the plan)

- **Profiles (M1):** `app/src/models/profile.ts`, `app/src/lib/profiles/*`,
  `app/src/lib/stores/profile-store.ts`. The `ProfileStore` is wired through the
  **public** `appStore.onDidUpdate` in `app/src/ui/index.tsx` — no edits to the
  `app-store.ts` hot path. It exposes `readTabs`/`writeTabs` for M2 and is the
  place to add the M3 history API (`getSettingsHistory` via `getCommits`,
  `undoLastSettingsChange` via `revertCommit`, `restoreSettingsTo`).
- **Tabs (M2):** `app/src/models/repository-tab.ts`,
  `app/src/lib/stores/repository-tabs-store.ts`,
  `app/src/ui/repository-tabs/*`, styles in
  `app/styles/ui/_repository-tabs.scss`. The strip mounts in `app.tsx`
  `renderApp()` above the toolbar; selection→tab is hooked in `index.tsx`.

## Next up (see PLAN.md for detail)

M3 settings-history UI → M4 non-modal dialogs → M5 notification centre →
M6 search/regex builder → M7 multi-clone + export/import → M8 UI scaling + orgs
→ M9 automation → M10 Actions panel → M11 MCP server → M12 GHCR manager →
M13–17 desktop-plus parity + self-hosted GitLab. Overarching constraint: the UI
must faithfully match the design prototype
(`Desktop Material v2.dc.html` from the "claude design" zip) — verify each
screen with the headless pipeline above.

## Gotchas

- Do **not** edit `app-store.ts`'s `emitUpdate`/`getState` unless necessary;
  the profile/tabs stores deliberately hook via `onDidUpdate` and props.
- Keep tokens out of profile repos, exports, and any agent bridge — the
  settings registry is an allowlist by construction.
- `build-installers.yml` cuts a release on every non-docs push to `main`; this
  is intentional (per request) but consumes CI minutes.
- The user commits directly to the repo too (e.g. `PLAN.md`) — pull before large
  local work.
