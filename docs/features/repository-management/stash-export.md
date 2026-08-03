# Stash export and recovery dialog

The Stash Manager's separate non-blocking dialog has Manage, Export, History,
and Appearance and voice tabs. Export searches names, branch associations, and
exact stash object IDs with the shared plain-text/regex builder. Selection is
multi-item and supports selecting or inverting the visible matches.

## Formats and configuration

- **Directory copy** creates a timestamped folder containing a manifest, one
  metadata file per stash, and exact working-tree, index-tree, and untracked
  parent snapshots where Git provides them.
- **ZIP** creates the same structure as one archive.
- **7z** exposes method, level, dictionary, match finder, fast bytes, solid
  mode, thread count, split volumes, password, and encrypted headers. Header
  encryption is enabled only when a password is present, so filenames are not
  accidentally advertised as protected.

Passwords are held only for the active export request. They are not written to
stash metadata, manifests, logs, or the local Git history. Archive paths are
chosen through the native picker and extracted temporary paths are checked to
remain inside the exporter-owned directory.

## Failure modes and recovery

The exact stash object ID is exported, so later `stash@{n}` movement cannot
silently change what a recovery set means. A failed Git archive, missing
7-Zip executable, cancelled operation, invalid destination, or unsafe archive
path is reported in the panel and leaves the source stash untouched. ZIP and
directory export remain available when 7-Zip is not installed.

The History tab keeps the name, branch, and object ID visible before a user
reviews a restore or discard action. The dialog's progress state disables the
submitting control and rejects re-entry; failures remain as an accessible
alert rather than an interrupting information dialog.

## Verification

`app/test/unit/git/stash-export-test.ts` verifies the complete 7z argument
mapping, split volumes, password handling, and the requirement that encrypted
headers never activate without a password. The existing Git stash and manager
suites cover named entries, exact identity checks, conflicts, recovery, and
live language switching. Production webpack compilation and hidden Windows
desktop capture now prove the centered dialog, all four tabs, and the complete
7z control surface. The fixture also created a real named Git stash; the final
inventory screenshot did not refresh its row before capture, so the Git
command result is the authoritative named-stash operation evidence.

## Suggested articles

- [Named multi-stash manager](named-stash-manager.md)
- [External stash interoperability](external-stash-interoperability.md)
- [Selective stashes](selective-stashes.md)
