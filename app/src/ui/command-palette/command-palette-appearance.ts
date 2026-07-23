import { MaterialSymbolName } from '../lib/material-symbol'

/** Row height preset for the command palette result list. */
export type CommandPaletteDensity = 'comfortable' | 'compact'

/**
 * The persisted look of the command palette result list. Every field is a
 * pure presentation choice; none of them changes which commands are offered
 * or what executing one does.
 */
export interface ICommandPaletteAppearance {
  readonly density: CommandPaletteDensity
  /** Show the leading Material Symbol for each row. */
  readonly showIcons: boolean
  /** Show the group chip (Navigate, Repository, …) on each row. */
  readonly showGroups: boolean
  /** Show the secondary keyword line under the title. */
  readonly showKeywords: boolean
}

export const DefaultCommandPaletteAppearance: ICommandPaletteAppearance = {
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
