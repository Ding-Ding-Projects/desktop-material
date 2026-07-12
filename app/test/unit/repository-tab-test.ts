import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  clampTabFontSize,
  isValidTabColor,
  tabTitleStyleToCss,
  MinTabFontSize,
  MaxTabFontSize,
} from '../../src/models/repository-tab'

describe('clampTabFontSize', () => {
  it('clamps below the minimum', () => {
    assert.equal(clampTabFontSize(2), MinTabFontSize)
  })

  it('clamps above the maximum', () => {
    assert.equal(clampTabFontSize(99), MaxTabFontSize)
  })

  it('rounds values within range', () => {
    assert.equal(clampTabFontSize(12.4), 12)
    assert.equal(clampTabFontSize(12.6), 13)
  })
})

describe('isValidTabColor', () => {
  it('accepts hex colors', () => {
    assert.ok(isValidTabColor('#fff'))
    assert.ok(isValidTabColor('#00ff00'))
    assert.ok(isValidTabColor('#11223344'))
  })

  it('rejects anything that is not a hex color', () => {
    assert.ok(!isValidTabColor('red'))
    assert.ok(!isValidTabColor('url(x)'))
    assert.ok(!isValidTabColor('#ggg'))
    assert.ok(!isValidTabColor('javascript:alert(1)'))
  })
})

describe('tabTitleStyleToCss', () => {
  it('returns an empty object for a null style', () => {
    assert.deepEqual(tabTitleStyleToCss(null), {})
  })

  it('drops a color that fails validation (no CSS injection)', () => {
    const css = tabTitleStyleToCss({ color: 'expression(alert(1))' })
    assert.equal(css.color, undefined)
  })

  it('keeps a valid color', () => {
    const css = tabTitleStyleToCss({ color: '#123456' })
    assert.equal(css.color, '#123456')
  })

  it('applies bold, italic, and underline', () => {
    const css = tabTitleStyleToCss({
      bold: true,
      italic: true,
      underline: true,
    })
    assert.equal(css.fontWeight, 'bold')
    assert.equal(css.fontStyle, 'italic')
    assert.equal(css.textDecoration, 'underline')
  })

  it('clamps the font size', () => {
    assert.equal(tabTitleStyleToCss({ fontSize: 100 }).fontSize, '20px')
    assert.equal(tabTitleStyleToCss({ fontSize: 1 }).fontSize, '10px')
  })
})
