import {
  DefaultAppIdentityCustomization,
  IAppIdentityCustomization,
  normalizeAppIdentityCustomization,
} from './app-identity'
import {
  DefaultRepositoryLogoDesign,
  IRepositoryLogoDesign,
  normalizeRepositoryLogoDesign,
  RepositoryLogoDesignVersion,
} from './repository-logo'
import { ITabTitleStyle, normalizeTabTitleStyle } from './repository-tab'
import {
  LanguageMode,
  languageModes,
  normalizeLanguageMode,
} from './language-mode'

/** The persisted appearance schema version. */
export const AppearanceCustomizationVersion = 1 as const

export type AccentPalette =
  | 'blue'
  | 'violet'
  | 'teal'
  | 'green'
  | 'amber'
  | 'rose'
export type UpdateProgressPalette = 'accent' | AccentPalette
export type SurfacePalette = 'tonal' | 'neutral'
export type ElevationPreference = 'standard' | 'subtle' | 'flat'
export type UIFontPreference = 'material' | 'system'
export type MonospaceFontPreference = 'platform' | 'consolas' | 'sf-mono'
export type MotionPreference = 'system' | 'reduced'
export type ToolbarLabelPreference = 'auto' | 'labels' | 'icons'
export type DensityPreference = 'comfortable' | 'compact'
export type TabWidthPreference = 'compact' | 'standard' | 'wide'
export type TabCloseButtonPreference = 'hover' | 'always' | 'active'
export type SubmoduleBackButtonStyle = 'tonal' | 'filled' | 'outlined'
export type SubmoduleBackButtonLabel =
  | 'back-to-parent'
  | 'parent-name'
  | 'icon-only'

/** Application-wide appearance defaults saved in the active profile. */
export interface IAppearanceCustomization {
  readonly version: typeof AppearanceCustomizationVersion
  readonly accentPalette: AccentPalette
  readonly updateProgressPalette: UpdateProgressPalette
  readonly surfacePalette: SurfacePalette
  readonly elevation: ElevationPreference
  readonly uiFont: UIFontPreference
  readonly monospaceFont: MonospaceFontPreference
  readonly motion: MotionPreference
  readonly toolbarLabels: ToolbarLabelPreference
  readonly toolbarDensity: DensityPreference
  /** Validated typography applied to toolbar title and description text. */
  readonly toolbarTextStyle: ITabTitleStyle | null
  readonly repositoryListDensity: DensityPreference
  readonly tabDensity: DensityPreference
  readonly tabWidth: TabWidthPreference
  readonly tabCloseButtons: TabCloseButtonPreference
  /** Persisted app language presentation; never inferred from host locale. */
  readonly languageMode: LanguageMode
  /** Visual treatment for the temporary submodule-context Back action. */
  readonly submoduleBackButtonStyle: SubmoduleBackButtonStyle
  /** Visible label treatment; the accessible name always identifies the parent. */
  readonly submoduleBackButtonLabel: SubmoduleBackButtonLabel
  /** Visually identifies entry points added by Desktop Material. */
  readonly highlightDesktopMaterialFeatures: boolean
  readonly appIdentity: IAppIdentityCustomization
  /** Default vector identity inherited by repositories without an override. */
  readonly repositoryLogo: IRepositoryLogoDesign
}

/**
 * Workspace-specific values stored in the repository's local Git config.
 * Missing fields inherit the application-wide value.
 */
export interface IRepositoryAppearanceOverrides {
  readonly accentPalette?: AccentPalette
  readonly surfacePalette?: SurfacePalette
  readonly toolbarLabels?: ToolbarLabelPreference
  readonly toolbarDensity?: DensityPreference
  /** Partial repository typography layered over the active profile style. */
  readonly toolbarTextStyle?: ITabTitleStyle
  readonly tabDensity?: DensityPreference
  readonly tabWidth?: TabWidthPreference
  readonly repositoryLogo?: IRepositoryLogoDesign
  /**
   * Word-style typography for this repository's name in the repository list.
   * Reuses the validated tab title-style model, so untrusted values can never
   * reach an inline style unchecked. Absent means the default list styling.
   */
  readonly listNameStyle?: ITabTitleStyle
}

/**
 * The largest list-name font size the fixed-height repository-list row can
 * render without clipping. Tighter than the tab model's own maximum; both the
 * normalizer and the settings picker derive from this single value.
 */
export const MaxListNameFontSize = 18

/** Toolbar labels stay bounded so two-line controls can grow without clipping. */
export const MaxToolbarFontSize = 20

/** The title size used by the Material toolbar when no override is present. */
export const DefaultToolbarFontSize = 15

/**
 * Normalize the shared safe text model for toolbar use. Toolbar text does not
 * support a background highlight, and its font-size ceiling is intentionally
 * tighter than a repository tab's resizable frame.
 */
export function normalizeToolbarTextStyle(
  value: unknown
): ITabTitleStyle | null {
  const normalized = normalizeTabTitleStyle(value)
  if (normalized === null) {
    return null
  }

  const result: Record<string, unknown> = { ...normalized }
  delete result.backgroundColor
  if (
    typeof result.fontSize === 'number' &&
    result.fontSize > MaxToolbarFontSize
  ) {
    result.fontSize = MaxToolbarFontSize
  }

  return Object.keys(result).length === 0 ? null : (result as ITabTitleStyle)
}

/** Resolve a repository's partial toolbar style over its profile style. */
export function resolveToolbarTextStyle(
  profileStyle: ITabTitleStyle | null,
  repositoryStyle?: ITabTitleStyle | null
): ITabTitleStyle | null {
  const profile = normalizeToolbarTextStyle(profileStyle)
  if (repositoryStyle === undefined || repositoryStyle === null) {
    return profile
  }
  return normalizeToolbarTextStyle({
    ...(profile ?? {}),
    ...repositoryStyle,
  })
}

export const DefaultAppearanceCustomization: IAppearanceCustomization = {
  version: AppearanceCustomizationVersion,
  accentPalette: 'blue',
  updateProgressPalette: 'accent',
  surfacePalette: 'tonal',
  elevation: 'standard',
  uiFont: 'material',
  monospaceFont: 'platform',
  motion: 'system',
  toolbarLabels: 'auto',
  toolbarDensity: 'comfortable',
  toolbarTextStyle: null,
  repositoryListDensity: 'comfortable',
  tabDensity: 'comfortable',
  tabWidth: 'standard',
  tabCloseButtons: 'hover',
  languageMode: 'english',
  submoduleBackButtonStyle: 'tonal',
  submoduleBackButtonLabel: 'back-to-parent',
  highlightDesktopMaterialFeatures: false,
  appIdentity: DefaultAppIdentityCustomization,
  repositoryLogo: DefaultRepositoryLogoDesign,
}

export const accentPalettes: ReadonlyArray<AccentPalette> = [
  'blue',
  'violet',
  'teal',
  'green',
  'amber',
  'rose',
]
export const updateProgressPalettes: ReadonlyArray<UpdateProgressPalette> = [
  'accent',
  ...accentPalettes,
]
export const surfacePalettes: ReadonlyArray<SurfacePalette> = [
  'tonal',
  'neutral',
]
export const elevationPreferences: ReadonlyArray<ElevationPreference> = [
  'standard',
  'subtle',
  'flat',
]
export const uiFontPreferences: ReadonlyArray<UIFontPreference> = [
  'material',
  'system',
]
export const monospaceFontPreferences: ReadonlyArray<MonospaceFontPreference> =
  ['platform', 'consolas', 'sf-mono']
export const motionPreferences: ReadonlyArray<MotionPreference> = [
  'system',
  'reduced',
]
export const toolbarLabelPreferences: ReadonlyArray<ToolbarLabelPreference> = [
  'auto',
  'labels',
  'icons',
]
export const densityPreferences: ReadonlyArray<DensityPreference> = [
  'comfortable',
  'compact',
]
export const tabWidthPreferences: ReadonlyArray<TabWidthPreference> = [
  'compact',
  'standard',
  'wide',
]
export const tabCloseButtonPreferences: ReadonlyArray<TabCloseButtonPreference> =
  ['hover', 'always', 'active']
export const submoduleBackButtonStyles: ReadonlyArray<SubmoduleBackButtonStyle> =
  ['tonal', 'filled', 'outlined']
export const submoduleBackButtonLabels: ReadonlyArray<SubmoduleBackButtonLabel> =
  ['back-to-parent', 'parent-name', 'icon-only']

const MaxPersistedAppearanceLength = 32_768

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(
  value: unknown,
  choices: ReadonlyArray<T>
): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}

/** Normalize an internal value before it is persisted or applied. */
export function normalizeAppearanceCustomization(
  value: unknown
): IAppearanceCustomization {
  const source = isRecord(value) ? value : {}
  const defaults = DefaultAppearanceCustomization

  return {
    version: AppearanceCustomizationVersion,
    accentPalette: isOneOf(source.accentPalette, accentPalettes)
      ? source.accentPalette
      : defaults.accentPalette,
    updateProgressPalette: isOneOf(
      source.updateProgressPalette,
      updateProgressPalettes
    )
      ? source.updateProgressPalette
      : defaults.updateProgressPalette,
    surfacePalette: isOneOf(source.surfacePalette, surfacePalettes)
      ? source.surfacePalette
      : defaults.surfacePalette,
    elevation: isOneOf(source.elevation, elevationPreferences)
      ? source.elevation
      : defaults.elevation,
    uiFont: isOneOf(source.uiFont, uiFontPreferences)
      ? source.uiFont
      : defaults.uiFont,
    monospaceFont: isOneOf(source.monospaceFont, monospaceFontPreferences)
      ? source.monospaceFont
      : defaults.monospaceFont,
    motion: isOneOf(source.motion, motionPreferences)
      ? source.motion
      : defaults.motion,
    toolbarLabels: isOneOf(source.toolbarLabels, toolbarLabelPreferences)
      ? source.toolbarLabels
      : defaults.toolbarLabels,
    toolbarDensity: isOneOf(source.toolbarDensity, densityPreferences)
      ? source.toolbarDensity
      : defaults.toolbarDensity,
    toolbarTextStyle: normalizeToolbarTextStyle(source.toolbarTextStyle),
    repositoryListDensity: isOneOf(
      source.repositoryListDensity,
      densityPreferences
    )
      ? source.repositoryListDensity
      : defaults.repositoryListDensity,
    tabDensity: isOneOf(source.tabDensity, densityPreferences)
      ? source.tabDensity
      : defaults.tabDensity,
    tabWidth: isOneOf(source.tabWidth, tabWidthPreferences)
      ? source.tabWidth
      : defaults.tabWidth,
    tabCloseButtons: isOneOf(source.tabCloseButtons, tabCloseButtonPreferences)
      ? source.tabCloseButtons
      : defaults.tabCloseButtons,
    languageMode: isOneOf(source.languageMode, languageModes)
      ? normalizeLanguageMode(source.languageMode)
      : defaults.languageMode,
    submoduleBackButtonStyle: isOneOf(
      source.submoduleBackButtonStyle,
      submoduleBackButtonStyles
    )
      ? source.submoduleBackButtonStyle
      : defaults.submoduleBackButtonStyle,
    submoduleBackButtonLabel: isOneOf(
      source.submoduleBackButtonLabel,
      submoduleBackButtonLabels
    )
      ? source.submoduleBackButtonLabel
      : defaults.submoduleBackButtonLabel,
    highlightDesktopMaterialFeatures:
      typeof source.highlightDesktopMaterialFeatures === 'boolean'
        ? source.highlightDesktopMaterialFeatures
        : defaults.highlightDesktopMaterialFeatures,
    appIdentity: normalizeAppIdentityCustomization(source.appIdentity),
    repositoryLogo:
      isRecord(source.repositoryLogo) &&
      source.repositoryLogo.version === RepositoryLogoDesignVersion
        ? normalizeRepositoryLogoDesign(source.repositoryLogo)
        : defaults.repositoryLogo,
  }
}

/** Parse a strict, versioned profile value. Invalid values reset to defaults. */
export function parseAppearanceCustomization(
  serialized: string | null
): IAppearanceCustomization {
  if (
    serialized === null ||
    serialized.length === 0 ||
    serialized.length > MaxPersistedAppearanceLength
  ) {
    return DefaultAppearanceCustomization
  }

  try {
    const parsed: unknown = JSON.parse(serialized)
    if (
      !isRecord(parsed) ||
      parsed.version !== AppearanceCustomizationVersion
    ) {
      return DefaultAppearanceCustomization
    }
    return normalizeAppearanceCustomization(parsed)
  } catch {
    return DefaultAppearanceCustomization
  }
}

/** Normalize the allowlisted subset that may vary by repository. */
export function normalizeRepositoryAppearanceOverrides(
  value: unknown
): IRepositoryAppearanceOverrides {
  if (!isRecord(value)) {
    return {}
  }

  const overrides: {
    accentPalette?: AccentPalette
    surfacePalette?: SurfacePalette
    toolbarLabels?: ToolbarLabelPreference
    toolbarDensity?: DensityPreference
    toolbarTextStyle?: ITabTitleStyle
    tabDensity?: DensityPreference
    tabWidth?: TabWidthPreference
    repositoryLogo?: IRepositoryLogoDesign
    listNameStyle?: ITabTitleStyle
  } = {}

  if (isOneOf(value.accentPalette, accentPalettes)) {
    overrides.accentPalette = value.accentPalette
  }
  if (isOneOf(value.surfacePalette, surfacePalettes)) {
    overrides.surfacePalette = value.surfacePalette
  }
  if (isOneOf(value.toolbarLabels, toolbarLabelPreferences)) {
    overrides.toolbarLabels = value.toolbarLabels
  }
  if (isOneOf(value.toolbarDensity, densityPreferences)) {
    overrides.toolbarDensity = value.toolbarDensity
  }
  if (isRecord(value.toolbarTextStyle)) {
    const toolbarTextStyle = normalizeToolbarTextStyle(value.toolbarTextStyle)
    if (toolbarTextStyle !== null) {
      overrides.toolbarTextStyle = toolbarTextStyle
    }
  }
  if (isOneOf(value.tabDensity, densityPreferences)) {
    overrides.tabDensity = value.tabDensity
  }
  if (isOneOf(value.tabWidth, tabWidthPreferences)) {
    overrides.tabWidth = value.tabWidth
  }
  if (
    isRecord(value.repositoryLogo) &&
    value.repositoryLogo.version === RepositoryLogoDesignVersion
  ) {
    overrides.repositoryLogo = normalizeRepositoryLogoDesign(
      value.repositoryLogo
    )
  }
  if (isRecord(value.listNameStyle)) {
    const listNameStyle = normalizeTabTitleStyle(value.listNameStyle)
    if (listNameStyle !== null) {
      overrides.listNameStyle =
        typeof listNameStyle.fontSize === 'number' &&
        listNameStyle.fontSize > MaxListNameFontSize
          ? { ...listNameStyle, fontSize: MaxListNameFontSize }
          : listNameStyle
    }
  }

  return overrides
}

/** Parse an untrusted repository-local Git config value. */
export function parseRepositoryAppearanceOverrides(
  serialized: string | null
): IRepositoryAppearanceOverrides {
  if (
    serialized === null ||
    serialized.length === 0 ||
    serialized.length > MaxPersistedAppearanceLength
  ) {
    return {}
  }

  try {
    const parsed: unknown = JSON.parse(serialized)
    if (
      !isRecord(parsed) ||
      parsed.version !== AppearanceCustomizationVersion
    ) {
      return {}
    }
    return normalizeRepositoryAppearanceOverrides(parsed)
  } catch {
    return {}
  }
}

/** Resolve repository overrides onto the application-wide defaults. */
export function resolveAppearanceCustomization(
  customization: IAppearanceCustomization,
  overrides: IRepositoryAppearanceOverrides
): IAppearanceCustomization {
  return normalizeAppearanceCustomization({
    ...customization,
    ...overrides,
    toolbarTextStyle: resolveToolbarTextStyle(
      customization.toolbarTextStyle,
      overrides.toolbarTextStyle
    ),
  })
}
