/**
 * Serialization for the repository-list export/import feature. The exported file
 * contains only remote clone URLs — never local paths, account tokens, or any
 * other identity — honouring the privacy contract in MATERIAL_REDESIGN.md.
 */

/** The on-disk format version of a repository list file. */
export const RepoListFileVersion = 1

/** A single exported repository, identified solely by its clone URL. */
export interface IRepoListEntry {
  readonly url: string
}

/** The shape of the exported/imported repository list file. */
export interface IRepoListFile {
  readonly version: typeof RepoListFileVersion
  /** ISO-8601 timestamp of when the file was written. */
  readonly exportedAt: string
  readonly repositories: ReadonlyArray<IRepoListEntry>
}

/**
 * Strip any userinfo (`user[:password]@`) from an http(s) URL and discard its
 * query and fragment. Clone URLs do not need either field, and query strings
 * are a common place for access tokens to hide. SSH URLs (`git@host:o/r.git`)
 * are left untouched since the leading `git@` is the standard SSH user, not a
 * secret.
 */
export function sanitizeRemoteUrl(url: string): string {
  const trimmed = url.trim()
  const withoutQueryOrFragment = trimmed.split(/[?#]/, 1)[0]
  return withoutQueryOrFragment.replace(/^(https?:\/\/)[^/@]*@/i, '$1')
}

/**
 * Whether a value is a portable remote clone URL suitable for a transfer file.
 * Local paths and file URLs are intentionally excluded: importing a list must
 * never turn an exported remote recipe into a local filesystem operation.
 */
export function isPortableCloneUrl(url: string): boolean {
  const trimmed = sanitizeRemoteUrl(url)
  if (trimmed.length === 0 || /[\s\\]/.test(trimmed)) {
    return false
  }

  // Git's scp-like SSH form has no URI scheme but is a portable clone URL.
  if (/^[^/@:]+@[^/:]+:.+$/.test(trimmed)) {
    return true
  }

  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(trimmed)?.[1].toLowerCase()
  if (
    scheme === undefined ||
    !['http', 'https', 'ssh', 'git+ssh', 'git'].includes(scheme)
  ) {
    return false
  }

  if (scheme === 'git' && !trimmed.startsWith('git://')) {
    // Retain the legacy `git:host/owner/repository` spelling supported by
    // the app's remote parser, while rejecting bare `git:C:\...` paths.
    return /^git:[^/:]+\/.+$/.test(trimmed)
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname.length === 0 || parsed.password.length > 0) {
      return false
    }
    return !(
      parsed.username.length > 0 &&
      scheme !== 'ssh' &&
      scheme !== 'git+ssh'
    )
  } catch {
    return false
  }
}

/**
 * Normalize a list of clone URLs: trim, sanitize tokens, drop blanks, and
 * de-duplicate (case-insensitive) while preserving first-seen order.
 */
export function normalizeRepoUrls(
  urls: ReadonlyArray<string>
): ReadonlyArray<string> {
  const seen = new Set<string>()
  const result = new Array<string>()

  for (const raw of urls) {
    const url = sanitizeRemoteUrl(raw)
    if (url.length === 0 || !isPortableCloneUrl(url)) {
      continue
    }

    const key = url.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(url)
  }

  return result
}

/** Serialize a list of clone URLs to the pretty-printed export file format. */
export function serializeRepoList(
  urls: ReadonlyArray<string>,
  exportedAt: Date = new Date()
): string {
  const repositories = normalizeRepoUrls(urls).map(url => ({ url }))
  const file: IRepoListFile = {
    version: RepoListFileVersion,
    exportedAt: exportedAt.toISOString(),
    repositories,
  }
  return JSON.stringify(file, null, 2) + '\n'
}

/**
 * Parse a repository list file, returning null when the payload is missing, is
 * not valid JSON, has an unsupported version, or is otherwise structurally
 * corrupt. URLs are sanitized and de-duplicated on the way in.
 */
export function parseRepoList(raw: string): IRepoListFile | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== RepoListFileVersion
  ) {
    return null
  }

  const repositories = (parsed as { repositories?: unknown }).repositories
  if (!Array.isArray(repositories)) {
    return null
  }

  const urls = new Array<string>()
  for (const candidate of repositories) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof (candidate as { url?: unknown }).url !== 'string'
    ) {
      return null
    }
    const url = (candidate as { url: string }).url
    if (url.trim().length > 0 && !isPortableCloneUrl(url)) {
      return null
    }
    urls.push(url)
  }

  const exportedAtRaw = (parsed as { exportedAt?: unknown }).exportedAt
  const exportedAt =
    typeof exportedAtRaw === 'string'
      ? exportedAtRaw
      : new Date(0).toISOString()

  return {
    version: RepoListFileVersion,
    exportedAt,
    repositories: normalizeRepoUrls(urls).map(url => ({ url })),
  }
}
