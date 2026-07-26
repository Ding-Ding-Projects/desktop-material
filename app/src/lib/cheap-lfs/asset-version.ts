/**
 * Immutable versioning and commit provenance for Cheap LFS release assets.
 *
 * Cheap LFS treats an uploaded release asset as write-once. Editing a pinned
 * large file therefore never rewrites the asset the earlier commit points at:
 * the new bytes hash to a new SHA-256, take their own asset name inside the
 * release bucket, and a new pointer is committed beside them. Every historical
 * commit keeps resolving to the exact asset — and the exact bytes — it was
 * committed with.
 *
 * Two facts have to survive that rule to make it useful:
 *
 * 1. *Identical* content must not multiply. Re-pinning bytes the bucket already
 *    holds reuses the existing asset instead of uploading a second copy, which
 *    is safe precisely because assets are immutable.
 * 2. Each asset must be traceable back to the commit that introduced it. The
 *    committed pointer file is the primary, offline, tamper-evident record of
 *    that (`git log -p -- <path>` shows every version's asset name and digest).
 *    The asset *label* carries the same facts on the release surface itself so
 *    the mapping is readable without a checkout.
 *
 * This module is pure — no disk, network, or process access — so both rules are
 * unit-testable without a provider.
 */

import {
  IGitHubRelease,
  IGitHubReleaseAsset,
  isUploadedGitHubReleaseAsset,
} from '../github-releases'

/**
 * Exact, invisible release-body marker written on every new Cheap LFS bucket.
 *
 * This must stay an equality-tested sentinel rather than a searchable phrase:
 * ordinary release notes may discuss Cheap LFS without becoming app-managed
 * storage buckets. The version suffix leaves future formats room to opt in
 * deliberately without weakening that boundary.
 */
export const CheapLfsReleaseBodySentinel =
  '<!-- desktop-material:cheap-lfs-release-bucket:v1 -->'

/** True only for the exact current Cheap LFS release-body sentinel. */
export function isCheapLfsReleaseBody(
  body: string | null | undefined
): boolean {
  return body === CheapLfsReleaseBodySentinel
}

/** Version marker every Cheap LFS asset label starts with. */
export const CheapLfsAssetLabelPrefix = 'cheap-lfs/v1'

/** GitHub's documented release-asset label ceiling. */
export const CheapLfsMaximumAssetLabelLength = 255

/**
 * Written in place of the elided head of an over-long tracked path. The tail is
 * kept because the file name is the part a reader recognizes, and the pointer
 * in Git history always carries the untruncated path.
 */
export const CheapLfsAssetLabelTruncationMarker = '...'

/** Written for `commit=` before the introducing commit is known. */
export const CheapLfsAssetLabelPendingCommit = '-'

const sha256Hex = /^[a-f0-9]{64}$/
// Git object ids are SHA-1 today and SHA-256 in a `sha256` repository; short
// spellings are accepted so an abbreviated id can be recorded verbatim.
const commitHex = /^[a-f0-9]{7,64}$/
const labelPattern = new RegExp(
  `^${CheapLfsAssetLabelPrefix} sha256=([a-f0-9]{64}) commit=(${CheapLfsAssetLabelPendingCommit}|[a-f0-9]{7,64}) path=(.+)$`
)
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/g

/** What one Cheap LFS asset label states about the asset it is attached to. */
export interface ICheapLfsAssetAnnotation {
  /** Repository-relative path the asset was pinned from. */
  readonly relativePath: string
  /** SHA-256 of the whole tracked file, matching its committed pointer. */
  readonly sha256: string
  /** Introducing commit, or `null` while the pin has not been committed yet. */
  readonly commitSha: string | null
  /** True when `relativePath` had its head elided to fit the label ceiling. */
  readonly pathTruncated: boolean
}

/** Everything needed to build one label. `commitSha` is optional by design. */
export interface ICheapLfsAssetAnnotationInput {
  readonly relativePath: string
  readonly sha256: string
  readonly commitSha?: string | null
}

/**
 * Trim to at most `maximumLength` UTF-16 code units without ending on the first
 * half of a surrogate pair, taking the tail rather than the head.
 */
function keepTail(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) {
    return value
  }
  let tail = value.slice(value.length - maximumLength)
  const firstCodeUnit = tail.charCodeAt(0)
  if (firstCodeUnit >= 0xdc00 && firstCodeUnit <= 0xdfff) {
    tail = tail.slice(1)
  }
  return tail
}

/**
 * Build the canonical asset label for one pinned file, or `null` when the
 * inputs cannot produce a valid one.
 *
 * The label is deliberately mechanical rather than prose: a fixed version
 * marker, the whole-file digest, the introducing commit (or `-` when the pin
 * has not been committed yet), then the tracked path last so a path containing
 * spaces needs no quoting. It is plain ASCII apart from the path itself, never
 * carries a control character, and never exceeds GitHub's 255-character label
 * ceiling — the three conditions `normalizeGitHubReleaseAssetLabel` enforces —
 * so a well-formed annotation can never be the reason an upload is rejected.
 */
export function formatCheapLfsAssetLabel(
  annotation: ICheapLfsAssetAnnotationInput
): string | null {
  if (
    typeof annotation?.sha256 !== 'string' ||
    typeof annotation.relativePath !== 'string'
  ) {
    return null
  }
  const sha256 = annotation.sha256.toLowerCase()
  if (!sha256Hex.test(sha256)) {
    return null
  }
  const rawCommit = annotation.commitSha ?? ''
  if (typeof rawCommit !== 'string') {
    return null
  }
  const commit = rawCommit.toLowerCase()
  if (commit.length > 0 && !commitHex.test(commit)) {
    return null
  }
  const path = annotation.relativePath
    .replace(controlCharacters, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (path.length === 0) {
    return null
  }
  const head = `${CheapLfsAssetLabelPrefix} sha256=${sha256} commit=${
    commit.length === 0 ? CheapLfsAssetLabelPendingCommit : commit
  } path=`
  const budget = CheapLfsMaximumAssetLabelLength - head.length
  if (budget < CheapLfsAssetLabelTruncationMarker.length + 1) {
    return null
  }
  if (path.length <= budget) {
    return `${head}${path}`
  }
  const tail = keepTail(
    path,
    budget - CheapLfsAssetLabelTruncationMarker.length
  )
  return `${head}${CheapLfsAssetLabelTruncationMarker}${tail}`
}

/**
 * Read a Cheap LFS annotation back out of a provider label. Anything that is
 * not exactly this app's label — including a user-authored one — parses as
 * `null` rather than being guessed at.
 */
export function parseCheapLfsAssetLabel(
  label: string | null | undefined
): ICheapLfsAssetAnnotation | null {
  if (typeof label !== 'string') {
    return null
  }
  const match = labelPattern.exec(label.trim())
  if (match === null) {
    return null
  }
  const value = match[3]
  const pathTruncated = value.startsWith(CheapLfsAssetLabelTruncationMarker)
  const relativePath = pathTruncated
    ? value.slice(CheapLfsAssetLabelTruncationMarker.length)
    : value
  if (relativePath.length === 0) {
    return null
  }
  return {
    relativePath,
    sha256: match[1],
    commitSha: match[2] === CheapLfsAssetLabelPendingCommit ? null : match[2],
    pathTruncated,
  }
}

/**
 * Identify an app-managed Cheap LFS release without guessing from its title,
 * tag, or prose. New buckets carry the exact invisible body sentinel; legacy
 * buckets remain recognizable when at least one asset has valid Cheap LFS
 * provenance. A normal release is never classified unless it is a prerelease.
 */
export function isCheapLfsReleaseBucket(
  release:
    | Pick<IGitHubRelease, 'body' | 'prerelease' | 'assets'>
    | null
    | undefined
): boolean {
  if (
    release === null ||
    release === undefined ||
    release.prerelease !== true
  ) {
    return false
  }
  if (isCheapLfsReleaseBody(release.body)) {
    return true
  }
  return release.assets.some(
    asset => parseCheapLfsAssetLabel(asset.label) !== null
  )
}

/**
 * Find an asset in this bucket that provably already holds these exact bytes.
 *
 * Reuse is only ever allowed on proof, never on a name or a size alone: the
 * provider must report a completed upload whose byte count matches and whose
 * `sha256:` digest equals the content digest. GitHub does not supply a digest
 * for every historical asset, and an asset with no digest is treated as unknown
 * content and re-uploaded rather than trusted — the failure mode of a wrong
 * reuse is a pointer that resolves to the wrong bytes, so this fails closed.
 *
 * The lowest-id match wins so repeated calls over the same inventory always
 * choose the same asset regardless of provider page ordering.
 */
export function findCheapLfsAssetForContent(
  assets: ReadonlyArray<IGitHubReleaseAsset>,
  sizeInBytes: number,
  sha256: string
): IGitHubReleaseAsset | null {
  if (
    !Array.isArray(assets) ||
    typeof sha256 !== 'string' ||
    !sha256Hex.test(sha256.toLowerCase()) ||
    !Number.isSafeInteger(sizeInBytes) ||
    sizeInBytes < 0
  ) {
    return null
  }
  const expectedDigest = `sha256:${sha256.toLowerCase()}`
  let best: IGitHubReleaseAsset | null = null
  for (const asset of assets) {
    if (
      !isUploadedGitHubReleaseAsset(asset) ||
      asset.sizeInBytes !== sizeInBytes ||
      asset.digest === null ||
      asset.digest !== expectedDigest
    ) {
      continue
    }
    if (best === null || asset.id < best.id) {
      best = asset
    }
  }
  return best
}

/** One planned part of a split upload, reduced to what reuse needs. */
export interface ICheapLfsReusablePart {
  readonly length: number
  readonly sha256: string
}

/**
 * Resolve every part of a split file to an asset the bucket already holds, or
 * `null` when even one part is missing.
 *
 * Reuse is all-or-nothing on purpose. A partially reused family would mix
 * borrowed names with this attempt's `<base>.partNNN` names, and the cleanup
 * path that removes attempt-owned assets after a failure distinguishes the two
 * by ownership; keeping the family whole keeps that boundary unambiguous. Two
 * parts with identical content legitimately resolve to the same asset.
 */
export function findCheapLfsAssetsForParts(
  assets: ReadonlyArray<IGitHubReleaseAsset>,
  parts: ReadonlyArray<ICheapLfsReusablePart>
): ReadonlyArray<IGitHubReleaseAsset> | null {
  if (!Array.isArray(parts) || parts.length === 0) {
    return null
  }
  const resolved = new Array<IGitHubReleaseAsset>()
  for (const part of parts) {
    const match = findCheapLfsAssetForContent(assets, part.length, part.sha256)
    if (match === null) {
      return null
    }
    resolved.push(match)
  }
  return resolved
}

/** One asset whose label should record the commit that introduced it. */
export interface ICheapLfsAssetAnnotationTarget {
  readonly releaseTag: string
  readonly assetName: string
  readonly label: string
}

/** One pinned file, as the post-commit annotator receives it. */
export interface ICheapLfsAnnotatablePin {
  readonly relativePath: string
  readonly releaseTag: string
  readonly assetName: string
  readonly sha256: string
  /** Part asset names, when the file was split across several assets. */
  readonly partNames?: ReadonlyArray<string>
}

/**
 * Expand pinned files into the exact set of `(release, asset, label)` updates
 * that record `commitSha` as the introducing commit.
 *
 * Duplicates collapse: a file split into parts labels each part, several files
 * reusing one deduped asset produce one update, and an unusable commit id or
 * annotation produces no update at all rather than a malformed one.
 */
export function buildCheapLfsAssetAnnotationTargets(
  pins: ReadonlyArray<ICheapLfsAnnotatablePin>,
  commitSha: string
): ReadonlyArray<ICheapLfsAssetAnnotationTarget> {
  if (
    typeof commitSha !== 'string' ||
    !commitHex.test(commitSha.toLowerCase()) ||
    !Array.isArray(pins)
  ) {
    return []
  }
  const targets = new Map<string, ICheapLfsAssetAnnotationTarget>()
  for (const pin of pins) {
    const label = formatCheapLfsAssetLabel({
      relativePath: pin.relativePath,
      sha256: pin.sha256,
      commitSha,
    })
    if (
      label === null ||
      typeof pin.releaseTag !== 'string' ||
      pin.releaseTag.length === 0
    ) {
      continue
    }
    const names =
      pin.partNames !== undefined && pin.partNames.length > 0
        ? pin.partNames
        : [pin.assetName]
    for (const assetName of names) {
      if (typeof assetName !== 'string' || assetName.length === 0) {
        continue
      }
      const key = `${pin.releaseTag}\u0000${assetName}`
      if (!targets.has(key)) {
        targets.set(key, { releaseTag: pin.releaseTag, assetName, label })
      }
    }
  }
  return [...targets.values()]
}
