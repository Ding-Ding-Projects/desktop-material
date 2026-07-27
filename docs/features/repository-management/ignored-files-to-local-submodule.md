# Ignored files to a local Cheap LFS submodule (local phase)

A reviewed workflow that copies working files **Git itself currently proves are
ignored** into a newly created local Git repository and registers that
repository as a submodule of the parent, at a safe, non-overlapping path.

The originals never move. Nothing is uploaded, no remote is created, nothing is
pushed, and no file becomes a Cheap LFS pointer. Those belong to a separate,
explicitly opted-into phase which does not exist yet.

- Entry point: **Repository settings → Submodules → Ignored files to a local
  submodule…**
- Core: [`app/src/lib/cheap-lfs/ignored-submodule-local.ts`](../../../app/src/lib/cheap-lfs/ignored-submodule-local.ts)
  (Git and filesystem) and
  [`app/src/lib/cheap-lfs/ignored-submodule-plan.ts`](../../../app/src/lib/cheap-lfs/ignored-submodule-plan.ts)
  (pure path rules)
- UI: [`app/src/ui/repository-settings/ignored-submodule-dialog.tsx`](../../../app/src/ui/repository-settings/ignored-submodule-dialog.tsx)

## Why this exists

Build outputs, virtual environments, model checkpoints, and datasets are
routinely ignored, routinely enormous, and routinely the thing a second machine
most needs. Copying them into a submodule makes them a versioned, shareable
unit — but only if the operation can be trusted not to lose the working copy
that a build, a virtual environment, or a training run is using **right now**.

That is the whole design constraint: the workflow is allowed to add things, and
is never allowed to take anything away.

## Behaviour

### 1. Only Git decides what is ignored

Candidates are enumerated with

```text
git status --porcelain=1 -z --untracked-files=all --ignored=traditional
```

which is Git's own working-tree scan. It honours every exclude source —
`.gitignore` at any depth, `.git/info/exclude`, and `core.excludesFile` — and
`--untracked-files=all` combined with `--ignored=traditional` expands an ignored
directory into its individual files instead of collapsing it into one directory
entry. Desktop Material never parses a `.gitignore` itself and never guesses
from a filename.

Each enumerated path is then proven individually with

```text
git check-ignore -v -z --stdin
```

which answers with the exact source file, line number, and pattern responsible.
That proof is shown next to every row in the dialog, so the user can see *why*
a file is eligible rather than taking the app's word for it.

`--no-index` is deliberately **not** passed. In that mode Git skips paths which
are in the index, so a tracked file can never come back with a proof — not even
one that was force-added despite matching an ignore pattern. A file whose bytes
exist anywhere in Git history is therefore unselectable by construction, which
is exactly the property the workflow rests on. Passing `--no-index` would break
it, and a test asserts that it stays absent.

The candidate list is capped at 20,000 files and a single operation stages at
most 5,000. Reaching the cap is reported to the user, never silently truncated.

### 2. Every check is fail-closed

The selection is re-proven and re-checked immediately before it is used —
nothing trusts the inventory the user reviewed. The filesystem hazards are
checked *before* the inventory is consulted, so a link or a nested repository is
always reported as what it actually is rather than as a generic stale entry.

<!-- markdownlint-disable MD013 -->

| Reason | Refused when |
| --- | --- |
| `not-proven-ignored` | `git check-ignore` returns no rule for the path right now. Tracked files, force-added files, and files whose ignore rule was edited since the scan all land here. |
| `symbolic-link` | The final path component is a symbolic link or a Windows directory junction. The link is never followed. |
| `reparse-point` | The path resolves, through a reparse point, junction, or mount point in one of its parents, to a different physical location inside the repository. The bytes do not live where the path says. |
| `not-regular-file` | A directory, device, socket, or FIFO. |
| `git-control-path` | Any path segment is `.git`, case-insensitively. |
| `nested-repository` | Some ancestor directory between the repository root and the file contains a `.git` entry, so the file belongs to another repository. |
| `path-escape` | The path text is absolute, drive-relative, contains `..` or a control character; or its physical location resolves outside the repository root. |
| `duplicate-selection` | The same path appears in the selection more than once. |
| `destination-case-collision` | Two selections fold to the same destination on a case-insensitive filesystem (`A/Foo.bin` and `a/foo.bin`), or one would have to exist as a file and a directory at once (`data/blob` and `DATA/BLOB/inner.bin`). The first path in order survives; the later ones are refused. |
| `inside-destination` | The file lives inside the folder the new submodule would occupy. |
| `stale-inventory` | The file vanished, or its size or modification time differs from the reviewed snapshot, or it was never in that snapshot at all. The bytes the user approved are no longer the bytes on disk. |

<!-- markdownlint-enable MD013 -->

The destination folder has its own checks, in this order: `empty`, `absolute`,
`repository-root`, `segments`, `git-control-path`, `existing-submodule` (overlap
in either direction with a path declared in `.gitmodules` or indexed as a
gitlink), `unsafe-link`, `occupied` (exists and is not an empty directory), and
`ignored` (Git ignores the folder, which `git submodule add` refuses without
`--force` — and forcing it is exactly the override this workflow will not take).

If anything at all is refused, the whole operation is refused. There is no
partial run.

### 3. The proof boundary

The phases run in this exact order, and the dialog and tests both observe it:

```text
validate → hash-originals → recovery-copy → stage-copy
         → initialize-repository → topology → final-verification → cleanup
```

Everything up to and including `stage-copy` is **read-only with respect to the
parent repository**: originals are only ever read, and the destination folder is
a freshly created, previously absent directory.

- `hash-originals` records the size and SHA-256 of every selected original.
- `recovery-copy` writes an independent copy of every original outside the
  working tree and verifies each copy's size and SHA-256 against that record.
- `stage-copy` copies each file into the destination at its exact
  repository-relative path and verifies each copy's size and SHA-256 the same
  way.

Only after all of that does `initialize-repository` run the first `git add` and
`git commit` — inside the *new* repository — and only then does `topology` run
the single `git submodule add` against the parent. A failed size or hash proof
throws before any of it, removes the destination folder the operation created,
and leaves the parent's index and `.gitmodules` byte-identical to how they
started.

### 4. The originals are untouched

After a successful run, `final-verification` re-stats and re-hashes every
original at its exact original path and requires a regular file with the same
size and the same SHA-256. Nothing is moved, linked, truncated, or replaced.
The workflow has no code path that writes to an original at all.

### 5. Recovery

Independent recovery copies live at

```text
<git-dir>/desktop-material/ignored-submodule-recovery/run-<timestamp>-<random>/
├── recovery-manifest.json
└── originals/<the exact relative paths>
```

That location is outside the working tree, so Git cannot see, stage, or clean
it, and it shares a volume with the repository. The manifest records the parent
repository path, the destination path, the recovery directory itself, and every
file with its size and SHA-256.

The copies are deleted only after `final-verification` passes for **every**
original. Any failure — a proof mismatch, a `git submodule add` refusal, a
verification miss, or a crash — leaves them in place, and the thrown error
message names the directory explicitly. `IgnoredSubmoduleProofError` also
carries it as `retainedRecoveryDirectory`, which the dialog shows to the user.

### 6. The submodule that gets added

`git submodule add` is given the destination's absolute physical path. Git only
accepts a submodule URL which is absolute, contains a colon, or begins with
`./` or `../`; a bare relative path is rejected outright, and a `./` one is
resolved against the superproject's *remote*, which this repository may not even
have. Because a valid repository already exists at that path, Git stages it
rather than cloning it.

The tracked `.gitmodules` URL is then rewritten to `./<destination>`, so no
machine-specific path is ever committed. The absolute path remains in the
untracked local config, where it is correct and private. **The submodule has no
remote**; that placeholder URL is what the deferred publish phase would replace.

The submodule and `.gitmodules` are left **staged, not committed**. The user
reviews and commits the change themselves.

## Deliberate non-goals of this phase

The workflow will not, under any option:

- select or configure Release/OCI storage,
- upload a Cheap LFS object,
- convert any file into a Cheap LFS pointer,
- create a repository at GitHub or any other provider,
- add a remote, or
- push anything anywhere.

`IgnoredSubmoduleDeferredPhase` in the plan module names each of those, the
dialog states all of them to the user before the confirmation button, and a
source test asserts that the local phase imports no API, release, OCI, GHCR,
Docker, upload, push, or remote module and contains no `'push'`, `'fetch'`,
`'remote'`, or `'clone'` Git verb. When that phase is built it will be a
separate, explicitly opted-into operation on top of the repository this one
creates.

## Failure modes

<!-- markdownlint-disable MD013 -->

| Situation | What happens |
| --- | --- |
| Any file or the destination is refused | `IgnoredSubmoduleRejectedError` before any work; every refused path is listed with its own reason; nothing on disk changed. |
| A recovery copy fails its proof | `IgnoredSubmoduleProofError` at `recovery-copy`; recovery directory retained and named; parent untouched. |
| A staged copy fails its proof | `IgnoredSubmoduleProofError` at `stage-copy`; the created destination folder is removed; no index anywhere was written; recovery retained and named. |
| The new repository cannot be initialized or committed | `IgnoredSubmoduleProofError` at `initialize-repository`; destination removed; parent untouched. |
| `git submodule add` fails | `IgnoredSubmoduleProofError` at `topology` with Git's reason; originals untouched; recovery retained and named. |
| An original fails final verification | `IgnoredSubmoduleProofError` at `final-verification`; recovery copies are **kept** and named so the exact bytes can be restored by hand. |
| The process is killed mid-run | Either the originals are intact (they are only ever read) or the recovery directory and its manifest are on disk naming everything. |
| Git reports more than 20,000 ignored files | The inventory is capped and marked truncated; the dialog says so instead of silently listing a subset. |

<!-- markdownlint-enable MD013 -->

## Security considerations

- No path from the user or from Git is ever handed to `lstat`, `check-ignore`,
  or a copy before the pure structural rules have accepted it.
- Links and reparse points are detected but never followed, in either the
  candidate paths or the destination.
- Case folding uses `toLowerCase`, not `toLocaleLowerCase`, so a Turkish locale
  cannot fold `I` into a character NTFS would not treat as equal.
- The recovery directory is created with mode `0o700` under the Git directory,
  which is outside the working tree and outside every Git scan.
- The staged submodule commit runs `--no-verify`: it is an app-generated commit
  in a repository the user has not configured, so no user hook is executed on
  their behalf. Every commit the user makes still runs their hooks normally.

## Language, funny level, and accessibility

Every string is defined in
[`app/src/lib/i18n-resources.ts`](../../../app/src/lib/i18n-resources.ts) under
the `ignoredSubmodule.*` keys, in English and playful Hong Kong Cantonese, and
renders in English, Cantonese, or bilingual mode.

The dialog's introduction and its review lead line carry `.plain` / `.light` /
`.playful` bands selected per language by that language's own funny level
(1–2 plain, 3 light, 4–5 playful) through
[`app/src/lib/funny-level-text.ts`](../../../app/src/lib/funny-level-text.ts).
The voice moves; the facts do not. At every level all three bands still say that
only Git-proven ignored files are listed, that copies are verified, that the
originals are untouched, and that nothing is uploaded.

The dialog is the confirmation gate and is the only modal in the workflow.
Progress, success, and failure are also posted as non-blocking notifications
through the notification centre, so the result survives the dialog being closed.
The file list uses labelled checkboxes, the progress row is a polite live
region, and refusals are announced assertively.

## Search

The file list's search field is the registered `ignored-submodule-files`
collection surface. It uses the shared `TextBox` + `FilterModeControl` stack, so
plain substring matching is the default, fuzzy and regex are explicit opt-ins,
and the full regex builder is reachable from the control with this surface's own
sample items. An invalid pattern is reported and leaves every row listed. The
query matches both the path and the ignore rule that proves it, so
`\.bin$` or `node_modules` both work.

## Verification

Run:

```text
node script/test.mjs app/test/unit/cheap-lfs/ignored-submodule-plan-test.ts \
  app/test/unit/cheap-lfs/ignored-submodule-local-test.ts \
  app/test/unit/ui/ignored-submodule-dialog-test.tsx
```

- `ignored-submodule-plan-test.ts` (9 cases) — path normalization and folding,
  every structural rejection, case and file-versus-directory collisions,
  destination text rules, bilingual copy for every reason, the deferred-phase
  list, and the source scan proving the local phase imports and references no
  upload, remote, or push code.
- `ignored-submodule-local-test.ts` (22 cases) — real temporary Git
  repositories throughout. It covers status parsing, the inventory excluding
  both an ordinary tracked file and a force-added file that matches an ignore
  pattern, truncation reporting, one dedicated case per rejection reason
  (junction leaf, junction ancestor inside the repository, junction escaping the
  repository, nested repository, `.git` path, case collision, duplicate,
  inside-destination, stale inventory, missing from inventory), every
  destination rule, a successful run asserting the originals hash identically
  before and after plus the staged gitlink and `.gitmodules` URL, the recovery
  copies existing at `topology` and gone after success, an injected copy-proof
  failure asserting no topology change and an unchanged index, and a stale
  inventory aborting at `validate`.
- `ignored-submodule-dialog-test.tsx` (5 cases) — the proof shown per row, the
  review-then-confirm gate running nothing until confirmed, the stated
  non-goals, the non-blocking notifications, per-file refusal reasons, and the
  registered search surface narrowing the list.

Mutation-checked: adding `--no-index` to `git check-ignore` fails exactly the
two tracked-file tests, and disabling the staged-copy hash comparison fails
exactly the copy-proof abort test.
