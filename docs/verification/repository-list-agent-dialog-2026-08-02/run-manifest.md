# Repository list and agent-session dialog verification run

- Run ID: `repository-list-agent-dialog-20260802`
- Mode: `publish`
- Started: `2026-08-02T13:30:00-04:00`
- Initial source: `fffe7ac2832a73ad76c7444f8e3c56f2ab3e1e51`
- Publication branch: `main`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Force-push: not used

## Expected UI state

- The Repositories sheet shows a real disposable fixture repository row after
  the fixture is opened, with the list body occupying the remaining sheet
  height instead of appearing blank.
- The Agents tab keeps the `+ New Agent Session` trigger in the panel header.
- Activating that trigger opens a centered modal dialog containing the full
  new-session form, including `Worktree name`, `Options`, `Cancel`, and
  `Start`; the form is not rendered inline in the clipped panel.
- The dialog remains usable at the narrow capture size and restores focus to
  the trigger after dismissal.

## Ordered interactions

1. Preflight the fixed Lowlevel MCP endpoint and confirm its checkout revision.
2. Build the unpackaged production app through Lowlevel MCP.
3. Create one disposable Git fixture and one isolated Electron user-data path.
4. Launch only the fixture through `--cli-open` on a uniquely named headless
   desktop and resolve the live Desktop Material HWND.
5. Capture the repository sheet before input, open the Agents tab, activate
   `New Agent Session`, and capture the dialog at its stable final state.
6. Inspect the final PNGs at original resolution for nonblank pixels, clipping,
   private data, contrast, and the expected controls before promotion.

## Disposable paths and captures

- Run root: `%TEMP%\\desktop-material\\repository-list-agent-dialog-20260802`
- Fixture: `<run root>\\fixture`
- User data: `<run root>\\user-data`
- Captures: `<run root>\\captures\\repository-sheet.png` and
  `<run root>\\captures\\new-agent-session-dialog.png`
- Promoted targets: `docs/assets/screenshots/repository-list-agent-dialog.png`
  and `docs/assets/screenshots/new-agent-session-dialog.png`

## Documentation allowlist

- This manifest
- `app/src/ui/agent-sessions/agent-sessions-panel.tsx`
- `app/src/ui/agent-sessions/new-agent-session-form.tsx`
- `app/src/ui/repositories-list/` files required by the list fix
- `app/styles/ui/_agent-sessions.scss`
- `app/styles/ui/_repository-list.scss` and related layout styles required by
  the list fix
- Focused tests for the two surfaces
- README/gallery references, the repository-management feature documentation,
  `docs/wiki/`, `HANDOFF.md`, and `ROADMAP.md`
- The two promoted verification screenshots

## Verification

- Focused unit tests for the repository list and agent sessions
- Production build: `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
- Lowlevel headless screenshots and original-resolution inspection
- Git status, diff, staged allowlist, pushed SHA, applicable GitHub checks, and
  cleanup ledger
