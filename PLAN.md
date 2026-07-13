# Desktop Material — Completed Feature Plan

## Final status

The feature-expansion roadmap and its handoff work are complete. Milestones
**M0 through M18 are shipped on `main`** through final implementation baseline
`c944eeea05227ef1ddb1c7c71e1062f44f672eb3`. There is no remaining queued,
partial, or in-flight implementation work in this plan.

That baseline includes the responsive-shell correction prompted by the final
1450×997 review, its exact-size headless regression capture, the public
README/Pages/wiki propagation, the shared Node/jsdom UI-test storage fix, and
secure GitHub Actions log downloads with stale-response protection.
Installer release creation is pinned to the triggering `github.sha`, preventing
an overlapping documentation push from moving a generated tag to newer `main`.
The closing publication evidence is recorded below and in [`HANDOFF.md`](HANDOFF.md).

## Shipped milestone ledger

| Milestone | Status | Delivered capability | Important implementation paths |
| --- | --- | --- | --- |
| **M0 — Publishing bootstrap** | **COMPLETE** | CI on `main`, Windows installer/release automation, Material README and Pages site, canonical wiki sources, and tracked screenshots. | `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `.github/workflows/build-installers.yml`, `site/`, `docs/wiki/`, `docs/assets/screenshots/` |
| **M1 — Per-account profiles** | **COMPLETE** | Token-safe settings profiles stored in one local Git repository per account, serialized writes, recovery, and account switching. | `app/src/models/profile.ts`, `app/src/lib/profiles/`, `app/src/lib/stores/profile-store.ts` |
| **M2 — Repository tabs** | **COMPLETE** | Browser-style repository tabs, profile persistence, rename/reorder/close operations, close-by-range or regex, and Word-style per-tab typography/color controls. | `app/src/models/repository-tab.ts`, `app/src/lib/stores/repository-tabs-store.ts`, `app/src/ui/repository-tabs/` |
| **M3 — Settings history** | **COMPLETE** | Git-backed settings history with lazy diffs, logical undo/redo, restore-to-point, audit commits, and reusable history UI. | `app/src/ui/version-history/`, `app/src/ui/settings-history/`, `app/src/lib/profiles/profile-git.ts` |
| **M4 — Non-modal dialogs** | **COMPLETE** | Draggable, stackable in-app dialogs and side sheets that leave the main app interactive, with modal behavior retained only where required. | `app/src/ui/dialog/`, `app/src/lib/popup-manager.ts`, `app/src/ui/app.tsx`, `app/styles/ui/_dialog.scss` |
| **M5 — Notification centre** | **COMPLETE** | Bell and right-side notification panel, unread controls, Git-backed notification log, and reusable notification history. | `app/src/models/notification-centre.ts`, `app/src/lib/stores/notification-centre-store.ts`, `app/src/ui/notifications/` |
| **M6 — Search and regex builder** | **COMPLETE** | Shared fuzzy, substring, and regex modes; case sensitivity; list filters; full block-based regex builder; and History search. | `app/src/lib/fuzzy-find.ts`, `app/src/ui/lib/filter-mode-control.tsx`, `app/src/ui/lib/regex-builder/`, `app/src/ui/history/` |
| **M7 — Multi-clone and transfer** | **COMPLETE** | Parallel/sequential multi-clone, batch progress, URL-only repository export, and import-to-auto-clone. | `app/src/models/batch-clone.ts`, `app/src/lib/stores/batch-clone-store.ts`, `app/src/ui/clone-repository/batch-clone-progress.tsx`, `app/src/lib/repo-list-file.ts`, `app/src/ui/repository-list-transfer/` |
| **M8 — Scaling and organizations** | **COMPLETE** | 50–200% user scaling, auto-fit, shortcuts, full GitHub organization repository browsing, and organization-aware clone selection. | `app/src/lib/zoom.ts`, `app/src/ui/preferences/appearance.tsx`, `app/src/ui/clone-repository/org-filter-chips.tsx`, `app/src/lib/stores/api-repositories-store.ts` |
| **M9 — Automation** | **COMPLETE** | One-click commit/push, global and per-repository schedules, safe auto-pull, merge-all for branches/worktrees, Copilot conflict handling, notifications, and summaries. | `app/src/lib/automation/`, `app/src/lib/stores/helpers/automation-scheduler.ts`, `app/src/ui/preferences/automation.tsx`, `app/src/ui/repository-settings/automation-overrides.tsx`, `app/src/ui/merge-all/` |
| **M10 — Actions panel** | **COMPLETE** | Workflow run filters, rerun actions, workflow dispatch inputs, job/step detail, and searchable in-app logs. | `app/src/lib/stores/actions-store.ts`, `app/src/lib/actions-workflow-inputs.ts`, `app/src/lib/actions-log-parser/`, `app/src/ui/actions/` |
| **M11 — Agent access** | **COMPLETE** | Localhost-only token-gated MCP and REST server, one shared redacted command contract, renderer execution bridge, stdio proxy, CLI, and Preferences controls. | `app/src/lib/agent-commands.ts`, `app/src/main-process/agent-server/`, `app/src/lib/agent-command-executor.ts`, `app/src/ui/preferences/agent-access.tsx`, `script/agent/`, `docs/agent-api.md` |
| **M12 — Desktop Plus quick wins** | **COMPLETE** | Telemetry disabled, Material destructive actions/icons, date and merge-commit styling, branch status/sort controls, hide-recent, permanent discard, Git identity, accessibility tooltips, and related parity controls. | `app/src/ui/changes/`, `app/src/ui/branches/`, `app/src/ui/repositories-list/`, `app/src/ui/preferences/`, `app/styles/ui/` |
| **M13 — Repository metadata and Pull all** | **COMPLETE** | Pinning, custom groups, branch pills, repository-specific defaults/editor override, bounded Pull all, multi-remote management, and full submodule management. | `app/src/lib/databases/repositories-database.ts`, `app/src/ui/repository-settings/repository-metadata.tsx`, `app/src/ui/repository-settings/remote.tsx`, `app/src/ui/repository-settings/submodules.tsx`, `app/src/ui/pull-all/`, `app/src/lib/automation/pull-all.ts` |
| **M14 — History power tools** | **COMPLETE** | Metadata-aware title/message/tag/hash search, shared fuzzy/regex timeline search, Material commit graph, guarded pushed-history deletion, sanitized SVG code/preview modes, and branch-name preset scripts/shortcuts. | `app/src/ui/history/`, `app/src/ui/diff/image-diffs/`, `app/src/ui/create-branch/`, `app/src/lib/git/` |
| **M15 — Stashes and Desktop Material CLI** | **COMPLETE** | Multiple stashes per branch, stash selection/context actions, and the rebranded Desktop Material command-line entry point. | `app/src/models/stash-entry.ts`, `app/src/lib/git/stash.ts`, `app/src/ui/stashing/`, `app/src/lib/desktop-material-cli.ts`, `app/src/cli/` |
| **M16 — Multi-window** | **COMPLETE** | Tab-aware window creation/routing, scoped selected repositories and tabs, safe shared-profile serialization, and multi-window menu/context actions. | `app/src/main-process/window-routing.ts`, `app/src/main-process/app-window.ts`, `app/src/main-process/main.ts`, `app/src/lib/window-scope.ts`, `app/test/unit/window-routing-test.ts` |
| **M17 — GitLab, Bitbucket, and self-hosted GitLab** | **COMPLETE** | Provider API foundation, GitLab PAT and Bitbucket sign-in, self-hosted endpoint support, provider clone browsing, cross-host PR/status routing, credential isolation, and provider documentation. | `app/src/lib/api.ts`, `app/src/lib/stores/accounts-store.ts`, `app/src/ui/preferences/accounts.tsx`, `app/src/ui/clone-repository/`, `docs/integrations/gitlab.md`, `docs/integrations/bitbucket.md` |
| **M18 — Final Material alignment** | **COMPLETE** | Full MD3 shell, tokens, motion, navigation rail, floating workspace cards, dialogs/sheets, de-stocked controls, final post-shell polish, accessibility coverage, and clipping/layout fixes across milestone surfaces. | `app/styles/_material.scss`, `app/styles/_material-shell.scss`, `app/styles/ui/`, `app/src/ui/app.tsx`, `app/test/unit/post-shell-style-test.ts`, `app/test/unit/ui/` |

## Additional completed product work

- The per-repository `.gitignore` manager, template catalogue, suggestions, and
  reversible marker-section merge live in `app/src/lib/gitignore/` and
  `app/src/ui/repository-settings/`.
- Build & Run detects Node, Rust, Go, .NET, Python, Java, Make, and CMake
  projects; handles multiple .NET projects; can install missing toolchains;
  streams logs; minimizes; and stores per-repository settings under
  `app/src/lib/build-run/`, `app/src/main-process/`, and
  `app/src/ui/build-run/`.
- Fork update checks and release feeds point to the Desktop Material repository,
  not the upstream GitHub Desktop updater.
- The `design/` prototype sources are published as a sanitized five-file set;
  sample identities and private-looking endpoints were replaced, while raster
  files with identifiers baked into pixels or metadata were intentionally
  excluded.
- GitHub Actions job logs use Electron-managed redirects so Chromium receives
  the signed-host body without an opaque status-0 response. The installed
  request filter strips authentication, authorization, and cookie headers on
  cross-origin hops; safe errors omit signed URLs, and late failures cannot
  overwrite a newer or closed job viewer.
- Account selection, profile mutation serialization, export rendering,
  provider routing, submodule display, repository tooltips, and other integration
  regressions found during the merge waves were fixed before the final build.

## Architecture contracts that remain authoritative

1. Account identity is `getAccountKey(account) = endpoint#id`; provider ports do
   not fall back to login-only identity.
2. Profile settings, tabs, flushes, history actions, and multi-window mutations
   use the same serialized profile queue.
3. `VersionedStoreHistory` remains the shared settings/notification history UI.
4. Batch clone consumes sanitized URL-only items; exports never contain tokens.
5. Filter modes and regex parsing use the shared bounded search infrastructure.
6. Automation posts results to the notification centre and never lets a
   background failure block the foreground UI.
7. Agent access stays localhost-only, opt-in, token-gated, origin-checked,
   size-bounded, and redacted.
8. Desktop Plus behavior is adapted under its MIT license, but visuals continue
   to use Desktop Material's `--md-sys-*` token system.
9. No token may be written to a profile repository, notification repository,
   export file, screenshot, log, or agent response.

## Final integrated validation evidence

The exhaustive final run on the same application/test tree shipped by
`c944eeea0522` recorded:

- validation scope: **243 files and 619 suites**;
- unit suite: **1,863 tests — 1,862 passed, 0 failed, 1 intentional skip**;
- repository-wide `yarn lint`: **passed**;
- `yarn tsc --noEmit --skipLibCheck`: **passed**;
- focused version-history coverage: **4 of 4 passed**;
- production unpackaged build: **passed** for the identical application source,
  using
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`;
- the build and GUI verification path used the exact low-level MCP checkout at
  SHA `beed66ca6ed2503e6170ee1e1158247f1c2f0140`;
- all promoted final milestone captures were inspected at original resolution,
  were nonblank, and contained no private data. The standard ledger is
  **1443×992**; the final responsive proof is the user's exact **1450×997**
  client size.

| Final capture | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `material-agent-access.png` | 1443×992 | 110,128 | `644891eaa37c878cb577065822681ee8fd33a018a92e0b89822b43e67393ef93` |
| `material-automation.png` | 1443×992 | 87,304 | `efe45408a390301294d5e23193b619eec858fcef4abb147d82709513c5bb3843` |
| `material-branch-merge-all.png` | 1443×992 | 116,134 | `c5cb41e17d67c627758ef43620c255c8272f85ed182a741c086a80d735c8719e` |
| `material-history-power-tools.png` | 1443×992 | 122,930 | `fe8b6323d77663467b2a6ae887d5e277e31b8dc84f0e35cec2332537ec7fd28a` |
| `material-multi-window-menu.png` | 1443×992 | 115,719 | `9a6cbcbb4c257eac3312b76f8ed0077a6a123901a6bee9b7793b926a61310c66` |
| `material-notification-center.png` | 1443×992 | 111,723 | `f8d0cf33723b1c9793d165ab39fd0cec2ccd41b50136d36f6be9c3d34b7d4709` |
| `material-provider-accounts.png` | 1443×992 | 117,558 | `91ab46ec566676f0c87534f5e72795e31a62adeecf6bf2597e533920ff428cff` |
| `material-scale-200-autofit.png` | 1443×992 | 104,599 | `6fc094a466cef3a540d3bef08db7468e6d9312c9d2242c5abf0df6f9b4fafe05` |
| `material-workspace-changes.png` | 1443×992 | 123,162 | `3155b321f9aabb73ee6a40000c69f8931f1915920216818a362ec974cc3a4621` |
| `material-responsive-overflow-fixed.png` | 1450×997 | 132,049 | `160c622c6630d96eda26b5ff3be6705c31dbe55d6ffa6d1376575425770278bf` |
| `material-actions-job-log.png` | 2048×1228 | 155,579 | `6f8a96a9bff8a9c76f89b44aaf3c84a71574aed11ef994db93d12d2749ca0409` |

## Root-finalized publication evidence

The publication gate is closed:

1. Final implementation baseline `c944eeea05227ef1ddb1c7c71e1062f44f672eb3`
   passed all seven jobs in
   [CI 29223257147](https://github.com/codingmachineedge/desktop-material/actions/runs/29223257147).
2. [Build Installers 29223257140](https://github.com/codingmachineedge/desktop-material/actions/runs/29223257140)
   succeeded for that exact commit and published public, non-draft,
   non-prerelease release
   [`v3.6.3-beta3-b0000000075`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-b0000000075).
   Its lightweight tag resolves exactly to the build SHA; all five uploaded
   assets are non-empty, and the workflow retained zero artifacts.
3. Screenshot/site baseline `8a2df4d28166f3c303f8e8e241ee71c23f9b4b05`
   passed
   [Pages run 29222707562](https://github.com/codingmachineedge/desktop-material/actions/runs/29222707562).
   The public site and all 16 referenced images return HTTP 200 and match the
   tracked byte counts and SHA-256 hashes.
4. The canonical six-file `docs/wiki/` mirror is published at wiki commit
   `6df402780eea3b32987d40e46094fb10e8ce769e`; the live Home and User Guide
   return HTTP 200 and render the raw-main responsive proof.
5. The final headless audit verified the exact 1450×997 review size, the
   supported minimum behavior, and requested 200% scaling auto-fit. Toolbar,
   Changes search/filter/composer controls, rows, actions, and the page shell no
   longer clip or produce horizontal overflow. Existing accessibility tests
   cover names, roles, focus, keyboard paths, and 50–200% zoom bounds; recorded
   light/dark contrast pairs meet WCAG AA for normal text.
6. The published design set and the tracked repository pass targeted personal
   identifier and common-secret scans. Account-specific Windows paths use
   `%USERPROFILE%` in public documentation.

The final PLAN/HANDOFF closeout changes documentation only. Its exact pushed
`main` SHA and corresponding successful CI run are recorded in the final task
response because a commit cannot contain its own hash.
