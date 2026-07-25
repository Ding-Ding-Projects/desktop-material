/**
 * Memoization for the Cheap LFS pointer inventory.
 *
 * `listAllCheapLfsPointers` runs three whole-tree `git grep` passes (working
 * tree, index, HEAD). On the 211k-file test repository that is ~49s cold and
 * ~17s warm, and every status refresh paid it again. The inventory is a pure
 * function of the committed tree (HEAD), the index, and the working-tree bytes
 * of the changed paths, so it can be cached against a key that captures exactly
 * those inputs and reused until one of them changes.
 *
 * The cache is intentionally *not* consulted by the commit-time staging safety
 * gate: that path recomputes a fresh inventory so its fail-closed re-pin
 * protection can never act on a stale scan. This module only accelerates the
 * cosmetic status projection and coalesces concurrent scans.
 */

/**
 * A change-signal for one path reported by `git status`. `id` already encodes
 * the path plus the porcelain status kind (and rename source); `mtimeMs`/
 * `sizeInBytes` are the working-tree stat that distinguishes two different
 * contents that share the same status kind (e.g. an edited materialized file
 * that stays `Modified`). A `null` stat means the path could not be measured
 * and is treated as its own always-distinct signal.
 */
export interface ICheapLfsInventoryChangeSignal {
  readonly id: string
  readonly mtimeMs: number | null
  readonly sizeInBytes: number | null
}

/**
 * Above this many changed paths the memo stops paying for itself (statting the
 * change set costs more than it saves) and a heavily-mutating repository would
 * miss on every refresh anyway. Callers pass `null` as the key in that regime
 * to force a fresh, uncached scan.
 */
export const CheapLfsInventoryChangedPathCap = 1000

// ASCII control separators (US / RS / GS) that cannot appear in a Git object
// id, a numeric stat, or a path status id, so the flattened key is unambiguous.
const FieldSeparator = String.fromCharCode(0x1f)
const RecordSeparator = String.fromCharCode(0x1e)
const SectionSeparator = String.fromCharCode(0x1d)

/**
 * Build the deterministic cache key for a pointer inventory. Pure: identical
 * inputs always produce the same key and any change to HEAD, the index
 * signature, or a changed path's identity/content produces a different key.
 */
export function buildCheapLfsInventoryKey(
  headSha: string | undefined,
  indexSignature: string | null,
  changes: ReadonlyArray<ICheapLfsInventoryChangeSignal>
): string {
  const head = headSha ?? '<no-head>'
  const index = indexSignature ?? '<no-index>'
  const sorted = [...changes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )
  const body = sorted
    .map(
      change =>
        `${change.id}${FieldSeparator}${
          change.mtimeMs ?? 'x'
        }${FieldSeparator}${change.sizeInBytes ?? 'x'}`
    )
    .join(RecordSeparator)
  return `${head}${SectionSeparator}${index}${SectionSeparator}${sorted.length}${SectionSeparator}${body}`
}

interface IMemoRecord<T> {
  readonly key: string
  readonly value: T
}

interface IInflightRecord<T> {
  readonly key: string
  readonly promise: Promise<T>
}

/**
 * A per-repository memo with in-flight coalescing.
 *
 * - `getOrCompute(repoKey, key, compute)` returns the cached value when `key`
 *   matches the stored key, joins an in-flight scan for the same key, or starts
 *   a fresh scan and stores its result.
 * - A scan superseded by a newer key (or an intervening `invalidate`) never
 *   publishes its result, so the memo can only ever hold the newest key's value.
 * - A rejected scan publishes nothing, so failures are never cached.
 */
export class CheapLfsInventoryCache<T> {
  private readonly memo = new Map<string, IMemoRecord<T>>()
  private readonly inflight = new Map<string, IInflightRecord<T>>()

  public async getOrCompute(
    repositoryKey: string,
    key: string,
    compute: () => Promise<T>
  ): Promise<T> {
    const cached = this.memo.get(repositoryKey)
    if (cached !== undefined && cached.key === key) {
      return cached.value
    }
    const pending = this.inflight.get(repositoryKey)
    if (pending !== undefined && pending.key === key) {
      return pending.promise
    }
    const record: { key: string; promise: Promise<T> } = {
      key,
      promise: Promise.resolve() as unknown as Promise<T>,
    }
    record.promise = (async () => {
      const value = await compute()
      // Only publish if this scan is still the repository's newest in-flight
      // request. A newer key or an `invalidate` will have replaced/cleared it.
      if (this.inflight.get(repositoryKey) === record) {
        this.memo.set(repositoryKey, { key, value })
      }
      return value
    })()
    this.inflight.set(repositoryKey, record)
    try {
      return await record.promise
    } finally {
      if (this.inflight.get(repositoryKey) === record) {
        this.inflight.delete(repositoryKey)
      }
    }
  }

  /** Drop any cached or in-flight result so the next scan is recomputed. */
  public invalidate(repositoryKey: string): void {
    this.memo.delete(repositoryKey)
    this.inflight.delete(repositoryKey)
  }

  /** Remove every entry. Intended for tests and full teardown. */
  public clear(): void {
    this.memo.clear()
    this.inflight.clear()
  }
}
