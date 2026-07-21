# July 21 CI update-coming-soon — local verification manifest

## Mode and repository baseline

- Mode: `local-docs`
- Milestone: surface a localized updater status while a newer Desktop Material
  commit is still building in GitHub Actions, and generate bounded exact-SHA
  release notes from commits since the prior release, while keeping overlapping
  CI runs independent and non-cancelling.
- Product boundary: Windows x64/arm64 application only.
- Project worktree:
  `%USERPROFILE%\Documents\GitHub\desktop-material-ci-update-coming-soon`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `codex/ci-update-coming-soon`
- Initial SHA: `dce7b9417f30568171d37033b27fb176f92c8dd9`
- Initial dirty-state baseline: clean, newly created from `origin/main`.
- Publication authorization: none. Commit locally; do not push, merge, or wait
  for remote CI.
- MCP preflight receipt: after restarting the stalled scheduled task and waiting
  for its listener, `startup_status` returned `ok: true` and `client_ok: true`.
  MCP `run_command` confirmed the limited `LowLevelComputerUseMCP` task points
  to the fixed checkout/venv/port and that checkout is clean at
  `ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`.
- Build constraint: the fixed no-download build command cannot run because no
  `yarn` executable is installed or bundled in the dependency tree. Per the
  headless skill, verification stops instead of downloading a package manager.

## Completion scope

1. Reuse available GitHub provider/check-run data to distinguish a newer
   Desktop Material commit whose exact Windows packaging job is actively
   building from an available release.
2. Show a persistence-safe update-coming-soon status in English, playful Hong
   Kong Cantonese, and compact bilingual modes; restore normal updater behavior
   as soon as the release appears.
3. Generate sanitized, bounded GitHub Release notes from commit subjects since
   the previous release and bind the notes to the exact artifact/release SHA.
4. Give every CI invocation a unique concurrency group, retain non-cancelling
   serialization for shared publication workflows, and reject cancellation in
   workflow source contracts.
5. Add focused tests and update feature documentation, roadmap, handoff, wiki,
   and Pages sources where applicable.

## Headless build and UI contract

- MCP checkout: `%USERPROFILE%\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP endpoint: `http://127.0.0.1:8765/mcp`
- Build command through MCP:
  `npx --no-install cross-env` with `RELEASE_CHANNEL=development`,
  `DESKTOP_SKIP_PACKAGE=1`, and `yarn build:prod`.
- Disposable fixture/run root:
  `%TEMP%\desktop-material-ci-update-coming-soon-20260721`
- Isolated user-data directory: below the owned run root only.
- Headless desktop name: `DesktopMaterialCIUpdate20260721`.
- Expected UI state: About/updater surface renders the localized
  update-coming-soon message when deterministic provider state reports a newer
  in-progress build, without persisting that transient remote state.
- Capture target: a unique owned temporary PNG; no tracked screenshot unless
  the changed UI cannot otherwise be documented accurately.
- Theme/language/dimensions: verify English, Cantonese, and bilingual behavior;
  use 1200x800 for any focused capture.
- Interaction allowlist: resolved-HWND `mouse_click`, `type_text`,
  `win_send_keys`, `resize_window`, `screenshot`, and revalidated-HWND graceful
  close only. Never show or switch to the headless desktop.

## Documentation and evidence allowlist

- This manifest, source/styles/tests required by the scoped updater/release
  changes, `README.md` if behavior is already indexed there, `ROADMAP.md`,
  `HANDOFF.md`, applicable `docs/features/**`, `docs/wiki/**`, and `site/**`.

## Declared validation

- Focused unit tests for updater status detection/localization/persistence and
  release-note generation/sanitization/exact-SHA binding.
- Relevant TypeScript typecheck, ESLint, Prettier, Markdownlint, workflow syntax
  validation, `git diff --check`, and the no-download production build when
  feasible through the fixed low-level MCP endpoint.
- Headless original-resolution UI inspection if the deterministic state is
  reachable without introducing a production-only test hook.
- Secret/path/conflict-marker scan over the intended diff.
- Commit coherent work locally; do not push, merge, delete branches/worktrees,
  or wait for remote CI.

## Verification receipts

- Focused updater/i18n/workflow tests, including the all-workflow
  non-cancellation contract: 27/27 passed.
- Exact-range release-note generator tests: 5/5 passed.
- Root app TypeScript and script TypeScript: passed.
- Targeted ESLint and Prettier, new-document Markdownlint, workflow YAML parse,
  and `git diff --check`: passed.
- A local exact-range sample from published tag
  `v3.6.3-beta3-b0000000270` through base SHA `dce7b9417f30` generated the two
  expected exact commit links and subjects.
- A public provider schema check on installer run `29869456856` returned the
  exact workflow path, main head SHA, and `Windows x64` job with matching
  `run_id`/`head_sha` fields used by the bounded runtime proof.
- Fixed low-level MCP preflight: passed. Production build and GUI capture: not
  run because the exact no-download command cannot resolve `yarn` on this host.
- Remote CI/release: intentionally not run for this unpushed integration branch.

## Cleanup ledger

- Temporary root and app dependency junctions: removed after verification; the
  source dependency trees remain intact.
- Owned run root: not yet created.
- Owned fixture/user-data paths: not yet created.
- Headless desktop: not yet created.
- Launch PID/HWND: not yet assigned.
