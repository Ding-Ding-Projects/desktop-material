import { ICompareFormUpdate, ICompareState } from './app-state'

/**
 * Whether a partial compare-form update changes anything users can see.
 *
 * Compare-form updates emit through the root AppStore. Treating an identical
 * value as a mutation therefore schedules a full renderer update for no visual
 * result, which is especially noticeable while switching Changes and History.
 */
export function compareFormUpdateChangesState(
  current: Pick<ICompareState, 'filterText' | 'showBranchList'>,
  update: Partial<ICompareFormUpdate>
): boolean {
  return (
    (update.filterText !== undefined &&
      update.filterText !== current.filterText) ||
    (update.showBranchList !== undefined &&
      update.showBranchList !== current.showBranchList)
  )
}
