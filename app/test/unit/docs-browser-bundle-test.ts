import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'

import {
  DocsBrowserArticles,
  DocsBrowserArticleSummaries,
  DocsBrowserCategories,
  DocsBrowserLinkOrigin,
} from '../../src/lib/docs-browser/docs-browser-catalog'
import { DocsBrowserArticleCount } from '../../src/lib/docs-browser/docs-browser-index'
import { DocsArticlePaletteCommands } from '../../src/lib/docs-browser/docs-browser-palette'

/**
 * The offline documentation browser's completeness guard.
 *
 * Bundling drops a file exactly as easily as it includes one, and the file it
 * drops is whichever was added most recently — the one nobody has looked for
 * yet. So this suite runs FROM the tree AT the bundle: it walks
 * `docs/features` on disk and fails naming any article the build does not
 * carry, rather than checking that the articles already bundled are
 * well-formed. A test shaped the second way passes cleanly on a bundle that
 * has lost half the documentation, because it never looked for what is
 * missing.
 *
 * It also checks the two generated modules against each other and against the
 * generator's own constants, because a bundle and an index that disagree is a
 * palette that opens the wrong page.
 */

const root = process.cwd()
const featuresDirectory = join(root, 'docs', 'features')

/** Every Markdown file under `docs/features`, depth first, as article ids. */
function articleFilesOnDisk(directory: string): ReadonlyArray<string> {
  const found = new Array<string>()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...articleFilesOnDisk(full))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full)
    }
  }
  return found
}

const filesOnDisk = articleFilesOnDisk(featuresDirectory)

const idsOnDisk = filesOnDisk
  .map(file =>
    relative(featuresDirectory, file).split(sep).join('/').replace(/\.md$/, '')
  )
  .sort((left, right) => left.localeCompare(right))

/** The first level-one heading of a file, which is the article's title. */
function headingOf(file: string): string | null {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^#\s+(\S.*)$/.exec(line)
    if (match !== null) {
      return match[1].trim()
    }
  }
  return null
}

describe('documentation bundle completeness', () => {
  it('carries every article that exists under docs/features', () => {
    const bundled = new Set(DocsBrowserArticles.map(article => article.id))
    const missing = idsOnDisk.filter(id => !bundled.has(id))

    assert.deepStrictEqual(
      missing,
      [],
      `these articles exist on disk but are not in the bundle — regenerate with ` +
        `\`yarn generate-docs-browser-bundle\`: ${missing.join(', ')}`
    )
  })

  it('carries no article that no longer exists on disk', () => {
    const onDisk = new Set(idsOnDisk)
    const stale = DocsBrowserArticles.map(article => article.id).filter(
      id => !onDisk.has(id)
    )

    assert.deepStrictEqual(
      stale,
      [],
      `these bundled articles have no file on disk: ${stale.join(', ')}`
    )
  })

  it('agrees with the tree on how many articles there are', () => {
    assert.strictEqual(DocsBrowserArticles.length, idsOnDisk.length)
    assert.strictEqual(DocsBrowserArticleCount, idsOnDisk.length)
    assert.strictEqual(DocsBrowserArticleSummaries.length, idsOnDisk.length)
  })

  it('uses each article file first heading as its title', () => {
    const titles = new Map(
      DocsBrowserArticles.map(article => [article.id, article.title])
    )

    for (const file of filesOnDisk) {
      const id = relative(featuresDirectory, file)
        .split(sep)
        .join('/')
        .replace(/\.md$/, '')
      const heading = headingOf(file)
      if (heading === null) {
        continue
      }
      assert.strictEqual(
        titles.get(id),
        heading,
        `${id} is titled "${titles.get(
          id
        )}" in the bundle but "${heading}" on disk`
      )
    }
  })

  it('points every article at a source path that exists', () => {
    for (const article of DocsBrowserArticles) {
      assert.strictEqual(
        article.sourcePath,
        `docs/features/${article.id}.md`,
        `${article.id} records an unexpected source path`
      )
      assert.doesNotThrow(
        () => readFileSync(join(root, article.sourcePath), 'utf8'),
        `${article.sourcePath} is recorded in the bundle but cannot be read`
      )
    }
  })

  it('keeps the index and the bundle in step', () => {
    assert.deepStrictEqual(
      DocsBrowserArticleSummaries.map(summary => summary.id),
      DocsBrowserArticles.map(article => article.id)
    )

    const summaries = new Map(
      DocsBrowserArticleSummaries.map(summary => [summary.id, summary])
    )
    for (const article of DocsBrowserArticles) {
      const summary = summaries.get(article.id)
      assert.ok(summary !== undefined, `${article.id} is missing an index row`)
      assert.strictEqual(summary.title, article.title)
      assert.strictEqual(summary.category, article.category)
      assert.strictEqual(summary.sourcePath, article.sourcePath)
      assert.strictEqual(summary.description, article.description)
    }
  })

  it('records every category directory, with a real count', () => {
    const counted = new Map<string, number>()
    for (const article of DocsBrowserArticles) {
      counted.set(article.category, (counted.get(article.category) ?? 0) + 1)
    }

    assert.deepStrictEqual(
      DocsBrowserCategories.map(category => category.name).sort(),
      [...counted.keys()].sort()
    )
    for (const category of DocsBrowserCategories) {
      assert.strictEqual(
        category.count,
        counted.get(category.name),
        `${category.name} claims ${category.count} articles`
      )
    }
  })

  it('offers one command-palette row per article, opening that article', () => {
    assert.strictEqual(
      DocsArticlePaletteCommands.length,
      DocsBrowserArticles.length
    )

    const rows = new Map(
      DocsArticlePaletteCommands.map(command => [command.event, command])
    )
    for (const article of DocsBrowserArticles) {
      const row = rows.get(`palette:docs-article:${article.id}`)
      assert.ok(row !== undefined, `${article.id} has no palette row`)
      assert.strictEqual(row.title, article.title)
      assert.strictEqual(row.group, 'Documentation')
    }
  })
})

describe('documentation bundle offline safety', () => {
  it('bundles no image, so no article can reach the network to render', () => {
    for (const article of DocsBrowserArticles) {
      assert.ok(
        !/!\[[^\]]*\]\(/.test(article.markdown),
        `${article.id} still carries image markup; the bundler must replace it`
      )
    }
  })

  it('mentions a remote host only as inert text, never as a link target', () => {
    for (const article of DocsBrowserArticles) {
      const targets = [...article.markdown.matchAll(/\]\(([^)\s]+)/g)].map(
        match => match[1]
      )
      for (const target of targets) {
        assert.ok(
          /^[a-z][a-z0-9+.-]*:/i.test(target),
          `${article.id} has the relative link target ${target}; every link is ` +
            `rewritten absolute at build time so a click can be reported`
        )
      }
    }
  })

  it('rewrites in-repository links onto the reserved bundle origin', () => {
    const internal = DocsBrowserArticles.flatMap(article =>
      [...article.markdown.matchAll(/\]\(([^)\s]+)/g)].map(match => match[1])
    ).filter(target => target.startsWith(DocsBrowserLinkOrigin))

    assert.ok(
      internal.length > 100,
      `only ${internal.length} rewritten links found; the documentation tree ` +
        `cross-references far more than that, so the rewrite has regressed`
    )
    // `.invalid` is reserved by RFC 2606 and can never resolve, so a link that
    // somehow escaped interception fails closed rather than reaching a server.
    assert.match(DocsBrowserLinkOrigin, /^https:\/\/[a-z0-9.-]+\.invalid$/)
  })

  it('shares one link origin between the generator and the app', () => {
    // Read rather than import: the generator is an untyped `.mjs` module, and
    // importing it into a typed test only to compare one string would pull an
    // `any` into the suite. The constant is declared once in each file and
    // must be the same string in both, or the build would rewrite links onto
    // an origin the app does not recognise and every one of them would report
    // as external.
    const source = readFileSync(
      join(root, 'script', 'generate-docs-browser-bundle.mjs'),
      'utf8'
    )
    const declared = /export const DocsBrowserLinkOrigin = '([^']+)'/.exec(
      source
    )
    assert.ok(declared !== null, 'the generator declares no link origin')
    assert.strictEqual(declared[1], DocsBrowserLinkOrigin)
  })
})

describe('documentation bundle rendering readiness', () => {
  it('drops the level-one heading the browser renders itself', () => {
    for (const article of DocsBrowserArticles) {
      assert.ok(
        !/^#\s+\S/m.test(article.markdown.split('\n')[0] ?? ''),
        `${article.id} opens with its own heading, which the browser already shows`
      )
    }
  })

  it('unwraps hard-wrapped prose so the shared renderer does not break it', () => {
    // The shared renderer runs marked with `breaks: true`, so every source
    // line ending becomes a <br>. The documentation is authored at 80 columns,
    // so leaving it wrapped would render every paragraph ragged.
    //
    // Fenced blocks are removed before the paragraphs are counted: a fence
    // may itself contain a blank line, so splitting the raw body on blank
    // lines cuts one in half and reads its contents as prose.
    const withoutFences = (markdown: string) => {
      const kept = new Array<string>()
      let inFence = false
      for (const line of markdown.split('\n')) {
        if (/^\s{0,3}(?:```|~~~)/.test(line)) {
          inFence = !inFence
          continue
        }
        kept.push(inFence ? '' : line)
      }
      return kept.join('\n')
    }

    const wrapped = DocsBrowserArticles.filter(article =>
      withoutFences(article.markdown)
        .split(/\n{2,}/)
        .some(
          block =>
            !block.startsWith('|') &&
            // A prose line: ordinary text, inline code, a link, inline HTML,
            // or bold. A `*` beginning a list item is deliberately excluded —
            // consecutive list items are separate blocks and belong on
            // separate lines.
            block.split('\n').filter(line => /^(?:[A-Za-z`[<]|\*\*)/.test(line))
              .length > 1
        )
    )

    assert.deepStrictEqual(
      wrapped.map(article => article.id),
      [],
      'these articles still contain multi-line prose paragraphs'
    )
  })

  it('preserves fenced code and tables rather than folding them into prose', () => {
    const withFence = DocsBrowserArticles.filter(article =>
      article.markdown.includes('```')
    )
    assert.ok(withFence.length > 0, 'no fenced block survived the bundler')
    for (const article of withFence) {
      const fences = (article.markdown.match(/^\s{0,3}```/gm) ?? []).length
      assert.strictEqual(
        fences % 2,
        0,
        `${article.id} has an odd number of code fences after bundling`
      )
    }

    const withTable = DocsBrowserArticles.filter(article =>
      /^\|/m.test(article.markdown)
    )
    assert.ok(withTable.length > 0, 'no table survived the bundler')
  })
})
