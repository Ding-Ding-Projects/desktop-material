# Accessibility and clipping gate

- Mode: `publish`
- Milestone: Desktop Material accessibility labels, keyboard focus, responsive clipping, and screenshot evidence
- Project: `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Initial branch/remote: `main` / `origin` (`https://github.com/codingmachineedge/desktop-material.git`)
- Initial HEAD: `9c3ca9a0621ade2a9e6c3c0bb07ed6234c17fbeb`
- Initial worktree: clean
- Required runtime: exact lowlevel-computer-use MCP HTTP server and off-screen Win32 Headless Desktop
- Expected UI states: welcome/Changes shell, Preferences/Appearance, repository tools, Actions cache/pagination, and Pages gallery at desktop and narrow widths
- Ordered interactions: build, create disposable fixture and isolated profile, launch one uniquely named headless desktop, resolve the current app window, capture stable states, exercise keyboard/focus and narrow-window layouts through HWND-targeted input only, inspect captures, and clean up in a finally path
- Disposable fixture/user-data root: unique owned `%TEMP%` root created for this run and removed after verification
- Screenshot targets: existing and newly promoted privacy-safe PNGs under `docs/assets/screenshots/`, original-resolution inspection required
- Documentation allowlist: this manifest, confirmed app/style/test fixes, `README.md`, `HANDOFF.md`, applicable `docs/wiki/*.md`, `site/index.html`, and promoted screenshot PNGs
- Tests/checks: focused accessibility/clipping tests, TypeScript, scoped ESLint, Prettier, exact production webpack build, headless geometry/focus gates, diff/secrets scan
- Publication: commit and push `origin/main`; no force push

## Acceptance criteria

- Interactive controls have accessible names/roles and keyboard focus remains visible and contained.
- Supported desktop and narrow layouts have no unintended document/body horizontal overflow, clipped controls, outside controls, or sibling overlaps.
- Any confirmed defect is fixed with a focused regression test where practical, re-exercised off-screen, documented, and pushed to `main`.
