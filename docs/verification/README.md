# Verification records

This folder keeps reproducible local acceptance records that support, but do
not replace, exact-commit CI, Pages, wiki, and Release receipts in
[`HANDOFF.md`](../../HANDOFF.md).

Screenshots of the real built app come from the capture fixture described in
[App capture fixture](../technical/app-capture-fixture.md) — including multi-tab
scenes such as the tab overflow dropdown, which cannot be produced by hand.

- [Account-aware repository transfer — 2026-08-05](repository-transfer-2026-08-05/run-manifest.md)

## Current-source updater acceptance

The current development x64 application at source
`b069384ad7d8a65d1192ee06859a705fe484c9c8` passed the packaged updater-ready
verifier. The accepted
[`auto-updater-current-source-ready.png`](../assets/screenshots/auto-updater-current-source-ready.png)
was published by `e3967f1b81ec039624500797dca40a1ab6d98598`: 960×660,
47,086 bytes, SHA-256
`0fc9caf5b13eb5b914121090f403c394545e02ea4303b11dd4598afcb3a2dfca`.
Its 12,299-byte receipt has SHA-256
`50fe3ed0bcb5287786933a6ae1523021bd1417b1462a3fe5bb48d644d7527f3c`.

The verifier drove real Electron/Squirrel events over loopback using a disclosed
inert, no-executable `9000.0.1` full nupkg. It proved frontmost About, no
onboarding checklist, the exact ready state, unchanged protected
install/external state, and complete owned-resource cleanup. Original-resolution
inspection rejected an earlier formally successful candidate because Welcome
covered the app; the repaired gate now requires the first-run checklist to be
absent and `elementFromPoint` to resolve the frontmost About surface. File Exit
was requested before the graceful direct-quit fallback, and **Quit and Install**
was neither focused nor clicked.

香港粵語：今次係真 build、真 Electron/Squirrel event 同完整清理證明；舊嗰張
俾 Welcome 遮住嘅候選圖已經打回頭，修正後先正式收貨同發佈。

## Immutable provenance for dated gallery receipts

The links in this table address the exact Git blob through the commit that
published it. Their byte counts and SHA-256 values belong to those immutable
blobs—not to the same mutable pathname on `main`, which a later current-build
capture may legitimately replace.

<!-- markdownlint-disable MD013 -->

| Historical frame (immutable raw blob) | Source commit | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| [Tab groups](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/58be6fe5953477b015a134c414a8cf82363ecc75/docs/assets/screenshots/material-tab-groups.png) | `58be6fe5953477b015a134c414a8cf82363ecc75` | 94,467 | `fd857137f71b79fbef65225e4469f2d2e3d95ecb6701e4847b84da11ad2875b8` |
| [Command palette appearance](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/58be6fe5953477b015a134c414a8cf82363ecc75/docs/assets/screenshots/material-command-palette-appearance.png) | `58be6fe5953477b015a134c414a8cf82363ecc75` | 99,234 | `ac4db2aa3696d2e1987c0c93573ccf48f86c61111e42fcabf0cec54db3b87a7d` |
| [Cheap LFS UI acceptance](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/342a1548009a3e1591c27f7a4af82cf6cf02c96e/docs/assets/screenshots/cheap-lfs-ui-acceptance.png) | `342a1548009a3e1591c27f7a4af82cf6cf02c96e` | 79,404 | `8f53ed803dc7415ca86e4399040201afbbd627718a48e4a453e637099fa03684` |
| [Cheap LFS cloud compression](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/f7b4760a13894f0320f7b361f055f6fba40d913f/docs/assets/screenshots/cheap-lfs-cloud-compression.png) | `f7b4760a13894f0320f7b361f055f6fba40d913f` | 105,577 | `9449e50f60cd298e9cc261e9044fc0cd93706a8e9f243dcceb88d63b6df9ab8d` |
| [Cheap LFS commit progress](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/c3db37ea5524b91f9603151ae5d1107205f16a59/docs/assets/screenshots/cheap-lfs-commit-progress.png) | `c3db37ea5524b91f9603151ae5d1107205f16a59` | 113,869 | `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333` |
| [Compact Repository Releases](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/513c5cc96aee045a218837530a11951e8466b618/docs/assets/screenshots/material-github-releases-compact.png) | `513c5cc96aee045a218837530a11951e8466b618` | 89,856 | `8e29ac666a0832d353126d8dd759200ba7e853016a940501e5c7cbdbb1cf992a` |
| [Legacy updater migration](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/923dbb51acad8f01f01f1c100c6945c7a2e08e23/docs/assets/screenshots/auto-updater-update-ready.png) | `923dbb51acad8f01f01f1c100c6945c7a2e08e23` | 49,195 | `a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d` |
| [Safe regex builder](https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/f8eca3ac844e8eaec2dc2dce635f57874b4e92bc/docs/assets/screenshots/regex-builder.png) | `f8eca3ac844e8eaec2dc2dce635f57874b4e92bc` | 92,564 | `befbfa90491120195884f7424aab551b81cb3174068077e466a8020c335a28b1` |

<!-- markdownlint-enable MD013 -->

- [Standalone Cheap LFS versus Git LFS comparison atlas — 2026-07-28](cheap-lfs-vs-git-lfs-pages-2026-07-28/README.md)
- [Publish organization picker sizing acceptance — 2026-07-30](publish-organization-picker-2026-07-30/README.md)
- [Close-all-open-issues publish run — 2026-07-28](close-all-open-issues-2026-07-28/run-manifest.md)
- [Renderer responsiveness — 2026-07-28](renderer-responsiveness-2026-07-28/README.md)
- [Cheap LFS Pages product-guide revamp — 2026-07-28](cheap-lfs-pages-revamp-2026-07-28/README.md)
- [Linux-first TUI publish run — 2026-07-27](linux-tui-2026-07-27/run-manifest.md)
- [Linux TUI path browser and Git wrapper — 2026-07-27](linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md)
- [Pull-and-bug-hunt publish run — 2026-07-26](bug-hunt-2026-07-26/run-manifest.md)
- [Tab groups and command palette — 2026-07-22](tab-groups-command-palette-2026-07-22.md)
- [Automatic updater version ordering — 2026-07-22](auto-updater-version-order-2026-07-22.md)
- [Cheap LFS commit progress and push batching — 2026-07-23](cheap-lfs-commit-progress-2026-07-23.md)
- [Cheap LFS Bambu build cloud, clone, and batching acceptance — 2026-07-23](cheap-lfs-bambu-build-2026-07-23.md)
- [Cheap LFS cloud compression — 2026-07-22](cheap-lfs-cloud-compression-2026-07-22.md)
- [Cheap LFS public/private GitHub and UI acceptance — 2026-07-22](cheap-lfs-github-public-private-2026-07-22.md)
- [UI design audit — 2026-07-20](ui-design-audit-2026-07-20/run-manifest.md)
- [Responsive surface matrix — 2026-07-17](responsive-surface-matrix-2026-07-17.md)
