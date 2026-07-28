# Cheap LFS vs Git LFS standalone comparison page — run manifest

- Mode: `publish`
- Milestone: standalone, highly detailed Cheap LFS versus Git LFS marketing
  comparison for GitHub Pages
- Date: 2026-07-28 (America/Toronto)
- Isolated worktree:
  `C:\Users\cntow\AppData\Local\Temp\desktop-material-cheap-lfs-vs-git-lfs-20260728`
- Starting source:
  `823f7fa0e5b4ebefd35ee8434c9c90ed420a6127`
- Expected page state:
  - a new stable `/cheap-lfs-vs-git-lfs.html` route exists independently of
    `/cheap-lfs.html`;
  - the page presents at least 60 sourced decision rows across at least ten
    categories without claiming Cheap LFS and Git LFS are interoperable;
  - category, winner, and text filters compose; category and winner persist
    locally, while reader queries, patterns, and sample text do not;
  - six browser-style tabs support roving focus, overflow selection,
    reordering, pinning, hash restoration, persisted order, and a persisted
    per-tab appearance editor;
  - visual architecture, pointer, cost, workflow, and decision guidance uses
    genuine code-native SVG/CSS graphics rather than mock application UI;
  - English, playful Hong Kong-style Cantonese, and bilingual modes work with
    independent persisted funny-level controls;
  - explicit “choose Cheap LFS”, “choose Git LFS”, and “use both in separate
    repositories” guidance remains honest about current implementation and
    open evidence gaps;
  - the page has no clipped, overlapping, or document-level horizontal
    overflow at 1440×960 and 390×844.
- Ordered headless interactions:
  1. preflight the fixed Lowlevel MCP HTTP service and scheduled task;
  2. attempt the skill-required reproducible application build without
     downloading missing dependencies;
  3. start an owned loopback static server through Lowlevel MCP;
  4. drive installed headless Chrome through every category, winner, and text
     filter;
  5. exercise language modes, funny levels, theme, compact navigation, and
     keyboard focus;
  6. verify all images, links, console, requests, and desktop/narrow overflow;
  7. capture the atlas overview at 1440×960 and a narrow decision view at
     390×844;
  8. close the owned browser/server and remove only owned temporary resources.
- Screenshot targets:
  - `docs/verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/comparison-atlas-wide.png`
  - `docs/verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/comparison-push-narrow.png`
- Publication allowlist:
  - `.github/workflows/pages.yml`
  - `.codex/verification/verify_cheap_lfs_vs_git_lfs_page.js`
  - `site/cheap-lfs-vs-git-lfs.html`
  - `site/cheap-lfs-vs-git-lfs.css`
  - `site/cheap-lfs-vs-git-lfs.js`
  - `site/assets/cheap-lfs/comparison-orbit.svg`
  - `site/assets/cheap-lfs/pointer-paths.svg`
  - `site/index.html`
  - `site/cheap-lfs.html`
  - `script/cheap-lfs-vs-git-lfs-pages-test.mjs`
  - `docs/features/repository-management/README.md`
  - `docs/features/repository-management/cheap-lfs-vs-git-lfs.md`
  - `docs/features/repository-management/release-backed-cheap-lfs.md`
  - `docs/technical/documentation-site-build.md`
  - `docs/verification/README.md`
  - `docs/verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/**`
  - `docs/wiki/Feature-Gallery.md`
  - `docs/assets/site/docs-hub-catalog.js`
  - `docs/index.html`
  - `README.md`
  - `ROADMAP.md`
  - `HANDOFF.md`
- Declared checks:
  - standalone route, source/asset/link, comparison-row, citation, language,
    and interaction contract;
  - JavaScript syntax and YAML/HTML/CSS formatting;
  - documentation hub catalog/search/regex tests;
  - desktop and narrow installed-Chrome rendering, accessibility, overflow,
    image, request, and console checks;
  - `git diff --check`, staged allowlist, and secret-pattern scan.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected remote branch: `main`
- Publication authorization: repository instructions require every completed
  repository change to be pushed, and the user explicitly requested a GitHub
  Pages page.
- Initial dirty-state boundary:
  - the active `main` checkout at `fe8b5b0eb7` and renderer files/profiles are
    owned by thread `019fa6e6-b870-74c2-b2ec-f5af37ac6a70`;
  - helper worktree `desktop-material-cheap-lfs-helper-20260728` at
    `e61c0afa7c` and `.codex/runs` are off limits;
  - issue worktree `desktop-material-close-issues-20260728` at `f262990352` is
    off limits;
  - this task edits only the isolated worktree and allowlist above.
