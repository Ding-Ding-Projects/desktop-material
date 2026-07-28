import assert from 'node:assert'
import { describe, it } from 'node:test'
import { resolveInternalBrowserAppearance } from '../../src/internal-browser/internal-browser-appearance'
import {
  DefaultAppearanceCustomization,
  IAppearanceCustomization,
} from '../../src/models/appearance-customization'
import { ApplicationTheme } from '../../src/ui/lib/application-theme'

function appearance(
  overrides: Partial<IAppearanceCustomization> = {}
): IAppearanceCustomization {
  return { ...DefaultAppearanceCustomization, ...overrides }
}

describe('internal browser appearance projection', () => {
  it('honors explicit light and dark preferences independently of the OS', () => {
    assert.equal(
      resolveInternalBrowserAppearance(
        ApplicationTheme.Light,
        appearance(),
        true
      ).theme,
      'light'
    )
    assert.equal(
      resolveInternalBrowserAppearance(
        ApplicationTheme.Dark,
        appearance(),
        false
      ).theme,
      'dark'
    )
  })

  it('uses the OS color scheme only for the persisted system theme', () => {
    assert.equal(
      resolveInternalBrowserAppearance(
        ApplicationTheme.System,
        appearance(),
        true
      ).theme,
      'dark'
    )
    assert.equal(
      resolveInternalBrowserAppearance(
        ApplicationTheme.System,
        appearance(),
        false
      ).theme,
      'light'
    )
  })

  it('projects accent, density and bounded UI typography', () => {
    const projected = resolveInternalBrowserAppearance(
      ApplicationTheme.Dark,
      appearance({
        accentPalette: 'rose',
        uiFont: 'system',
        toolbarDensity: 'compact',
        tabDensity: 'compact',
        toolbarTextStyle: {
          fontFamily: 'Segoe UI',
          fontSize: 17,
          bold: true,
        },
      }),
      false
    )

    assert.equal(projected.accentPalette, 'rose')
    assert.equal(projected.toolbarDensity, 'compact')
    assert.equal(projected.tabDensity, 'compact')
    assert.match(projected.uiFontFamily, /system-ui/)
    assert.match(projected.toolbarFontFamily, /Segoe UI/)
    assert.equal(projected.toolbarFontSize, '17px')
    assert.equal(projected.toolbarFontWeight, 'bold')
  })
})
