# Run manifest — issue #94 and #80 packaged-build capture evidence

- **Date (UTC):** 2026-07-31
- **Mode:** `publish` (this repository's standing "always push" authorization)
- **Milestone:** produce the real built-app captures that #94 and #80 were
  deliberately held open for. Both code fixes already landed on `main` in
  `b2c107990ac1cc2c130cc683e641ddefbac8cfd6`, which used `Refs` rather than
  `Fixes` precisely because no packaged evidence existed yet.

## Expected UI state

- **#94** — after activating a repository-tab context-menu item whose tooltip
  ButtonHints is currently showing, the menu and its target unmount together and
  **no tooltip remains anywhere in the window**, at both 1440×960 and 1180×820.
  The pre-fix defect left the hint stranded in the window's top-left corner.
- **#80** — the real **Push origin** control with a canonical-remote preflight
  that fails closed: exactly one dispatcher-presented error, **no** generic
  "A background action stopped unexpectedly" toast, and **no** local or remote
  ref movement.

## Ordered background interactions

1. Seed the deterministic provider profile through the existing `seed` scene.
2. `tab-group-tooltip-dismissal-evidence` — open Changes, remove the gallery
   tooltip suppressor, open the tab context menu, wait for the real ButtonHints
   tooltip on the marked `data-issue-94-target` row, activate that exact row,
   then assert no tooltip survives; capture at 1440×960 and 1180×820.
3. `canonical-remote-warning-evidence` — point origin at a rejecting remote,
   drive the real enabled Push origin control, assert one presented error and an
   unchanged ref topology; capture at 1280×860.

Drive only through the renderer (DOM plus `ipcRenderer`-emitted menu events) via
CDP attach. No global mouse/keyboard/focus tools.

## Disposable fixture path

A unique directory below `%TEMP%` created for this run, holding the disposable
Git fixture and an isolated `--user-data-dir`. Recorded in the cleanup ledger on
creation and removed after capture, only after resolving each path beneath the
run root.

## Screenshot targets / theme / dimensions

| Output | Scene | Theme | Language | Size |
| --- | --- | --- | --- | --- |
| `tab-group-tooltip-dismissed-1440x960.png` | `tab-group-tooltip-dismissal-evidence` | dark | english | 1440×960 |
| `tab-group-tooltip-dismissed-1180x820.png` | `tab-group-tooltip-dismissal-evidence` | dark | english | 1180×820 |
| `canonical-remote-warning-1280x860.png` | `canonical-remote-warning-evidence` | dark | english | 1280×860 |

`canonical-remote-warning-evidence` **requires** `--language-mode english` and
fails closed otherwise; the tooltip scene imposes no language constraint, so one
english run covers both. Both scenes set their own viewports internally and
restore the capture viewport afterwards.

These are **issue evidence**, not guided-gallery members. They are posted to the
issues and retained under `docs/verification/`; they do not enter
`docs/assets/screenshots/` and therefore do not change the 86-target gallery
contract.

## Documentation allowlist

`HANDOFF.md`, this manifest, and a new
`docs/verification/issue-94-80-evidence-2026-07-31/README.md` holding the
receipt (build id, commit, per-capture SHA-256, and the assertion each frame
proves).

## Tests

`app/test/unit/ui/button-hints-test.tsx`,
`app/test/unit/observed-operations-test.ts`,
`app/test/unit/app-network-action-boundary-test.ts`,
`app/test/unit/push-network-rejection-test.ts`,
`app/test/unit/scheduled-automation-repository-switch-test.ts`, plus
`node --test .codex/verification/capture_gallery_cdp_contract.test.js`.

## Remote / branch

`origin` → `Ding-Ding-Projects/desktop-material`, branch `main`, no force push.

## Dirty-state baseline

Clean at manifest time; `main` at `62b629a85e` is proven contained in
`origin/main`.

## Honesty gate

If Chromium refuses background input, or a capture cannot be produced, the
frames are **not** faked or substituted from another surface: the blocker is
recorded here and on the issues, and #94/#80 stay open.

## Outcome — blocked, no captures produced

**Neither capture was produced. #94 and #80 remain open.** No frame was faked,
cropped from another surface, or substituted.

### What did work

| Step | Result |
| --- | --- |
| Production build (`DESKTOP_SKIP_PACKAGE=1 yarn build:prod`) | ✅ exit 0, 664.80 s, staged to `out/` |
| `prepare_p0_fixture.ps1` | ✅ 15-commit deterministic fixture, bare repo, `main` + `feature/material-verification` |
| `start_p0_provider.ps1` | ✅ provider live on loopback `127.0.0.1:58167`, `provider/ready.json` written |
| `clone_p0_fixture.ps1` | ✅ provider-backed clone with both submodules, clean worktree |
| Headless desktop + app launch | ✅ real Electron on an off-screen Win32 desktop, isolated `--user-data-dir`, CDP up on 9337 |
| Harness presentation gate | ✅ `PRESENTATION_STATE` passed (`theme light`, `language english`) |
| Harness language-surface gate | ✅ `LANGUAGE_SURFACE` passed |
| `seed` scene | ❌ **blocked** |

### The blocker

```text
CAPTURE_FAIL Error: Disposable fixture account/repository hydration failed:
{"appStore":true,"accountCount":0,"fixtureAccountMatched":false,
 "fixtureTokenPresent":false,"fixtureCopilotFeatureEnabled":false,
 "repositoryMatched":false,"selectedRepositoryMatched":false}
  at seedProfile (.codex/verification/capture_gallery_cdp.js:2458)
```

`seedProfile` writes the fixture account into `localStorage.users` and then
requires the app store to have hydrated it. `accountCount` stayed `0` and
`fixtureTokenPresent` stayed `false` across:

1. a renderer reload (the harness's own path),
2. writing the fixture token to the Windows credential store under the exact
   `credentialService` from `ready.json`
   (`GitHub Desktop Dev - http://localhost:58167/api/v3`, via `CredWriteW`
   type `GENERIC` — `cmdkey` cannot accept a target name containing `: ` and
   spaces), and
3. a full app restart against the already-seeded profile.

So the account-hydration prerequisite is something beyond `localStorage.users`
plus a credential-store entry. Two things worth checking next: whether
`TokenStore` composes its keytar service/account differently from the
`credentialService` string in `ready.json`, and whether hydration requires the
provider's `/user` endpoint to be reached with that token during app boot (the
provider was running and reachable, but its request log was not inspected for a
rejected `/user` call).

### Notes for the next attempt

- Two harness prerequisites that are **not** documented in the skill and cost
  most of this run:
  - `--theme dark` cannot be satisfied on a host whose OS theme is light.
    `localStorage.theme` alone does not move `document.body`'s `theme-*` class;
    the renderer applies it through `setNativeThemeSource` → Electron
    `nativeTheme`. The presentation gate therefore times out with
    `observedTheme: light` while `persistedTheme: dark`. Requesting `light`
    passed immediately.
  - The pre-scene `validateAppearanceLanguageSurface()` fires `show-preferences`
    **before** any scene runs, so it fails on a pristine profile's first-run
    welcome screen. `has-shown-welcome-flow: '1'` must be staged before the
    harness starts (only `--canonical true` skips this validator).
- Everything created by this run was removed: both headless desktops closed,
  app and provider PIDs terminated, the fixture credential deleted
  (`CredDeleteW` → 0), and both owned Temp roots deleted. `git status` clean
  apart from this manifest.
