# Auto-update launch and CI recovery run

- Mode: `publish`
- Milestone: restore bounded Windows auto-update relaunch and green CI; recover
  and integrate the unfinished v2 workflow surfaces; add repository forking,
  SSH-host working-copy management with credential-vault persistence, and a
  hostable mobile repository-control site.
- Authorization: the user explicitly requested “fix ci and git push”; repository
  policy also requires all intended work to be committed and pushed.
- Project: `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Remote: `origin` (`codingmachineedge/desktop-material`)
- Expected branch: `main`
- Initial canonical-checkout baseline: clean `main` at
  `126bf1aa7e` with `0/0` divergence from the cached `origin/main` ref.
- Preserved external state: the linked detached worktree under
  `.claude\worktrees\handoff-md-implementation-3b529c` was preserved as the
  local branch `codex/recover-v2-workflow-surfaces`, rebased onto the initial
  baseline, and committed at `d36c87ae34`. It stays linked and clean until its
  useful tip is integrated, pushed, and proven to be an ancestor of
  `origin/main`; only then may the user-requested branch/worktree cleanup run.
- Expected installed UI state: after applying an auto-update, Desktop Material
  starts on an off-screen Win32 desktop and renders a stable, nonblank app
  window without a startup crash or missing executable/resource failure. The
  integrated app also exposes the recovered v2 surfaces, a guarded fork action,
  and SSH-host clone/manage controls whose secrets never enter repository or
  profile files.
- Ordered background interactions: inspect the exported session and GitHub
  Actions evidence; inspect the installed Squirrel layout/logs; preflight the
  fixed low-level MCP service; build the exact source without downloads; create
  a disposable repository and isolated user-data directory; launch only on a
  uniquely named headless desktop; resolve the runtime HWND; capture and inspect
  the client area; close by revalidated HWND; remove only owned temporary paths.
- Disposable fixture root:
  `%TEMP%\DesktopMaterialAutoUpdateLaunchRecovery-20260717`
- Headless desktop: `DesktopMaterialAutoUpdateLaunchRecovery20260717`
- Verification capture: an owned temporary PNG under the disposable fixture
  root, system theme, native default window size; no documentation screenshot
  promotion is planned unless the fix materially changes visible UI.
- Web deliverable: `remote-site/`, a Docker-hosted, phone-first Material control
  surface. Normal LAN access uses expiring one-time QR pairing, device-scoped
  credentials, optional client-side persistent login, and desktop-side device
  revocation. The app displays the selected LAN address/port and QR payload.
  A separately confirmed `YOLO LAN` mode is deliberately unauthenticated with
  full command rights and must never be the default. The same validated site is
  published through Sites after its source is pushed.
- Initial CI evidence: run `29619241549` failed formatting for
  `history-panel-v2-style-test.ts`, repository-tools UI tests that still assumed
  the pre-hub layout, and packaged E2E because the new first-run checklist
  intercepted the Add Repository dialog. The first two are covered by focused
  fixes; the app now offers the checklist only after a welcome flow completed
  in the same process so an update cannot modal-block an existing workspace,
  and the fresh-profile E2E explicitly completes that checklist.
- Update evidence: Squirrel installed build 129 and launched it cleanly, but
  `--processStartAndWait` waited about 67 seconds for the old process. Owned
  shutdown tasks are therefore bounded independently, and the agent server
  force-closes idle/in-flight connections after resolving pending requests.
- Documentation allowlist: this manifest, `HANDOFF.md`, and focused user/developer
  guidance required by the fork, SSH manager, and remote-site features.
- Planned checks: focused updater/packaging, fork, SSH-host, agent-server,
  workflow/static, and mobile-site tests; formatting and lint for changed
  source; TypeScript; both site and exact desktop production builds; off-screen
  installed/startup smoke; Git diff/secret scan; and applicable GitHub
  Actions/release/deployment verification at the pushed commit.
- Cleanup ledger fields: run id, owned paths, desktop create state, launch PID,
  resolved HWND, capture path, graceful-close result, fallback termination (if
  any), desktop-close result, and owned-path removal result.
