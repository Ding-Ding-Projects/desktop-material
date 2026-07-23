# Cheap LFS Bambu build UI and batching checkpoint — 2026-07-23

This receipt records the completed UI preparation and batch-push phase of a
live public-repository Cheap LFS acceptance with a real 14.8 GB Windows build
tree. It is a checkpoint, not the final cloud/restore acceptance: the exact
caller Action, fresh UI clone/materialization, and live Bambu screenshot remain
pending. The completed phase used the logged-in
`codingmachineedge` Desktop Material account and the fixed Lowlevel MCP server
on an isolated off-screen Win32 desktop. No visible-desktop interaction or
credential copying was used.

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

The ten pointer paths, logical sizes, and source digests are:

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/libslic3r/libslic3r_cgal.dir/Release/MeshBoolean.obj` | 145,270,375 | `b3c7be83fad51a3813fce4ff484c75bfd82068eba6b1e3936f3e70340c6cfbf7` |
| `src/libslic3r/libslic3r.dir/Release/cmake_pch.pch` | 732,037,120 | `201153d12c81342e62cd272bed90ca8e465c837e9fe4020e0a185d5579ee1250` |
| `src/libslic3r/Release/libslic3r_cgal.lib` | 284,664,618 | `c1fd0bf8bb43481256166808a0fc4f9e01ad3d5aa187832cad6a8955917086ec` |
| `src/libslic3r/Release/libslic3r.lib` | 1,742,356,008 | `bef63ad92006107944086ec1c041c1b56671d71175f6850200275906babbd9dc` |
| `src/libslic3r/Release/libslic3r.pdb` | 563,695,616 | `01e6ebc4a08ab76e673511043d85556a79cc055a45f2aea576cafdb8033387c4` |
| `src/Release/BambuStudio.dll` | 147,919,360 | `ea9fe882ae299b2f81c801dd8fa607a73b38f145fe1b4a87e95e44114180a68a` |
| `src/Release/BambuStudio.pdb` | 1,836,314,624 | `a8b37e72bf02efc90e4075a0321b1999dfb6af974407edaccbc1e35e69c3d15f` |
| `src/slic3r/libslic3r_gui.dir/Release/cmake_pch.cxx.pch` | 605,028,352 | `aae255240caa3e82737ecbcd24cd9626dd9bddeba26623ccacbad1368b5fe615` |
| `src/slic3r/Release/libslic3r_gui.lib` | 3,004,580,038 | `4d14adee135ee1c76434124faa51879db58dfb69081164b167786bae3d67d82d` |
| `src/slic3r/Release/libslic3r_gui.pdb` | 366,817,280 | `4efd89637937845b5c3120b046cc8012aba08230aacd5bb159fca59c8c212192` |

## UI commit and batch-push proof

The installed app prepared all ten pointers and created four ordered commits
through the real Changes UI. Each used the bilingual subject
`Add Bambu build / 加入 Bambu build` and a bilingual body.

| Commit | Paths | New blob bytes | Exact push time |
| --- | ---: | ---: | ---: |
| `639d566b015e3ff9ccecc3b9d3422ac5a8aef8db` | 723 | 1,381,068,318 | 190.946 s |
| `8efaa6f958273542ccd3c831ef376ead9a6a5d2f` | 7,181 | 1,381,044,686 | 214.815 s |
| `93d72d61aa07ab984892e5bc82f6703453072174` | 189 | 1,395,199,423 | 193.912 s |
| `f58fd4c026ba813fd01b2fe774835553d16a9044` | 212 | 1,220,761,246 | 140.883 s |

The first attempt used Git's normal packing and received HTTP 408 after
675.591 seconds. The exact pending commit remained durable and retryable, then
the same immutable SHA succeeded with `pack.window=0` and `pack.compression=0`
scoped to that exact push process. The following three batches used the same
process-local fast-pack path. Normal pushes and persistent Git configuration
remain unchanged.

For every batch, the run proved commit creation, exact-SHA fast-forward push,
remote-tip equality, and durable pending-ref cleanup before the next commit.
Local and remote `main` ended equal at `f58fd4c026ba813fd01b2fe774835553d16a9044`.

## Cloud compression and restore gate

The managed public-repository caller will be committed only after the four
payload batches, preventing an Actions pointer update from racing their branch
compare-and-swap checks. Its reviewed implementation uses sparse Git-object
discovery so the runner does not materialize the 14.8 GB checkout, processes
release objects one by one, keeps failed or non-beneficial objects on their raw
cloneable pointers, and uses ordinary fast-forward pushes without force.

At this checkpoint the final caller commit/action run, sequential compression
result, fresh Desktop Material UI clone/materialization proof, and live Bambu
screenshot are not yet claimed. They will be appended only after those gates
settle. All 13 raw source assets remain retained meanwhile.

## Safety and cleanup

- The three unrelated pre-existing ambiguous `assets` draft releases were not
  renamed, published, or deleted.
- The logged-in app credential was used in place; it was never printed or
  copied.
- The independent BambuStudio linked worktree and its untracked files were
  preserved.
- No force push or history rewrite was used.

The detailed headless run parameters and intermediate evidence are retained in
[`2026-07-23-bambu-build-cheap-lfs-live.md`](../../.codex/run-manifests/2026-07-23-bambu-build-cheap-lfs-live.md).
