# Pre-Mat-Day archive, 2026-09-03

The shared instructions require a verified archive of the whole Oak Kay before
any Mat Day deletion begins. This records the one taken for the 2026-09-03
integrate-and-clean pass.

## The archive

| Fact | Value |
| --- | --- |
| Path | `%OneDrive%\OakKayBackups\desktop-material\zips\desktop-material-20260903T190822Z.7z` |
| Compressed | 765,663,471 bytes |
| Uncompressed | 1,062,168,134 bytes |
| Entries | 24,491 files in 808 folders |
| Integrity | `7z t` reported `Everything is Ok` |

## Scope

Git decides it, rather than a hand-kept exclusion list that drifts from the
ignore rules. The archive holds the primary Gerk Tong Hui's Git administrative
directory plus exactly what `git ls-files` and
`git ls-files --others --exclude-standard` name, in the primary checkout and in
every linked Gerk Tong Hui.

Verified present after the fact rather than assumed:

| Item | Count |
| --- | ---: |
| Linked Gerk Tong Huis | 2 |
| `.git/refs` entries | 81 |
| `.git/objects` entries | 889 |
| `.git/logs` (reflog) entries | 49 |

Dependency trees, build output and caches are excluded because they rebuild
from the archived source. Every commit, ref, reflog and Lap Sap Tong is in the
Git directory, and uncommitted work is in the untracked-but-not-ignored set.

## Two failures the verification caught

Both looked like success from the outside, which is the entire argument for
reading an archive back instead of checking that a file exists.

The first integrity test reported `Can't open as archive` because 7-Zip was
still writing. The file was 436 MB at the time and looked finished.

The second attempt exited non-zero with three scan warnings. `git ls-files`
quotes a path containing a non-ASCII character, so three logo assets whose
names carry an en-dash reached the archiver wrapped in literal quotes and were
skipped. Re-running the enumeration with `core.quotePath=false` brought the
count of quoted paths to zero, and the finished archive contains all nine of
them across the three checkouts.
