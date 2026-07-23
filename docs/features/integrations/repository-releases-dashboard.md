# Repository Releases dashboard

## Behavior and configuration

Open **Releases** from a GitHub repository rail to search and status-filter the
bounded loaded catalog, select a release, inspect metadata and assets, or enter
the existing reviewed create, edit, publish, delete, upload, and download
flows. The desktop catalog reserves 420–560 px for readable names, tags,
statuses, dates, selection controls, and bulk actions. It stacks below the
details pane at 900 px and remains scrollable on narrow or zoomed layouts.
Short or high-zoom panes compact the filter controls, selection summary, bulk
actions, status metrics, and rows so the release list keeps a usable minimum
height instead of disappearing below stacked controls. Metrics reflow within
the pane rather than creating a horizontal strip.

![Repository Releases retaining a complete first row at 200% scale](../../assets/screenshots/material-github-releases-compact.png)

The surface uses the selected repository's provider account and supports fuzzy,
substring, and regular-expression matching plus published, prerelease, and
draft status filters. **Load more releases** requests the next bounded provider
page before filtering it locally.

Release dates include a locale-aware 24-hour `HH:mm` time. After an asset has
downloaded and passed its existing size/digest checks, the result offers both
**Show in folder** and **Open file**. Open-file completion and failure callbacks
are generation-fenced, so a late Windows response cannot update a disposed or
newly selected release. Clearing a filtered selection moves keyboard focus to
an enabled Select all or search fallback even when the filter has zero results.

## Failure modes

Initial loading, asset loading, empty repository, empty filter result, invalid
regular expression, and provider failure remain distinct states. A retry keeps
already loaded data and repeats only the failed scope. Destructive or
publishing controls stay disabled until their exact reviewed selection is
valid.

## Security considerations

Repository, account, and provider host remain bound through every request.
Remote URLs are validated before opening, response and pagination sizes stay
bounded, and asset transfers retain their existing path, size, digest, and
overwrite checks. This feature adds no application HTTP endpoint, so a new
Postman artifact is not applicable.

## Verification

`github-releases-style-test.ts` covers the catalog, compact control and metric
reflow, low-height list space, Material tokens, containment, focus, and narrow
fallback. Provider behavior, 24-hour timestamps, guarded Open file lifecycle,
and zero-result focus recovery remain in the GitHub Releases unit suites. The
final production bundle completed in 400.46 seconds. An off-screen Win32
acceptance at requested 200% scale captured a 960 x 660 physical-pixel viewport
with the first release row fully visible, no horizontal overflow, and the
compact-tools disclosure reachable by keyboard. The promoted PNG has SHA-256
`56991b51946a32740995168bd9f97f091b1d183f6df696a205556df6759bcb37`.
