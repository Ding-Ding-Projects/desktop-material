import {
  CheapLfsCloneInventoryRemoteFile,
  ICheapLfsCloneInventory,
  parseCheapLfsCloneInventory,
} from './clone-inventory'
import {
  getCheapLfsCloneSelectionIdentity,
  ICheapLfsCloneSelection,
} from '../../models/cheap-lfs-clone-selection'

export type CheapLfsCloneInventoryFetcher = (
  owner: string,
  name: string,
  defaultBranch: string,
  signal: AbortSignal
) => Promise<CheapLfsCloneInventoryRemoteFile>

export interface ICheapLfsProbeableRepository {
  readonly cloneUrl: string
  readonly ownerLogin: string
  readonly name: string
  readonly defaultBranch: string
}

export type CheapLfsCloneInventoryProbeStatus =
  | 'ready'
  | 'absent'
  | 'invalid'
  | 'auth'
  | 'network'
  | 'truncated'

export type CheapLfsCloneInventoryProbeResult =
  | {
      readonly status: 'ready'
      readonly accountKey: string
      readonly cloneUrl: string
      readonly defaultBranch: string
      readonly manifestBlobSha: string
      readonly inventory: ICheapLfsCloneInventory
      readonly identity: string
    }
  | {
      readonly status: Exclude<CheapLfsCloneInventoryProbeStatus, 'ready'>
      readonly accountKey: string
      readonly cloneUrl: string
      readonly defaultBranch: string
    }

const DefaultProbeConcurrency = 4
const DefaultProbeCapacity = 500
const DefaultProbeTimeoutMs = 12_000
const DefaultCacheMaxAgeMs = 5 * 60_000

interface ICachedProbeResult {
  readonly result: CheapLfsCloneInventoryProbeResult
  readonly expiresAt: number
}

/**
 * Lazy, bounded default-branch inventory probe for hosted clone rows.
 *
 * A per-account instance deduplicates queued/in-flight work, bounds request
 * concurrency, aborts hung requests, keeps a capacity-limited expiring cache,
 * and records negative/error states so an unreadable repository is never
 * hammered on every virtualized row render.
 */
export class CheapLfsCloneInventoryProbe {
  private readonly cache = new Map<string, ICachedProbeResult>()
  private readonly queuedOrInFlight = new Set<string>()
  private readonly queue = new Array<ICheapLfsProbeableRepository>()
  private activeCount = 0

  public constructor(
    private readonly accountKey: string,
    private readonly fetchFile: CheapLfsCloneInventoryFetcher,
    private readonly onDidUpdate?: () => void,
    private readonly concurrency: number = DefaultProbeConcurrency,
    private readonly capacity: number = DefaultProbeCapacity,
    private readonly timeoutMs: number = DefaultProbeTimeoutMs,
    private readonly cacheMaxAgeMs: number = DefaultCacheMaxAgeMs
  ) {
    if (
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isSafeInteger(cacheMaxAgeMs) ||
      cacheMaxAgeMs < 1
    ) {
      throw new Error('Cheap LFS clone inventory probe bounds are invalid.')
    }
  }

  public getCachedResult(
    cloneUrl: string,
    defaultBranch: string
  ): CheapLfsCloneInventoryProbeResult | undefined {
    const key = this.getKey(cloneUrl, defaultBranch)
    const cached = this.cache.get(key)
    if (cached === undefined) {
      return undefined
    }
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }

    // Refresh LRU order on read.
    this.cache.delete(key)
    this.cache.set(key, cached)
    return cached.result
  }

  /**
   * `undefined` means not probed, `null` means no usable inventory, and a
   * number (including zero) means a valid managed inventory exists.
   */
  public getCachedAssetCount(
    cloneUrl: string,
    defaultBranch: string
  ): number | null | undefined {
    const result = this.getCachedResult(cloneUrl, defaultBranch)
    return result === undefined
      ? undefined
      : result.status === 'ready'
      ? result.inventory.assets.length
      : null
  }

  public probe(repository: ICheapLfsProbeableRepository): void {
    const key = this.getKey(repository.cloneUrl, repository.defaultBranch)
    if (
      this.getCachedResult(repository.cloneUrl, repository.defaultBranch) !==
        undefined ||
      this.queuedOrInFlight.has(key)
    ) {
      return
    }

    this.queuedOrInFlight.add(key)
    this.queue.push(repository)
    this.pump()
  }

  private getKey(cloneUrl: string, defaultBranch: string): string {
    return `${cloneUrl}\u0000${defaultBranch}`
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const repository = this.queue.shift()
      if (repository === undefined) {
        return
      }
      this.activeCount++
      this.runProbe(repository).finally(() => {
        this.activeCount--
        this.pump()
      })
    }
  }

  private async runProbe(
    repository: ICheapLfsProbeableRepository
  ): Promise<void> {
    const key = this.getKey(repository.cloneUrl, repository.defaultBranch)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let result: CheapLfsCloneInventoryProbeResult

    try {
      const remote = await this.fetchFile(
        repository.ownerLogin,
        repository.name,
        repository.defaultBranch,
        controller.signal
      )
      result = this.fromRemote(repository, remote)
    } catch {
      result = this.failure(repository, 'network')
    } finally {
      clearTimeout(timeout)
    }

    this.queuedOrInFlight.delete(key)
    this.evictIfNeeded()
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheMaxAgeMs,
    })
    this.onDidUpdate?.()
  }

  private fromRemote(
    repository: ICheapLfsProbeableRepository,
    remote: CheapLfsCloneInventoryRemoteFile
  ): CheapLfsCloneInventoryProbeResult {
    if (remote.kind !== 'found') {
      return this.failure(repository, remote.kind)
    }
    if (remote.ref !== repository.defaultBranch) {
      return this.failure(repository, 'invalid')
    }

    const parsed = parseCheapLfsCloneInventory(remote.text)
    if (parsed.kind === 'invalid') {
      return this.failure(
        repository,
        parsed.reason === 'too-large' ? 'truncated' : 'invalid'
      )
    }
    if (parsed.inventory.assets.length === 0) {
      return this.failure(repository, 'absent')
    }

    const identitySource: Pick<
      ICheapLfsCloneSelection,
      | 'accountKey'
      | 'repositoryCloneUrl'
      | 'defaultBranch'
      | 'manifestBlobSha'
      | 'pointerSetSha256'
    > = {
      accountKey: this.accountKey,
      repositoryCloneUrl: repository.cloneUrl,
      defaultBranch: repository.defaultBranch,
      manifestBlobSha: remote.blobSha,
      pointerSetSha256: parsed.inventory.pointerSetSha256,
    }

    return {
      status: 'ready',
      accountKey: this.accountKey,
      cloneUrl: repository.cloneUrl,
      defaultBranch: repository.defaultBranch,
      manifestBlobSha: remote.blobSha,
      inventory: parsed.inventory,
      identity: getCheapLfsCloneSelectionIdentity(identitySource),
    }
  }

  private failure(
    repository: ICheapLfsProbeableRepository,
    status: Exclude<CheapLfsCloneInventoryProbeStatus, 'ready'>
  ): CheapLfsCloneInventoryProbeResult {
    return {
      status,
      accountKey: this.accountKey,
      cloneUrl: repository.cloneUrl,
      defaultBranch: repository.defaultBranch,
    }
  }

  private evictIfNeeded(): void {
    while (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next()
      if (oldest.done === true) {
        return
      }
      this.cache.delete(oldest.value)
    }
  }
}
