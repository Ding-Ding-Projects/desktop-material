import type { IConfigValueOrigin } from './git/config'
import type { Repository } from '../models/repository'

export interface ICommitAuthorOrigins {
  readonly name: IConfigValueOrigin | null
  readonly email: IConfigValueOrigin | null
}

export type CommitAuthorOriginLoader = (
  repository: Repository,
  name: 'user.name' | 'user.email'
) => Promise<IConfigValueOrigin | null>

interface ICommitAuthorOriginsCacheEntry {
  readonly promise: Promise<ICommitAuthorOrigins>
  readonly startedAt: number
}

const DefaultMaximumEntries = 16
const DefaultMaximumAgeMilliseconds = 30_000

/**
 * A short-lived, bounded cache for the effective author config sources.
 *
 * The Changes view is intentionally unmounted when History is selected. Without
 * coalescing, every return to Changes starts two identical Git processes even
 * though Git configuration almost never changes between adjacent clicks.
 */
export class CommitAuthorOriginsCache {
  private readonly entries = new Map<string, ICommitAuthorOriginsCacheEntry>()

  public constructor(
    private readonly loadOrigin: CommitAuthorOriginLoader,
    private readonly maximumEntries = DefaultMaximumEntries,
    private readonly maximumAgeMilliseconds = DefaultMaximumAgeMilliseconds,
    private readonly now = () => Date.now()
  ) {}

  public load(repository: Repository): Promise<ICommitAuthorOrigins> {
    const key = this.keyForRepository(repository)
    const now = this.now()
    const cached = this.entries.get(key)

    if (cached !== undefined) {
      const age = now - cached.startedAt
      if (age >= 0 && age <= this.maximumAgeMilliseconds) {
        // Touch the entry so the insertion-ordered map doubles as a tiny LRU.
        this.entries.delete(key)
        this.entries.set(key, cached)
        return cached.promise
      }
      this.entries.delete(key)
    }

    const promise = Promise.all([
      this.loadOrigin(repository, 'user.name'),
      this.loadOrigin(repository, 'user.email'),
    ]).then(([name, email]) => ({ name, email }))
    const entry = { promise, startedAt: now }
    this.entries.set(key, entry)
    this.trim()

    // A transient Git failure must not poison the memo for the full TTL.
    void promise.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key)
      }
    })

    return promise
  }

  /**
   * Global Git settings can affect every repository, while repository-local
   * settings only need their own entry evicted.
   */
  public invalidate(repository?: Repository): void {
    if (repository === undefined) {
      this.entries.clear()
      return
    }
    this.entries.delete(this.keyForRepository(repository))
  }

  private keyForRepository(repository: Repository): string {
    return `${repository.id}\0${repository.path}`
  }

  private trim(): void {
    while (this.entries.size > Math.max(0, this.maximumEntries)) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) {
        return
      }
      this.entries.delete(oldest)
    }
  }
}
