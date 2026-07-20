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

Subtrees are ordinary files and commits in the superproject. Their manager has
no separate topology database: it reconstructs known prefixes from the
`git-subtree-dir` and `git-subtree-split` trailers in repository history. Search
mode is local UI metadata; source, ref, squash, and split drafts are transient.

## Failure modes and recovery

Submodule add rejects duplicate paths, occupied files or non-empty folders,
absolute paths, parent traversal, `.git` segments, invalid branches, and stale
account or organization selections before mutation. Cancellation stops the
owned request/process. A remote-create failure never invokes Git. Because a
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
selection, review, progress, cancellation, and responsive controls.
`submodule-remote-creation-test.ts` covers initialized public/private creation,
organization ownership, strict metadata, cancellation uncertainty, unusable
clone URLs, and no API call for invalid input. The dialog suite also proves
that failed Git add retries reuse the created remote.

`git/subtree-test.ts` covers prefix validation, trailer discovery,
account-aware add/pull/push argv, progress, split results, and capability
probing. `subtree-manager-test.tsx` covers discovery, filtering, row editors,
squash and custom-source choices, stale loads, busy-state isolation, errors,
refresh, and the unavailable-command fallback.
