# Repository management features

This category documents workflows that change which Git worktree Desktop
Material is displaying or how a repository is represented in the application.

## Features

- [Selective stashes](selective-stashes.md) — save only an exact reviewed set
  of whole changed files with repository-bound path validation.
- [Guided sparse checkout](sparse-checkout.md) — select, review every bounded
  normalized directory root, and apply cone-mode worktree changes through a
  retained result phase.
- [Named multi-stash manager](named-stash-manager.md) — create, inspect, apply,
  pop, rename, branch from, and clear exact object-identified stashes.
- [Advanced history
  discovery](advanced-history-discovery.md) — search rich commit metadata and
  page commits across local branches, remote-tracking branches, and tags while
  keeping cross-ref history read-only.
- [Reviewed bulk branch
  deletion](reviewed-bulk-branch-deletion.md) — select exact local branch tips,
  protect current/default/remote refs, and retain per-branch recovery IDs.
- [Network and WSL repository
  paths](network-and-wsl-repository-paths.md) — retain UNC roots, detect mapped
  drives and WSL shares, and provide offline reconnection guidance.
- [Reviewed ordinary Git pull previews](pull-previews.md) — fetch before
  review, require a clean worktree, and integrate only the exact reviewed
  upstream object ID without a second network fetch.
- [Reviewed batch repository sync](reviewed-batch-sync.md) — pull active
  branches or fetch only across an exact reviewed subset with bounded
  concurrency and isolated results.
- [External stash
  interoperability](external-stash-interoperability.md) — inspect and safely
  apply, restore, branch from, or explicitly discard stashes made by other Git
  clients without rewriting their metadata.
- [Repository picker filters and
  visibility](repository-picker-filters-and-visibility.md) — combine status,
  account, service, and text filters, and locally hide repositories with an
  explicit recovery path.
- [Tag lifecycle management](tag-lifecycle-management.md) — inventory, create,
  move, sign, push, fetch, prune, and explicitly delete local and remote tags
  through stale-safe reviewed operations.
- [Temporary submodule repository
  navigation](submodule-repository-navigation.md) — open an initialized child
  or changed/new submodule commit in a temporary read-only viewer without
  importing it, then Close or return to the persisted root repository.
- [Release-backed large-file
  storage](release-backed-cheap-lfs.md) — replace large tracked bytes with a
  verified GitHub Release pointer, recover a stalled or length-rejected native
  upload automatically through a bounded trusted GitHub CLI transport, retain a
  verified whole-batch browser handoff, automatically cloud-compress public
  repository objects one at a time (private repositories require explicit
  opt-in), publish new storage as prereleases, migrate exact legacy drafts in
  place, restore explicitly public GitHub.com assets while signed out, fail
  safely at bounded capacity limits, and restore and verify raw or mixed
  objects locally while decompressing only `part-deflate` objects. Automatic
  preparation exposes up to three bounded worker lanes with queue, provider,
  phase, byte, elapsed-time, throughput, and ETA context plus a
  keyboard-accessible storage-recommendation disclosure.
- [Cheap LFS OCI registry
  backend](cheap-lfs-oci-registry-backend.md) — store the repository object set
  as one logical GHCR or Docker Hub image, reuse unchanged layers across
  additions and removals within explicit object/layer/metadata bounds, split new
  data into 1.5 GiB layers, halve timed-out layers, retention-tag historical
  manifests, retain existing collaborator/organization targets, migrate
  providers only from verified materialized raws, encrypt verified-private
  payloads with the exact shared tracked key, and restore only immutable digest-
  pinned objects through the verified, licensed ORAS runtime.
- [Automatic commit and push
  batching](automatic-commit-push-batching.md) — keep ordinary selections below
  a decimal 1.5 GB push with a 1.4 GB changed-blob budget and bounded proof
  overhead, require each fast-forward push to be proven before creating the
  next commit, and safely recover oversized local-only history created by older
  app versions without force-pushing. Each app-owned commit disables auto-GC
  only for that process and accepts a reported late maintenance failure only
  after proving the exact HEAD transition. Immutable automatic batches use
  process-local no-delta/no-compression packing to avoid CPU-bound HTTP
  timeouts without changing ordinary pushes or persistent Git configuration.
  A live 8,305-file public Bambu build checkpoint proved four UI-created,
  exact-SHA-pushed batches after preserving and retrying an HTTP 408 pending
  commit; cloud and fresh-clone acceptance remain separately gated.
- [Parent-folder repository
  discovery](parent-folder-repository-discovery.md) — preview and register a
  bounded, link-safe set of working trees below one selected folder.
- [Submodule, subtree, and remote creation
  workflows](submodule-subtree-and-remote-creation.md) — manage dependency
  topology and create an initialized account-bound remote before adding it as a
  submodule.
- [Clone dialog repository
  metadata](clone-dialog-repository-metadata.md) — render each cloneable
  repository as a rich card with description, language, stars, forks, size,
  default branch, last updated, and a visibility pill, plus data-derived
  language filter chips.
- [Clone queue settings](clone-queue-settings.md) — configure each signed-in
  account's background-clone directory, parallel/sequential mode, and enabled
  state from Settings while retaining the existing bounded recovery journal.
- [Patch-series import and export](patch-series.md) — preview, validate, export,
  and apply portable patch sequences without silently changing unrelated work.

## API applicability

These features use the renderer, dispatcher, repository store, and bounded Git
helpers. They add no HTTP endpoint, so a Postman collection is not applicable.
