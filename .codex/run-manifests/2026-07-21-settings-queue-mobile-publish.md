# Headless run manifest — Settings queue and mobile connection

- Mode: `publish`
- Milestone: expose queue configuration and the mobile connection webpage from
  the Desktop Material Settings surface.
- Expected UI state: Settings presents discoverable entries for queue settings
  and mobile connection, preserves the existing page/dialog close and scroll
  behavior, and renders English, playful Hong Kong-style Cantonese, and compact
  bilingual copy without clipping.
- Ordered background interactions: build the exact source; launch an isolated
  disposable repository on one off-screen Win32 desktop; open Settings; visit
  the queue entry; return to Settings; visit the mobile connection entry;
  validate scroll/close/navigation; capture the accepted Settings state; close
  the app and desktop.
- Disposable fixture: a unique owned directory below `%TEMP%` containing one
  minimal Git repository and one isolated Electron user-data directory.
- Screenshot: light theme, client-only, stable nonblank Settings view at
  1440×960; candidate target
  `docs/assets/screenshots/material-settings-connections.png`.
- Documentation allowlist: this manifest, the categorized Settings feature
  guide/index, `README.md`, `ROADMAP.md`, `HANDOFF.md`, `docs/wiki/User-Guide.md`,
  `docs/wiki/Feature-Gallery.md`, and `site/index.html`.
- Tests: focused Settings/navigation/localization/static-layout tests, root and
  script TypeScript no-emit, changed-source ESLint/Prettier, workflow/Markdown
  checks, the reproducible unpackaged production build, and the headless UI
  exercise above.
- Remote: `origin` (`Ding-Ding-Projects/desktop-material`).
- Expected branch: `main`; fetch/rebase before each push, never force-push.
- Initial baseline: `main` is clean at pushed commit `c49a0f0b780ecf025503896d7a00ac20897859a3`.
