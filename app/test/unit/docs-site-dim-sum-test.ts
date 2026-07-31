import assert from 'node:assert'
import { after, describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'

const require_ = createRequire(import.meta.url)

interface IDish {
  readonly id: string
  readonly en: string
  readonly yue: string
  readonly rom: string
  readonly file: string
}

interface IComposed {
  readonly dish: IDish
  readonly primaryLanguage: string
  readonly secondaryLanguage: string | null
  readonly region: string
  readonly dismiss: string
  readonly name: string
  readonly nameParts: ReadonlyArray<{
    readonly text: string
    readonly lang: string | null
  }>
  readonly primaryHtmlLang: string
  readonly secondaryHtmlLang: string | null
  readonly alt: string
  readonly rom: string
  readonly primary: { readonly title: string; readonly lead: string }
  readonly secondary: { readonly title: string; readonly lead: string } | null
}

interface IPreferences {
  readonly lang: string
  readonly funEn: number
  readonly funYue: number
}

interface IDimSumApi {
  readonly probability: number
  readonly storageKey: string
  readonly assetDirectory: string
  readonly dishes: ReadonlyArray<IDish>
  isEnabled(): boolean
  setEnabled(enabled: boolean): boolean
  isQuiet(): boolean
  shouldShow(randomValue: unknown, enabled?: boolean): boolean
  pick(randomValue: unknown): IDish
  dishById(id: string): IDish | null
  displayName(dish: IDish, languageId: string): string
  nameParts(
    dish: IDish,
    languageId: string
  ): ReadonlyArray<{ readonly text: string; readonly lang: string | null }>
  htmlLangOf(languageId: string): string
  altText(dish: IDish, languageId: string): string
  copy(
    languageId: string,
    level: number
  ): { readonly title: string; readonly lead: string }
  compose(dish: IDish, preferences?: IPreferences): IComposed
  assetPath(dish: IDish, base?: string): string
  readPreferences(): IPreferences
  suppressionReason(options?: unknown): string | null
  show(dish: IDish, options?: unknown): Element | null
  dismiss(): void
  init(options?: unknown): IDish | null
  reset(): void
}

/**
 * The site module is plain browser JS with no bundler. The unit environment
 * registers jsdom, so requiring the file exercises the same `window`,
 * `document` and `localStorage` the published page uses.
 */
const DimSum: IDimSumApi = require_(
  join(process.cwd(), 'docs', 'assets', 'site', 'docs-dim-sum.js')
)

const assetRoot = join(process.cwd(), 'docs', 'assets', 'site', 'dim-sum')

/** Every preference key this module reads or writes. */
const StorageKeys = [
  'dm-docs-dimsum',
  'dm-docs-lang',
  'dm-docs-fun-en',
  'dm-docs-fun-yue',
  'dm-docs-quiet',
]

/** Only this module's keys are touched, so no other test file is disturbed. */
function resetStore(values: Record<string, string> = {}): void {
  for (const key of StorageKeys) {
    window.localStorage.removeItem(key)
  }
  for (const key of Object.keys(values)) {
    window.localStorage.setItem(key, values[key])
  }
}

/** Runs `body` on a host with no Web Storage at all, then restores it. */
function withoutStorage(body: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', {
    value: undefined,
    configurable: true,
    writable: true,
  })
  try {
    body()
  } finally {
    if (descriptor === undefined) {
      delete (window as unknown as Record<string, unknown>)['localStorage']
    } else {
      Object.defineProperty(window, 'localStorage', descriptor)
    }
  }
}

function card(): Element | null {
  return document.querySelector('.dm-dimsum')
}

after(() => {
  DimSum.reset()
  resetStore()
})

describe('documentation-hub dim sum surprise', () => {
  it('states the 1% probability and its single storage key', () => {
    assert.equal(DimSum.probability, 0.01)
    assert.equal(DimSum.storageKey, 'dm-docs-dimsum')
    assert.equal(DimSum.assetDirectory, 'assets/site/dim-sum/')
  })

  it('shows only below the threshold and never at or above it', () => {
    resetStore()
    for (const value of [0, 1e-9, 0.0001, 0.005, 0.0099, 0.00999999]) {
      assert.equal(
        DimSum.shouldShow(value),
        true,
        `${value} is inside the 1% and must show`
      )
    }
    for (const value of [
      0.01, 0.010000001, 0.02, 0.1, 0.5, 0.9, 0.99, 0.999999, 1,
    ]) {
      assert.equal(
        DimSum.shouldShow(value),
        false,
        `${value} is outside the 1% and must not show`
      )
    }
    // A draw that is not a usable number is a miss, never a lucky accident.
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      -0.001,
      -1,
      undefined,
      null,
      '0.001',
      {},
      [],
      true,
    ]) {
      assert.equal(
        DimSum.shouldShow(value),
        false,
        `${String(value)} must not show`
      )
    }
  })

  it('is enabled by default, including with no storage at all', () => {
    resetStore()
    assert.equal(DimSum.isEnabled(), true)
    withoutStorage(() => {
      assert.equal(DimSum.isEnabled(), true)
      assert.equal(DimSum.shouldShow(0.001), true)
      // A write that cannot be stored must not throw either.
      DimSum.setEnabled(false)
      assert.equal(DimSum.isEnabled(), true)
    })
  })

  it('persists the off switch and honours it at every random value', () => {
    resetStore()
    DimSum.setEnabled(false)
    assert.equal(window.localStorage.getItem('dm-docs-dimsum'), 'off')
    assert.equal(DimSum.isEnabled(), false)

    for (let step = 0; step <= 1000; step++) {
      const value = step / 1000
      assert.equal(
        DimSum.shouldShow(value),
        false,
        `disabled must suppress ${value}`
      )
    }
    // Even the luckiest possible draw stays suppressed.
    assert.equal(DimSum.shouldShow(0), false)
    assert.equal(DimSum.shouldShow(0.001, false), false)

    DimSum.setEnabled(true)
    assert.equal(window.localStorage.getItem('dm-docs-dimsum'), 'on')
    assert.equal(DimSum.isEnabled(), true)
    assert.equal(DimSum.shouldShow(0.001), true)
  })

  it('selects a dish for every draw in 0..1 and can reach all of them', () => {
    const seen = new Set<string>()
    for (let step = 0; step <= 1000; step++) {
      const dish = DimSum.pick(step / 1000)
      assert.ok(
        DimSum.dishes.indexOf(dish) !== -1,
        `${step / 1000} selected something outside the dish table`
      )
      seen.add(dish.id)
    }
    // Both ends of the interval are in range, 1 included.
    assert.equal(DimSum.pick(0).id, DimSum.dishes[0].id)
    assert.equal(DimSum.pick(1).id, DimSum.dishes[DimSum.dishes.length - 1].id)
    assert.equal(seen.size, DimSum.dishes.length)
    // A malformed draw still yields a dish rather than throwing.
    assert.ok(DimSum.dishes.indexOf(DimSum.pick(NaN)) !== -1)
    assert.ok(DimSum.dishes.indexOf(DimSum.pick(undefined)) !== -1)
  })

  it('names every dish in both languages', () => {
    assert.ok(
      DimSum.dishes.length >= 6,
      `expected at least 6 dishes, found ${DimSum.dishes.length}`
    )
    const ids = new Set<string>()
    const files = new Set<string>()
    for (const dish of DimSum.dishes) {
      assert.ok(dish.en.trim().length > 0, `${dish.id} needs an English name`)
      assert.ok(dish.yue.trim().length > 0, `${dish.id} needs a Cantonese name`)
      // The Cantonese name must actually be Cantonese, not the English string
      // copied across to fill the field.
      assert.match(dish.yue, /[㐀-鿿]/, `${dish.id} yue must be Han`)
      assert.match(dish.en, /[A-Za-z]/, `${dish.id} en must be Latin`)
      assert.notEqual(dish.en, dish.yue)
      assert.ok(dish.rom.trim().length > 0, `${dish.id} needs a romanization`)
      assert.equal(ids.has(dish.id), false, `duplicate dish id ${dish.id}`)
      assert.equal(files.has(dish.file), false, `duplicate art ${dish.file}`)
      ids.add(dish.id)
      files.add(dish.file)
      assert.equal(DimSum.dishById(dish.id), dish)
    }
    assert.equal(DimSum.dishById('not-a-dish'), null)
  })

  it('ships every dish picture as a local file with no outside reference', () => {
    for (const dish of DimSum.dishes) {
      const path = join(assetRoot, dish.file)
      assert.ok(existsSync(path), `missing bundled art: ${path}`)
      const size = statSync(path).size
      assert.ok(size > 0, `${dish.file} is empty`)
      assert.ok(
        size < 8192,
        `${dish.file} is ${size} bytes, expected a small SVG`
      )

      const svg = readFileSync(path, 'utf8')
      assert.match(svg, /<svg[\s>]/, `${dish.file} must be an SVG`)
      // A reader who opens the file directly still gets the dish named.
      assert.ok(
        svg.indexOf(dish.yue) !== -1 && svg.indexOf(dish.en) !== -1,
        `${dish.file} title must name the dish in both languages`
      )
      // No network fetch, no CDN, no tracking pixel, no script. The XML
      // namespace declaration is an identifier, not a request, so it is
      // removed before the check rather than excused by it.
      const body = svg.replace(/xmlns(:[a-z]+)?="[^"]*"/g, '')
      assert.equal(/https?:\/\//.test(body), false, `${dish.file} reaches out`)
      assert.equal(/<script/i.test(svg), false, `${dish.file} has script`)
      assert.equal(/<image/i.test(svg), false, `${dish.file} embeds an image`)
      assert.equal(/url\(/i.test(svg), false, `${dish.file} has a url()`)
      assert.equal(/@font-face/i.test(svg), false, `${dish.file} loads a font`)

      // The path the page requests stays inside the bundled directory.
      assert.equal(DimSum.assetPath(dish), 'assets/site/dim-sum/' + dish.file)
      assert.equal(DimSum.assetPath(dish, 'docs/x/'), 'docs/x/' + dish.file)
    }
  })

  it('gives alt text that names the dish in both languages, in every mode', () => {
    for (const dish of DimSum.dishes) {
      for (const mode of ['en', 'yue', 'bi']) {
        const primary = mode === 'yue' ? 'yue' : 'en'
        const alt = DimSum.altText(dish, primary)
        assert.ok(
          alt.indexOf(dish.en) !== -1,
          `${mode} alt for ${dish.id} must name it in English: ${alt}`
        )
        assert.ok(
          alt.indexOf(dish.yue) !== -1,
          `${mode} alt for ${dish.id} must name it in Cantonese: ${alt}`
        )
        // Alt text describes the picture, so it says more than the bare name.
        assert.ok(alt.length > DimSum.displayName(dish, primary).length)
      }
    }
  })

  it('keeps both names in the visible name and only reorders them', () => {
    const dish = DimSum.dishes[0]
    const english = DimSum.displayName(dish, 'en')
    const cantonese = DimSum.displayName(dish, 'yue')
    assert.equal(english, dish.en + ' · ' + dish.yue)
    assert.equal(cantonese, dish.yue + ' · ' + dish.en)
    for (const name of [english, cantonese]) {
      assert.ok(name.indexOf(dish.en) !== -1)
      assert.ok(name.indexOf(dish.yue) !== -1)
    }
  })

  it('styles the surrounding copy by level while the facts hold', () => {
    for (let level = 1; level <= 5; level++) {
      const english = DimSum.copy('en', level)
      assert.ok(english.title.trim().length > 0, `en title ${level}`)
      assert.match(english.lead, /1 page load in 100/, `en lead ${level}`)
      assert.match(english.lead, /display settings/i, `en lead ${level}`)

      const cantonese = DimSum.copy('yue', level)
      assert.ok(cantonese.title.trim().length > 0, `yue title ${level}`)
      assert.match(cantonese.lead, /100/, `yue lead ${level}`)
      assert.match(cantonese.lead, /顯示設定/, `yue lead ${level}`)
    }
    // Voice moves with the level; level 1 and level 5 do not read alike.
    assert.notEqual(DimSum.copy('en', 1).lead, DimSum.copy('en', 5).lead)
    assert.notEqual(DimSum.copy('yue', 1).lead, DimSum.copy('yue', 5).lead)
    // An out-of-range level or unknown language falls back, never throws.
    assert.ok(DimSum.copy('en', 0).lead.length > 0)
    assert.ok(DimSum.copy('en', 99).lead.length > 0)
    assert.ok(DimSum.copy('klingon', 3).lead.length > 0)
  })

  it('composes bilingual mode with both leads and one correct name', () => {
    const dish = DimSum.dishById('har-gow') as IDish
    const bilingual = DimSum.compose(dish, { lang: 'bi', funEn: 5, funYue: 1 })
    assert.equal(bilingual.primaryLanguage, 'en')
    assert.equal(bilingual.secondaryLanguage, 'yue')
    assert.equal(bilingual.primary.lead, DimSum.copy('en', 5).lead)
    assert.equal(bilingual.secondary?.lead, DimSum.copy('yue', 1).lead)
    assert.equal(bilingual.name, dish.en + ' · ' + dish.yue)

    const cantonese = DimSum.compose(dish, { lang: 'yue', funEn: 3, funYue: 3 })
    assert.equal(cantonese.primaryLanguage, 'yue')
    assert.equal(cantonese.secondaryLanguage, null)
    assert.equal(cantonese.secondary, null)
    assert.equal(cantonese.name, dish.yue + ' · ' + dish.en)

    // The name's content is identical in every mode at every level: it is the
    // fact on the card, not part of the voice.
    for (const mode of ['en', 'yue', 'bi']) {
      const composed = DimSum.compose(dish, { lang: mode, funEn: 1, funYue: 5 })
      assert.ok(composed.name.indexOf(dish.en) !== -1)
      assert.ok(composed.name.indexOf(dish.yue) !== -1)
      assert.ok(composed.dismiss.trim().length > 0)
      assert.ok(composed.region.trim().length > 0)
    }
  })

  it('reads the hub language preferences without owning them', () => {
    resetStore({
      'dm-docs-lang': 'bi',
      'dm-docs-fun-en': '5',
      'dm-docs-fun-yue': '1',
    })
    assert.deepEqual(DimSum.readPreferences(), {
      lang: 'bi',
      funEn: 5,
      funYue: 1,
    })
    resetStore({ 'dm-docs-lang': 'nonsense', 'dm-docs-fun-en': 'x' })
    assert.deepEqual(DimSum.readPreferences(), {
      lang: 'en',
      funEn: 3,
      funYue: 3,
    })
    resetStore()
  })

  it('reports why it stays away: no document, error, first run, off, quiet', () => {
    resetStore()
    DimSum.reset()

    assert.equal(DimSum.suppressionReason({}), null)
    assert.equal(DimSum.suppressionReason({ document: null }), 'no-document')
    assert.equal(DimSum.suppressionReason({ errorState: true }), 'error')
    // A page that marked itself failed needs no caller to say so again.
    document.documentElement.setAttribute('data-docs-error', 'true')
    assert.equal(DimSum.suppressionReason({}), 'error')
    document.documentElement.removeAttribute('data-docs-error')
    assert.equal(DimSum.suppressionReason({ firstRun: true }), 'first-run')

    DimSum.setEnabled(false)
    assert.equal(DimSum.suppressionReason({}), 'disabled')
    DimSum.setEnabled(true)

    resetStore({ 'dm-docs-quiet': 'on' })
    assert.equal(DimSum.isQuiet(), true)
    assert.equal(DimSum.suppressionReason({}), 'quiet')
    resetStore()
    assert.equal(DimSum.isQuiet(), false)
    assert.equal(DimSum.suppressionReason({}), null)
  })

  it('never shows anything on a suppressed load', () => {
    resetStore()
    for (const options of [
      { errorState: true },
      { firstRun: true },
      { document: null },
    ]) {
      DimSum.reset()
      const merged = Object.assign({ random: () => 0 }, options)
      assert.equal(DimSum.init(merged), null)
      assert.equal(card(), null, JSON.stringify(options))
    }
    DimSum.reset()
    DimSum.setEnabled(false)
    assert.equal(DimSum.init({ random: () => 0 }), null)
    assert.equal(card(), null)
    resetStore()
    DimSum.reset()
  })

  it('draws exactly once per page load', () => {
    resetStore()
    DimSum.reset()
    // A miss still consumes this load's single draw.
    assert.equal(DimSum.init({ random: () => 0.5 }), null)
    assert.equal(card(), null)
    assert.equal(
      DimSum.init({ random: () => 0 }),
      null,
      'a second draw in one page load is not allowed'
    )
    assert.equal(card(), null)
    assert.equal(DimSum.suppressionReason({}), 'already-drawn')

    // A hit consumes it too, and mounts exactly one card.
    DimSum.reset()
    let calls = 0
    const dish = DimSum.init({ random: () => (calls++ === 0 ? 0.004 : 0) })
    assert.notEqual(dish, null)
    assert.equal(document.querySelectorAll('.dm-dimsum').length, 1)
    assert.equal(DimSum.init({ random: () => 0 }), null)
    assert.equal(document.querySelectorAll('.dm-dimsum').length, 1)

    // A hidden tab spends no surprise on a card nobody can see, and the draw
    // itself is kept rather than forfeited: the reader who comes back to the
    // tab still gets the dish this load was owed.
    DimSum.reset()
    const hidden = { visibilityState: 'hidden', body: null }
    assert.equal(DimSum.init({ random: () => 0, document: hidden }), null)
    assert.equal(card(), null)
    assert.equal(DimSum.suppressionReason({ document: hidden }), 'hidden')
    assert.notEqual(
      DimSum.suppressionReason({}),
      'already-drawn',
      'a hidden tab must not burn this load’s only draw'
    )
    calls = 0
    const kept = DimSum.init({ random: () => (calls++ === 0 ? 0.004 : 0.5) })
    assert.notEqual(kept, null, 'the kept draw must still be available')
    assert.equal(document.querySelectorAll('.dm-dimsum').length, 1)
    DimSum.reset()
  })

  it('mounts a polite, non-focusing card naming the dish it drew', () => {
    resetStore({ 'dm-docs-lang': 'bi', 'dm-docs-fun-en': '5' })
    DimSum.reset()
    const before = document.activeElement
    let calls = 0
    const dish = DimSum.init({
      random: () => (calls++ === 0 ? 0.004 : 0.5),
    }) as IDish
    assert.notEqual(dish, null)

    const node = card() as HTMLElement
    assert.notEqual(node, null)
    assert.equal(node.getAttribute('role'), 'status')
    assert.equal(node.getAttribute('aria-live'), 'polite')
    // Nothing autofocuses, nothing traps: focus stays where the reader left it.
    assert.equal(document.activeElement, before)
    assert.equal(node.querySelector('[autofocus]'), null)
    assert.equal(node.getAttribute('tabindex'), null)
    assert.equal(node.getAttribute('role') === 'dialog', false)

    const art = node.querySelector('img') as HTMLImageElement
    assert.equal(art.getAttribute('src'), 'assets/site/dim-sum/' + dish.file)
    const alt = art.getAttribute('alt') || ''
    assert.ok(alt.indexOf(dish.en) !== -1, `alt must name the dish: ${alt}`)
    assert.ok(alt.indexOf(dish.yue) !== -1, `alt must name the dish: ${alt}`)

    // The rendered name carries both languages, and bilingual mode renders a
    // second lead without a second name.
    const name = node.querySelector('.dm-dimsum__dish')?.textContent || ''
    assert.equal(name, dish.en + ' · ' + dish.yue)
    assert.equal(node.querySelectorAll('.dm-dimsum__lead').length, 2)
    assert.equal(
      node.querySelector('.dm-dimsum__lead')?.textContent,
      DimSum.copy('en', 5).lead
    )

    // The dismiss control is named and reachable, not an unlabelled glyph.
    const close = node.querySelector('.dm-dimsum__close') as HTMLButtonElement
    assert.equal(close.getAttribute('type'), 'button')
    assert.ok((close.getAttribute('aria-label') || '').length > 0)

    close.click()
    assert.equal(node.getAttribute('data-leaving'), 'true')

    DimSum.reset()
    assert.equal(card(), null)
    resetStore()
  })

  /**
   * A dish's name is always mixed-script, so each half must declare its own
   * language: without it an English synthesiser reads 蝦餃 as unknown glyphs and
   * a Cantonese one mangles the English half. WCAG 3.1.2.
   */
  it('marks the language of every part it renders, in every mode', () => {
    assert.equal(DimSum.htmlLangOf('en'), 'en')
    assert.equal(DimSum.htmlLangOf('yue'), 'zh-HK')

    for (const dish of DimSum.dishes) {
      for (const mode of ['en', 'yue']) {
        const parts = DimSum.nameParts(dish, mode)
        // The marked-up halves must rebuild the visible name exactly, so the
        // rendered string and the accessible one can never drift apart.
        assert.equal(
          parts.map(part => part.text).join(''),
          DimSum.displayName(dish, mode),
          `${dish.id}/${mode} parts must rebuild the name`
        )
        const marked = parts.filter(part => part.lang !== null)
        assert.equal(marked.length, 2, `${dish.id}/${mode} needs both halves`)
        const han = marked.filter(part => /[\u3400-\u9fff]/.test(part.text))
        assert.equal(han.length, 1)
        assert.equal(han[0].lang, 'zh-HK')
        const latin = marked.filter(part => !/[\u3400-\u9fff]/.test(part.text))
        assert.equal(latin[0].lang, 'en')
      }
    }

    for (const mode of ['en', 'yue', 'bi']) {
      resetStore({ 'dm-docs-lang': mode })
      DimSum.reset()
      const node = DimSum.show(DimSum.dishes[0]) as HTMLElement
      assert.notEqual(node, null)
      assert.equal(node.getAttribute('lang'), mode === 'yue' ? 'zh-HK' : 'en')

      // Every text-bearing leaf that contains Han script resolves to zh-HK,
      // and every Latin-only leaf resolves to en.
      const leaves = Array.from(node.querySelectorAll('p, span')).filter(
        n => n.children.length === 0 && (n.textContent || '').trim() !== ''
      )
      for (const leaf of leaves) {
        let ancestor: Element | null = leaf
        let lang: string | null = null
        while (ancestor !== null && lang === null) {
          lang = ancestor.getAttribute('lang')
          ancestor = ancestor.parentElement
        }
        const text = leaf.textContent || ''
        if (/[\u3400-\u9fff]/.test(text)) {
          assert.equal(lang, 'zh-HK', `Han text unmarked in ${mode}: ${text}`)
        } else if (/[A-Za-z]/.test(text)) {
          assert.equal(lang, 'en', `Latin text mismarked in ${mode}: ${text}`)
        }
      }

      // The visible name is still exactly the one language mode asked for.
      assert.equal(
        node.querySelector('.dm-dimsum__dish')?.textContent,
        DimSum.displayName(DimSum.dishes[0], mode === 'yue' ? 'yue' : 'en')
      )
      DimSum.reset()
    }
    resetStore()
  })

  /**
   * A keyboard reader who tabs into the card to read it must not be dumped at
   * the top of the document when the card leaves under their focus.
   */
  it('hands focus back to where the reader came from', async () => {
    // The leave animation removes the node a beat after `dismiss`, and focus
    // can only come home once the node it was in is actually gone.
    const settle = () => new Promise(resolve => setTimeout(resolve, 400))
    resetStore()
    const anchor = document.createElement('button')
    anchor.textContent = 'somewhere in the page'
    document.body.appendChild(anchor)
    try {
      anchor.focus()
      assert.equal(document.activeElement, anchor)

      DimSum.reset()
      const node = DimSum.show(DimSum.dishes[0]) as HTMLElement
      // Mounting alone never moves focus.
      assert.equal(document.activeElement, anchor)

      const close = node.querySelector('.dm-dimsum__close') as HTMLElement
      // jsdom does not synthesise focusin's relatedTarget, so the real tab is
      // modelled: focus moves, and the event names where it came from.
      close.focus()
      node.dispatchEvent(
        new window.FocusEvent('focusin', {
          bubbles: true,
          relatedTarget: anchor,
        })
      )
      assert.equal(document.activeElement, close)

      DimSum.dismiss()
      await settle()
      assert.equal(document.activeElement, anchor, 'focus must come home')
      assert.equal(card(), null)

      // A card the reader never touched leaves focus exactly where it was.
      DimSum.reset()
      anchor.focus()
      DimSum.show(DimSum.dishes[1])
      DimSum.dismiss()
      await settle()
      assert.equal(document.activeElement, anchor)
    } finally {
      DimSum.reset()
      anchor.remove()
      resetStore()
    }
  })

  /**
   * The card is `position: fixed`, so anything taller than the viewport cannot
   * be scrolled into reach — its title and its dismiss button would sit off the
   * top of a short window with nothing able to get to them. Measured at
   * 568x256 before the cap: the card's top edge was at -24 px.
   */
  it('caps its own height and width so a short or narrow window still fits', () => {
    const css = readFileSync(
      join(process.cwd(), 'docs', 'assets', 'site', 'docs-dim-sum.css'),
      'utf8'
    )
    assert.ok(/max-height:\s*calc\(100dvh/.test(css), 'needs a dvh height cap')
    assert.ok(
      /max-height:\s*calc\(100vh/.test(css),
      'needs a vh fallback for engines without dvh'
    )
    assert.ok(/overflow-y:\s*auto/.test(css), 'a capped card must scroll')
    assert.ok(
      /overscroll-behavior:\s*contain/.test(css),
      'scrolling the garnish must not scroll the page behind it'
    )
    assert.ok(/width:\s*min\(22rem,\s*calc\(100vw - 2rem\)\)/.test(css))
    // The 44 px target, both reduced-motion and forced-colors, and print.
    assert.ok(/min-width:\s*44px/.test(css) && /min-height:\s*44px/.test(css))
    assert.ok(/@media \(prefers-reduced-motion: reduce\)/.test(css))
    assert.ok(/@media \(forced-colors: active\)/.test(css))
  })
})
