# Cheap LFS in the terminal edition

The Linux-first terminal edition can inspect, create, verify, and restore the
same `desktop-material/cheap-lfs/v1` GitHub Release pointers as the Windows
graphical edition. It is a compatible vertical slice, not a second pointer
dialect and not a claim that every Windows automation path is present.

## Interactive workflow

Open the **Cheap LFS** tab with the mouse or keyboard. The pane provides:

- a shared literal, fuzzy, or explicit-RE2 inventory search;
- editable repository-relative path, Release tag, and optional `OWNER/NAME`
  fields;
- a read-only multiline plan showing hashes, sizes, assets, and effects;
- clickable **Preview track**, **Track**, **Verify**, and **Restore** actions;
- typed confirmation before Track or Restore changes a file; and
- a table of canonical pointers and safe regular-file candidates strictly over
  100 MiB.

Preview hashes the local file but does not contact GitHub or replace it. Track
recreates that preview, asks for confirmation, uploads or proves the required
assets, and replaces the source with a pointer only after revalidating the
source bytes. Restore previews its cache and provider reads, asks for
confirmation, verifies every part plus the complete payload, and replaces only
the still-reviewed pointer.

Mouse interaction requires a terminal emulator that enables mouse reporting.
Every action also remains reachable through focus traversal and keyboard
activation. The path, tag, and repository controls are real Textual `Input`
widgets rather than simulated prompt text.

### Confirmed transfer boundary

Canceling the Track or Restore decision dialog makes no change. After the user
types the confirmation and starts a transfer, the current `asyncio.to_thread`
plus `gh` adapter cannot stop that transfer safely. The TUI blocks application
quit while a confirmed mutation is active and lets it finish or reach the
one-hour provider timeout. It does not show a Cancel control that would only
cancel the visible worker while leaving its background thread running.

This boundary is deliberately visible in the plan and confirmation. Confirm
only when the repository can remain open for the transfer. A later local
publication race can leave already verified immutable provider assets behind,
but it does not replace a changed working file.

## Windows-compatible format

The terminal writer uses the canonical five-line head:

```text
version desktop-material/cheap-lfs/v1
release-tag assets
asset-name model.bin.cheap-lfs-0123456789ab
size 123
sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Large payloads add ordered `part` records. Restore also understands legacy
`part-deflate` records and expands raw DEFLATE locally under the pointer's exact
output bound. The compatibility limits are:

- at most 512 KiB of UTF-8 pointer text;
- 500 MiB parts for new Windows and terminal writes;
- legacy reads of parts up to exactly 2 GiB;
- whole-file and per-part SHA-256 plus byte-size verification; and
- Windows-safe tracked paths even when the TUI is running on Linux.

The raw or expanded bytes never become trusted merely because an asset name or
provider size matches. Missing provider digests are proved by a bounded
download and local SHA-256 calculation.

The pointer parser retains the Windows grammar for historical reads. Provider
commands impose one additional safety boundary: an option-shaped Release tag
such as `--help` is never passed to `gh`. A pointer using such a tag can restore
entirely from an already verified cache, but a provider read fails before
process invocation. New terminal-written tags are always option-safe.

## GitHub Release ownership

Remote transfer uses the installed `gh` executable with argv-only calls and a
bounded timeout. The terminal edition creates a published prerelease whose body
is exactly:

```text
<!-- desktop-material:cheap-lfs-release-bucket:v1 -->
```

It may also append to a legacy published prerelease when at least one asset has
an exact valid `cheap-lfs/v1` provenance label. A draft, stable Release,
renamed Release, or unrelated same-tag prerelease fails before upload or
pointer replacement. Existing assets are never overwritten; an exact
same-name asset must prove the planned bytes before it can be reused.

The general Releases dashboard remains read-only. Cheap LFS is the narrow,
purpose-built exception for managed storage prereleases and does not expose
general Release authoring.

## CLI

Run commands from a Git working-tree root, or pass the root with `-C`:

```bash
dmt -C /work/project cheap-lfs status
dmt -C /work/project cheap-lfs preview artifacts/model.bin
dmt -C /work/project cheap-lfs track artifacts/model.bin --dry-run
dmt -C /work/project cheap-lfs track artifacts/model.bin --yes --stage
dmt -C /work/project cheap-lfs verify artifacts/model.bin --fetch-missing
dmt -C /work/project cheap-lfs restore artifacts/model.bin --dry-run
dmt -C /work/project cheap-lfs restore artifacts/model.bin --yes
```

`status`, `preview`, and a restore or track `--dry-run` do not mutate the
working tree or provider. Track and Restore print a plan and stop unless
`--yes` is present. `--stage` is opt-in; neither surface commits or pushes the
pointer automatically.

The installed launcher also wraps native Git without shadowing the system
executable:

```bash
github -C /work/project push --dry-run
github -C /work/project push origin main
github -C /work/project pull --ff-only
github -C /work/project git status --short
```

Push runs a native dry-run, then scans safe working candidates and the
publication delta, falling back to all source-ref history when the remote base
cannot be proven locally. Pull materializes canonical pointers after native Git
succeeds. The
[Cheap LFS-aware Git wrapper guide](cheap-lfs-git-wrapper.md) records exact
argv handling, exit codes, repeated-pull behavior, dry-run guarantees, and the
boundary that never stages, commits, uploads, or rewrites automatically.

Use `--repo OWNER/NAME` when `origin` is not a canonical GitHub.com URL and
`--cache PATH` only when an explicitly chosen cache root is required. Sign in
to `gh` through a trusted shell; the TUI does not request, display, or persist a
GitHub token.

### Docker CLI examples

When using the documented container, run noninteractive commands against the
current repository with the same workspace and XDG volumes as the full-screen
TUI:

```bash
dmt_docker() {
  docker run --rm --init \
    --volume "$PWD:/workspace" \
    --volume desktop-material-tui-config:/home/dmt/.config \
    --volume desktop-material-tui-data:/home/dmt/.local/share \
    --volume desktop-material-tui-state:/home/dmt/.local/state \
    --volume desktop-material-tui-cache:/home/dmt/.cache \
    --workdir /workspace \
    desktop-material-tui:local "$@"
}

dmt_docker status --json
dmt_docker cheap-lfs status --json
dmt_docker cheap-lfs track artifacts/model.bin --dry-run
dmt_docker cheap-lfs track artifacts/model.bin --yes --stage
```

Authenticate `gh` interactively before the confirmed provider write. The
config volume retains the resulting GitHub CLI configuration:

```bash
docker run --rm -it \
  --volume desktop-material-tui-config:/home/dmt/.config \
  --entrypoint gh \
  desktop-material-tui:local \
  auth login
```

Never place a token in the image, build arguments, command line, repository, or
this function. See the [container guide](container.md) for the complete launch,
UID/GID, SELinux, and credential boundary.

## Cache, recovery, and failure behavior

Verified parts are stored below the platform-specific XDG cache directory.
Track and Restore use a no-overwrite quarantine swap. The previous source or
pointer inode is retained in the app-owned recovery area; an editor that still
has the old inode open therefore cannot have its late write silently discarded.
If another process creates the destination during the swap, the new file is
left untouched and recovery is reported.

The working file remains unchanged on missing confirmation, invalid pointer
text, an unsafe or redirected path, source or pointer drift, unowned Release
metadata, insufficient Release capacity, missing assets, timeout, download or
upload failure, size mismatch, SHA-256 mismatch, malformed or oversized DEFLATE
output, an option-shaped provider tag, or a destination race. Assets already
uploaded before a later local race remain immutable provider objects; the
recovery path preserves the local bytes needed to retry deliberately.

In the container, verified objects and recovery files live in
`desktop-material-tui-cache`. Do not treat that volume as disposable while a
reported recovery path is still needed. Inspect or copy required recovery bytes
before pruning or deleting the volume. `docker run --rm` removes the stopped
container, not this named volume.

## Current parity boundary

The terminal edition currently uses one GitHub Release bucket of at most 1,000
reported assets. It does not yet provide the Windows edition's automatic
commit/push worker lanes, bucket rollover and paginated inventory, manual
browser upload handoff, automatic clone/fetch/open materialization, Remove or
Materialize-all batch actions, post-commit asset relabeling, OCI/GHCR/Docker
writes, private-payload encryption, provider migration, ORAS runtime, cloud
compression publication, or cancellation after a confirmed transfer starts.
The explicit `github pull` wrapper now materializes after a successful native
pull, but it does not reproduce the desktop two-lane background coordinator. It
can read and restore a Windows-created deflated pointer.

These omissions keep the related parity rows partial or unavailable in
[`tui/contracts/parity.yaml`](../../../tui/contracts/parity.yaml).

## Verification

Focused tests cover byte-compatible pointer round trips, CRLF and BOM handling,
500 MiB write planning and 2 GiB legacy reads, malformed input, Windows-safe
paths, raw and bounded-DEFLATE restore, managed Release ownership, provider
metadata and argv safety, cache-first operation, strict `> 100 MiB` inventory,
source and destination races, retained recovery bytes, real mouse clicks, text
entry, typed confirmation, regex-builder access, localization, and narrow
layout.

The dated [Linux verification manifest](../../verification/linux-tui-2026-07-27/run-manifest.md)
remains the authority for a real off-screen Linux terminal run. Unit and pilot
tests do not turn an unchecked PTY or screenshot gate into completed evidence.
