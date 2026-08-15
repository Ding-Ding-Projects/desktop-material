import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DocsBrowserArticles,
  DocsBrowserLinkOrigin,
  docsArticlePaletteEvent,
  docsBrowserExportFileName,
  docsBrowserPlainText,
  exportDocsArticles,
  getDocsArticle,
  getDocsArticleBySourcePath,
  getFirstDocsArticle,
  parseDocsArticlePaletteEvent,
  resolveDocsBrowserLink,
  searchDocsArticles,
} from '../../src/lib/docs-browser/docs-browser-catalog'
import { IDocsBrowserArticle } from '../../src/lib/docs-browser/docs-browser-types'

/**
 * Behaviour of the offline documentation browser's pure core: searching,
 * link resolution, export and the palette's article events.
 *
 * These run against the real bundle rather than a fixture, because a fixture
 * would prove the functions work on documentation that does not exist.
 */

const article = (id: string): IDocsBrowserArticle => {
  const found = getDocsArticle(id)
  assert.ok(found !== null, `${id} is not in the bundle`)
  return found
}

const sample = article('design-system/audio-system')

describe('documentation search', () => {
  it('returns every article for an empty or whitespace query', () => {
    assert.strictEqual(
      searchDocsArticles(DocsBrowserArticles, '', false).matches.length,
      DocsBrowserArticles.length
    )
    assert.strictEqual(
      searchDocsArticles(DocsBrowserArticles, '   ', false).matches.length,
      DocsBrowserArticles.length
    )
  })

  it('matches a title case-insensitively', () => {
    const { matches } = searchDocsArticles(
      DocsBrowserArticles,
      'AUDIO SYSTEM',
      false
    )
    const ids = matches.map(match => match.article.id)
    assert.ok(ids.includes('design-system/audio-system'))
    assert.ok(
      matches.find(match => match.article.id === 'design-system/audio-system')!
        .titleMatches > 0
    )
  })

  it('matches body text no title mentions, and says where it matched', () => {
    // A phrase that appears in the audio article body but not in its title.
    const { matches } = searchDocsArticles([sample], 'quiet hours', false)
    assert.strictEqual(matches.length, 1)
    assert.strictEqual(matches[0].titleMatches, 0)
    assert.ok(matches[0].bodyMatches > 0)
    assert.ok(
      matches[0].snippet.toLowerCase().includes('quiet hours'),
      `snippet did not carry the match: ${matches[0].snippet}`
    )
  })

  it('finds nothing for a phrase the documentation does not contain', () => {
    const { matches, error } = searchDocsArticles(
      DocsBrowserArticles,
      'zzqqxx-not-a-real-phrase',
      false
    )
    assert.deepStrictEqual(matches, [])
    assert.strictEqual(error, null)
  })

  it('reads a regular expression only when regex mode is on', () => {
    const literal = searchDocsArticles(
      DocsBrowserArticles,
      'narrat(or|ion)',
      false
    )
    assert.deepStrictEqual(literal.matches, [])

    const pattern = searchDocsArticles(
      DocsBrowserArticles,
      'narrat(or|ion)',
      true
    )
    assert.ok(pattern.matches.length > 0)
    assert.strictEqual(pattern.error, null)
  })

  it('honours case sensitivity in both modes', () => {
    assert.strictEqual(
      searchDocsArticles([sample], 'AUDIO SYSTEM', false, true).matches.length,
      0
    )
    assert.strictEqual(
      searchDocsArticles([sample], 'Audio system', false, true).matches.length,
      1
    )
    assert.strictEqual(
      searchDocsArticles([sample], 'AUDIO', true, true).matches.length,
      0
    )
  })

  it('reports an unreadable pattern instead of pretending nothing matched', () => {
    const { matches, error } = searchDocsArticles(
      DocsBrowserArticles,
      '(unclosed',
      true
    )
    assert.deepStrictEqual(matches, [])
    assert.ok(
      error !== null && error.length > 0,
      'an invalid pattern must report why'
    )
  })

  it('strips markup from the text it searches', () => {
    const text = docsBrowserPlainText(sample)
    assert.ok(!text.includes('**'), 'bold markers survived')
    assert.ok(
      !text.includes(DocsBrowserLinkOrigin),
      'link targets are searchable text'
    )
  })
})

describe('documentation link resolution', () => {
  it('resolves an in-bundle link to the article it names', () => {
    const target = resolveDocsBrowserLink(
      `${DocsBrowserLinkOrigin}/docs/features/design-system/audio-system.md`
    )
    assert.strictEqual(target.kind, 'article')
    assert.strictEqual(
      target.kind === 'article' ? target.article.id : null,
      'design-system/audio-system'
    )
    assert.strictEqual(target.kind === 'article' ? target.fragment : '', null)
  })

  it('carries a section fragment through', () => {
    const target = resolveDocsBrowserLink(
      `${DocsBrowserLinkOrigin}/docs/features/design-system/audio-system.md#event-routing`
    )
    assert.strictEqual(
      target.kind === 'article' ? target.fragment : null,
      'event-routing'
    )
  })

  it('reports a repository path that is not a bundled article', () => {
    const target = resolveDocsBrowserLink(
      `${DocsBrowserLinkOrigin}/docs/verification/some-run/run-manifest.md`
    )
    assert.strictEqual(target.kind, 'unbundled')
    assert.strictEqual(
      target.kind === 'unbundled' ? target.path : null,
      'docs/verification/some-run/run-manifest.md'
    )
  })

  it('treats an ordinary web link as external', () => {
    const target = resolveDocsBrowserLink('https://example.com/thing')
    assert.strictEqual(target.kind, 'external')
  })

  it('reports a value that is not a URL at all', () => {
    assert.strictEqual(resolveDocsBrowserLink('not a url').kind, 'unreadable')
  })

  it('never resolves a look-alike host to a bundled article', () => {
    // `docs.desktop-material.invalid.example.com` is a different origin and
    // must not be read as the bundle's own.
    const target = resolveDocsBrowserLink(
      'https://docs.desktop-material.invalid.example.com/docs/features/design-system/audio-system.md'
    )
    assert.strictEqual(target.kind, 'external')
  })

  it('finds an article by its repository-relative source path', () => {
    assert.strictEqual(
      getDocsArticleBySourcePath('docs/features/design-system/audio-system.md')
        ?.id,
      'design-system/audio-system'
    )
    assert.strictEqual(getDocsArticleBySourcePath('docs/nope.md'), null)
  })

  it('opens on the first article when none is named', () => {
    assert.strictEqual(getFirstDocsArticle()?.id, DocsBrowserArticles[0].id)
    assert.strictEqual(getDocsArticle('no/such-article'), null)
  })
})

describe('documentation export', () => {
  const two = [sample, article('design-system/school-mode')]

  it('writes Markdown that keeps the title, source and body', () => {
    const contents = exportDocsArticles([sample], 'markdown')
    assert.ok(contents.includes(`# ${sample.title}`))
    assert.ok(contents.includes(sample.sourcePath))
    assert.ok(contents.includes(sample.markdown))
  })

  it('writes plain text that says its markup was removed', () => {
    const contents = exportDocsArticles([sample], 'text')
    assert.ok(contents.includes(sample.title))
    assert.ok(contents.includes(sample.sourcePath))
    assert.ok(
      contents.includes('Markup removed'),
      'a lossy export has to say it is lossy'
    )
  })

  it('writes JSON carrying every field, re-readable as data', () => {
    const parsed = JSON.parse(exportDocsArticles(two, 'json')) as ReadonlyArray<
      Record<string, string>
    >
    assert.strictEqual(parsed.length, two.length)
    for (const [index, entry] of parsed.entries()) {
      assert.strictEqual(entry.id, two[index].id)
      assert.strictEqual(entry.title, two[index].title)
      assert.strictEqual(entry.category, two[index].category)
      assert.strictEqual(entry.sourcePath, two[index].sourcePath)
      assert.strictEqual(entry.markdown, two[index].markdown)
      assert.strictEqual(entry.description, two[index].description)
    }
  })

  it('names a single-article file after the article, not the count', () => {
    assert.strictEqual(
      docsBrowserExportFileName([sample], 'markdown'),
      'design-system-audio-system.md'
    )
    assert.strictEqual(
      docsBrowserExportFileName([sample], 'json'),
      'design-system-audio-system.json'
    )
  })

  it('names a multi-article file by how many it holds', () => {
    assert.strictEqual(
      docsBrowserExportFileName(two, 'text'),
      'desktop-material-documentation-2-articles.txt'
    )
  })
})

describe('documentation palette events', () => {
  it('round-trips an article id', () => {
    const event = docsArticlePaletteEvent('review-and-diff/split-diff')
    assert.strictEqual(
      parseDocsArticlePaletteEvent(event),
      'review-and-diff/split-diff'
    )
  })

  it('ignores an event that is not a documentation row', () => {
    assert.strictEqual(parseDocsArticlePaletteEvent('show-changelog'), null)
    assert.strictEqual(
      parseDocsArticlePaletteEvent('palette:toggle-theme'),
      null
    )
    assert.strictEqual(
      parseDocsArticlePaletteEvent('palette:docs-article:'),
      null
    )
  })
})
