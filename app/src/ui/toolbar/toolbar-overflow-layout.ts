export interface IToolbarOverflowLayoutItem {
  readonly id: string
  readonly preferredWidth: number
  /**
   * Lower values move into overflow first. Items without a priority are pinned
   * to the toolbar.
   */
  readonly overflowPriority?: number
}

export interface IToolbarOverflowLayout {
  readonly overflowedItemIds: ReadonlyArray<string>
  /** Pinned items alone do not fit and need the compact icon fallback. */
  readonly exhausted: boolean
}

function getRequiredWidth(
  visibleItems: ReadonlyArray<IToolbarOverflowLayoutItem>,
  gap: number,
  overflowButtonWidth: number,
  hasOverflow: boolean
): number {
  const visibleWidth = visibleItems.reduce(
    (total, item) => total + Math.max(0, item.preferredWidth),
    0
  )
  const itemCount = visibleItems.length + (hasOverflow ? 1 : 0)
  const gapsWidth = Math.max(0, itemCount - 1) * Math.max(0, gap)

  return visibleWidth + gapsWidth + (hasOverflow ? overflowButtonWidth : 0)
}

/**
 * Select the lowest-priority controls to place in overflow for the current
 * measured toolbar width. The function is deliberately pure so every resize
 * recomputes from scratch and widening restores controls deterministically.
 */
export function calculateToolbarOverflow(
  availableWidth: number,
  gap: number,
  overflowButtonWidth: number,
  items: ReadonlyArray<IToolbarOverflowLayoutItem>
): IToolbarOverflowLayout {
  const visibleItems = [...items]
  const overflowed = new Set<string>()
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(
      (
        candidate
      ): candidate is {
        readonly item: IToolbarOverflowLayoutItem & {
          readonly overflowPriority: number
        }
        readonly index: number
      } => candidate.item.overflowPriority !== undefined
    )
    .sort(
      (left, right) =>
        left.item.overflowPriority - right.item.overflowPriority ||
        right.index - left.index
    )

  while (
    getRequiredWidth(
      visibleItems,
      gap,
      overflowButtonWidth,
      overflowed.size > 0
    ) > availableWidth &&
    candidates.length > 0
  ) {
    const candidate = candidates.shift()!
    overflowed.add(candidate.item.id)

    const visibleIndex = visibleItems.findIndex(
      item => item.id === candidate.item.id
    )
    if (visibleIndex !== -1) {
      visibleItems.splice(visibleIndex, 1)
    }
  }

  const exhausted =
    getRequiredWidth(
      visibleItems,
      gap,
      overflowButtonWidth,
      overflowed.size > 0
    ) > availableWidth

  return {
    overflowedItemIds: items
      .filter(item => overflowed.has(item.id))
      .map(item => item.id),
    exhausted,
  }
}
