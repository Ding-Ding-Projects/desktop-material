# Headless run manifest — Reviewed pull previews

- Mode: `publish`
- Milestone: preview an ordinary Git pull before it changes the current
  worktree.
- Expected UI state: the toolbar pull action opens a reviewed Material dialog
  after a fetch, names the exact local and upstream branches, summarizes the
  frozen Git integration plan and ahead/behind counts, lists a bounded set of
  incoming commits and changed paths, and requires an explicit modal Pull
  confirmation that remains blocking while Git runs.
  Up-to-date, detached/untracked, fetch-error, stale-context, and unsafe dirty
  states stay non-destructive. English, playful Hong Kong-style Cantonese, and
  compact bilingual copy remain readable at narrow widths.
- Ordered background interactions: preflight the fixed Lowlevel MCP server;
  build the exact source; create a disposable local/remote Git fixture with an
  incoming commit and isolated Electron user data; launch on one uniquely named
  off-screen Win32 desktop; activate Pull; inspect the fetched preview; capture
  the accepted review state; confirm Pull; verify the incoming commit lands;
  close the exact app window and headless desktop.
- Disposable fixture: a unique owned directory below `%TEMP%` containing a bare
  remote, two working repositories, one isolated Electron user-data directory,
  and a cleanup ledger.
- Screenshot: light theme, client-only, stable nonblank reviewed-pull dialog at
  1440×960; candidate target
  `docs/assets/screenshots/material-pull-preview.png`.
- Documentation allowlist: this manifest, the categorized repository-management
  feature guide/index, `README.md`, `PLAN.md`, `ROADMAP.md`, `HANDOFF.md`,
  `docs/README.md`, `docs/wiki/Home.md`, `docs/wiki/Developer-Guide.md`,
  `docs/wiki/User-Guide.md`, `docs/wiki/Feature-Gallery.md`, and
  `site/index.html`.
- Tests: focused pull-preview Git/UI/localization tests; related pull/store/
  toolbar tests; root and script TypeScript no-emit; changed-source ESLint and
  Prettier; workflow/Markdown checks; the reproducible unpackaged production
  build; and the headless UI exercise above.
- Remote: `origin` (`Ding-Ding-Projects/desktop-material`).
- Expected branch: `main`; fetch/rebase before each push, never force-push.
- Initial baseline: `main` matches `origin/main` at
  `c49a0f0b780ecf025503896d7a00ac20897859a3`; the unrelated untracked
  `.codex/run-manifests/2026-07-21-settings-queue-mobile-publish.md` is preserved.
- Active GitHub account: `codingmachineedge`.
