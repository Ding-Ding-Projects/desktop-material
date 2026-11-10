/** Counts for the Repository tools category chips and the line under them. */

export interface IToolCategoryCount<TCategory extends string> {
  readonly category: TCategory | 'All'
  readonly count: number
}

/**
 * `All` first, then every category that has at least one tool, in the given
 * order. Categories with no tools are left out so a chip never filters to an
 * empty list.
 */
export function countToolCategories<TCategory extends string>(
  entries: ReadonlyArray<{ readonly category: TCategory }>,
  order: ReadonlyArray<TCategory>
): ReadonlyArray<IToolCategoryCount<TCategory>> {
  const counts = new Map<TCategory, number>()
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1)
  }
  return [
    { category: 'All' as const, count: entries.length },
    ...order
      .filter(category => (counts.get(category) ?? 0) > 0)
      .map(category => ({ category, count: counts.get(category) ?? 0 })),
  ]
}

/** One plain sentence: how many tools are listed out of how many. */
export function describeToolStatistics(shown: number, total: number): string {
  const tools = total === 1 ? 'tool' : 'tools'
  return shown === total
    ? `${total} ${tools}`
    : `${shown} of ${total} ${tools} shown`
}
