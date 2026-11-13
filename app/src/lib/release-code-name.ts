/**
 * The dim sum code name of a published release.
 *
 * The release workflow picks the name when it publishes, after the app is
 * built, and writes it into the release notes. The running app therefore
 * cannot carry its own name: it reads it from its release's public notes when
 * the About dialog opens, and shows nothing if that does not work.
 */

export interface IReleaseCodeName {
  /** The dish, English then Traditional Chinese, as the notes give it. */
  readonly name: string
  /** The public dish photo, or null when the notes link none we accept. */
  readonly photoUrl: string | null
}

const ReleasesApi =
  'https://api.github.com/repos/Ding-Ding-Projects/desktop-material/releases/tags/'
const PhotoUrl =
  /^https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.png$/

/** The tag a version was released under, or null for a version with none. */
export function releaseTagForVersion(version: string): string | null {
  return /^\d+\.\d+\.\d+$/.test(version.trim()) ? `v${version.trim()}` : null
}

/** Find the code name section in a release's notes. */
export function parseReleaseCodeName(body: string): IReleaseCodeName | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const heading = lines.findIndex(
    line => line.trim() === '## Release code name'
  )
  if (heading === -1) {
    return null
  }
  const section = new Array<string>()
  for (const line of lines.slice(heading + 1)) {
    if (line.startsWith('## ')) {
      break
    }
    if (line.trim().length > 0) {
      section.push(line.trim())
    }
  }
  const name = section[0]
  if (
    name === undefined ||
    name.length > 120 ||
    name.startsWith('[') ||
    /[<>\u0000-\u001f]/.test(name)
  ) {
    return null
  }
  let photoUrl: string | null = null
  for (const line of section.slice(1)) {
    const link = /^\[Public dish photo\]\((\S+)\)$/.exec(line)
    if (link !== null && PhotoUrl.test(link[1])) {
      photoUrl = link[1]
    }
  }
  return { name, photoUrl }
}

export type ReleaseNotesFetch = (
  url: string,
  init: {
    readonly signal: AbortSignal
    readonly headers: Record<string, string>
  }
) => Promise<{
  readonly ok: boolean
  readonly json: () => Promise<unknown>
}>

const cache = new Map<string, IReleaseCodeName | null>()

/**
 * Read the code name of the release this version came from. Never throws:
 * any failure, a missing release or missing section gives null. A successful
 * answer is remembered for the rest of the session.
 */
export async function fetchReleaseCodeName(
  version: string,
  fetchNotes: ReleaseNotesFetch,
  timeoutMs: number = 8000
): Promise<IReleaseCodeName | null> {
  const tag = releaseTagForVersion(version)
  if (tag === null) {
    return null
  }
  if (cache.has(tag)) {
    return cache.get(tag) ?? null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchNotes(ReleasesApi + encodeURIComponent(tag), {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return null
    }
    const release = (await response.json()) as { body?: unknown } | null
    const codeName =
      typeof release?.body === 'string'
        ? parseReleaseCodeName(release.body)
        : null
    cache.set(tag, codeName)
    return codeName
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** For tests: forget remembered answers. */
export function clearReleaseCodeNameCache() {
  cache.clear()
}
