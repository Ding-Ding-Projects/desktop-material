/**
 * The GitHub Pages Mermaid pre-render step.
 *
 * These tests drive the real `site/render-mermaid.mjs` against the shape
 * pandoc actually emits for a ```mermaid fence, and against the real fences
 * committed under `docs/`. The renderer itself is stubbed so the suite stays
 * deterministic and browser-free on CI; the end-to-end test that launches a
 * real headless Chromium runs only when a Mermaid toolchain is pointed at by
 * `DESKTOP_MERMAID_TOOLCHAIN`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  InertColorLiterals,
  MinimumDiagramScale,
  Palette,
  ThemeVariableMap,
  accessibleNameFor,
  auditColorLiterals,
  decodeHtmlEntities,
  decorateSvg,
  figureFor,
  findMermaidBlocks,
  loadToolchain,
  mermaidConfig,
  renderDocument,
  sentinelFor,
  substituteThemeSentinels,
  svgIdFor,
  themeStyleSheet,
  uniqueName,
  withMinimumWidth,
} from '../site/render-mermaid.mjs'

const ProjectRoot = join(import.meta.dirname, '..')
const PagesWorkflow = readFileSync(
  join(ProjectRoot, '.github', 'workflows', 'pages.yml'),
  'utf8'
)
const DocsTemplate = readFileSync(
  join(ProjectRoot, 'site', 'docs-template.html'),
  'utf8'
)

/** The page background the published documentation paints behind a diagram. */
const PageBackground = { light: '#faf9fd', dark: '#141218' }

function relativeLuminance(hex) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4]
    .map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map(channel =>
      channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4)
    )
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(left, right) {
  const first = relativeLuminance(left)
  const second = relativeLuminance(right)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

function color(property, scheme) {
  return Palette[property][scheme]
}

/**
 * Every absolute asset reference on a page. Navigation links to github.com are
 * deliberately not assets: the site's contract is that a browser never fetches
 * anything from a third-party host to render a page.
 */
function externalAssetReferences(html) {
  const patterns = [
    /(?:\bsrc|\bxlink:href|\bposter|\bdata)\s*=\s*["'](?:https?:)?\/\/[^"']*/gi,
    /<link\b[^>]*\bhref\s*=\s*["'](?:https?:)?\/\/[^"']*/gi,
    /url\(\s*["']?(?:https?:)?\/\/[^)]*\)/gi,
    /@import\s+(?:url\()?\s*["'](?:https?:)?\/\//gi,
  ]
  return patterns.flatMap(pattern => [...html.matchAll(pattern)].map(m => m[0]))
}

/** Renders a fence the way pandoc's gfm reader does. */
function pandocFence(source, language = 'mermaid') {
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<pre class="${language}"><code>${escaped}</code></pre>`
}

/**
 * A Mermaid-shaped SVG: the same element order, the same `<style>`-carries-
 * every-colour structure, and the same sentinel substitution surface as the
 * real renderer produces, so the document-level tests exercise real code
 * without a browser.
 */
function stubSvg(definition, { svgId }) {
  const sentinelOf = name =>
    sentinelFor(ThemeVariableMap.findIndex(([variable]) => variable === name))
  return (
    `<svg id="${svgId}" width="100%" xmlns="http://www.w3.org/2000/svg" ` +
    `class="flowchart" style="max-width: 420px;" viewBox="0 0 420 200" ` +
    `role="graphics-document document" aria-roledescription="flowchart-v2">` +
    `<style>#${svgId}{fill:${sentinelOf('textColor')};}` +
    `#${svgId} .node rect{fill:${sentinelOf('mainBkg')};` +
    `stroke:${sentinelOf('nodeBorder')};}` +
    `#${svgId} .flowchart-link{stroke:${sentinelOf('lineColor')};}` +
    `#${svgId} .labelBkg{background-color:rgba(10, 11, ${
      parseInt(sentinelOf('edgeLabelBackground').slice(-2), 16) + 0
    }, 0.5);}` +
    `#${svgId} .commit-id,#${svgId} .branch-label{fill:lightgrey;}` +
    `#${svgId} .node .katex path{fill:#000;stroke:#000;}</style>` +
    `<g class="nodes"><rect class="basic"/><text>${
      definition.match(/"([^"]*)"/)?.[1] ?? 'node'
    }</text></g></svg>`
  )
}

describe('Mermaid fence discovery', () => {
  it('finds the block pandoc emits and decodes its source', () => {
    const html = `<p>Before</p>${pandocFence(
      'gitGraph\n   commit id: "A"'
    )}<p>After</p>`
    const blocks = findMermaidBlocks(html)

    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].definition, 'gitGraph\n   commit id: "A"')
    assert.equal(html.slice(blocks[0].start, blocks[0].end), blocks[0].html)
  })

  it('leaves fenced code for other languages alone', () => {
    const html = `${pandocFence('const x = 1', 'javascript')}${pandocFence(
      'flowchart TD\n  A --> B'
    )}`
    const blocks = findMermaidBlocks(html)

    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].definition, 'flowchart TD\n  A --> B')
  })

  it('recovers every committed fence byte for byte', () => {
    const pages = [
      'learn-more/unreachable-commits.md',
      'readme-tabs/features.md',
      'readme-tabs/complete-feature-list.md',
    ]

    let total = 0
    for (const page of pages) {
      const markdown = readFileSync(join(ProjectRoot, 'docs', page), 'utf8')
      const fences = [
        ...markdown.matchAll(/^```mermaid\r?\n([\s\S]*?)^```/gm),
      ].map(match => match[1].replace(/\r/g, '').trim())
      assert.ok(fences.length > 0, `${page} must still hold a Mermaid fence`)
      total += fences.length

      const blocks = findMermaidBlocks(fences.map(f => pandocFence(f)).join(''))
      assert.deepEqual(
        blocks.map(block => block.definition),
        fences,
        `${page} fences must survive the round trip through pandoc escaping`
      )
    }

    assert.equal(total, 10, 'the documentation set publishes ten diagrams')
  })

  it('decodes the entities pandoc writes inside a code block', () => {
    assert.equal(
      decodeHtmlEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;'),
      `a & b <c> "d" 'e'`
    )
  })
})

describe('diagram accessible names', () => {
  it('uses the bold lead-in of the caption an author already wrote', () => {
    const html = `${pandocFence(
      'flowchart TD\n A-->B'
    )}<p><strong>How the strip is organized.</strong> Tabs belong to…</p>`
    const [block] = findMermaidBlocks(html)

    assert.equal(accessibleNameFor(html, block), 'How the strip is organized')
  })

  it('falls back to the nearest preceding heading', () => {
    const html = `<h2 id="merge-commits">Merge Commits</h2><p>Now…</p>${pandocFence(
      'gitGraph\n commit'
    )}<p>Still…</p>`
    const [block] = findMermaidBlocks(html)

    assert.equal(accessibleNameFor(html, block), 'Merge Commits diagram')
  })

  it('never leaves a diagram nameless', () => {
    const html = pandocFence('flowchart TD\n A-->B')
    const [block] = findMermaidBlocks(html)

    assert.equal(accessibleNameFor(html, block), 'Mermaid diagram')
  })

  it('disambiguates two diagrams that share one caption', () => {
    const taken = new Set()

    assert.equal(uniqueName('Repository tabs', taken), 'Repository tabs')
    assert.equal(uniqueName('Repository tabs', taken), 'Repository tabs (2)')
    assert.equal(uniqueName('Repository tabs', taken), 'Repository tabs (3)')
  })
})

describe('theme safety', () => {
  it('maps every Mermaid theme variable onto a defined palette entry', () => {
    for (const [variable, property] of ThemeVariableMap) {
      assert.ok(
        Object.hasOwn(Palette, property),
        `${variable} maps to the undefined property ${property}`
      )
    }
  })

  it('gives every theme variable its own sentinel colour', () => {
    const sentinels = ThemeVariableMap.map((_, index) => sentinelFor(index))

    assert.equal(new Set(sentinels).size, sentinels.length)
    const palette = new Set(
      Object.values(Palette).flatMap(values => [values.light, values.dark])
    )
    for (const sentinel of sentinels) {
      assert.ok(
        !palette.has(sentinel),
        `${sentinel} must not collide with a real palette colour`
      )
    }
    assert.deepEqual(
      Object.keys(mermaidConfig().themeVariables).filter(
        name => name !== 'darkMode'
      ),
      ThemeVariableMap.map(([variable]) => variable)
    )
  })

  it('swaps sentinels back out in both hex and rgba spellings', () => {
    const index = ThemeVariableMap.findIndex(
      ([variable]) => variable === 'lineColor'
    )
    const sentinel = sentinelFor(index)
    const substituted = substituteThemeSentinels(
      `.a{stroke:${sentinel};}.b{fill:${sentinel.toUpperCase()};}` +
        `.c{background-color:rgba(10, 11, ${index + 1}, 0.5);}`
    )

    assert.equal(
      substituted,
      '.a{stroke:var(--dm-mermaid-line);}.b{fill:var(--dm-mermaid-line);}' +
        '.c{background-color:var(--dm-mermaid-line);}'
    )
    assert.ok(!substituted.includes(sentinel))
  })

  it('defines the whole palette for light and for dark', () => {
    const sheet = themeStyleSheet('dm-mermaid-page-1')

    assert.match(sheet, /@media \(prefers-color-scheme:dark\)/)
    for (const [property, values] of Object.entries(Palette)) {
      assert.ok(
        sheet.includes(`${property}:${values.light};`),
        `${property} has no light value`
      )
      assert.ok(
        sheet.includes(`${property}:${values.dark};`),
        `${property} has no dark value`
      )
    }
    // The colours Mermaid hard-codes past its own theme variables.
    assert.match(sheet, /\.commit-id[^}]*fill:var\(--dm-mermaid-text\)/)
    assert.match(sheet, /\.arrowheadPath\{fill:var\(--dm-mermaid-line\);\}/)
  })

  it('keeps every meaningful pair legible in both colour schemes', () => {
    for (const scheme of ['light', 'dark']) {
      const background = PageBackground[scheme]
      const text = color('--dm-mermaid-text', scheme)

      for (const surface of [
        '--dm-mermaid-surface',
        '--dm-mermaid-surface-sunken',
        '--dm-mermaid-surface-accent',
      ]) {
        assert.ok(
          contrastRatio(text, color(surface, scheme)) >= 4.5,
          `${scheme}: diagram text on ${surface} is unreadable`
        )
      }

      for (const graphic of ['--dm-mermaid-line', '--dm-mermaid-outline']) {
        assert.ok(
          contrastRatio(color(graphic, scheme), background) >= 3,
          `${scheme}: ${graphic} disappears into the page background`
        )
      }

      assert.ok(
        contrastRatio(
          color('--dm-mermaid-error-text', scheme),
          color('--dm-mermaid-error-surface', scheme)
        ) >= 4.5,
        `${scheme}: error text on its own surface is unreadable`
      )

      const onBranch = color('--dm-mermaid-on-branch', scheme)
      for (let index = 0; index < 8; index += 1) {
        const branch = color(`--dm-mermaid-branch-${index}`, scheme)
        assert.ok(
          contrastRatio(onBranch, branch) >= 4.5,
          `${scheme}: branch ${index} label text is unreadable on its chip`
        )
        assert.ok(
          contrastRatio(branch, background) >= 3,
          `${scheme}: branch ${index} disappears into the page background`
        )
      }
    }
  })

  it('flags a colour a diagram would be stuck with in one scheme', () => {
    assert.deepEqual(auditColorLiterals('.a{fill:var(--dm-mermaid-text);}'), [])
    assert.deepEqual(auditColorLiterals('.a{fill:#ff0000;}'), ['#ff0000'])
    assert.deepEqual(
      auditColorLiterals(
        InertColorLiterals.map((literal, i) => `.i${i}{fill:${literal};}`).join(
          ''
        )
      ),
      [],
      'the literals the appended stylesheet already overrides stay quiet'
    )
  })
})

describe('rendering a document', () => {
  const page =
    '<h2>Repository tabs</h2>' +
    pandocFence('flowchart TD\n  WIN["Window"] --> PROF["Active profile"]') +
    '<p><strong>How the strip is organized.</strong> Tabs and their groups ' +
    'belong to a window.</p><p><sub><strong>個 strip 點排。</strong> ' +
    '分頁同佢哋嘅 group 屬於一個窗。</sub></p>' +
    pandocFence('flowchart TD\n  A["One"] --> B["Two"]') +
    '<p><strong>Why one back door.</strong> Every route commits the same ' +
    'way.</p>'

  it('replaces every fence with an inline SVG and keeps no source', async () => {
    const result = await renderDocument(page, stubSvg, {
      documentKey: 'readme-tabs/features',
    })

    assert.equal(result.rendered, 2)
    assert.deepEqual(result.failures, [])
    assert.equal(result.html.match(/<svg\b/g)?.length, 2)
    assert.ok(!/<pre[^>]*class="[^"]*\bmermaid\b/.test(result.html))
    assert.ok(!result.html.includes('flowchart TD'))
    assert.equal(
      result.html.match(/<figure class="mermaid-figure">/g)?.length,
      2
    )
  })

  it('keeps the bilingual prose that describes each diagram', async () => {
    const result = await renderDocument(page, stubSvg, {
      documentKey: 'readme-tabs/features',
    })

    assert.ok(
      result.html.includes('<strong>How the strip is organized.</strong>')
    )
    assert.ok(result.html.includes('個 strip 點排。'))
    assert.ok(result.html.includes('<strong>Why one back door.</strong>'))
  })

  it('names each diagram for assistive technology', async () => {
    const result = await renderDocument(page, stubSvg, {
      documentKey: 'readme-tabs/features',
    })

    assert.match(
      result.html,
      /<svg[^>]*role="img"[^>]*aria-labelledby="dm-mermaid-readme-tabs-features-1-title dm-mermaid-readme-tabs-features-1-desc"/
    )
    assert.ok(
      !/role="graphics-document document"/.test(result.html),
      'the pre-rendered diagram is one image, not a live document'
    )
    assert.match(
      result.html,
      /<title id="dm-mermaid-readme-tabs-features-1-title">How the strip is organized<\/title>/
    )
    assert.match(
      result.html,
      /<title id="dm-mermaid-readme-tabs-features-2-title">Why one back door<\/title>/
    )
    assert.match(
      result.html,
      /<desc id="dm-mermaid-readme-tabs-features-1-desc">Pre-rendered Mermaid flowchart-v2\. The text after the diagram describes it in full\.<\/desc>/
    )
  })

  it('gives every diagram on a page its own id namespace', async () => {
    const result = await renderDocument(page, stubSvg, {
      documentKey: 'readme-tabs/features',
    })
    const ids = [...result.html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])

    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids}`)
    assert.equal(
      svgIdFor('readme-tabs/features', 0),
      'dm-mermaid-readme-tabs-features-1'
    )
    assert.equal(svgIdFor('', 3), 'dm-mermaid-page-4')
  })

  it('drives every colour from the page colour scheme', async () => {
    const result = await renderDocument(page, stubSvg, {
      documentKey: 'readme-tabs/features',
    })
    const styles = [...result.html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(
      match => match[1]
    )

    assert.equal(styles.length, 4, 'each SVG keeps its own two stylesheets')
    for (const style of styles) {
      assert.deepEqual(auditColorLiterals(style), [])
    }
    assert.ok(result.html.includes('var(--dm-mermaid-line)'))
    assert.ok(result.html.includes('@media (prefers-color-scheme:dark)'))
  })

  it('fetches nothing from another host', async () => {
    const result = await renderDocument(page, stubSvg, {
      documentKey: 'readme-tabs/features',
    })

    assert.deepEqual(externalAssetReferences(result.html), [])
    assert.deepEqual(externalAssetReferences(DocsTemplate), [])
  })

  it('reports a fence that will not render and keeps its source', async () => {
    const broken = `<h2>Broken</h2>${pandocFence('flowchart TD\n  A --')}`
    const result = await renderDocument(
      broken,
      () => {
        throw new Error('Parse error on line 2')
      },
      { documentKey: 'docs/broken' }
    )

    assert.equal(result.rendered, 0)
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0].name, 'Broken diagram')
    assert.equal(result.failures[0].error.message, 'Parse error on line 2')
    assert.ok(result.html.includes('<pre class="mermaid">'))
  })

  it('leaves a page without a fence exactly as pandoc wrote it', async () => {
    const plain = '<h1>Installing</h1><p>Windows only.</p>'
    const result = await renderDocument(plain, stubSvg)

    assert.equal(result.html, plain)
    assert.equal(result.rendered, 0)
  })

  it('wraps the diagram so a wide one scrolls instead of clipping', () => {
    assert.equal(
      figureFor('<svg/>'),
      '<figure class="mermaid-figure"><svg/></figure>'
    )
    assert.match(DocsTemplate, /\.mermaid-figure \{[^}]*overflow-x: auto;/)
  })

  it('never shrinks a diagram past the legibility floor', () => {
    const wide =
      '<svg id="x" width="100%" style="max-width: 1556.82px; ' +
      'background-color: transparent;">'

    assert.equal(MinimumDiagramScale, 0.8)
    assert.equal(
      withMinimumWidth(wide),
      '<svg id="x" width="100%" style="max-width: 1556.82px; ' +
        'background-color: transparent;min-width:1245.46px;">'
    )
    assert.equal(withMinimumWidth('<svg id="x">'), '<svg id="x">')
  })
})

describe('build wiring', () => {
  it('pre-renders before the search index and never publishes the script', () => {
    assert.match(
      PagesWorkflow,
      /npm install[\s\S]{0,60}@mermaid-js\/mermaid-cli/
    )
    assert.match(PagesWorkflow, /npx puppeteer browsers install chrome/)
    assert.match(
      PagesWorkflow,
      /node site\/render-mermaid\.mjs _site --require-toolchain/,
      'the published build must fail rather than ship diagram source'
    )
    assert.match(
      PagesWorkflow,
      /Pre-render Mermaid[\s\S]*?Build documentation search index/,
      'diagram labels must reach the search index'
    )
    assert.match(PagesWorkflow, /rm -f _site\/render-mermaid\.mjs/)
    assert.match(PagesWorkflow, /test ! -f _site\/render-mermaid\.mjs/)
  })

  it('styles the figure in the site stylesheet, not from a CDN', () => {
    assert.match(DocsTemplate, /\.mermaid-figure svg \{/)

    // The property being defended is "nothing is fetched from a third party",
    // not "no JavaScript at all". This used to assert the template held no
    // `<script>` whatsoever, which was a fair proxy while the template had
    // none — until the dim sum surprise shipped, at which point a locally
    // bundled script started failing a CDN test it does not violate.
    //
    // Every script source must therefore be relative. Anything absolute,
    // protocol-relative, or on a named host is a remote fetch and fails.
    for (const [, source] of DocsTemplate.matchAll(
      /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi
    )) {
      assert.ok(
        !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(source),
        `script must be bundled locally, not fetched from ${source}`
      )
    }
    // An inline script must not pull one in either.
    assert.ok(
      !/\b(?:import|fetch|importScripts)\s*\(\s*["'](?:[a-z][a-z0-9+.-]*:)?\/\//i.test(
        DocsTemplate
      ),
      'inline script must not load a remote module'
    )
  })
})

describe('toolchain resolution', () => {
  it('reports why a missing toolchain could not be loaded', async () => {
    const loaded = await loadToolchain([
      join(ProjectRoot, 'no-such-mermaid-toolchain'),
    ])

    assert.ok(Array.isArray(loaded.errors))
    assert.equal(loaded.errors.length, 1)
    assert.match(loaded.errors[0], /no-such-mermaid-toolchain/)
  })

  const toolchain = process.env.DESKTOP_MERMAID_TOOLCHAIN
  it(
    'renders a real fence through a real headless browser',
    {
      skip:
        toolchain === undefined
          ? 'set DESKTOP_MERMAID_TOOLCHAIN to a directory holding ' +
            '@mermaid-js/mermaid-cli and puppeteer'
          : false,
    },
    async () => {
      const loaded = await loadToolchain([toolchain])
      assert.equal(loaded.errors, undefined, `${loaded.errors}`)

      const browser = await loaded.puppeteer.launch({ headless: true })
      try {
        const markdown = readFileSync(
          join(ProjectRoot, 'docs', 'learn-more', 'unreachable-commits.md'),
          'utf8'
        )
        const fence = markdown
          .match(/^```mermaid\r?\n([\s\S]*?)^```/m)[1]
          .replace(/\r/g, '')
          .trim()

        const result = await renderDocument(
          `<h1>Reachable and Unreachable Commits</h1>${pandocFence(fence)}`,
          async (definition, { svgId }) => {
            const { data } = await loaded.renderMermaid(
              browser,
              definition,
              'svg',
              {
                backgroundColor: 'transparent',
                svgId,
                mermaidConfig: mermaidConfig(),
              }
            )
            return Buffer.from(data).toString('utf8')
          },
          { documentKey: 'learn-more/unreachable-commits' }
        )

        assert.deepEqual(result.failures, [])
        assert.equal(result.rendered, 1)
        assert.match(result.html, /<svg[^>]*aria-roledescription="gitGraph"/)
        assert.ok(result.html.includes('var(--dm-mermaid-branch-0)'))
        assert.deepEqual(externalAssetReferences(result.html), [])
        for (const style of [
          ...result.html.matchAll(/<style>([\s\S]*?)<\/style>/g),
        ]) {
          assert.deepEqual(auditColorLiterals(style[1]), [])
        }
      } finally {
        await browser.close()
      }
    }
  )
})
