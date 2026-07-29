import { randomUUID } from 'crypto'
import { win32 as WindowsPath } from 'path'

interface IProfileRepositoryLease {
  readonly id: string
  readonly ownerId: number
  readonly documentId: number
  readonly repositoryKey: string
}

interface IProfileRepositoryLockRequest {
  readonly ownerId: number
  readonly documentId: number
  readonly resolve: (leaseId: string) => void
  readonly reject: (error: Error) => void
}

interface IProfileRepositoryLockState {
  holder: IProfileRepositoryLease | undefined
  queue: IProfileRepositoryLockRequest[]
}

/**
 * Normalize one absolute Windows repository path into its process-wide lock
 * key. Repository history exists both under userData and in ordinary working
 * repositories, so this helper intentionally does not impose a parent root.
 */
export function normalizeProfileRepositoryPath(repositoryPath: string): string {
  if (
    typeof repositoryPath !== 'string' ||
    repositoryPath.length === 0 ||
    repositoryPath.includes('\0') ||
    !WindowsPath.isAbsolute(repositoryPath)
  ) {
    throw new TypeError('An absolute Windows repository path is required.')
  }

  return WindowsPath.resolve(repositoryPath).toLowerCase()
}

/**
 * Validate an untrusted renderer path and return its canonical lock key.
 *
 * This is deliberately lexical: the main process supplies its trusted
 * user-data root and rejects anything other than a direct descendant before a
 * filesystem operation can occur.
 */
export function normalizeProfileRepositoryPathWithinUserData(
  userDataRoot: string,
  repositoryPath: string
): string {
  if (
    typeof userDataRoot !== 'string' ||
    userDataRoot.length === 0 ||
    userDataRoot.includes('\0') ||
    !WindowsPath.isAbsolute(userDataRoot)
  ) {
    throw new TypeError('An absolute Windows user-data root is required.')
  }
  if (
    typeof repositoryPath !== 'string' ||
    repositoryPath.length === 0 ||
    repositoryPath.includes('\0') ||
    !WindowsPath.isAbsolute(repositoryPath)
  ) {
    throw new TypeError(
      'An absolute Windows profile repository path is required.'
    )
  }

  const hasParentSegment = (value: string) =>
    value.split(/[\\/]+/).some(segment => segment === '..')
  if (hasParentSegment(userDataRoot) || hasParentSegment(repositoryPath)) {
    throw new TypeError('Profile repository path traversal is not allowed.')
  }

  const normalizedRoot = normalizeProfileRepositoryPath(userDataRoot)
  const normalizedRepository = normalizeProfileRepositoryPath(repositoryPath)
  const relativePath = WindowsPath.relative(
    normalizedRoot,
    normalizedRepository
  )

  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${WindowsPath.sep}`) ||
    WindowsPath.isAbsolute(relativePath)
  ) {
    throw new TypeError(
      'Profile repository path must be inside the Windows user-data root.'
    )
  }

  return normalizedRepository
}

/**
 * Raised when a renderer document disappears before its lock request is
 * granted.
 */
export class ProfileRepositoryLockCancelledError extends Error {
  public constructor() {
    super(
      'The profile repository lock request document is no longer available.'
    )
    this.name = 'ProfileRepositoryLockCancelledError'
  }
}

/**
 * Serializes profile repository work inside the main process.
 *
 * A lease belongs to the exact renderer document which requested it. Replacing
 * that document cancels its queued requests and releases its active leases so a
 * replacement document cannot wait forever behind an owner which no longer
 * exists.
 */
export class ProfileRepositoryLockRegistry {
  private readonly locks = new Map<string, IProfileRepositoryLockState>()
  private readonly leases = new Map<string, IProfileRepositoryLease>()

  public constructor(
    private readonly createLeaseId: () => string = randomUUID
  ) {}

  /**
   * Acquire an exclusive lease for a Windows repository path.
   *
   * Requests for equivalent paths are granted in arrival order.
   */
  public acquire(
    ownerId: number,
    repositoryPath: string,
    documentId = 0
  ): Promise<string> {
    this.validateOwnerId(ownerId)
    this.validateDocumentId(documentId)
    const repositoryKey = this.normalizeRepositoryPath(repositoryPath)
    let lock = this.locks.get(repositoryKey)

    if (lock === undefined) {
      lock = { holder: undefined, queue: [] }
      this.locks.set(repositoryKey, lock)
    }

    if (lock.holder === undefined) {
      return Promise.resolve(
        this.grant(ownerId, documentId, repositoryKey, lock)
      )
    }

    return new Promise<string>((resolve, reject) => {
      lock!.queue.push({ ownerId, documentId, resolve, reject })
    })
  }

  /**
   * Release a lease only when the requesting renderer document owns it.
   */
  public release(ownerId: number, leaseId: string, documentId = 0): boolean {
    this.validateOwnerId(ownerId)
    this.validateDocumentId(documentId)
    const lease = this.leases.get(leaseId)
    if (
      lease === undefined ||
      lease.ownerId !== ownerId ||
      lease.documentId !== documentId
    ) {
      return false
    }

    this.releaseLease(lease)
    return true
  }

  /**
   * Cancel only requests which have not acquired a lease yet.
   */
  public cancelQueuedSender(ownerId: number): void {
    this.validateOwnerId(ownerId)
    this.cancelQueuedRequests(ownerId)
  }

  /**
   * Cancel queued work and release active leases for one replaced document.
   */
  public releaseDocument(ownerId: number, documentId: number): void {
    this.validateOwnerId(ownerId)
    this.validateDocumentId(documentId)
    // Cancel first so releasing an active lease cannot grant queued work back
    // to the document which is being replaced.
    this.cancelQueuedRequests(ownerId, documentId)

    for (const lease of Array.from(this.leases.values())) {
      if (lease.ownerId === ownerId && lease.documentId === documentId) {
        this.releaseLease(lease)
      }
    }
  }

  /**
   * Cancel every queued request and release every lease owned by a renderer.
   */
  public releaseSender(ownerId: number): void {
    this.validateOwnerId(ownerId)
    // Cancel queued work first. Otherwise releasing one of this sender's
    // leases could immediately grant another request back to a dead renderer.
    this.cancelQueuedRequests(ownerId)

    for (const lease of Array.from(this.leases.values())) {
      if (lease.ownerId === ownerId) {
        this.releaseLease(lease)
      }
    }
  }

  private cancelQueuedRequests(ownerId: number, documentId?: number): void {
    for (const [repositoryKey, lock] of this.locks) {
      const retained: IProfileRepositoryLockRequest[] = []
      for (const request of lock.queue) {
        if (
          request.ownerId === ownerId &&
          (documentId === undefined || request.documentId === documentId)
        ) {
          request.reject(new ProfileRepositoryLockCancelledError())
        } else {
          retained.push(request)
        }
      }
      lock.queue = retained
      this.deleteUnusedLock(repositoryKey, lock)
    }
  }

  private validateOwnerId(ownerId: number): void {
    if (!Number.isSafeInteger(ownerId) || ownerId < 0) {
      throw new TypeError('A non-negative integer lock owner id is required.')
    }
  }

  private validateDocumentId(documentId: number): void {
    if (!Number.isSafeInteger(documentId) || documentId < 0) {
      throw new TypeError(
        'A non-negative integer lock document id is required.'
      )
    }
  }

  private normalizeRepositoryPath(repositoryPath: string): string {
    // Desktop Material is Windows-only. Normalize explicitly with win32 so
    // platform-neutral unit runners exercise the same case-insensitive keys.
    return normalizeProfileRepositoryPath(repositoryPath)
  }

  private grant(
    ownerId: number,
    documentId: number,
    repositoryKey: string,
    lock: IProfileRepositoryLockState
  ): string {
    let leaseId = this.createLeaseId()
    while (this.leases.has(leaseId)) {
      leaseId = this.createLeaseId()
    }

    const lease = { id: leaseId, ownerId, documentId, repositoryKey }
    lock.holder = lease
    this.leases.set(leaseId, lease)
    return leaseId
  }

  private releaseLease(lease: IProfileRepositoryLease): void {
    const lock = this.locks.get(lease.repositoryKey)
    if (lock === undefined || lock.holder !== lease) {
      return
    }

    this.leases.delete(lease.id)
    lock.holder = undefined

    const next = lock.queue.shift()
    if (next !== undefined) {
      next.resolve(
        this.grant(next.ownerId, next.documentId, lease.repositoryKey, lock)
      )
    } else {
      this.deleteUnusedLock(lease.repositoryKey, lock)
    }
  }

  private deleteUnusedLock(
    repositoryKey: string,
    lock: IProfileRepositoryLockState
  ): void {
    if (lock.holder === undefined && lock.queue.length === 0) {
      this.locks.delete(repositoryKey)
    }
  }
}
