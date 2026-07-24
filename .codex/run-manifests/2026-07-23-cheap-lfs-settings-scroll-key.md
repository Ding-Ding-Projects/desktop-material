# Cheap LFS settings, scrolling, and commit-key acceptance

- Run ID: `20260723-221314-6ed09c0d`
- Mode: `publish`
- Milestone: prove the Large files settings route and vertical scrolling, plus the deletion-only private-key commit bypass
- Expected UI state: the Large files page shows `Open Cheap LFS settings`; activating it opens Repository settings on `Build & run`; a constrained window can scroll from the manager heading through the pinned-file list
- Ordered background interactions: preflight fixed MCP; build the unpackaged production app; create a disposable repository and isolated user-data directory; create one hidden desktop; launch only the built app; open Large files; constrain the window; capture and inspect; open Cheap LFS settings; capture and inspect; close app and hidden desktop; remove owned temporary files
- Disposable fixture root: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-cheap-lfs-settings-scroll-20260723-221314-6ed09c0d`
- Headless desktop: `dm-cheap-lfs-settings-scroll-20260723-221314-6ed09c0d`
- Screenshot target: `C:\Users\Administrator\AppData\Local\Temp\desktop-material-cheap-lfs-settings-scroll-20260723-221314-6ed09c0d\acceptance.png`
- Screenshot contract: dark theme, client-only, constrained to approximately 900x700, no private data, no clipping or blank pixels
- Documentation allowlist: `README.md`, `ROADMAP.md`, `HANDOFF.md`, `docs/features/repository-management/release-backed-cheap-lfs.md`, `docs/wiki/User-Guide.md`, `site/index.html`
- Validation: focused Cheap LFS key/UI/style/i18n/entry-point tests; CI regression test; TypeScript; project lint; exact-file Prettier; production build; hidden UI acceptance
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Account: `DingDingChae`
- Expected branch: `main`
- Cleanup ledger: owned run root, exact headless desktop name, launch PID, and resolved HWND will be recorded before launch and removed only after the owned app/window is gone
