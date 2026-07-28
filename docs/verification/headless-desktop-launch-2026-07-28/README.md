# Built app launched on an off-screen desktop — 2026-07-28

Independent confirmation that the production build actually runs, captured through a
completely different route from the Playwright-driven fixture used elsewhere in
`docs/verification/`.

`first-run-on-offscreen-desktop.png` is the first-run welcome screen of the real built
application, 976×668.

## Method

1. A Win32 off-screen desktop (`WinSta0\DMVerify`) was created via the low-level
   computer-use MCP server.
2. The production build was launched on it directly:
   `electron.exe C:\dm-capture-out\main.js --user-data-dir=C:\dm-headless-profile`
   — a throwaway profile, so no developer profile is touched.
3. The window was captured with Win32 `PrintWindow` against its handle, which works while the
   window is unfocused and never appears on the visible desktop.

Nothing was rendered by a test harness. This is the shipped `main.js` and `renderer.js`
running as a real Windows process.

## Why this route exists alongside the Playwright fixture

The two prove different things. `script/capture-app.js` can *drive* the UI — open dialogs,
click controls, seed repositories — and is therefore how feature surfaces are photographed.
The off-screen desktop proves the packaged bundle **starts as an ordinary Windows
application**, outside any automation driver, with a clean profile.

## Known limitation

The off-screen desktop route can launch and capture, but **cannot drive Chromium's input**:
messages posted to `Chrome_RenderWidgetHostHWND` are ignored, so keystrokes and clicks do not
reach the renderer. Any capture needing interaction must use the Playwright fixture. That is
why this directory holds a first-run screen rather than a driven one — the limitation is
stated rather than worked around with a misleading frame.

## Provenance

- **Build:** production webpack configuration at `ffc66ed504`, renderer and main built one
  process at a time into `C:\dm-capture-out`.
- **Server:** `lowlevel-computer-use-mcp` over streamable HTTP on `127.0.0.1:8765`.
- The off-screen desktop and its profile were destroyed after capture.
