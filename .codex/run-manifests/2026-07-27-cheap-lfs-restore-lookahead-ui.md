# Cheap LFS restore look-ahead UI run manifest

- Mode: `local-docs`
- Milestone: shared, provider-neutral Cheap LFS restore progress model and
  accessible Material 3 progress presentation for app-wide and batch-clone
  surfaces.
- Source baseline: `821ab93d57` on
  `codex/cheap-lfs-restore-lookahead...origin/main`.
- Initial dirty state: clean before this manifest.
- Expected UI state: a detailed restore card shows the current restore lane,
  the queued/prefetch lane from the exact 90% look-ahead boundary, file and byte
  totals, rate/ETA/elapsed, provider/phase/part metadata, failures, cancellation,
  and deterministic accessible progress text.
- Ordered interactions: inspect the existing restore and batch-clone state
  contracts; add a bounded provider-neutral model; build one shared component;
  wire only state already available to App and batch clone; add responsive and
  reduced-motion styles; add focused model/UI/i18n tests; run focused tests,
  typecheck/lint/format checks, and inspect the full diff.
- Disposable fixture: none. Unit-render fixtures are in-memory and deterministic.
- Screenshot target/theme/dimensions: none in this isolated implementation
  slice. The coordinating task owns any production headless capture after the
  backend event contract is integrated.
- Documentation/implementation allowlist: this manifest;
  `app/src/lib/cheap-lfs/restore-progress.ts`; `app/src/lib/app-state.ts`;
  `app/src/ui/lib/cheap-lfs-restore-progress.tsx`; `app/src/ui/app.tsx`;
  `app/src/ui/clone-repository/batch-clone-progress.tsx`;
  `app/src/lib/i18n-resources.ts`; `app/styles/ui/_operation-progress.scss`;
  `app/styles/ui/_cheap-lfs.scss`; and focused tests under `app/test/unit`.
- Tests: focused restore-progress model/UI, batch-clone render, and i18n suites;
  TypeScript no-emit and focused formatting/lint where supported.
- Remote: `origin`
  (`https://github.com/Ding-Ding-Projects/desktop-material.git`).
- Expected branch: `codex/cheap-lfs-restore-lookahead`; the coordinating task
  owns integration, commit, push, remote proof, and branch cleanup.

## Local verification

- Focused model, style, shared-component, batch-clone, and i18n suites:
  **42 passed, 0 failed**.
- Exact-file Prettier check: passed.
- Exact-file ESLint check with repository rules: passed.
- Both edited Sass partials compile independently: passed. The full `_ui.scss`
  cannot be invoked through bare Sass because repository imports use webpack's
  `~` resolver; the production build remains with the coordinating task.
- The final integrated `tsc --noEmit -p tsconfig.json` check passed with no
  errors.
- The coordinating task's combined regression passed **652/652** tests across
  **53** files, including the stage-aware aggregate, exact physical 90%
  file/part admission, failed-prefetch sibling cancellation, OCI proportional
  byte projection, stable active-part lanes, and queued-file part counts.
- The exact Windows production build passed through the fixed Lowlevel MCP
  endpoint with `returncode: 0`, `timed_out: false`, and `client_ok: true`.
- Production headless acceptance passed at 1440×960 English and 640×960
  bilingual. The accepted wide capture is
  `docs/assets/screenshots/cheap-lfs-restore-lookahead.png`; the strict narrow
  receipt proves the two lanes reflow vertically without overlap, horizontal
  overflow, inaccessible progress, or private data.
