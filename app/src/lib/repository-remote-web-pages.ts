import { Repository, getGitHubHtmlUrl } from '../models/repository'
import { IRemote } from '../models/remote'
import {
  IRemoteWebPage,
  getRemoteWebHost,
  getRemoteWebPages,
  getRemoteWebUrl,
} from './remote-web-page'

/**
 * Every remote of a repository that has a web page, default first.
 *
 * The default is the remote whose page "View on GitHub" has always opened
 * (the parent repository when contributing to it), then the repository's
 * current remote, then the first remote in configuration order.
 */
export function getRepositoryRemoteWebPages(
  repository: Repository,
  remotes: ReadonlyArray<IRemote>,
  currentRemoteName: string | null
): ReadonlyArray<IRemoteWebPage> {
  const gitHubPageUrl = getGitHubHtmlUrl(repository)
  const gitHubRemote =
    gitHubPageUrl === null
      ? undefined
      : remotes.find(
          r =>
            getRemoteWebUrl(r.url)?.toLowerCase() ===
            gitHubPageUrl.toLowerCase()
        )
  const gitHubHost =
    gitHubPageUrl === null ? null : getRemoteWebHost(gitHubPageUrl)

  return getRemoteWebPages(
    remotes,
    gitHubRemote?.name ?? currentRemoteName,
    gitHubHost === null ? [] : [gitHubHost]
  )
}

/**
 * What the Repository menu's "View on …" item opens: the GitHub page exactly
 * as before when the repository is on GitHub, otherwise the default remote's
 * page. `null` when the repository has neither.
 */
export function getDefaultRemoteWebPage(
  repository: Repository,
  remotes: ReadonlyArray<IRemote>,
  currentRemoteName: string | null
): { readonly url: string; readonly hostName: string } | null {
  const gitHubPageUrl = getGitHubHtmlUrl(repository)
  if (gitHubPageUrl !== null) {
    return { url: gitHubPageUrl, hostName: 'GitHub' }
  }

  const [page] = getRepositoryRemoteWebPages(
    repository,
    remotes,
    currentRemoteName
  )
  return page === undefined ? null : { url: page.url, hostName: page.hostName }
}
