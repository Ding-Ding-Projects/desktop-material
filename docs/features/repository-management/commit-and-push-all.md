# Commit and push all repositories

One action that walks every repository Desktop Material knows about, pulls it,
commits everything in its working directory under a single message you supply,
and pushes the result. It is reached from the repository list's overflow menu,
beside **Sync repositories**.

Since August 2026 the action is no longer all-or-nothing: the confirmation step
lists every repository with local work as a checkbox, above a search bar, and
runs exactly the ones left ticked.

## Behavior

**Choosing what runs.** Every repository that has uncommitted changes or
unpushed commits appears ticked. Untick any you do not want touched. The
confirm button counts what will actually run — `Commit & push all` when nothing
has been unticked, `Commit & push 4` otherwise — and is disabled when the count
reaches zero or the commit message is blank.

**Searching.** The search bar filters by repository name. Plain text is the
default; the adjacent control opens the project's
[regex builder](../identity-and-workspace/collection-bulk-and-regex-safety.md) anchored to that field, and
applying a pattern from it switches this search to regex mode. An invalid
pattern is reported in an alert beside the field rather than silently matching
everything.

**Select shown / Clear shown** act on the repositories the search is currently
displaying and never on the ones it is hiding. This is deliberate: a bulk
action that reaches past a filter is how a filtered list ends up committing
something the person driving it could not see. Tick states for hidden
repositories survive any amount of searching.

**Running.** Up to three repositories are processed at a time. Each is pulled
first — through the same conflict-safe pull the Pull all action uses, which
fails a repository rather than committing a conflicted tree — then all of its
changes are committed with your message, then pushed. A clean repository is
skipped and says so. A failure in one repository never stops the others, and
every repository ends with a final status of Done, Skipped or Failed.

The dialog can be dismissed while a run is in flight; the run continues, and
reopening the dialog re-attaches to it rather than starting a second one.

## Configuration

There is nothing to configure. The concurrency limit of three, the pull-first
ordering and the skip-if-clean rule are fixed. The commit message is required
and is applied verbatim to every repository in the run.

## Failure modes

| Situation | What happens |
| --- | --- |
| Repository has no local work | Skipped, with "Repository is clean" as its detail |
| Repository was removed from Desktop between confirming and running | Skipped, with "Repository was removed." |
| Repository's folder is missing on disk | Skipped, with "Repository is missing." |
| Pull produces a merge conflict | That repository fails; nothing is committed in it |
| Push is rejected | That repository fails after its commit landed locally |
| An invalid regex is typed in the search | The list is left intact and the error is announced; nothing is filtered out |
| Every repository is unticked | The confirm button is disabled; the run cannot start |

An empty selection passed to the store runs nothing. It deliberately does not
fall back to "all repositories" — the whole point of unticking is that those
repositories must not be touched.

## Security considerations

The action commits every file in each selected repository's working directory,
including files you have not reviewed. It is a bulk convenience, not a review
step. Repository-level `.gitignore` rules still apply, and Cheap LFS pointer
preparation still runs ahead of the commit, so an oversized file is handled the
same way it would be in a single-repository commit.

The search evaluates locally under the regex guard's pattern, input and
backtracking bounds; no query or repository name leaves the machine.

## Verification

`app/test/unit/commit-and-push-all-dialog-test.tsx` covers the dialog:

- the affected repositories are listed and a blank message disables confirming;
- unticking a repository removes it from the ids handed to the store, and the
  confirm button's count follows;
- filtering by name hides non-matching rows, and **Clear shown** leaves the
  hidden repositories ticked and running;
- an empty affected list offers no message field and never calls the store.

Run them with:

```bash
node script/test.mjs app/test/unit/commit-and-push-all-dialog-test.tsx
```

## Known gap

This dialog is hard-coded English throughout, including the controls described
above. It predates the change that added repository selection and has not yet
been routed through the language modes or the funny-level sliders. This is
recorded in `HANDOFF.md`.

## Suggested articles

- [Automatic commit and push batching](automatic-commit-push-batching.md) — the
  byte and file-count ceilings each push in this run is subject to.
- [Release-backed Cheap LFS](release-backed-cheap-lfs.md) — what happens to a
  large file before an ordinary commit measures it.
- [Collection bulk actions and regex safety](../identity-and-workspace/collection-bulk-and-regex-safety.md)
  — the shared pattern constructor and the bounds every search surface evaluates
  under.
