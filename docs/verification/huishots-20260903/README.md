# HuiShot refresh — 2026-09-03

Canonical gallery capture run against a freshly built tree, on a hidden Windows
desktop through the cheap headless route. Every image below came from the real
built renderer at the commit named here; none is a mockup, a design file, or a
re-used older capture.

## Run

| Fact | Value |
| --- | --- |
| Source commit | `d2999c62ff68fe6bb172069d321f5b38f5598569` |
| Harness | `.codex/verification/capture_gallery_cdp.js --canonical true --resilient true` |
| Theme / language | light / english |
| Fixture | disposable P0 fixture, fake GitHub provider |
| Desktop | hidden `DMHuiShots2B`, CDP port 9456 |
| Exit code | 0 |

## Result

| Count | Meaning |
| --- | --- |
| 68 | canonical scenes attempted |
| 52 | scenes that produced a capture |
| 16 | scenes skipped, each with a recorded reason |
| 51 | captures replacing an existing gallery image |
| 1 | new gallery image (`material-cheap-lfs-preparing.png`) |
| 48 | gallery files whose bytes actually changed (3 scenes are pixel-deterministic) |

The docs gallery holds 131 images in total. This canonical run covers 52 of
them; the remaining 79 come from scene sets outside the canonical batch (other
themes, language modes and the audit-design set) and are **not** refreshed by
this run. They keep their previous capture dates.

## Scenes skipped, and why

These are honest gaps, not silent omissions. Each one failed a real
precondition in the fixture rather than producing a wrong image:

| Scene | Reason |
| --- | --- |
| anchored-appearance | Timed out waiting for the repository toolbar appearance editor |
| api-explorer | No enabled Run control was available |
| api-app-functions | Timed out waiting for the seeded API functions surface |
| actions-run-details | Timed out waiting for visible Actions inspector split panes |
| actions-sentinel | Timed out waiting for the exact Actions inspector sentinel |
| actions-job-log | Timed out waiting for visible Actions inspector split panes |
| actions-pending-deployments | Timed out waiting for visible Actions inspector split panes |
| tab-style | Anchored editor exposed a private path; refused rather than captured |
| logo-studio | Anchored editor exposed a private path; refused rather than captured |
| repository-submodule-management | Anchored editor exposed a private path; refused rather than captured |
| submodule-context | Timed out waiting for the temporary submodule repository context |
| pull-request-compose | Timed out waiting for a non-empty comparison |
| pull-request-open | Timed out waiting for a non-empty comparison |
| multi-window-menu | Timed out waiting for an enabled Open in new window command |
| merge-all | Unable to click `.worktree-button` |
| advanced-workflows | Failed the scene's own semantic/geometry/privacy checks |

Three of those refusals are the privacy check doing its job: the anchored
appearance editor rendered a path from this machine, and the harness declined
to photograph it rather than shipping a capture with a private path in it.
