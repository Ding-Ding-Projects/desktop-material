import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  DefaultInternalBrowserContentTop,
  InternalBrowserChromeBorderHeight,
  InternalBrowserCompactTabStripMinimumHeight,
  InternalBrowserCompactToolbarMinimumHeight,
  InternalBrowserTabStripMinimumHeight,
  InternalBrowserToolbarMinimumHeight,
  MinimumInternalBrowserContentTop,
} from '../../src/lib/internal-browser'

const style = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'internal-browser',
    'styles',
    'internal-browser.scss'
  ),
  'utf8'
)

function declaredPixels(selector: string, property: string): number {
  const rule = new RegExp(
    `${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*?${property}: (\\d+)px;`
  ).exec(style)
  assert.notEqual(rule, null, `${selector} should declare ${property}`)
  return Number(rule?.[1])
}

function scopedDeclaredPixels(
  scope: string,
  selector: string,
  property: string
): number {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(
    `${escape(scope)}\\s*\\{[\\s\\S]*?${escape(
      selector
    )}\\s*\\{[^}]*?${property}: (\\d+)px;`
  ).exec(style)
  assert.notEqual(rule, null, `${scope} ${selector} should declare ${property}`)
  return Number(rule?.[1])
}

describe('internal browser chrome styles', () => {
  it('agrees with the comfortable fallback and compact measured floor', () => {
    assert.equal(
      declaredPixels('.internal-browser-tab-strip', 'min-height'),
      InternalBrowserTabStripMinimumHeight
    )
    assert.equal(
      declaredPixels('.internal-browser-toolbar', 'min-height'),
      InternalBrowserToolbarMinimumHeight
    )
    assert.match(
      style,
      /\.internal-browser-chrome\s*\{[^}]*?border-bottom: 1px solid/s
    )
    assert.equal(InternalBrowserChromeBorderHeight, 1)
    assert.equal(DefaultInternalBrowserContentTop, 107)
    assert.equal(
      scopedDeclaredPixels(
        "body[data-dm-tab-density='compact']",
        '.internal-browser-tab-strip',
        'min-height'
      ),
      InternalBrowserCompactTabStripMinimumHeight
    )
    assert.equal(
      scopedDeclaredPixels(
        "body[data-dm-toolbar-density='compact']",
        '.internal-browser-toolbar',
        'min-height'
      ),
      InternalBrowserCompactToolbarMinimumHeight
    )
    assert.equal(MinimumInternalBrowserContentTop, 93)
  })

  it('collapses only the label of the narrow external-open button', () => {
    // `MaterialSymbol` renders its glyph into a span as well, so an unqualified
    // `span` here emptied the button of its icon too and left a bare circle.
    const narrow = /@media \(max-width: 840px\)[\s\S]*$/.exec(style)?.[0] ?? ''
    assert.match(
      narrow,
      /\.internal-browser-external-button\s*\{[\s\S]*?span:not\(\.material-symbol\)\s*\{/
    )
    assert.doesNotMatch(narrow, /\bspan\s*\{/)
  })

  it('keeps the focus ring inside both horizontal scrollers', () => {
    // `overflow-x: auto` computes `overflow-y` to `auto` too, so a ring drawn
    // outside a tab or bookmark is clipped away entirely.
    assert.match(style, /\.internal-browser-tabs\s*\{[^}]*?overflow-x: auto;/s)
    assert.match(
      style,
      /\.internal-browser-bookmarks\s*\{[^}]*?overflow-x: auto;/s
    )
    assert.match(
      style,
      /\.internal-browser-tabs :focus-visible,\s*\.internal-browser-bookmarks :focus-visible\s*\{\s*outline-offset: -2px;/
    )
  })
})
