import { getAppearanceCustomization } from '../lib/appearance-customization'
import {
  IAppearanceCustomization,
  normalizeToolbarTextStyle,
} from '../models/appearance-customization'
import { tabTitleStyleToCss } from '../models/repository-tab'
import {
  ApplicationTheme,
  getPersistedThemeName,
} from '../ui/lib/application-theme'

export interface IInternalBrowserAppearanceProjection {
  readonly theme: 'light' | 'dark'
  readonly accentPalette: IAppearanceCustomization['accentPalette']
  readonly surfacePalette: IAppearanceCustomization['surfacePalette']
  readonly elevation: IAppearanceCustomization['elevation']
  readonly motion: IAppearanceCustomization['motion']
  readonly toolbarDensity: IAppearanceCustomization['toolbarDensity']
  readonly tabDensity: IAppearanceCustomization['tabDensity']
  readonly uiFontFamily: string
  readonly toolbarFontFamily: string
  readonly toolbarFontSize: string
  readonly toolbarFontWeight: string
}

const materialFontStack =
  "Roboto, 'Segoe UI', 'Noto Sans HK', 'Microsoft JhengHei', sans-serif"
const systemFontStack =
  "system-ui, 'Segoe UI Variable Text', 'Segoe UI', 'Noto Sans HK', 'Microsoft JhengHei', sans-serif"

/** Pure projection used by the renderer and deterministic theme tests. */
export function resolveInternalBrowserAppearance(
  theme: ApplicationTheme,
  appearance: IAppearanceCustomization,
  systemUsesDarkColors: boolean
): IInternalBrowserAppearanceProjection {
  const toolbarStyle = normalizeToolbarTextStyle(appearance.toolbarTextStyle)
  const toolbarCSS = tabTitleStyleToCss(toolbarStyle)
  const uiFontFamily =
    appearance.uiFont === 'material' ? materialFontStack : systemFontStack

  return {
    theme:
      theme === ApplicationTheme.Dark ||
      (theme === ApplicationTheme.System && systemUsesDarkColors)
        ? 'dark'
        : 'light',
    accentPalette: appearance.accentPalette,
    surfacePalette: appearance.surfacePalette,
    elevation: appearance.elevation,
    motion: appearance.motion,
    toolbarDensity: appearance.toolbarDensity,
    tabDensity: appearance.tabDensity,
    uiFontFamily,
    toolbarFontFamily:
      typeof toolbarCSS.fontFamily === 'string'
        ? toolbarCSS.fontFamily
        : uiFontFamily,
    toolbarFontSize:
      typeof toolbarCSS.fontSize === 'string' ? toolbarCSS.fontSize : '14px',
    toolbarFontWeight:
      typeof toolbarCSS.fontWeight === 'string' ||
      typeof toolbarCSS.fontWeight === 'number'
        ? String(toolbarCSS.fontWeight)
        : '400',
  }
}

export function applyInternalBrowserAppearance(
  projection: IInternalBrowserAppearanceProjection,
  body: HTMLElement = document.body
) {
  body.classList.remove('theme-light', 'theme-dark')
  body.classList.add(`theme-${projection.theme}`)
  body.setAttribute('data-dm-accent', projection.accentPalette)
  body.setAttribute('data-dm-surface', projection.surfacePalette)
  body.setAttribute('data-dm-elevation', projection.elevation)
  body.setAttribute('data-dm-motion', projection.motion)
  body.setAttribute('data-dm-toolbar-density', projection.toolbarDensity)
  body.setAttribute('data-dm-tab-density', projection.tabDensity)
  body.style.setProperty('--browser-ui-font-family', projection.uiFontFamily)
  body.style.setProperty(
    '--browser-toolbar-font-family',
    projection.toolbarFontFamily
  )
  body.style.setProperty(
    '--browser-toolbar-font-size',
    projection.toolbarFontSize
  )
  body.style.setProperty(
    '--browser-toolbar-font-weight',
    projection.toolbarFontWeight
  )
}

export function applyPersistedInternalBrowserAppearance(
  systemUsesDarkColors: boolean
) {
  applyInternalBrowserAppearance(
    resolveInternalBrowserAppearance(
      getPersistedThemeName(),
      getAppearanceCustomization(),
      systemUsesDarkColors
    )
  )
}
