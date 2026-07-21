# July 21 continuation completion — publish manifest

## Mode and repository baseline

- Mode: `publish`
- Milestone: resume the July 21 design-parity and feature-completion goal from
  the exported session, finish the preserved queue, and publish the verified
  result.
- Product boundary: Windows x64/arm64 application only; Windows x64 is the
  installer and packaged-E2E target.
- Project: `%USERPROFILE%\Documents\GitHub\desktop-material`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `main`
- Initial local/upstream SHA: `21e9c55b15c90136e226acda327ad396101b235b`
- Initial dirty-state baseline: clean (`main...origin/main`, zero divergence).
- Active GitHub account: `codingmachineedge`.
- Publication authorization: the user explicitly requested `git push`.
- MCP preflight receipt: `startup_status` returned `ok: true` and
  `client_ok: true`; scheduled task `LowLevelComputerUseMCP` was `Running` at
  limited privilege and points to the fixed checkout's venv Python with
  `-m lowlevel_computer_use_mcp.server --http --host 127.0.0.1 --port 8765`.
  The MCP checkout was clean at `ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`.
- Incoming delivery blocker: CI run `29848536855` failed its Lint job because
  `.codex/verification/capture_gallery_cdp.js` was not Prettier-clean; CodeQL
  run `29848536828` was canceled. This run must replace both with exact-SHA
  green receipts before completion.

## Completion scope

1. Correct the pushed CI regression in
   `.codex/verification/capture_gallery_cdp.js` and remove the stale tracked
   `WORKTREE-IN-USE.md` marker.
2. Complete and verify the six backend defects listed in the July 21 Codex
   handoff: GitLab legacy-WIP parsing, scheduled-automation repository-switch
   cancellation, successful GitLab mutation reporting, portable release-asset
   publication, superseded Build & Run event rejection, and canonical tab
   import deduplication.
3. Resume the preserved chat-expansion work and finish the remaining requested
   feature lanes: cheap-LFS background/prerelease rollover, clone progress
   pause/resume, Actions auto-fix, background action/API queue management, and
   durable Docker-host handoff without storing credentials or pretending a
   powered-off local machine is still reachable.
4. Reconcile the already merged Ollama chat, command-palette, Build & Run,
   repository-list, organization visibility, workflow picker, and
   send-to-OpenCode feature wave with tests and documentation.
5. Close every reproducible design-parity screenshot gap. Any scene that cannot
   be made deterministic must retain honest, exact evidence in `HANDOFF.md` and
   `ROADMAP.md`; it may not be reported as renewed.

## Headless build and UI contract

- MCP checkout: `%USERPROFILE%\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP endpoint: `http://127.0.0.1:8765/mcp`
- Build command through MCP:
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
- Disposable fixture/run root:
  `%TEMP%\desktop-material-continuation-20260721-019f8580`
- Isolated user-data directory: below the owned run root only.
- Headless desktop name: `DesktopMaterialContinuation20260721_019f8580`.
- Launch: exact built Electron binary, `--disable-gpu`, isolated
  `--user-data-dir`, and only the disposable fixture via `--cli-open`.
- Ordered acceptance surfaces: welcome; repository workspace; Ollama manager
  chat; multi-chat/history; clone organization state; clone progress
  pause/resume; Actions workflow picker and auto-fix; background/API queue; and
  Build & Run/OpenCode.
- Capture targets: the eight retained Material-era gallery scenes named in the
  July 21 handoff plus any new canonical feature scenes needed by the gallery.
- Theme/language/dimensions: English light at 1440x960 for canonical gallery;
  focused dark and bilingual narrow-width captures where a changed surface
  needs contrast or wrapping proof.
- Interaction allowlist: resolved-HWND `mouse_click`, `type_text`,
  `win_send_keys`, `resize_window`, `screenshot`, and revalidated-HWND graceful
  close only. Never show or switch to the headless desktop.

## Documentation and evidence allowlist

- `.codex/run-manifests/2026-07-21-continuation-completion-publish.md`
- `.codex/verification/**` only where the deterministic driver needs repair.
- `README.md`, `ROADMAP.md`, and `HANDOFF.md`.
- Applicable categorized files and indexes below `docs/features/**`.
- `docs/wiki/**`, `docs/assets/screenshots/**`, and `site/**` only for verified
  feature/gallery delivery.
- Source, styles, tests, and fixtures required by the scoped defects/features.

## Declared validation

- Focused unit tests for every changed backend and UI feature.
- Root/script TypeScript, app TypeScript `--noEmit`, Prettier, ESLint,
  Markdownlint, `git diff --check`, documentation-link/catalog checks, and the
  exact no-download MCP production build.
- Off-screen original-resolution inspection for expected state, blank pixels,
  clipping, private data, theme/language, and dimensions.
- Secret/credential/path/conflict-marker scan over the full intended diff.
- Push `origin/main` without force; verify the remote SHA, exact-SHA CI,
  CodeQL, installer release and assets, Pages, README image, and wiki image.
- Prove every completed branch tip is contained in pushed `origin/main`, then
  remove only safely merged local/remote task branches, worktrees, metadata,
  and redundant stashes. Final checkout must be clean `main` with zero
  divergence.

## Cleanup ledger

- Owned run root: not yet created.
- Owned fixture/user-data paths: not yet created.
- Headless desktop: not yet created.
- Launch PID/HWND: not yet assigned.
- Initial topology residue to resolve after remote proof: contained local and
  remote branch `claude/material-design-ui-audit-763c44`; no extra worktree or
  stash exists.
