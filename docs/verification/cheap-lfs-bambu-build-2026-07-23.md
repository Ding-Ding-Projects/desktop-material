# Cheap LFS Bambu build cloud, clone, and batching acceptance — 2026-07-23

This receipt records a live public-repository Cheap LFS acceptance with a real
14.8 GB Windows build tree. The four app-created payload batches, managed cloud
caller, one-object-at-a-time compression, exact manifest verifier, immutable
verification release, and initial fresh UI-clone integrity proof completed on
the logged-in `codingmachineedge` Desktop Material account. The run used the
fixed Lowlevel MCP server on an isolated off-screen Win32 desktop; no
visible-desktop interaction or credential copying was used.

One UI-concurrency result remains deliberately open. The first explicit
Materialize-all action overlapped clone/open automatic materialization and
created two exact compare-and-swap recovery duplicates. All ten resulting
working files still matched their expected hashes, but a corrected build with
repository-scoped serialization must repeat that UI action before the final
screenshot is promoted. This receipt does not turn that pending rerun into a
success claim.

## Repositories and inventory

- Source: clean `Ding-Ding-Projects/BambuStudio` commit
  `0c08db803478647e79895dac20a9db12d5719b94`.
- Public destination: `codingmachineedge/bambu-build`.
- Copied payload: exactly 8,305 files and 14,809,588,162 bytes from the complete
  `build` folder, including the materialized `src/Release/resources` junction.
- Preserved destination content: the repository's original `README.md`.
- Cheap LFS set: exactly ten files strictly above 100 MiB, totaling
  9,428,683,391 bytes. Every copied file matched its source SHA-256 before the
  app replaced it with a pointer.
- Storage release: prerelease tag
  `bambu-build-20260723-1105-41718cda`, with 13 retained raw assets. Three
  logical objects are split into two parts below the 1.5 GiB ceiling.

The ten pointer paths, logical sizes, source digests, and committed pointer-blob
sizes at `712ad85f92f9002474f0f13b6bb6991153d586af` are:

<!-- markdownlint-disable MD013 -->

| Path | Logical bytes | SHA-256 | Git blob bytes |
| --- | ---: | --- | ---: |
| `src/libslic3r/libslic3r_cgal.dir/Release/MeshBoolean.obj` | 145,270,375 | `b3c7be83fad51a3813fce4ff484c75bfd82068eba6b1e3936f3e70340c6cfbf7` | 374 |
| `src/libslic3r/libslic3r.dir/Release/cmake_pch.pch` | 732,037,120 | `201153d12c81342e62cd272bed90ca8e465c837e9fe4020e0a185d5579ee1250` | 371 |
| `src/libslic3r/Release/libslic3r_cgal.lib` | 284,664,618 | `c1fd0bf8bb43481256166808a0fc4f9e01ad3d5aa187832cad6a8955917086ec` | 380 |
| `src/libslic3r/Release/libslic3r.lib` | 1,742,356,008 | `bef63ad92006107944086ec1c041c1b56671d71175f6850200275906babbd9dc` | 500 |
| `src/libslic3r/Release/libslic3r.pdb` | 563,695,616 | `01e6ebc4a08ab76e673511043d85556a79cc055a45f2aea576cafdb8033387c4` | 370 |
| `src/Release/BambuStudio.dll` | 147,919,360 | `ea9fe882ae299b2f81c801dd8fa607a73b38f145fe1b4a87e95e44114180a68a` | 374 |
| `src/Release/BambuStudio.pdb` | 1,836,314,624 | `a8b37e72bf02efc90e4075a0321b1999dfb6af974407edaccbc1e35e69c3d15f` | 506 |
| `src/slic3r/libslic3r_gui.dir/Release/cmake_pch.cxx.pch` | 605,028,352 | `aae255240caa3e82737ecbcd24cd9626dd9bddeba26623ccacbad1368b5fe615` | 379 |
| `src/slic3r/Release/libslic3r_gui.lib` | 3,004,580,038 | `4d14adee135ee1c76434124faa51879db58dfb69081164b167786bae3d67d82d` | 514 |
| `src/slic3r/Release/libslic3r_gui.pdb` | 366,817,280 | `4efd89637937845b5c3120b046cc8012aba08230aacd5bb159fca59c8c212192` | 378 |

<!-- markdownlint-enable MD013 -->

## UI commit and batch-push proof

The installed app prepared all ten pointers and created four ordered commits
through the real Changes UI. Each used the bilingual subject
`Add Bambu build / 加入 Bambu build` and a bilingual body.

<!-- markdownlint-disable MD013 -->

| Commit | Paths | New blob bytes | Exact push time |
| --- | ---: | ---: | ---: |
| `639d566b015e3ff9ccecc3b9d3422ac5a8aef8db` | 723 | 1,381,068,318 | 190.946 s |
| `8efaa6f958273542ccd3c831ef376ead9a6a5d2f` | 7,181 | 1,381,044,686 | 214.815 s |
| `93d72d61aa07ab984892e5bc82f6703453072174` | 189 | 1,395,199,423 | 193.912 s |
| `f58fd4c026ba813fd01b2fe774835553d16a9044` | 212 | 1,220,761,246 | 140.883 s |

<!-- markdownlint-enable MD013 -->

The first attempt used Git's normal packing and received HTTP 408 after
675.591 seconds. The exact pending commit remained durable and retryable, then
the same immutable SHA succeeded with `pack.window=0` and `pack.compression=0`
scoped to that exact push process. The following three batches used the same
process-local fast-pack path. Normal pushes and persistent Git configuration
remain unchanged.

For every batch, the run proved commit creation, exact-SHA fast-forward push,
remote-tip equality, and durable pending-ref cleanup before the next commit.
Local and remote `main` ended equal at
`f58fd4c026ba813fd01b2fe774835553d16a9044` before the cloud caller was added.

## Cloud compression, manifest, and remote verification

The real UI added the managed public caller in bilingual commit
[`fc1bedb2f98302e585a37e396fb411c34d16a594`](https://github.com/codingmachineedge/bambu-build/commit/fc1bedb2f98302e585a37e396fb411c34d16a594)
only after the payload batches were remotely proved. Cloud run
[`30048474438`](https://github.com/codingmachineedge/bambu-build/actions/runs/30048474438)
then processed each of the 13 raw Release objects independently. It compressed
13, kept 0 raw, and failed 0. Thirteen pointer-only bot commits ended at
[`ce438aa4c1f87b55a152f632bffab4a0732792b9`](https://github.com/codingmachineedge/bambu-build/commit/ce438aa4c1f87b55a152f632bffab4a0732792b9).

The storage release retained all 13 raw originals (9,428,683,391 bytes) and
added 13 verified compressed assets (1,491,654,444 bytes), for 26 assets total.
Keeping the originals preserves raw fallback for historical pointer commits
even after current pointers adopt compressed parts.

The first verifier run
[`30048474451`](https://github.com/codingmachineedge/bambu-build/actions/runs/30048474451)
failed as expected because no authoritative build manifest had been committed;
it did not report a payload-integrity mismatch. The real Changes UI then
committed and pushed exactly the manifest and managed-workflow action pin in
[`712ad85f92f9002474f0f13b6bb6991153d586af`](https://github.com/codingmachineedge/bambu-build/commit/712ad85f92f9002474f0f13b6bb6991153d586af).

Verifier run
[`30054805137`](https://github.com/codingmachineedge/bambu-build/actions/runs/30054805137)
passed the exact 8,305-file inventory, ten pointers, and 26 Release assets. Its
immutable release
[`bambu-build-verify-30054805137`](https://github.com/codingmachineedge/bambu-build/releases/tag/bambu-build-verify-30054805137)
points to exact commit `712ad85f92f9002474f0f13b6bb6991153d586af` and contains
one `bambu-build-manifest.json` asset: 5,489 bytes, SHA-256
`234e88a446073d59c293e40966b6cbcfa080e21467fe14df840452d0c04694b3`.
The paired final cloud run
[`30054805097`](https://github.com/codingmachineedge/bambu-build/actions/runs/30054805097)
completed as a clean no-op with 0 compressed, 0 kept raw, and 0 failed safely.

## Fresh UI clone and serialization follow-up

Desktop Material cloned the public repository through the real Clone UI to a
new owned directory. Local HEAD was exact
`712ad85f92f9002474f0f13b6bb6991153d586af`. All ten materialized working
files matched the manifest SHA-256 values (10/10), while `git cat-file` proved
that the committed objects remained the small pointer blobs shown in the table.
This establishes remote restore integrity for the compressed objects and their
locally decompressed output.

The same run exposed a UI scheduling race: clone/open automatic materialization
was still active when Materialize all began. Two paths reached the exact
compare-and-swap recovery-duplicate fence. The hashes ultimately remained
correct, but that overlap is not accepted as final concurrency behavior. A
repository-scoped serialization fix followed. Its deterministic real-Git and UI
routing regressions pass, and the linked run manifest records the inspected
live ten-pointer frame separately from this fresh-clone byte proof.

## Safety and cleanup

- The three unrelated pre-existing ambiguous `assets` draft releases were not
  renamed, published, or deleted.
- The logged-in app credential was used in place; it was never printed or
  copied.
- The independent BambuStudio linked worktree and its untracked files were
  preserved.
- No force push or history rewrite was used.

The detailed headless run parameters, serialization regression receipt, and
intermediate evidence are retained in
[`2026-07-23-bambu-build-cheap-lfs-live.md`](../../.codex/run-manifests/2026-07-23-bambu-build-cheap-lfs-live.md).
