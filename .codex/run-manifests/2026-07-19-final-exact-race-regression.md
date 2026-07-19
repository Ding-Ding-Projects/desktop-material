# Final exact-bundle submodule race-regression manifest

- Date: 2026-07-19 (America/Toronto)
- Mode: `local-docs` (the wider milestone remains authorized for publication)
- Purpose: bind the post-lifecycle-audit source tree to the exact MCP production
  build and prove that rapid duplicate activation of **Open as repository** and
  **Back** is safely coalesced.
- Build: `npx --no-install cross-env RELEASE_CHANNEL=development
  DESKTOP_SKIP_PACKAGE=1 yarn build:prod`, run through
  `http://127.0.0.1:8765/mcp` with a 3,600-second tool timeout.
- MCP checkout: `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp`
  at `8d6940be6a5f6e7c37de3f73acd2259fa7651efe`.
- Owned disposable root:
  `%TEMP%\desktop-material-p0-ui-final-race-20260719`; it must be absent before
  creation and contains the Git root fixture, child source/bare repository,
  isolated user data, CDP captures, and machine-readable receipt.
- Owned hidden desktop: `DesktopMaterialFinalRace-20260719`; create exactly
  once, never show it, and close it after the owned app window is gone.
- Launch: the rebuilt `node_modules\electron\dist\electron.exe` loads
  `out\main.js` with `--disable-gpu`, an isolated `--user-data-dir`, an owned
  loopback `--remote-debugging-port`, and the disposable root fixture passed as
  `--cli-open`.
- Expected checks: a real initialized submodule opens once despite two immediate
  DOM clicks; no persistent repository entry or extra tab is created; two
  immediate Back clicks restore the exact parent once; child context disappears;
  no error notice is present; child and restored-parent frames are nonblank at
  1440x960 and inspected before cleanup.
- Cleanup: close only the revalidated window or exact saved PID as a fallback,
  prove the CDP port and desktop windows are absent, then delete only the
  containment-checked owned root.
- Publication: no external state is changed by this local proof. The result is
  recorded in the milestone manifest and handoff before the feature commit.

## Result

- A first post-audit probe exposed an equivalent-parent-model race: resolving a
  legacy `gitDir` replaced the persisted parent object while the selected popup
  still held the previous instance. The temporary-open store boundary now
  safely rebinds only a selected persisted parent with the same constructor and
  stable id; a genuinely changed selection still fails closed. The focused
  navigation, manager, and Back-guard suites passed **29/29** after that fix.
- The corrected source was rebuilt through the specified Lowlevel MCP command.
  The resulting fresh renderer bundle was the one launched below; its runtime
  behavior proves the post-fix bundle rather than an earlier artifact was
  exercised. The MCP client output stream detached before it could return the
  build receipt, so this manifest deliberately does not invent a duration or
  exit code for that second build.
- Final owned fixture: root `6c84e5707a585c74cfed23e53927ca61853dc401`,
  initialized child `d7e5971b5ff27a89c2f82e6d40cf670bef0c682c`, clean status.
- Final hidden app: saved launch PID `28452`, dynamically resolved app HWND
  `565511420`, desktop `DesktopMaterialFinalRace-20260719`, CDP port `62245`.
  No normal desktop was shown or focused.
- The attach-only verifier synchronously called the initialized row's DOM
  `click()` twice before yielding to the renderer, then synchronously called
  Back twice. The receipt recorded persistent repository count **1** and tab
  count **1** before the child, in the child, and after return; the exact parent
  remained `fixture`, the child context disappeared after Back, and no error or
  crash surface appeared. This proves the duplicate activation did not add a
  repository or tab and returned once to the original root.
- `race-child.png`: 1440×960, 98,073 bytes,
  SHA-256 `1c65bbbb43745ef1e7b5da727cd4be176c71ecb17324647c9a87e0ec7da84196`.
  It was inspected at original pixels and showed the temporary child, visible
  **Back to fixture**, and the explicit non-persistence context copy.
- `race-parent.png`: 1440×960, 185,945 bytes,
  SHA-256 `7f68c0138a4f0d453acea5a50bdb9190ef9ffdd1800446dd75e7ca55f332ea29`.
  It visually confirmed the restored parent, but its Repository Tools copy
  contained the disposable Temp path. It was rejected for public promotion.
  Neither frame was added to the repository; the six public gallery images
  remain the already reviewed privacy-safe set.
- Cleanup is **COMPLETE**: the graceful HWND close route was attempted but the
  off-screen Win32 provider could not resolve that handle for `window_action`;
  after revalidating the saved PID and its exact command line, only PID `28452`
  was terminated. The headless desktop then had zero windows, port `62245` was
  absent, the desktop was closed, and the containment-checked owned Temp root
  was removed. The earlier failed-probe root was also removed before the final
  run.
