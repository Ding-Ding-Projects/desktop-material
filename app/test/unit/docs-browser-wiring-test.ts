import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'
import { translate } from '../../src/lib/i18n'
import { translateWithFunnyLevel } from '../../src/lib/funny-level-text'

/**
 * Proves the documentation browser is reachable and localized, not merely
 * written.
 *
 * A surface nobody can open is the same as no surface, and this one is
 * required to be reachable from two places at once: the Help menu, and the
 * command palette — where a documentation row must land on the article it
 * names rather than on the browser's front page.
 *
 * The reachability assertions read the source, because "is it wired?" lives
 * in the wiring rather than in any value a unit test can call.
 */

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), 'app', ...parts), 'utf8')

const app = read('src', 'ui', 'app.tsx')
const popup = read('src', 'models', 'popup.ts')
const menu = read('src', 'main-process', 'menu', 'build-default-menu.ts')
const menuEvent = read('src', 'main-process', 'menu', 'menu-event.ts')
const palette = read('src', 'lib', 'command-palette-catalog.ts')
const paletteView = read('src', 'ui', 'command-palette', 'command-palette.tsx')
const dialog = read('src', 'ui', 'docs-browser', 'docs-browser-dialog.tsx')
const styles = readFileSync(
  join(process.cwd(), 'app', 'styles', '_ui.scss'),
  'utf8'
)

describe('documentation browser reachability', () => {
  it('has its own popup type carrying the article to open', () => {
    assert.match(popup, /DocsBrowser = 'DocsBrowser',/)
    assert.match(popup, /type: PopupType\.DocsBrowser/)
    assert.match(popup, /articleId\?: string/)
  })

  it('renders from the popup switch with the shared renderer inputs', () => {
    assert.match(app, /case PopupType\.DocsBrowser:/)
    assert.match(app, /<DocsBrowserDialog/)
    assert.match(app, /initialArticleId=\{popup\.articleId\}/)
    assert.match(app, /onExport=\{this\.onExportDocsArticles\}/)
    assert.match(app, /onOpenExternalLink=\{this\.onOpenDocsExternalLink\}/)
  })

  it('sits in the Help menu', () => {
    assert.match(menuEvent, /\| 'show-docs-browser'/)
    assert.match(menu, /id: 'show-docs-browser'/)
    assert.match(menu, /click: emit\('show-docs-browser'\)/)
    assert.match(menu, /showDocsBrowserItem,/)
    assert.match(app, /case 'show-docs-browser':/)
  })

  it('sits in the command palette, and teleports to one article', () => {
    assert.match(palette, /event: 'show-docs-browser'/)
    assert.match(palette, /\.\.\.DocsArticlePaletteCommands,/)
    // The palette handler must resolve the article id BEFORE the generic
    // `palette:` fallback, or every documentation row would teleport to the
    // catalog row instead of opening the article it names.
    const articleHandler = app.indexOf('parseDocsArticlePaletteEvent(event)')
    const genericHandler = app.indexOf("event.startsWith('palette:')")
    assert.ok(articleHandler > 0, 'no documentation row handler in app.tsx')
    assert.ok(
      articleHandler < genericHandler,
      'the generic palette fallback runs before the documentation row handler'
    )
    assert.match(app, /return this\.showDocsBrowser\(articleId\)/)
  })

  it('localizes its own palette group rather than falling back to English', () => {
    assert.match(paletteView, /case 'Documentation':/)
    assert.match(paletteView, /commandPalette\.groupDocumentation/)
  })

  it('ships a stylesheet that is actually imported', () => {
    assert.match(styles, /@import 'ui\/docs-browser';/)
  })
})

describe('documentation browser obligations', () => {
  it('uses the shared Markdown renderer rather than a second one', () => {
    // The delimiter matters: `<SandboxedMarkdownX` contains
    // `<SandboxedMarkdown`, so a bare substring assertion survives exactly the
    // rename it exists to catch.
    assert.match(dialog, /<SandboxedMarkdown[\s/>]/)
    assert.match(
      dialog,
      /onMarkdownLinkClicked=\{this\.onMarkdownLinkClicked\}/
    )
    assert.ok(
      !/marked\(|dangerouslySetInnerHTML/.test(dialog),
      'the browser must not render Markdown itself'
    )
  })

  it('searches through the shared MD3 field and its anchored regex builder', () => {
    assert.match(dialog, /<Md3SearchField/)
    assert.match(dialog, /<Md3RegexBuilderDialog/)
    assert.match(dialog, /onOpenBuilder=\{this\.onOpenBuilder\}/)
    // Applying a pattern must turn regex mode on, or the field searches for
    // the pattern's literal characters.
    assert.match(dialog, /regexEnabled: true/)
  })

  it('offers bulk selection and export on its list', () => {
    assert.match(dialog, /aria-multiselectable=\{true\}/)
    assert.match(dialog, /onSelectAllListed/)
    assert.match(dialog, /onInvertSelection/)
    assert.match(dialog, /onClearSelection/)
    assert.match(dialog, /this\.exportAs\('markdown'\)/)
    assert.match(dialog, /this\.exportAs\('text'\)/)
    assert.match(dialog, /this\.exportAs\('json'\)/)
  })

  it('answers a shift-click range and a keyboard equivalent', () => {
    assert.match(dialog, /event\.shiftKey/)
    assert.match(dialog, /case 'ArrowDown':/)
    assert.match(dialog, /case 'ArrowUp':/)
    assert.match(dialog, /case ' ':/)
    assert.match(dialog, /case 'Enter':/)
  })

  it('reports a link that resolves to nothing rather than swallowing it', () => {
    assert.match(dialog, /docsBrowser\.linkUnbundled/)
    assert.match(dialog, /docsBrowser\.linkUnreadable/)
  })

  it('uses the app tooltip rather than the banned title attribute', () => {
    assert.ok(
      !/\stitle="/.test(dialog),
      'title= is banned; use the repository Tooltip'
    )
  })
})

describe('documentation browser localization', () => {
  const keys: ReadonlyArray<TranslationKey> = (
    Object.keys(englishTranslations) as ReadonlyArray<TranslationKey>
  ).filter(key => key.startsWith('docsBrowser.'))

  /**
   * Keys whose value is a technical proper name that is written the same way
   * in both languages. Listed explicitly, so a key that reads identically for
   * any other reason — English text pasted into the Cantonese catalog — still
   * fails.
   */
  const sameInBothLanguages = new Set<string>([
    'docsBrowser.category.agentApi',
    'docsBrowser.category.linuxTui',
  ])

  it('translates every key of its own in both catalogs', () => {
    assert.ok(keys.length > 30, `only ${keys.length} docsBrowser keys found`)
    for (const key of keys) {
      if (sameInBothLanguages.has(key)) {
        assert.strictEqual(cantoneseTranslations[key], englishTranslations[key])
        assert.notStrictEqual(cantoneseTranslations[key], undefined)
        continue
      }
      const english = englishTranslations[key]
      const cantonese = cantoneseTranslations[key]
      assert.ok(
        english !== undefined && english.trim().length > 0,
        `${key} has no English text`
      )
      // The Cantonese catalog is a `Partial` record, so a key present in one
      // catalog and absent from the other type-checks. Say so by name rather
      // than reading `undefined.trim()`.
      assert.ok(
        cantonese !== undefined && cantonese.trim().length > 0,
        `${key} is missing from the Cantonese catalog`
      )
      assert.notStrictEqual(
        cantonese,
        english,
        `${key} has English text sitting in the Cantonese catalog`
      )
    }
  })

  it('renders its chrome in all three language modes', () => {
    assert.strictEqual(
      translate('docsBrowser.title', 'english'),
      'Feature documentation'
    )
    assert.strictEqual(
      translate('docsBrowser.title', 'cantonese'),
      '功能說明書'
    )
    assert.strictEqual(
      translate('docsBrowser.title', 'bilingual'),
      'Feature documentation · 功能說明書'
    )
  })

  it('states the same counts at every funny level, in every mode', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      const english = translateWithFunnyLevel(
        'docsBrowser.summary',
        'english',
        { english: level, cantonese: level },
        { shown: '12', total: '148' }
      )
      assert.ok(english.includes('12'), `level ${level} lost the shown count`)
      assert.ok(english.includes('148'), `level ${level} lost the total`)

      const cantonese = translateWithFunnyLevel(
        'docsBrowser.summary',
        'cantonese',
        { english: level, cantonese: level },
        { shown: '12', total: '148' }
      )
      assert.ok(cantonese.includes('12'))
      assert.ok(cantonese.includes('148'))
    }
  })

  it('keeps the searched phrase in the empty state at every level', () => {
    for (const level of [1, 3, 5]) {
      const text = translateWithFunnyLevel(
        'docsBrowser.empty',
        'bilingual',
        { english: level, cantonese: level },
        { query: 'submodule' }
      )
      assert.ok(
        text.split('submodule').length === 3,
        `level ${level} did not name the query in both languages: ${text}`
      )
    }
  })

  it('says plainly that bundled articles cannot be deleted', () => {
    for (const mode of ['english', 'cantonese'] as const) {
      const text = translate('docsBrowser.deleteUnavailable', mode)
      assert.ok(text.length > 20, `${mode} explanation is too thin`)
    }
  })
})
