# Command palette notification routes — 2026-08-04

## Scope

- Mode: `publish`
- Milestone: separate the live notification-centre route from Git-backed notification history
- Repository: `Ding-Ding-Projects/desktop-material`
- Branch: `main`
- Starting commit: `06873259ceefd98f926ca41144b75ec992b651b9`
- Initial dirty state: intended source, test, documentation, screenshot, and manifest files from this milestone
- Signing contract: Squirrel signing remains intentionally skipped; this run does not touch packaging policy

## Defect and expected proof

- Before: the only notification command is titled `Open notification centre` but dispatches `PopupType.NotificationHistory`.
- After: `palette:notification-centre` opens the live side sheet and `palette:notification-history` opens the local history dialog, with distinct localized titles.
- Visual proof: a real hidden Windows Electron window with the command palette filtered to `notification`; capture the corrected routes and open the live centre side sheet. The old build is retained only as a before capture.
- Shortcut proof: the rebuilt Edit menu visibly exposes `Command palette` with `Ctrl+Shift+F`. The cheap background key helper does not reliably deliver Electron accelerator chords, so the menu contract is the trustworthy static proof and the palette itself is opened through that menu for visual verification.
- Automated proof: focused catalog/coverage tests, Prettier, ESLint, production build, and hidden-runtime capture.

## Headless route

- Required route: installed `lowlevel-computer-use-cheap` against the local MCP endpoint
- Before desktop name: `DesktopMaterialPaletteNotification-20260804-140315`
- Before capture root: `%TEMP%\\desktop-material-palette-notification-20260804-140315\\captures`
- Verified desktop name: `DesktopMaterialPaletteNotificationAfter2-20260804-160000`
- Fixture root: `%TEMP%\\desktop-material-palette-notification-after2-20260804-160000\\fixture`
- User-data root: `%TEMP%\\desktop-material-palette-notification-after2-20260804-160000\\user-data`
- Capture root: `%TEMP%\\desktop-material-palette-notification-after2-20260804-160000\\captures`
- Cleanup: close the dynamically resolved window, terminate only the saved launch PID if needed, close the named desktop, remove only the owned run root

## Documentation allowlist

- This manifest
- `HANDOFF.md`
- `docs/features/design-system/command-palette-coverage-gaps.md`
- `app/src/lib/command-palette-catalog.ts`
- `app/src/lib/i18n-resources.ts`
- `app/src/ui/app.tsx`
- `app/src/main-process/menu/build-default-menu.ts`
- `app/src/ui/command-palette/command-palette.tsx`
- focused command-palette tests
- `app/styles/ui/_command-palette.scss`
- `docs/features/design-system/README.md`
- `docs/features/design-system/command-palette-appearance.md`
- `docs/features/design-system/command-palette-full-coverage.md`
- `docs/readme-tabs/features.md`
- `docs/readme-tabs/complete-feature-list.md`
- `docs/wiki/Home.md`
- `docs/wiki/User-Guide.md`
- `docs/wiki/Feature-Gallery.md`
- `site/index.html`
- generated `docs/index.html` and `docs/assets/site/docs-hub-catalog.js`
- `docs/assets/screenshots/material-command-palette-notification-before.png`
- `docs/assets/screenshots/material-command-palette-notification-after.png`
- `docs/assets/screenshots/material-notification-centre-route.png`

## Verification state

The source correction, explicit centre home label, and shortcut contract are locally implemented. Focused
catalog/coverage/menu tests pass **49/49**; Prettier, targeted ESLint, and
`git diff --check` pass. The full `yarn test:script` ledger reports **213/214**
passed, **0** failed, and **1** optional Mermaid-toolchain skip because
`DESKTOP_MERMAID_TOOLCHAIN` is not configured. `yarn build:prod` completed in
**287.51s** with `DESKTOP_SKIP_PACKAGE=1` and printed `Skipping packaging`.
After the final home-label change, `yarn compile:prod` completed in **282.18s**
on retry (one prior native V8 allocation crash was not a source failure). The
final compile after the `find` keyword correction completed in **280.75s**.
The rebuilt hidden
Windows Electron artifact was launched on the verified desktop and showed:

- `notification-filtered.png`: separate `Notification history` and `Open notification centre` rows, with the centre anchored as `Notification centre`
- `notification-centre-open.png`: the live notification centre side sheet
- `edit-menu.png`: `Command palette` with `Ctrl+Shift+F`

Signing and packaging remain intentionally skipped.
