# Bambu build Cheap LFS live acceptance manifest

- Run ID: `2026-07-23-bambu-build-cheap-lfs-live`
- Mode: `publish`
- Checkpoint status: UI preparation and all four payload commits are pushed;
  the final caller/action, fresh UI clone/materialization, and live Bambu
  screenshot remain pending and are not claimed by this manifest revision.
- Initial installed-app/base source:
  `41718cdaf54b22fa4ada07cfc2cf37e89ab18a07`. The process-local fast-pack
  behavior used by the successful exact-SHA retry is captured by
  `21c4de4a73` and integrated at `08c9b16b99` for this publication.
- Desktop Material CI: corrected run `30016619190` passed Windows x64,
  Windows arm64, packaged E2E, and lint; CodeQL run `30016619176` passed.
- Source repository: clean primary checkout
  `Ding-Ding-Projects/BambuStudio` at
  `0c08db803478647e79895dac20a9db12d5719b94`.
- Destination repository: public `codingmachineedge/bambu-build`, cloned from
  `main` at `b3ea6e1f6f36b5c76d40a1268e9ae62cda457b97`.
- Payload: every real file below `BambuStudio/build`, plus the verified
  materialized contents of its single `src/Release/resources` junction. The
  destination inventory is exactly 8,305 payload files and 14,809,588,162
  bytes. The initial 50-byte destination `README.md` is preserved.
- Large-file set: exactly ten files above 100 MiB, totaling 9,428,683,391
  bytes. SHA-256 equality between source and copied destination was proved for
  all ten before any pointer replacement.
- Ordinary set: 8,295 paths after the large files become small pointers.
  The app created exactly four ordered commits below the decimal 1.5 GB
  ceiling: 723 paths / 1,381,068,318 new blob bytes (`639d566b`), 7,181 paths /
  1,381,044,686 bytes (`8efaa6f9`), 189 paths / 1,395,199,423 bytes
  (`93d72d61`), and 212 paths / 1,220,761,246 bytes (`f58fd4c0`). The path
  counts total the exact 8,305-file payload.
- Storage: published GitHub prerelease under the unused reviewed tag
  `bambu-build-20260723-1105-41718cda`. Pin the ten files sequentially through
  the Large files UI. Do not reuse, publish, rename, or delete any of the three
  pre-existing ambiguous `assets` drafts.
- Cloud compression: public automatic policy remains enabled, but exclude
  `.github/workflows/cheap-lfs-cloud-compression.yml` from the four payload
  batches. Commit and push that caller only after every batch has exact remote
  proof, preventing an Actions pointer update from racing the app's branch
  compare-and-swap checks. Compression processes one Release object at a time;
  failed or non-beneficial objects must retain raw cloneable fallback.
- Account: require the repository's selected Desktop Material account to be
  `codingmachineedge`. Use the existing production secure credential without
  exposing or copying its token. The CLI account alone is not acceptance.
- UI route: fixed Lowlevel MCP endpoint, one named off-screen Win32 desktop,
  runtime-resolved HWND, saved launch PID, and no visible-desktop action.
  Configure Release storage, automatic pinning, three-lane preference,
  clone/open materialization, and automatic public compression in Repository
  settings. Record the ten-candidate filter before pinning, pin each exact file
  through the native picker and reviewed form, exclude the caller, then commit
  with bilingual English/Hong Kong Cantonese notes.
- Batched-push proof: observe durable intent and pending refs, local HEAD, and
  live `origin/main`. Each batch must progress commit -> exact-SHA push ->
  remote equality -> pending-ref clear before the next local commit. No
  force-push is allowed.
- Batched-push result: the first default-packed retry failed with HTTP 408
  after 675.591 seconds and retained its exact pending SHA. The same immutable
  UI retry used process-local `pack.window=0` and `pack.compression=0` fast-pack
  options and succeeded in 190.946 seconds. The following automatic batch
  pushes succeeded in 214.815, 193.912, and 140.883 seconds. After each exact
  remote proof the app cleared both durable refs before creating the next
  commit. Local HEAD and `origin/main` finished equal at
  `f58fd4c026ba813fd01b2fe774835553d16a9044`; persistent repository and global
  Git configuration remained unchanged.
- Post-batch workflow commit (pending at this checkpoint):
  `Enable cloud compression / 開啟雲端壓縮`, with a bilingual body explaining
  sequential compression and raw fallback.
- Restore proof (pending at this checkpoint): after Actions settles, clone
  `bambu-build` through the real UI to a new owned directory. Require all ten
  pointer paths to materialize locally and match the pre-pin SHA-256 values; a
  failed compression object passes only when its retained raw object restores
  exactly.
- Screenshot target (pending; no Bambu image is promoted yet):
  `docs/assets/screenshots/cheap-lfs-bambu-build-live.png`, 1440 x 960, dark
  theme, containing only repository/build metadata safe for the public repo.
- Related first-publication source UI gate: the final production bundle built
  in 400.46 seconds. The compiled Cheap LFS progress captures were 1,440 x 960,
  SHA-256
  `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333`,
  and 640 x 960, SHA-256
  `1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50`.
  The requested-200% compact Releases capture was 960 x 660, SHA-256
  `56991b51946a32740995168bd9f97f091b1d183f6df696a205556df6759bcb37`.
- Documentation allowlist: this manifest, a dated receipt below
  `docs/verification`, the verification index, README/HANDOFF/ROADMAP, the
  repository-management feature docs, wiki gallery/user guide, Pages source,
  and the promoted screenshot.
- Final cleanup: close only the owned app/HWND/PID, close the named desktop,
  prove the CDP port free, remove only validated owned Temp paths, and leave
  every unrelated BambuStudio worktree/change untouched.
