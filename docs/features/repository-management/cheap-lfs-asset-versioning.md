# Cheap LFS asset versioning and commit provenance

A pinned large file is not frozen. Users edit the video, re-export the model,
re-record the sample, and commit again. This page describes exactly what Cheap
LFS does with the *previous* bytes when that happens, why every historical
commit keeps restoring its own version, and how an asset on the GitHub Releases
page is traced back to the commit that introduced it.

It complements [Release-backed large-file
storage](release-backed-cheap-lfs.md), which covers pinning, bucket rollover,
materialize, and the manual browser fallback. The OCI route is described in
[Cheap LFS OCI registry backend](cheap-lfs-oci-registry-backend.md) and keeps
its provenance in the image manifest instead.

## The rule: uploaded assets are write-once

Cheap LFS never overwrites, replaces, or deletes a release asset because a
tracked file changed. Editing a pinned file produces different bytes, a
different SHA-256, and therefore a *new* asset beside the old one. The old
asset stays exactly as it was, which is what makes an old checkout still work.

Committing a modified pinned file goes through these steps:

1. The working-tree file is no longer pointer text, so the commit-time scan
   selects it for pinning again
   (`selectCheapLfsAutoPinTargets`, `app/src/lib/cheap-lfs/operations.ts`).
2. It is hashed once into a whole-file SHA-256 plus per-part digests.
3. A release bucket with room is allocated — `assets`, then `assets-2`, and so
   on at GitHub's 1,000-asset ceiling per release.
4. **Reuse check.** If the bucket already holds a completed asset whose byte
   count *and* `sha256:` digest match, that asset is reused and nothing is
   uploaded (see [Deduplication](#deduplication)).
5. Otherwise a name is chosen that no asset in the bucket is using. The first
   pin of `video.mp4` gets `video.mp4`; a later pin of *different* bytes finds
   that name taken and becomes `video-<first 7 hex of the new digest>.mp4`,
   advancing to `-2`, `-3`, … in the vanishingly unlikely event of a short-hash
   collision. A split file reserves a whole fresh `<base>.partNNN` family the
   same way.
6. The bytes upload under that fresh name, digest-verified end to end.
7. Only then is the new pointer written over the tracked path and committed.

The name of an existing asset is therefore never reused for different content,
and no step in this flow issues a delete for an asset an earlier commit points
at. The only deletions Cheap LFS performs are of assets a *failed attempt*
itself created moments earlier, and that cleanup is explicitly restricted to
ids absent from the pre-attempt inventory.

## Restoring an old commit

Materialize resolves a pointer through the exact `release-tag` and
`asset-name` it recorded, then verifies the downloaded bytes against the
pointer's `sha256` and `size` before replacing anything. Nothing resolves "the
latest asset for this path" — there is no such lookup — so checking out a
commit from before an edit restores that commit's bytes, and a mismatch leaves
the pointer in place rather than writing wrong content.

Concretely, after `video.mp4` is pinned, edited, and pinned again the release
holds two assets and Git history holds two pointers:

| Commit | Pointer `asset-name` | Pointer `sha256` | Bytes restored |
| --- | --- | --- | --- |
| first | `video.mp4` | digest of take 1 | take 1 |
| second | `video-9f3c2a1.mp4` | digest of take 2 | take 2 |

## Deduplication

Immutability makes reuse safe, so re-pinning bytes the bucket already holds
does not upload a second copy. Reuse requires *proof*, never a name or a size
alone: the provider must report a completed (`uploaded`) asset whose size
matches and whose digest is exactly `sha256:<content digest>`. GitHub does not
publish a digest for every historical asset; an asset with no digest is treated
as unknown content and re-uploaded rather than trusted. When several assets
qualify, the lowest id wins so the choice is stable across provider page
ordering.

A split file reuses all-or-nothing. Every part must already be present, or the
whole family uploads fresh — a partly borrowed family would blur the
attempt-ownership boundary the failure-cleanup path depends on. Two parts that
happen to hold identical bytes correctly resolve to the same asset.

This composes with the streaming-hash work tracked in issue #35: both rest on
the same content digest, and neither needs the file read twice.

## Commit traceability

### Primary record: the pointer in Git history

The committed pointer file *is* the provenance record, and it is the one that
survives without a network, without provider metadata, and without trusting
anything outside the repository:

```
git log -p -- assets/video.mp4
```

Every revision shows the `release-tag`, `asset-name`, `size`, and `sha256` that
revision resolves through, attributed to a real commit with a real author and
date. That mapping is content-addressed and tamper-evident: changing which
bytes a commit resolves to means changing the commit.

### Secondary record: the release asset label

So the mapping is also readable on the GitHub Releases page without a checkout,
each asset carries a machine-parseable label
(`app/src/lib/cheap-lfs/asset-version.ts`):

```
cheap-lfs/v1 sha256=<64 hex> commit=<git object id> path=<tracked path>
```

A pin necessarily runs *before* the commit it is preparing, so the introducing
commit id does not exist at upload time. The label is written with `commit=-`
during the upload and completed immediately after the commit succeeds by
`annotateCheapLfsPinnedAssets`, which rewrites only the label — never the name,
never the bytes. `PATCH /repos/{owner}/{repo}/releases/assets/{id}` is issued
with a `label` body only, so an asset name can never be changed by this path.

The path is written last so a path containing spaces needs no quoting, and an
over-long path keeps its tail behind a `...` marker to stay inside GitHub's
255-**byte** label ceiling; the untruncated path is always in the pointer. The
ceiling is measured in UTF-8 bytes rather than in JavaScript string length, so a
CJK or emoji path cannot spend three or four bytes per character past a
character-shaped budget — see the naming contract in
[release-backed-cheap-lfs.md](release-backed-cheap-lfs.md) for why the byte
reading is the fail-closed one. Elision cuts only on code-point boundaries, so a
surrogate pair is never halved.

## Failure modes

| Situation | Behavior |
| --- | --- |
| Provider rejects or drops the upload label | Exactly one unlabeled retry follows, so the file is still stored. Every post-upload validation failure inside the transfer layer removes the asset it rejected before throwing, so the retry cannot race a leftover object under the same name. |
| Upload fails after the label retry | The original pin failure is reported per file; the tracked file is left as its original bytes and no pointer is written. |
| Post-commit annotation fails, is canceled, or the endpoint cannot relabel | Counted as `skipped`. Nothing is thrown, the commit is unaffected, and provenance remains fully recoverable from Git history. |
| Release inventory changed after it was reviewed | The batch fails closed and asks for a retry rather than uploading into an unreviewed bucket. |
| Bucket reaches 1,000 assets | A new `assets-N` bucket is allocated. Old buckets are never compacted or pruned, so old pointers keep resolving. |
| Existing asset has no provider digest | Not reused. The bytes upload again under a fresh name rather than risk a pointer resolving to unverified content. |
| Source file changes between hashing and pointer write | The pointer is not written and the upload is rolled back; the working tree keeps the user's newer bytes. |

Asset labels are metadata by design. Nothing in the restore path reads a label:
materialize uses only the pointer, so a missing, stale, or hand-edited label can
never cause the wrong bytes to be restored.

## User-facing copy

The **Large files** manager marks an edited pinned file with
`cheapLfs.localState.modified`, which states plainly that the next commit
uploads the new bytes as a new release asset and that the asset the committed
pointer names is left untouched. It is localized in English and Hong Kong
Cantonese and rendered in bilingual mode like every other string.

## Verification

Automated coverage lives in
`app/test/unit/cheap-lfs/asset-version-test.ts` (15 tests) and runs against a
release-bucket double that recomputes each asset digest from the bytes actually
sent, refuses a duplicate asset name, and throws if a delete is ever attempted:

- a modified pinned file uploads a *new* asset, the earlier asset keeps its
  original bytes, and both pointers materialize to their own version;
- identical bytes pinned at a second path reuse the existing asset and upload
  nothing, and the deduped pointer still restores correctly;
- reuse is refused for a size mismatch, a digest mismatch, a missing digest,
  and an incomplete upload; the lowest asset id wins;
- a split file reuses only when every part is present;
- the upload label round-trips through the real
  `normalizeGitHubReleaseAssetLabel`, stays inside 255 UTF-8 bytes for ASCII,
  CJK, and emoji paths alike, and elides only the head of an over-long path;
- a foreign or malformed label never parses as Cheap LFS provenance;
- the introducing commit is written to every asset of a pin, once per distinct
  asset;
- a provider that rejects labels still stores the file, and a failing or absent
  relabel path reports `skipped` without throwing or disturbing the bytes.

`app/test/unit/i18n-test.ts` asserts the modified-state copy in English,
Cantonese, and bilingual mode.

Run them from the repository root:

```
node script/test.mjs app/test/unit/cheap-lfs/asset-version-test.ts
node script/test.mjs app/test/unit/cheap-lfs/operations-test.ts
node script/test.mjs app/test/unit/i18n-test.ts
```
