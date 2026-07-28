# Cheap LFS GitHub Pages product-guide revamp — run manifest

- Mode: `publish`
- Milestone: expanded Cheap LFS product guide, push walkthrough, and Git LFS
  comparison
- Date: 2026-07-28 (America/Toronto)
- Expected page state:
  - the existing `/cheap-lfs.html` route remains stable and linked from the
    Pages homepage;
  - the hero and navigation make the new push and comparison content
    discoverable;
  - a dedicated `git push` section explains the verified provider-upload →
    pointer-review → commit → push → remote-proof sequence without implying
    Git LFS interoperability;
  - a large, bilingual, marketing-style comparison presents at least 20
    factual decision criteria for Cheap LFS and Git LFS, including honest
    trade-offs and explicit “choose Git LFS when…” guidance;
  - additional product facts cover fit, storage, collaboration, integrity,
    restore, portability, privacy, migration, and failure boundaries;
  - English, playful Hong Kong Cantonese, and bilingual modes plus independent
    persisted funny-level controls remain functional;
  - no clipped, overlapping, or horizontally overflowing content at desktop
    and narrow widths.
- Ordered headless interactions:
  1. preflight the fixed Lowlevel MCP HTTP service and its scheduled-task
     action;
  2. run the reproducible unpackaged application build through Lowlevel MCP;
  3. assemble the Pages tree and start an owned loopback static server through
     Lowlevel MCP;
  4. open `cheap-lfs.html` in an installed headless Chrome process launched
     through Lowlevel MCP;
  5. exercise the new comparison controls, copyable push commands, language
     modes, funny-level controls, theme, and compact navigation;
  6. verify desktop at 1440×960 and narrow layout at 390×844, including
     document/table overflow and keyboard focus;
  7. capture the comparison and push sections to unique owned PNGs;
  8. close the owned browser/server and remove only owned temporary files.
- Disposable fixture path: a unique owned directory below the current user's
  Temp directory, recorded in the cleanup ledger before launch.
- Screenshot targets:
  - `docs/verification/cheap-lfs-pages-revamp-2026-07-28/cheap-lfs-comparison-wide.png`
    (bilingual, light, 1440×960);
  - `docs/verification/cheap-lfs-pages-revamp-2026-07-28/cheap-lfs-push-narrow.png`
    (English, dark, 390×844).
- Documentation allowlist:
  - `site/cheap-lfs.html`
  - `site/cheap-lfs.css`
  - `site/cheap-lfs.js`
  - `site/index.html`
  - `site/style.css`
  - `script/cheap-lfs-pages-test.mjs`
  - `.codex/verification/verify_cheap_lfs_pages_revamp.js`
  - `docs/features/repository-management/release-backed-cheap-lfs.md`
  - `docs/features/repository-management/README.md`
  - `docs/wiki/Feature-Gallery.md`
  - `docs/index.html`
  - `docs/assets/site/docs-hub-catalog.js`
  - `README.md`
  - `ROADMAP.md`
  - `HANDOFF.md`
  - `docs/verification/README.md`
  - `docs/verification/cheap-lfs-pages-revamp-2026-07-28/**`
- Declared checks:
  - Cheap LFS Pages publication contract and asset/link existence;
  - comparison-row count, semantic table/list structure, honest fit guidance,
    and required `git push` commands;
  - HTML semantics and accessibility;
  - JavaScript syntax and interactive copy/filters;
  - local Pages assembly;
  - desktop/narrow rendered overflow, clipping, focus, and console checks;
  - dark theme and all three language modes;
  - Prettier and `git diff --check`.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `main`
- Publication authorization: the user explicitly requested `git push`.
- Initial dirty-state baseline:
  - modified `app/src/lib/stores/app-store.ts`;
  - untracked `.codex/verification/capture_renderer_cpu_profile_cdp.js`,
    `app/src/lib/after-renderer-paint.ts`,
    `app/test/unit/after-renderer-paint-test.ts`, and four
    `docs/verification/renderer-responsiveness-2026-07-28/post-fix-*.json`
    profiles;
  - linked worktree
    `desktop-material-close-issues-20260728` on
    `codex/close-all-open-issues-20260728`.
  These items predate this Pages task and are outside its allowlist.
- Lowlevel preflight:
  - `startup_status`: installed, ready, `client_ok: true`;
  - scheduled action: `uv run --directory
    C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp
    lowlevel-computer-use-mcp --http --host 127.0.0.1 --port 8765`;
  - scheduled working directory:
    `C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp`;
  - MCP checkout commit: `f2edfe442555cfe35a519dd0b058986cb09d6ee3`.
