import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'app', ...path.split('/')), 'utf8')

const preferences = read('styles/ui/_preferences.scss')
const repositorySettings = read('styles/ui/dialogs/_repository-settings.scss')
const settingsTabs = read('styles/ui/_settings-tab-strip.scss')
const appearance = read('styles/ui/_appearance-editors.scss')

describe('settings workbench Material styling', () => {
  it('uses the shared tonal navigation and content panel roles', () => {
    assert.match(
      settingsTabs,
      /\.settings-tab-strip-browser\s*\{[^}]*?surface-container/
    )
    assert.match(
      settingsTabs,
      /\.settings-browser-tab[\s\S]*?&\.active[\s\S]*?md-sys-color-surface/
    )
  })

  it('keeps both settings surfaces compact and responsive', () => {
    assert.match(preferences, /\.preferences-title\s*\{/)
    assert.match(
      preferences,
      /@container preferences-dialog \(max-width: 620px\)[\s\S]*?width: 72px/
    )
    assert.match(
      repositorySettings,
      /repository-settings-tab-filter-field[\s\S]*?border-radius: var\(--md-sys-shape-corner-full\)/
    )
    assert.match(
      repositorySettings,
      /@container repository-settings-dialog \(max-width: 520px\)[\s\S]*?width: 200px/
    )
  })

  it('bounds picker and appearance overlays inside the shared elevated popover', () => {
    assert.match(
      settingsTabs,
      /\.settings-tab-picker\s*\{[^}]*?max-width: min\(360px/
    )
    assert.match(
      appearance,
      /\.element-appearance-editor\s*\{[^}]*?max-height: min\(660px/
    )
  })
})
