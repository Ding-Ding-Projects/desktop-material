# Cheap LFS commit-progress run manifest

- Run ID: `2026-07-22-cheap-lfs-commit-progress`
- Mode: `publish`
- Milestone: bounded three-file Cheap LFS commit uploads, a persisted Build &
  Run toggle that can restore sequential operation, safe partial-failure commit
  continuation, deterministic sub-1.5 GB automatic Git commit/push batches for
  large selections of ordinary files, a Changes filter for large-file
  candidates, detailed transfer progress, and a compact live terminal-style
  activity panel directly below the commit button. The continuation also adds
  one-logical-image GHCR or Docker Hub storage for the repository's complete
  Cheap LFS object set, digest-pinned add/remove snapshots, adaptive timeout
  rechunking, same-target layer reuse, materialized-only provider migration,
  and mandatory authenticated encryption for verified-private repositories
  using the intentionally shared repository-tracked key requested by the user.
- Expected UI state: while automatic Cheap LFS preparation is active, the
  Changes sidebar keeps the commit action visible, reports the current file,
  phase, byte counts, percentage, batch position, and up to three active files,
  and exposes a bounded, accessible mini-terminal below the commit button. A
  default-on Build & Run switch permits up to three files to transfer at once;
  disabling it preserves the prior one-at-a-time behavior. The terminal shows
  useful chronological activity without credentials, raw provider payloads,
  or unbounded output. English, playful Hong Kong-style Cantonese, and
  bilingual modes remain readable at normal and narrow widths. When one or
  more files fail, raw large binaries are excluded from the current commit;
  ordinary selected changes and successful pointers may still commit, while
  failures remain visible in Changes for a later retry. An all-failed batch
  must not create an accidental empty commit. The Changes filter can isolate
  files strictly above the canonical Cheap LFS threshold without changing the
  default plain Changes view or treating unknown-size entries as safe matches.
  When ordinary selected working-tree files approach 1.5 GB in aggregate,
  normal commits are partitioned stably using a 1.4 GB changed-blob budget plus
  bounded Git/path overhead; the
  first safe batch is committed and pushed before the next batch may commit. A
  push failure stops the sequence. Deleted files contribute zero bytes, partial
  selections use the whole current-file size as a conservative bound, and an
  unreadable/unknown size must not be silently classified into a safe batch.
  Cheap LFS pointer/upload work remains a separate path. Unsafe contexts such as
  amend or an in-progress multi-commit operation must not be silently expanded
  into an automatic batch sequence. For older-app history, only clean, linear,
  local-only commits ahead of the upstream may be rebuilt: preserve a backup
  ref, prove no remote-reachable commit is rewritten, revalidate the branch and
  worktree before each mutation, split and push the rebuilt batches in order,
  and remove the backup only after exact remote proof. Merge topology,
  concurrent dirty edits, or a changed ref fail closed with recovery guidance;
  force-push is never used. Safe older tips keep their original commit objects;
  rebuilding an individually oversized tip preserves its reviewed message and
  final tree but creates new IDs, loses commit signatures, and does not promise
  original author timestamps. Every direct Git commit disables auto-GC with a
  command-scoped `-c gc.auto=0`; if Git nevertheless reports a late failure,
  the app accepts it only after proving a valid before/after HEAD transition
  and surfaces a maintenance warning instead of creating a duplicate commit.
  OCI registry mode publishes one repository image at a time, reuses unchanged layers,
  omits removed objects from the new image, and rejects a current snapshot above
  4,096 objects, 8,192 layers, or 8 MiB canonical config/manifest JSON. It
  retains digest-addressable old images for old commits through deterministic
  digest-specific retention tags and never restores from a mutable tag. A later
  upload updates the same logical
  package/tag by publishing a new immutable manifest; it never appends to an old
  digest or layer. Same-provider updates retain an existing organization/
  collaborator target. Cross-provider migration requires every old pointer to
  be an exact materialized raw and republishes locally verified bytes without
  pulling from or deleting the old provider. Private
  image objects are encrypted and authenticated before upload. New pointers
  bind the exact key id, and the required tracked key is force-staged and proven
  in the commit even if ignored or deselected. The key is allowed only after
  private visibility is verified; this protects a leaked registry image but
  deliberately does not protect against collaborators or anyone who can read
  the private repository history. Explicitly public GitHub.com Release pointers
  may also restore while signed out through anonymous read-only requests.
  Windows builds must verify and ship the official ORAS 1.3.2 AMD64 executable
  and its Apache-2.0 license; ARM64 deliberately uses that exact binary through
  Windows 11 x64 emulation and fails closed if it cannot start. Document the
  current GitHub-authentication contradiction without overstating acceptance:
  the OAuth scope reference grants package upload/download to `write:packages`,
  the Container registry page says PAT classic only, the selected OAuth token
  passed only a non-mutating challenge, and a real package mutation remains
  unverified.
- Ordered background interactions: preflight the fixed Lowlevel MCP endpoint;
  verify the scheduled server command and checkout; run the exact unpackaged
  production build; create one owned disposable Git fixture and isolated user
  data root; create one uniquely named off-screen Win32 desktop; launch the
  built Electron app against only the fixture; resolve the HWND dynamically;
  exercise a deterministic Cheap LFS commit-progress state through approved
  HWND-targeted input or an app-native fixture hook if Chromium rejects
  background input; capture after each meaningful state; gracefully close the
  exact HWND/PID; close the desktop; remove only owned temporary paths.
- Disposable fixture root:
  `<system temporary folder>\desktop-material-cheap-lfs-progress-20260723-062314-8f2c6a\fixture`
- Screenshot target: `docs/assets/screenshots/cheap-lfs-commit-progress.png`,
  native `1440 x 960`, Material dark theme, plus a narrow-width inspection for
  clipping and bilingual density.
- Documentation allowlist: this manifest, `README.md`, `ROADMAP.md`,
  `HANDOFF.md`, `docs/features/repository-management/README.md`,
  `docs/features/repository-management/release-backed-cheap-lfs.md`,
  `docs/features/repository-management/automatic-commit-push-batching.md`,
  `docs/features/repository-management/cheap-lfs-oci-registry-backend.md`,
  `docs/wiki/**`, `docs/assets/screenshots/cheap-lfs-commit-progress.png`, and
  the Pages gallery source that already catalogs Desktop Material screenshots.
- Declared verification: focused commit-message, Cheap LFS concurrency,
  preference persistence/UI, cancellation, partial-failure selection, all-fail
  no-empty-commit, retry-continuation, decimal 1.5 GB ceiling and 1.4 GB source boundary,
  conservative partial/deleted/unknown sizing, commit-then-push ordering,
  push-failure stop, legacy local-history backup/rebuild/rollback gates, and
  large-file filter unit tests; post-commit maintenance recovery and
  command-scoped auto-GC tests; GHCR canonical image/pointer, add/remove,
  digest proof, hostile-manifest, encryption, key-gating, cleanup, and bounded
  parallel transfer tests; pinned ORAS archive/executable/license staging and
  Windows architecture tests; localization tests; typecheck/lint and
  `git diff --check`; exact
  production build through Lowlevel MCP; original-resolution off-screen
  screenshot review; full diff and secret scan; pushed-remote SHA/ancestry, CI,
  Pages, installer release, README image, and wiki image checks.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `main`
- Starting commit: `fbe0550cd3b5ba2ab06e1fb8eb433aef11d159ea`
- Integration base before this feature is published: `04246fdf12c09446b88d2f40130581d603131c8e`
  (retains updater commits `241cc90ce9` and `04246fdf12`; final publication is
  intentionally held until the updater thread completes installer acceptance).
- Current local/remote integration tip before this feature commit:
  `923dbb51acad8f01f01f1c100c6945c7a2e08e23` (`Document live automatic
  updater recovery`). It retains both required updater commits. The updater
  thread reported installed-app acceptance complete and explicitly opened the
  final Cheap LFS integration/push window on July 23, 2026.
- Initial branch relation: local `main` equals `origin/main`.
- Initial worktree baseline: three unrelated modified files owned by the
  concurrent release task: `.github/workflows/build-installers.yml`,
  `.github/workflows/super-express-release.yml`, and
  `app/test/unit/super-express-release-workflow-test.ts`. They must be
  preserved and excluded from this feature commit unless their owner has
  already committed them to `main` before publication.
- Initial topology: one linked worktree, only local/remote `main`, no stashes.
- Active GitHub account: `DingDingChae`.

## Local acceptance receipt — July 23, 2026

- The exact current worktree production build ran through the fixed Lowlevel MCP
  endpoint with
  `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`.
  It returned `0` after 1,466.27 seconds.
- Release/OCI operations passed **80/80**, registry transport/runtime policy
  passed **77/77**, disposable-Git batching passed **117/117**, and commit
  UI/settings/localization passed **157/157**. Pinned ORAS scripts passed
  **8/8**, the headless verifier contract passed **17/17**, and the compact
  commit-shell style contract passed **7/7**.
- The full Cheap LFS folder aggregate completed **261/262** checks. One
  wall-clock policy case exceeded its 2.5-second harness budget while heavy Git
  work ran concurrently; the isolated policy rerun passed **8/8**, including
  that same behavior. The aggregate wrapper is therefore not described as
  fully green.
- The accepted wide English frame was promoted to
  `docs/assets/screenshots/cheap-lfs-commit-progress.png`: 1440×960, 107,411
  bytes, SHA-256
  `6d70fce553edcf54cef9bb806bc1d6f38bf8154a7ff2c859e236aba77afdb238`.
  The receipt passed **36/36** acceptance checks: all **35/35** named surface
  assertions plus the required deterministic selection receipt. It proved the
  cleared selection before one real pointer sequence, the selected MP4, the
  settled over-limit diff message without a spinner, all three filter chips,
  the wrapped warning, recommendation, three distinct worker lanes, complete
  progress/actions, and a fully excluded undo surface.
- The 640×960 bilingual attempt did **not** produce a capture or receipt. It
  failed closed while waiting for the selected large-file diff to settle. A
  read-only follow-up proved the requested bilingual 640×960 renderer state,
  but `document.visibilityState` remained `hidden` after `Page.bringToFront`;
  selection IDs were empty, the MP4 was not selected, and no diff or spinner
  was present. Narrow acceptance is therefore not claimed.
- The tracked wide frame was hash-verified before cleanup. The generic close
  action could not address the off-screen HWND, so a helper launched only on
  the owned hidden desktop posted `WM_CLOSE` to the exact revalidated HWND.
  Lowlevel MCP then proved the saved Electron process tree exited, zero owned
  windows remained, the named desktop closed, and the CDP port was free. The
  direct Temp child was containment- and reparse-checked before its complete
  removal. No process was terminated by name or PID.
- Detailed evidence is in
  `docs/verification/cheap-lfs-commit-progress-2026-07-23.md`. This local receipt
  makes no claim about the still-pending source commit/push, exact-source CI and
  CodeQL, Pages, synchronized wiki, or installer Release.
