/** Inputs that decide whether live Agents diff polling is visible and useful. */
export interface IAgentSessionPollingContext {
  readonly repositoryFoldoutOpen: boolean
  readonly agentsViewSelected: boolean
  readonly hasRepositorySelection: boolean
  readonly repositoryIsSubmodule: boolean
}

/**
 * Poll only while the selected regular repository's Agents panel is visible.
 * The app calls this for every selection, sidebar-view, and foldout transition.
 */
export function shouldPollAgentSessionDiffs(
  context: IAgentSessionPollingContext
): boolean {
  return (
    context.repositoryFoldoutOpen &&
    context.agentsViewSelected &&
    context.hasRepositorySelection &&
    !context.repositoryIsSubmodule
  )
}
