# Multi-remote fetch sync

The repository toolbar's ordinary **Fetch** action now reflects the complete
configured topology. A checkout with more than one Git remote is fetched from
every configured remote, so a mirror or secondary provider does not quietly
remain stale while the button says it fetched `origin`.

> [!NOTE]
> Since the [MD3 shell](../design-system/md3-shell.md) landed, the toolbar band
> described below is behind **Settings → Appearance → Show the classic
> toolbar**, which ships **on**. Nothing here changed: the same Fetch action is
> also on the pane header of History, Changes and Branches, and in the pane
> menu, so the behaviour below is reachable with the band hidden.

## Behavior

- With one configured remote, the existing **Fetch `<remote>`** title and
  focused current/default/upstream selection remain unchanged.
- With more than one configured remote, the toolbar and its dropdown say
  **Fetch all remotes**. The action fetches every configured remote
  sequentially and reports progress across the whole set.
- The current remote, default remote, and upstream remote are placed first when
  they are available; the remaining configured remotes follow their Git
  configuration order. A remote name is fetched only once even when it serves
  more than one of those roles.
- Fetching does not pull, merge, push, rewrite refs, or change remote
  configuration. After the fetches finish, the existing ahead/behind
  calculation still uses the current branch's upstream.
- The status line keeps the existing last-fetch timestamp. For multiple
  remotes it additionally says that the action covers all configured remotes,
  so the button's compact appearance does not hide the changed scope.

## Configuration

There is no new preference. The scope is derived from the repository's live Git
configuration whenever remotes are loaded. Add, rename, update, set-default, or
remove remotes through the existing Remote Manager; the toolbar count and copy
refresh with the repository state.

## Failure modes and recovery

- A repository with no usable remote keeps the existing no-op behavior.
- Fetches run in a deterministic sequence. If a remote fails, the existing
  fetch operation reports that failure and does not pretend that later remotes
  were fetched; retrying the same action starts the configured sequence again.
- Authentication, transport, invalid URL, and repository-access failures are
  handled by the existing per-remote Git fetch path. No credential or raw URL
  is placed in the new toolbar label.
- A remote removed while the operation is being prepared is resolved against
  the current GitStore state before the fetch begins; the operation fails
  honestly rather than silently substituting another remote.

## Security considerations

The multi-remote decision is made in the GitStore from the already loaded local
remote records. The renderer receives only the remote count needed for truthful
copy; it does not receive new credentials, refspecs, or arbitrary Git command
arguments. Each fetch continues through the existing account-aware credential
selection and bounded progress path.

This feature adds no HTTP endpoint, so a Postman collection is not applicable.

## Verification

The focused regression coverage proves both sides of the behavior:

- `getRemotesToFetch` preserves the single-remote focused set;
- more than one configured remote includes every remote with current-first
  ordering; and
- the toolbar keeps **Fetch origin** for one remote and presents **Fetch all
  remotes** plus its expanded scope description for multiple remotes.

Run the focused suite with:

```text
node script/test.mjs app/test/unit/git-store-test.ts app/test/unit/ui/push-pull-button-test.tsx --test-concurrency=1
```

## Suggested articles

- [Remote management](../../readme-tabs/complete-feature-list.md) — change the
  configured remote set safely.
- [Automatic remote URL refresh](automatic-remote-url-refresh.md) — understand
  how provider renames and transfers update a tracked URL.
- [Reviewed batch repository sync](reviewed-batch-sync.md) — review fetch-only
  work across an exact set of repositories.
