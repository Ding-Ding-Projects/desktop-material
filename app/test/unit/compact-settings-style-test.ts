import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const readStyle = (name: string) =>
  readFileSync(join(process.cwd(), 'app', 'styles', 'ui', name), 'utf8')

describe('compact settings style contracts', () => {
  it('keeps Preferences recoverable from a narrow pane without sideways scrolling', () => {
    const style = readStyle('_preferences.scss')

    assert.match(style, /container-name: preferences-dialog;/)
    assert.match(style, /container-name: preferences-pane;/)
    assert.match(
      style,
      /@container preferences-dialog \(max-width: 620px\)[\s\S]*?\.preferences-rail\s*\{[\s\S]*?width: 72px;/
    )
    assert.match(
      style,
      /@container preferences-pane \(max-width: 520px\)[\s\S]*?\.provider-sign-in-card\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/
    )
    assert.match(
      style,
      /\.dialog-footer\s*\{[\s\S]*?\.button-group\s*\{[\s\S]*?flex-wrap: wrap;/
    )
  })

  it('turns Repository Settings into compact navigation and stacked cards', () => {
    const style = readStyle('dialogs/_repository-settings.scss')

    assert.match(style, /container-name: repository-settings-dialog;/)
    assert.match(style, /container-name: repository-settings-pane;/)
    assert.match(style, /overflow-x: hidden;/)
    assert.match(
      style,
      /@container repository-settings-dialog \(max-width: 520px\)[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(40px, 1fr\)\);/
    )
    assert.match(
      style,
      /@container repository-settings-pane \(max-width: 620px\)[\s\S]*?\.remote-row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.remote-fields\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/
    )
    assert.doesNotMatch(
      style,
      /\.remote-row[\s\S]*grid-template-columns: minmax\(0, 1fr\) 40px/
    )
    assert.match(
      style,
      /> form\s*\{[\s\S]*?flex: 1;[\s\S]*?height: auto;[\s\S]*?overflow: hidden;/
    )
    assert.match(
      style,
      /> \.tab-bar\.vertical\s*\{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /@media \(max-height: 550px\)[\s\S]*?\.dialog-content\s*\{[\s\S]*?max-height: none !important;[\s\S]*?min-height: 0 !important;[\s\S]*?\.tab-container\s*\{[\s\S]*?max-height: none !important;/
    )
    assert.match(style, /\.submodule-row\s*\{[\s\S]*?flex-direction: column;/)
  })

  // Both settings dialogs navigate by a vertical strip that is taller than the
  // dialog holding it — Preferences always, Repository Settings on a short
  // window. The strips already scrolled, but Chromium draws an overlay
  // scrollbar there: it reserves no space and appears only once the list is
  // already moving. A strip that shows eight of thirteen pages and looks
  // finished is indistinguishable from a settings dialog that does not have
  // the other five, which is how it gets reported.
  it('reserves a visible scrollbar on the settings navigation strips', () => {
    // One assertion now covers both dialogs: they navigate through the same
    // shared strip, so the guarantee lives with it rather than being restated
    // once per dialog and drifting apart.
    const style = readStyle('_settings-tab-strip.scss')
    const list = style.match(/\.settings-tab-strip-list\s*\{([\s\S]*?)\n\}/)

    assert.ok(list, 'could not find the strip list rule')
    assert.match(
      list[1],
      /scrollbar-gutter: stable;/,
      'the gutter must be reserved, or the overflow stays invisible'
    )
    assert.match(list[1], /overflow-y: auto;/, 'the strip must still scroll')
  })

  it('refuses to let a settings row shrink below its own label', () => {
    // A flex item defaults to shrinking. When the rail ran out of room it
    // squeezed its rows instead of scrolling, which is what clipped "Branches"
    // in the navigation rail before the same rule was applied there.
    const style = readStyle('_settings-tab-strip.scss')
    const item = style.match(/\.settings-tab-strip-item\s*\{([\s\S]*?)\n\}/)

    assert.ok(item, 'could not find the strip item rule')
    assert.match(item[1], /(?:^|\n)\s*flex: none;/)
  })
})
