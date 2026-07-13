# Actions pagination production UI gate

- Mode: `publish`
- Run id: `dm-actions-pagination-20260713-29de6ec7`
- Milestone: verify the pushed named **Load more runs** and **Load more artifacts** workflows in the exact unpackaged production build on one off-screen Win32 desktop; reject clipping, overlap, oversized text, and non-spatial horizontal scrolling; then publish README, wiki, Pages, screenshot, and handoff evidence
- Source root: `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Source commit at manifest creation: `29de6ec70a6ac6e507bd5d8f487b66542309cba1`
- Initial baseline: clean `mega-feature-update`; local, tracking, and direct remote refs all matched the source commit above
- Remote: `origin` (`https://github.com/codingmachineedge/desktop-material.git`)
- Expected branch: `mega-feature-update`; push without force after each coherent checkpoint
- Publication authorization: the user explicitly requires continuous commits and pushes, including documentation, wiki, and Pages updates

## Required production states

1. Select the exact-provider Actions view and apply the named **Success** run filter. Page one must report 50 loaded of 51 matching runs.
2. Activate **Load more runs**. The deterministic long page-two sentinel must render exactly once, the count must become 51 of 51, and the load-more control must disappear.
3. Refresh while two run pages are loaded. Page-one polling/refresh must retain the older sentinel and the complete 51-of-51 state.
4. Select the deterministic workflow run. Artifact page one must report 30 loaded of 31.
5. Activate **Load more artifacts**. The long page-two artifact sentinel must render exactly once, the count must become 31 of 31, and the load-more control must disappear.
6. Provider receipts must contain exact authorized page-one/page-two requests. No unexpected mutation, public GitHub request, raw command runner, or endpoint browser may be exposed.

## Responsive and accessibility matrix

- Regular and documentation capture: light theme, stable original-resolution pixels.
- Minimum outer width: product-enforced minimum, with the app's auto-fit behavior recorded.
- Short height: at or below the supported 660-pixel outer height.
- Requested scale: exercise the app's 200% View scale and record its effective auto-fit value.
- Geometry: document and body scroll widths equal their client widths; every visible control remains within its panel and viewport; pager children and run-card grid children do not overlap; buttons, headings, run titles, branch chips, actor identities, artifact names, digests, and status copy have no clipped horizontal or vertical content.
- Local horizontal scrolling is allowed only for intrinsically spatial log content, which is not a screenshot target for this run.
- Screenshot privacy: only deterministic synthetic provider/repository/account/artifact data may appear.

## Deterministic fixture and targets

- Owned run root: `%TEMP%\desktop-material-p0-ui-20260713-actions-29de6ec7`; resolve and containment-check it before creation and cleanup.
- Desktop name: `DesktopMaterialActions-20260713-29de6ec7`; create and close exactly once, never show or switch to it.
- Runs: 52 total; 51 successful and one failed. Success page one returns 50; page two returns one long sentinel.
- Artifacts: 31 total for the selected run. Page one returns 30; page two returns one long sentinel.
- Credential: only the isolated development-channel service `GitHub Desktop Dev - <loopback endpoint>` and dummy fixture login/token.
- Screenshot targets: `docs/assets/screenshots/material-actions-pagination.png` and `docs/assets/screenshots/material-actions-artifact-page-two.png`.
- Documentation allowlist: this manifest, retained `.codex/verification/` fixture/driver/tests, the two screenshot targets, `README.md`, `HANDOFF.md`, `docs/wiki/Home.md`, `docs/wiki/User-Guide.md`, and `site/index.html`.

## Ordered execution

1. Preflight the exact MCP endpoint, scheduled task command, MCP checkout SHA, repository branch/remote, and publishing account without printing credentials.
2. Retain and test the deterministic pagination fixture and bounded CDP verifier; correct the development credential-service identity.
3. Commit and push the fixture checkpoint. Build that exact source through MCP with `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` and a 3,600-second tool timeout.
4. Create the owned fixture/profile/home/config/capture/download tree, start and probe the loopback-only provider, shallow-clone the fixture, and seed only its dummy credential.
5. Create one headless desktop. Launch the absolute built Electron binary with `--disable-gpu`, isolated `--user-data-dir`, an owned loopback debugging port, and only the disposable fixture through `--cli-open`.
6. Resolve the HWND dynamically and capture a stable client-only image before coordinate input. Attempt only HWND-targeted background input first. If Chromium rejects it, use the repository-retained bounded CDP driver on the owned loopback port; never use global input, show/switch the headless desktop, or expose the visible desktop.
7. Exercise all functional and responsive states, inspect original pixels, enforce geometry assertions, verify provider request receipts, and promote only accepted PNGs.
8. In a finally path, close the revalidated HWND, terminate only saved owned PIDs if needed, delete/read-back the exact dummy credential, close the desktop once, stop loopback listeners, and remove only containment-checked paths under the owned root.
9. Update the roadmap and public evidence, run declared checks, inspect full/staged diffs, scan for secrets/private paths, commit/push the repository, merge/push the existing wiki without overwriting its extra content, and verify Pages/wiki/image receipts without bypassing protected deployment rules.

## Declared checks

- Retained provider pure/HTTP/Git integration tests and live probe.
- The 74-test Actions run/artifact API, parser, store, account-routing, React lifecycle, and responsive-style suite.
- TypeScript `--noEmit`, scoped ESLint, Prettier, diff hygiene, exact production build, off-screen UI/geometry/pixel checks, provider request-log assertions, PNG dimension/SHA-256 inspection, Markdown/Pages/wiki reference checks, and secret/private-path scan.

## Executed results

Pending. This section will record the exact built source, MCP/server identities, production interactions, geometry receipts, screenshots, publication SHAs, and cleanup ledger after the gate completes.
