import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  clampTabFontSize,
  isValidTabColor,
  isValidFontFamily,
  tabTitleStyleToCss,
  tabFrameStyleToCss,
  tabFontStack,
  MinTabFontSize,
  MaxTabFontSize,
} from '../../src/models/repository-tab'
import { Repository } from '../../src/models/repository'
import { ProfileStore } from '../../src/lib/stores/profile-store'
import { RepositoryTabsStore } from '../../src/lib/stores/repository-tabs-store'

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
    assert.equal(tabTitleStyleToCss({ fontSize: 100 }).fontSize, '32px')
    assert.equal(tabTitleStyleToCss({ fontSize: 1 }).fontSize, '10px')
  })

  it('resolves a curated font family to its stack', () => {
    assert.equal(
      tabTitleStyleToCss({ fontFamily: 'Segoe UI' }).fontFamily,
      `'Segoe UI', system-ui, sans-serif`
    )
  })

  it('keeps back-compat with legacy font buckets', () => {
    // 'system' inherits the default (no override).
    assert.equal(
      tabTitleStyleToCss({ fontFamily: 'system' }).fontFamily,
      undefined
    )
    // 'serif'/'monospace' still resolve to serif/monospace stacks.
    assert.equal(
      tabTitleStyleToCss({ fontFamily: 'serif' }).fontFamily,
      'serif'
    )
    assert.equal(
      tabTitleStyleToCss({ fontFamily: 'monospace' }).fontFamily,
      'monospace'
    )
  })

  it('drops a font family that fails validation (no CSS injection)', () => {
    assert.equal(
      tabTitleStyleToCss({ fontFamily: 'Arial; } body { display:none' })
        .fontFamily,
      undefined
    )
  })
})

describe('isValidFontFamily', () => {
  it('accepts curated and generic family names', () => {
    assert.ok(isValidFontFamily('Segoe UI'))
    assert.ok(isValidFontFamily('Times New Roman'))
    assert.ok(isValidFontFamily('sans-serif'))
  })

  it('rejects names carrying CSS punctuation', () => {
    assert.ok(!isValidFontFamily('Arial;'))
    assert.ok(!isValidFontFamily('a{color:red}'))
    assert.ok(!isValidFontFamily(''))
  })
})

describe('tabFontStack', () => {
  it('quotes an unknown but valid family with a generic fallback', () => {
    assert.equal(tabFontStack('My Font'), `'My Font', sans-serif`)
  })

  it('returns undefined for an unsafe family', () => {
    assert.equal(tabFontStack('a}b{'), undefined)
  })
})

describe('tabFrameStyleToCss', () => {
  it('does not grow the frame at or below the default size', () => {
    assert.deepEqual(tabFrameStyleToCss(null), {})
    assert.deepEqual(tabFrameStyleToCss({}), {})
    assert.deepEqual(tabFrameStyleToCss({ fontSize: 13 }), {})
  })

  it('grows height and min-width for a larger size', () => {
    const css = tabFrameStyleToCss({ fontSize: 32 })
    assert.ok(typeof css.height === 'string' && parseInt(css.height, 10) > 38)
    assert.ok(
      typeof css.minWidth === 'string' && parseInt(css.minWidth, 10) > 132
    )
  })

  it('caps min-width at the strip max width', () => {
    const css = tabFrameStyleToCss({ fontSize: MaxTabFontSize })
    assert.ok(parseInt(String(css.minWidth), 10) <= 240)
  })
})

describe('RepositoryTabsStore', () => {
  it('rebinds a restored active tab by path without losing its presentation', async () => {
    let writes = 0
    const restored = {
      tabs: [
        {
          id: 'restored-tab',
          repositoryId: 41,
          repositoryPath: 'C:\\work\\desktop-material',
          customLabel: 'Styled tab',
          titleStyle: { bold: true },
        },
      ],
      activeTabId: 'restored-tab',
    }
    const profileStore = {
      readTabs: () => Promise.resolve(restored),
      writeTabs: () => {
        writes++
        return Promise.resolve()
      },
    } as unknown as ProfileStore
    const store = new RepositoryTabsStore(profileStore)
    await store.initialize()

    store.rebindActiveTabToRepository({
      id: 99,
      path: 'C:\\work\\desktop-material',
    } as Repository)

    const active = store.getActiveTab()
    assert.equal(active?.repositoryId, 99)
    assert.equal(active?.customLabel, 'Styled tab')
    assert.deepEqual(active?.titleStyle, { bold: true })
    assert.equal(store.getState().tabs.length, 1)
    assert.equal(writes, 0)
  })
})
