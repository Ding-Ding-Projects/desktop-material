# Cheap LFS OCI registry backend

Desktop Material can represent the complete Cheap LFS object set for one Git
repository as one logical OCI image in GitHub Container Registry (GHCR) or
Docker Hub. Select **GHCR image** or **Docker Hub image** under **Repository
settings → Build & Run → Large-file storage**. The backend primitives are
provider-neutral even though their source filenames retain the original
`ghcr-*` compatibility names.

## Snapshot and pointer model

One repository package has one mutable tag,
`desktop-material-cheap-lfs-v1`. A publish builds a desired **full** object
index; add, update, and removal are consequences of that complete index rather
than separate registry mutations.

"Complete" is bounded rather than unlimited: one current snapshot accepts at
most 4,096 objects and 8,192 layers in total, each object may use at most 8,192
chunks, and the canonical config JSON and OCI manifest JSON are each capped at
8 MiB. The app rejects a snapshot that crosses one of these structural proof
bounds before publishing it. Historical immutable snapshots and their retention
tags remain versions of the same logical package, but they do not expand the
current snapshot's limits.

"One image" means one repository package and current snapshot tag, not one
ever-growing mutable layer. OCI manifests and blobs are immutable. Adding or
removing a file therefore publishes a new manifest, moves the stable tag only
after verification, and gives each changed pointer the new immutable digest.
Unchanged content-addressed blobs are reused rather than uploaded again.
Earlier manifests and blobs remain available for pointer-form files, locally
materialized files, and pointers in Git history.

The publish order is deliberately strict:

1. Validate and upload the config blob by digest.
2. Upload new object chunks by digest, reusing unchanged chunks from a
   validated previous snapshot with the same encryption key identifier.
3. Push the exact OCI image manifest by digest.
4. Fetch the immutable manifest and compare its digest and exact bytes.
5. Create the deterministic
   `desktop-material-cheap-lfs-sha256-<64hex>` retention tag and fetch it back
   to prove those same manifest bytes. Historical retention tags are never
   deleted.
6. Verify registry repository access and visibility through the injected
   provider policy verifier. The immutable retention tag lets a first private
   GHCR package expose its source metadata without moving the mutable tag.
7. Atomically move the one mutable repository tag to the verified digest.
8. Fetch the mutable tag and verify that it resolves to those same manifest
   bytes.

The immutable retention tag keeps an older digest referenced after the mutable
snapshot tag advances, rather than relying on a registry to preserve an
untagged manifest indefinitely. Old manifest digests, retention tags, and blobs
are not deleted. Every committed pointer stores
an immutable `ghcr.io/owner/package@sha256:...` or
`docker.io/owner/package@sha256:...` reference, the plaintext object digest and
size, and the ordered chunk-layer digests. It never stores the mutable tag.
The publish result returns canonical pointer text for **every** object in the
new snapshot, including after removal. The commit coordinator rewrites current
pointer-form files to that digest. A materialized raw file keeps its verified
bytes in the working tree and its still-valid older pointer in the index or
HEAD, so the repository can temporarily contain multiple immutable pointer
generations without losing restoreability.

An interrupted layer is never appended to: a registry cannot mutate a partial
or already-addressed blob safely. Desktop Material retries that object's bytes
as smaller complete layers. Successfully accepted blobs from the earlier
attempt, and every unchanged layer from the preceding image, remain reusable by
digest. A second upload after a successful publish follows the same rule: it
creates a new manifest containing the reused old layers plus only the newly
needed layers. The stable package/tag is the same logical image; its old digest
remains immutable and retention-tagged, and the verified mutable tag is moved
to the newly published digest.

## Providers and limits

New chunks start at a conservative 1.5 GiB for both providers. Transfers run
sequentially unless parallel mode is selected; parallel mode has a hard maximum
of three files, with each file's chunks uploaded in order within its lane. The
image can contain many layers, and the backend does not model a provider
total-image byte cap.

The commit progress panel calculates a recommendation without silently changing
the saved provider. Files at or below 100 MiB stay ordinary Git candidates. One
Cheap LFS transfer totaling at most 1.5 GiB recommends published Releases as
the lowest-setup route. A larger verified-private GitHub.com batch recommends
GHCR when an eligible account is configured; otherwise a detected Docker Hub
credential recommends Docker Hub, with Releases as the fallback. These
availability inputs prove local setup, not current provider quota, billing,
organization policy, or service health. Public source repositories do not
receive an automatic GHCR recommendation because a first GHCR package is
private by default.

GHCR documents a 10 GB limit per layer and a 10-minute upload timeout. Desktop
Material keeps every newly generated layer far below that limit, rejects a
hostile GHCR descriptor at or above 10 GB, and starts each ORAS process with a
cancelable timeout below ten minutes. See [GitHub's container registry
troubleshooting limits](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#troubleshooting).

No official Docker Hub layer-size or upload-time hard cap is encoded. The
capability API reports those values as `null`, rather than presenting the app's
1.5 GiB policy as a Docker limit. Docker documents that its daemon normally
uploads five layers concurrently and that reducing concurrency can avoid
timeouts; Desktop Material uses at most three. See [Docker image push
concurrency](https://docs.docker.com/reference/cli/docker/image/push/#concurrent-uploads).

Docker Hub public pulls may be anonymous. Current Docker documentation states
that unauthenticated users receive 100 pulls per six hours, authenticated
Personal users 200, and paid Pro, Team, and Business users unlimited pulls
subject to fair use. Private pulls require credentials. See [Docker Hub pull
usage and limits](https://docs.docker.com/docker-hub/usage/pulls/).

Docker Hub plan storage, transfer, private-repository, abuse, and fair-use
limits still apply. They can change independently of Desktop Material; review
the current [Docker Hub usage documentation](https://docs.docker.com/docker-hub/usage/)
before choosing it for a large archive. Desktop Material does not invent a
Docker layer-size or ten-minute limit where Docker publishes none.

GHCR uses the canonical `ghcr.io/<source-owner>/<source-name>-cheap-lfs`
package. A first Docker Hub publish uses the signed-in Docker credential-helper
username as its namespace and creates `<source-name>-cheap-lfs` when necessary.
After a successful publish, Desktop Material inventories committed/index-aware
pointers and keeps their exact same-provider package coordinate. That lets a
collaborator update `docker.io/<organization>/<package>` without silently
relocating it into the collaborator's personal namespace. Mixed logical targets
or an attempted same-provider relocation fail before publish.

Changing between GHCR and Docker Hub is explicit migration, not blob reuse
between registries. Every old pointer must already be materialized, and each
current raw file must re-hash to its committed pointer digest and size. Desktop
Material then builds and publishes one fresh full snapshot from those local
bytes without pulling from or deleting the old provider. A pointer-form or
edited file refuses migration before any publish.

Both targets must match the source repository's verified visibility. For GHCR,
an existing package must also be linked to that exact source repository. GitHub
creates a first package as private and exposes no supported package-visibility
mutation API, so a public source must first use Releases or Docker Hub, or have
its linked GHCR package made public in GitHub package settings. The app fails
this public preflight before uploading.

A first private GHCR package may be created, but the stable tag still cannot
move until GitHub's package API reports the exact source link and private
visibility. If that post-upload policy check fails, Git pointers stay untouched;
link the package to the source repository in package settings and retry. The
new manifest remains named by its deterministic retention tag, the stable tag
remains unchanged, and accepted immutable blobs can be reused by the retry.

## Adaptive timeout recovery

An object-layer process timeout throws
`CheapLfsGhcrLayerUploadTimeoutError`. It identifies the object and layer,
records the preparation chunk bound, and recommends half that bound:

`1.5 GiB -> 768 MiB -> 384 MiB -> ... -> 8 MiB`

The floor is 8 MiB and the advertised maximum is nine preparation attempts.
The coordinator retries by calling `withPreparedCheapLfsGhcrImage` with
`maximumChunkBytes` set to the recommendation and then publishing again.
Unchanged previous-snapshot objects remain content-addressed reusable layers.
The transport also checkpoints a new file only after every distinct layer
digest for that whole file returned success. Those complete files are reused
without re-encryption on the next attempt; the timed-out file is fully
rechunked and re-encrypted with fresh randomness at the smaller bound. Already
accepted config/object blobs are safe to encounter again because their digests
are immutable. A pre-tag failure returns no pointer result and never reaches
the tag operation. If the final tag request itself has an ambiguous network
outcome, retrying the same immutable digest and verifying the tag is safe; the
Git pointer commit must remain suppressed until publish returns a verified
result.

This is the timeout workaround: smaller independently uploadable layers reduce
the amount of work that must finish inside one provider request. It cannot
extend GHCR's provider-side deadline or resume bytes inside a timed-out layer.

## Private repository encryption and key lifecycle

Verified-private repositories require client-side AES-256-GCM encryption.
Every chunk uses independent random salt and nonce, HKDF-SHA256 key derivation,
and canonical length-prefixed associated data binding repository identity,
object digest and size, chunk ordinal, offset, size, and algorithm. Ciphertext,
authentication tag, stored digest, plaintext chunk digest, and whole-object
digest are all verified before restored data is exposed. Verified-public
repositories reject an encryption key.

The shared repository key is intentionally tracked in the verified-private Git
repository at:

`.desktop-material/cheap-lfs-registry-key-v1`

This threat model protects object payloads if the registry package leaks by
itself. It does not protect against a reader of the private Git repository or
its history. Key creation is allowed only during an explicit flow after private
visibility verification. A first publish returns `keyCreated` and
`keyRelativePath`; the coordinator must include that key and every returned
pointer in the same safe commit. New private pointers also carry the exact
`key-id sha256:...` used by their immutable image. At commit time the app reads
that identity offline, validates the canonical key bytes, force-stages the key
even when `.desktop-material/` is ignored or the row was deselected, and proves
the exact bytes in the resulting commit tree after hooks. If that final proof
fails, the exact new HEAD is rolled back with compare-and-swap. A failed publish
must not commit either a new pointer set or a newly created key by itself.

The legacy `.desktop-material/cheap-lfs-ghcr-key-v1` is accepted. An explicit
enable flow copies its exact key bytes into the provider-neutral path and leaves
the legacy file in place. It never silently rotates or deletes it. Image configs
store `keyId`; historical restore resolves the matching current or legacy key
and otherwise requires the key file from the pointer's Git commit, Git history,
or a backup. Rotation therefore requires retaining every key still referenced
by immutable pointer history.

The canonical and legacy key filenames are reserved, case-insensitively, and
cannot be selected as Release or registry payloads. Cleanup after a failed first
private publish captures the newly-created file identity, canonical contents,
and key ID. It atomically quarantines and removes only that exact file; a
concurrently replaced key is retained and reported instead of being unlinked.

Committing this key is an intentional sharing choice, not a general secret-
management recommendation. Anyone who can read the private source repository,
an old clone, a fork, or its Git history can decrypt the corresponding registry
objects. Do not change the source repository to public while this key or
encrypted pointer history remains sensitive. Removing the key from the latest
tree does not remove it from Git history, and deleting or rotating it without
retaining the old bytes makes historical pointers unrestorable.

## ORAS and credential boundary

Windows builds fetch the official ORAS 1.3.2 Windows AMD64 archive through an
allowlisted GitHub Release redirect chain. The build verifies the exact archive,
`oras.exe`, and license sizes and SHA-256 values before staging generated build
output. It ships the upstream Apache-2.0 text as
`static/cheap-lfs/oras/LICENSE.ORAS.txt`; see the [ORAS 1.3.2
license](https://github.com/oras-project/oras/blob/v1.3.2/LICENSE).

The same audited x64 executable is staged for Desktop Material's x64 and ARM64
packages. Windows ARM64 therefore depends on Windows 11 x64 emulation; this
release does not claim a native ARM64 ORAS payload. If emulation cannot start
that exact binary, registry storage fails closed while Release-backed Cheap LFS
remains available.

At runtime the transport accepts only an absolute `oras.exe` path whose SHA-256
matches the build-pinned digest. It rechecks a regular, non-symlink executable
before use. Every process uses `shell: false`, a hidden Windows window, bounded
discarded output, a cancelable runtime, and a temporary empty registry config
that is removed. It never enables insecure TLS or plain HTTP.

An authenticated registry token is passed only through `--password-stdin`.
It is never placed in arguments, environment variables, output, errors, or a
persistent login/config file. Public anonymous pull omits both username and
`--password-stdin`. The provider policy verifier receives no registry token.
It must independently attest the expected source-repository access mapping and
public/private registry visibility before the tag can move.

GitHub browser sign-in requests and validates `write:packages`; the
[OAuth scope reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
describes that scope as granting package upload and download. The selected
account token also passed a non-mutating GHCR authentication challenge during
development. However, GitHub's current [Container registry authentication
page](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry)
separately says GitHub Packages supports personal access tokens (classic). No
live package mutation was performed for this acceptance, so Desktop Material
does not claim that its browser OAuth token is PAT-classic compliant. A provider
rejection fails closed before Git pointers or the stable tag move. The account-
scope audit offers reauthorization when `write:packages` is absent, and Desktop
Material does not request `delete:packages`; immutable historical manifests and
blobs are retained for pointers in Git history.

A redacted GHCR command rejection asks the user to reauthorize the selected
GitHub.com account for package access and retry. If package authentication is
still unavailable, the message recommends published Release or Docker Hub
storage; stderr and provider response payloads remain undisclosed.

The transport uses ORAS's documented digest-aware [blob
push](https://oras.land/docs/commands/oras_blob_push), [manifest
push](https://oras.land/docs/commands/oras_manifest_push/), and [tag by
digest](https://oras.land/docs/commands/oras_tag/) operations.

## Restore and pointer replacement

Restore fetches the manifest only by the committed immutable digest, validates
canonical hostile registry metadata, fetches the config, confirms the pointer
against the full object index, and downloads only that object's unique ordered
chunks. Public images may use anonymous pull; private images fail closed without
credentials and the exact config `keyId`.

The original file is stored in those verified OCI chunk blobs; Git contains the
small pointer (and, for a private source, the shared key). On clone, pull,
user-requested fetch, or repository open, the default-on **Download large files
after cloning** detector scans strict Release and OCI pointers. It downloads and
verifies each object, decrypts private chunks locally, and atomically replaces
the pointer in the working tree. Public OCI objects can repair while signed out.
Private GHCR objects need the matching GitHub account and tracked key; private
Docker Hub objects need the tracked key plus a valid Docker Desktop credential.

For a repository cloned by an older app that still shows pointer text, update
Desktop Material and reopen the repository with that setting enabled, or open
**Large files** and choose **Materialize all**. A failed object stays
as a pointer while the remaining batch continues, so authentication, package
visibility, the tracked key, or network access can be repaired and retried.

`materializeCheapLfsOciPointer` does not unlink and blindly overwrite a tracked
pointer. It writes and verifies plaintext in a private sibling recovery
directory, revalidates the canonical repository root, parent chain, pointer
identity, and pointer contents, then quarantines that exact pointer. Publication
uses an exclusive hard link so a concurrently created destination is never
overwritten. Original and staged names are removed only after the published
identity, size, and digest are proved. A digest, size, GCM, key, pointer,
parent-path, hard-link, race, or destination error restores the exact original
when safe; otherwise both identities remain in a surfaced recovery directory.

## Commit and clone integration

The app-store coordinator:

- verifies repository identity and visibility before choosing public/plaintext or
  private/encrypted preparation;
- treats `desiredObjects` as the complete current set;
- retries only typed layer timeouts with the recommended chunk bound;
- rewrites each current pointer-form OCI path returned by a successful full-
  snapshot publish, preserves materialized raw files and their valid historical
  metadata, stages the new/migrated key when required, and returns only paths
  actually changed for the commit flow;
- leaves a failed raw input selected for retry while successful pointers and
  unrelated safe changes may commit;
- republishes a survivor-only snapshot before removing a managed OCI path, then
  rewrites the survivors to the new digest; and
- detects strict Cheap LFS pointers when a clone or repository opens and safely
  starts materialization where visibility and authentication policy permit.

Release and OCI operations share the same tracked-path boundary. It rejects
absolute, drive/UNC, traversal, Git-metadata, Windows device, ADS/colon, illegal
character, trailing-dot/space, redirected-parent, and case-colliding paths.
Upload preparation hashes through a no-follow source handle into a private
operation-owned copy, then revalidates the source and destination after staging
and immediately before the network publish or pointer mutation.

The managed cloud-compression workflow applies only to Release storage. OCI
storage uses its own client-side chunking and, for private sources, encryption;
it does not depend on the Release compression Action.

## Verification

Focused tests cover canonical GHCR and Docker Hub pointers, malformed input,
public and private multi-chunk restore, AES-GCM wrong-key failure, full-index
add/remove/reuse, tracked-key creation and legacy migration, historical `keyId`
selection, private pointer/key-ID binding, ignored and deselected key staging,
final commit-tree proof and rollback, concurrent key-replacement cleanup, exact
ORAS stdin authentication, maximum-three concurrency, adaptive timeout metadata
with no tag move, provider capability reporting, targeted anonymous pull,
public-first-GHCR refusal, exact source/visibility policy, Docker repository
creation, collaborator/organization target reuse, materialized-only provider
migration, add/remove pointer rewrites, staging cleanup, and atomic pointer
replacement. App-store and dispatcher tests cover manual and automatic provider
routing plus signed-out public clone repair.

The shared tracked-path-store tests additionally cover hostile Windows path
spellings, canonical parent identity, symlink/junction/hard-link races, private
verified source copies, source/destination revalidation, no-overwrite
compare-and-exchange, batch rollback, and retained recovery artifacts.

The build-preparation suite additionally proves the allowlisted ORAS 1.3.2
download boundary, exact archive/executable/license verification, Apache license
staging, x64 payload placement for both Windows package architectures, abort and
redirect handling, and cleanup of partial output.

Run them with:

```powershell
node script/test.mjs app/test/unit/cheap-lfs/ghcr-key-test.ts `
  app/test/unit/cheap-lfs/ghcr-image-test.ts `
  app/test/unit/cheap-lfs/ghcr-pointer-test.ts `
  app/test/unit/cheap-lfs/ghcr-oras-transport-test.ts `
  app/test/unit/cheap-lfs/oci-operations-test.ts `
  app/test/unit/cheap-lfs/oci-registry-runtime-test.ts `
  app/test/unit/cheap-lfs/oci-registry-policy-api-test.ts `
  app/test/unit/cheap-lfs/oci-app-runtime-test.ts `
  app/test/unit/cheap-lfs/app-store-oci-routing-test.ts `
  app/test/unit/cheap-lfs/dispatcher-oci-routing-test.ts
```
