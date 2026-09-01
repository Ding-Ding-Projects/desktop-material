import * as Path from 'path'
import { CloningRepository } from '../../models/cloning-repository'
import { ICloneProgress } from '../../models/progress'
import { CloneOptions } from '../../models/clone-options'
import { IBatchCloneItem } from '../../models/batch-clone'
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
import {
  createBatchCloneRecoveryId,
  IBatchCloneStagingManager,
} from './batch-clone-staging'

/** The store in charge of repository currently being cloned. */
export class CloningRepositoriesStore extends BaseStore {
  private readonly _repositories = new Array<CloningRepository>()
  private readonly stateByID = new Map<number, ICloneProgress>()

  public constructor(
    private readonly getAccounts: () => Promise<
      ReadonlyArray<Account>
    > = async () => [],
    private readonly stagingManager: IBatchCloneStagingManager | null = null
  ) {
    super()
  }

  /**
   * Clone the repository at the URL to the path.
   *
   * Returns a {Promise} which resolves to whether the clone was successful.
   */
  public async clone(
    url: string,
    path: string,
    options: CloneOptions,
    opts?: {
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
  ): Promise<boolean> {
    const displayPath = opts?.displayPath ?? path
    const repository = new CloningRepository(displayPath, url)
    this._repositories.push(repository)

    const title = `Cloning into ${displayPath}`

    this.stateByID.set(repository.id, { kind: 'clone', title, value: 0 })
    this.emitUpdate()

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

    let success = true
    try {
      if (stagedItem !== null) {
        const prepared = await this.stagingManager!.prepare(stagedItem)
        if (prepared.kind === 'review') {
          throw prepared.error
        }
        if (prepared.kind === 'done') {
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
          await cloneRepo(
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

      if (stagedItem !== null) {
        const completed = await this.stagingManager!.completeAndPromote(
          stagedItem,
          clonePath,
          result.accountKey
        )
        if (completed.kind === 'review') {
          throw completed.error
        }
        if (!(await this.stagingManager!.cleanupPromoted(stagedItem))) {
          log.error(
            `The direct clone completed, but its staging cleanup needs review: ${path}`
          )
        }
      }
      repository.accountKey = result.accountKey
      opts?.onSuccess?.(result.accountKey)
    } catch (e) {
      success = false

      if (stagedItem !== null) {
        if (!(await this.stagingManager!.discard(stagedItem))) {
          log.error(
            `The failed direct clone staging could not be discarded safely: ${path}`
          )
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
