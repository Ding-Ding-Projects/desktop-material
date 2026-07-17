import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const appMenuStyle = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_app-menu.scss'),
  'utf8'
)
const shellStyle = readFileSync(
  join(process.cwd(), 'app', 'styles', '_material-shell.scss'),
  'utf8'
)
const motionStyle = readFileSync(
  join(process.cwd(), 'app', 'styles', 'material', '_motion.scss'),
  'utf8'
)
const menuPane = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'app-menu', 'menu-pane.tsx'),
  'utf8'
)
const appMenu = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'app-menu', 'app-menu.tsx'),
  'utf8'
)

describe('app menu + context menu v2 styles', () => {
  it('renders each app-menu pane as a flat 250px dropdown card', () => {
    assert.match(
      appMenuStyle,
      /#app-menu-foldout \.menu-pane\s*\{[\s\S]*?min-width: 250px;[\s\S]*?padding: 8px 0;[\s\S]*?background: var\(--md-sys-color-surface-container\);[\s\S]*?border: 1px solid var\(--md-sys-color-outline-variant\);[\s\S]*?border-radius: var\(--md-sys-shape-corner-medium\);[\s\S]*?box-shadow: var\(--md-sys-elevation-level3\);/
    )
  })

  it('animates the dropdown in with the prototype dmDown 200ms entrance', () => {
    assert.match(
      appMenuStyle,
      /#app-menu-foldout \.menu-pane\s*\{[\s\S]*?animation: dmDown calc\(200ms \* var\(--mdur, 1\)\) var\(--spring-fast\)\s+both;/
    )
    // The keyframes are the shared dm* set, not something bespoke.
    assert.match(motionStyle, /@keyframes dmDown/)
  })

  it('lays rows out as 34px flat full-width items instead of inset pills', () => {
    assert.match(
      appMenuStyle,
      /#app-menu-foldout \.menu-pane\s*\{[\s\S]*?\.menu-item\s*\{\s*gap: 10px;\s*height: 34px;[\s\S]*?margin: 0;\s*padding: 0 14px;\s*border-radius: 0;\s*font-size: 13px;/
    )
  })

  it('washes hovered and keyboard-selected rows with the 8% on-surface mix', () => {
    assert.match(
      appMenuStyle,
      /&\.selected,\s*&:hover:not\(\.disabled\)\s*\{[\s\S]*?background: color-mix\(\s*in srgb,\s*var\(--md-sys-color-on-surface\) 8%,\s*transparent\s*\);/
    )
  })

  it('reserves an 18px icon column and lets the label flex', () => {
    assert.match(
      appMenuStyle,
      /\.icon\s*\{\s*flex: none;\s*width: 18px;\s*height: 18px;\s*margin: 0;\s*color: var\(--md-sys-color-on-surface-variant\);/
    )
    // Rows without a leading glyph keep the icon-column indent (18px + 10px gap).
    assert.match(
      appMenuStyle,
      /\.label\s*\{\s*flex: 1;\s*min-width: 0;[\s\S]*?margin-left: 28px;/
    )
    assert.match(appMenuStyle, /&\.checked \.label\s*\{\s*margin-left: 0;/)
  })

  it('sets the shortcut column in quiet 11px monospace', () => {
    assert.match(
      appMenuStyle,
      /\.accelerator\s*\{\s*flex: none;\s*margin-left: 18px;\s*margin-right: 0;\s*font-family: 'Roboto Mono', var\(--font-family-monospace\);\s*font-size: 11px;\s*color: var\(--md-sys-color-on-surface-variant\);/
    )
  })

  it('insets hairline dividers 6px 12px from the card edges', () => {
    assert.match(
      appMenuStyle,
      /#app-menu-foldout \.menu-pane\s*\{[\s\S]*?hr\s*\{\s*margin: 6px 12px;\s*border-top: 1px solid var\(--md-sys-color-outline-variant\);/
    )
  })

  it('strips the shared popover chrome off the anchoring foldout container', () => {
    assert.match(
      appMenuStyle,
      /\.toolbar-dropdown \.foldout:has\(#app-menu-foldout\)\s*\{\s*background: transparent;\s*border: 0;\s*box-shadow: none;/
    )
  })

  it('splits the app-menu foldout and context menu out to the medium radius', () => {
    // The shared popover rule keeps the large radius for every other surface…
    assert.match(
      shellStyle,
      /\.popover,\s*\.popup,\s*\.toolbar-dropdown \.foldout,\s*\.select-component select,\s*\.context-menu\s*\{[\s\S]*?border-radius: var\(--md-sys-shape-corner-large\);/
    )
    // …while the flat dropdown menus round at the medium corner instead.
    assert.match(
      shellStyle,
      /\.context-menu,\s*\.toolbar-dropdown \.foldout:has\(#app-menu-foldout\)\s*\{\s*border-radius: var\(--md-sys-shape-corner-medium\);\s*\}/
    )
  })

  it('keeps the multi-pane keyboard navigation and access-key machinery', () => {
    // Access-key underline styling survives the restyle.
    assert.match(
      appMenuStyle,
      /\.access-key\.highlight\s*\{\s*text-decoration: underline;/
    )
    // The pane is still an ARIA menu with its keyboard handler attached.
    assert.match(menuPane, /role="menu"/)
    assert.match(menuPane, /onKeyDown=\{this\.onKeyDown\}/)
    // The foldout still renders one pane per open (sub)menu.
    assert.match(
      appMenu,
      /menus\.map\(\(m, depth\) => this\.renderMenuPane\(depth, m\)\)/
    )
    assert.match(appMenu, /<div id="app-menu-foldout">\{panes\}<\/div>/)
  })
})
