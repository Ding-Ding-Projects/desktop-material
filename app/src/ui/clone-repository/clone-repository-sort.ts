import { getEnum } from '../../lib/local-storage'
import {
  CloneRepositorySortOrder,
  DefaultCloneRepositorySortOrder,
} from './group-repositories'

const CloneRepositorySortOrderKey = 'clone-repository-sort-order'

/** Restore the clone-list order, safely falling back for old or corrupt data. */
export function readPersistedCloneRepositorySortOrder(): CloneRepositorySortOrder {
  if (typeof localStorage === 'undefined') {
    return DefaultCloneRepositorySortOrder
  }

  return (
    getEnum(CloneRepositorySortOrderKey, CloneRepositorySortOrder) ??
    DefaultCloneRepositorySortOrder
  )
}

/** Persist a user-selected clone-list order for subsequent dialog openings. */
export function persistCloneRepositorySortOrder(
  order: CloneRepositorySortOrder
) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CloneRepositorySortOrderKey, order)
  }
}
