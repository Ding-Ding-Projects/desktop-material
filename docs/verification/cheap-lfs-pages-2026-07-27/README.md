# Cheap LFS GitHub Pages visual-guide verification

The dedicated `site/cheap-lfs.html` guide was exercised in an off-screen,
installed Chrome process at 1440×960 and 390×844. The run loaded all 17 images
(12 labelled concept illustrations and five genuine product captures), switched
among English, Cantonese, and bilingual modes, exercised the independent
persisted English/Cantonese funny-level sliders at levels 1 and 5, toggled dark
theme, opened compact navigation, and checked horizontal overflow and callout
bounds.

## Results

- 17/17 images loaded with non-zero natural dimensions.
- 12/12 generated visuals carry a visible concept-art label.
- 5/5 genuine UI figures carry a real-evidence label and retain their original
  pixels beneath HTML/CSS callouts.
- English, Cantonese, and bilingual modes switched without stale English copy
  in Cantonese-only mode.
- English and Cantonese funny-level sliders persisted independently from 1–5
  and changed live hero/preview copy.
- Desktop and 390-pixel bilingual layouts reported zero page-level horizontal
  overflow; compact controls and callouts remained in bounds.
- Dark/light switching, compact navigation, and browser console checks passed.
- `script/cheap-lfs-pages-test.mjs` passed its publication contract.
- Existing docs hub/search/regex suites passed 41/41.
- Prettier, JavaScript syntax, and `git diff --check` passed.

## Captures

| Capture | Size | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `cheap-lfs-pages-wide.png` | 1440×960 | 722,612 | `3daa3bfc6345d5466705526aebd55cff297b361807a1217b7bd9da6ea34fce0d` |
| `cheap-lfs-pages-narrow.png` | 390×844 | 202,028 | `718015f5546ae74aacc8412cf48372738076b75598cfed8c57702597eb22919c` |

The wide frame shows the bilingual desktop hero and full navigation. The narrow
frame shows the compact header, bilingual hero, and in-bounds primary action.
Generated artwork is explanatory only; the five UI figures on the page are the
existing genuine built-app acceptance captures.
