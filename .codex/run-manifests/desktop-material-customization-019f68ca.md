# Desktop Material customization milestone run manifest

- Run ID: `desktop-material-customization-019f68ca`
- Mode: `publish`
- Authorization: the user explicitly requested to keep pushing and to update the wiki, Pages, README, roadmaps, and memory.
- Milestone: substantially expand the existing customization system, prefer repository-scoped settings, retain app-wide settings in the app's existing local Git-config storage, add responsive toolbar overflow, then document and publish the result.
- Expected UI state: the established customization/settings surface exposes many coherent controls, changes apply visibly, repository choices remain isolated per repository, app-wide choices use the established config store, saved choices survive an app restart, and existing defaults remain compatible. When the header toolbar lacks horizontal space, lower-priority actions move into an accessible `More` dropdown and return inline as space becomes available without clipping.
- Ordered background interactions:
  1. Launch the reproducible unpackaged build against an isolated disposable Git fixture and isolated user-data directory.
  2. Capture the stable initial app state.
  3. Navigate to the existing customization/settings surface using only HWND-targeted background input.
  4. Exercise every added option and recapture after each meaningful state change.
  5. Resize narrower and wider to verify dynamic toolbar overflow and restoration.
  6. Restart only if required to verify both repository and app-wide persistence, then capture the final documented state.
- Disposable fixture: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-customization-019f68ca\fixture`
- Isolated user data: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-customization-019f68ca\user-data`
- Cleanup ledger: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-customization-019f68ca\cleanup-ledger.json`
- Headless desktop: `DesktopMaterialCustomization019f68ca`
- Screenshot target: provisional `docs/assets/screenshots/customization-options.png`; exact existing gallery naming will be recorded before promotion.
- Screenshot presentation: use the app's documented default theme unless the customization itself is the subject; target client size `1440x960`.
- Documentation allowlist: `README.md`, existing Pages sources under `docs/`, existing wiki Markdown under `docs/wiki/`, every repository roadmap discovered during inventory, and `HANDOFF.md`. Amend this manifest with exact paths before documentation edits.
- Implementation allowlist: only existing source/test files required for the selected customization controls. Amend with exact paths before staging.
- Declared checks: focused tests for the changed persistence/state/UI behavior; repository lint/typecheck/test commands applicable to the touched packages; reproducible production build; visual inspection of original-resolution captures; secret scan; full and staged diff review.
- MCP endpoint: `http://127.0.0.1:8765/mcp`
- MCP checkout: `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP preflight: `startup_status` returned `ok: true`, installed task `LowLevelComputerUseMCP`, state `Ready`, run level `Limited`.
- Scheduled-task action verified through MCP `run_command`: executable `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp\.venv\Scripts\python.exe`; arguments `-m lowlevel_computer_use_mcp.server --http --host 127.0.0.1 --port 8765`; working directory `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp`.
- MCP checkout revision verified through MCP `run_command`: `806d9ba85e4afbc2af58d7499496babfa7c68891`.
- Project checkout required by the skill: `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Remote: expected `origin` (exact URL to be confirmed before any edits).
- Expected publication branch: `main` (must be confirmed with branch, account, and divergence checks).
- Confirmed publication checkout: `C:\Users\Administrator\Documents\GitHub\desktop-material` on `main` at `d1215d7f2967db24bdc1a50699eea1697834ae8f`, tracking `origin/main` at the same reported status.
- Confirmed remote: `https://github.com/codingmachineedge/desktop-material.git`; authenticated GitHub account `codingmachineedge` over HTTPS.
- Initial dirty-state baseline (protected): modified `PLAN.md`, `README.md`, `app/src/lib/automation/pull-all.ts`, `app/src/lib/stores/app-store.ts`, `app/src/ui/dispatcher/dispatcher.ts`, `app/src/ui/pull-all/pull-all-dialog.tsx`, `app/styles/ui/_pull-all.scss`, `app/test/unit/post-shell-style-test.ts`, `app/test/unit/pull-all-test.ts`, `docs/README.md`, `docs/process/roadmap.md`, `docs/wiki/Home.md`, `site/index.html`; untracked `.codex/offline-yarn/`, `.codex/run-manifests/2026-07-15-feature-completeness-audit.md`, `.codex/run-manifests/2026-07-15-pull-all-progress-dialog.md`, `ROADMAP.md`, `app/test/unit/feature-registration-completeness-test.ts`, and `app/test/unit/pull-all-ui-test.ts`. These remain protected baseline work unless review proves they are the directly preceding milestone to finish and publish intact.
- User visual reference: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-2d6b84e8-f0d4-45cc-8d8f-8f3487bfe26e.png` (toolbar controls clipping/truncating in a narrow header).
