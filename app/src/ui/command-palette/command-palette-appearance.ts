import { MaterialSymbolName } from '../lib/material-symbol'

/** Row height preset for the command palette result list. */
export type CommandPaletteDensity = 'comfortable' | 'compact'

/** How the result-row appearance is selected. */
export type CommandPaletteAppearanceMode = 'manual' | 'random-per-repository'

/**
 * The persisted look of the command palette result list. Every field is a
 * pure presentation choice; none of them changes which commands are offered
 * or what executing one does.
 */
export interface ICommandPaletteAppearance {
  readonly mode: CommandPaletteAppearanceMode
  readonly density: CommandPaletteDensity
  /** Show the leading Material Symbol for each row. */
  readonly showIcons: boolean
  /** Show the group chip (Navigate, Repository, …) on each row. */
  readonly showGroups: boolean
  /** Show the secondary keyword line under the title. */
  readonly showKeywords: boolean
}

export const DefaultCommandPaletteAppearance: ICommandPaletteAppearance = {
  mode: 'manual',
  density: 'comfortable',
  showIcons: true,
  showGroups: true,
  showKeywords: true,
}

const StorageKey = 'command-palette-appearance-v1'

/** Read the persisted appearance, falling back to the default on any error. */
export function readCommandPaletteAppearance(): ICommandPaletteAppearance {
  try {
    const raw = localStorage.getItem(StorageKey)
    if (raw === null) {
      return DefaultCommandPaletteAppearance
    }
    const parsed = JSON.parse(raw) as Partial<ICommandPaletteAppearance>
    return {
      mode:
        parsed.mode === 'random-per-repository' || parsed.mode === 'manual'
          ? parsed.mode
          : DefaultCommandPaletteAppearance.mode,
      density:
        parsed.density === 'compact' || parsed.density === 'comfortable'
          ? parsed.density
          : DefaultCommandPaletteAppearance.density,
      showIcons:
        typeof parsed.showIcons === 'boolean'
          ? parsed.showIcons
          : DefaultCommandPaletteAppearance.showIcons,
      showGroups:
        typeof parsed.showGroups === 'boolean'
          ? parsed.showGroups
          : DefaultCommandPaletteAppearance.showGroups,
      showKeywords:
        typeof parsed.showKeywords === 'boolean'
          ? parsed.showKeywords
          : DefaultCommandPaletteAppearance.showKeywords,
    }
  } catch {
    return DefaultCommandPaletteAppearance
  }
}

/** Persist the appearance, ignoring storage failures. */
export function persistCommandPaletteAppearance(
  appearance: ICommandPaletteAppearance
): void {
  try {
    localStorage.setItem(StorageKey, JSON.stringify(appearance))
  } catch {
    // Appearance is a convenience; a storage failure must not block the
    // palette from opening or running a command.
  }
}

const RandomRepositoryAppearances: ReadonlyArray<
  Omit<ICommandPaletteAppearance, 'mode'>
> = [
  {
    density: 'comfortable',
    showIcons: true,
    showGroups: true,
    showKeywords: true,
  },
  {
    density: 'compact',
    showIcons: true,
    showGroups: true,
    showKeywords: false,
  },
  {
    density: 'compact',
    showIcons: true,
    showGroups: false,
    showKeywords: false,
  },
  {
    density: 'comfortable',
    showIcons: false,
    showGroups: true,
    showKeywords: true,
  },
  {
    density: 'comfortable',
    showIcons: true,
    showGroups: false,
    showKeywords: true,
  },
  {
    density: 'compact',
    showIcons: false,
    showGroups: true,
    showKeywords: false,
  },
]

function stableRepositoryHash(repositoryKey: string): number {
  let hash = 2166136261
  for (let index = 0; index < repositoryKey.length; index++) {
    hash ^= repositoryKey.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Resolve the stored appearance for the active repository. Random mode is
 * deterministic: a repository keeps the same variant across palette opens and
 * restarts, while switching repositories may select a different variant.
 */
export function resolveCommandPaletteAppearance(
  appearance: ICommandPaletteAppearance,
  repositoryKey: string | undefined
): ICommandPaletteAppearance {
  if (
    appearance.mode !== 'random-per-repository' ||
    repositoryKey === undefined ||
    repositoryKey.length === 0
  ) {
    return appearance
  }

  const variant =
    RandomRepositoryAppearances[
      stableRepositoryHash(repositoryKey) % RandomRepositoryAppearances.length
    ]
  return { mode: appearance.mode, ...variant }
}

/** The icon shown for a command group when the command declares none. */
const GroupSymbols: ReadonlyMap<string, MaterialSymbolName> = new Map<
  string,
  MaterialSymbolName
>([
  ['App', 'settings'],
  ['Branch', 'call_split'],
  ['Changes', 'difference'],
  ['Edit', 'edit'],
  ['Navigate', 'account_tree'],
  ['Repository', 'database'],
])

/**
 * Resolve a row icon: the command's own symbol when it declares one, then its
 * group's symbol, then a neutral fallback so every row keeps the same
 * leading alignment.
 */
export function resolveCommandSymbol(
  group: string,
  materialSymbol?: MaterialSymbolName
): MaterialSymbolName {
  return materialSymbol ?? GroupSymbols.get(group) ?? 'category'
}
