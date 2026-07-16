import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  appLogoStyleToCss,
  appNameStyleToCss,
  DefaultAppIdentityCustomization,
  DefaultAppDisplayName,
  getAppDisplayNameError,
  getAppLogoInitial,
  isValidCustomLogoPath,
  normalizeAppIdentityCustomization,
} from '../../src/models/app-identity'

describe('app identity customization', () => {
  it('normalizes unsafe fields independently without losing newer keys', () => {
    const normalized = normalizeAppIdentityCustomization({
      displayName: '  Material Studio  ',
      logo: 'sparkle',
      logoColor: '#123456',
      logoShape: 'circle',
      logoSize: 200,
      logoInset: -20,
      logoRotation: 12.8,
      logoBorder: 'strong',
      logoShadow: 'soft',
      brandGap: 99,
      fontFamily: 'Calibri',
      fontSize: 99,
      fontWeight: 700,
      fontWidth: 'expanded',
      fontColor: 'url(javascript:bad)',
      fontOpacity: 0.12,
      highlightStyle: 'pill',
      highlightColor: '#abcdef',
      characterSpacing: 1.37,
      textCase: 'uppercase',
      textEffect: 'soft-shadow',
      futureIdentityEffect: 'neon-outline',
    })

    assert.equal(normalized.displayName, 'Material Studio')
    assert.equal(normalized.logo, 'sparkle')
    assert.equal(normalized.logoColor, '#123456')
    assert.equal(normalized.logoShape, 'circle')
    assert.equal(normalized.logoSize, 34)
    assert.equal(normalized.logoInset, 0)
    assert.equal(normalized.logoRotation, 13)
    assert.equal(normalized.logoBorder, 'strong')
    assert.equal(normalized.logoShadow, 'soft')
    assert.equal(normalized.brandGap, 18)
    assert.equal(normalized.fontSize, 18)
    assert.equal(normalized.fontColor, null)
    assert.equal(normalized.fontWidth, 'expanded')
    assert.equal(normalized.fontOpacity, 0.5)
    assert.equal(normalized.highlightStyle, 'pill')
    assert.equal(normalized.highlightColor, '#abcdef')
    assert.equal(normalized.characterSpacing, 1.25)
    assert.equal(normalized.futureIdentityEffect, 'neon-outline')
  })

  it('rejects blank, oversized, and control-character names', () => {
    assert.notEqual(getAppDisplayNameError('   '), null)
    assert.notEqual(getAppDisplayNameError('x'.repeat(49)), null)
    assert.notEqual(getAppDisplayNameError('Desktop\nMaterial'), null)
    assert.equal(
      normalizeAppIdentityCustomization({ displayName: '' }).displayName,
      DefaultAppDisplayName
    )
  })

  it('accepts only absolute paths to supported image formats', () => {
    assert.equal(isValidCustomLogoPath('C:\\Brand\\logo.webp'), true)
    assert.equal(isValidCustomLogoPath('/home/user/brand/logo.png'), true)
    assert.equal(isValidCustomLogoPath('relative/logo.png'), false)
    assert.equal(isValidCustomLogoPath('C:\\Brand\\logo.svg'), false)
  })

  it('builds bounded, injection-safe logo and name styles', () => {
    const identity = normalizeAppIdentityCustomization({
      ...DefaultAppIdentityCustomization,
      logoColor: '#101820',
      logoShape: 'square',
      logoSize: 30,
      logoInset: 5,
      logoRotation: -8,
      logoBorder: 'strong',
      logoBorderColor: '#ff00ff',
      logoShadow: 'strong',
      fontColor: '#f5f5f5',
      fontOpacity: 0.8,
      fontWidth: 'condensed',
      highlightStyle: 'pill',
      highlightColor: '#abcdef',
      bold: true,
      italic: true,
      underline: true,
      strikeThrough: true,
      smallCaps: true,
      textCase: 'capitalize',
      textEffect: 'strong-shadow',
    })
    const logo = appLogoStyleToCss(identity)
    const name = appNameStyleToCss(identity)

    assert.equal(logo.backgroundColor, '#101820')
    assert.equal(logo.color, '#ffffff')
    assert.equal(logo.borderRadius, '3px')
    assert.equal(logo.border, '2px solid #ff00ff')
    assert.match(logo.boxShadow?.toString() ?? '', /10px/)
    assert.equal(
      (logo as React.CSSProperties & Record<string, string>)[
        '--dm-app-logo-size'
      ],
      '30px'
    )
    assert.equal(name.color, '#f5f5f5')
    assert.equal(name.opacity, 0.8)
    assert.equal(name.fontStretch, 'condensed')
    assert.equal(name.backgroundColor, '#abcdef')
    assert.equal(name.borderRadius, '999px')
    assert.equal(name.fontWeight, 700)
    assert.equal(name.fontStyle, 'italic')
    assert.equal(name.textDecoration, 'underline line-through')
    assert.equal(name.fontVariant, 'small-caps')
    assert.equal(name.textTransform, 'capitalize')
    assert.match(name.textShadow?.toString() ?? '', /rgb/)
  })

  it('uses the first Unicode character for the monogram', () => {
    assert.equal(getAppLogoInitial('desktop material'), 'D')
    assert.equal(getAppLogoInitial('🧰 Workbench'), '🧰')
  })
})
