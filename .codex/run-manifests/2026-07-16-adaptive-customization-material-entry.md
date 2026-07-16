# Adaptive customization and Material entry verification

- Mode: `publish`
- Milestone: active-profile and repository appearance customization, per-tab
  backgrounds, measured toolbar overflow, Material first-run Welcome, and the
  pure Material public landing page.
- Authorization: direct non-force publication to `origin/main` and the
  repository wiki is authorized by the user's standing "keep git pushing"
  instruction. GitHub inspection and workflow verification use authenticated
  `gh` CLI.
- Integration branch: `codex/customization-release-019f68ca`.
- Fixed verification checkout: `%USERPROFILE%\Documents\GitHub\desktop-material`.
  The run starts only after its unrelated pre-existing task has committed,
  pushed, cleaned its owned GUI resources, and left the checkout clean.
- Remote: `https://github.com/codingmachineedge/desktop-material.git`.
- Required source gate: final fixed-checkout `HEAD`, `origin/main`, built source,
  launched source, and documented source must match exactly before capture.
- Required build: through `http://127.0.0.1:8765/mcp`, run
  `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod` with a 3,600-second tool timeout and
  no dependency download.
- Expected UI states, in order:
  1. 1440×960 Material Welcome task card with product lockup and tonal workspace
     preview; GitHub.com, Enterprise, and continue-locally routes remain
     keyboard reachable.
  2. Continue locally into a deterministic disposable repository that contains
     one build profile and synthetic history only.
  3. Settings → Appearance shows the Material scope note plus all 12
     active-profile defaults; a changed accent/density survives restart and is
     recorded by the active profile's local Git history.
  4. Repository Settings → Appearance shows six independently inheritable
     overrides; an explicit override round-trips through the fixture's local
     `desktop-material.appearance` Git config without changing tracked files.
  5. At a narrow window, Build & Run moves into **More toolbar actions** first
     and Commit & Push follows if needed; the popover is keyboard accessible,
     complete, and unclipped. Widening restores the same mounted actions.
- Allowed GUI actions: resolved-HWND background `mouse_click`, `type_text`,
  `win_send_keys`, `resize_window`, `screenshot`, and revalidated
  `window_action`; if Chromium ignores background input, the isolated
  renderer's loopback CDP endpoint may be used as the documented app-native
  fallback. Never show or switch to the headless desktop.
- Run ID: `desktop-material-adaptive-customization-019f68ca-r2`.
- Owned Temp root: `%TEMP%\desktop-material-adaptive-customization-019f68ca-r2`.
- Owned desktop: `DesktopMaterialAdaptiveCustomization019f68caR2`.
- Owned paths under the run root: disposable Git fixture, isolated user-data,
  temporary launch/control files, raw captures, and cleanup ledger.
- Screenshot targets:
  - `docs/assets/screenshots/material-welcome.png` at 1440×960, light theme.
  - `docs/assets/screenshots/material-customization.png` at 1440×960, light
    theme.
  - `docs/assets/screenshots/material-toolbar-overflow.png` at the smallest
    verified unclipped app-bar width, light theme, with More open.
- Visual acceptance: exact client dimensions recorded; nonblank pixels;
  expected Material state; no clipping, overlap, private path, real account,
  credential, token, or unrelated application content; promoted file inspected
  again at original resolution and SHA-256 recorded.
- Declared checks: focused customization/toolbar/Welcome/Pages tests, repository
  unit suite, TypeScript, targeted and full lint where practical, Prettier,
  `git diff --check`, exact MCP production build, screenshot asset/link gate,
  secret and local-path scan, remote divergence check, and exact-SHA CI/Pages
  verification through `gh`.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `PLAN.md`,
  `MATERIAL_REDESIGN.md`, `HANDOFF.md`, `docs/README.md`,
  `docs/process/roadmap.md`, `docs/wiki/*.md`, `site/index.html`, the Pages
  contract test, this manifest, and the three declared screenshots.
- Wiki publication: push `main` and screenshot assets first, fresh-clone
  `desktop-material.wiki.git`, preserve remote-only `Images/`, overlay reviewed
  canonical Markdown, reject divergence, and push `master` without force.
- Cleanup ledger (complete during run): owned root creation, desktop creation,
  launch PID, resolved HWND, graceful close result, PID fallback if used,
  desktop close result, and verified removal of only owned Temp paths.
