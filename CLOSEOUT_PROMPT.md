# Closeout prompt

Copy-ready continuation handoff for the current task on this repository. It
records state up to its own commit; it is not a completion claim.

```
Repository: Ding-Ding-Projects/desktop-material
Branch: codex/shortcuts-shift-f-explorer (based on origin/main 0996944)
Date: 2026-10-04

Objective
- Ctrl+Shift+F opens the current repository in Explorer/Finder again (the
  upstream GitHub Desktop binding); the command palette is back on
  Ctrl+Shift+P. Decided with the user: Pull moves to Ctrl+Shift+L; the change
  is app-only, the Pages site and docs hub keep Ctrl+Shift+F for their
  palettes. Also hunt clipping defects on the surfaces this touches.

Implemented (verified)
- app/src/main-process/menu/build-default-menu.ts: command-palette
  CmdOrCtrl+Shift+P, open-working-directory CmdOrCtrl+Shift+F, pull
  CmdOrCtrl+Shift+L, build-and-run F5 (it silently shared Shift+B with
  compare-to-branch; one of the two could never fire).
- app/test/unit/main-process/menu-test.ts: retargeted accelerator tests plus a
  template-wide "no accelerator registered twice" test. 30/30 focused tests
  pass on Node 22.22.0 (the tsx loader on Node 24 mis-parses JSON, so unit
  tests ran on Node 22).
- Comments in app.tsx and command-palette.tsx; docs articles
  command-palette-full-coverage.md (records the documented departure from the
  shared Ctrl+Shift+F palette contract) and command-palette-coverage-gaps.md;
  README and ROADMAP banners; changelog.json entry; site/index.html hint text
  corrected to what its handler does (Ctrl+F search, Ctrl+Shift+F palette).
- script/generate-docs-hub-catalog.mjs and generate-docs-browser-bundle.mjs
  now await prettier 3's format(); the generators had been broken since the
  prettier bump on 2026-08-24, so six newer docs articles had never reached the
  in-app bundle. Regenerated; docs-browser-bundle-test was red on main (3
  failures) and is green now. 50/50 across bundle, hub catalog and hub page
  tests. tsc --noEmit clean. Prettier/eslint clean on changed lines (app.tsx,
  command-palette.tsx, menu-test.ts, build-default-menu.ts were already
  unformatted at HEAD and were left as they were).

Evidence so far
- Pages site and docs hub captured with Chromium at 360/760/1280, light and
  dark; the site palette opens on Ctrl+Shift+F; no clipping found in the
  captures. The repository's layout audit (script/capture-audit.js) is
  written for the app window and reports page-scroll content as off-viewport,
  so its site findings are noise except: the site tab strip at 1280 keeps its
  add/history buttons past the right edge inside an overflow-x:auto row
  (scrollable, not clipped; recorded, not changed).

Unfinished
- Development build (yarn build:dev) still running; app captures through
  script/capture-app.js (palette open via menu:find-text, English and
  bilingual, 1280 and 700 wide, with audit: steps) are queued in
  scratchpad/app-captures/run.sh. Needs ELECTRON_DISABLE_SANDBOX=1 and
  xvfb-run in this container.
- HANDOFF.md entry, retained captures under docs/assets/screenshots, README
  embed, final integration into main and branch cleanup.

Blockers: none; waiting on the build.

Next safe steps
1. When out/ holds main.js, run the capture script; review PNGs and the
   CJ-* audit findings; fix any real clipping in _command-palette.scss with
   a regression test.
2. Append the HANDOFF entry, retain captures, commit, push, merge to main,
   prove ancestry with git merge-base --is-ancestor, delete the task branch.
```
