# Compact Releases accessibility correction acceptance

- Run ID: `desktop-material-release-accessibility-correction-20260723-1746-b2d2a3`
- Status: rejected after exact-source off-screen geometry validation. The build
  passed, but the 125% case produced a 768x528 CSS viewport that missed the
  original 760x520 compact gate and left the first release row entirely below
  the viewport. No screenshot from this run was promoted.
- Mode: `publish`
- Milestone: preserve a visible Repository Releases list on small/high-zoom
  windows while restoring readable type, usable targets, localized disclosure
  copy, and an accessible compact-tools summary.
- Application source: isolated worktree
  `desktop-material-release-responsive`, branch
  `codex/release-responsive-cheap-lfs-progress`, based on pushed `origin/main`
  `c3db37ea5524b91f9603151ae5d1107205f16a59` plus the scoped correction
  recorded by this manifest. No build or capture may begin after another source
  write without restarting the exact-source gate.
- Build command: fixed Lowlevel MCP `run_command` with
  `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod`, 3,600-second tool timeout.
- Build result: passed through the fixed MCP in **433.3 seconds wall** (Yarn
  **429.95 seconds**) with return code `0` and no timeout. The resulting
  1,179,200-byte `out/renderer.css` has SHA-256
  `f9bdf73ca2b285f7fcf3c46a1ad1895512c9b3b770b76f266945768507c4ac06`.
  This receipt is historical evidence for the rejected 760x520-gate source,
  not acceptance of the later correction.
- Owned Temp root:
  `desktop-material-p0-ui-release-accessibility-correction-20260723-1746-b2d2a3`
  directly below the resolved Windows temporary directory.
- Headless desktop: `DMReleaseA11y-20260723-1746`.
- Profile, fixture, provider, capture, probe, and cleanup-ledger paths: children
  of that one owned Temp root only.
- Expected first paint: freshly built Desktop Material production renderer,
  deterministic public-safe fixture repository only, no crash dialog, and a
  nonblank client capture.
- Ordered interactions: preflight the fixed Lowlevel MCP and its scheduled task;
  build the exact isolated-worktree source; create the disposable fixture and
  profile; install only the owned synthetic provider credential when required;
  choose unused loopback provider/CDP ports; create one off-screen desktop;
  launch the exact built Electron binary; dynamically resolve its PID/HWND;
  seed the deterministic populated Releases state; exercise the compact tools
  disclosure by keyboard; probe the responsive geometry at 100%, 125%, 150%,
  and 200%; capture the 960×660 physical / 480×330 CSS, dark, bilingual 200%
  state; inspect the original pixels; promote only accepted public-safe
  evidence; then close and remove every owned resource.
- Acceptance: the compact dashboard keeps the release list visible, uses a
  three-column metrics grid with the latest metric spanning two columns, shows
  at least one complete release row, has no document/body horizontal overflow,
  uses locale-aware 24-hour release timestamps, wraps localized disclosure
  text, provides a concise single-language accessible name with a described
  live result summary, and keeps compact text at least 9 CSS pixels, ordinary
  controls at least 30 CSS pixels high, checkbox targets at least 30 CSS pixels,
  and release rows at least 52 CSS pixels high.
- Screenshot candidate: owned Temp only until original-pixel review. Accepted
  promotion target:
  `docs/assets/screenshots/material-github-releases-compact.png`.
- Declared gates: the integrated affected unit suite, full TypeScript,
  changed-file ESLint/Prettier, diff/secret checks, exact production build,
  responsive geometry probes, keyboard semantics, original-pixel review,
  gallery/source contracts, CI/CodeQL/Pages/wiki, one non-draft installer
  Release, GitHub Discussion, and final remote ancestry proof.
- Remote/branch: `Ding-Ding-Projects/desktop-material`; one fast-forward push to
  `origin/main`, no force push.
- Initial dirty-state baseline: 18 scoped modified paths inherited from the
  correction pass plus this new manifest, for 19 paths total at manifest
  creation; no unrelated file is staged or discarded.
- Documentation allowlist: this manifest, the preceding responsive/Cheap LFS
  manifest and verification receipt, README, ROADMAP, HANDOFF, the Repository
  Releases and release-backed Cheap LFS feature docs, wiki Home/User Guide/
  Developer Guide/Feature Gallery, Pages gallery, localization/source/style
  tests, and the accepted compact Releases screenshot.
- Cleanup: complete. The saved app PID `20152` and HWND `3618830` were
  revalidated; the exact app process was stopped after the headless close API
  could not resolve its hidden HWND; the provider PID `10960` was command-line
  validated and stopped; provider/CDP ports `51718` and `51853` were proved
  free; the synthetic credential was deleted and independently proved absent;
  the named desktop closed with zero remaining windows; and only the exact
  owned Temp root was removed and proved absent. The separately owned
  installed-app Bambu environment remained untouched.

This run is superseded by
`2026-07-23-release-compact-accessibility-final.md`, which widens the combined
compact gate to cover the missed 125% geometry and requires a fresh build and
acceptance receipt.
