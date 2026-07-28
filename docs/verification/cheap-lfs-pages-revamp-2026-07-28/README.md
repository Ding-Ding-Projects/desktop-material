# Cheap LFS Pages comparison and push-guide verification

Date: **2026-07-28**

Scope: **GitHub Pages and documentation only**

Route: [`/cheap-lfs.html`](https://ding-ding-projects.github.io/desktop-material/cheap-lfs.html)

## Outcome

The locally assembled Pages site passed **46/46** browser checks across
**eight/eight** phases. The accepted source presents:

- a sourced, bilingual, filterable **30-point** Cheap LFS versus Git LFS
  decision table;
- five comparison categories plus the all-results view, with the selected
  filter persisted across reloads;
- a **six-stage** provider-first push handoff;
- the first-branch GitHub Release anchor as a distinct exception;
- committed-pointer inspection with `git show`, plus fetched
  `HEAD`/`@{upstream}` SHA proof;
- explicit guidance not to add the materialized raw file; and
- honest Git LFS recommendations where its specification, host integration,
  or cross-platform ecosystem is the better fit.

## Headless acceptance

The verifier
[`verify_cheap_lfs_pages_revamp.js`](../../../.codex/verification/verify_cheap_lfs_pages_revamp.js)
started an owned loopback static server and drove installed Google Chrome in
headless mode through the fixed Lowlevel MCP HTTP service. The final exact
source run lasted from `2026-07-28T16:28:40.203Z` to
`2026-07-28T16:28:55.623Z` and returned `client_ok: true`, exit code `0`, with
zero recorded console, page, request, HTTP, phase, fatal, or cleanup errors.

The browser matrix covered:

- 1440×960 and 390×844 viewports;
- English, playful Hong Kong-style Cantonese, and bilingual modes;
- light and dark themes;
- English and Cantonese funny levels 1 and 5 with persisted values;
- all comparison filters and reload persistence;
- desktop and narrow document/table overflow;
- compact-navigation keyboard reachability;
- all 17 images and all local HTTP responses; and
- deterministic browser and server closure.

## Accepted captures

| Capture | State | Size | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| [Cheap LFS comparison](cheap-lfs-comparison-wide.png) | Bilingual, light, comparison controls and table | 1440×960 | 201,049 | `7543055387939a0b19d294364ddcd29f14e7e30675a3fbd6dac0ae84307bb6ca` |
| [Git push handoff](cheap-lfs-push-narrow.png) | English, dark, safe branch-proof commands | 390×844 | 42,321 | `e7df18fa0504868ae8eb30584c886434ec3b5ee3c882289d055a37b74ff7806a` |

Both PNGs were inspected at original resolution. No clipping, blank frame,
private data, or unrelated desktop content was present. These are real site
captures, not mockups, and they do not alter the 89-scene built-app gallery.

## Focused checks

| Check | Result |
| --- | --- |
| `node script/cheap-lfs-pages-test.mjs site` | Passed: 30 cross-checked criteria, 6 push stages, 17 images, 12 concepts, 5 genuine UI captures, 3 language modes, 2 persisted funny sliders |
| Documentation hub/search/regex/catalog tests | **59/59 passed** |
| JavaScript syntax for the guide and verifier | Passed |
| Targeted Prettier check | Passed |
| Lowlevel MCP Pages browser acceptance | **46/46 passed**, eight/eight phases |

## Evidence boundary

The skill-required full Electron production build was launched through the
exact Lowlevel MCP endpoint with
`RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1`. It remained silent for
more than 34 minutes and was interrupted when the user explicitly prioritized
the site push. This receipt therefore makes **no Electron build, package, or app
runtime claim**. It verifies the Pages source and its browser behavior only.

The final commit, push proof, Pages run, and live-route confirmation are added
to the rolling GitHub Discussion and repository handoff after publication.
