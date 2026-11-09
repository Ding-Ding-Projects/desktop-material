# Opening a folder adds the repository directly

When a folder reaches Desktop Material from outside the app, a Git repository
in that folder is added to the repository list and selected straight away. The
**Add local repository** dialog no longer opens first and waits for a click on
**Add repository**.

## Where this applies

Every route that hands the app a folder to open uses this path:

- **Open in Desktop Material** from the Windows Explorer context menu, on a
  folder or on a folder's background.
- `GitHubDesktop.exe --cli-open=<folder>`, which other apps such as Monitoring
  Tools use, and the `desktop-material [path]` or `desktop-material open [path]`
  command-line helper.
- **Open in full app** from a quick-action window, including the fallback when a
  quick-action window fails to load.

## Behavior

1. The folder is checked with Git. A folder inside a repository resolves to the
   repository's top folder, so opening `repo\src\deep` opens `repo`.
2. A repository already in the list is selected. Nothing is added twice.
3. A linked worktree of a repository already in the list switches that
   repository to the worktree, as before.
4. Any other real Git repository is added, the repository list closes, and the
   new repository is selected and opens in its tab. This is the same work as
   confirming **Add repository** in the dialog: its remotes are read, its GitHub
   details are looked up, and a repository that uses Git LFS still gets the
   **Initialize Git LFS** prompt.
5. The **Add local repository** dialog still opens, with the folder filled in,
   for a folder that is not a usable repository: not a repository at all, a
   bare repository, or a repository Git does not trust because another user
   owns it. The dialog explains which one it is and offers the way forward
   (create a repository there, or trust the folder).

A selection made this way is remembered for the next launch, unless the action
that opened it asked not to keep it (`persistSelection: false`, which **Open in
new window** uses so the first window keeps its own selection).

## Failure modes

- If Git cannot read the folder at all, the folder is treated as not a
  repository and the dialog opens with the reason.
- If adding fails after the check (the folder disappeared in between, for
  example), the usual error for an invalid repository path is shown, nothing is
  selected, and no dialog opens on top of the error.
- A network share, mapped drive or WSL path is added like any other folder; see
  [Network and WSL repository paths](network-and-wsl-repository-paths.md) for
  what happens when that location goes offline later.

## Security considerations

Only a folder that Git itself reports as a regular, trusted working tree is
added without the dialog. A repository owned by another user (Git's
`safe.directory` check) always goes through the dialog, where trusting it is an
explicit, separate choice. Nothing in the folder is changed: adding a repository
only records its path in the app's own list.

## Verification

`app/test/unit/cli-open-adds-repository-test.ts` runs the real open action
against repositories created on disk and checks that:

- a repository not in the list is added and selected, the list foldout closes,
  the add is recorded, and no dialog opens;
- a folder inside a repository adds the repository's top folder;
- `persistSelection: false` is honored;
- a repository already in the list is selected without being added again;
- a plain folder still opens the dialog with its path;
- a failed add selects nothing and opens no dialog.
