import * as Path from 'path'
import {
  isValidFontFamily,
  isValidTabColor,
  tabFontStack,
} from './repository-tab'

export const DefaultAppDisplayName = 'Desktop Material'
export const MaxAppDisplayNameLength = 48
export const MaxCustomLogoPathLength = 1024

export const MinAppNameFontSize = 10
export const MaxAppNameFontSize = 18
export const MinAppNameCharacterSpacing = -1
export const MaxAppNameCharacterSpacing = 4
export const MinAppLogoSize = 18
export const MaxAppLogoSize = 34
export const MinAppLogoInset = 0
export const MaxAppLogoInset = 8
export const MinAppLogoRotation = -15
export const MaxAppLogoRotation = 15
export const MinAppBrandGap = 4
export const MaxAppBrandGap = 18
export const MinAppNameOpacity = 0.5
export const MaxAppNameOpacity = 1

export type AppLogoChoice =
  | 'github'
  | 'repository'
  | 'terminal'
  | 'code'
  | 'sparkle'
  | 'monogram'
  | 'custom'
export type AppLogoShape = 'rounded' | 'circle' | 'square'
export type AppLogoBorder = 'none' | 'subtle' | 'strong'
export type AppLogoShadow = 'none' | 'soft' | 'strong'
export type AppNameFontWeight = 400 | 500 | 600 | 700 | 800
export type AppNameFontWidth = 'condensed' | 'normal' | 'expanded'
export type AppNameTextCase =
  | 'normal'
  | 'uppercase'
  | 'lowercase'
  | 'capitalize'
export type AppNameTextEffect =
  | 'none'
  | 'soft-shadow'
  | 'strong-shadow'
  | 'glow'
  | 'embossed'
export type AppNameHighlight = 'none' | 'soft' | 'pill'

/** Profile-scoped identity rendered in the app title bar and window title. */
export interface IAppIdentityCustomization {
  /** Unknown keys are retained so a newer profile can safely visit this editor. */
  readonly [key: string]: unknown
  readonly displayName: string
  readonly logo: AppLogoChoice
  readonly customLogoPath: string | null
  readonly logoColor: string | null
  readonly logoShape: AppLogoShape
  readonly showLogo: boolean
  readonly logoSize: number
  readonly logoInset: number
  readonly logoRotation: number
  readonly logoBorder: AppLogoBorder
  readonly logoBorderColor: string | null
  readonly logoShadow: AppLogoShadow
  readonly brandGap: number
  readonly fontFamily: string
  readonly fontSize: number
  readonly fontWeight: AppNameFontWeight
  readonly fontWidth: AppNameFontWidth
  readonly fontColor: string | null
  readonly fontOpacity: number
  readonly highlightStyle: AppNameHighlight
  readonly highlightColor: string | null
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
  readonly strikeThrough: boolean
  readonly smallCaps: boolean
  readonly textCase: AppNameTextCase
  readonly characterSpacing: number
  readonly textEffect: AppNameTextEffect
}

export const DefaultAppIdentityCustomization: IAppIdentityCustomization = {
  displayName: DefaultAppDisplayName,
  logo: 'github',
  customLogoPath: null,
  logoColor: null,
  logoShape: 'rounded',
  showLogo: true,
  logoSize: 21,
  logoInset: 3,
  logoRotation: 0,
  logoBorder: 'none',
  logoBorderColor: null,
  logoShadow: 'none',
  brandGap: 9,
  fontFamily: 'Segoe UI',
  fontSize: 12.5,
  fontWeight: 600,
  fontWidth: 'normal',
  fontColor: null,
  fontOpacity: 1,
  highlightStyle: 'none',
  highlightColor: null,
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  smallCaps: false,
  textCase: 'normal',
  characterSpacing: 0.25,
  textEffect: 'none',
}

export const appLogoChoices: ReadonlyArray<AppLogoChoice> = [
  'github',
  'repository',
  'terminal',
  'code',
  'sparkle',
  'monogram',
  'custom',
]
export const appLogoShapes: ReadonlyArray<AppLogoShape> = [
  'rounded',
  'circle',
  'square',
]
export const appLogoBorders: ReadonlyArray<AppLogoBorder> = [
  'none',
  'subtle',
  'strong',
]
export const appLogoShadows: ReadonlyArray<AppLogoShadow> = [
  'none',
  'soft',
  'strong',
]
export const appNameFontWeights: ReadonlyArray<AppNameFontWeight> = [
  400, 500, 600, 700, 800,
]
export const appNameFontWidths: ReadonlyArray<AppNameFontWidth> = [
  'condensed',
  'normal',
  'expanded',
]
export const appNameTextCases: ReadonlyArray<AppNameTextCase> = [
  'normal',
  'uppercase',
  'lowercase',
  'capitalize',
]
export const appNameTextEffects: ReadonlyArray<AppNameTextEffect> = [
  'none',
  'soft-shadow',
  'strong-shadow',
  'glow',
  'embossed',
]
export const appNameHighlights: ReadonlyArray<AppNameHighlight> = [
  'none',
  'soft',
  'pill',
]

const controlCharacterPattern = /[\u0000-\u001f\u007f]/
const logoExtensionPattern = /\.(?:png|jpe?g|webp|ico)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(
  value: unknown,
  choices: ReadonlyArray<T>
): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}

function isFontWeight(value: unknown): value is AppNameFontWeight {
  return (
    typeof value === 'number' &&
    appNameFontWeights.includes(value as AppNameFontWeight)
  )
}

function clampAndSnap(value: unknown, min: number, max: number, step: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  const snapped = Math.round(value / step) * step
  return Math.min(max, Math.max(min, snapped))
}

export function getAppDisplayNameError(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return 'Enter an app name.'
  }
  if (trimmed.length > MaxAppDisplayNameLength) {
    return `Use ${MaxAppDisplayNameLength} characters or fewer.`
  }
  if (controlCharacterPattern.test(trimmed)) {
    return 'Remove line breaks and control characters.'
  }
  return null
}

export function getAppDisplayName(value: unknown): string {
  if (typeof value !== 'string' || getAppDisplayNameError(value) !== null) {
    return DefaultAppDisplayName
  }
  return value.trim()
}

export function isValidAppIdentityColor(value: unknown): value is string {
  return typeof value === 'string' && isValidTabColor(value)
}

/** Accept absolute image paths written by Windows, macOS, or Linux profiles. */
export function isValidCustomLogoPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MaxCustomLogoPathLength &&
    !controlCharacterPattern.test(value) &&
    (Path.win32.isAbsolute(value) || Path.posix.isAbsolute(value)) &&
    logoExtensionPattern.test(value)
  )
}

/** Normalize identity data while retaining fields written by newer releases. */
export function normalizeAppIdentityCustomization(
  value: unknown
): IAppIdentityCustomization {
  const source = isRecord(value) ? value : {}
  const defaults = DefaultAppIdentityCustomization
  const fontSize = clampAndSnap(
    source.fontSize,
    MinAppNameFontSize,
    MaxAppNameFontSize,
    0.5
  )
  const characterSpacing = clampAndSnap(
    source.characterSpacing,
    MinAppNameCharacterSpacing,
    MaxAppNameCharacterSpacing,
    0.25
  )
  const logoSize = clampAndSnap(
    source.logoSize,
    MinAppLogoSize,
    MaxAppLogoSize,
    1
  )
  const logoInset = clampAndSnap(
    source.logoInset,
    MinAppLogoInset,
    MaxAppLogoInset,
    1
  )
  const logoRotation = clampAndSnap(
    source.logoRotation,
    MinAppLogoRotation,
    MaxAppLogoRotation,
    1
  )
  const brandGap = clampAndSnap(
    source.brandGap,
    MinAppBrandGap,
    MaxAppBrandGap,
    1
  )
  const fontOpacity = clampAndSnap(
    source.fontOpacity,
    MinAppNameOpacity,
    MaxAppNameOpacity,
    0.05
  )

  return {
    ...source,
    displayName: getAppDisplayName(source.displayName),
    logo: isOneOf(source.logo, appLogoChoices) ? source.logo : defaults.logo,
    customLogoPath: isValidCustomLogoPath(source.customLogoPath)
      ? source.customLogoPath
      : null,
    logoColor: isValidAppIdentityColor(source.logoColor)
      ? source.logoColor
      : null,
    logoShape: isOneOf(source.logoShape, appLogoShapes)
      ? source.logoShape
      : defaults.logoShape,
    showLogo: source.showLogo !== false,
    logoSize: logoSize ?? defaults.logoSize,
    logoInset: logoInset ?? defaults.logoInset,
    logoRotation: logoRotation ?? defaults.logoRotation,
    logoBorder: isOneOf(source.logoBorder, appLogoBorders)
      ? source.logoBorder
      : defaults.logoBorder,
    logoBorderColor: isValidAppIdentityColor(source.logoBorderColor)
      ? source.logoBorderColor
      : null,
    logoShadow: isOneOf(source.logoShadow, appLogoShadows)
      ? source.logoShadow
      : defaults.logoShadow,
    brandGap: brandGap ?? defaults.brandGap,
    fontFamily:
      typeof source.fontFamily === 'string' &&
      isValidFontFamily(source.fontFamily)
        ? source.fontFamily
        : defaults.fontFamily,
    fontSize: fontSize ?? defaults.fontSize,
    fontWeight: isFontWeight(source.fontWeight)
      ? source.fontWeight
      : defaults.fontWeight,
    fontWidth: isOneOf(source.fontWidth, appNameFontWidths)
      ? source.fontWidth
      : defaults.fontWidth,
    fontColor: isValidAppIdentityColor(source.fontColor)
      ? source.fontColor
      : null,
    fontOpacity: fontOpacity ?? defaults.fontOpacity,
    highlightStyle: isOneOf(source.highlightStyle, appNameHighlights)
      ? source.highlightStyle
      : defaults.highlightStyle,
    highlightColor: isValidAppIdentityColor(source.highlightColor)
      ? source.highlightColor
      : null,
    bold: source.bold === true,
    italic: source.italic === true,
    underline: source.underline === true,
    strikeThrough: source.strikeThrough === true,
    smallCaps: source.smallCaps === true,
    textCase: isOneOf(source.textCase, appNameTextCases)
      ? source.textCase
      : defaults.textCase,
    characterSpacing: characterSpacing ?? defaults.characterSpacing,
    textEffect: isOneOf(source.textEffect, appNameTextEffects)
      ? source.textEffect
      : defaults.textEffect,
  }
}

export function appNameStyleToCss(
  value: IAppIdentityCustomization
): React.CSSProperties {
  const identity = normalizeAppIdentityCustomization(value)
  const decorationLines: string[] = []
  if (identity.underline) {
    decorationLines.push('underline')
  }
  if (identity.strikeThrough) {
    decorationLines.push('line-through')
  }

  const css: React.CSSProperties = {
    fontFamily: tabFontStack(identity.fontFamily),
    fontSize: `${identity.fontSize}px`,
    fontWeight: identity.bold ? 700 : identity.fontWeight,
    fontStretch: identity.fontWidth,
    fontStyle: identity.italic ? 'italic' : undefined,
    fontVariant: identity.smallCaps ? 'small-caps' : undefined,
    letterSpacing: `${identity.characterSpacing}px`,
    textDecoration:
      decorationLines.length > 0 ? decorationLines.join(' ') : undefined,
    textTransform: identity.textCase === 'normal' ? 'none' : identity.textCase,
    opacity: identity.fontOpacity,
  }

  if (identity.highlightStyle !== 'none') {
    css.backgroundColor =
      identity.highlightColor ?? 'var(--md-sys-color-secondary-container)'
    css.borderRadius = identity.highlightStyle === 'pill' ? '999px' : '5px'
    css.padding = identity.highlightStyle === 'pill' ? '2px 7px' : '1px 4px'
  }

  if (identity.fontColor !== null) {
    css.color = identity.fontColor
  }
  switch (identity.textEffect) {
    case 'soft-shadow':
      css.textShadow = '0 1px 2px rgb(0 0 0 / 35%)'
      break
    case 'strong-shadow':
      css.textShadow = '1px 2px 3px rgb(0 0 0 / 55%)'
      break
    case 'glow':
      css.textShadow =
        '0 0 3px var(--md-sys-color-primary), 0 0 8px var(--md-sys-color-primary)'
      break
    case 'embossed':
      css.textShadow =
        '0 1px 0 rgb(255 255 255 / 45%), 0 -1px 0 rgb(0 0 0 / 35%)'
      break
    case 'none':
      css.textShadow = 'none'
      break
  }

  return css
}

function colorIsDark(color: string): boolean {
  const hex = color.slice(1)
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map(character => `${character}${character}`)
          .join('')
      : hex.slice(0, 6)
  const red = parseInt(expanded.slice(0, 2), 16)
  const green = parseInt(expanded.slice(2, 4), 16)
  const blue = parseInt(expanded.slice(4, 6), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 < 146
}

export function appLogoStyleToCss(
  value: IAppIdentityCustomization
): React.CSSProperties {
  const identity = normalizeAppIdentityCustomization(value)
  const borderRadius =
    identity.logoShape === 'circle'
      ? '50%'
      : identity.logoShape === 'square'
      ? '3px'
      : '7px'
  const borderColor =
    identity.logoBorderColor ?? 'var(--md-sys-color-outline-variant)'
  const border =
    identity.logoBorder === 'none'
      ? 'none'
      : `${identity.logoBorder === 'strong' ? 2 : 1}px solid ${borderColor}`
  const boxShadow =
    identity.logoShadow === 'strong'
      ? '0 4px 10px rgb(0 0 0 / 38%)'
      : identity.logoShadow === 'soft'
      ? '0 2px 5px rgb(0 0 0 / 24%)'
      : 'none'
  const style: React.CSSProperties & Record<string, string | number> = {
    '--dm-app-logo-size': `${identity.logoSize}px`,
    '--dm-app-logo-inset': `${identity.logoInset}px`,
    '--dm-app-logo-rotation': `${identity.logoRotation}deg`,
    backgroundColor: identity.logoColor ?? 'var(--md-sys-color-primary)',
    borderRadius,
    border,
    boxShadow,
    color:
      identity.logoColor === null || colorIsDark(identity.logoColor)
        ? '#ffffff'
        : '#111111',
  }
  return style
}

/** Layout shared by the real title bar and the live preview. */
export function appBrandStyleToCss(
  value: IAppIdentityCustomization
): React.CSSProperties {
  const identity = normalizeAppIdentityCustomization(value)
  return { gap: `${identity.brandGap}px` }
}

export function getAppLogoInitial(displayName: string): string {
  return (
    Array.from(getAppDisplayName(displayName))[0]?.toLocaleUpperCase() ?? 'D'
  )
}
