# Headless run manifest — agent repair and background progress

- Date: 2026-07-30
- Scope: Windows desktop app only
- Entry points: conflict resolver, failed Actions CI repair, Build & Run
  background progress, Cheap LFS restore collapse, command palette
- Build: `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
- Acceptance: real built app in off-screen Win32 Headless Desktop through the
  fixed Lowlevel MCP HTTP endpoint; no visible desktop interaction
- Capture targets: command palette direct feature results, hideable build
  progress, and collapsible Cheap LFS restore details where fixture state is
  available
