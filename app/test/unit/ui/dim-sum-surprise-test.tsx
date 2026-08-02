import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../helpers/ui/setup'
import { describe, it } from 'node:test'
import assert from 'node:assert'

import { DimSumSurprise } from '../../../src/ui/dim-sum/dim-sum-surprise'
import { getDimSumDishes } from '../../../src/lib/dim-sum-assets'
import { IDimSumDish } from '../../../src/models/dim-sum'
import { LanguageMode } from '../../../src/models/language-mode'

const dish: IDimSumDish = getDimSumDishes()[0]

function render(languageMode: LanguageMode, english = 3, cantonese = 3) {
  return renderToStaticMarkup(
    <DimSumSurprise
      dish={dish}
      languageMode={languageMode}
      funnyLevels={{ english, cantonese }}
      onDismissed={() => {}}
    />
  )
}

describe('the dim sum surprise card', () => {
  it('announces itself politely and never takes the top layer', () => {
    const markup = render('english')
    assert.match(markup, /role="status"/)
    assert.match(markup, /aria-live="polite"/)
    assert.doesNotMatch(markup, /role="dialog"/)
    assert.doesNotMatch(markup, /autofocus/i)

    // The card itself is not in the tab order. (The dismiss button is, and the
    // decorative close glyph carries its own tabindex="-1", so this looks at
    // the card's own opening tag rather than the whole subtree.)
    const openingTag = markup.slice(0, markup.indexOf('>') + 1)
    assert.match(openingTag, /^<aside /)
    assert.doesNotMatch(openingTag, /tabindex/i)
  })

  it('names the dish in both languages, whatever mode is set', () => {
    for (const mode of ['english', 'cantonese', 'bilingual'] as const) {
      const markup = render(mode)
      assert.ok(markup.includes(dish.name.en), `${mode} needs the English name`)
      assert.ok(
        markup.includes(dish.name.zhHant),
        `${mode} needs the Chinese name`
      )
      // Each half declares its own language so a synthesiser switches voice.
      assert.match(markup, /lang="zh-HK"/)
      assert.match(markup, /lang="en"/)
    }
  })

  it('shows the dish name at every playfulness level', () => {
    for (let level = 1; level <= 5; level++) {
      const markup = render('bilingual', level, level)
      assert.ok(markup.includes(dish.name.en), `level ${level} English name`)
      assert.ok(markup.includes(dish.name.zhHant), `level ${level} 中文名`)
    }
    // The voice does move, even though the name does not.
    assert.notEqual(render('english', 1), render('english', 5))
  })

  it('gives the picture alt text that names the dish', () => {
    const markup = render('english')
    const alt = /alt="([^"]*)"/.exec(markup)
    assert.notEqual(alt, null, 'the picture must carry alt text')
    assert.ok((alt as RegExpExecArray)[1].includes(dish.name.en))
    assert.ok((alt as RegExpExecArray)[1].includes(dish.name.zhHant))
  })

  it('loads its picture from disk and reaches no network', () => {
    const markup = render('english')
    // A file:// URL inside the bundled directory. The directory this resolves
    // against is the app root at runtime; here it is the test's own module
    // directory, so only the bundled tail is asserted.
    assert.match(markup, /src="file:\/\/\//)
    assert.ok(
      markup.includes(`static/dim-sum/${dish.file}"`),
      'the picture must come from the bundled dim-sum directory'
    )
    assert.doesNotMatch(markup, /src="https?:/)
    assert.doesNotMatch(markup, /srcset=/)
  })

  it('labels its dismiss control rather than shipping a bare glyph', () => {
    const markup = render('cantonese')
    const label = /class="dim-sum-surprise-dismiss" aria-label="([^"]+)"/.exec(
      markup
    )
    assert.notEqual(label, null, 'the dismiss button needs an accessible name')
    assert.ok((label as RegExpExecArray)[1].trim().length > 0)
  })
})
