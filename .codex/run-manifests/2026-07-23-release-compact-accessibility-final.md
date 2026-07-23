# Compact Releases accessibility final acceptance

- Run ID: `desktop-material-release-accessibility-final-20260723-1840-8c91f4`
- Status: exact-source build, off-screen UI acceptance, focused 55/55 contracts,
  documentation reconciliation, and cleanup passed. The final 152-test matrix
  was stopped after 693 seconds without an observed failure only because the
  user explicitly requested an immediate push; publication is proceeding with
  that incomplete aggregate disclosed, and a complete rerun is handed off.
- Mode: `publish`
- Milestone: prove that Repository Releases remains readable and exposes at
  least one complete release row at 100%, 125%, 150%, and 200% zoom in one
  constant 960x660 physical viewport, including the corrected 800x560 compact
  gate that covers the previously missed 125% case.
- Application source: isolated worktree
  `desktop-material-release-responsive`, branch
  `codex/release-responsive-cheap-lfs-progress`, application base
  `c3db37ea5524b91f9603151ae5d1107205f16a59`, plus the scoped correction. The
  later `origin/main` tip `7e9f48a7f7acbd9ff494aa478ed2cb306eaf8877`
  changes only `app/test/unit/github-api-explorer-style-test.ts`, not built
  application source, and will be integrated before publication. The last
  production-source write before this manifest was
  `2026-07-23T22:35:28.1420256Z`. Any later production-source write invalidates
  the build and requires a new exact-source gate.
- Build command: fixed Lowlevel MCP `run_command` with
  `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod`, 3,600-second tool timeout.
- Build result: passed in **390 seconds wall** (Yarn **387.64 seconds**) with
  return code `0`, `timed_out: false`, and `client_ok: true`. The resulting
  1,179,200-byte `out/renderer.css` has SHA-256
  `6fba1434112ea5c02256a12e6ce8af42f5c870f0db5835155acb8075708d9d28`;
  `out/renderer.js` has SHA-256
  `424c928a6a0f6e3e2437f1549e55ec7e26d8cd98758f6ea22ca53e1d5fb5f32e`.
- Owned Temp root:
  `desktop-material-p0-ui-release-accessibility-final-20260723-1840-8c91f4`
  directly below the resolved Windows temporary directory.
- Headless desktop: `DMReleaseA11yFinal-20260723-1840`.
- Profile, fixture, provider, capture, probe, verifier, and cleanup-ledger paths:
  children of that one owned Temp root only.
- Expected first paint: freshly built Desktop Material production renderer,
  deterministic public-safe fixture repository only, no crash dialog, and a
  nonblank client capture.
- Ordered interactions: preflight the fixed Lowlevel MCP and scheduled action;
  build the exact isolated-worktree source; create the disposable fixture and
  profile; install only the owned synthetic provider credential; choose unused
  loopback provider/CDP ports; create one off-screen desktop; launch the exact
  built Electron binary; dynamically resolve and save its PID/HWND; seed the
  deterministic populated Releases state; disable disposable-profile auto-fit;
  probe 100%, 125%, 150%, and 200% geometry; exercise the native compact tools
  disclosure and sequential keyboard route; capture the final dark bilingual
  960x660 physical frame; inspect original pixels; promote only accepted
  public-safe evidence; then close and remove every owned resource.
- Acceptance: every scale has zero document/body/root/panel horizontal
  overflow and at least one complete release row. The 125%, 150%, and 200%
  states use the compact presentation with a 176px minimum tools panel, 52px
  release rows, 30px controls and checkbox targets, 9px minimum compact text,
  a three-column metrics grid, and the latest metric spanning two columns. All
  populated release timestamps use locale-aware 24-hour `HH:mm` time. The
  localized compact disclosure wraps, has a concise single-language accessible
  name, describes a persistent polite/atomic summary, responds to Enter, and
  preserves keyboard reachability for search, filters, selection, rows, and
  pagination.
- Acceptance result: passed at 100% (960x660 CSS), 125% (768x528 CSS), 150%
  (640x440 CSS), and 200% (480x330 CSS), each in an exact 960x660 physical
  viewport. Overflow was `0` for document, body, Releases root, and list panel
  at every scale. The compact scales measured a 176px panel, 52.83-53.5px
  complete rows, 30px checkbox/control floors, 9px minimum metadata, three
  metric columns, a two-column latest card, three populated releases, and
  locale-aware `HH:mm` timestamps. Native Enter expanded and collapsed the
  disclosure; search, status, selection, a release row, and the correctly
  disabled no-next-page pagination control all retained valid focus semantics.
- Screenshot: accepted after original-pixel review and promoted to
  `docs/assets/screenshots/material-github-releases-compact.png`. The 960x660,
  89,856-byte PNG has SHA-256
  `8e29ac666a0832d353126d8dd759200ba7e853016a940501e5c7cbdbb1cf992a`.
- Declared gates: 152-test integrated affected suite, full TypeScript,
  changed-file ESLint/Prettier, diff/secret checks, exact production build,
  four-scale geometry probes, keyboard semantics, original-pixel review,
  gallery/source contracts, CI/CodeQL/Pages/wiki, one non-draft installer
  Release, GitHub Discussion, and final remote ancestry proof.
- Remote/branch: `Ding-Ding-Projects/desktop-material`; one non-force push to
  `origin/main` after integrating its test-only advancement.
- Initial dirty-state baseline: 19 scoped modified paths and the preceding
  untracked correction manifest, plus this final manifest, for 21 paths total;
  no unrelated file is staged or discarded.
- Documentation allowlist: this manifest, the two preceding responsive/Releases
  manifests, the dated verification receipt, README, ROADMAP, HANDOFF, the
  Repository Releases and release-backed Cheap LFS feature docs, wiki Home/User
  Guide/Developer Guide/Feature Gallery, Pages gallery, localization/source/
  style tests, and the accepted compact Releases screenshot.
- Cleanup: complete. The launch returned PID `20836`; the dynamically resolved
  app HWND was `1905774`; provider PID `16700` listened on `53748`; and CDP used
  `52613`. Two stable 960x660 first-paint frames matched exactly. The native
  hidden-window close call could not resolve the revalidated HWND, so only PID
  `20836` was stopped after exact executable/profile/fixture/port provenance
  checks. The desktop then reported zero windows. The synthetic credential was
  deleted and independently proved absent, provider PID `16700` was
  command-line validated and stopped, both ports were proved free, and the
  named desktop closed successfully on retry. The cleanup helper removed only
  the exact owned Temp root; an independent check found the root absent, zero
  referencing processes, both saved PIDs absent, and both listener counts at
  zero. The separately owned installed-app Bambu environment remained
  untouched.
