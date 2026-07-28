# Cheap LFS-aware Git CLI wrapper

`github` exposes an argv-preserving Git wrapper alongside the interactive TUI:

```text
github git <any native Git arguments>
github push <any native git push arguments>
github pull <any native git pull arguments>
```

`github git` passes its native argv directly to Git from the caller-selected
working directory, including commands that do not require an existing
repository. A native `push` or `pull` within that form receives the same Cheap
LFS protection as the short aliases. The aliases do not require `--yes`; they
execute immediately, just like Git.
Put Desktop Material options before the wrapper command, for example
`github -C /work/repo --json push --dry-run origin main`. Native Git options may
appear in their ordinary positions, including `github push --force-with-lease
origin main`, `github pull --rebase`, and `github git -c protocol.version=2
status --short`.

For protected push/pull operations, repository-, configuration-, or
ref-namespace-changing Git globals inside the native argv are refused because
they could make preflight inspect different state from the final command. Use
`github -C /other/repository push ...`, not
`github git -C /other/repository push ...`. Ordinary passthrough commands may
still use native `git -C`, `-c`, `--git-dir`, and related globals.

## Push phases and safety boundary

Before a push, the wrapper first runs Git's parseable porcelain dry-run, then
reports a Cheap LFS preflight phase. It inspects tracked and unignored-untracked
safe, single-link regular working-tree files and blocks candidates strictly
larger than 100 MiB unless their index entry is a canonical Cheap LFS pointer.
Ignored files, symbolic links, hardlinks, and non-regular filesystem objects
are excluded from this working-candidate scan rather than followed.

When an indexed pointer is materialized in the working tree, the wrapper hashes
it and checks both its size and SHA-256 against the index pointer instead of
treating it as a bypass. It also refuses published history containing blobs
strictly larger than 100 MiB. The native dry-run names each actual source and
destination update. When its old destination object can be proven in the local
object database, the scan excludes that remote base and examines the
publication delta. A new ref, missing/ambiguous old object, or other
unprovable base safely falls back to all history reachable from the pushed
source ref. The scan is bounded at 1,000,000 objects.

`--dry-run` never publishes refs, stages files, rewrites history, uploads
assets, or restores/pulls payloads. Preflight never downloads missing Cheap LFS
assets. It validates index pointers and hashes materialized payloads only.

The wrapper deliberately never installs a Git hook/filter or shadow `git`
executable, rewrites commits, stages files, creates commits, or uploads Cheap
LFS assets. Convert a rejected file through the [Cheap LFS manager](cheap-lfs.md)
and make any necessary history rewrite deliberately.

Recursive submodule modes that can publish submodule histories are refused:
push each submodule through the wrapper first, then use
`--recurse-submodules=check` or `no`. This prevents a root-repository scan from
silently blessing an uninspected submodule publication.

## Pull phases and repeated pulls

After a successful native `git pull`, the wrapper restores every canonical
index pointer through the normal Cheap LFS cache/provider path and reports the
native-pull and restore phases separately. A cached payload restores without a
download when its hashes match.

Materialized payloads are verified and left intact. If native Git rejects a
subsequent pull because one could be overwritten, the wrapper does not replace
it behind Git's back: it reports the affected verified paths and tells the user
to restore their canonical pointers before retrying. This is intentionally a
clear, non-destructive failure rather than an automatic temporary checkout.

## Output and failure handling

Human output labels each phase as succeeded, failed, skipped, or planned and
preserves Git's sanitized stdout/stderr and exit code. `--json` emits the same
structured report, including blocked working files, blocked blobs, restored
paths, and already-materialized paths. Exit code 3 is a Cheap LFS push
preflight refusal; exit code 4 means native pull succeeded but restoration
failed without overwriting the path. Native Git failures retain Git's exit
code.

## Configuration

- Put `-C PATH`, `--json`, language, and funny-level options before `git`,
  `push`, or `pull`; every later argument belongs to native Git.
- Cheap LFS uses the same XDG cache and `origin`-derived GitHub repository slug
  as the manager and explicit `cheap-lfs` commands.
- Native Git retains its configured remotes, credential helper, signing,
  protocol, branch, rebase, and push settings.
- There is no installed hook, filter, alias, background daemon, or replacement
  `git` binary to configure or remove.

## Failure modes

| Condition | Result |
| --- | --- |
| native push dry-run fails | return Git's exit code; skip preflight and real push |
| unbacked safe file is strictly above 100 MiB | exit 3; list the working path and do not push |
| source history contains an oversized blob | exit 3; list blob/path evidence and require a deliberate history repair |
| materialized bytes differ from their indexed pointer | exit 3; do not push |
| source-history/path scan exceeds its 1,000,000-item bound | fail preflight instead of silently skipping objects |
| push-capable recursive-submodule mode is enabled | exit 3 before preview; push each submodule through the wrapper |
| protected push/pull carries native `-c`, `-C`, `--git-dir`, or similar state-changing global | refuse it; move repository selection to `github -C PATH` |
| native pull fails | retain Git's exit code; do not start pointer restoration |
| native pull succeeds but one restore fails | exit 4; preserve the successful pull and do not overwrite the conflicting path |
| cache miss or provider/authentication failure | restoration fails closed; the pointer remains available for a deliberate retry |

## Security

Every Git and `gh` invocation is an argument array with `shell=False`,
noninteractive credential prompting, bounded execution, and credential-shaped
output redaction. Push preflight is read-only and never downloads payloads.
Pull restoration reuses Cheap LFS's regular-file, no-symlink, unchanged-pointer,
size, whole-file SHA-256, part SHA-256, cache, quarantine, and no-overwrite
checks.

The wrapper does not infer consent for history rewriting or provider writes.
The typed push/pull command authorizes only native Git plus the documented
read-only preflight or verified materialization phase.

## Verification

Focused tests cover raw argv and `-c` passthrough; non-repository/subdirectory
working directories; both short aliases; native help/option parsing; forced
porcelain output; delimiter and missing-value handling; push versus pull
dry-run semantics; recursive-submodule refusal; oversized working files;
remote-base and full-history source scans; canonical working pointers;
hash-verified materialized payloads; repository-changing global refusal;
cache-backed pull restoration; native pull failure; and phase/exit reporting.
The full package suite, strict typing, Ruff, wheel smoke, and a real disposable
Linux bare-remote push/pull run remain part of the dated
[path-browser/wrapper manifest](../../verification/linux-tui-path-browser-wrapper-2026-07-27/run-manifest.md).
