import { GitStore } from './git-store'
import { Repository } from '../../models/repository'
import { IAppShell } from '../app-shell'
import { IStatsStore } from '../stats'
import { Disposable } from 'event-kit'

interface IGitStoreCacheEntry {
  readonly store: GitStore
  readonly subscriptions: ReadonlyArray<Disposable>
}

export class GitStoreCache {
  /** GitStores keyed by their hash. */
  private readonly gitStores = new Map<string, IGitStoreCacheEntry>()

  public constructor(
    private readonly shell: IAppShell,
    private readonly statsStore: IStatsStore,
    private readonly onGitStoreUpdated: (
      repository: Repository,
      gitStore: GitStore
    ) => void,
    private readonly onDidError: (error: Error) => void
  ) {}

  public remove(repository: Repository) {
    const entry = this.gitStores.get(repository.hash)
    if (entry !== undefined) {
      this.gitStores.delete(repository.hash)
      for (const subscription of entry.subscriptions) {
        subscription.dispose()
      }
    }
  }

  public get(repository: Repository): GitStore {
    let entry = this.gitStores.get(repository.hash)
    if (entry === undefined) {
      const store = new GitStore(repository, this.shell, this.statsStore)
      entry = {
        store,
        subscriptions: [
          store.onDidUpdate(() => this.onGitStoreUpdated(repository, store)),
          store.onDidError(error => this.onDidError(error)),
        ],
      }

      this.gitStores.set(repository.hash, entry)
    }

    return entry.store
  }
}
