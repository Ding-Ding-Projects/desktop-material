import * as LocalStorage from '../local-storage'
import { Repository } from '../../models/repository'

const PinnedRepositoriesKey = 'pinned-repositories'

export function getPinnedRepositories(): ReadonlyArray<number> {
  return LocalStorage.getNumberArray(PinnedRepositoriesKey)
}

export function addPinnedRepository(repository: Repository): void {
  const pinned = getPinnedRepositories()
  if (!pinned.includes(repository.id)) {
    LocalStorage.setNumberArray(PinnedRepositoriesKey, [
      ...pinned,
      repository.id,
    ])
  }
}

export function removePinnedRepository(repository: Repository): void {
  LocalStorage.setNumberArray(
    PinnedRepositoriesKey,
    getPinnedRepositories().filter(id => id !== repository.id)
  )
}
