import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const crashApp = read('app', 'src', 'crash', 'crash-app.tsx')
const crashStyle = read('app', 'src', 'crash', 'styles', 'crash.scss')
const browserStyle = read(
  'app',
  'src',
  'internal-browser',
  'styles',
  'internal-browser.scss'
)
const quickActionStyle = read(
  'app',
  'src',
  'quick-action',
  'styles',
  'quick-action.scss'
)

describe('auxiliary renderer Material contract', () => {
  it('presents crash recovery as a bounded tonal decision card', () => {
    assert.match(
      crashApp,
      /<section className="crash-card" aria-labelledby="crash-title">/
    )
    assert.match(crashApp, /<h1 id="crash-title">/)
    assert.doesNotMatch(crashApp, /background-graphic/)
    // The private green palette this used to pin is gone. These windows now
    // resolve the application's own Material Design 3 roles, which is what
    // `standalone-window-roles-test.ts` asserts the values of; here we assert
    // only that the window reaches for a role rather than a colour of its own.
    assert.match(crashStyle, /@include md-standalone-roles;/)
    assert.doesNotMatch(crashStyle, /#[0-9a-fA-F]{6}/)
    assert.match(
      crashStyle,
      /\.crash-card\s*\{[\s\S]*?border-radius: 24px;[\s\S]*?background: var\(--md-sys-color-surface\);/
    )
    assert.match(
      crashStyle,
      /\.crash-heading\s*\{[\s\S]*?background: var\(--md-sys-color-error-container\);/
    )
  })

  it('uses the shared tonal hierarchy for browser chrome and anchored search', () => {
    assert.match(browserStyle, /@include md-standalone-color-roles-light;/)
    assert.doesNotMatch(browserStyle, /#[0-9a-fA-F]{6}/)
    assert.match(
      browserStyle,
      /\.internal-browser-tab\.active|&\.active\s*\{[\s\S]*?background: var\(--md-sys-color-primary-container\);/
    )
    assert.match(
      browserStyle,
      /\.internal-browser-find-bar\s*\{[\s\S]*?border-radius: 16px;[\s\S]*?background: var\(--md-sys-color-surface-container-high\);/
    )
    assert.match(
      browserStyle,
      /\.internal-browser-address\s*\{[\s\S]*?border-radius: 12px;/
    )
  })

  it('renders quick actions as responsive tonal header and dialog cards', () => {
    assert.match(quickActionStyle, /@include md-standalone-roles;/)
    assert.doesNotMatch(quickActionStyle, /#[0-9a-fA-F]{6}/)
    assert.match(
      quickActionStyle,
      /\.quick-action-header\s*\{[\s\S]*?background: var\(--md-sys-color-primary-container\);/
    )
    assert.match(
      quickActionStyle,
      /\.quick-action-body\s*\{[\s\S]*?border-radius: var\(--md-sys-shape-corner-large\);[\s\S]*?background: var\(--md-sys-color-surface\);/
    )
    assert.match(
      quickActionStyle,
      /@media \(max-width: 420px\), \(max-height: 350px\)[\s\S]*?\.quick-action-actions\s*\{[\s\S]*?flex-direction: column;/
    )
  })

  it('prepaints every auxiliary native window with the same surface role', () => {
    for (const source of [
      read('app', 'src', 'main-process', 'crash-window.ts'),
      read('app', 'src', 'main-process', 'internal-browser-window.ts'),
      read('app', 'src', 'main-process', 'quick-action-window.ts'),
    ]) {
      assert.match(source, /backgroundColor: '#f8f9ff'/)
    }
  })
})
