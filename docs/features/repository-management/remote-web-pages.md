# Repository pages for every remote

**View on GitHub** used to work only for a repository whose remote is on GitHub.
It now opens the web page of any remote that has one, on GitHub, GitLab,
Bitbucket, Azure DevOps, Codeberg, Gitea, SourceHut, AWS CodeCommit, Hugging
Face or a self-hosted server, and lets you pick the remote when a repository has
more than one.

## Where it appears

- **No local changes.** The suggested action beside the editor and file manager
  actions:
  - One remote on GitHub: unchanged, **View on GitHub** with the Repository menu
    and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> shown beside it.
  - One remote elsewhere: **Open the repository page on GitLab in your browser**
    with a **View on GitLab** button (the service name, or the server's own host
    name such as `git.example.com`).
  - Several remotes with web pages: a **Remote** dropdown list box lists every
    one as `name (host/path)`, for example `upstream (gitlab.com/team/app)`. The
    button follows the pick (**View on GitHub**, **View on GitLab**, …) and
    opens that remote's page.
- **Repository → View on …** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>).
  The item is named after the service it opens and is enabled for any remote
  with a web page. A repository on GitHub opens its GitHub page exactly as
  before (the parent repository when you contribute to it); otherwise the
  default remote's page opens.
- **Command palette.** "View on GitHub" is also found by searching for remote,
  web page, browser, GitLab, Bitbucket, Gitea, Codeberg or Azure DevOps.

## Which remote is the default

The dropdown starts on, and the menu opens:

1. the remote whose page **View on GitHub** has always opened, when the
   repository is on GitHub;
2. otherwise the repository's current remote (usually `origin`);
3. otherwise the first remote in the repository's configuration.

A pick in the dropdown lasts while that repository stays selected.

## How a remote URL becomes a page

| Remote URL | Page |
| --- | --- |
| `https://github.com/owner/repo.git` | `https://github.com/owner/repo` |
| `git@gitlab.com:group/subgroup/project.git` | `https://gitlab.com/group/subgroup/project` |
| `ssh://git@git.example.com:2222/team/app.git` | `https://git.example.com/team/app` (an SSH port is not the web port) |
| `http://203.0.113.5:3000/me/notes.git` | `http://203.0.113.5:3000/me/notes` (an HTTP remote keeps its scheme and port) |
| `git@ssh.dev.azure.com:v3/org/project/repo` | `https://dev.azure.com/org/project/_git/repo` |
| `https://git-codecommit.eu-west-1.amazonaws.com/v1/repos/name` | the repository in the AWS console for that region |
| `https://bitbucket.example.com/scm/plat/api.git` | `https://bitbucket.example.com/projects/PLAT/repos/api` (Bitbucket Data Center; also from its SSH port 7999) |

A remote has no page, and is left out of the list, when it is a local path, a
`file:` URL, a network share, or a remote helper address such as
`codecommit::region://name`. If no remote has a page, nothing is offered beyond
the existing GitHub action.

## Security considerations

- A user name, password or access token in a remote URL
  (`https://user:token@host/…`) is removed before the page is shown or opened,
  together with any query string and fragment. Tests check that a token never
  reaches the dropdown or the browser.
- Only `http` and `https` pages are ever opened, through the app's normal
  browser route, so the usual external-link handling applies.
- Remote URLs are read from the repository's own configuration; nothing is
  fetched to build the list.

## Failure modes

- A remote that points somewhere without a matching web page (an unusual server
  layout) opens that host's path as given; the server's own "not found" page is
  what you see.
- A host the app does not recognise is named by its host name rather than a
  guessed service name.

## Verification

- `app/test/unit/remote-web-page-test.ts`: 25 remote URL forms and their pages,
  credential and query removal, 16 inputs that must give no page, service names
  for 17 hosts plus a GitHub Enterprise host, ordering, and the default remote.
- `app/test/unit/ui/no-changes-remote-pages-test.tsx` renders the real card:
  every remote in the dropdown, the button following the pick and opening the
  picked page, starting on the current remote, a single non-GitHub remote
  without a dropdown, no token in the text, and nothing for remotes without a
  page.
