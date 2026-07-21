# Repository Releases dashboard

## Behavior and configuration

Open **Releases** from a GitHub repository rail to search and status-filter the
bounded loaded catalog, select a release, inspect metadata and assets, or enter
the existing reviewed create, edit, publish, delete, upload, and download
flows. The desktop catalog reserves 420–560 px for readable names, tags,
statuses, dates, selection controls, and bulk actions. It stacks below the
details pane at 900 px and remains scrollable on narrow or zoomed layouts.

The surface uses the selected repository's provider account and supports fuzzy,
substring, and regular-expression matching plus published, prerelease, and
draft status filters. **Load more releases** requests the next bounded provider
page before filtering it locally.

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

`github-releases-style-test.ts` covers the 420–560 px catalog, larger control
and row targets, 900 px stacking threshold, Material tokens, containment, focus,
and narrow fallback. Provider behavior and guarded lifecycle tests remain in
the GitHub Releases unit suites. Fresh off-screen screenshot acceptance is
tracked separately from this local style handoff.
