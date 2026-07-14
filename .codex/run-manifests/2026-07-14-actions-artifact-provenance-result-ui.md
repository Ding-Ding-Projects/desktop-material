<!-- markdownlint-disable MD013 -->

# Desktop Material Actions artifact provenance result UI

- Mode: `publish`
- Run id: `dm-actions-artifact-provenance-result-ui-20260714`
- Milestone: app-native review, selected-subject verification, and bounded result evidence
- Initial source: `d0373b7acaf5d3bd3899c56f1fd10bd8ac83e86e`
- Verified source pushed to `main`: `e282eb2fce`
- Branch: `main`
- Expected remote: `origin` (`codingmachineedge/desktop-material`)
- Initial dirty-state baseline: clean and aligned with `origin/main`
- Exact MCP checkout: verify before build and capture
- Owned future off-screen desktop: `DesktopMaterialProvenanceResult-<run-id>`
- Disposable future fixture root: `%TEMP%\desktop-material-actions-provenance-result-ui-<run-id>`
- Screenshot targets: light and dark provenance review/result states at the supported 960×660 outer-window request, with narrow and short-height checks
- Authorized public mutations: focused source/docs commits, push to `main`, and ordinary GitHub Pages/wiki Markdown updates through the repository

## Scope

Complete the active roadmap items for the Actions artifact provenance review/result UI. Use the existing selected-account store orchestration and main-process verifier boundary; add only renderer-safe state and a modal that exposes the archive transport digest, one explicitly selected ZIP subject, fixed source/signer policy, selected account endpoint/login, normalized outcome, and bounded evidence. The UI must state that verifying one subject does not verify every file in the archive.

Required UI behavior:

1. Start only from a completed artifact download whose local digest exactly matches the provider digest.
2. Open a single vertically scrollable dialog with contained focus and Escape/Close cleanup.
3. Load the bounded review, display the selected repository account and fixed policy, and require one subject and signer selection before verification.
4. Reopen/recompute the selected subject through the store, display a separate subject digest, and render Verified, Unavailable, Not attested, Verification failed, Changed bytes, or Canceled without raw verifier/API output.
5. Keep archive and subject identity visibly separate and make long paths/digests wrap at narrow widths.
6. Dispose the exact review/download on close, repository/run/account replacement, unmount, and retry paths.

## Ordered verification

- Use the fixed low-level MCP HTTP server and off-screen Win32 Headless Desktop only; never show or focus the user's visible desktop.
- Build with `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` through MCP.
- Use a deterministic disposable synthetic Actions fixture, isolated Electron user data, a unique hidden desktop, and a runtime-resolved app HWND.
- Exercise open review, subject selection, verify, normalized result, close, Escape, short height, narrow width, dark theme, and 200% base-scale layout checks by hwnd-targeted automation.
- Inspect every candidate PNG at original resolution before promotion.

## Documentation allowlist

- `README.md`
- `docs/wiki/Feature-Gallery.md`
- `docs/wiki/Home.md`
- `docs/wiki/User-Guide.md`
- `site/index.html`
- `docs/assets/screenshots/material-actions-artifact-provenance-review.png`
- `docs/assets/screenshots/material-actions-artifact-provenance-result.png`
- `docs/assets/screenshots/material-actions-cache-manager.png`
- `docs/assets/screenshots/material-actions-pagination-headless.png`
- `docs/assets/screenshots/material-actions-artifacts-headless.png`
- `docs/assets/screenshots/material-actions-sentinel-headless.png`
- `HANDOFF.md`
- this manifest

## July 14 cache and pagination receipt

- Renderer/store completion: the Actions cache manager is mounted after repository-account
  subscription, retries the initial load across late GitHub association, preserves cache state when
  run refreshes complete, and uses bounded list/usage/delete operations.
- Fixture extension: `.codex/verification/p0_fake_github_provider.py` serves three synthetic caches
  and bounded usage/deletion routes; its unit suite passes 12/12.
- Exact MCP headless run: `DesktopMaterialActionsCache-20260714-8c4f`; fixture endpoint
  `http://localhost:51008/api/v3`; renderer CDP was loopback-only on port `51111`; the app ran from
  the cached Electron 42.0.1 runtime because the local Electron package binary was absent.
- Pagination gate: 51 successful workflow runs and 31 artifacts loaded, page-two sentinels present,
  with `documentScrollWidth === documentClientWidth`, no overflow, clipping, outside controls, or
  pagination overlaps.
- Cache gate: 3 caches, `836.8 MiB` usage, all three cache cards and delete controls visible in a
  960×660 original-resolution PNG; cache panel geometry had no horizontal overflow.
- Promoted screenshots (SHA-256):
  - `material-actions-cache-manager.png` — `f6eb8b74ab40eeeff1f8cab2a3a09b7ed85c016005b442a98913b586a35bb06d`
  - `material-actions-pagination-headless.png` — `27fc065f57cf90eeb394d74e1935881ddc707a4107798871922910db0252b1ee`
  - `material-actions-artifacts-headless.png` — `f61467ba6b2446b06faeac30d5e07ee185fac3bcc7cf568d87f2ec86698842a7`
  - `material-actions-sentinel-headless.png` — `f45139a70d76eae99626aaf8e07355a48b5fe26464b7a35f8ab4ad4e494f0cbd`

## Completion gate

- Focused provenance store/UI tests, TypeScript, scoped lint/format, production bundle, diff/secret scan, and exact low-level headless smoke pass.
- Promoted screenshots are synthetic, nonblank, privacy-safe, and referenced by README, wiki, and Pages content.
- Commit intentionally on `main`, push `origin/main`, verify local/tracking/direct-remote SHA and CI/Pages state, then report the cleanup receipt.
