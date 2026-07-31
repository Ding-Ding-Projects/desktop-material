/**
 * Contracts for the generated per-screenshot documentation pages under
 * `docs/screenshots/`, produced by `script/generate-screenshot-docs.mjs`.
 *
 * These assertions deliberately re-derive their expectations from the same
 * primary sources the generator reads — the capture plan and the PNG headers on
 * disk — instead of trusting the generated markup to describe itself. A page
 * that claims a resolution no PNG actually has, or a navigation link to a file
 * that was never written, is exactly the failure this suite exists to catch.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { closeSync, openSync, readdirSync, readFileSync, readSync } from 'fs'
import { existsSync, statSync } from 'fs'
import { createRequire } from 'node:module'
import { join } from 'path'

const require_ = createRequire(import.meta.url)

const RepositoryRoot = process.cwd()
const ScreenshotDocsDir = join(RepositoryRoot, 'docs', 'screenshots')
const ScreenshotAssetDir = join(RepositoryRoot, 'docs', 'assets', 'screenshots')
const PlanPath = join(
  RepositoryRoot,
  '.codex',
  'verification',
  'gallery_capture_plan.js'
)

interface ICapturePlanEntry {
  readonly output: string
  readonly file: string
  readonly scene: string
  readonly batch: string
}

interface ICapturePlan {
  readonly GalleryCapturePlan: ReadonlyArray<ICapturePlanEntry>
  readonly PublishedGalleryOutputs: ReadonlyArray<string>
}

const plan: ICapturePlan = require_(PlanPath)

/** Independent PNG IHDR reader, so the pages are checked against real bytes. */
function readPngSize(file: string): { width: number; height: number } {
  const handle = openSync(file, 'r')
  try {
    const header = Buffer.alloc(24)
    readSync(handle, header, 0, 24, 0)
    assert.strictEqual(
      header.subarray(12, 16).toString('latin1'),
      'IHDR',
      `${file} does not start with an IHDR chunk`
    )
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  } finally {
    closeSync(handle)
  }
}

/** The generator's digit grouping, repeated here so the numbers are compared. */
function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Prettier reflows the generated markup, so every text assertion runs against
 * whitespace-collapsed content rather than against the exact line breaks.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function stripTags(html: string): string {
  return normalize(html.replace(/<[^>]*>/g, ' '))
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return match === null ? null : match[1]
}

function imageTags(html: string): ReadonlyArray<string> {
  return html.match(/<img\b[^>]*>/g) || []
}

const pageFiles = readdirSync(ScreenshotDocsDir)
  .filter(name => name.endsWith('.html'))
  .sort()

const pages = new Map<string, string>()
for (const name of pageFiles) {
  pages.set(name, readFileSync(join(ScreenshotDocsDir, name), 'utf8'))
}

const framePages = pageFiles.filter(name => name !== 'index.html')

const screenshotFiles = readdirSync(ScreenshotAssetDir)
  .filter(name => /\.png$/i.test(name))
  .sort()

describe('Generated screenshot documentation pages', () => {
  it('exists at all, with an index', () => {
    assert.ok(
      pages.has('index.html'),
      'docs/screenshots/index.html is missing; run node script/generate-screenshot-docs.mjs'
    )
    assert.ok(
      framePages.length > 0,
      'no per-screenshot pages were generated under docs/screenshots/'
    )
  })

  it('gives every published gallery output its own page', () => {
    const missing = plan.PublishedGalleryOutputs.filter(
      output => !pages.has(`${output}.html`)
    )
    assert.deepStrictEqual(
      missing,
      [],
      `published gallery outputs without a documentation page: ${missing.join(
        ', '
      )}`
    )
    assert.strictEqual(
      plan.PublishedGalleryOutputs.length,
      plan.GalleryCapturePlan.length,
      'the capture plan and its published output list disagree on how many frames exist'
    )
  })

  it('gives every screenshot on disk its own page', () => {
    const missing = screenshotFiles.filter(
      file => !pages.has(`${file.replace(/\.png$/i, '')}.html`)
    )
    assert.deepStrictEqual(
      missing,
      [],
      `PNGs in docs/assets/screenshots/ with no documentation page: ${missing.join(
        ', '
      )}`
    )
  })

  it('never documents a PNG that is not on disk', () => {
    for (const name of framePages) {
      const html = pages.get(name) as string
      const referenced = imageTags(html)
        .map(tag => attribute(tag, 'src') || '')
        .filter(source => source.includes('/screenshots/'))
      assert.ok(referenced.length > 0, `${name} embeds no screenshot at all`)
      for (const source of referenced) {
        const file = source.replace('../assets/screenshots/', '')
        assert.ok(
          existsSync(join(ScreenshotAssetDir, file)),
          `${name} references ${source}, which does not exist on disk`
        )
      }
    }
  })

  it('writes the real PNG dimensions and byte size into every page', () => {
    for (const name of framePages) {
      const html = pages.get(name) as string
      const file = `${name.replace(/\.html$/, '')}.png`
      const assetPath = join(ScreenshotAssetDir, file)
      assert.ok(existsSync(assetPath), `${name} has no matching PNG ${file}`)

      const size = readPngSize(assetPath)
      const bytes = statSync(assetPath).size
      const text = normalize(html)

      const tag = imageTags(html).find(candidate =>
        (attribute(candidate, 'src') || '').endsWith(`/${file}`)
      )
      assert.ok(tag, `${name} does not embed ${file}`)
      assert.strictEqual(
        attribute(tag as string, 'width'),
        String(size.width),
        `${name} declares the wrong width attribute for ${file}`
      )
      assert.strictEqual(
        attribute(tag as string, 'height'),
        String(size.height),
        `${name} declares the wrong height attribute for ${file}`
      )

      assert.ok(
        text.includes(
          `${groupDigits(size.width)} × ${groupDigits(
            size.height
          )} px, read from the PNG IHDR header`
        ),
        `${name} does not state the real IHDR dimensions ${size.width}×${size.height}`
      )
      assert.ok(
        text.includes(`${groupDigits(bytes)} bytes on disk`),
        `${name} does not state the real byte size ${bytes}`
      )
    }
  })

  it('states every recorded fact, with no empty or placeholder value', () => {
    const placeholders =
      /\b(tbd|todo|fixme|lorem ipsum|undefined|nan|n\/a|xxx|placeholder|\[object object\])\b/
    for (const name of pageFiles) {
      const html = pages.get(name) as string
      const values = html.match(/<dd class="[^"]*">[\s\S]*?<\/dd>/g) || []
      assert.ok(values.length > 0, `${name} renders no fact list at all`)
      for (const value of values) {
        const text = stripTags(value)
        assert.ok(text.length > 0, `${name} renders an empty fact value`)
        assert.ok(
          !placeholders.test(text.toLowerCase()),
          `${name} renders a placeholder fact value: ${text}`
        )
      }
      const keys = html.match(/<dt class="[^"]*">[\s\S]*?<\/dt>/g) || []
      assert.strictEqual(
        keys.length,
        values.length,
        `${name} has ${keys.length} fact labels but ${values.length} values`
      )
      for (const key of keys) {
        assert.ok(
          stripTags(key).length > 0,
          `${name} renders an empty fact label`
        )
      }
    }
  })

  it('says so in words wherever a source records nothing', () => {
    // Retained historical frames have no capture-plan entry, so their pages must
    // state each absence rather than render a blank section.
    const planned = new Set(plan.GalleryCapturePlan.map(entry => entry.file))
    const retained = screenshotFiles.filter(file => !planned.has(file))
    assert.ok(
      retained.length > 0,
      'expected at least one retained historical screenshot outside the capture plan'
    )
    for (const file of retained) {
      const name = `${file.replace(/\.png$/i, '')}.html`
      const text = normalize(pages.get(name) as string)
      assert.ok(
        text.includes('has no entry in GalleryCapturePlan'),
        `${name} does not state that no scene produces this frame`
      )
      assert.ok(
        text.includes('No interaction is recorded'),
        `${name} does not state that no interaction is recorded`
      )
      assert.ok(
        text.includes('No commands are recorded'),
        `${name} does not state that no regeneration commands are recorded`
      )
    }
  })

  it('records the exact regeneration commands of each capture batch', () => {
    const batches: Record<
      string,
      { readonly commands: ReadonlyArray<string> }
    > = require_(PlanPath).CaptureBatches
    for (const entry of plan.GalleryCapturePlan) {
      const html = pages.get(`${entry.output}.html`) as string
      const text = normalize(html)
      const commands = batches[entry.batch].commands
      assert.ok(commands.length > 0, `${entry.batch} declares no commands`)
      for (const command of commands) {
        const expected = normalize(
          command
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
        )
        assert.ok(
          text.includes(expected),
          `${entry.output}.html omits a regeneration command of ${entry.batch}`
        )
      }
    }
  })

  it('resolves every previous and next link to a real page', () => {
    let withoutPrevious = 0
    let withoutNext = 0
    for (const name of framePages) {
      const html = pages.get(name) as string
      for (const relation of ['prev', 'next']) {
        const anchor = new RegExp(
          `<a[^>]*rel="${relation}"[^>]*>|<a[^>]*rel="${relation}"[^>]*`,
          ''
        ).exec(html)
        if (anchor === null) {
          if (relation === 'prev') {
            withoutPrevious += 1
          } else {
            withoutNext += 1
          }
          // The first and last frames say so instead of linking nowhere.
          assert.ok(
            normalize(html).includes(
              relation === 'prev'
                ? 'This is the first frame in the gallery order.'
                : 'This is the last frame in the gallery order.'
            ),
            `${name} has no ${relation} link and does not explain why`
          )
          continue
        }
        const target = attribute(anchor[0], 'href')
        assert.ok(target, `${name} has a ${relation} link with no href`)
        assert.ok(
          pages.has(target as string),
          `${name} links ${relation} to ${target}, which does not exist`
        )
      }
    }
    assert.strictEqual(
      withoutPrevious,
      1,
      'exactly one page may be first in the gallery order'
    )
    assert.strictEqual(
      withoutNext,
      1,
      'exactly one page may be last in the gallery order'
    )
  })

  it('keeps previous and next links mutually consistent', () => {
    for (const name of framePages) {
      const html = pages.get(name) as string
      const next = /<a[^>]*rel="next"[^>]*/.exec(html)
      if (next === null) {
        continue
      }
      const target = attribute(next[0], 'href') as string
      const neighbour = pages.get(target) as string
      const back = /<a[^>]*rel="prev"[^>]*/.exec(neighbour)
      assert.ok(back, `${target} does not link back to a previous frame`)
      assert.strictEqual(
        attribute((back as RegExpExecArray)[0], 'href'),
        name,
        `${target} does not point back to ${name}`
      )
    }
  })

  it('links the index to every page, and every page back to the index', () => {
    const index = pages.get('index.html') as string
    for (const name of framePages) {
      assert.ok(
        index.includes(`href="${name}"`),
        `docs/screenshots/index.html does not link to ${name}`
      )
      assert.ok(
        (pages.get(name) as string).includes('href="index.html"'),
        `${name} does not link back to the index`
      )
    }
  })

  it('gives every image non-empty alternative text', () => {
    for (const name of pageFiles) {
      const tags = imageTags(pages.get(name) as string)
      assert.ok(tags.length > 0, `${name} contains no images`)
      for (const tag of tags) {
        const alt = attribute(tag, 'alt')
        assert.notStrictEqual(
          alt,
          null,
          `${name} has an image with no alt attribute: ${tag}`
        )
        assert.ok(
          (alt as string).trim().length > 0,
          `${name} has an image with empty alt text: ${tag}`
        )
      }
    }
  })

  it('loads the shared Pages assets on every page', () => {
    for (const name of pageFiles) {
      const html = pages.get(name) as string
      for (const asset of [
        '../assets/site/docs-hub.css',
        '../assets/site/docs-color-picker.css',
        '../assets/site/docs-color.js',
        '../assets/site/docs-color-picker.js',
        '../assets/site/docs-screenshot-gallery.js',
      ]) {
        assert.ok(
          html.includes(asset),
          `${name} does not load the shared asset ${asset}`
        )
      }
      assert.ok(
        html.includes('href="screenshot-docs.css"'),
        `${name} does not load its own generated stylesheet`
      )
    }
  })

  /**
   * The previous version of this test asserted a list of hub hook ids and
   * nothing else, so it passed while every control on every page was inert —
   * `docs-hub.js` cannot load here (it dereferences 21 `rb-*` ids these pages do
   * not have), and no page called the gallery module. Asserting that a container
   * exists proves nothing about whether anything animates it.
   *
   * So this now checks the three things that actually make a control work: the
   * controls the page's own controller wires, the controller and its
   * dependencies being loaded in a workable order, and the embedded payload the
   * gallery mounts from.
   */
  it('ships controls that something is actually wired to animate', () => {
    for (const name of pageFiles) {
      const html = pages.get(name) as string

      for (const hook of [
        // Wired by docs-screenshot-page.js.
        'id="prefs"',
        'id="prefs-toggle"',
        'name="lang"',
        'id="fun-en"',
        'id="fun-yue"',
        'id="theme-toggle"',
        // Built into by docs-screenshot-gallery.js.
        'id="screenshot-gallery"',
        'id="main"',
      ]) {
        assert.ok(html.includes(hook), `${name} is missing the hook ${hook}`)
      }

      for (const script of [
        'docs-screenshot-gallery.js',
        'docs-screenshot-strings.js',
        'docs-screenshot-page.js',
      ]) {
        assert.ok(
          html.includes(script),
          `${name} never loads ${script}, so its controls would be inert`
        )
      }

      // The controller reads both of these at start(), so a page that loads it
      // first would mount nothing. Compare the <script> tags themselves: the
      // page's own explanatory comments name these files too, and matching bare
      // filenames measured prose instead of load order.
      const tagAt = (file: string) =>
        html.indexOf(`<script src="../assets/site/${file}">`)
      assert.ok(
        tagAt('docs-screenshot-gallery.js') > 0 &&
          tagAt('docs-screenshot-strings.js') > 0 &&
          tagAt('docs-screenshot-page.js') >
            tagAt('docs-screenshot-gallery.js') &&
          tagAt('docs-screenshot-page.js') >
            tagAt('docs-screenshot-strings.js'),
        `${name} loads its controller before the modules it depends on`
      )

      // Without this stylesheet the module's own .dm-shot-* markup renders at
      // the screenshot's natural width and the page scrolls sideways.
      assert.ok(
        html.includes('docs-screenshot-gallery.css'),
        `${name} omits the gallery stylesheet that constrains its thumbnails`
      )

      const payload =
        /<script id="screenshot-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/.exec(
          html
        )
      assert.ok(payload !== null, `${name} embeds no gallery payload`)
      const parsed = JSON.parse(
        (payload as RegExpExecArray)[1].replace(/\\u003c/g, '<')
      )
      assert.ok(
        Array.isArray(parsed.items) && parsed.items.length > 0,
        `${name} embeds an empty payload, so its gallery would mount nothing`
      )
      assert.ok(
        typeof parsed.imageBase === 'string' && parsed.imageBase.length > 0,
        `${name} embeds no imageBase, so thumbnails would resolve nowhere`
      )
      for (const record of parsed.items) {
        assert.ok(
          typeof record.file === 'string' && record.file.length > 0,
          `${name} embeds a record with no file name, which the gallery drops`
        )
      }

      // data-js must never be asserted before the controller confirms a mount,
      // or the honest no-JavaScript note gets hidden above dead controls.
      assert.ok(
        !/root\.setAttribute\(\s*'data-js'/.test(html),
        `${name} claims data-js before anything is wired`
      )
      assert.ok(
        html.includes('class="nojs-note"'),
        `${name} drops the note that explains inactive controls`
      )
      assert.ok(
        html.includes('class="skip-link"'),
        `${name} has no keyboard skip route`
      )
    }
  })

  it('publishes the generated stylesheet the pages depend on', () => {
    const stylesheet = readFileSync(
      join(ScreenshotDocsDir, 'screenshot-docs.css'),
      'utf8'
    )
    // Mobile-first, 44 px targets, and both environment queries are contracts,
    // not decoration: the pages inherit nothing else of their own layout.
    assert.match(stylesheet, /min-height: 44px/)
    assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(stylesheet, /@media \(forced-colors: active\)/)
    assert.match(stylesheet, /@media \(min-width: 48rem\)/)
  })

  it('states its counts on the index', () => {
    const index = normalize(pages.get('index.html') as string)
    assert.ok(
      index.includes(`${screenshotFiles.length}, one per PNG`),
      'the index does not state how many pages it generated'
    )
    assert.ok(
      index.includes(`${plan.PublishedGalleryOutputs.length}, every entry in`),
      'the index does not state the published gallery output count'
    )
    const batches = new Set(plan.GalleryCapturePlan.map(entry => entry.batch))
    for (const batch of batches) {
      assert.ok(
        index.includes(`id="batch-${batch}"`),
        `the index has no group for capture batch ${batch}`
      )
    }
  })
})
