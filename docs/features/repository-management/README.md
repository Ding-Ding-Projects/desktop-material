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
- [Stash export and recovery dialog](stash-export.md) — search and select any
  number of stashes, copy them to a directory or ZIP, configure 7z compression
  and encryption options, and review exact recovery identities in a separate
  tabbed dialog.
- [Advanced history
  discovery](advanced-history-discovery.md) — search rich commit metadata and
  page commits across local branches, remote-tracking branches, and tags while
  keeping cross-ref history read-only.
- [History commit hover
  time](history-commit-hover-time.md) — show the exact authored date and an
  auto-updating relative age together in the commit row's hover/focus card.
- [Reviewed bulk branch
  deletion](reviewed-bulk-branch-deletion.md) — select exact local branch tips,
  protect current/default/remote refs, and retain per-branch recovery IDs.
- [Network and WSL repository
  paths](network-and-wsl-repository-paths.md) — retain UNC roots, detect mapped
  drives and WSL shares, and provide offline reconnection guidance.
- [Reviewed ordinary Git pull previews](pull-previews.md) — fetch before
  review, require a clean worktree, and integrate only the exact reviewed
  upstream object ID without a second network fetch.
- [Deleted upstream pull
  recovery](deleted-upstream-pull-recovery.md) — offer to switch to the default
  branch and retry only after the remote itself confirms the tracked branch is
  gone, refusing a dirty worktree and never pre-ticking the branch deletion.
- [Automatic remote URL
  refresh](automatic-remote-url-refresh.md) — follow a GitHub repository rename
  or transfer before network work while preserving transport, web origin,
  unrelated remotes, and deliberately divergent push targets; scheduled Git
  fails without opening credential, hook, signing, or SSH prompts.
- [Reviewed batch repository sync](reviewed-batch-sync.md) — pull active
  branches or fetch only across an exact reviewed subset with bounded
  concurrency and isolated results.
- [Verified merge-and-cleanup repository
  sync](sync-merge-cleanup.md) — merge reviewed work into exact local and
  default `main`, use the configured Codex/OpenCode provider only for
  conflicted files, push without force, prove remote `main`, and delete only
  unchanged owned branches and worktrees behind expected-object safeguards.
- [External stash
  interoperability](external-stash-interoperability.md) — inspect and safely
  apply, restore, branch from, or explicitly discard stashes made by other Git
  clients without rewriting their metadata.
- [Repository picker filters and
  visibility](repository-picker-filters-and-visibility.md) — fold status,
  account, service, text, and regex controls into one state-preserving
  disclosure, and locally hide repositories with an explicit recovery path.
- [Publish organization
  picker](publish-organization-picker.md) — choose a personal or organization
  owner from an anchored searchable listbox with fuzzy, substring, safe-RE2,
  and the full Regex Builder while stale account requests fail closed.
- [Repository transfer](repository-transfer.md) — choose another signed-in
  GitHub account or organization, publish either every local ref with its
  history or one clean root snapshot, verify the destination, and retarget
  `origin` while preserving a recoverable source remote.
- [Repository list sync summary](repository-list-sync-summary.md) — a
  low-emphasis line under each repository name giving the exact commits waiting
  to push and to pull, an honest unknown state for anything never checked, and
  no network call to paint it.
- [Private-repository lock
  badge](private-repository-lock-badge.md) — show a separate localized,
  keyboard-focusable lock only for explicit private provider metadata while
  retaining the repository's fork glyph, custom logo, or ordinary icon.
- [Repository list bulk actions](repository-list-bulk-actions.md) — select the
  filter-visible rows to fetch, pull, favorite, group, or forget several
  repositories, with determinate progress, cancel between repositories, and a
  removal confirmation that never deletes on-disk content.
- [Repository list collapsible
  groups](repository-list-group-collapse.md) — fold a group heading away with a
  keyboard-reachable disclosure control that keeps saying how many repositories
  it holds, persisted as an undoable, diffable profile setting, and guaranteed
  never to hide a filter match.
- [Custom repository group
  management](repository-group-management.md) — create, rename, re-populate, and
  dissolve a custom group from the list itself, with a searchable member picker
  wired to the regex builder and a removal that clears the label only and never
  removes a repository.
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
  upload automatically through a bounded trusted GitHub CLI transport, ignore
  ordinary ineligible Git metadata during automatic pointer discovery while
  explicit Cheap LFS paths remain fail-closed, retain a
  verified whole-batch browser handoff, automatically cloud-compress public
  repository objects one at a time from a caller committed to that repository
  (an opted-in private repository gets no caller at all and spends none of its
  own Actions minutes; compression is routed to the encrypted public builder
  behind a fail-closed leak guard, and unconfirmed visibility runs neither
  route), publish new storage as prereleases, migrate exact legacy drafts in
  place, restore explicitly public GitHub.com assets while signed out, fail
  safely at bounded capacity limits, and restore and verify raw or mixed
  objects locally while decompressing only `part-deflate` objects. Automatic
  preparation exposes up to three bounded worker lanes with queue, provider,
  phase, byte, elapsed-time, throughput, and ETA context plus a
  keyboard-accessible storage-recommendation disclosure. Release restores also
  use one shared maximum-two-download coordinator:
  the next file or part starts at the exact 90% network point, while a shared
  detailed panel reports overall/current/look-ahead lanes, file and part
  ordinals, logical and actual bytes, phase, rate, ETA, queue, failures, and
  cancellation. Combined local tests, the exact Windows production build, and
  hidden-desktop acceptance pass; packaged E2E and remote publication remain
  separate. The [bilingual Pages product
  guide](https://ding-ding-projects.github.io/desktop-material/cheap-lfs.html)
  adds a provider-first established-branch push walkthrough, the
  unpublished-branch Release-anchor caveat, and a cross-checked 30-criterion
  Cheap LFS versus Git LFS comparison.
- [Cheap LFS versus Git LFS comparison
  atlas](cheap-lfs-vs-git-lfs.md) — a standalone Pages decision surface with
  72 row-level sourced distinctions in 12 categories, honest Cheap/Git/tie/
  depends signals, provider-first versus pre-push diagrams, an exact six-stage
  publication proof, composable filters, a worker-isolated regex builder, and
  explicit Windows, host-policy, interoperability, privacy, and open-evidence
  boundaries.
- [Cheap LFS Release payload
  encryption](cheap-lfs-release-payload-encryption.md) — optionally encrypt new
  GitHub Release payloads with repository-scoped AES-256-GCM and scrypt,
  retaining the password only for the process or in the operating-system vault
  while verifying both plaintext and ciphertext receipts.
- [Cheap LFS asset versioning and commit
  provenance](cheap-lfs-asset-versioning.md) — treat every uploaded release
  asset as write-once, so editing a pinned file uploads the new bytes as a new
  asset and every historical commit keeps restoring its own version, deduplicate
  byte-identical content on proven provider digests, and record the introducing
  commit in the committed pointer plus a best-effort asset label.
- [Cheap LFS OCI registry
  backend](cheap-lfs-oci-registry-backend.md) — store the repository object set
  as one logical GHCR or Docker Hub image, reuse unchanged layers across
  additions and removals within explicit object/layer/metadata bounds, split new
  data into 1.5 GiB layers, halve timed-out layers, retention-tag historical
  manifests, retain existing collaborator/organization targets, migrate
  providers only from verified materialized raws, encrypt verified-private
  payloads with the exact shared tracked key, and restore only immutable digest-
  pinned objects through the verified, licensed ORAS runtime.
- [Commit and push all
  repositories](commit-and-push-all.md) — pull, commit and push a chosen subset
  of the repositories that have local work, picked with checkboxes and a search
  bar whose bulk actions never reach past the filter.
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
  A live 8,305-file public Bambu build acceptance proved four UI-created,
  exact-SHA-pushed batches after preserving and retrying an HTTP 408 pending
  commit, compressed 13 Release objects independently with every raw fallback
  retained, passed the exact manifest verifier, and restored all ten working
  files with matching hashes after a fresh UI clone. That first Materialize-all
  action also exposed an automatic-materialization overlap, leading to
  repository-scoped serialization. Deterministic disposable-Git and UI routing
  regressions cover the correction; the promoted live ten-pointer inventory and
  separate 10/10 clone hash receipt keep the visual and byte proofs distinct.
- [Parent-folder repository
  discovery](parent-folder-repository-discovery.md) — preview and register a
  bounded, link-safe set of working trees below one selected folder.
- [Submodule, subtree, and remote creation
  workflows](submodule-subtree-and-remote-creation.md) — manage dependency
  topology, pick the tracked branch from a searchable bounded listing of the
  remote's advertised heads, and create an initialized account-bound remote
  before adding it as a submodule.
- [Ignored files to a local
  submodule](ignored-files-to-local-submodule.md) — copy only files
  `git check-ignore` currently proves are ignored into a newly created local
  repository, prove every copy by size and SHA-256 before any index is touched,
  add that repository as a submodule at a safe non-overlapping path, and leave
  every original byte-for-byte where it was. Uploads, pointers, remotes, and
  pushes are a separate opt-in phase that this one deliberately does not do.
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
