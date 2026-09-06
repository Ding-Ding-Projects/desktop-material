import * as Path from 'path'
import { CloningRepository } from '../../models/cloning-repository'
import { ICloneProgress } from '../../models/progress'
import { CloneOptions } from '../../models/clone-options'
import { IBatchCloneItem } from '../../models/batch-clone'
import { BatchCloneMode } from '../../models/batch-clone'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import { Account } from '../../models/account'

import { clone as cloneRepo } from '../git'
import {
  cloneWithAccountFallback,
  isCloneAbortError,
} from '../automation/clone-account-fallback'
import { ErrorWithMetadata } from '../error-with-metadata'
import { CloneProgressEtaEstimator } from '../progress/clone-eta'
import { BaseStore } from './base-store'
import { isClonePathSensitive } from '../path-validation'
import {
  createBatchCloneRecoveryId,
  IBatchCloneStagingManager,
} from './batch-clone-staging'
import {
  CurrentBatchCloneJournalVersion,
  FileBatchCloneJournal,
  IBatchCloneJournal,
} from './batch-clone-journal'
import { getPath } from '../../ui/main-process-proxy'

/** The store in charge of repository currently being cloned. */
export class CloningRepositoriesStore extends BaseStore {
  private readonly _repositories = new Array<CloningRepository>()
  private readonly stateByID = new Map<number, ICloneProgress>()
  private directCloneJournal: IBatchCloneJournal | null = null
  private directCloneMutex: Promise<void> = Promise.resolve()

  public constructor(
    private readonly getAccounts: () => Promise<
      ReadonlyArray<Account>
    > = async () => [],
    private readonly stagingManager: IBatchCloneStagingManager | null = null,
    private readonly cloneOperation: typeof cloneRepo = cloneRepo
  ) {
    super()
  }

  /** Discover and safely clear an interrupted direct clone at startup. */
  public async initializeDirectCloneRecovery(
    userDataPath?: string
  ): Promise<void> {
    const recoveryPath = userDataPath ?? (await getPath('userData'))
    if (this.directCloneJournal === null) {
      this.directCloneJournal = new FileBatchCloneJournal(
        recoveryPath,
        'clone-direct-v1.json'
      )
    }
    const snapshot = await this.directCloneJournal.load()
    if (snapshot === null || snapshot.items.length === 0) {
      return
    }
    if (snapshot.items.length !== 1 || this.stagingManager === null) {
      this.emitError(
        new Error(
          'An interrupted direct clone needs review. Its recovery record was retained because it could not be inspected safely.'
        )
      )
      return
    }

    const item = snapshot.items[0]
    const prepared = await this.stagingManager.prepare(item)
    if (prepared.kind === 'done') {
      if (await this.stagingManager.cleanupPromoted(item)) {
        await this.directCloneJournal.clear()
        return
      }
      this.emitError(
        new Error(
          'A promoted direct clone was verified, but its recovery cleanup is still pending. The recovery record was retained.'
        )
      )
      return
    }
    if (
      prepared.kind === 'clone' &&
      (await this.stagingManager.discard(item))
    ) {
      await this.directCloneJournal.clear()
      this.emitError(
        new Error(
          'An interrupted direct clone was safely discarded. Choose Clone again to retry it.'
        )
      )
      return
    }
    this.emitError(
      prepared.kind === 'review'
        ? prepared.error
        : new Error(
            'An interrupted direct clone needs review. Its recovery data was left unchanged.'
          )
    )
  }

  /**
   * Clone the repository at the URL to the path.
   *
   * Returns a {Promise} which resolves to whether the clone was successful.
   */
  public clone(
    url: string,
    path: string,
    options: CloneOptions,
    opts?: Parameters<CloningRepositoriesStore['cloneInternal']>[3]
  ): Promise<boolean> {
    const directStaging =
      this.stagingManager !== null && opts?.displayPath === undefined
    const displayPath = opts?.displayPath ?? path
    const repository = new CloningRepository(displayPath, url)
    this._repositories.push(repository)

    const title = `Cloning into ${displayPath}`
    this.stateByID.set(repository.id, { kind: 'clone', title, value: 0 })
    this.emitUpdate()

    // Register the model before acquiring the direct-clone mutex. Callers use
    // the returned synchronous store state to select the active clone while a
    // preceding staged clone may still own the journal.
    const operation = () =>
      this.cloneInternal(url, path, options, opts, repository)
    return directStaging ? this.withDirectCloneMutex(operation) : operation()
  }

  private async withDirectCloneMutex(
    operation: () => Promise<boolean>
  ): Promise<boolean> {
    const previous = this.directCloneMutex
    let release: () => void = () => undefined
    this.directCloneMutex = new Promise<void>(resolve => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async cloneInternal(
    url: string,
    path: string,
    options: CloneOptions,
    opts:
      | {
          /**
           * When provided the error is passed here instead of being emitted as a
           * global error. Used by batch clone so a failing repo yields a batch
           * summary rather than a per-repo error dialog.
           */
          readonly onError?: (error: Error) => void
          /**
           * Called with each raw progress event, on top of the store's own
           * bookkeeping, so composing stores can mirror progress per item.
           */
          readonly onProgress?: (progress: ICloneProgress) => void
          /** Called after clone succeeds with the identity that completed it. */
          readonly onSuccess?: (accountKey: string | null) => void
          /** User-visible destination when Git writes into an app-owned staging path. */
          readonly displayPath?: string
          /** Cancels the owned Git clone and prevents account fallback attempts. */
          readonly signal?: AbortSignal
          /** Called for an intentional abort instead of routing a clone error. */
          readonly onAbort?: () => void
        }
      | undefined,
    repository: CloningRepository
  ): Promise<boolean> {
    // A fresh estimator per clone: the rolling rate window must not carry over
    // between repositories sharing this store.
    const etaEstimator = new CloneProgressEtaEstimator()

    const stagedItem: IBatchCloneItem | null =
      this.stagingManager !== null && opts?.displayPath === undefined
        ? {
            url,
            name: Path.basename(Path.resolve(path)) || 'repository',
            path,
            recoveryId: createBatchCloneRecoveryId(),
          }
        : null
    let clonePath = path
    let journalOwned = false

    let success = true
    try {
      if (isClonePathSensitive(path)) {
        throw new Error(
          `The clone destination "${path}" targets a sensitive system location. Choose another folder and try again.`
        )
      }
      if (stagedItem !== null) {
        if (this.directCloneJournal === null) {
          throw new Error(
            'Direct clone recovery is not initialized, so the clone was not started.'
          )
        }
        await this.reconcileRetainedDirectRecovery()
        await this.directCloneJournal.save({
          version: CurrentBatchCloneJournalVersion,
          updatedAt: new Date().toISOString(),
          items: [stagedItem],
          statuses: [[stagedItem.path, { kind: 'cloning' }]],
          mode: BatchCloneMode.Sequential,
          source: 'manual' as const,
          paused: false,
          generation: 1,
        })
        journalOwned = true
        const prepared = await this.stagingManager!.prepare(stagedItem)
        if (prepared.kind === 'review') {
          throw prepared.error
        }
        if (prepared.kind === 'done') {
          await this.directCloneJournal.clear()
          repository.accountKey = prepared.accountKey
          opts?.onSuccess?.(prepared.accountKey)
          this.remove(repository)
          return true
        }
        clonePath = prepared.clonePath
      }

      let attempt = 0
      const result = await cloneWithAccountFallback(
        url,
        this.getAccounts,
        options.accountKey ?? null,
        async accountKey => {
          if (attempt > 0 && stagedItem !== null) {
            if (!(await this.stagingManager!.discard(stagedItem))) {
              throw new Error(
                'The previous clone attempt could not be discarded safely.'
              )
            }
            const prepared = await this.stagingManager!.prepare(stagedItem)
            if (prepared.kind !== 'clone') {
              throw new Error(
                'The clone staging directory changed before the retry could start.'
              )
            }
            clonePath = prepared.clonePath
          }
          attempt += 1
          await this.cloneOperation(
            url,
            clonePath,
            options,
            progress => {
              const etaSeconds = etaEstimator.record(progress.value)
              const enriched =
                etaSeconds !== undefined
                  ? { ...progress, etaSeconds }
                  : progress
              this.stateByID.set(repository.id, enriched)
              opts?.onProgress?.(enriched)
              this.emitUpdate()
            },
            accountKey,
            opts?.signal
          )
        },
        opts?.signal
      )

      if (opts?.signal?.aborted) {
        const error = new Error('Repository clone cancelled.')
        error.name = 'AbortError'
        throw error
      }

      if (stagedItem !== null) {
        const completed = await this.stagingManager!.completeAndPromote(
          stagedItem,
          clonePath,
          result.accountKey,
          opts?.signal
        )
        if (completed.kind === 'review') {
          throw completed.error
        }
        if (!(await this.stagingManager!.cleanupPromoted(stagedItem))) {
          const cleanupError = new Error(
            `The clone completed, but its recovery cleanup could not be verified for ${path}. The repository is usable; retry cleanup from the recovery notification.`
          )
          this.emitError(cleanupError)
        } else {
          await this.directCloneJournal!.clear()
        }
      }
      repository.accountKey = result.accountKey
      opts?.onSuccess?.(result.accountKey)
    } catch (e) {
      success = false

      if (stagedItem !== null) {
        const discarded = await this.stagingManager!.discard(stagedItem)
        if (!discarded) {
          log.error(
            `The failed direct clone staging could not be discarded safely: ${path}`
          )
        }
        if (discarded && journalOwned) {
          await this.directCloneJournal?.clear()
        }
      }

      if (opts?.signal?.aborted || isCloneAbortError(e)) {
        opts?.onAbort?.()
        this.remove(repository)
        return false
      }

      const retryAction: RetryAction = {
        type: RetryActionType.Clone,
        name: repository.name,
        url,
        path,
        options,
      }
      e = new ErrorWithMetadata(e, { retryAction, repository })

      if (opts?.onError !== undefined) {
        opts.onError(e)
      } else {
        this.emitError(e)
      }
    }

    this.remove(repository)

    return success
  }

  private async reconcileRetainedDirectRecovery(): Promise<void> {
    const journal = this.directCloneJournal
    if (journal === null) {
      return
    }
    const snapshot = await journal.load()
    if (snapshot === null || snapshot.items.length === 0) {
      return
    }
    if (snapshot.items.length !== 1 || this.stagingManager === null) {
      throw new Error(
        'A previous direct clone recovery is still pending. Review it before starting another direct clone.'
      )
    }

    const item = snapshot.items[0]
    const prepared = await this.stagingManager.prepare(item)
    if (prepared.kind === 'done') {
      if (await this.stagingManager.cleanupPromoted(item)) {
        await journal.clear()
        return
      }
      throw new Error(
        'A previous direct clone was verified, but its recovery cleanup is still pending. Choose another action after the recovery notification is resolved.'
      )
    }
    if (
      prepared.kind === 'clone' &&
      (await this.stagingManager.discard(item))
    ) {
      await journal.clear()
      return
    }
    throw new Error(
      prepared.kind === 'review'
        ? `A previous direct clone recovery needs review before another clone can start: ${prepared.error.message}`
        : 'A previous direct clone recovery is still pending. Its recovery data was left unchanged.'
    )
  }

  /** Get the repositories currently being cloned. */
  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this._repositories)
  }

  /** Get the state of the repository. */
  public getRepositoryState(
    repository: CloningRepository
  ): ICloneProgress | null {
    return this.stateByID.get(repository.id) || null
  }

  /** Remove the repository. */
  public remove(repository: CloningRepository) {
    this.stateByID.delete(repository.id)

    const repoIndex = this._repositories.findIndex(r => r.id === repository.id)
    if (repoIndex > -1) {
      this._repositories.splice(repoIndex, 1)
    }

    this.emitUpdate()
  }
}
