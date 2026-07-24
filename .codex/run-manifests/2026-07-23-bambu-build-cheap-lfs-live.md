# Bambu build Cheap LFS live acceptance manifest

- Run ID: `2026-07-23-bambu-build-cheap-lfs-live`
- Mode: `publish`
- Status: the four payload batches, managed caller, one-object-at-a-time cloud
  compression, manifest publication, exact verifier release, and initial fresh
  UI-clone integrity proof are complete. A corrected serialization build still
  requires one final UI rerun and promoted screenshot because the first
  Materialize-all action overlapped automatic materialization; those two
  outstanding results are not claimed here.
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
- Ordinary set: 8,295 paths after the large files become small pointers. The
  app created exactly four ordered commits below the decimal 1.5 GB ceiling:
  723 paths / 1,381,068,318 new blob bytes (`639d566b`), 7,181 paths /
  1,381,044,686 bytes (`8efaa6f9`), 189 paths / 1,395,199,423 bytes
  (`93d72d61`), and 212 paths / 1,220,761,246 bytes (`f58fd4c0`). The path
  counts total the exact 8,305-file payload.
- Batched-push result: the first default-packed attempt failed with HTTP 408
  after 675.591 seconds and retained its exact pending SHA. The same immutable
  UI retry used process-local `pack.window=0` and `pack.compression=0` fast-pack
  options and succeeded in 190.946 seconds. The following automatic batch
  pushes succeeded in 214.815, 193.912, and 140.883 seconds. After each exact
  remote proof the app cleared both durable refs before creating the next
  commit. Local HEAD and `origin/main` finished equal at
  `f58fd4c026ba813fd01b2fe774835553d16a9044`; persistent repository and global
  Git configuration remained unchanged.
- Storage release: the ten logical files use 13 raw objects in prerelease
  `bambu-build-20260723-1105-41718cda`; three logical objects have two parts
  below the 1.5 GiB ceiling. The three unrelated pre-existing ambiguous
  `assets` drafts were not reused, renamed, published, or deleted.
- Managed caller: real-UI commit
  `fc1bedb2f98302e585a37e396fb411c34d16a594` added the reviewed bilingual
  public-repository caller only after all four payload batches had exact remote
  proof.
- Cloud compression: run `30048474438` processed each Release object
  independently; its summary reported 13 compressed, 0 kept raw, and 0 failed.
  Its 13 pointer-only commits ended at
  `ce438aa4c1f87b55a152f632bffab4a0732792b9`. The prerelease retains all 13
  raw objects (9,428,683,391 bytes) alongside 13 verified compressed objects
  (1,491,654,444 bytes), so historical raw pointers remain cloneable.
- Expected first verifier result: run `30048474451` failed because the
  repository did not yet contain the authoritative build manifest. This was
  the intended fail-closed result, not a payload-integrity failure.
- Manifest and caller pin: the real Changes UI committed and pushed exactly
  `.github/bambu-build-manifest.json` and the workflow action-pin update in
  `712ad85f92f9002474f0f13b6bb6991153d586af`.
- Final remote proof: verifier run `30054805137` passed 8,305 payload files,
  ten pointer records, and 26 Release assets. It published immutable tag
  `bambu-build-verify-30054805137` at exact commit `712ad85f92f9002474f0f13b6bb6991153d586af`
  with one `bambu-build-manifest.json` asset: 5,489 bytes, SHA-256
  `234e88a446073d59c293e40966b6cbcfa080e21467fe14df840452d0c04694b3`.
  The paired final cloud run `30054805097` was a clean no-op: 0 compressed,
  0 kept raw, and 0 failed safely.
- Initial fresh-clone proof: Desktop Material cloned the public repository
  through its real Clone UI at exact HEAD
  `712ad85f92f9002474f0f13b6bb6991153d586af`. All ten materialized working
  files matched the manifest SHA-256 values (10/10), while their committed Git
  blobs remained small pointer objects of 374, 506, 500, 370, 380, 371, 374,
  514, 378, and 379 bytes in UI listing order.
- Materialization concurrency finding: the first explicit Materialize-all
  action overlapped the clone/open automatic materializer and triggered two
  exact compare-and-swap recovery duplicates. Although the resulting ten
  working files passed all hashes, that run is not claimed as the corrected
  concurrency acceptance. It led to repository-scoped serialization.
- Corrected serialization acceptance: 29/29 focused queue and UI tests passed;
  the immediately preceding wider four-suite Cheap LFS run passed 108/108.
  Coverage includes a real disposable-Git overlap regression that proves one shared
  checkout queue, exact-request cancellation ownership, fresh in-lock re-list,
  and rejection-tolerant queue release. The initial real-UI clone remains the
  GUI receipt; an additional multi-gigabyte rerun was not claimed after the
  user requested immediate publication and cleanup.
- Promoted inspected dark-theme screenshot: 960 x 660, 98,404 bytes, SHA-256
  `55a6519a81edef49cb7b6f6f02606a75485b34a1fed21beafa21b67fd758d142`.
  It shows the real public Bambu repository with ten tracked Release-backed
  pointers and their Materialize actions; the separate fresh-clone receipt
  proves 10/10 restored hashes.
- Account and UI route: the repository-selected Desktop Material account was
  `codingmachineedge`. The production secure credential was used in place and
  never exposed or copied. All interaction used the fixed Lowlevel MCP endpoint
  on one named off-screen Win32 desktop with runtime-resolved HWND and saved
  launch PID; no visible-desktop action was used.
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
