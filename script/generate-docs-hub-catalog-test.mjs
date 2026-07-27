import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  DefaultIndexPath,
  DefaultOutputPath,
  buildCatalogModule,
  buildIndexDocument,
  collectCatalog,
  describeDocument,
  escapeHtml,
  fallbackLabel,
  findHeadingIndex,
  groupFeatureCategories,
  groupReferenceSections,
  renderedHref,
  replaceManagedBlock,
  sectionOf,
  titleFor,
} from './generate-docs-hub-catalog.mjs'

const RegenerationCommand = 'yarn generate-docs-hub-catalog'

function linesOf(text) {
  return text.split('\n')
}

/** Git may check the generated file out with either line ending. */
function normalize(text) {
  return text.replace(/\r\n/g, '\n')
}

describe('documentation hub catalog projection', () => {
  it('takes the title from the first level-one heading', () => {
    const lines = linesOf('# Installing Desktop Material\n\nWindows only.')
    assert.equal(
      titleFor(lines, 'installation.md'),
      'Installing Desktop Material'
    )
  })

  it('strips inline markup out of a heading', () => {
    const lines = linesOf(
      '# The `regex` **builder** and [guide](regex-guide.md)'
    )
    assert.equal(titleFor(lines, 'x.md'), 'The regex builder and guide')
  })

  it('derives a title from the file name when there is no heading', () => {
    const lines = linesOf('Just a paragraph.')
    assert.equal(titleFor(lines, 'wiki/user-guide.md'), 'User Guide')
    assert.equal(findHeadingIndex(lines), -1)
  })

  it('describes a page with its first paragraph', () => {
    const lines = linesOf(
      '# Title\n\nFirst paragraph line\ncontinues here.\n\nSecond paragraph.'
    )
    assert.equal(
      describeDocument(lines, findHeadingIndex(lines)),
      'First paragraph line continues here.'
    )
  })

  it('falls back to the first list item when a list follows the heading', () => {
    const lines = linesOf('# Title\n\n- First item\n- Second item')
    assert.equal(describeDocument(lines, findHeadingIndex(lines)), 'First item')
  })

  it('skips fenced code, quotes, tables, raw HTML and images', () => {
    const lines = linesOf(
      [
        '# Title',
        '',
        '> A quote',
        '',
        '```powershell',
        '',
        '| a | b |',
        '',
        '<img src="x.png" />',
        '',
        '![shot](y.png)',
        '',
        'The real summary.',
      ].join('\n')
    )
    assert.equal(
      describeDocument(lines, findHeadingIndex(lines)),
      'The real summary.'
    )
  })

  it('returns an empty description when there is no prose', () => {
    const lines = linesOf('# Title\n\n> Only a quote')
    assert.equal(describeDocument(lines, findHeadingIndex(lines)), '')
  })

  it('cuts a long description on a word boundary', () => {
    const sentence = `${'alpha bravo charlie delta echo '.repeat(12)}end`
    const lines = linesOf(`# Title\n\n${sentence}`)
    const description = describeDocument(lines, findHeadingIndex(lines))
    assert.ok(description.length <= 178, description.length)
    assert.ok(description.endsWith('…'))
    assert.ok(!description.includes('  '))
    // The cut lands between words, never mid-word.
    assert.ok(/[a-z]…$/.test(description))
  })

  it('maps a source path to the URL the Pages build publishes', () => {
    assert.equal(renderedHref('installation.md'), 'installation.html')
    assert.equal(renderedHref('regex-guide.md'), 'regex-guide.html')
    assert.equal(renderedHref('features/README.md'), 'features/')
    assert.equal(
      renderedHref('features/agent-api/README.md'),
      'features/agent-api/'
    )
    // docs/README.md keeps a page of its own; docs/index.html is the hub.
    assert.equal(renderedHref('README.md'), 'README.html')
    assert.equal(
      renderedHref('features/agent-api/local-agent-http-api.md'),
      'features/agent-api/local-agent-http-api.html'
    )
  })

  it('groups a page by its top-level documentation folder', () => {
    assert.equal(sectionOf('installation.md'), 'root')
    assert.equal(sectionOf('features/agent-api/README.md'), 'features')
    assert.equal(sectionOf('verification/README.md'), 'verification')
  })
})

describe('committed documentation hub catalog', () => {
  it('covers every Markdown page in the tree exactly once', () => {
    const entries = collectCatalog()
    const sources = entries.map(entry => entry.s)
    assert.equal(
      new Set(sources).size,
      sources.length,
      'catalog contains a duplicate source path'
    )
    assert.ok(entries.length > 0, 'catalog is empty')
    for (const entry of entries) {
      assert.ok(entry.t !== '', `empty title for ${entry.s}`)
      assert.ok(entry.h !== '', `empty href for ${entry.s}`)
      assert.ok(
        !entry.h.endsWith('.md'),
        `${entry.s} links at Markdown rather than the rendered page`
      )
    }
  })

  it('is current with the documentation tree', async () => {
    const { entries, source } = await buildCatalogModule()
    const committed = normalize(readFileSync(DefaultOutputPath, 'utf8'))
    const expected = normalize(source)

    if (committed !== expected) {
      // Name what actually drifted before falling back to the whole file, so a
      // failure says which page was added, renamed, retitled or reworded.
      const committedEntries = loadCommittedEntries(committed)
      const bySource = new Map(committedEntries.map(entry => [entry.s, entry]))
      const differences = []
      for (const entry of entries) {
        const previous = bySource.get(entry.s)
        if (previous === undefined) {
          differences.push(`missing from the catalog: ${entry.s}`)
          continue
        }
        bySource.delete(entry.s)
        for (const key of ['t', 'h', 'c', 'd']) {
          if (previous[key] !== entry[key]) {
            differences.push(
              `${entry.s} field "${key}": committed ${JSON.stringify(
                previous[key]
              )}, tree has ${JSON.stringify(entry[key])}`
            )
          }
        }
      }
      for (const stale of bySource.keys()) {
        differences.push(`no longer in the tree: ${stale}`)
      }
      if (differences.length === 0) {
        differences.push(
          'the entries match but the generated file text differs (header, formatting or ordering)'
        )
      }

      assert.fail(
        `${DefaultOutputPath} is stale. Run \`${RegenerationCommand}\` and commit the result.\n` +
          differences.slice(0, 20).join('\n') +
          (differences.length > 20
            ? `\n…and ${differences.length - 20} more`
            : '')
      )
    }

    assert.equal(committed, expected)
  })
})

describe('documentation hub page inventory', () => {
  it('groups feature pages by category and keeps the category index apart', () => {
    const groups = groupFeatureCategories([
      { s: 'features/README.md', c: 'features' },
      { s: 'features/design-system/README.md', c: 'features' },
      { s: 'features/design-system/audio-system.md', c: 'features' },
      { s: 'features/agent-api/local-agent-http-api.md', c: 'features' },
      { s: 'installation.md', c: 'root' },
    ])

    assert.deepEqual(
      groups.map(group => group.name),
      ['agent-api', 'design-system']
    )
    const design = groups[1]
    assert.equal(design.index.s, 'features/design-system/README.md')
    assert.deepEqual(
      design.pages.map(page => page.s),
      ['features/design-system/audio-system.md']
    )
  })

  it('groups every non-feature page by its documentation folder', () => {
    const groups = groupReferenceSections([
      { s: 'installation.md', c: 'root' },
      { s: 'README.md', c: 'root' },
      { s: 'technical/README.md', c: 'technical' },
      { s: 'technical/oauth.md', c: 'technical' },
      { s: 'features/design-system/audio-system.md', c: 'features' },
    ])

    assert.deepEqual(
      groups.map(group => group.name),
      ['root', 'technical']
    )
    // docs/README.md is a page in its own right, not a folder index.
    assert.equal(groups[0].index, null)
    assert.equal(groups[0].pages.length, 2)
    assert.equal(groups[1].index.s, 'technical/README.md')
  })

  it('escapes page text and titles a folder the label map does not know', () => {
    assert.equal(
      escapeHtml('<b>"a" & b</b>'),
      '&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;'
    )
    assert.equal(fallbackLabel('brand-new-folder'), 'Brand New Folder')
  })

  it('refuses to write a page that lost a managed block', () => {
    assert.throws(
      () => replaceManagedBlock('<main></main>', 'features-tabs', ''),
      /features-tabs managed block is missing/
    )
    assert.equal(
      replaceManagedBlock(
        '<x><!-- docs-hub:features-tabs:start --><!-- docs-hub:features-tabs:end --></x>',
        'features-tabs',
        '<a></a>'
      ),
      '<x><!-- docs-hub:features-tabs:start -->\n<a></a>\n<!-- docs-hub:features-tabs:end --></x>'
    )
  })

  it('lists every feature document on the hub page', () => {
    const html = normalize(readFileSync(DefaultIndexPath, 'utf8'))
    const missing = []
    for (const entry of collectCatalog()) {
      if (entry.c !== 'features' || entry.s.split('/').length < 3) {
        continue
      }
      if (entry.s.endsWith('/README.md')) {
        continue
      }
      if (!html.includes(`href="${escapeHtml(entry.h)}"`)) {
        missing.push(entry.s)
      }
    }
    assert.deepEqual(missing, [], 'feature pages missing from the hub page')
  })

  it('is current with the documentation tree', async () => {
    const { source } = await buildIndexDocument()
    const committed = normalize(readFileSync(DefaultIndexPath, 'utf8'))

    assert.equal(
      committed,
      normalize(source),
      `${DefaultIndexPath} is stale. Run \`${RegenerationCommand}\` and commit the result.`
    )
  })
})

/** Evaluates the generated module without a DOM to read back its records. */
function loadCommittedEntries(source) {
  const scope = {}
  new Function('window', source)(scope)
  return scope.DesktopMaterialDocsCatalog ?? []
}
