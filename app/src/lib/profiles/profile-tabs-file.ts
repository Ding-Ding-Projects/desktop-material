import {
  emptyProfileTabsState,
  IProfileTabsState,
} from '../../models/repository-tab'
import { PrimaryWindowScope } from '../window-scope'

interface IProfileTabsFile {
  readonly version?: number
  readonly tabs?: unknown
  readonly activeTabId?: unknown
  readonly windows?: unknown
}

function asTabsState(value: unknown): IProfileTabsState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const candidate = value as {
    readonly tabs?: unknown
    readonly activeTabId?: unknown
  }
  if (!Array.isArray(candidate.tabs)) {
    return null
  }
  if (
    candidate.activeTabId !== null &&
    typeof candidate.activeTabId !== 'string' &&
    candidate.activeTabId !== undefined
  ) {
    return null
  }
  return {
    tabs: candidate.tabs,
    activeTabId: candidate.activeTabId ?? null,
  }
}

function windowStates(
  file: IProfileTabsFile
): Record<string, IProfileTabsState> {
  if (typeof file.windows !== 'object' || file.windows === null) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(file.windows).flatMap(([scope, value]) => {
      const state = asTabsState(value)
      return state === null ? [] : [[scope, state]]
    })
  )
}

/** Read one window's state, migrating the legacy single-window shape. */
export function readWindowTabsState(
  value: unknown,
  scope: string
): IProfileTabsState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const file = value as IProfileTabsFile
  const scoped = windowStates(file)[scope]
  if (scoped !== undefined) {
    return scoped
  }
  return scope === PrimaryWindowScope ? asTabsState(file) : null
}

/** Merge one window without overwriting tab state owned by other windows. */
export function mergeWindowTabsState(
  value: unknown,
  scope: string,
  state: IProfileTabsState,
  version: number
): object {
  const file =
    typeof value === 'object' && value !== null
      ? (value as IProfileTabsFile)
      : {}
  const states = windowStates(file)
  const legacyPrimary = asTabsState(file)
  if (states[PrimaryWindowScope] === undefined && legacyPrimary !== null) {
    states[PrimaryWindowScope] = legacyPrimary
  }
  states[scope] = state

  const primary = states[PrimaryWindowScope] ?? emptyProfileTabsState
  return {
    version,
    tabs: primary.tabs,
    activeTabId: primary.activeTabId,
    windows: states,
  }
}
