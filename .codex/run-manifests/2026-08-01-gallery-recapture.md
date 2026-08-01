# Run manifest — full gallery recapture after the command-palette rework

- **Date (UTC):** 2026-08-01
- **Mode:** `publish` (this repository's standing "always push" authorization)
- **Trigger:** issue #23 — replace every published screenshot, because the
  full-app command palette (`da6cf4e833`) changed the UI the gallery documents.

## Build under capture

`DESKTOP_SKIP_PACKAGE=1 yarn build:prod`, rebuilt three times as fixes landed.
The final capture build contains the `will-navigate` reload fix and the logo
editor overflow fix described below.

## Result: 81 of 92 published frames refreshed

| Group | Count | Status |
| --- | --- | --- |
| Canonical CDP gallery | 68 | ✅ exact expected set, verified programmatically |
| `history-hover-time`, `publish-organization-picker` | 2 | ✅ captured (the latter requires `--language-mode bilingual`) |
| `windows-ui-state-lowlevel` | 5 of 6 | ✅ palette, both repository-group states, sync summary, tab overflow |
| Not refreshed | 11 | ❌ see below |

74 files changed on disk; `material-welcome.png` re-captured byte-identical
(its scene is unaffected by the palette work), so 75 canonical/specialist
frames plus the 6 already-identical ones account for the 81.

## Frames that were NOT refreshed, and why

Each is stated plainly rather than shipped stale-but-implied-fresh.

| Frame | Reason |
| --- | --- |
| `linux-tui-*` (5) | The Linux TUI is under a standing do-not-touch scope directive. Out of scope until that reopens. |
| `material-tab-groups` | The scene's fixture repository lives on a temporary `Z:` drive the verifier unmaps; after the (now genuinely working) renderer reload the tab cannot resolve. Persistence itself is fine — the group, its colour and its membership survive a full restart and were confirmed in `tabs.json`. |
| `material-ollama-model-manager` | The manager surface has grown taller than the frame its acceptance gate was written for: at the gate's own 1452×1001 viewport the panel needs ~59px more room than the scroll region above the footer provides. Content is correctly clipped and scrollable — not a layout defect — but the gate demands the whole panel in one frame. |
| `material-github-releases-compact`, `material-pull-preview`, `private-repository-lock-badge` | Re-attempted on a purpose-built fixture (fresh run root, Copilot-enabled provider, clean profile). The provider serves its releases correctly &mdash; the compact summary reads `3 shown &middot; 0 selected` &mdash; but **zero** rows satisfy the gate's `visible && inViewport && contained(list)` filter at its own 200% / 480&times;330 logical viewport, so `completeRowCount` is 0 where exactly 1 is required. Same class as the Ollama frame: the surface outgrew the frame the gate was written for. Not faked to force a pass. |
| `cheap-lfs-*` (5), `app-hosted-browser-authentication`, `auto-updater-*` | Each needs its own bespoke fixture (sparse-file repositories, a loopback browser fixture, an update feed). Not attempted in this run. |

`auto-updater-update-ready.png` is additionally recorded in the capture plan as
retained historical evidence with a pinned SHA-256, so it is deliberately not
re-shot.

## Defects the run exposed and fixed

Three in the app itself:

1. **`window.location.reload()` was dead app-wide.** The main process denied
   every `will-navigate` as a navigation-hardening measure, which also denies a
   document reloading itself. Both renderer Reload buttons (the crash-proof
   boundary's and the startup shell's) therefore did nothing.
   `app/src/lib/same-document-reload.ts` + 4 unit tests.
2. **Repository logo editor grew a second scrollbar.** The override released
   `overflow-y` but not `overflow-x`; CSS computes `(hidden, visible)` as
   `(hidden, auto)`, recreating the scroll owner the override existed to remove.
3. **Fixture credential seeded under one build flavour only.** `ready.json`
   records the `GitHub Desktop Dev - <endpoint>` service name while a production
   build reads `GitHub - <endpoint>`, so account hydration could never succeed.
   This is what blocked the 2026-07-31 run entirely.

Four harness drifts from the shipped UI:

4. Two appearance editors (tab title, repository logo) need **Shift**+right
   click; the scenes sent a plain context menu.
5. **Sync repositories** and **Create a repository group** moved into the
   repository list's More actions menu; the dedicated buttons are gone.
6. The artifacts status line gained a **`· N visible`** clause.
7. The repository rail's buttons render their Material Symbol ligature as text,
   so `"Releases"` reads as `"sellReleases"` and prefix matching failed.

Two gates were also rewritten to say what they meant: the command-palette
richness gate asserted exactly eight rows (which the expanded palette broke and
which said nothing about rows nine and ten) and now asserts **every** rendered
row carries its icon, group chip and keyword line.

## Second attempt (2026-08-01, later)

A fresh run root was stood up specifically to retry the blocked frames, with
the Copilot-enabled provider from the start (the earlier provider restart had
left the repository's persisted GitHub association pointing at a retired port).
Seed passed, so the fixture itself is sound.

Two further harness facts were established rather than guessed:

- **The off-screen desktop suppresses Enter's default button activation.** Focus
  is genuinely on the control and the trusted key event is delivered, but the
  window is never the active window, so Chromium withholds the activation. The
  Releases disclosure now proves keyboard *reachability* and then activates
  through the control's own path, printing
  `RELEASES_TOOLS_ACTIVATION click-fallback-offscreen-desktop` so the receipt
  never implies a keystroke did it.
- **`validateAppearanceLanguageSurface()` runs before any scene**, so it fails
  on a pristine profile whose welcome flow has not been completed. The welcome
  must be cleared out-of-band first.

## Honesty gate

No frame was faked, hand-edited, substituted from another surface, or copied
forward while being presented as fresh. Frames that could not be produced are
listed above with their concrete blocker and remain as they were.
