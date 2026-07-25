/**
 * Squirrel.Windows version ordering, and the downgrade guard the fork's update
 * feed is measured against before Squirrel is allowed to act on it.
 *
 * Squirrel installs whichever entry in a `RELEASES` manifest carries the
 * highest version — it never asks whether that version is newer than the one
 * already running. A manifest that regresses (a stale lane, a foreign package,
 * an accidentally re-promoted older release) therefore reads to Squirrel as a
 * perfectly ordinary update, and the install base silently moves backwards onto
 * a build it has already outgrown. This module lets the app notice that before
 * handing the feed over.
 *
 * The ordering mirrors legacy NuGet's `SemanticVersion`, which is what
 * Squirrel.Windows compares with: a four-part numeric core, then the
 * prerelease label compared case-insensitively as one whole string (NOT
 * dot-separated SemVer identifiers), and a missing prerelease outranking a
 * present one. `script/release-version.js` builds release versions against the
 * same rules so the app and the release pipeline agree.
 */

/** Squirrel package name the fork publishes. */
export const SquirrelPackageName = 'GitHubDesktop'

/** Hard cap on how much of a `RELEASES` manifest is read from the network. */
export const ReleasesManifestMaximumBytes = 256 * 1024

const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-]+))?$/
// Squirrel's own `RELEASES` grammar: SHA1, package file name, byte size. A `#`
// starts a staging comment and is not part of the entry.
const releaseEntryPattern = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)$/
const releaseEntryCommentPattern = /\s*#.*$/
const packageSuffixes = ['-full.nupkg', '-delta.nupkg'] as const

/** A release version decomposed the way Squirrel.Windows orders it. */
export interface IUpdateVersion {
  /** Major, minor, patch and revision. Revision defaults to zero. */
  readonly core: ReadonlyArray<number>
  /** The prerelease label, or undefined for a stable version. */
  readonly prerelease: string | undefined
}

/** An entry of a Squirrel `RELEASES` manifest. */
export interface IReleasesManifestEntry {
  readonly fileName: string
  readonly version: string
  readonly isDelta: boolean
}

/** What a fetched update feed means for the version currently running. */
export type UpdateFeedVerdict =
  /**
   * The response isn't a `RELEASES` manifest for this package, or the running
   * version can't be ordered. Nothing can be concluded, so Squirrel decides.
   */
  | { readonly kind: 'indeterminate' }
  /** The feed offers a strictly newer version. */
  | { readonly kind: 'upgrade'; readonly version: string }
  /** The feed offers exactly the running version. */
  | { readonly kind: 'current'; readonly version: string }
  /** The feed's best offer is older than what is running. */
  | { readonly kind: 'downgrade'; readonly version: string }

/** Decompose a release version, or null when it isn't one. */
export function parseUpdateVersion(version: string): IUpdateVersion | null {
  if (typeof version !== 'string') {
    return null
  }

  const match = versionPattern.exec(version.trim())
  if (match === null) {
    return null
  }

  return {
    core: [match[1], match[2], match[3], match[4] ?? '0'].map(Number),
    prerelease: match[5],
  }
}

/** Order two parsed versions the way Squirrel.Windows would. */
export function compareUpdateVersions(
  left: IUpdateVersion,
  right: IUpdateVersion
): -1 | 0 | 1 {
  for (let index = 0; index < left.core.length; index++) {
    if (left.core[index] < right.core[index]) {
      return -1
    }
    if (left.core[index] > right.core[index]) {
      return 1
    }
  }

  if (left.prerelease === undefined && right.prerelease === undefined) {
    return 0
  }
  // A stable release outranks any prerelease of the same core version.
  if (left.prerelease === undefined) {
    return 1
  }
  if (right.prerelease === undefined) {
    return -1
  }

  const leftPrerelease = left.prerelease.toLowerCase()
  const rightPrerelease = right.prerelease.toLowerCase()
  if (leftPrerelease < rightPrerelease) {
    return -1
  }
  if (leftPrerelease > rightPrerelease) {
    return 1
  }
  return 0
}

/** Order two release version strings, or null when either can't be read. */
export function compareUpdateVersionStrings(
  left: string,
  right: string
): -1 | 0 | 1 | null {
  const parsedLeft = parseUpdateVersion(left)
  const parsedRight = parseUpdateVersion(right)
  return parsedLeft === null || parsedRight === null
    ? null
    : compareUpdateVersions(parsedLeft, parsedRight)
}

function parsePackageFileName(
  fileName: string,
  packageName: string
): IReleasesManifestEntry | null {
  const suffix = packageSuffixes.find(candidate => fileName.endsWith(candidate))
  if (suffix === undefined) {
    return null
  }

  const prefix = `${packageName}-`
  const stem = fileName.slice(0, fileName.length - suffix.length)
  if (!stem.startsWith(prefix)) {
    return null
  }

  const version = stem.slice(prefix.length)
  return parseUpdateVersion(version) === null
    ? null
    : { fileName, version, isDelta: suffix === '-delta.nupkg' }
}

/**
 * Read the entries a Squirrel `RELEASES` manifest advertises for one package.
 * Lines naming another package, and lines that aren't manifest entries at all,
 * are dropped rather than throwing — an update check must not fail because a
 * feed carries something unfamiliar.
 */
export function parseReleasesManifest(
  manifest: string,
  packageName: string = SquirrelPackageName
): ReadonlyArray<IReleasesManifestEntry> {
  if (typeof manifest !== 'string') {
    return []
  }

  const entries = new Array<IReleasesManifestEntry>()
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.replace(releaseEntryCommentPattern, '').trim()
    if (line.length === 0) {
      continue
    }

    const match = releaseEntryPattern.exec(line)
    if (match === null) {
      continue
    }

    const entry = parsePackageFileName(match[2], packageName)
    if (entry !== null) {
      entries.push(entry)
    }
  }

  return entries
}

/**
 * Decide what a `RELEASES` manifest means for the running version, using the
 * same "highest entry wins" rule Squirrel applies.
 */
export function judgeUpdateFeed(
  currentVersion: string,
  manifest: string,
  packageName: string = SquirrelPackageName
): UpdateFeedVerdict {
  const current = parseUpdateVersion(currentVersion)
  if (current === null) {
    return { kind: 'indeterminate' }
  }

  let best: IUpdateVersion | null = null
  let bestVersion: string | null = null
  for (const entry of parseReleasesManifest(manifest, packageName)) {
    const candidate = parseUpdateVersion(entry.version)
    if (
      candidate !== null &&
      (best === null || compareUpdateVersions(candidate, best) > 0)
    ) {
      best = candidate
      bestVersion = entry.version
    }
  }

  if (best === null || bestVersion === null) {
    return { kind: 'indeterminate' }
  }

  const order = compareUpdateVersions(best, current)
  return {
    kind: order > 0 ? 'upgrade' : order === 0 ? 'current' : 'downgrade',
    version: bestVersion,
  }
}

/**
 * The `RELEASES` URL Squirrel derives from a feed URL.
 *
 * Squirrel resolves `RELEASES` as an ordinary relative reference against the
 * feed, so a feed without a trailing slash has its last path segment replaced
 * rather than extended — which is why `getUpdatesURL` insists on the trailing
 * slash. The guard has to make the same mistake in the same place, or it would
 * judge a manifest Squirrel is never going to read. The feed's query string is
 * carried over, as Squirrel carries its staging parameters.
 */
export function getReleasesManifestURL(feedURL: string): string | null {
  let base: URL
  try {
    base = new URL(feedURL)
  } catch {
    return null
  }

  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    return null
  }

  const url = new URL('RELEASES', base)
  url.search = base.search
  return url.toString()
}

type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>

/** How long the guard will wait for a manifest before giving up on it. */
export const ReleasesManifestTimeoutMilliseconds = 10_000

export interface IUpdateFeedProbe {
  readonly feedURL: string
  readonly currentVersion: string
  readonly packageName?: string
  readonly fetcher?: Fetcher
  readonly signal?: AbortSignal
}

/**
 * Fetch a feed's `RELEASES` manifest and judge it against the running version.
 *
 * This deliberately fails open: an unreachable feed, an oversized or
 * unreadable body, or anything that isn't a manifest for this package all
 * return `indeterminate` so Squirrel keeps its normal behaviour. Only a
 * manifest that was read successfully and genuinely regresses is reported as a
 * downgrade, because that is the one case worth overriding Squirrel for.
 */
export async function probeUpdateFeed({
  feedURL,
  currentVersion,
  packageName = SquirrelPackageName,
  fetcher = fetch,
  signal: callerSignal,
}: IUpdateFeedProbe): Promise<UpdateFeedVerdict> {
  const manifestURL = getReleasesManifestURL(feedURL)
  if (manifestURL === null || parseUpdateVersion(currentVersion) === null) {
    return { kind: 'indeterminate' }
  }

  const timeout = AbortSignal.timeout(ReleasesManifestTimeoutMilliseconds)
  const signal =
    callerSignal === undefined
      ? timeout
      : AbortSignal.any([callerSignal, timeout])

  try {
    const manifest = await readBoundedManifest(
      await fetcher(manifestURL, { signal })
    )
    return manifest === null
      ? { kind: 'indeterminate' }
      : judgeUpdateFeed(currentVersion, manifest, packageName)
  } catch {
    return { kind: 'indeterminate' }
  }
}

/** Read a bounded amount of text without buffering more than the cap. */
export async function readBoundedManifest(
  response: Response,
  maximumBytes: number = ReleasesManifestMaximumBytes
): Promise<string | null> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }

  const declared = response.headers.get('content-length')
  if (declared !== null && /^\d+$/.test(declared)) {
    if (Number(declared) > maximumBytes) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }
  }

  const reader = response.body?.getReader()
  if (reader === undefined) {
    return null
  }

  const chunks = new Array<Uint8Array>()
  let length = 0
  while (true) {
    const next = await reader.read()
    if (next.done) {
      break
    }
    length += next.value.byteLength
    if (length > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(next.value)
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
