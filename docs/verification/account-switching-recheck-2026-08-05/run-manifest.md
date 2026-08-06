# Cross-provider account switching recheck — 2026-08-05

- **Mode:** local-docs
- **Milestone:** one global active account in Settings → Accounts
- **Worktree:** `C:\Users\cntow\Documents\GitHub\desktop-material-switch-account-recheck-20260805`
- **Branch:** `codex/recheck-switch-account-20260805`
- **Remote:** `https://github.com/Ding-Ding-Projects/desktop-material.git`
- **Expected UI state:** Settings → Accounts shows exactly one Active
  account across provider sections and exposes Make active for every signed-in
  non-active account.
- **Background interactions:** preflight the fixed Lowlevel MCP HTTP server;
  run the unpackaged production build through MCP; if it succeeds, use one
  disposable fixture, isolated user-data directory, named hidden desktop,
  dynamically resolved HWND, and client-only captures; clean every owned
  runtime resource.
- **Disposable fixture root:** a unique directory below the process-owned Temp
  root, created only if the build succeeds.
- **Screenshot target:** Settings → Accounts cross-provider active state,
  captured from the real built artifact only if the surface is reachable; no
  capture is claimed while the required build endpoint is busy.
- **Documentation allowlist:** this manifest, the multiple-accounts feature
  article, `docs/wiki/User-Guide.md`, `ROADMAP.md`, `HANDOFF.md`, and
  `changelog.json`.
- **Declared checks:** focused account/store/routing/UI tests, changed-file
  ESLint, Prettier, `git diff --check`, unpackaged production build, and
  hidden-desktop evidence when the server permits it.
- **Verification server:** the exact cheap Lowlevel MCP HTTP endpoint at
  `http://127.0.0.1:8765/mcp`; the initial preflight reported an event-loop
  wait while another long-running build occupied the server, so runtime
  evidence remains pending.
