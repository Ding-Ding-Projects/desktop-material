# Adaptive customization and Material entry verification

- Mode: `publish`
- Milestone: active-profile and repository appearance customization,
  Word-style tab appearance, measured toolbar overflow, Material Welcome and
  landing surfaces, guarded tab close/arrange controls, Actions cancellation,
  reviewed rebase, repository-account propagation, bounded OAuth scopes, and
  compact Repository Tools, Remote Manager, and Regex Builder corrections.
- Authorization: direct non-force publication to `origin/main` and the
  repository wiki is authorized by the user's standing "keep git pushing"
  instruction. GitHub inspection and workflow verification use authenticated
  `gh` CLI.
- Integration branch: `codex/customization-release-019f68ca`.
- Fixed verification checkout: `%USERPROFILE%\Documents\GitHub\desktop-material`.
  Its tracked state must be clean at launch. The unrelated pre-existing
  untracked OAuth run-manifest file is outside this run's allowlist and remains
  untouched throughout build, launch, capture, and cleanup.
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
  6. The existing regex **Close Tabs Containing…** action and the guarded
     literal **Close all tabs except those containing…** action coexist. Blank
     and zero-match inverse queries cannot confirm; pinned tabs remain
     protected; live kept/closed/protected counts, bounded preview, Enter,
     Escape, and focus return are verified.
  7. **Arrange tabs** exposes pin/unpin, drag within a pin group, named
     first/left/right/last controls, and all six one-shot label/opened/status
     sorts. Order, selection, pinning, and opened timestamps survive restart in
     the isolated window/profile scope without continuously reshuffling.
  8. A stateful loopback GitHub provider supplies one synthetic exact account,
     repository, and cancellable workflow run. The Actions confirmation names
     workflow/run/repository/ref/actor/commit; the observed network contract is
     exact-run GET, one normal POST, then bounded GET polling to `completed /
     cancelled`, with no force-cancel request.
  9. Repository Settings persists the exact synthetic `endpoint#id` account
     key. Provider Triage resolves the emitted replacement repository
     immediately and on refresh without an unbound picker or an overwrite of
     the explicit binding.
  10. **Rebase current branch…** searches a synthetic target branch and shows
      current→base, ahead/behind counts, and a bounded replay preview. Clean
      preflight remains cancellable, protected guidance is named, and a
      deliberately stale/dirty state cannot cross the Git mutation boundary.
  11. At the supplied Remote Manager viewport, compact/zoomed Regex Builder,
      and short Repository Tools viewport, every modal/body satisfies
      `scrollWidth <= clientWidth`; readable fields retain sane widths; named
      controls and final actions remain reachable; dialogs stay inside the
      renderer; vertical scrolling reaches Diagnostics/test/footer content.
- Allowed GUI actions: resolved-HWND background `mouse_click`, `type_text`,
  `win_send_keys`, `resize_window`, `screenshot`, and revalidated
  `window_action`; if Chromium ignores background input, the isolated
  renderer's loopback CDP endpoint may be used as the documented app-native
  fallback. Never show or switch to the headless desktop.
- Run ID: `desktop-material-adaptive-customization-019f68ca-r3`.
- Owned Temp root:
  `%TEMP%\desktop-material-p0-ui-customization-019f68ca-r3`.
- Owned desktop: `DesktopMaterialAdaptiveCustomization019f68caR3`.
- Owned paths under the run root: disposable Git fixture, isolated user-data,
  temporary launch/control files, raw captures, and cleanup ledger.
- Screenshot targets:
  - `docs/assets/screenshots/material-welcome.png` at 1440×960, light theme.
  - `docs/assets/screenshots/material-customization.png` at 1440×960, light
    theme.
  - `docs/assets/screenshots/material-toolbar-overflow.png` at the smallest
    verified unclipped app-bar width, light theme, with More open.
  - `docs/assets/screenshots/material-tab-appearance-word.png` with the
    populated Word-style tab editor, light theme.
  - `docs/assets/screenshots/material-tab-arrange.png` with pinned/manual and
    one-shot Arrange controls, light theme.
  - `docs/assets/screenshots/material-actions-cancel.png` with the synthetic
    exact-run cancellation review, light theme.
  - `docs/assets/screenshots/material-rebase-review.png` with the synthetic
    current→base review and bounded commit preview, light theme.
- Visual acceptance: exact client dimensions recorded; nonblank pixels;
  expected Material state; no clipping, overlap, private path, real account,
  credential, token, or unrelated application content; promoted file inspected
  again at original resolution and SHA-256 recorded.
- Declared checks: focused customization/toolbar/Welcome/Pages, tab
  model/store/UI/migration/a11y, Actions API/store/UI/stale-state, Provider
  binding propagation, rebase safety/flow, Repository Tools, Remote Manager,
  and Regex Builder tests; repository unit suite where practical; TypeScript;
  targeted and full lint where practical; Prettier; `git diff --check`; exact
  MCP production build; normal/compact/zoomed renderer geometry; screenshot
  asset/link gate; secret and local-path scan; remote divergence check; and
  exact-SHA CI/Pages verification through `gh`.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `PLAN.md`,
  `MATERIAL_REDESIGN.md`, `HANDOFF.md`, `docs/README.md`, `docs/wiki/*.md`,
  `docs/process/roadmap.md` (current-plan pointer copy only), `site/index.html`,
  the Pages contract test, this manifest, and the seven declared screenshots.
  Historical roadmap entries remain unchanged. The retained
  `.codex/verification/verify_pull_all_progress_cdp.js` helper is also
  allowlisted because its onboarding selector follows the new Material Welcome
  copy.
- Wiki publication: push `main` and screenshot assets first, fresh-clone
  `desktop-material.wiki.git`, preserve remote-only `Images/`, overlay reviewed
  canonical Markdown, reject divergence, and push `master` without force.
- Cleanup ledger (complete during run): containment-checked owned root and
  synthetic Git/provider/account/user-data paths; loopback provider PID/port;
  one desktop creation; exact Electron launch PID; runtime-resolved HWND and CDP
  port if fallback is required; graceful close result; revalidated exact-PID
  fallback if used; zero-window/provider-port poll; desktop close exactly once;
  synthetic credential removal; and verified removal of only owned Temp paths.
