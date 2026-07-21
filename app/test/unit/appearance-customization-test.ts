import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  DefaultAppearanceCustomization,
  normalizeAppearanceCustomization,
  parseAppearanceCustomization,
  parseRepositoryAppearanceOverrides,
  resolveAppearanceCustomization,
} from '../../src/models/appearance-customization'

describe('appearance customization', () => {
  it('uses defaults for missing, malformed, oversized, or unversioned values', () => {
    assert.deepEqual(
      parseAppearanceCustomization(null),
      DefaultAppearanceCustomization
    )
    assert.deepEqual(
      parseAppearanceCustomization('{not json'),
      DefaultAppearanceCustomization
    )
    assert.deepEqual(
      parseAppearanceCustomization(JSON.stringify({ accentPalette: 'rose' })),
      DefaultAppearanceCustomization
    )
    assert.deepEqual(
      parseAppearanceCustomization('x'.repeat(4097)),
      DefaultAppearanceCustomization
    )
    assert.deepEqual(
      parseAppearanceCustomization(
        JSON.stringify({ version: 1, padding: 'x'.repeat(33_000) })
      ),
      DefaultAppearanceCustomization
    )
  })

  it('keeps valid values and replaces invalid fields independently', () => {
    const parsed = parseAppearanceCustomization(
      JSON.stringify({
        version: 1,
        accentPalette: 'violet',
        surfacePalette: 'not-css',
        motion: 'reduced',
        tabWidth: 'wide',
        unexpected: 'ignored',
      })
    )

    assert.equal(parsed.accentPalette, 'violet')
    assert.equal(parsed.surfacePalette, 'tonal')
    assert.equal(parsed.motion, 'reduced')
    assert.equal(parsed.tabWidth, 'wide')
    assert.equal(parsed.languageMode, 'english')
    assert.equal(parsed.submoduleBackButtonStyle, 'tonal')
    assert.equal(parsed.submoduleBackButtonLabel, 'back-to-parent')
    assert.equal(parsed.highlightDesktopMaterialFeatures, false)
    assert.equal(parsed.appIdentity.displayName, 'Desktop Material')
    assert.equal(parsed.repositoryLogo.version, 1)
    assert.equal('unexpected' in parsed, false)
  })

  it('migrates old v1 profiles and preserves newer nested identity keys', () => {
    const migrated = parseAppearanceCustomization(
      JSON.stringify({ version: 1, accentPalette: 'teal' })
    )
    assert.equal(migrated.appIdentity.displayName, 'Desktop Material')

    const parsed = parseAppearanceCustomization(
      JSON.stringify({
        version: 1,
        appIdentity: {
          displayName: 'Material Workbench',
          logo: 'terminal',
          logoColor: '#6750a4',
          fontFamily: 'Consolas',
          fontSize: 14,
          fontWeight: 700,
          textCase: 'uppercase',
          futureLogoTreatment: 'duotone',
        },
      })
    )

    assert.equal(parsed.appIdentity.displayName, 'Material Workbench')
    assert.equal(parsed.appIdentity.logo, 'terminal')
    assert.equal(parsed.appIdentity.fontFamily, 'Consolas')
    assert.equal(parsed.appIdentity.futureLogoTreatment, 'duotone')
  })

  it('normalizes internal updates before persistence', () => {
    const normalized = normalizeAppearanceCustomization({
      ...DefaultAppearanceCustomization,
      toolbarDensity: 'compact',
      toolbarTextStyle: {
        fontFamily: 'Georgia',
        fontSize: 200,
        color: 'url(javascript:bad)',
        backgroundColor: '#ffffff',
        italic: true,
      },
      uiFont: 'url(javascript:bad)',
      languageMode: 'bilingual',
      submoduleBackButtonStyle: 'outlined',
      submoduleBackButtonLabel: 'parent-name',
      highlightDesktopMaterialFeatures: true,
    })

    assert.equal(normalized.toolbarDensity, 'compact')
    assert.deepEqual(normalized.toolbarTextStyle, {
      fontFamily: 'Georgia',
      fontSize: 20,
      italic: true,
    })
    assert.equal(normalized.uiFont, 'material')
    assert.equal(normalized.languageMode, 'bilingual')
    assert.equal(normalized.submoduleBackButtonStyle, 'outlined')
    assert.equal(normalized.submoduleBackButtonLabel, 'parent-name')
    assert.equal(normalized.highlightDesktopMaterialFeatures, true)
    assert.equal(
      normalizeAppearanceCustomization({
        ...DefaultAppearanceCustomization,
        highlightDesktopMaterialFeatures: 'yes',
      }).highlightDesktopMaterialFeatures,
      false
    )
    assert.equal(
      normalizeAppearanceCustomization({
        ...DefaultAppearanceCustomization,
        languageMode: 'zh-CN',
        submoduleBackButtonStyle: 'javascript:alert(1)',
        submoduleBackButtonLabel: 'html',
      }).languageMode,
      'english'
    )
    assert.equal(
      normalizeAppearanceCustomization({
        ...DefaultAppearanceCustomization,
        submoduleBackButtonStyle: 'javascript:alert(1)',
      }).submoduleBackButtonStyle,
      'tonal'
    )
  })

  it('allowlists repository overrides and resolves them over profile values', () => {
    const overrides = parseRepositoryAppearanceOverrides(
      JSON.stringify({
        version: 1,
        accentPalette: 'amber',
        tabWidth: 'compact',
        motion: 'reduced',
        uiFont: 'system',
        toolbarDensity: 'invalid',
        toolbarTextStyle: {
          color: '#a93a5b',
          italic: false,
          fontFamily: 'url(javascript:bad)',
        },
        languageMode: 'cantonese',
        submoduleBackButtonStyle: 'filled',
        submoduleBackButtonLabel: 'icon-only',
        highlightDesktopMaterialFeatures: true,
      })
    )

    assert.deepEqual(overrides, {
      accentPalette: 'amber',
      tabWidth: 'compact',
      toolbarTextStyle: { color: '#a93a5b', italic: false },
    })

    const resolved = resolveAppearanceCustomization(
      {
        ...DefaultAppearanceCustomization,
        surfacePalette: 'neutral',
        tabWidth: 'wide',
        toolbarTextStyle: {
          fontFamily: 'Georgia',
          bold: true,
          italic: true,
        },
        highlightDesktopMaterialFeatures: true,
      },
      overrides
    )
    assert.equal(resolved.accentPalette, 'amber')
    assert.equal(resolved.surfacePalette, 'neutral')
    assert.equal(resolved.tabWidth, 'compact')
    assert.deepEqual(resolved.toolbarTextStyle, {
      fontFamily: 'Georgia',
      bold: true,
      italic: false,
      color: '#a93a5b',
    })
    assert.equal(resolved.languageMode, 'english')
    assert.equal(resolved.submoduleBackButtonStyle, 'tonal')
    assert.equal(resolved.submoduleBackButtonLabel, 'back-to-parent')
    assert.equal(resolved.highlightDesktopMaterialFeatures, true)
  })

  it('validates repository list-name typography before it can reach a row', () => {
    const overrides = parseRepositoryAppearanceOverrides(
      JSON.stringify({
        version: 1,
        listNameStyle: {
          fontFamily: 'Georgia',
          fontSize: 200,
          bold: true,
          color: 'url(javascript:bad)',
          textCase: 'uppercase',
          futureKey: 'kept-for-forward-compat',
        },
      })
    )

    // Known fields validate independently: the size clamps to the list row's
    // own maximum, the unsafe color drops, and unknown newer keys survive
    // round-tripping.
    assert.equal(overrides.listNameStyle?.fontFamily, 'Georgia')
    assert.equal(overrides.listNameStyle?.fontSize, 18)
    assert.equal(overrides.listNameStyle?.bold, true)
    assert.equal(overrides.listNameStyle?.color, undefined)
    assert.equal(overrides.listNameStyle?.textCase, 'uppercase')
    assert.equal(overrides.listNameStyle?.futureKey, 'kept-for-forward-compat')
  })

  it('drops empty or malformed list-name typography overrides', () => {
    assert.deepEqual(
      parseRepositoryAppearanceOverrides(
        JSON.stringify({ version: 1, listNameStyle: 'Comic Sans' })
      ),
      {}
    )
    assert.deepEqual(
      parseRepositoryAppearanceOverrides(
        JSON.stringify({ version: 1, listNameStyle: {} })
      ),
      {}
    )
    assert.deepEqual(
      parseRepositoryAppearanceOverrides(
        JSON.stringify({
          version: 1,
          listNameStyle: { fontFamily: 'javascript:alert(1)' },
        })
      ),
      {}
    )
  })

  it('normalizes a local vector logo while keeping it repository-only', () => {
    const overrides = parseRepositoryAppearanceOverrides(
      JSON.stringify({
        version: 1,
        repositoryLogo: {
          version: 1,
          background: {
            shape: 'circle',
            fill: 'solid',
            primaryColor: '#123456',
          },
          layers: [
            {
              id: 'mark',
              type: 'mark',
              mark: 'star',
              color: 'url(javascript:bad)',
            },
          ],
        },
      })
    )

    assert.equal(overrides.repositoryLogo?.background.shape, 'circle')
    assert.equal(overrides.repositoryLogo?.background.primaryColor, '#123456')
    assert.equal(overrides.repositoryLogo?.layers[0]?.color, '#ffffff')
  })
})
