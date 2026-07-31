/**
 * Proves the changelog viewer is reachable, not merely written.
 *
 * A dialog nobody can open is the same as no dialog, and the shared
 * instructions are explicit that a link to release notes on a website does not
 * satisfy the requirement — which is exactly what the app had before this.
 * These assertions read the source, because that is where "is it wired?" lives.
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), 'app', ...parts), 'utf8')

const app = read('src', 'ui', 'app.tsx')
const popup = read('src', 'models', 'popup.ts')
const menu = read('src', 'main-process', 'menu', 'build-default-menu.ts')
const menuEvent = read('src', 'main-process', 'menu', 'menu-event.ts')
const about = read('src', 'ui', 'about', 'about.tsx')
const palette = read('src', 'lib', 'command-palette-catalog.ts')
const dialog = read('src', 'ui', 'changelog', 'changelog-dialog.tsx')

describe('changelog viewer reachability', () => {
  it('has its own popup type, distinct from the update release notes', () => {
    assert.match(popup, /Changelog = 'Changelog',/)
    assert.match(popup, /type: PopupType\.Changelog/)
    // ReleaseNotes shows only what a pending update would install; it is not a
    // changelog and must not be repurposed as one.
    assert.match(popup, /ReleaseNotes = 'ReleaseNotes',/)
  })

  it('renders from the popup switch', () => {
    assert.match(app, /case PopupType\.Changelog:/)
    assert.match(app, /<ChangelogDialog/)
    assert.match(app, /onExport=\{this\.onExportChangelog\}/)
  })

  it('sits in the Help menu and the command palette', () => {
    assert.match(menuEvent, /\| 'show-changelog'/)
    assert.match(menu, /id: 'show-changelog'/)
    assert.match(menu, /click: emit\('show-changelog'\)/)
    assert.match(menu, /showChangelogItem,/)
    assert.match(app, /case 'show-changelog':/)
    assert.match(palette, /event: 'show-changelog'/)
  })

  it('is offered from About, beside the website link', () => {
    assert.match(about, /onShowChangelog/)
    assert.match(about, /release history/)
    assert.match(app, /onShowChangelog=\{this\.showChangelog\}/)
  })
})

describe('changelog viewer obligations', () => {
  it('searches through the shared regex builder, not a private search box', () => {
    assert.match(dialog, /<FilterModeControl/)
    assert.match(dialog, /onRegexPatternApply=\{this\.onRegexPatternApply\}/)
    // Plain text stays the default; regex is an explicit opt-in.
    assert.match(dialog, /DefaultChangelogFilter/)
  })

  it('offers the advanced date picker rather than two bare inputs', () => {
    assert.match(dialog, /<DateRangePicker/)
    const picker = read('src', 'ui', 'lib', 'date-range-picker.tsx')
    assert.match(picker, /date-range-presets/)
    assert.match(
      picker,
      /aria-label=\{this\.accessibleText\('dateRange\.month'\)\}/
    )
    assert.match(
      picker,
      /aria-label=\{this\.accessibleText\('dateRange\.year'\)\}/
    )
    // Typed entry is reported inline without discarding what was typed.
    assert.match(picker, /role="alert"/)
    assert.match(picker, /parseTypedDate/)
  })

  it('exports and copies what is on screen', () => {
    assert.match(dialog, /exportChangelog\(/)
    assert.match(dialog, /navigator\.clipboard\.writeText/)
    // The export runs over the filtered result, never the whole catalog.
    assert.match(dialog, /const result = this\.getResult\(\)/)
    assert.doesNotMatch(
      dialog,
      /exportChangelog\(\s*ChangelogReleases/,
      'the export must not silently widen to the unfiltered history'
    )
  })

  it('obeys the language modes and both funny levels', () => {
    assert.match(dialog, /translateWithFunnyLevel\(/)
    assert.match(dialog, /readFunnyLevels\(\)/)
    assert.match(dialog, /LanguageModeChangedEvent/)
  })

  it('reports an unrecorded date instead of leaving it blank', () => {
    assert.match(dialog, /changelog\.dateUnrecorded/)
    assert.match(dialog, /release\.date === null/)
  })
})
