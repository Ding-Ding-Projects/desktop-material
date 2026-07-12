/**
 * Per-tab title styling. Every field is optional; an unset field falls back to
 * the default tab appearance.
 */
export interface ITabTitleStyle {
  /** Font size in px (clamped to a sensible range when applied). */
  readonly fontSize?: number
  /** Text color as a validated CSS hex color or a curated token. */
  readonly color?: string
  /** Background color as a validated CSS hex color or a curated token. */
  readonly backgroundColor?: string
  /** Font family family bucket. */
  readonly fontFamily?: 'system' | 'serif' | 'monospace'
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly textAlign?: 'left' | 'center' | 'right'
}

/** A browser-style tab bound to an open repository. */
export interface IRepositoryTab {
  /** Stable identity, unchanged across rename and reorder. */
  readonly id: string
  /** The Dexie id of the repository this tab represents. */
  readonly repositoryId: number
  /** The repository path, used to re-bind if the repository is re-added. */
  readonly repositoryPath: string
  /** A custom label overriding the repository name, or null to use the name. */
  readonly customLabel: string | null
  /** Per-tab title styling, or null for the default appearance. */
  readonly titleStyle: ITabTitleStyle | null
}

/** The full tab state for a single profile. */
export interface IProfileTabsState {
  readonly tabs: ReadonlyArray<IRepositoryTab>
  readonly activeTabId: string | null
}

/** The empty tab state used before any tabs are opened. */
export const emptyProfileTabsState: IProfileTabsState = {
  tabs: [],
  activeTabId: null,
}

/** Allowed font-size range (px) for a tab title. */
export const MinTabFontSize = 10
export const MaxTabFontSize = 20

/** Clamp a requested tab font size into the supported range. */
export function clampTabFontSize(size: number): number {
  return Math.min(MaxTabFontSize, Math.max(MinTabFontSize, Math.round(size)))
}

const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * Validate a color string for safe inline-style use. Only hex colors are
 * accepted so an untrusted value can never inject arbitrary CSS.
 */
export function isValidTabColor(color: string): boolean {
  return hexColorPattern.test(color)
}

/**
 * Produce a React inline-style object from a tab title style, dropping any
 * value that fails validation so it can never inject arbitrary CSS.
 */
export function tabTitleStyleToCss(
  style: ITabTitleStyle | null
): React.CSSProperties {
  if (style === null) {
    return {}
  }

  const css: React.CSSProperties = {}

  if (style.fontSize !== undefined) {
    css.fontSize = `${clampTabFontSize(style.fontSize)}px`
  }
  if (style.color !== undefined && isValidTabColor(style.color)) {
    css.color = style.color
  }
  if (
    style.backgroundColor !== undefined &&
    isValidTabColor(style.backgroundColor)
  ) {
    css.backgroundColor = style.backgroundColor
  }
  if (style.fontFamily === 'serif') {
    css.fontFamily = 'Georgia, "Times New Roman", serif'
  } else if (style.fontFamily === 'monospace') {
    css.fontFamily = 'var(--font-family-monospace, monospace)'
  }
  if (style.bold) {
    css.fontWeight = 'bold'
  }
  if (style.italic) {
    css.fontStyle = 'italic'
  }
  if (style.underline) {
    css.textDecoration = 'underline'
  }
  if (style.textAlign !== undefined) {
    css.textAlign = style.textAlign
  }

  return css
}
