/**
 * Provider-neutral progress for a Cheap LFS restore.
 *
 * Release assets and registry objects expose different transfer counters. This
 * model keeps the user-facing contract stable: logical bytes describe the
 * original files being restored, while actual download bytes describe network
 * traffic when the provider can report it.
 */

/** Start the next file/part once the active download reaches this boundary. */
export const CheapLfsRestoreLookAheadThresholdPercent = 90 as const

/** Retain enough path context for diagnosis without allowing an unbounded row. */
export const CheapLfsRestoreMaximumPathLength = 240

/** Provider errors are useful, but never let one response dominate the UI. */
export const CheapLfsRestoreMaximumFailureReasonLength = 240

/** The progress card intentionally shows only a bounded, ordered failure list. */
export const CheapLfsRestoreMaximumVisibleFailures = 5

export type CheapLfsRestoreProvider =
  | 'github-release'
  | 'ghcr'
  | 'docker-hub'
  | 'mixed'
  | 'unknown'

export type CheapLfsRestorePhase =
  | 'preparing'
  | 'downloading'
  | 'decompressing'
  // Decryption is its own phase rather than borrowing `decompressing`. The two
  // are not interchangeable to a watching user: scrypt at the configured cost
  // is deliberately slow, so this is often the longest visible step of a
  // restore, and telling someone their file is being decompressed while it is
  // actually being decrypted is wrong exactly when they are staring at it.
  | 'decrypting'
  | 'verifying'
  | 'materializing'
  | 'canceling'

/** One active transfer lane: the foreground restore or its 90% look-ahead. */
export interface ICheapLfsRestoreLaneProgress {
  readonly provider: CheapLfsRestoreProvider
  readonly phase: CheapLfsRestorePhase
  /** Sanitized repository-relative path, bounded by the normalizer. */
  readonly relativePath: string
  /** One-based file position in the deterministic restore order. */
  readonly fileOrdinal: number
  readonly filesTotal: number
  /** One-based part position for a multipart pointer, otherwise null. */
  readonly partOrdinal: number | null
  readonly partsTotal: number | null
  /** Stage-local bytes reported by this provider lane. */
  readonly processedBytes: number
  readonly totalBytes: number | null
  /** Integer 0..100, or null while this lane is indeterminate. */
  readonly percent: number | null
}

/** One settled restore failure. Text must be sanitized before it reaches UI. */
export interface ICheapLfsRestoreFailureProgress {
  readonly relativePath: string
  readonly reason: string
  readonly statusCode?: number
}

/**
 * Canonical restore progress consumed by every renderer surface.
 *
 * `currentLane` continues verification/materialization after its transfer
 * finishes. `prefetchLane` is the next file or part whose network transfer
 * began at the exact 90% boundary, hiding provider setup latency without
 * claiming that either file has settled early.
 */
export interface ICheapLfsRestoreProgress {
  readonly repositoryId: number
  readonly repositoryName: string
  readonly provider: CheapLfsRestoreProvider
  readonly phase: CheapLfsRestorePhase

  readonly filesSucceeded: number
  readonly filesFailed: number
  readonly filesRemaining: number
  readonly filesTotal: number

  /** Original-file bytes fully processed across the batch. */
  readonly logicalProcessedBytes: number
  readonly logicalTotalBytes: number
  /** Network bytes, nullable when the provider cannot expose an exact total. */
  readonly actualDownloadedBytes: number | null
  readonly actualDownloadTotalBytes: number | null

  readonly downloadRateBytesPerSecond: number | null
  readonly etaSeconds: number | null
  readonly elapsedSeconds: number

  /** Work not occupying either active lane. */
  readonly queuedFiles: number
  readonly queuedParts: number
  readonly currentLane: ICheapLfsRestoreLaneProgress | null
  readonly prefetchLane: ICheapLfsRestoreLaneProgress | null
  readonly lookAheadThresholdPercent: typeof CheapLfsRestoreLookAheadThresholdPercent

  /** Input-ordered, sanitized and bounded by the normalizer. */
  readonly failures: ReadonlyArray<ICheapLfsRestoreFailureProgress>
  /** True from user intent until all active provider work has stopped. */
  readonly cancelRequested: boolean
}

/**
 * Compatibility input for the existing sequential producer. It lets the UI
 * land independently; the richer store producer can switch to the canonical
 * shape without another renderer migration.
 */
export interface ILegacyCheapLfsRestoreProgress {
  readonly repositoryId: number
  readonly repositoryName: string
  readonly filesCompleted: number
  readonly filesTotal: number
  readonly transferredBytes: number
  readonly totalBytes: number
}

export type CheapLfsRestoreProgressInput =
  | ICheapLfsRestoreProgress
  | ILegacyCheapLfsRestoreProgress

const restoreProviders = new Set<CheapLfsRestoreProvider>([
  'github-release',
  'ghcr',
  'docker-hub',
  'mixed',
  'unknown',
])

const restorePhases = new Set<CheapLfsRestorePhase>([
  'preparing',
  'downloading',
  'decompressing',
  'decrypting',
  'verifying',
  'materializing',
  'canceling',
])

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function finitePositiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null
}

function nullableNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

function normalizeProvider(value: unknown): CheapLfsRestoreProvider {
  return restoreProviders.has(value as CheapLfsRestoreProvider)
    ? (value as CheapLfsRestoreProvider)
    : 'unknown'
}

function normalizePhase(value: unknown): CheapLfsRestorePhase {
  return restorePhases.has(value as CheapLfsRestorePhase)
    ? (value as CheapLfsRestorePhase)
    : 'preparing'
}

function sanitizeBoundedText(
  value: unknown,
  maximumLength: number,
  keepTail: boolean
): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    // Provider URLs can carry one-use query credentials; paths never need one.
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '')
    .replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]+/g, '')
    .replace(
      /\b(?:authorization\s*[:=]\s*|token\s*[:=]\s*|bearer\s+)(?:bearer\s+)?\S+/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
  const characters = Array.from(normalized)
  if (characters.length <= maximumLength) {
    return normalized
  }

  return keepTail
    ? `…${characters.slice(-(maximumLength - 1)).join('')}`
    : `${characters.slice(0, maximumLength - 1).join('')}…`
}

/** Sanitize and tail-elide a repository-relative path for display. */
export function sanitizeCheapLfsRestorePath(value: unknown): string {
  return sanitizeBoundedText(value, CheapLfsRestoreMaximumPathLength, true)
}

/** Sanitize and head-retain a provider failure for display. */
export function sanitizeCheapLfsRestoreFailureReason(value: unknown): string {
  return sanitizeBoundedText(
    value,
    CheapLfsRestoreMaximumFailureReasonLength,
    false
  )
}

/**
 * Exact byte boundary used by the scheduler. The equality case is deliberate:
 * 899/1000 is false and 900/1000 is true.
 */
export function shouldStartCheapLfsRestoreLookAhead(
  processedBytes: number,
  totalBytes: number
): boolean {
  const processed = finiteNonNegative(processedBytes)
  const total = finitePositiveOrNull(totalBytes)
  return (
    total !== null &&
    processed >= total * (CheapLfsRestoreLookAheadThresholdPercent / 100)
  )
}

/** Whether a normalized lane has crossed the same exact look-ahead boundary. */
export function cheapLfsRestoreLaneReachedLookAhead(
  lane: ICheapLfsRestoreLaneProgress | null
): boolean {
  if (lane === null) {
    return false
  }
  return lane.totalBytes !== null
    ? shouldStartCheapLfsRestoreLookAhead(lane.processedBytes, lane.totalBytes)
    : lane.percent !== null &&
        lane.percent >= CheapLfsRestoreLookAheadThresholdPercent
}

function normalizeLane(
  value: ICheapLfsRestoreLaneProgress | null | undefined,
  batchFilesTotal: number
): ICheapLfsRestoreLaneProgress | null {
  if (value === null || value === undefined) {
    return null
  }

  const filesTotal = Math.max(
    1,
    finiteNonNegative(value.filesTotal, batchFilesTotal)
  )
  const fileOrdinal = Math.max(
    1,
    Math.min(finiteNonNegative(value.fileOrdinal, 1), filesTotal)
  )
  const totalBytes = finitePositiveOrNull(value.totalBytes)
  const processedBytes =
    totalBytes === null
      ? finiteNonNegative(value.processedBytes)
      : Math.min(finiteNonNegative(value.processedBytes), totalBytes)
  const suppliedPercent = nullableNonNegative(value.percent)
  const percent =
    totalBytes !== null
      ? Math.min(100, Math.floor((processedBytes / totalBytes) * 100))
      : suppliedPercent === null
      ? null
      : Math.min(suppliedPercent, 100)

  const partsTotal = finitePositiveOrNull(value.partsTotal)
  const partOrdinal =
    partsTotal === null
      ? null
      : Math.max(
          1,
          Math.min(finiteNonNegative(value.partOrdinal, 1), partsTotal)
        )

  return {
    provider: normalizeProvider(value.provider),
    phase: normalizePhase(value.phase),
    relativePath: sanitizeCheapLfsRestorePath(value.relativePath),
    fileOrdinal,
    filesTotal,
    partOrdinal,
    partsTotal,
    processedBytes,
    totalBytes,
    percent,
  }
}

function isCanonicalRestoreProgress(
  value: CheapLfsRestoreProgressInput
): value is ICheapLfsRestoreProgress {
  return 'logicalProcessedBytes' in value
}

/**
 * Clamp counters, sanitize text and migrate the legacy sequential snapshot.
 *
 * Renderer code calls this at its boundary, so a malformed provider event can
 * never produce NaN widths, negative ARIA values, unbounded paths or raw URLs.
 */
export function normalizeCheapLfsRestoreProgress(
  value: CheapLfsRestoreProgressInput
): ICheapLfsRestoreProgress {
  if (!isCanonicalRestoreProgress(value)) {
    const filesTotal = finiteNonNegative(value.filesTotal)
    const filesSucceeded = Math.min(
      finiteNonNegative(value.filesCompleted),
      filesTotal
    )
    const logicalTotalBytes = finiteNonNegative(value.totalBytes)
    return {
      repositoryId: finiteNonNegative(value.repositoryId),
      repositoryName: sanitizeBoundedText(
        value.repositoryName,
        CheapLfsRestoreMaximumPathLength,
        false
      ),
      provider: 'unknown',
      phase: 'downloading',
      filesSucceeded,
      filesFailed: 0,
      filesRemaining: Math.max(0, filesTotal - filesSucceeded),
      filesTotal,
      logicalProcessedBytes: Math.min(
        finiteNonNegative(value.transferredBytes),
        logicalTotalBytes
      ),
      logicalTotalBytes,
      actualDownloadedBytes: null,
      actualDownloadTotalBytes: null,
      downloadRateBytesPerSecond: null,
      etaSeconds: null,
      elapsedSeconds: 0,
      queuedFiles: Math.max(0, filesTotal - filesSucceeded - 1),
      queuedParts: 0,
      currentLane: null,
      prefetchLane: null,
      lookAheadThresholdPercent: CheapLfsRestoreLookAheadThresholdPercent,
      failures: [],
      cancelRequested: false,
    }
  }

  const filesTotal = finiteNonNegative(value.filesTotal)
  const filesSucceeded = Math.min(
    finiteNonNegative(value.filesSucceeded),
    filesTotal
  )
  const filesFailed = Math.min(
    finiteNonNegative(value.filesFailed),
    Math.max(0, filesTotal - filesSucceeded)
  )
  const logicalTotalBytes = finiteNonNegative(value.logicalTotalBytes)
  const actualDownloadTotalBytes = finitePositiveOrNull(
    value.actualDownloadTotalBytes
  )
  const actualDownloaded = nullableNonNegative(value.actualDownloadedBytes)
  const actualDownloadedBytes =
    actualDownloaded === null
      ? null
      : actualDownloadTotalBytes === null
      ? actualDownloaded
      : Math.min(actualDownloaded, actualDownloadTotalBytes)
  const failures = (Array.isArray(value.failures) ? value.failures : [])
    .slice(0, Math.min(CheapLfsRestoreMaximumVisibleFailures, filesFailed))
    .map(failure => {
      const statusCode = finiteNonNegative(failure.statusCode)
      return {
        relativePath: sanitizeCheapLfsRestorePath(failure.relativePath),
        reason: sanitizeCheapLfsRestoreFailureReason(failure.reason),
        ...(statusCode >= 100 && statusCode <= 599 ? { statusCode } : {}),
      }
    })

  return {
    repositoryId: finiteNonNegative(value.repositoryId),
    repositoryName: sanitizeBoundedText(
      value.repositoryName,
      CheapLfsRestoreMaximumPathLength,
      false
    ),
    provider: normalizeProvider(value.provider),
    phase: value.cancelRequested ? 'canceling' : normalizePhase(value.phase),
    filesSucceeded,
    filesFailed,
    filesRemaining: Math.max(0, filesTotal - filesSucceeded - filesFailed),
    filesTotal,
    logicalProcessedBytes: Math.min(
      finiteNonNegative(value.logicalProcessedBytes),
      logicalTotalBytes
    ),
    logicalTotalBytes,
    actualDownloadedBytes,
    actualDownloadTotalBytes,
    downloadRateBytesPerSecond: nullableNonNegative(
      value.downloadRateBytesPerSecond
    ),
    etaSeconds: nullableNonNegative(value.etaSeconds),
    elapsedSeconds: finiteNonNegative(value.elapsedSeconds),
    queuedFiles: finiteNonNegative(value.queuedFiles),
    queuedParts: finiteNonNegative(value.queuedParts),
    currentLane: normalizeLane(value.currentLane, filesTotal),
    prefetchLane: normalizeLane(value.prefetchLane, filesTotal),
    lookAheadThresholdPercent: CheapLfsRestoreLookAheadThresholdPercent,
    failures,
    cancelRequested: value.cancelRequested === true,
  }
}

/**
 * Coarse, deterministic percentage for the single polite live summary.
 * Visible counters stay exact; assistive technology is not interrupted for
 * every network chunk.
 */
export function cheapLfsRestoreAnnouncementPercent(
  progress: ICheapLfsRestoreProgress
): number {
  if (progress.logicalTotalBytes <= 0) {
    return 0
  }
  const exact = Math.floor(
    (progress.logicalProcessedBytes / progress.logicalTotalBytes) * 100
  )
  return exact >= 100 ? 100 : Math.floor(exact / 10) * 10
}
