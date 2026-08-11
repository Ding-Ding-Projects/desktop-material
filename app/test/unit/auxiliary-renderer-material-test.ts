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
    assert.match(crashStyle, /--crash-primary: #1c6b34;/)
    assert.match(
      crashStyle,
      /\.crash-card\s*\{[\s\S]*?border-radius: 24px;[\s\S]*?background: var\(--crash-surface\);/
    )
    assert.match(
      crashStyle,
      /\.crash-heading\s*\{[\s\S]*?background: var\(--crash-error-container\);/
    )
  })

  it('uses the green tonal hierarchy for browser chrome and anchored search', () => {
    assert.match(browserStyle, /--browser-primary: #1c6b34;/)
    assert.match(
      browserStyle,
      /\.internal-browser-tab\.active|&\.active\s*\{[\s\S]*?background: var\(--browser-primary-container\);/
    )
    assert.match(
      browserStyle,
      /\.internal-browser-find-bar\s*\{[\s\S]*?border-radius: 16px;[\s\S]*?background: var\(--browser-surface-container-high\);/
    )
    assert.match(
      browserStyle,
      /\.internal-browser-address\s*\{[\s\S]*?border-radius: 12px;/
    )
  })

  it('renders quick actions as responsive tonal header and dialog cards', () => {
    assert.match(quickActionStyle, /--qa-primary: #1c6b34;/)
    assert.match(
      quickActionStyle,
      /\.quick-action-header\s*\{[\s\S]*?background: var\(--qa-primary-container\);/
    )
    assert.match(
      quickActionStyle,
      /\.quick-action-body\s*\{[\s\S]*?border-radius: var\(--qa-radius-l\);[\s\S]*?background: var\(--qa-surface\);/
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
      assert.match(source, /backgroundColor: '#f7fbf2'/)
    }
  })
})
