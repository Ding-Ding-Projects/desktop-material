# Renderer responsiveness run manifest

- **Mode:** publish
- **Milestone:** user-visible lag audit and renderer update coalescing
- **Expected UI state:** the application shell paints immediately on a
  disposable repository and remains responsive while repeated app-state updates
  arrive.
- **Ordered background interactions:**
  1. build current `main` without packaging through Lowlevel MCP;
  2. create one isolated Win32 headless desktop;
  3. launch the built Electron app with isolated user data and a disposable Git
     fixture;
  4. capture startup timing, renderer long tasks, and repeated-update behavior;
  5. exercise repository navigation using HWND-targeted background input;
  6. capture and inspect the final client image;
  7. close the exact window/PID and remove only owned temporary paths.
- **Disposable fixture path:** `%TEMP%\desktop-material-renderer-perf-20260728`
- **Screenshot target:** `%TEMP%\desktop-material-renderer-perf-20260728\final.png`
- **Theme and dimensions:** default theme, 1180×820
- **Documentation allowlist:** this verification directory, quality/reliability
  feature documentation, `README.md`, `ROADMAP.md`, and `HANDOFF.md`
- **Tests:** focused update-coalescing tests, related lifecycle tests, ESLint,
  TypeScript, production build, headless launch and interaction
- **Remote:** `origin`
- **Expected branch:** `main`
- **Initial baseline:** clean `main` at
  `9bdfdb8b25e458e4834bdaa26473d44a5602621d`; the separate
  `codex/close-all-open-issues-20260728` worktree is dirty and must remain
  untouched.
