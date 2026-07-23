# Responsive Releases and Cheap LFS progress final acceptance

> Historical initial-`c3db37ea55` receipt. Its 140 px/42 px compact Releases
> geometry and screenshot are superseded by
> `2026-07-23-release-compact-accessibility-final.md`; the Cheap LFS progress
> receipts below remain valid for the initial integration.

- Run ID: `desktop-material-p0-ui-release-progress-final-20260723-1500-a2f6c9`
- Mode: `publish`
- Milestone: compact Repository Releases at small size/high zoom plus the richer
  keyboard-accessible Cheap LFS commit terminal.
- Application source: integration worktree based at integration tip
  `08c9b16b99`, plus its final accepted responsive/style/verifier delta; the
  publication commit is intentionally later.
- Build command: fixed Lowlevel MCP `run_command` with
  `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod`, 3,600-second tool timeout.
- Build result: the final first-publication build passed through the fixed MCP
  in **400.46 seconds** (**404.3 seconds wall**) with return code `0` and no
  timeout. The resulting 1,178,671-byte `out/renderer.css` has SHA-256
  `6381556b36c295ba47ad90e8080f4079cbc61951bd7811ab9cb9fc3520638cb1`.
  The earlier 914.90-second pass remains an interim receipt; no Electron launch
  began before either successful build receipt.
- Owned Temp root:
  `desktop-material-p0-ui-release-progress-final-20260723-1500-a2f6c9` directly below
  the resolved Windows temporary directory.
- Headless desktop: `DMReleaseProgressFinal-20260723-1500`.
- Profile, fixture, provider, capture, ledger, and download paths: children of
  that one owned Temp root only.
- Expected first paint: freshly built Desktop Material production renderer,
  synthetic `material-fixture-owner/material-fixture` repository only, no crash
  dialog, nonblank client capture.
- Ordered interactions: create/probe/clone the deterministic P0 provider
  fixture; install only its owned test credential; choose an unused loopback CDP
  port; create one off-screen desktop; launch the exact built Electron binary;
  dynamically resolve its PID/HWND; capture stable first paint; seed the
  deterministic provider profile; run the full responsive ledger including
  `repository.Releases/minimum-zoom-200`; capture the compact populated Releases
  surface; run the real synthetic-over-100-MiB Cheap LFS commit-preparation
  scene; inspect both frames at original resolution; promote only accepted
  public-safe images; then close and remove every owned resource.
- Releases acceptance: **passed** at 200% zoom in a 480×330 CSS viewport. The
  960×660 capture is 78,875 bytes with SHA-256
  `56991b51946a32740995168bd9f97f091b1d183f6df696a205556df6759bcb37`.
  The 140-pixel panel shows one complete 42-pixel release row, locale-aware
  24-hour `HH:mm` timestamps, and no document/body horizontal overflow. Native
  Enter expanded the compact tools disclosure and proved filters, bulk
  controls, the list, and pagination keyboard-reachable.
- Cheap LFS acceptance: **passed** in both final compiled-source frames with no
  injected diagnostic style. The 1440×960 English capture is 113,869 bytes,
  SHA-256
  `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333`;
  all 36 named assertions, including `noBlockingDialog`, passed and all three
  worker rows are contained. The 640×960 bilingual capture is 85,175 bytes,
  SHA-256
  `1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50`;
  all 36 named assertions passed after one real pointer attempt following
  hidden-HWND activation, and progress bottom y=942 remains within panel bottom
  y=944.
- Candidate captures: owned Temp only. Promotion targets are
  `docs/assets/screenshots/material-github-releases-compact.png` and the existing
  `docs/assets/screenshots/cheap-lfs-commit-progress.png`.
- Gallery checkpoint: first-publication source contains **76** inspected images
  after adding the compact Releases screenshot. The final Bambu live
  workflow/Action/fresh-clone capture remains pending and is not counted or
  claimed.
- Declared gates: 151-test integrated affected suite, full TypeScript,
  changed-file ESLint/Prettier, action syntax/no-force audit, production build,
  responsive ledger, scene semantic/privacy receipts, original-pixel review,
  gallery/source contracts, CI/CodeQL/Pages/wiki, installer Release, GitHub
  Discussion, and live updater check.
- Remote/branch: `Ding-Ding-Projects/desktop-material`, final fast-forward to
  `origin/main`; no force push.
- Documentation allowlist: this manifest, the Bambu live run manifest and dated
  receipt, README, ROADMAP, HANDOFF, relevant categorized feature docs and
  indexes, wiki Home/User Guide/Developer Guide/Feature Gallery, Pages gallery,
  gallery count tests, and the two accepted screenshot assets.
- Cleanup: the revalidated owned app/process tree and provider child exited;
  the named off-screen desktops were closed; the provider credential was
  deleted; the CDP/provider ports were proved free; and only validated owned
  Temp roots were removed. The existing installed-app Bambu acceptance process
  remains intentionally preserved until its later workflow and fresh-clone
  proof complete.
