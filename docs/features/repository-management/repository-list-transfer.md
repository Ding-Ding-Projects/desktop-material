# Repository list transfer and Cheap LFS

Repository list transfer moves a reviewed set of cloned repositories between
Desktop Material profiles or machines. It is deliberately a clone recipe, not
a credential or storage-state backup.

## Behavior and configuration

- **Export** resolves each selected repository's GitHub clone URL, or its
  `origin`/first Git remote when no GitHub metadata is available.
- Export sanitizes HTTP(S) user information and writes only a versioned list of
  clone URLs plus an export timestamp. Local checkout paths, access tokens,
  account identities, default branches, and Cheap LFS file selections are not
  portable data in this format.
- **Import** lets the user review and check the URLs, choose a destination
  directory, and run the existing bounded parallel or sequential batch-clone
  queue.
- After each successful batch clone, the same finalization path used by normal
  cloning calls the automatic Cheap LFS materializer. It is enabled by default
  by the repository setting **Download large files after cloning**.
- With no portable file selection, restoration considers the detected pointer
  set. Release-backed pointers require an eligible selected account; public OCI
  pointers may restore anonymously. The imported list does not silently choose
  a different account on behalf of the user.

## Failure modes and recovery

- An invalid, unsupported, or structurally corrupt list is rejected before any
  clone starts.
- URLs already present in the local repository list are shown as already
  cloned and are not checked by default.
- A clone failure is isolated to its batch row. Other rows can complete, and
  the queue's existing pause, cancel, retry, and crash-recovery behavior still
  applies.
- If automatic Cheap LFS restoration is disabled, no eligible provider account
  is available, or a provider object cannot be verified, the clone remains
  usable with its pointer files intact. The user can enable the repository
  setting or restore the files later from the repository's Cheap LFS surface.
- An explicit manifest-bound Cheap LFS selection is intentionally not exported:
  it can become stale when the default branch, manifest, pointer set, or
  account changes on another machine. The clone UI can create a fresh selection
  at the destination when that precision is needed.

## Security considerations

The transfer file is safe to share only as a list of repository locations, not
as an authentication artifact. URL credentials are stripped on both export and
parse. The format never serializes account tokens, local paths, release
credentials, registry credentials, or Cheap LFS selection proofs. Account
affinity remains in local repository state, and automatic restoration uses the
same selected-account and provider checks as every other Cheap LFS operation.

## Verification

- `repo-list-file-test.ts` proves URL normalization, credential stripping,
  duplicate removal, and malformed-file rejection.
- `repository-list-transfer-cheap-lfs-test.ts` pins the URL-only contract,
  verifies that imported clones enter the batch finalization materialization
  path, and verifies the enabled-by-default preference.
- The Windows production build and the hidden-desktop acceptance flow should
  exercise the import dialog's large-file note and the batch finalization
  progress surface when a disposable pointer fixture is available.

## Suggested articles

- [Release-backed large-file storage](release-backed-cheap-lfs.md) — configure
  the storage provider, account, and restoration workflow.
- [Cheap LFS versus Git LFS comparison](cheap-lfs-vs-git-lfs.md) — compare the
  large-file model with standard Git LFS.
- [Clone queue settings](clone-queue-settings.md) — configure the bounded
  batch-clone destination and concurrency mode.
