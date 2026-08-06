# Repository transfer

**Transfer repository** moves a GitHub-backed repository into a repository owned
by another signed-in GitHub account or organization. It is available from the
Repository menu, the repository-list context menu, Command Palette, and
**Repository settings → Remote**.

## Behavior

The dialog keeps the source repository visible beside the destination route and
lets the user:

- choose an existing GitHub account and a personal or organization owner;
- open the existing GitHub or GitHub Enterprise sign-in flow to add another
  account without copying a token into the renderer;
- keep the source repository name or enter a validated custom name;
- keep the destination private; and
- choose **Full history** or **Clean state** before a two-confirmation,
  full-range authorization step.

Full-history transfer requires a clean worktree; clean-state transfer instead
snapshots the current tracked and untracked files that Git can commit. Neither
mode may run inside a merge, squash, rebase, or cherry-pick operation. The
provider repository is created only after those checks pass.

### Full history

Full-history mode makes a temporary local bare clone, points that temporary
clone at the new destination, and pushes every local branch and tag. The
destination branch is verified with `git ls-remote` before the local checkout
is changed. Existing history therefore remains available in the destination,
including branches and tags that are not the current branch.

### Clean state

Clean-state mode makes one new root commit from the current files and pushes it
to the current branch. Before changing the branch, the old tip is retained in
a local recovery ref under
`refs/desktop-material/transfer-backups/`. If publication fails, the branch and
checkout are restored and the recovery ref remains available for inspection or
manual recovery. The stable snapshot commit message is
`Create clean repository transfer snapshot`.

### Remote topology

`origin` is retargeted only after the destination push and branch verification
succeed. If the source had an `origin` and no `upstream`, its fetch URL becomes
`upstream` so the source remains reachable; an explicit source push URL is
preserved on that upstream remote. The new destination becomes `origin`, and a
previous explicit origin push URL is updated to the destination rather than
silently continuing to publish to the old repository. A partial local remote
edit is rolled back when Git permits it.

## Configuration

There is no separate preference. Destination accounts come from the existing
account store, and the sign-in button uses the source repository's GitHub.com or
GitHub Enterprise endpoint. The chosen owner, name, privacy, and mode are
reviewed in the dialog and are not persisted as a second credential or hidden
remote setting.

## Failure modes

- A dirty worktree stops full-history transfer, while clean-state transfer
  intentionally includes the current Git-visible changes. A detached or
  unborn clean-state checkout, or any in-progress Git operation, stops before
  the provider is called.
- Non-GitHub accounts and repositories without GitHub metadata are rejected;
  the current implementation does not guess a provider-specific transfer API.
- An organization lookup failure leaves the personal namespace available and
  reports the lookup error inline.
- Provider creation or publication can succeed before a later local step fails.
  The error names that possibility; the destination is never presented as
  absent, and the local remote is not claimed to have changed unless the local
  mutation completed.
- A push or verification failure leaves `origin` at its previous URL. Clean
  state also restores the previous branch tip, while retaining its recovery
  ref as an audit trail.

## Security and privacy

Git credentials are routed through the selected account's existing credential
key and are not embedded in a clone URL, progress message, error detail, or
history record. Temporary full-history data is removed after publication. The
clean-state recovery ref stays local. Repository names are bounded and allow
only provider-safe letters, numbers, dots, dashes, and underscores; the
destination owner is selected from the provider response rather than typed
into an API path.

## Verification

The focused transfer contract tests cover name validation, both modes, the
second-account sign-in path, the two confirmation controls, the authorization
slider, recovery refs, remote preservation, and menu/Command Palette discovery.
Run them with:

```text
node --import tsx --test app/test/unit/repository-transfer-test.ts app/test/unit/repository-transfer-surface-test.ts
```

The exact Windows production build and isolated hidden-desktop acceptance are
the remaining runtime gates for this feature. The repository-wide test harness
also needs its existing dependency-tree correction before it can load these
tests; the focused direct Node run is the current local proof.

## Suggested articles

- [Publish organization picker](publish-organization-picker.md) — choose a
  personal or organization owner.
- [Automatic remote URL refresh](automatic-remote-url-refresh.md) — understand
  how later provider renames and transfers update a tracked remote safely.
- [Commit and push all repositories](commit-and-push-all.md) — publish ordinary
  local work without changing repository ownership.

This feature adds no HTTP endpoint, so no Postman collection is applicable.
