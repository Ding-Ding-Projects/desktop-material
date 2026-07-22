# Lag and hang responsiveness fix — publish manifest

## Mode and repository baseline

- Mode: `publish`.
- Milestone: identify and fix reproducible renderer lag, unbounded waits,
  app-hanging failure paths, and retained renderer/backend resources without
  changing the Windows-only product boundary.
- Project worktree:
  `%USERPROFILE%\Documents\GitHub\desktop-material-lag-hang-wt`.
- Final verification worktree (recreated after the integrated task worktree was
  cleaned):
  `%USERPROFILE%\Documents\GitHub\desktop-material-lag-hang-verify-wt`.
- Source checkout preserved separately at
  `%USERPROFILE%\Documents\GitHub\desktop-material`.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`.
- Task branch: `codex/fix-lag-hangs-20260721` from `origin/main`.
- Final verification branch: `codex/verify-lag-hangs-20260721`; final rebase
  base `fa4806971c5515766fee5a0ab03a76adfdd11d79`.
- Initial task/upstream SHA: `c4403f2a0faf6e96fb53be3c5a9f4587f4a219c7`.
- Initial task-worktree state: clean and zero commits ahead of `origin/main`.
- Preserved source-checkout baseline: `main` at
  `c01143ee90ebc32ebfe23386df4cab8be27fe36b`, one commit behind
  `origin/main`, with an unrelated uncommitted feature set. It must not be
  staged, rewritten, cleaned, or included in this milestone.
- Active GitHub account: `codingmachineedge`.
- Publication authorization: the user explicitly requested `git push`.
- MCP preflight receipt: `startup_status` returned `ok: true` and
  `client_ok: true`; scheduled task `LowLevelComputerUseMCP` is running at
  limited privilege and points to this executable:

  ```text
  %USERPROFILE%\Documents\GitHub\lowlevel-computer-use-mcp\.venv\Scripts\python.exe
  ```

  Its arguments are `-m lowlevel_computer_use_mcp.server --http --host
  127.0.0.1 --port 8765`. The fixed MCP checkout was clean at
  `ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`.
- Dependency setup: the task worktree uses ignored NTFS junctions to the
  preserved checkout's root and app `node_modules`; source and Git state remain
  isolated, and the junctions are removed with the task worktree after remote
  proof.
- Baseline unit receipt: 1,593 passed, one skipped, and one environment-only
  failure after 464.2 seconds. The failed guided-clone fixture inherited a
  stale `OPENSSL_CONF` path (`Z:/extlib/_5040x__/ssl/openssl.cnf`) before app
  code ran; the exact test must be rerun with the bundled/current OpenSSL
  configuration before publication.

## Diagnostic and implementation scope

1. Inventory existing reports, handoff notes, timeout/retry paths, event-loop
   blocking work, repeated polling, and high-frequency rendering paths.
2. Reproduce or prove the highest-impact lag/hang defects with focused tests or
   deterministic instrumentation.
3. Add cancellation, bounded waits, batching/debouncing, or asynchronous
   scheduling only where the evidence demonstrates the need.
4. Add regression coverage for every changed behavior, including cleanup and
   late-result handling.
5. Audit renderer and backend lifecycles for reproducible retained listeners,
   timers, observers, watchers, child processes, or other owned resources; fix
   only leaks backed by a deterministic regression.
6. Keep localization behavior intact in English, playful Hong Kong-style
   Cantonese, and bilingual modes for any changed user-facing state.

## Headless build and UI contract

- MCP checkout: `%USERPROFILE%\Documents\GitHub\lowlevel-computer-use-mcp`.
- MCP endpoint: `http://127.0.0.1:8765/mcp`.
- Required no-download build through MCP:

  ```powershell
  npx --no-install cross-env RELEASE_CHANNEL=development `
    DESKTOP_SKIP_PACKAGE=1 yarn build:prod
  ```

- Run id: `desktop-material-lag-hang-20260721T140722-0400`.
- Disposable fixture/run root:
  `%TEMP%\desktop-material-lag-hang-20260721T140722-0400`.
- Isolated user-data directory: beneath the owned run root only.
- Headless desktop name: `DesktopMaterialLagHang_20260721_140722`.
- Launch: exact built Electron binary, `--disable-gpu`, isolated
  `--user-data-dir`, and only the disposable Git fixture via `--cli-open`.
- Expected UI state: the repository workspace becomes ready, remains
  responsive while the changed background path is exercised, surfaces a
  bounded failure/cancel state when applicable, and closes cleanly.
- Ordered background interactions: launch; wait for repository readiness;
  exercise the changed high-frequency or delayed operation; verify continued
  navigation/input responsiveness; verify completion, cancellation, or timeout;
  close gracefully.
- Screenshot target (renewed in place to preserve the established gallery
  contract): `docs/assets/screenshots/material-customization.png`.
- Theme/language/dimensions: English light, 1440x960; add focused dark or
  bilingual narrow-width evidence only if a changed surface requires it.
- Interaction allowlist: resolved-HWND `mouse_click`, `type_text`,
  `win_send_keys`, `resize_window`, `screenshot`, and revalidated-HWND graceful
  close. Never show or switch to the headless desktop.

## Documentation and evidence allowlist

- `.codex/run-manifests/2026-07-21-lag-hang-responsiveness-publish.md`.
- Source and tests directly required by proven lag/hang defects.
- `README.md`, `ROADMAP.md`, and `HANDOFF.md`.
- An applicable categorized page and category index below `docs/features/**`.
- `docs/wiki/**`, `docs/assets/screenshots/**`, and `site/**` only for the
  verified responsiveness evidence.
- No Postman artifacts unless the final change introduces or modifies an HTTP
  API; none are expected for this desktop responsiveness milestone.

## Declared validation and publication

- Focused regression tests for every changed path, including timeout,
  cancellation, teardown, and late-result behavior where applicable.
- App TypeScript `--noEmit`, relevant root/script checks, Prettier, ESLint,
  Markdownlint, `git diff --check`, and documentation-link/catalog checks.
- Exact no-download production build through the fixed MCP HTTP service.
- Off-screen original-resolution UI inspection for expected state, nonblank
  pixels, clipping, private data, theme/language, and dimensions.
- Full diff inspection plus credential, private-path, and conflict-marker scan.
- Commit the task branch, integrate it into `main` without force, push
  `origin/main`, and verify the exact remote SHA and applicable CI, CodeQL,
  Pages, release, README, and wiki evidence.
- Preserve unrelated baseline work. Remove a branch/worktree only after proving
  its tip is contained in pushed `origin/main`; report any residue that cannot
  be safely integrated or removed.

## Final local acceptance receipt

- Fixed MCP source remained clean at
  `ed1427f69b20dcd66df1de2ae3c6ba6591e2e640`; preflight and scheduled-task
  command inspection returned `client_ok: true`.
- App-source candidate `aabb111d2c01f38e7535ab077048816a5ad16893`
  completed the required no-download production build. All five Webpack
  configurations compiled successfully and the build log ended with
  `Done in 1178.13s`; the 11,839-byte log had SHA-256
  `afa6312fc25cb5a083ed0550f1029768ea2072fa21b33caf36da116f3bb6a812`.
  The later `fa4806971c` app feature was integrated after that build;
  pushed-SHA Windows CI is the final integrated build proof.
- Tests: focused Git/process 30/30; changed-test/Pages/wiki 84/84; complete UI
  815/815; all-files 1,491/1,492 with one intentional skip; final combined
  Cheap-LFS/release/workflow/guard/editor gate 83/83.
- GitHub runners proved the Playwright ffmpeg cache fix on Windows x64,
  packaged E2E, and arm64. The remaining x64 failure was exactly the stale
  temporary-submodule guard assertion fixed by this branch. The concurrent
  `opencode.json` missing-final-newline lint failure is formatted in the final
  handoff commit.
- The first off-screen capture was rejected because the 780 px editor was
  clipped by a 390 px anchored shell. The shell defect is fixed and covered,
  but the rejected PNG is not published. Final-source recapture remains
  follow-up evidence.

## Cleanup ledger

- Owned verification roots:
  `%TEMP%\desktop-material-lag-hang-20260721T140722-0400` and
  `%TEMP%\desktop-material-lag-hang-final-aabb111d-20260721T1953`; final
  containment-checked cleanup is pending until the handoff commit is written.
- First headless desktop: `DesktopMaterialLagHang_20260721_140722` was created
  once, then disappeared when the fixed MCP service was externally restarted.
  It produced no accepted capture and is not reused.
- First launch PID: `13316`; it exited with the lost desktop and has no accepted
  screenshot receipt.
- Rejected-capture desktop/app: `DesktopMaterialLagHangFinal_20260721_1829` is
  closed;
  PIDs `17500` and `8536`, every owned child, and loopback listener `60129` are
  absent.
- Integrated task worktree: cleaned after its exact tip reached `origin/main`.
  The separate verification worktree recorded above owns the remaining build,
  capture, documentation, and publication proof.
- Pre-existing linked worktree:
  `%LOCALAPPDATA%\Temp\desktop-material-cheap-lfs-hotfix-019f8580` on
  `codex/cheap-lfs-hotfix`; do not remove until remote containment and
  clean-tree checks pass.
- Initial stash list: empty.
