import { IRemote } from '../models/remote'

/**
 * The web page of one configured remote: where "View on …" sends the browser.
 */
export interface IRemoteWebPage {
  /** The remote's name in the repository's configuration, e.g. `origin`. */
  readonly remoteName: string

  /** The page to open, always http(s), never carrying a user name or token. */
  readonly url: string

  /**
   * The service the page belongs to, for button text: "GitHub", "GitLab",
   * "Bitbucket", "Azure DevOps", "Codeberg", "Gitea", "SourceHut",
   * "AWS CodeCommit", "Hugging Face", or the host name for anything else.
   */
  readonly hostName: string

  /** The page without its scheme, e.g. `github.com/owner/repo`. */
  readonly displayUrl: string
}

const schemePattern = /^([a-z][a-z\d+.-]*):\/\//i

// Git's scp-like syntax: `[user@]host:path`. A host of one character is a
// Windows drive letter (`C:\repo`, `C:/repo`), which is a local path.
const scpLikePattern = /^(?:[^@/\\\s]+@)?([^@:/\\\s]{2,}):(?!\/\/)(.+)$/

const sshSchemes = new Set(['ssh', 'git+ssh', 'ssh+git', 'git'])

/**
 * The web page of the repository a Git remote URL points at, or `null` when the
 * remote has no web page: a local path, a `file:` URL, a helper transport such
 * as `codecommit::`, or text that is not a URL at all.
 *
 * User names, passwords, access tokens, queries and fragments are never
 * carried over. An SSH remote opens the HTTPS page of the same host (its SSH
 * port is not the web port); an HTTP(S) remote keeps its own scheme and port,
 * so a self-hosted server on `http://host:3000` opens there.
 */
export function getRemoteWebUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim()
  if (
    trimmed.length === 0 ||
    /[\s\0]/.test(trimmed) ||
    // `<transport>::<address>` hands the remote to a helper (codecommit::,
    // persistent-https::, …); its address is not a web location.
    /^[a-z][a-z\d+.-]*::/i.test(trimmed)
  ) {
    return null
  }

  let protocol: 'http:' | 'https:'
  let host: string
  let path: string
  let sshPort = ''

  const scheme = schemePattern.exec(trimmed)?.[1].toLowerCase()
  if (scheme !== undefined) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }

    if (scheme === 'http' || scheme === 'https') {
      protocol = scheme === 'http' ? 'http:' : 'https:'
      host = parsed.host
    } else if (sshSchemes.has(scheme)) {
      protocol = 'https:'
      host = parsed.hostname
      sshPort = parsed.port
    } else {
      return null
    }
    path = parsed.pathname
  } else {
    const match = scpLikePattern.exec(trimmed)
    if (match === null) {
      return null
    }
    protocol = 'https:'
    host = match[1]
    path = match[2].split(/[?#]/, 1)[0]
  }

  if (host.length === 0) {
    return null
  }

  const segments = path
    .split('/')
    .filter(s => s.length > 0)
    .map(s => safeDecode(s))
  if (segments.length > 0) {
    const last = segments[segments.length - 1].replace(/\.git$/i, '')
    if (last.length === 0) {
      segments.pop()
    } else {
      segments[segments.length - 1] = last
    }
  }
  if (segments.length === 0) {
    return null
  }

  const page = rewriteKnownHosts(
    host.toLowerCase(),
    segments,
    scheme === 'http' || scheme === 'https',
    sshPort
  )
  let url: URL
  try {
    url = new URL(
      `${protocol}//${page.host}/${page.segments
        .map(s => encodeURIComponent(s))
        .join('/')}`
    )
  } catch {
    return null
  }

  url.username = ''
  url.password = ''
  url.search = page.search ?? ''
  url.hash = ''
  return url.toString()
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

interface IPageLocation {
  readonly host: string
  readonly segments: ReadonlyArray<string>
  readonly search?: string
}

/**
 * Services whose clone URLs and web pages are not shaped the same way.
 */
function rewriteKnownHosts(
  host: string,
  segments: ReadonlyArray<string>,
  overHttp: boolean,
  sshPort: string
): IPageLocation {
  // Azure DevOps over SSH: ssh.dev.azure.com:v3/org/project/repo
  if (host === 'ssh.dev.azure.com' && segments[0] === 'v3') {
    const [, org, project, repo] = segments
    if (org && project && repo) {
      return { host: 'dev.azure.com', segments: [org, project, '_git', repo] }
    }
  }

  // Older Azure DevOps over SSH: vs-ssh.visualstudio.com:v3/org/project/repo
  if (host === 'vs-ssh.visualstudio.com' && segments[0] === 'v3') {
    const [, org, project, repo] = segments
    if (org && project && repo) {
      return {
        host: `${org.toLowerCase()}.visualstudio.com`,
        segments: [project, '_git', repo],
      }
    }
  }

  // AWS CodeCommit: git-codecommit.<region>.amazonaws.com/v1/repos/<name>
  const codeCommit = /^git-codecommit\.([a-z\d-]+)\.amazonaws\.com$/.exec(host)
  if (codeCommit !== null && segments[0] === 'v1' && segments[1] === 'repos') {
    const region = codeCommit[1]
    const name = segments[2]
    if (name) {
      return {
        host: `${region}.console.aws.amazon.com`,
        segments: ['codesuite', 'codecommit', 'repositories', name, 'browse'],
        search: `?region=${encodeURIComponent(region)}`,
      }
    }
  }

  // Bitbucket Data Center clones over HTTP(S) from /scm/<PROJECT>/<repo> and
  // over SSH from port 7999 by default; its pages live under
  // /projects/<PROJECT>/repos/<repo>, or /users/<user>/repos/<repo> for a
  // personal repository (~<user>).
  if (!wellKnownHosts.has(host)) {
    const dataCenter =
      overHttp && segments[0] === 'scm' && segments.length === 3
        ? segments.slice(1)
        : sshPort === '7999' && segments.length === 2
          ? segments
          : null
    if (dataCenter !== null) {
      const [owner, repo] = dataCenter
      return owner.startsWith('~')
        ? { host, segments: ['users', owner.slice(1), 'repos', repo] }
        : { host, segments: ['projects', owner.toUpperCase(), 'repos', repo] }
    }
  }

  return { host, segments }
}

/** Public services whose paths are never Bitbucket Data Center paths. */
const wellKnownHosts = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'gitea.com',
  'dev.azure.com',
  'huggingface.co',
])

/** The host name of a web page, without its port, or `null` if unparseable. */
export function getRemoteWebHost(webUrl: string): string | null {
  try {
    return new URL(webUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The service a web page belongs to, for "View on …" text. A host this does not
 * recognise is shown as itself, so a self-hosted server reads as its own name.
 *
 * `gitHubHosts` names hosts already known to be GitHub, such as the GitHub
 * Enterprise Server the repository's GitHub details came from, which a host
 * name alone cannot reveal.
 */
export function getRemoteHostName(
  webUrl: string,
  gitHubHosts: ReadonlyArray<string> = []
): string {
  let host: string
  try {
    host = new URL(webUrl).host.toLowerCase()
  } catch {
    return webUrl
  }
  const hostname = host.replace(/:\d+$/, '')

  if (
    gitHubHosts.some(h => h.toLowerCase() === hostname) ||
    hostname === 'github.com' ||
    hostname.endsWith('.ghe.com') ||
    hostname.startsWith('github.')
  ) {
    return 'GitHub'
  }
  if (hostname === 'gitlab.com' || hostname.startsWith('gitlab.')) {
    return 'GitLab'
  }
  if (hostname === 'bitbucket.org' || hostname.startsWith('bitbucket.')) {
    return 'Bitbucket'
  }
  if (hostname === 'dev.azure.com' || hostname.endsWith('.visualstudio.com')) {
    return 'Azure DevOps'
  }
  if (hostname === 'codeberg.org') {
    return 'Codeberg'
  }
  if (hostname === 'gitea.com' || hostname.startsWith('gitea.')) {
    return 'Gitea'
  }
  if (hostname === 'sr.ht' || hostname.endsWith('.sr.ht')) {
    return 'SourceHut'
  }
  if (hostname.endsWith('.console.aws.amazon.com')) {
    return 'AWS CodeCommit'
  }
  if (hostname === 'huggingface.co') {
    return 'Hugging Face'
  }
  return host
}

/**
 * The web page of every remote that has one, in the order the remotes are
 * configured, with `preferredRemoteName` (the remote "View on …" should open
 * by default) moved to the front when it is among them. Two remotes that point
 * at the same page are both kept, because each is its own choice by name.
 */
export function getRemoteWebPages(
  remotes: ReadonlyArray<IRemote>,
  preferredRemoteName?: string | null,
  gitHubHosts: ReadonlyArray<string> = []
): ReadonlyArray<IRemoteWebPage> {
  const pages = new Array<IRemoteWebPage>()
  for (const remote of remotes) {
    const url = getRemoteWebUrl(remote.url)
    if (url === null) {
      continue
    }
    pages.push({
      remoteName: remote.name,
      url,
      hostName: getRemoteHostName(url, gitHubHosts),
      displayUrl: url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''),
    })
  }

  const preferred = pages.findIndex(p => p.remoteName === preferredRemoteName)
  if (preferred > 0) {
    const [page] = pages.splice(preferred, 1)
    pages.unshift(page)
  }
  return pages
}
