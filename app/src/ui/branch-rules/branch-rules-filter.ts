import { FilterMode } from '../../lib/fuzzy-find'
import { IEffectiveBranchRuleSource } from '../../lib/effective-branch-rules'
import {
  filterByMode,
  IStringListFilterResult,
} from '../lib/filter-string-list'

/**
 * Filter one of the inspector's enumerated value lists (required status-check
 * names, required deployment environments, or additional rule types) by the
 * shared fuzzy/substring/regex query. Order is preserved so the report reads the
 * same way whether or not a filter is active.
 */
export function filterBranchRuleValues(
  values: ReadonlyArray<string>,
  query: string,
  mode: FilterMode,
  caseSensitive: boolean
): IStringListFilterResult<string> {
  return filterByMode(values, value => [value], query, mode, caseSensitive)
}

/**
 * Filter the inspector's active rule sources by name and owner. An invalid
 * pattern preserves every source (and reports the error) so the sources card is
 * never emptied by a typo mid-pattern.
 */
export function filterBranchRuleSources(
  sources: ReadonlyArray<IEffectiveBranchRuleSource>,
  query: string,
  mode: FilterMode,
  caseSensitive: boolean
): IStringListFilterResult<IEffectiveBranchRuleSource> {
  return filterByMode(
    sources,
    source => [source.name, source.owner ?? ''],
    query,
    mode,
    caseSensitive
  )
}
