# Submodule, subtree, and remote creation workflows

Repository Settings brings dependency topology into one workspace. The
Submodules surface can add, clone/update, synchronize, configure, remove, or
temporarily open a recorded submodule. The Subtrees surface discovers vendored
prefixes from history and can add, pull, push, or split them. The Add Submodule
dialog can also create an initialized GitHub or GitHub Enterprise repository
and immediately add its returned clone URL.

## Behavior and configuration

Submodule add offers hosted-provider browsing, a direct URL, or **Create
remote**. Every route reviews the repository-relative checkout path and an
optional tracked branch. Remote creation additionally reviews the exact
authenticated account, personal or loaded organization owner, repository name,
description, and public/private choice, with private selected by default. It
requests an initial commit so Git can clone the new repository immediately,
then runs the ordinary account-aware `git submodule add` path.

The URL route also offers a searchable **branch picker**. A "Load branches"
action beside the URL field (also triggered automatically the first time the
field blurs with a valid URL) runs `git ls-remote --symref` against the source
for `HEAD` and `refs/heads/*` — `--heads` alone would drop the HEAD symref
advertisement that names the remote default branch. While the listing loads a
polite live-region status is announced; the loaded list renders as a
`type="search"` filter input wired to the shared fuzzy/substring/regex filter
stack and full regex builder (surface id `add-submodule-branches`, plain-text
matching by default) above a select whose first entry is the remote default
branch, visibly marked as the default and pre-selected. Picking a branch
writes it into the free-text branch field; typing free text deselects the list
(a disabled "custom branch" indicator appears); picking the remote-default
entry clears the field so `git submodule add` runs without `-b`, exactly like
leaving the branch empty today. The listing is bound to the exact URL it was
loaded for and hides when the source changes. The free-text field always
remains usable as a manual override, and the Create remote route keeps its
existing no-branch behavior.

The Submodules manager shows URL, tracked branch, current object ID, and
initialized/up-to-date/out-of-date/conflicted state. Per-row actions retain
their own progress and review; the separate temporary-open workflow is
documented in [Temporary submodule repository
navigation](submodule-repository-navigation.md).

The Subtrees manager searches up to 400 recent commits with
`git-subtree-dir` trailers, keeps the newest record per prefix, and shows the
latest merge and split IDs. Add and pull can squash, with squash enabled by
default for add; pull and push select a remote or validated custom source and
ref. Split requires a reviewed local branch name and reports the resulting
split-head SHA.

## Persistence

Submodules use Git's normal `.gitmodules`, gitlink, checkout, and
`.git/modules` state. Add and remove leave ordinary staged changes for the user
to commit. A created remote is real provider state. If Git add fails afterward,
the dialog retains the created repository result for that retry and reuses its
clone URL rather than creating a duplicate.

When `.gitmodules` is staged but temporarily absent from the working tree,
Desktop restores that exact valid staged blob after destination validation and
before `git submodule add`. Commit-time Cheap LFS preparation excludes Git
metadata such as `.gitmodules` from pointer scanning, so the staged declaration
and gitlink commit normally instead of producing an unsafe-path error.

Subtrees are ordinary files and commits in the superproject. Their manager has
no separate topology database: it reconstructs known prefixes from the
`git-subtree-dir` and `git-subtree-split` trailers in repository history. Search
mode is local UI metadata; source, ref, squash, and split drafts are transient.

## Failure modes and recovery

Submodule add rejects duplicate paths, occupied files or non-empty folders,
absolute paths, parent traversal, `.git` segments, invalid branches, and stale
account or organization selections before mutation. Cancellation stops the
owned request/process. A remote-create failure never invokes Git.

The `.gitmodules` repair never overwrites an existing path, never invents
configuration, and does not run for an invalid destination. If the index has no
stage-0 blob or Git's config parser rejects that blob, the original Git error
remains visible. An empty but valid config is restored so Git can append the
first stanza. Handle metadata, write, and close failures all enter the same
cleanup path. The repair removes the file only when device/inode identity proves
it still owns that pathname; if identity cannot be established after a retry,
it preserves the path rather than risk deleting a concurrent replacement.

Branch listing is non-blocking in every failure mode. An unreachable or
unauthorized remote reports an inline `role="alert"` error and leaves manual
branch entry (and submission) fully working. An empty repository is a valid,
empty listing — the picker states the remote has no branches yet and the
submodule follows its future default branch. A remote advertising more than
5,000 heads is truncated at that bound with an explicit "showing the first N
branches" notice; malformed `ls-remote` lines are skipped rather than treated
as errors. A stale in-flight listing is aborted and sequence-guarded so it can
never overwrite a newer load, and an invalid search regex keeps every branch
visible while reporting the pattern error inline. Because a
cancelled provider request can have an uncertain server result, the dialog asks
the user to check the host before retrying; once a created result is known, a
later Git failure is reported separately and the next attempt does not recreate
the remote.

Subtree discovery errors remain visible and stale loads cannot overwrite a
newer refresh. If bundled Git does not provide `git subtree`, recorded prefixes
remain readable but add, pull, push, and split are disabled. A synchronous
manager-wide mutation lock prevents overlapping actions and fences settings
dismissal or navigation until the running Git operation settles; subtree
operations do not expose cancellation. Authentication or Git failures stay
with the exact row/action, ready for an explicit retry after recovery.

## Security considerations

Submodule destination validation resolves the physical repository boundary and
refuses traversal, sibling-prefix, symlink, junction, Git-metadata, duplicate,
file, and non-empty-directory targets. Git receives the source, branch, and path
as positional argv with an option separator, and account identity is passed to
the credential trampoline rather than embedded in a URL.

Branch listing revalidates the source URL (`getSubmoduleSourceError`) before
spawning Git, passes it after the `--` separator, uses the same
remote-operation environment and credential trampoline as the add itself, and
honours an `AbortSignal` that kills the spawned process. The parsed branch
list is bounded at 5,000 entries so a degenerate or adversarial remote cannot
balloon renderer state. User-authored search patterns are compiled by the
vetted RE2 engine (linear-time, no catastrophic backtracking) with the shared
pattern- and input-length bounds; branch names and patterns are evaluated
locally and never transmitted.

Create remote accepts only an authenticated GitHub-family account and an owner
from the loaded account data. Repository name and description are length- and
character-bounded, provider cancellation is forwarded, and an unusable returned
clone URL is never passed to Git. Subtree prefixes must be forward-slash
relative paths with no empty, current, parent, drive, or absolute segments;
provider-backed operations use the selected account and existing bounded Git
progress path. Every submodule and subtree mutation also rechecks the temporary
submodule workspace boundary immediately before Git runs.

## Verification

`submodule-add-test.ts` and `add-submodule-dialog-test.tsx` cover source,
branch, physical-path and occupied-target validation, provider/account
selection, review, progress, cancellation, and responsive controls. The dialog
suite also proves the branch picker: on-demand and blur-triggered loading (once
per URL), default-branch pre-selection and its empty `-b` semantics,
picker/free-text synchronization, filter narrowing with an honest no-match
message, inline non-blocking load failures, and empty/truncated listings.
`ls-remote-heads-test.ts` covers the pure `ls-remote --symref` parser: branch
heads, the HEAD symref default, CRLF and SHA-256 output, malformed and
out-of-scope lines, empty repositories, and the truncation cap.
`collection-surface-registry-test.ts` audits the `add-submodule-branches`
search surface's one-to-one binding with the shared filter control and regex
builder.
`submodule-remote-creation-test.ts` covers initialized public/private creation,
organization ownership, strict metadata, cancellation uncertainty, unusable
clone URLs, and no API call for invalid input. The dialog suite also proves
that failed Git add retries reuse the created remote.
`git/submodule-test.ts` proves the exact staged `.gitmodules` blob is restored
only while the working file is absent. `cheap-lfs/pointer-test.ts` proves normal
commit-time pointer scans exclude Git metadata while retaining safe payload and
gitlink paths.

`git/subtree-test.ts` covers prefix validation, trailer discovery,
account-aware add/pull/push argv, progress, split results, and capability
probing. `subtree-manager-test.tsx` covers discovery, filtering, row editors,
squash and custom-source choices, stale loads, busy-state isolation, errors,
refresh, and the unavailable-command fallback.
