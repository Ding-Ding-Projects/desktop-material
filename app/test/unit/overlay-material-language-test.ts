import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const style = (path: string) =>
  readFileSync(join(process.cwd(), 'app', 'styles', 'ui', path), 'utf8')

describe('Material overlay language', () => {
  it('paints centred dialogs on a high container with a modal scrim', () => {
    const dialog = style('_dialog.scss')
    const layer = style('_dialog-layer.scss')

    assert.match(
      dialog,
      /border: 1px solid var\(--md-sys-color-outline-variant\);[\s\S]*?border-radius: 20px;[\s\S]*?background: var\(--md-sys-color-surface-container-high\);/
    )
    assert.match(
      dialog,
      /\.dialog-header\s*\{[\s\S]*?min-height: 48px;[\s\S]*?padding: 12px 8px 8px 16px;/
    )
    assert.match(
      layer,
      /&\[data-modal\]::backdrop\s*\{[\s\S]*?var\(--md-sys-color-scrim\) 50%/
    )
  })

  it('renders banners as compact tonal cards and toasts as bottom snackbars', () => {
    const banners = style('_banners.scss')
    const toast = style('window/_toast-notification.scss')

    assert.match(
      banners,
      /\.banner\s*\{[\s\S]*?width: calc\(100% - 24px\);[\s\S]*?border-radius: 16px;[\s\S]*?box-shadow: var\(--md-sys-elevation-level1\);/
    )
    assert.match(
      toast,
      /\.toast-notification-container\s*\{[\s\S]*?position: fixed;[\s\S]*?bottom: 18px;/
    )
    assert.match(
      toast,
      /\.toast-notification\s*\{[\s\S]*?max-width: min\(520px,[\s\S]*?background: var\(--md-sys-color-inverse-surface\);[\s\S]*?border-radius: 12px;/
    )
  })

  it('keeps onboarding, the blank state, and notifications usable narrowly', () => {
    const welcome = style('_welcome.scss')
    const empty = style('_no-repositories.scss')
    const notifications = style('_notification-centre.scss')

    assert.match(
      welcome,
      /@media screen and \(max-width: 420px\)[\s\S]*?\.welcome-step-card\s*\{[\s\S]*?border-radius: 20px;/
    )
    assert.match(
      empty,
      /& > \.content-pane\s*\{[\s\S]*?border-radius: 24px;[\s\S]*?background: var\(--md-sys-color-surface-container-low\);/
    )
    assert.match(
      empty,
      /@media screen and \(max-width: 880px\)[\s\S]*?\.content\s*\{[\s\S]*?flex-direction: column;/
    )
    assert.match(
      notifications,
      /\.notification-centre-panel\s*\{[\s\S]*?width: 400px;[\s\S]*?border-radius: 20px;/
    )
    assert.match(
      notifications,
      /@media \(max-width: 420px\)[\s\S]*?\.notification-centre-filter-bar\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/
    )
  })
})
