#!/usr/bin/env node

/**
 * Pre-renders every Mermaid fence in the rendered GitHub Pages HTML into an
 * inline, theme-safe SVG.
 *
 * GitHub renders ```mermaid fences natively; pandoc does not, so `--from gfm`
 * turns each fence into `<pre class="mermaid">` and the published site showed
 * diagram source instead of a diagram. This step runs after pandoc and before
 * the search index: it finds those `<pre>` blocks, renders each definition
 * with the Mermaid CLI in a headless browser, and splices the resulting SVG
 * straight into the document. Inline SVG keeps the site's zero-external-
 * resource contract intact — no CDN script, no vendored runtime bundle, no
 * second request for an image file.
 *
 * Theme safety is not left to chance. Mermaid is handed a palette of unique
 * sentinel colours, one per theme variable, and every sentinel is swapped for
 * a CSS custom property once the SVG comes back. The custom properties are
 * defined inside the SVG itself with a `prefers-color-scheme` override, so a
 * pre-rendered diagram repaints for light and dark exactly like the rest of
 * the page and stays legible standalone.
 *
 * Usage:
 *   node site/render-mermaid.mjs <siteDir> [--require-toolchain]
 *                                          [--toolchain <dir>]
 *
 * Without `--require-toolchain` a missing Mermaid toolchain is a warning and
 * every fence is left exactly as pandoc emitted it, so a contributor can build
 * the site locally without installing a headless browser. The published build
 * passes the flag, so CI fails loudly rather than shipping diagram source.
 */

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The rendered palette. Every entry is one CSS custom property with the value
 * it takes in each colour scheme; the light values track site/docs-template
 * .html and the dark values track its `prefers-color-scheme: dark` block.
 *
 * Contrast is a shipping requirement rather than a preference, so
 * `script/render-mermaid-test.mjs` asserts the WCAG ratio of every pair that
 * carries meaning — text on its surface, lines and outlines on the page
 * background, branch chips against their label text — in both schemes.
 */
export const Palette = {
  '--dm-mermaid-canvas': { light: 'transparent', dark: 'transparent' },
  '--dm-mermaid-surface': { light: '#ffffff', dark: '#1d1a22' },
  '--dm-mermaid-surface-sunken': { light: '#ece6f0', dark: '#24212b' },
  '--dm-mermaid-surface-accent': { light: '#eaddff', dark: '#4a4458' },
  '--dm-mermaid-text': { light: '#1c1b1f', dark: '#e6e1e9' },
  '--dm-mermaid-outline': { light: '#79747e', dark: '#938f99' },
  '--dm-mermaid-line': { light: '#6750a4', dark: '#cfbcff' },
  '--dm-mermaid-error-surface': { light: '#b3261e', dark: '#f2b8b5' },
  '--dm-mermaid-error-text': { light: '#ffffff', dark: '#601410' },
  '--dm-mermaid-on-branch': { light: '#ffffff', dark: '#1c1b1f' },
  '--dm-mermaid-branch-0': { light: '#0b57d0', dark: '#8ab4f8' },
  '--dm-mermaid-branch-1': { light: '#b3261e', dark: '#f28b82' },
  '--dm-mermaid-branch-2': { light: '#0f6b3f', dark: '#81c995' },
  '--dm-mermaid-branch-3': { light: '#7b1fa2', dark: '#d7aefb' },
  '--dm-mermaid-branch-4': { light: '#8a5000', dark: '#fdd663' },
  '--dm-mermaid-branch-5': { light: '#00686e', dark: '#78d9ec' },
  '--dm-mermaid-branch-6': { light: '#a4008f', dark: '#ff8bcb' },
  '--dm-mermaid-branch-7': { light: '#42505c', dark: '#c4c7c5' },
}

/**
 * Every Mermaid theme variable we set, paired with the custom property its
 * value becomes. Anything Mermaid derives instead of reading from here shows
 * up in the colour audit, so the mapping cannot silently rot when Mermaid
 * changes its theme internals.
 */
export const ThemeVariableMap = [
  ['background', '--dm-mermaid-canvas'],
  ['primaryColor', '--dm-mermaid-surface'],
  ['mainBkg', '--dm-mermaid-surface'],
  ['secondaryColor', '--dm-mermaid-surface-accent'],
  ['tertiaryColor', '--dm-mermaid-surface-sunken'],
  ['clusterBkg', '--dm-mermaid-surface-sunken'],
  ['altBackground', '--dm-mermaid-surface-accent'],
  ['noteBkgColor', '--dm-mermaid-surface-accent'],
  ['edgeLabelBackground', '--dm-mermaid-surface-sunken'],
  ['labelBackground', '--dm-mermaid-surface-sunken'],
  ['labelBoxBkgColor', '--dm-mermaid-surface-accent'],
  ['primaryTextColor', '--dm-mermaid-text'],
  ['secondaryTextColor', '--dm-mermaid-text'],
  ['tertiaryTextColor', '--dm-mermaid-text'],
  ['noteTextColor', '--dm-mermaid-text'],
  ['textColor', '--dm-mermaid-text'],
  ['nodeTextColor', '--dm-mermaid-text'],
  ['titleColor', '--dm-mermaid-text'],
  ['labelTextColor', '--dm-mermaid-text'],
  ['primaryBorderColor', '--dm-mermaid-outline'],
  ['secondaryBorderColor', '--dm-mermaid-outline'],
  ['tertiaryBorderColor', '--dm-mermaid-outline'],
  ['noteBorderColor', '--dm-mermaid-outline'],
  ['nodeBorder', '--dm-mermaid-outline'],
  ['clusterBorder', '--dm-mermaid-outline'],
  ['labelBoxBorderColor', '--dm-mermaid-outline'],
  ['lineColor', '--dm-mermaid-line'],
  ['defaultLinkColor', '--dm-mermaid-line'],
  ['arrowheadColor', '--dm-mermaid-line'],
  ['errorBkgColor', '--dm-mermaid-error-surface'],
  ['errorTextColor', '--dm-mermaid-error-text'],
  ['commitLabelColor', '--dm-mermaid-text'],
  ['commitLabelBackground', '--dm-mermaid-surface-sunken'],
  ['tagLabelColor', '--dm-mermaid-text'],
  ['tagLabelBackground', '--dm-mermaid-surface-accent'],
  ['tagLabelBorder', '--dm-mermaid-outline'],
  ...Array.from({ length: 8 }, (_, index) => [
    `git${index}`,
    `--dm-mermaid-branch-${index}`,
  ]),
  ...Array.from({ length: 8 }, (_, index) => [
    `gitBranchLabel${index}`,
    '--dm-mermaid-on-branch',
  ]),
  ...Array.from({ length: 8 }, (_, index) => [
    `gitInv${index}`,
    '--dm-mermaid-surface',
  ]),
]

/**
 * Colour literals Mermaid bakes into rules that never apply to the diagrams
 * this site publishes: KaTeX glyph paths, the unused `look: neo` drop shadow,
 * and the legacy `.commit-id`/`.commit-msg` default. The appended stylesheet
 * overrides all of them anyway; they are allowed to survive the audit so a
 * Mermaid upgrade that introduces a *new* baked colour still fails the test.
 */
export const InertColorLiterals = [
  '#000',
  '#000000',
  'lightgrey',
  'rgba(185,185,185,1)',
]

/** The font stack the site renders documentation prose in. */
export const DiagramFontFamily =
  "'Segoe UI', system-ui, -apple-system, sans-serif"

/**
 * Mermaid sizes an SVG to fit its container, which turns a wide diagram into
 * unreadably small type in the site's 52rem column. A diagram may shrink to
 * this fraction of the size Mermaid drew it at and no further; past that the
 * figure scrolls horizontally instead, so nothing is ever clipped and no label
 * shrinks below roughly 13px.
 */
export const MinimumDiagramScale = 0.8

/** A unique, otherwise-impossible colour standing in for one theme variable. */
export function sentinelFor(index) {
  return `#0a0b${(index + 1).toString(16).padStart(2, '0')}`
}

/** `#0a0b16` as the `10, 11, 22` triple Mermaid sometimes re-serializes it to. */
function rgbTripleOf(hex) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16))
}

/** The theme variables handed to Mermaid, every colour a distinct sentinel. */
export function sentinelThemeVariables() {
  const variables = { darkMode: false }
  ThemeVariableMap.forEach(([name], index) => {
    variables[name] = sentinelFor(index)
  })
  return variables
}

/** The complete Mermaid configuration used for every fence on the site. */
export function mermaidConfig() {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: DiagramFontFamily,
    themeVariables: sentinelThemeVariables(),
  }
}

/**
 * Swaps every sentinel back out for its custom property, in both the `#rrggbb`
 * form Mermaid usually emits and the `rgb()`/`rgba()` form it falls back to
 * when it needs an alpha channel. The alpha is dropped deliberately: a
 * half-transparent edge-label backdrop is what makes a label unreadable where
 * it crosses its own edge, and an opaque chip reads correctly in both schemes.
 */
export function substituteThemeSentinels(svg) {
  let result = svg
  ThemeVariableMap.forEach(([, property], index) => {
    const sentinel = sentinelFor(index)
    const [red, green, blue] = rgbTripleOf(sentinel)
    result = result
      .replaceAll(new RegExp(sentinel, 'gi'), `var(${property})`)
      .replaceAll(
        new RegExp(
          `rgba?\\(\\s*${red}\\s*,\\s*${green}\\s*,\\s*${blue}\\s*(?:,[^)]*)?\\)`,
          'gi'
        ),
        `var(${property})`
      )
  })
  return result
}

/**
 * Every colour literal left in a stylesheet that the audit does not expect.
 * Custom-property definitions are skipped: `--dm-mermaid-text:#1c1b1f` is the
 * palette declaring itself for one colour scheme, which is the whole point.
 * What must not survive is a literal used *as* a colour, because that value
 * cannot follow the reader's light or dark preference.
 */
export function auditColorLiterals(css) {
  const literals =
    css
      .replace(/--[a-z0-9-]+\s*:[^;}]*[;}]?/gi, ' ')
      .match(
        /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\blightgrey\b/gi
      ) ?? []
  const allowed = new Set(
    InertColorLiterals.map(literal => literal.toLowerCase())
  )
  return [
    ...new Set(
      literals
        .map(literal => literal.toLowerCase().replace(/\s+/g, ''))
        .filter(literal => !allowed.has(literal.replace(/\s+/g, '')))
    ),
  ]
}

/**
 * The stylesheet appended inside each rendered SVG. It defines the palette for
 * both colour schemes and pins the handful of rules Mermaid hard-codes past
 * its own theme, so nothing in the diagram depends on the page's stylesheet
 * being present.
 */
export function themeStyleSheet(svgId) {
  const declarations = scheme =>
    Object.entries(Palette)
      .map(([property, values]) => `${property}:${values[scheme]};`)
      .join('')
  const id = `#${svgId}`
  return [
    `${id}{${declarations('light')}}`,
    `@media (prefers-color-scheme:dark){${id}{${declarations('dark')}}}`,
    // Mermaid hard-codes these past its own theme variables. They are
    // overridden rather than tolerated so no part of a diagram is stuck on a
    // colour that only works in one scheme.
    `${id} .commit-id,${id} .commit-msg,${id} .branch-label{` +
      `fill:var(--dm-mermaid-text);color:var(--dm-mermaid-text);}`,
    `${id} .arrowheadPath{fill:var(--dm-mermaid-line);}`,
    `${id} .node .katex path{fill:currentColor;stroke:currentColor;}`,
    `${id} [data-look="neo"] *{filter:none;}`,
    `${id} [data-look="neo"].node circle .state-start{` +
      `fill:var(--dm-mermaid-text);}`,
  ].join('')
}

const HtmlEntities = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&nbsp;', ' '],
])

/** Decodes the entities pandoc writes inside a `<code>` block. */
export function decodeHtmlEntities(text) {
  return text.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39|#x?[0-9a-f]+);/gi,
    entity => {
      const known = HtmlEntities.get(entity.toLowerCase())
      if (known !== undefined) {
        return known
      }
      const numeric = entity.match(/^&#(x?)([0-9a-f]+);$/i)
      if (numeric === null) {
        return entity
      }
      return String.fromCodePoint(
        parseInt(numeric[2], numeric[1] === '' ? 10 : 16)
      )
    }
  )
}

/** Escapes text for an HTML/SVG text node or a double-quoted attribute. */
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MermaidBlockPattern =
  /<pre(?=[^>]*\bclass="[^"]*\bmermaid\b[^"]*")[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi

/** Every `<pre class="mermaid">` pandoc emitted, in document order. */
export function findMermaidBlocks(html) {
  const blocks = []
  for (const match of html.matchAll(MermaidBlockPattern)) {
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
      html: match[0],
      definition: decodeHtmlEntities(match[1]).trim(),
    })
  }
  return blocks
}

function plainText(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The accessible name for one diagram, taken from the caption an author
 * already wrote: the bold lead-in of the paragraph that follows the fence
 * (every feature diagram on this site has one), falling back to the nearest
 * preceding heading, then to the page title.
 */
export function accessibleNameFor(html, block) {
  const after = html.slice(block.end, block.end + 600)
  const caption = after.match(/^\s*<p>\s*<strong>([\s\S]*?)<\/strong>/i)
  if (caption !== null) {
    const text = plainText(caption[1]).replace(/[.:：。]\s*$/, '')
    if (text !== '') {
      return text
    }
  }

  const before = html.slice(0, block.start)
  const headings = [...before.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
  const heading = headings.at(-1)
  if (heading !== undefined) {
    const text = plainText(heading[1])
    if (text !== '') {
      return `${text} diagram`
    }
  }

  return 'Mermaid diagram'
}

/** Disambiguates repeated captions on one page: "Repository tabs (2)". */
export function uniqueName(name, taken) {
  if (!taken.has(name)) {
    taken.add(name)
    return name
  }
  let suffix = 2
  while (taken.has(`${name} (${suffix})`)) {
    suffix += 1
  }
  const unique = `${name} (${suffix})`
  taken.add(unique)
  return unique
}

/**
 * Adds the floor below which a diagram scrolls rather than shrinking. Mermaid
 * writes its drawn width as `max-width` on the SVG's own style attribute, so
 * the floor is derived from the size it actually laid the diagram out at.
 */
export function withMinimumWidth(openingTag) {
  const style = openingTag.match(/\sstyle="([^"]*)"/i)
  const drawn = style?.[1].match(/max-width:\s*([\d.]+)px/i)
  if (style === null || drawn === undefined || drawn === null) {
    return openingTag
  }
  const floor = (Number(drawn[1]) * MinimumDiagramScale).toFixed(2)
  return openingTag.replace(
    style[0],
    ` style="${style[1].replace(/;?\s*$/, ';')}min-width:${floor}px;"`
  )
}

/** The diagram kind Mermaid recorded on the SVG, e.g. `flowchart-v2`. */
export function diagramKind(svg) {
  const description = svg.match(/aria-roledescription="([^"]*)"/i)
  return description === null ? 'diagram' : description[1]
}

/**
 * Turns the raw Mermaid SVG into the element the site publishes: theme-driven
 * colours, one accessible name, and a description that points a screen-reader
 * user at the prose beneath the diagram rather than pretending an SVG title
 * can replace it.
 */
export function decorateSvg(svg, { svgId, name }) {
  const opening = svg.match(/^<svg\b[^>]*>/i)
  if (opening === null) {
    throw new Error('Mermaid returned something that is not an SVG element')
  }

  const description =
    `Pre-rendered Mermaid ${diagramKind(svg)}. ` +
    `The text after the diagram describes it in full.`

  const attributes = withMinimumWidth(
    opening[0]
      .replace(/\srole="[^"]*"/i, '')
      .replace(/\saria-label(?:ledby)?="[^"]*"/gi, '')
      .replace(
        /^<svg/i,
        `<svg role="img" aria-labelledby="${svgId}-title ${svgId}-desc"`
      )
  )

  const body = svg.slice(opening[0].length)
  const titled =
    attributes +
    `<title id="${svgId}-title">${escapeHtml(name)}</title>` +
    `<desc id="${svgId}-desc">${escapeHtml(description)}</desc>` +
    body

  const styled = titled.replace(
    /<\/svg>\s*$/i,
    `<style>${themeStyleSheet(svgId)}</style></svg>`
  )

  return substituteThemeSentinels(styled)
}

/** The figure element that replaces one `<pre class="mermaid">`. */
export function figureFor(svg) {
  return `<figure class="mermaid-figure">${svg}</figure>`
}

/** A stable, collision-free SVG id, which also namespaces Mermaid's own ids. */
export function svgIdFor(documentKey, index) {
  const slug = documentKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `dm-mermaid-${slug === '' ? 'page' : slug}-${index + 1}`
}

/**
 * Renders every fence in one document. `render(definition, { svgId })` returns
 * the SVG source; anything it throws is collected and reported against the
 * exact fence that produced it, because a diagram that fails to render is an
 * authoring bug the build must not paper over.
 */
export async function renderDocument(html, render, options = {}) {
  const { documentKey = 'page', onWarn = () => {} } = options
  const blocks = findMermaidBlocks(html)
  if (blocks.length === 0) {
    return { html, rendered: 0, failures: [] }
  }

  const taken = new Set()
  const failures = []
  const pieces = []
  let cursor = 0

  for (const [index, block] of blocks.entries()) {
    const name = uniqueName(accessibleNameFor(html, block), taken)
    const svgId = svgIdFor(documentKey, index)
    pieces.push(html.slice(cursor, block.start))
    cursor = block.end

    try {
      const svg = await render(block.definition, { svgId })
      const decorated = decorateSvg(svg, { svgId, name })
      const stylesheets = [...decorated.matchAll(/<style>([\s\S]*?)<\/style>/g)]
        .map(match => match[1])
        .join('\n')
      for (const literal of auditColorLiterals(stylesheets)) {
        onWarn(
          `${documentKey}: diagram ${index + 1} ("${name}") kept the literal ` +
            `colour ${literal}, which cannot follow the page's colour scheme`
        )
      }
      pieces.push(figureFor(decorated))
    } catch (error) {
      failures.push({
        index,
        name,
        definition: block.definition,
        error,
      })
      pieces.push(block.html)
    }
  }

  pieces.push(html.slice(cursor))
  return {
    html: pieces.join(''),
    rendered: blocks.length - failures.length,
    failures,
  }
}

/**
 * Finds an installed Mermaid CLI plus puppeteer, searching an explicit
 * toolchain directory first and this repository's own modules last. Returns
 * null when neither is installed, which is the local-contributor path.
 */
export async function loadToolchain(searchRoots) {
  const errors = []
  for (const root of searchRoots) {
    try {
      const resolver =
        root === null
          ? createRequire(import.meta.url)
          : createRequire(path.join(path.resolve(root), 'resolve-from-here.js'))
      const cliPath = resolver.resolve('@mermaid-js/mermaid-cli')
      const puppeteerPath = resolver.resolve('puppeteer')
      const cli = await import(pathToFileURL(cliPath).href)
      const browserModule = await import(pathToFileURL(puppeteerPath).href)
      const puppeteer = browserModule.default ?? browserModule
      if (typeof cli.renderMermaid !== 'function') {
        throw new Error('@mermaid-js/mermaid-cli exports no renderMermaid')
      }
      return { renderMermaid: cli.renderMermaid, puppeteer, root }
    } catch (error) {
      errors.push(`${root ?? 'repository modules'}: ${error.message}`)
    }
  }
  return { errors }
}

/** Launches Chromium, retrying once without the sandbox for locked-down CI. */
async function launchBrowser(puppeteer, onWarn) {
  try {
    return await puppeteer.launch({ headless: true })
  } catch (error) {
    onWarn(
      `Chromium refused to start (${error.message}); retrying with ` +
        `--no-sandbox for this build only`
    )
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
}

function* walkHtml(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      yield* walkHtml(full)
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      yield full
    }
  }
}

export function parseArguments(argv) {
  const positional = []
  let requireToolchain = false
  let toolchain = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--require-toolchain') {
      requireToolchain = true
    } else if (argument === '--toolchain') {
      index += 1
      toolchain = argv[index] ?? null
    } else if (argument.startsWith('--toolchain=')) {
      toolchain = argument.slice('--toolchain='.length)
    } else {
      positional.push(argument)
    }
  }

  return { siteDir: positional[0] ?? '_site', requireToolchain, toolchain }
}

async function main(argv) {
  const { siteDir, requireToolchain, toolchain } = parseArguments(argv)
  const root = path.resolve(siteDir)
  const repositoryRoot = path.resolve(import.meta.dirname, '..')
  const warn = message => process.stderr.write(`WARNING: ${message}\n`)

  const documents = [...walkHtml(root)].filter(
    file => findMermaidBlocks(fs.readFileSync(file, 'utf8')).length > 0
  )

  if (documents.length === 0) {
    process.stdout.write('No Mermaid fences found; nothing to pre-render.\n')
    return 0
  }

  const searchRoots = [
    toolchain,
    process.env.DESKTOP_MERMAID_TOOLCHAIN ?? null,
    null,
    path.join(repositoryRoot, '.mermaid-toolchain'),
  ].filter((value, index, all) => all.indexOf(value) === index)

  const loaded = await loadToolchain(searchRoots)
  if (loaded.errors !== undefined) {
    const detail = loaded.errors.join('; ')
    if (requireToolchain) {
      process.stderr.write(
        `ERROR: the Mermaid toolchain is required for this build but could ` +
          `not be loaded (${detail}). Install @mermaid-js/mermaid-cli and ` +
          `puppeteer, then re-run.\n`
      )
      return 1
    }
    warn(
      `no Mermaid toolchain found (${detail}); leaving ` +
        `${documents.length} page(s) with their fenced diagram source. ` +
        `Install @mermaid-js/mermaid-cli and puppeteer to pre-render them.`
    )
    return 0
  }

  const { renderMermaid, puppeteer } = loaded
  const browser = await launchBrowser(puppeteer, warn)
  const failures = []
  let diagrams = 0

  try {
    for (const file of documents) {
      const documentKey = path
        .relative(root, file)
        .split(path.sep)
        .join('/')
        .replace(/\.html$/, '')
      const html = fs.readFileSync(file, 'utf8')
      const result = await renderDocument(
        html,
        async (definition, { svgId }) => {
          const { data } = await renderMermaid(browser, definition, 'svg', {
            backgroundColor: 'transparent',
            svgId,
            viewport: { width: 1400, height: 900, deviceScaleFactor: 1 },
            mermaidConfig: mermaidConfig(),
          })
          return Buffer.from(data).toString('utf8')
        },
        { documentKey, onWarn: warn }
      )

      for (const failure of result.failures) {
        failures.push({ file: documentKey, ...failure })
      }

      if (result.failures.length === 0) {
        fs.writeFileSync(file, result.html)
        diagrams += result.rendered
        process.stdout.write(
          `Pre-rendered ${result.rendered} diagram(s) in ${documentKey}.html\n`
        )
      }
    }
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    process.stderr.write(
      `\nERROR: ${failures.length} Mermaid diagram(s) failed to render. The ` +
        `pages holding them were left untouched and the build must not ` +
        `publish diagram source, so this is fatal.\n`
    )
    for (const failure of failures) {
      process.stderr.write(
        `\n  ${failure.file}.html, diagram ${failure.index + 1} ` +
          `("${failure.name}"):\n    ${failure.error.message}\n` +
          failure.definition
            .split('\n')
            .map(line => `      | ${line}`)
            .join('\n') +
          '\n'
      )
    }
    return 1
  }

  process.stdout.write(
    `Pre-rendered ${diagrams} Mermaid diagram(s) across ` +
      `${documents.length} page(s) as inline SVG.\n`
  )
  return 0
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = await main(process.argv.slice(2))
}
