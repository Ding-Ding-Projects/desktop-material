import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const { htmlToText, titleOf } = require('../site/build-search-index.js')

describe('documentation search-index HTML projection', () => {
  it('extracts visible main text with a real HTML parser', () => {
    const html = [
      '<main>',
      '<p title="1 > 0">Safe &amp; sound.</p>',
      '<script>not searchable</script>',
      '<style>.not-searchable { display: block }</style>',
      '<template>not searchable either</template>',
      '<p>After.</p>',
      '</main>',
      '<p>Outside main.</p>',
    ].join('')

    assert.equal(htmlToText(html), 'Safe & sound. After.')
  })

  it('decodes each entity layer exactly once', () => {
    assert.equal(
      htmlToText(
        '<main>&lt;tag&gt; &amp;lt;encoded&amp;gt; &quot;quoted&quot; &#39;single&#39;</main>'
      ),
      '<tag> &lt;encoded&gt; "quoted" \'single\''
    )
  })

  it('projects nested, entity-encoded heading text into the title', () => {
    assert.equal(
      titleOf(
        '<h1 data-comparison="1 > 0">Security <em>&amp;</em> docs</h1>',
        'fallback.html'
      ),
      'Security & docs'
    )
  })

  it('decodes and trims the document-title fallback', () => {
    assert.equal(
      titleOf(
        '<title>Fallback &amp; docs · Desktop Material Docs</title>',
        'fallback.html'
      ),
      'Fallback & docs'
    )
  })
})
