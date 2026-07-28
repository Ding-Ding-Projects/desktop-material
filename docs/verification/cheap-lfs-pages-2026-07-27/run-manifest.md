# Cheap LFS GitHub Pages visual guide — run manifest

- Mode: `publish`
- Milestone: dedicated bilingual Cheap LFS visual guide
- Date: 2026-07-27 (America/Toronto)
- Expected page state:
  - dedicated `/cheap-lfs.html` page linked from the Pages homepage;
  - persisted English, playful Hong Kong Cantonese, and bilingual modes;
  - 12 labelled concept illustrations;
  - five genuine built-app Cheap LFS captures with bilingual HTML callouts;
  - complete setup, tracking, provider, commit, restore, privacy, integrity,
    troubleshooting, and best-practice guidance;
  - no clipped or horizontally overflowing content at desktop or narrow widths.
- Ordered headless interactions:
  1. start an owned local static server without a visible window;
  2. open `cheap-lfs.html` on an off-screen browser surface;
  3. verify the default bilingual desktop layout at 1440×960;
  4. switch to dark theme and verify palette/readability;
  5. switch language to Cantonese and back to bilingual;
  6. resize to 390×844 and verify the compact navigation and all callout text;
  7. capture final desktop and narrow acceptance frames;
  8. close the owned browser/server and remove only owned temporary files.
- Disposable fixture path: an owned directory below the current user's Temp
  directory, recorded in the cleanup ledger before launch.
- Screenshot targets:
  - `docs/verification/cheap-lfs-pages-2026-07-27/cheap-lfs-pages-wide.png`
    (bilingual, light, 1440×960);
  - `docs/verification/cheap-lfs-pages-2026-07-27/cheap-lfs-pages-narrow.png`
    (bilingual, light, 390×844).
- Documentation allowlist:
  - `site/cheap-lfs.html`
  - `site/cheap-lfs.css`
  - `site/cheap-lfs.js`
  - `site/assets/cheap-lfs/*.webp`
  - `site/index.html`
  - `site/style.css`
  - `docs/verification/cheap-lfs-pages-2026-07-27/**`
- Declared checks:
  - asset/link existence and image-dimension validation;
  - HTML semantics and accessibility audit;
  - JavaScript syntax;
  - local Pages assembly contract;
  - desktop/narrow rendered overflow and clipping checks;
  - dark theme and all three language modes;
  - generated-art versus genuine-capture labelling;
  - focused repository Pages tests.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `main`
- Publication authorization: explicit user request to Git push.
- Initial dirty-state baseline: the checkout already contained unrelated,
  uncommitted application, TUI, README, documentation, and verification work.
  None of those paths belongs to this Pages-only publish allowlist.
