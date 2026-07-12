# Desktop Material completion run manifest

- Mode: `publish`
- Milestone: finish every remaining item in `plan.md` and `HANDOFF.md`, integrate to `main`, and push
- Expected UI state: all roadmap UI states implemented and verified in the native Desktop Material Electron app
- Ordered background interactions: preflight MCP; build; create disposable Git fixture; create one off-screen Win32 desktop; launch built Electron with isolated user data; resolve HWND; capture; exercise milestone interactions; recapture after each meaningful action; close by verified HWND; close desktop
- Disposable fixture path: unique owned `%TEMP%\\desktop-material-finish-all-20260712-*` run root, created only after build
- Screenshot target: `docs/assets/screenshots/` targets identified by the completed milestones; preserve each documented theme and dimensions
- Documentation allowlist: `README.md`, `HANDOFF.md`, `plan.md`, relevant files under `docs/`, and roadmap-linked documentation only
- Tests: focused tests per increment, lint, typecheck, production unpackaged build, relevant integration/E2E checks, visual inspection at original resolution, secret scan
- Remote: `origin`
- Expected branch: delegated `codex/*` worktree branches merged into `main`; final push to `origin/main` without force
- Publication authorization: explicit user request to commit and push throughout and push final `main`
- Cleanup ledger: record run id, owned paths, desktop name, create state, launch PID, and resolved HWND before the GUI phase
