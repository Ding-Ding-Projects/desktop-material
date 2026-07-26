import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8')

/**
 * Repository visuals are edited from their actual list-row owners. The
 * anchored name and logo editors keep their rich controls, and the Repository
 * Settings appearance hub reuses those very editors rather than reintroducing
 * the retired monolithic tab: persistence and history stay with the owners.
 */
describe('repository owner appearance editors', () => {
  it('styles colour swatches, segmented chips, and the live preview', () => {
    const style = read('app', 'styles', 'ui', '_repository-logo.scss')

    // Round colour swatch driven by its own --swatch custom property, with a
    // primary ring on the active one.
    assert.match(
      style,
      /\.appearance-swatch \{[\s\S]*?background: var\(--swatch,/
    )
    assert.match(
      style,
      /\.appearance-swatch \{[\s\S]*?&\.active \{[\s\S]*?var\(--md-sys-color-primary\)/
    )
    // Segmented / toggle chip with a tonal active state.
    assert.match(
      style,
      /\.appearance-chip \{[\s\S]*?&\.active \{[\s\S]*?var\(--md-sys-color-secondary-container\)/
    )
    // Live preview canvas with a mock tab and repository-list row.
    assert.match(style, /\.repository-appearance-preview \{/)
    assert.match(style, /\.repository-appearance-preview-tab \{/)
    assert.match(style, /\.repository-appearance-preview-row \{/)
  })

  it('opens owner-scoped name and logo editors from the repository row', () => {
    const row = read(
      'app',
      'src',
      'ui',
      'repositories-list',
      'repository-list-item.tsx'
    )
    const editors = read(
      'app',
      'src',
      'ui',
      'appearance',
      'repository-element-appearance-editors.tsx'
    )

    // Right-clicking the row no longer opens the editor directly (that was
    // triggerable by accident). The row exposes menu-driven openers that the
    // repository context menu's "Customize …" items call, resolving the anchor
    // from the row's own DOM.
    assert.doesNotMatch(row, /openAppearanceEditorFromContextMenu/)
    assert.match(row, /public openNameAppearanceEditorFromMenu\(\)/)
    assert.match(row, /public openLogoAppearanceEditorFromMenu\(\)/)
    assert.match(
      row,
      /data-context-menu-owner="repository-list-name-appearance"/
    )
    assert.match(row, /\.repository-list-logo-appearance-target/)
    // The keyboard path (Shift+F10 / ContextMenu key) still opens directly.
    assert.match(
      row,
      /openAppearanceEditorFromKeyDown\(event, this\.openNameAppearanceEditor\)/
    )
    assert.match(
      row,
      /openAppearanceEditorFromKeyDown\(event, this\.openLogoAppearanceEditor\)/
    )
    assert.match(row, /getRepositoryAppearanceHistorySource/)
    assert.match(row, /getRepositoryAppearanceRepositoryPath/)
    assert.match(row, /<AnchoredAppearanceEditor/)
    assert.match(row, /<RepositoryListNameAppearanceEditor/)
    assert.match(row, /<RepositoryLogoAppearanceEditor/)

    assert.match(editors, /class RepositoryListNameAppearanceEditor/)
    assert.match(editors, /aria-label="Live name preview"/)
    assert.match(editors, /class RepositoryLogoAppearanceEditor/)
    assert.match(editors, /<RepositoryLogoStudio/)
  })

  it('reuses the same owner editors and owner paths in the Repository Settings hub', () => {
    const hub = read(
      'app',
      'src',
      'ui',
      'repository-settings',
      'repository-appearance.tsx'
    )
    const style = read(
      'app',
      'styles',
      'ui',
      'dialogs',
      '_repository-settings.scss'
    )

    // The hub mounts the very editors the anchored surfaces mount; it never
    // declares a parallel set of controls.
    for (const editor of [
      '<RepositoryListNameAppearanceEditor',
      '<RepositoryLogoAppearanceEditor',
      '<RepositoryTabsOverrideAppearanceEditor',
      '<RepositoryToolbarAppearanceEditor',
      '<RepositoryWorkspaceAppearanceEditor',
    ]) {
      assert.ok(hub.includes(editor), `Hub must render ${editor}`)
    }

    // Reads, writes, and history all go through the repository-scoped owners.
    assert.match(hub, /dispatcher\.getRepositoryAppearanceElements\(/)
    assert.match(hub, /dispatcher[\s\S]{0,80}setRepositoryAppearanceElement\(/)
    assert.match(hub, /getRepositoryAppearanceHistorySource\(/)
    assert.match(hub, /getRepositoryAppearanceRepositoryPath\(/)
    assert.match(hub, /<AppearanceElementHistoryDialog/)
    // Reset writes the shared default rather than a locally invented value.
    assert.match(hub, /DefaultRepositoryAppearanceElementSettings\[id\]/)
    // A repository dialog must never write a profile owner.
    assert.doesNotMatch(hub, /setProfileAppearanceElement/)

    assert.match(style, /\.repository-appearance-settings \{/)
    assert.match(style, /\.repository-appearance-section \{/)
    assert.match(style, /\.repository-appearance-status \{/)
    assert.match(
      style,
      /@container repository-settings-dialog \(max-width: 520px\)[\s\S]*?\.repository-appearance-section-header \{[\s\S]*?flex-direction: column/
    )
  })
})
