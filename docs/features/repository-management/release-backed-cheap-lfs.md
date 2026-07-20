# Release-backed large-file storage

The **Large files & storage** panel can pin a working-tree file to one or more
GitHub Release assets and leave a small, human-readable pointer at its tracked
path. It is intentionally not Git LFS: a client without Desktop Material sees
the pointer text, and collaborators need access to the referenced release to
materialize the original bytes.

## Behavior and configuration

A manual pin reviews the source file, repository-relative pointer path,
release tag, optional release name, and byte size. The default tag is `assets`;
if it has no release, the app creates an unpublished draft. A file at or below
the release-asset cap uploads as one raw asset. A larger file is split into
ordered raw parts smaller than 2 GiB, and the pointer records every part's name,
size, and SHA-256 as well as the whole-file size and digest. Current uploads do
not add a compression pass; legacy deflated pointers remain readable.

Repository Build & Run settings provide two preferences, both enabled by
default for compatibility:

- **Pin large files before committing** replaces selected files strictly over
  100 MiB before every routed commit entry point when a Releases-capable
  account is selected.
- **Download large files after cloning** materializes detected pointers after
  clone, pull, user fetch, or open under one cancelable per-repository batch.
  The panel also offers explicit per-file and Materialize all actions.

Automatic pinning reports separate preparing and uploading phases, pins files
sequentially, reloads status, and stages the pointer rather than the original
binary. The first pin failure aborts the commit.

## Persistence

The committed pointer contains a format version, release tag, base asset name,
whole-file byte size and SHA-256, plus ordered part records when required. The
binary bytes remain in GitHub Release assets; publishing a draft release is a
separate user decision. Per-repository auto-pin and auto-materialize choices
are stored with the repository's Build & Run preferences.

Materialization downloads to sibling temporary files. A single asset is
renamed over the pointer only after its size and digest match. Multipart files
verify every part, assemble them in order while calculating the whole digest,
and replace the pointer atomically only after the final verification succeeds.

## Failure modes and recovery

An unavailable Releases account, missing release or asset, stale release
review, upload/download error, changed source file, digest or size mismatch,
oversized pointer projection, or cancellation leaves the original source or
tracked pointer in place. Failed multipart pins attempt to delete only assets
uploaded by that attempt and report any cleanup failure without touching
pre-existing assets.

One automatic materialization failure is recorded per pointer and does not
stop the remaining batch; cancellation stops the batch and the summary reports
what stayed as pointers. In an automatic pin batch, an earlier file may already
have become a valid pointer when a later pin fails, but the commit is aborted
and repository status is refreshed so no half-pinned selection is committed.

## Security considerations

Tracked paths must remain repository-relative and cannot traverse parents or
Git metadata. Pointer text is strictly parsed, capped at 512 KiB, and validates
canonical sizes, lowercase SHA-256 values, ordered part totals, and release
asset bounds. Asset uploads use exact account-bound release mutation reviews,
refreshing the release snapshot before each later part.

Draft release assets are available only to users authorized for the repository;
publish the release before relying on unauthenticated collaborator access. The
feature never puts provider credentials in a pointer. Temporary downloads are
cleaned on success and failure, and unverified bytes never replace a tracked
file.

## Verification

`cheap-lfs/pointer-test.ts` covers canonical single/multipart pointers, legacy
deflated compatibility, size limits, part totals, path normalization, and the
below-2-GiB upload plan. `cheap-lfs/operations-test.ts` covers raw uploads,
deduplicated asset names, mutation reviews, attempt-owned cleanup, source race
checks, cancellation, per-part and whole-file verification, and atomic
materialization. `cheap-lfs/automation-test.ts`,
`cheap-lfs/commit-entry-points-test.ts`, and
`cheap-lfs/commit-status-refresh-test.ts` cover the 100-MiB commit gate, every
routed commit entry point, preparing/uploading progress, preference/account
gating, failure aborts, and status reload before commit. `cheap-lfs-test.tsx`
and `build-run-cheap-lfs-settings-test.tsx` cover the reviewed panel actions,
inventory, cancellation, progress, and persisted preferences.
