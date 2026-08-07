import { getPersistedLanguageMode, translate } from '../../../lib/i18n'
import { Branch } from '../../../models/branch'
import { IBranchListItem } from '../../branches'
import { IListFilter } from '../../lib/filter-list-mode'

export const NotUpdatedWithDefaultBranchFilterId =
  'not-updated-with-default-branch'

export function createNotUpdatedWithDefaultBranchFilter(
  defaultBranch: Branch | null,
  notUpdatedBranchNames: ReadonlySet<string>
): IListFilter<IBranchListItem> | null {
  if (defaultBranch === null) {
    return null
  }

  return {
    id: NotUpdatedWithDefaultBranchFilterId,
    label: translate(
      'branch.filter.notUpdatedWith',
      getPersistedLanguageMode(),
      { branch: defaultBranch.name }
    ),
    predicate: (item: IBranchListItem) =>
      notUpdatedBranchNames.has(item.branch.name),
  }
}
