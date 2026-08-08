#!/usr/bin/env node
/**
 * Generate `docs/screenshots/` — one documentation page per gallery screenshot.
 *
 * WHY this exists: the guided gallery used to live entirely inside a single
 * "Screenshots" tab, so a reader could see a frame but had nowhere to learn what
 * produced it. Each PNG in this repository is an acceptance artifact with a
 * scene id, an owning capture batch, a fixture, a privacy gate, an exact
 * regeneration command line and sometimes a dated receipt. That is per-frame
 * documentation, so it gets a per-frame page.
 *
 * WHY it is generated rather than hand-written: every fact on these pages is
 * already recorded somewhere authoritative. Hand-copying 92 frames' worth of
 * dimensions and command lines would drift the moment a capture is re-run.
 * The only sources this script reads are:
 *
 *   .codex/verification/gallery_capture_plan.js  scene / batch / interaction /
 *                                                platform / commands / fixture /
 *                                                privacy gate / deferrals
 *   docs/wiki/Feature-Gallery.md                 the human caption per PNG and
 *                                                the Markdown image alt text
 *   docs/assets/screenshots/*.png                real IHDR dimensions and real
 *                                                byte sizes, read from disk
 *   docs/verification/**                         dated acceptance receipts that
 *                                                name a PNG by file name
 *
 * WHY nothing is invented: a missing datum is itself information. Where a
 * source records nothing, the page says so in words and this script counts it,
 * so the summary reports how much of the gallery is undocumented instead of
 * hiding it behind filler prose.
 *
 * Determinism: no clock, no randomness, no network. Every collection is either
 * consumed in its declared order or sorted, so two runs over an unchanged tree
 * write byte-identical files. Stale pages from a previous run are pruned.
 *
 * Usage: node script/generate-screenshot-docs.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ScriptDir = path.dirname(fileURLToPath(import.meta.url))
const RepositoryRoot = path.resolve(ScriptDir, '..')

/**
 * The repository lints every `.html` and `.css` with Prettier, so generated
 * files are formatted by Prettier itself rather than by hand-tuned template
 * indentation. Prettier is deterministic, so this keeps `yarn prettier` green
 * without costing byte-identical regeneration.
 */
let prettier
try {
  prettier = require('prettier')
} catch (error) {
  process.stderr.write(
    'script/generate-screenshot-docs.mjs needs the repository devDependency ' +
      "'prettier' to format its output. Run 'yarn install' first.\n"
  )
  throw error
}

const PlanPath = path.join(
  RepositoryRoot,
  '.codex',
  'verification',
  'gallery_capture_plan.js'
)
const GalleryWikiPath = path.join(
  RepositoryRoot,
  'docs',
  'wiki',
  'Feature-Gallery.md'
)
const ScreenshotDir = path.join(RepositoryRoot, 'docs', 'assets', 'screenshots')
const VerificationDir = path.join(RepositoryRoot, 'docs', 'verification')
const OutputDir = path.join(RepositoryRoot, 'docs', 'screenshots')

const RepositoryBlobBase =
  'https://github.com/Ding-Ding-Projects/desktop-material/blob/main/'

/** Every generated page carries this stylesheet next to the shared hub CSS. */
const PageStylesheet = 'screenshot-docs.css'

// --------------------------------------------------------------- utilities

/** Escape for HTML text and for double-quoted attribute values alike. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Group digits with commas without `toLocaleString`, whose output depends on
 * the host locale and would break byte-identical regeneration.
 */
function groupDigits(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function sortedUnique(values) {
  return Array.from(new Set(values)).sort()
}

/** POSIX-style repository-relative path, so generated links match on Windows. */
function repoRelative(absolutePath) {
  return path.relative(RepositoryRoot, absolutePath).split(path.sep).join('/')
}

// ------------------------------------------------------------- PNG reading

const PngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const PngColourTypes = {
  0: 'greyscale',
  2: 'truecolour',
  3: 'indexed-colour',
  4: 'greyscale with alpha',
  6: 'truecolour with alpha',
}

/**
 * Read the real IHDR header. The dimensions printed on a page must come from
 * the bytes on disk: a recorded number in a receipt can be stale, the header
 * cannot be.
 */
function readPngHeader(filePath) {
  const handle = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(26)
    const read = fs.readSync(handle, header, 0, 26, 0)
    if (read !== 26) {
      throw new Error(`${repoRelative(filePath)} is too short to be a PNG`)
    }
    if (!header.subarray(0, 8).equals(PngSignature)) {
      throw new Error(`${repoRelative(filePath)} has no PNG signature`)
    }
    if (header.subarray(12, 16).toString('latin1') !== 'IHDR') {
      throw new Error(`${repoRelative(filePath)} does not start with IHDR`)
    }
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
      bitDepth: header.readUInt8(24),
      colourType: header.readUInt8(25),
    }
  } finally {
    fs.closeSync(handle)
  }
}

function readScreenshotFiles() {
  const names = fs
    .readdirSync(ScreenshotDir)
    .filter(name => /\.png$/i.test(name))
    .sort()
  const files = new Map()
  for (const name of names) {
    const absolute = path.join(ScreenshotDir, name)
    const header = readPngHeader(absolute)
    files.set(name, {
      file: name,
      bytes: fs.statSync(absolute).size,
      width: header.width,
      height: header.height,
      bitDepth: header.bitDepth,
      colourType: header.colourType,
      colourTypeName:
        PngColourTypes[header.colourType] ||
        `unnamed PNG colour type ${header.colourType}`,
    })
  }
  return files
}

// ------------------------------------------------------------ wiki reading

/**
 * Pull the two things only the wiki knows: the one-line human caption in the
 * asset tables, and the Markdown image alt text of each embedded frame. The
 * owning `##` section comes from where the image is embedded, not from where
 * the table row sits, because the master asset table precedes every section.
 */
function readGalleryWiki() {
  const source = fs.readFileSync(GalleryWikiPath, 'utf8')
  const lines = source.split(/\r?\n/)
  const rows = new Map()
  const images = new Map()
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g
  const assetPattern = /docs\/assets\/screenshots\/([A-Za-z0-9._-]+\.png)/
  let section = null

  for (const line of lines) {
    const heading = /^##\s+(.*\S)\s*$/.exec(line)
    if (heading) {
      section = heading[1]
    }

    imagePattern.lastIndex = 0
    let image = imagePattern.exec(line)
    while (image !== null) {
      const asset = assetPattern.exec(image[2])
      // First embed wins: later refreshes append, they do not replace.
      if (asset && !images.has(asset[1])) {
        images.set(asset[1], { alt: image[1].trim(), section: section })
      }
      image = imagePattern.exec(line)
    }

    const trimmed = line.trim()
    if (trimmed.startsWith('|')) {
      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim())
      const asset = /^`([A-Za-z0-9._-]+\.png)`$/.exec(cells[0] || '')
      if (asset && !rows.has(asset[1])) {
        rows.set(asset[1], { cells: cells.slice(1), section: section })
      }
    }
  }

  return { rows: rows, images: images }
}

// -------------------------------------------------------- receipt scanning

function walkFiles(directory, accumulator) {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .slice()
    .sort((left, right) => (left.name < right.name ? -1 : 1))
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, accumulator)
    } else {
      accumulator.push(full)
    }
  }
  return accumulator
}

/**
 * A receipt "names" a PNG when the file name appears on a file-name boundary.
 * Plain `includes` would let `regex-builder.png` claim every receipt that
 * mentions `linux-tui-regex-builder.png`, silently inventing evidence.
 */
function namesFile(text, fileName) {
  let index = text.indexOf(fileName)
  while (index !== -1) {
    const before = index === 0 ? '' : text.charAt(index - 1)
    if (!/[A-Za-z0-9._-]/.test(before)) {
      return true
    }
    index = text.indexOf(fileName, index + 1)
  }
  return false
}

/**
 * Split verification documents into dated receipts (a `YYYY-MM-DD` in the path,
 * which is how this repository stamps an acceptance run) and undated indexes
 * such as `docs/verification/README.md`. An index is a pointer, not evidence,
 * so the two are reported separately rather than merged into one count.
 */
function readReceipts(fileNames) {
  const dated = new Map()
  const undated = new Map()
  if (!fs.existsSync(VerificationDir)) {
    return { dated: dated, undated: undated, documentsScanned: 0 }
  }
  const documents = walkFiles(VerificationDir, []).filter(candidate =>
    /\.(md|json|txt)$/i.test(candidate)
  )
  for (const document of documents) {
    const text = fs.readFileSync(document, 'utf8')
    const relative = repoRelative(document)
    const bucket = /\d{4}-\d{2}-\d{2}/.test(relative) ? dated : undated
    for (const fileName of fileNames) {
      if (!namesFile(text, fileName)) {
        continue
      }
      if (!bucket.has(fileName)) {
        bucket.set(fileName, [])
      }
      bucket.get(fileName).push(relative)
    }
  }
  for (const map of [dated, undated]) {
    for (const [key, value] of map) {
      map.set(key, sortedUnique(value))
    }
  }
  return { dated: dated, undated: undated, documentsScanned: documents.length }
}

// ------------------------------------------------------------ entry model

/**
 * A datum that a source genuinely does not record becomes an explicit
 * statement, never an empty cell. `available: false` is what the summary
 * counts, so an undocumented gallery reads as undocumented.
 */
function fact(label, value, unavailableReason) {
  const text = typeof value === 'string' ? value.trim() : value
  if (text === undefined || text === null || text === '') {
    return { label: label, text: unavailableReason, available: false }
  }
  return { label: label, text: text, available: true }
}

function buildEntries(plan, wiki, files, receipts) {
  const planByFile = new Map()
  for (const planEntry of plan.GalleryCapturePlan) {
    planByFile.set(planEntry.file, planEntry)
  }

  const batchOrder = Object.keys(plan.CaptureBatches)
  const deferredCanonical = new Set(plan.DeferredCanonicalOutputs || [])
  const deferredSpecialist = new Set(plan.DeferredSpecialistOutputs || [])
  const captureGaps = new Map(
    (plan.CaptureGaps || []).map(gap => [gap.output, gap])
  )
  const retained = plan.RetainedHistoricalEvidence || {}

  const ordered = []
  // Published frames come first, batch by batch in the plan's declared batch
  // order, so previous/next navigation walks the gallery the way the index
  // groups it.
  for (const batch of batchOrder) {
    for (const planEntry of plan.GalleryCapturePlan) {
      if (planEntry.batch === batch) {
        ordered.push(planEntry.file)
      }
    }
  }
  const historical = Array.from(files.keys())
    .filter(name => !planByFile.has(name))
    .sort()
  for (const name of historical) {
    ordered.push(name)
  }

  const entries = []
  for (const fileName of ordered) {
    const image = files.get(fileName)
    if (!image) {
      throw new Error(
        `${fileName} is in the capture plan but not in docs/assets/screenshots/`
      )
    }
    const planEntry = planByFile.get(fileName) || null
    const refreshGap = planEntry
      ? captureGaps.get(planEntry.output) || null
      : null
    const batch = planEntry ? plan.CaptureBatches[planEntry.batch] : null
    const row = wiki.rows.get(fileName) || null
    const embedded = wiki.images.get(fileName) || null
    const output = planEntry
      ? planEntry.output
      : fileName.replace(/\.png$/i, '')

    // The master asset table is "asset | guided workflow shown", so its second
    // cell is a caption. The two historical tables are
    // "archived asset | historical receipt | current status", where that cell
    // names a receipt rather than describing the frame. Treating those as
    // captions would put a date label under a screenshot as though it described
    // the picture, so they are kept as their own separate facts.
    const isHistoricalRow = Boolean(row) && row.cells.length > 1
    const caption = row && !isHistoricalRow ? row.cells[0] : ''
    const historicalReceiptLabel = isHistoricalRow ? row.cells[0] : ''
    const historicalStatus = isHistoricalRow
      ? row.cells[row.cells.length - 1]
      : ''
    const section = embedded ? embedded.section : row ? row.section : ''

    const altSource =
      embedded && embedded.alt ? 'wiki' : caption ? 'caption' : 'derived'
    const alt =
      altSource === 'wiki'
        ? embedded.alt
        : altSource === 'caption'
        ? `Desktop Material screenshot: ${caption}`
        : `Desktop Material screenshot ${fileName}${
            section ? `, filed under ${section}` : ''
          }. The Feature Gallery records no alt text and no caption describing this frame.`

    const facts = []
    facts.push(fact('Asset file', `docs/assets/screenshots/${fileName}`))
    facts.push(
      fact(
        'Pixel dimensions',
        `${groupDigits(image.width)} × ${groupDigits(
          image.height
        )} px, read from the PNG IHDR header`
      )
    )
    facts.push(fact('File size', `${groupDigits(image.bytes)} bytes on disk`))
    facts.push(
      fact(
        'PNG encoding',
        `${image.bitDepth}-bit ${image.colourTypeName} (IHDR colour type ${image.colourType})`
      )
    )
    facts.push(
      fact(
        'Gallery output id',
        planEntry
          ? planEntry.output
          : // The plan records no id for a retained frame, so say where this
            // page's own address came from rather than implying the plan named it.
            `${output} — derived from the file name for this page's address; the capture plan records no output id for this frame`
      )
    )
    facts.push(
      fact(
        'Scene',
        planEntry ? planEntry.scene : '',
        'Not recorded: this PNG has no entry in GalleryCapturePlan, so no scene id produces it. It is retained historical evidence, deliberately outside the current Windows gallery target.'
      )
    )
    facts.push(
      fact(
        'Capture batch',
        planEntry ? planEntry.batch : '',
        'Not recorded: no capture batch owns this PNG. Nothing in the current campaign regenerates it.'
      )
    )
    facts.push(
      fact(
        'Platform',
        planEntry ? planEntry.platform : '',
        'Not recorded in the capture plan. The wiki files this frame under retained historical evidence rather than the Windows target set.'
      )
    )
    facts.push(
      fact(
        'Feature Gallery section',
        section,
        'Not recorded: the Feature Gallery has no section that embeds or tabulates this file.'
      )
    )
    facts.push(
      fact(
        'Guided workflow caption',
        caption,
        historicalReceiptLabel
          ? `Not recorded: the Feature Gallery lists this file only in a historical evidence table (as "${historicalReceiptLabel}"), which names its acceptance run instead of describing the frame.`
          : 'Not recorded: no Feature Gallery asset table row describes the workflow this frame shows.'
      )
    )
    if (historicalReceiptLabel) {
      facts.push(fact('Historical receipt label', historicalReceiptLabel))
    }
    facts.push(
      fact(
        'Publication status',
        planEntry
          ? refreshGap
            ? `Published asset retained; current Windows refresh is blocked (${refreshGap.status})`
            : 'Published target in the current Windows guided gallery'
          : historicalStatus
          ? `Retained historical evidence — ${historicalStatus}`
          : '',
        'Not recorded: neither the capture plan nor the Feature Gallery states a publication status for this file.'
      )
    )
    if (refreshGap) {
      facts.push(
        fact(
          'Current refresh gap',
          `${refreshGap.status}: ${refreshGap.blocker} Required evidence: ${
            refreshGap.requiredEvidence
          } Exact batch commands: ${refreshGap.commands.join(' | ')}`
        )
      )
    }
    if (planEntry && deferredCanonical.has(planEntry.output)) {
      facts.push(
        fact(
          'Canonical deferral',
          `The plan lists ${planEntry.output} in DeferredCanonicalOutputs, so it is deferred out of the canonical batch and captured by ${planEntry.batch} instead.`
        )
      )
    }
    if (planEntry && deferredSpecialist.has(planEntry.output)) {
      facts.push(
        fact(
          'Specialist deferral',
          `The plan lists ${planEntry.output} in DeferredSpecialistOutputs.`
        )
      )
    }
    const retainedRecord = retained[fileName]
    if (retainedRecord) {
      facts.push(
        fact(
          'Retained acceptance date',
          retainedRecord.acceptedAt,
          'Not recorded in RetainedHistoricalEvidence.'
        )
      )
      facts.push(
        fact(
          'Pinned source commit',
          retainedRecord.sourceCommit,
          'Not recorded in RetainedHistoricalEvidence.'
        )
      )
      facts.push(
        fact(
          'Recorded SHA-256',
          retainedRecord.sha256,
          'Not recorded in RetainedHistoricalEvidence.'
        )
      )
    }

    const datedReceipts = receipts.dated.get(fileName) || []
    const undatedReceipts = receipts.undated.get(fileName) || []

    entries.push({
      output: output,
      file: fileName,
      page: `${output}.html`,
      image: image,
      plan: planEntry,
      batchKey: planEntry ? planEntry.batch : 'retained-historical',
      batch: batch,
      caption: caption,
      historicalReceiptLabel: historicalReceiptLabel,
      historicalStatus: historicalStatus,
      alt: alt,
      altSource: altSource,
      section: section,
      facts: facts,
      datedReceipts: datedReceipts,
      undatedReceipts: undatedReceipts,
      retained: retainedRecord || null,
      refreshGap: refreshGap,
      interaction: planEntry ? planEntry.interaction : '',
      fixture: batch ? batch.fixture : planEntry ? planEntry.fixture : '',
      privacyGate: batch
        ? batch.privacyGate
        : planEntry
        ? planEntry.privacyGate
        : '',
      commands: batch
        ? batch.commands || []
        : planEntry
        ? planEntry.commands || []
        : [],
    })
  }

  return entries
}

// ------------------------------------------------------------- page chrome

/**
 * The shared hub chrome, markup only. Every id and class matches
 * `docs/index.html` so `docs-screenshot-gallery.js`, `docs-color.js` and
 * `docs-color-picker.js` attach to these pages exactly as they attach to the
 * hub. No hub behaviour is copied here — this file emits containers, never
 * logic.
 */
/**
 * Embeds the gallery's records as inert JSON.
 *
 * A `<script type="application/json">` block needs no fetch, which matters
 * twice: Pages serves these files statically, and a reader opening one from
 * disk over `file://` has no origin to fetch from. `<` is escaped because a
 * caption containing `</script` would otherwise close the block early and spill
 * the rest of the payload into the document as markup.
 */
/**
 * The record shape `docs-screenshot-gallery.js` normalizes. Only the fields it
 * actually reads are forwarded — sending the whole internal entry would embed
 * the parsed plan object and the fact list on every one of ~93 pages for no
 * reader benefit.
 */
function galleryRecord(entry) {
  return {
    output: entry.output,
    file: entry.file,
    caption: entry.caption || null,
    altText: entry.alt || null,
    scene: entry.plan ? entry.plan.scene : null,
    batch: entry.batchKey || null,
    platform: entry.plan ? entry.plan.platform : null,
    section: entry.section || null,
    interaction: entry.interaction || null,
    width: entry.image ? entry.image.width : null,
    height: entry.image ? entry.image.height : null,
    bytes: entry.image ? entry.image.bytes : null,
    commands: entry.commands || [],
    datedReceipts: (entry.datedReceipts || []).map(receipt =>
      typeof receipt === 'string' ? receipt : receipt.path || String(receipt)
    ),
  }
}

function renderPayload(payload) {
  if (payload === undefined || payload === null) {
    return ''
  }
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  return [
    '    <script id="screenshot-data" type="application/json">',
    json,
    '    </script>',
  ].join('\n')
}

function renderShell(options) {
  const scripts = [
    '../assets/site/docs-color.js',
    '../assets/site/docs-color-picker.js',
    '../assets/site/docs-regex-job.js',
    '../assets/site/docs-screenshot-gallery.js',
    '../assets/site/docs-screenshot-strings.js',
    // Last: the controller reads the two modules above at start().
    '../assets/site/docs-screenshot-page.js',
  ]
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(options.description)}" />
    <meta name="color-scheme" content="light dark" />
    <link rel="stylesheet" href="../assets/site/docs-hub.css" />
    <link rel="stylesheet" href="../assets/site/docs-color-picker.css" />
    <!--
      The gallery module builds .dm-shot-* markup and ships the only stylesheet
      that constrains it. Without this the thumbnails render at their natural
      1440 px and the page scrolls sideways on every phone.
    -->
    <link rel="stylesheet" href="../assets/site/docs-screenshot-gallery.css" />
    <link rel="stylesheet" href="${PageStylesheet}" />
    <script>
      // Resolve the stored appearance and language before first paint so the
      // page never flashes the wrong palette, density or language mode. This is
      // the hub's own pre-paint contract, reading the same storage keys; all
      // behaviour still lives in the shared modules.
      ;(function () {
        var root = document.documentElement
        // data-js is deliberately NOT set here. docs-screenshot-page.js sets
        // it only after the gallery mounts, so the "JavaScript is off" note
        // cannot be hidden above controls that are in fact inert.
        try {
          var theme = localStorage.getItem('dm-docs-theme')
          if (theme === 'light' || theme === 'dark') {
            root.setAttribute('data-theme', theme)
          }
          var lang = localStorage.getItem('dm-docs-lang')
          if (lang === 'en' || lang === 'yue' || lang === 'bi') {
            root.setAttribute('data-lang', lang)
          }
          var density = localStorage.getItem('dm-docs-density')
          if (density === 'compact') {
            root.setAttribute('data-density', density)
          }
          var accent = localStorage.getItem('dm-docs-accent')
          if (accent === 'teal' || accent === 'amber' || accent === 'rose') {
            root.setAttribute('data-accent', accent)
          }
        } catch (error) {
          /* Storage may be unavailable; the defaults are already correct. */
        }
      })()
    </script>
  </head>
  <body data-page="screenshot-docs">
    <a class="skip-link" href="#main" data-i18n="skipLink"
      >Skip to main content</a
    >

    <header class="app-bar">
      <a class="app-bar__brand" href="../index.html">
        <span class="app-bar__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M12 2 2 7v10l10 5 10-5V7Zm0 2.3 7.2 3.6-7.2 3.6-7.2-3.6Zm-8 5.4 7 3.5v5.2l-7-3.5Zm16 0v5.2l-7 3.5v-5.2Z"
            />
          </svg>
        </span>
        <span class="app-bar__titles">
          <span class="app-bar__title">Desktop Material</span>
          <span class="app-bar__subtitle">Screenshot documentation</span>
        </span>
      </a>

      <div class="app-bar__actions">
        <button
          type="button"
          id="theme-toggle"
          class="btn btn--icon"
          aria-pressed="false"
          title="Switch between the light and dark theme"
          aria-label="Switch between the light and dark theme"
          data-i18n-attr="aria-label=themeToggle;title=themeToggle"
        >
          <svg class="icon-dark" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5 2 3h-4Zm0 20-2-3h4ZM2 12l3-2v4Zm20 0-3 2v-4ZM5 5l3.5.9-2.6 2.6ZM19 19l-3.5-.9 2.6-2.6ZM19 5l-.9 3.5-2.6-2.6ZM5 19l.9-3.5 2.6 2.6Z"
            />
          </svg>
          <svg class="icon-light" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />
          </svg>
        </button>
        <button
          type="button"
          id="prefs-toggle"
          class="btn btn--icon"
          aria-expanded="false"
          aria-controls="prefs"
          title="Appearance and language preferences"
          aria-label="Appearance and language preferences"
          data-i18n-attr="aria-label=prefsToggle;title=prefsToggle"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 7h10a3 3 0 0 1 5.8 0H21v2h-2.2a3 3 0 0 1-5.8 0H3Zm0 8h5.2a3 3 0 0 1 5.8 0h7v2h-7a3 3 0 0 1-5.8 0H3Z"
            />
          </svg>
        </button>
      </div>
    </header>

    <nav class="tabs" id="tabs" aria-label="Screenshot documentation sections">
      <a class="tab" href="index.html"${
        options.isIndex ? ' aria-current="page"' : ''
      }>Screenshot index</a>
      <a class="tab" href="../index.html#features">Documentation hub</a>
      <a class="tab" href="../wiki/Feature-Gallery.html">Feature Gallery</a>
    </nav>

    <p class="nojs-note">
      <span
        >JavaScript is off, so the preference controls and the screenshot search
        are inactive. Every screenshot, every recorded fact and every link on
        this page still works.</span
      >
      <span lang="zh-HK"
        >而家冇 JavaScript，所以設定同搜尋唔會運作。相片、記錄同連結全部照樣睇得到。</span
      >
    </p>

    <!--
      Preference controls. Same ids, names and classes as the hub, so the shared
      modules bind language mode, both playfulness sliders, theme, density and
      accent without this page shipping a line of that logic.
    -->
    <section id="prefs" class="prefs" hidden aria-label="Preferences">
      <div class="prefs__inner">
        <fieldset>
          <legend data-i18n="prefLang">Language mode</legend>
          <label class="checkbox">
            <input type="radio" name="lang" value="en" />
            <span>English</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="lang" value="yue" />
            <span lang="zh-HK">廣東話</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="lang" value="bi" />
            <span class="i18n-inline" data-i18n="langBi">Bilingual</span>
          </label>
        </fieldset>

        <fieldset>
          <legend data-i18n="prefFunEn">Playfulness — English</legend>
          <div class="slider-row">
            <input
              type="range"
              id="fun-en"
              min="1"
              max="5"
              step="1"
              value="3"
              aria-label="Playfulness — English"
              data-i18n-attr="aria-label=prefFunEn"
            />
            <output id="fun-en-value" for="fun-en">3</output>
          </div>
        </fieldset>

        <fieldset>
          <legend data-i18n="prefFunYue">Playfulness — 廣東話</legend>
          <div class="slider-row">
            <input
              type="range"
              id="fun-yue"
              min="1"
              max="5"
              step="1"
              value="3"
              aria-label="Playfulness — 廣東話"
              data-i18n-attr="aria-label=prefFunYue"
            />
            <output id="fun-yue-value" for="fun-yue">3</output>
          </div>
        </fieldset>

        <fieldset>
          <legend data-i18n="prefTheme">Theme</legend>
          <label class="checkbox">
            <input type="radio" name="theme" value="system" />
            <span class="i18n-inline" data-i18n="themeSystem">System</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="theme" value="light" />
            <span class="i18n-inline" data-i18n="themeLight">Light</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="theme" value="dark" />
            <span class="i18n-inline" data-i18n="themeDark">Dark</span>
          </label>
        </fieldset>

        <fieldset>
          <legend data-i18n="prefDensity">Density</legend>
          <label class="checkbox">
            <input type="radio" name="density" value="comfortable" />
            <span class="i18n-inline" data-i18n="densityComfortable"
              >Comfortable</span
            >
          </label>
          <label class="checkbox">
            <input type="radio" name="density" value="compact" />
            <span class="i18n-inline" data-i18n="densityCompact">Compact</span>
          </label>
        </fieldset>

        <fieldset>
          <legend data-i18n="prefAccent">Accent colour</legend>
          <label class="checkbox">
            <input type="radio" name="accent" value="violet" />
            <span class="i18n-inline" data-i18n="accentViolet">Violet</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="accent" value="teal" />
            <span class="i18n-inline" data-i18n="accentTeal">Teal</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="accent" value="amber" />
            <span class="i18n-inline" data-i18n="accentAmber">Amber</span>
          </label>
          <label class="checkbox">
            <input type="radio" name="accent" value="rose" />
            <span class="i18n-inline" data-i18n="accentRose">Rose</span>
          </label>
        </fieldset>

        <p class="md-body">
          Preferences are stored in this browser only and apply to every
          documentation page.
        </p>
      </div>
    </section>

    <!--
      Search dock. The field, mode button, builder toggle, status line and
      results list keep the hub's ids so the gallery module can own them. The
      builder container is intentionally empty markup: the shared module builds
      the full regex builder inside it, and the fallback paragraph below is what
      a reader sees if that module has not loaded.
    -->
    <div class="dock" role="search" aria-label="Screenshot search">
      <div class="dock__inner">
        <div class="search-bar">
          <div class="search-bar__field">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"
              />
            </svg>
            <label class="visually-hidden" for="search-input"
              >Search the screenshot documentation</label
            >
            <input
              id="search-input"
              type="search"
              autocomplete="off"
              spellcheck="false"
              maxlength="512"
              aria-invalid="false"
              aria-describedby="search-mode-hint"
              placeholder="Search captions, scenes and batches"
            />
          </div>
          <div class="search-bar__tools">
            <button
              type="button"
              id="search-mode"
              class="btn btn--outlined btn--small"
              aria-pressed="false"
            >
              <span class="i18n-inline" data-i18n="searchModeRegex"
                >Regular expression</span
              >
            </button>
            <button
              type="button"
              id="builder-toggle"
              class="btn btn--tonal btn--small"
              aria-expanded="false"
              aria-controls="regex-builder"
            >
              <span class="i18n-inline" data-i18n="searchBuilderShow"
                >Open regex builder</span
              >
            </button>
            <button
              type="button"
              id="search-clear"
              class="btn btn--text btn--small"
            >
              <span class="i18n-inline" data-i18n="searchClear">Clear</span>
            </button>
          </div>
        </div>

        <p id="search-mode-hint" class="search-note">
          Plain-text search is the default. Turn on
          <strong>Regular expression</strong> to search with a pattern, or open
          the regex builder to construct one.
        </p>

        <div
          id="regex-builder"
          class="builder panel"
          hidden
          data-regex-builder="screenshot-gallery"
        >
          <p class="md-body" data-builder-fallback>
            The regex builder is supplied by the shared gallery module. If it has
            not loaded, the documentation hub's builder is available on the
            <a href="../index.html#search">hub search tab</a>.
          </p>
        </div>

        <p id="search-status" class="search-status" role="status" aria-live="polite"></p>
        <!--
          docs-screenshot-gallery.js builds its own search field, mode
          controls, regex-builder panel, filters and grid inside this
          container. It is empty in source on purpose: emitting the hub\u2019s
          control ids here produced widgets with no controller attached.
        -->
        <div id="screenshot-gallery"></div>
      </div>
    </div>

    <main id="main" tabindex="-1">
${options.main}
    </main>
${renderPayload(options.payload)}

    <footer class="site-footer">
      <div class="site-footer__inner">
        <p class="md-body">
          Every fact on this page is generated from
          <code>.codex/verification/gallery_capture_plan.js</code>,
          <code>docs/wiki/Feature-Gallery.md</code>, the PNG headers in
          <code>docs/assets/screenshots/</code> and the receipts in
          <code>docs/verification/</code> by
          <code>script/generate-screenshot-docs.mjs</code>. Edit those sources,
          not this file.
        </p>
      </div>
    </footer>

    <div id="toasts" class="toasts" role="region" aria-label="Notifications"></div>

${scripts.map(source => `    <script src="${source}"></script>`).join('\n')}
  </body>
</html>
`
}

// -------------------------------------------------------------- page bodies

function renderFactList(facts) {
  const rows = facts
    .map(item => {
      const className = item.available
        ? 'shot-facts__value'
        : 'shot-facts__value shot-facts__value--unavailable'
      return `        <dt class="shot-facts__key">${escapeHtml(item.label)}</dt>
        <dd class="${className}">${escapeHtml(item.text)}</dd>`
    })
    .join('\n')
  return `      <dl class="shot-facts">
${rows}
      </dl>`
}

function renderProse(heading, value, unavailableText) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed === '') {
    return {
      html: `      <section class="panel shot-panel">
        <h2 class="md-title">${escapeHtml(heading)}</h2>
        <p class="md-body shot-unavailable">${escapeHtml(unavailableText)}</p>
      </section>`,
      available: false,
    }
  }
  return {
    html: `      <section class="panel shot-panel">
        <h2 class="md-title">${escapeHtml(heading)}</h2>
        <p class="md-body">${escapeHtml(trimmed)}</p>
      </section>`,
    available: true,
  }
}

function renderCommands(commands) {
  if (!commands || commands.length === 0) {
    return {
      html: `      <section class="panel shot-panel">
        <h2 class="md-title">Regenerating this capture</h2>
        <p class="md-body shot-unavailable">
          No commands are recorded. The capture plan owns no batch for this
          frame, so this repository does not describe a way to reproduce it.
        </p>
      </section>`,
      available: false,
    }
  }
  const blocks = commands
    .map((command, index) => {
      return `        <li>
          <div class="code">
            <div class="code__bar">
              <span>Step ${index + 1} of ${commands.length}</span>
            </div>
            <pre><code>${escapeHtml(command)}</code></pre>
          </div>
        </li>`
    })
    .join('\n')
  return {
    html: `      <section class="panel shot-panel">
        <h2 class="md-title">Regenerating this capture</h2>
        <p class="md-body">
          Run these commands in order, exactly as the capture batch records
          them. Placeholders in angle brackets are the verifier's own run root,
          fixture path and CDP port.
        </p>
        <ol class="shot-commands">
${blocks}
        </ol>
      </section>`,
    available: true,
  }
}

function renderReceipts(entry) {
  const parts = []
  let available = false

  if (entry.datedReceipts.length > 0) {
    available = true
    const items = entry.datedReceipts
      .map(receipt => {
        return `          <li>
            <a href="${escapeHtml(RepositoryBlobBase + receipt)}"
              ><code>${escapeHtml(receipt)}</code></a
            >
          </li>`
      })
      .join('\n')
    parts.push(`        <p class="md-body">
          ${
            entry.datedReceipts.length === 1
              ? 'One dated acceptance receipt names'
              : `${entry.datedReceipts.length} dated acceptance receipts name`
          }
          this exact PNG:
        </p>
        <ul class="shot-links">
${items}
        </ul>`)
  } else {
    parts.push(`        <p class="md-body shot-unavailable">
          No dated receipt under <code>docs/verification/</code> names
          <code>${escapeHtml(entry.file)}</code>. The frame is published without
          its own dated acceptance document; the build, interaction and privacy
          evidence for its batch is recorded in <code>HANDOFF.md</code> and in
          the Feature Gallery's refresh notes instead.
        </p>`)
  }

  if (entry.undatedReceipts.length > 0) {
    const items = entry.undatedReceipts
      .map(receipt => {
        return `          <li>
            <a href="${escapeHtml(RepositoryBlobBase + receipt)}"
              ><code>${escapeHtml(receipt)}</code></a
            >
          </li>`
      })
      .join('\n')
    parts.push(`        <p class="md-body">
          Undated verification documents that also name this file (indexes and
          ledgers, not dated acceptance evidence):
        </p>
        <ul class="shot-links">
${items}
        </ul>`)
  }

  if (entry.retained) {
    parts.push(`        <p class="md-body">
          The capture plan pins this retained frame to source commit
          <code>${escapeHtml(entry.retained.sourceCommit)}</code> with SHA-256
          <code>${escapeHtml(entry.retained.sha256)}</code>, accepted
          ${escapeHtml(entry.retained.acceptedAt)} in
          <a href="${escapeHtml(RepositoryBlobBase + entry.retained.document)}"
            ><code>${escapeHtml(entry.retained.document)}</code></a
          >.
        </p>`)
    available = true
  }

  return {
    html: `      <section class="panel shot-panel">
        <h2 class="md-title">Dated acceptance receipt</h2>
${parts.join('\n')}
      </section>`,
    available: available,
  }
}

function renderAltNote(entry) {
  if (entry.altSource === 'wiki') {
    return `        <p class="md-body">
          The alternative text above is the Feature Gallery's own Markdown alt
          text for this frame, so the image describes itself identically in the
          wiki and here.
        </p>`
  }
  if (entry.altSource === 'caption') {
    return `        <p class="md-body shot-unavailable">
          The Feature Gallery embeds no Markdown image for this frame, so it
          records no alt text. The alternative text above is derived from the
          asset table caption instead, and is marked as such rather than
          presented as the wiki's own wording.
        </p>`
  }
  return `        <p class="md-body shot-unavailable">
          The Feature Gallery records neither Markdown alt text nor a workflow
          caption for this frame — its historical table names the acceptance run
          instead — so the alternative text above only names the file and the
          section it is filed under. Nothing in this repository describes what
          the image itself shows.
        </p>`
}

function renderNav(previous, next) {
  const previousLink = previous
    ? `        <a class="shot-nav__link" rel="prev" href="${escapeHtml(
        previous.page
      )}">
          <span class="shot-nav__label">Previous frame</span>
          <span class="shot-nav__title">${escapeHtml(
            entryLabel(previous)
          )}</span>
        </a>`
    : `        <p class="shot-nav__link shot-nav__link--none">
          <span class="shot-nav__label">Previous frame</span>
          <span class="shot-nav__title">This is the first frame in the gallery order.</span>
        </p>`
  const nextLink = next
    ? `        <a class="shot-nav__link shot-nav__link--next" rel="next" href="${escapeHtml(
        next.page
      )}">
          <span class="shot-nav__label">Next frame</span>
          <span class="shot-nav__title">${escapeHtml(entryLabel(next))}</span>
        </a>`
    : `        <p class="shot-nav__link shot-nav__link--next shot-nav__link--none">
          <span class="shot-nav__label">Next frame</span>
          <span class="shot-nav__title">This is the last frame in the gallery order.</span>
        </p>`
  return `      <nav class="shot-nav" aria-label="Screenshot documentation navigation">
${previousLink}
        <a class="shot-nav__link shot-nav__link--index" href="index.html">
          <span class="shot-nav__label">Index</span>
          <span class="shot-nav__title">All screenshot pages</span>
        </a>
${nextLink}
      </nav>`
}

/**
 * A frame's own short name for headings and navigation. Captioned frames use
 * their caption; a retained frame the wiki never captioned uses its file name,
 * because its historical table cell names an acceptance run and would read as a
 * description of the picture if it were promoted to a heading.
 */
function entryLabel(entry) {
  return entry.caption || entry.file
}

/** What sits under the frame: the wiki's caption, or why there is none. */
function figureCaption(entry) {
  if (entry.caption) {
    return entry.caption
  }
  if (entry.historicalReceiptLabel) {
    return `${
      entry.file
    } — the Feature Gallery lists this file only as historical evidence ("${
      entry.historicalReceiptLabel
    }", ${
      entry.historicalStatus || 'no status recorded'
    }) and records no caption describing the frame.`
  }
  return `${entry.file} — the Feature Gallery records no caption for this frame.`
}

/**
 * Text the shared gallery module can filter on without fetching anything: the
 * page carries its own searchable words as a data attribute.
 */
function searchTextFor(entry) {
  return [
    entry.output,
    entry.file,
    entry.caption,
    entry.historicalReceiptLabel,
    entry.batchKey,
    entry.plan ? entry.plan.scene : '',
    entry.section,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The Feature Gallery link must describe what the gallery actually holds for
 * this frame. Saying "where this frame is captioned" on a page that states, in
 * three other places, that the gallery records no caption would contradict the
 * page's own facts.
 */
function galleryLinkLabel(entry) {
  if (entry.caption) {
    return 'Feature Gallery, where this frame is captioned'
  }
  if (entry.historicalReceiptLabel) {
    return 'Feature Gallery, where this frame is listed as historical evidence rather than captioned'
  }
  if (entry.section) {
    return `Feature Gallery, which files this frame under ${entry.section} without captioning it`
  }
  return 'Feature Gallery, which records no caption for this frame'
}

/**
 * Likewise for the capture plan: it declares the 86 published outputs, records
 * a handful of frames only as retained historical evidence, and says nothing
 * whatsoever about the rest. Labelling all three cases "declares this frame"
 * would invent a declaration the file does not contain.
 */
function capturePlanLinkLabel(entry) {
  if (entry.plan) {
    return 'Capture plan that declares this frame'
  }
  if (entry.retained) {
    return 'Capture plan, which records this frame only as retained historical evidence'
  }
  return 'Capture plan, which does not mention this frame'
}

function renderPage(entry, previous, next, position, total, allEntries) {
  const heading = entryLabel(entry)
  const summary = `${entry.image.width} × ${
    entry.image.height
  } px · ${groupDigits(entry.image.bytes)} bytes · ${
    entry.plan ? `batch ${entry.batchKey}` : 'no capture batch'
  }`
  const interaction = renderProse(
    'The interaction the harness performs',
    entry.interaction,
    'No interaction is recorded. This PNG has no capture-plan entry, so nothing in the current harness drives the state it shows.'
  )
  const fixture = renderProse(
    'Fixture the capture batch requires',
    entry.fixture,
    'No fixture is recorded, because no capture batch owns this frame.'
  )
  const privacy = renderProse(
    'Privacy gate the capture must pass',
    entry.privacyGate,
    'No privacy gate is recorded, because no capture batch owns this frame. Its original acceptance evidence is the only privacy record.'
  )
  const commands = renderCommands(entry.commands)
  const receipts = renderReceipts(entry)

  const unavailable =
    entry.facts.filter(item => !item.available).length +
    (interaction.available ? 0 : 1) +
    (fixture.available ? 0 : 1) +
    (privacy.available ? 0 : 1) +
    (commands.available ? 0 : 1) +
    (receipts.available ? 0 : 1)

  const searchText = searchTextFor(entry)

  const main = `      <article
        class="section shot-page"
        data-screenshot-output="${escapeHtml(entry.output)}"
        data-screenshot-file="${escapeHtml(entry.file)}"
        data-screenshot-batch="${escapeHtml(entry.batchKey)}"
        data-screenshot-scene="${escapeHtml(
          entry.plan ? entry.plan.scene : ''
        )}"
        data-screenshot-search="${escapeHtml(searchText)}"
      >
        <div class="section__head">
          <p class="eyebrow">Frame ${position} of ${total} · ${escapeHtml(
    entry.batchKey
  )}</p>
          <h1 class="md-headline">${escapeHtml(heading)}</h1>
          <p class="md-body">${escapeHtml(summary)}</p>
          <p class="md-body" lang="zh-HK">
            呢一頁只講一張相：邊個 scene 出，邊個 batch 收，尺寸、指令、憑證全部照抄記錄，冇記錄就照直講冇。
          </p>
        </div>

        <figure class="shot-figure">
          <img
            src="../assets/screenshots/${escapeHtml(entry.file)}"
            width="${entry.image.width}"
            height="${entry.image.height}"
            alt="${escapeHtml(entry.alt)}"
            decoding="async"
          />
          <figcaption class="${
            entry.caption ? 'md-body' : 'md-body shot-unavailable'
          }">
            ${escapeHtml(figureCaption(entry))}
          </figcaption>
        </figure>

        <section class="panel shot-panel">
          <h2 class="md-title">What the sources record</h2>
${renderFactList(entry.facts)}
        </section>

        <section class="panel shot-panel">
          <h2 class="md-title">Alternative text</h2>
          <p class="md-body"><q>${escapeHtml(entry.alt)}</q></p>
${renderAltNote(entry)}
        </section>

${interaction.html}

${fixture.html}

${privacy.html}

${commands.html}

${receipts.html}

        <section class="panel shot-panel">
          <h2 class="md-title">Where else this frame appears</h2>
          <ul class="shot-links">
            <li>
              <a href="../assets/screenshots/${escapeHtml(entry.file)}"
                >Open the PNG on its own</a
              >
            </li>
            <li>
              <a href="../wiki/Feature-Gallery.html"
                >${escapeHtml(galleryLinkLabel(entry))}</a
              >
            </li>
            <li>
              <a
                href="${escapeHtml(
                  RepositoryBlobBase + 'docs/wiki/Feature-Gallery.md'
                )}"
                >Feature Gallery Markdown source</a
              >
            </li>
            <li>
              <a
                href="${escapeHtml(
                  RepositoryBlobBase +
                    '.codex/verification/gallery_capture_plan.js'
                )}"
                >${escapeHtml(capturePlanLinkLabel(entry))}</a
              >
            </li>
          </ul>
        </section>

${renderNav(previous, next)}
      </article>`

  const description = entry.caption
    ? `${entry.caption} — recorded scene, capture batch, fixture, privacy gate, exact dimensions and regeneration commands for ${entry.file}.`
    : `Recorded scene, capture batch, dimensions and provenance for the Desktop Material screenshot ${entry.file}.`

  return {
    html: renderShell({
      title: `${heading} · Desktop Material screenshots`,
      description: description,
      main: main,
      // `items` carries the whole set so the gallery can resolve prev/next
      // itself; `item` names which frame this page documents.
      payload: {
        single: true,
        imageBase: '../assets/screenshots/',
        item: galleryRecord(entry),
        items: allEntries.map(galleryRecord),
      },
    }),
    unavailable: unavailable,
  }
}

function renderIndex(entries, groups, stats) {
  const groupSections = groups
    .map(group => {
      const cards = group.entries
        .map(entry => {
          const captionText = figureCaption(entry)
          return `            <li class="shot-card">
              <a
                class="card shot-card__link"
                href="${escapeHtml(entry.page)}"
                data-screenshot-output="${escapeHtml(entry.output)}"
                data-screenshot-file="${escapeHtml(entry.file)}"
                data-screenshot-batch="${escapeHtml(entry.batchKey)}"
                data-screenshot-scene="${escapeHtml(
                  entry.plan ? entry.plan.scene : ''
                )}"
                data-screenshot-search="${escapeHtml(searchTextFor(entry))}"
              >
                <img
                  class="shot-card__thumb"
                  src="../assets/screenshots/${escapeHtml(entry.file)}"
                  width="${entry.image.width}"
                  height="${entry.image.height}"
                  alt="${escapeHtml(entry.alt)}"
                  loading="lazy"
                  decoding="async"
                />
                <span class="card__kicker md-label"
                  >${escapeHtml(
                    entry.plan ? entry.plan.scene : 'no scene recorded'
                  )}</span
                >
                <span class="card__title">${escapeHtml(captionText)}</span>
                <span class="card__meta"
                  >${escapeHtml(entry.file)} · ${entry.image.width}×${
            entry.image.height
          } px ·
                  ${groupDigits(entry.image.bytes)} bytes</span
                >
              </a>
            </li>`
        })
        .join('\n')
      return `        <section class="shot-group">
          <h3 class="md-title-lg" id="batch-${escapeHtml(group.key)}">
            ${escapeHtml(group.key)}
          </h3>
          <p class="md-body">${escapeHtml(group.description)}</p>
          <p class="md-body">
            <strong>${group.entries.length}</strong>
            ${group.entries.length === 1 ? 'screenshot' : 'screenshots'} in this
            ${group.isBatch ? 'capture batch' : 'group'}.
          </p>
          <ul class="card-grid shot-grid">
${cards}
          </ul>
        </section>`
    })
    .join('\n')

  const batchIndex = groups
    .map(group => {
      return `            <li>
              <a href="#batch-${escapeHtml(group.key)}"
                ><code>${escapeHtml(group.key)}</code> — ${
        group.entries.length
      }</a
              >
            </li>`
    })
    .join('\n')

  const main = `      <section class="section">
        <div class="section__head">
          <p class="eyebrow">Screenshot documentation</p>
          <h1 class="md-headline">Every gallery screenshot, one page each</h1>
          <p class="md-body">
            The guided gallery is an acceptance record, not a poster wall. Each
            frame below has its own page stating which scene produced it, which
            capture batch owns it, the fixture and privacy gate that batch
            requires, the exact commands that regenerate it, and its real pixel
            dimensions and byte size read from the PNG header. Where a source
            records nothing, the page says so instead of guessing.
          </p>
          <p class="md-body" lang="zh-HK">
            每張相自己一頁：邊個 scene、邊個 batch、要咩 fixture、過咩 privacy
            gate、點樣重新拍一次，尺寸同大細都係直接讀 PNG header。冇記錄嘅就寫明冇，唔會亂寫。
          </p>
        </div>

        <section class="panel shot-panel">
          <h2 class="md-title">Counts</h2>
          <dl class="shot-facts">
            <dt class="shot-facts__key">Pages generated</dt>
            <dd class="shot-facts__value">${
              stats.pages
            }, one per PNG in <code>docs/assets/screenshots/</code></dd>
            <dt class="shot-facts__key">Published gallery outputs</dt>
            <dd class="shot-facts__value">${
              stats.published
            }, every entry in <code>GalleryCapturePlan</code></dd>
            <dt class="shot-facts__key">Current Windows refresh gaps</dt>
            <dd class="shot-facts__value">${
              stats.refreshGaps
            }, each marked <code>blocked</code> in <code>CaptureGaps</code> rather than reported as freshly recaptured</dd>
            <dt class="shot-facts__key">Retained historical frames</dt>
            <dd class="shot-facts__value">${
              stats.historical
            }, on disk with no capture-plan entry</dd>
            <dt class="shot-facts__key">Capture batches</dt>
            <dd class="shot-facts__value">${
              stats.batches
            }, all declared by the capture plan</dd>
            <dt class="shot-facts__key">Frames with a dated receipt</dt>
            <dd class="shot-facts__value">${stats.withDatedReceipt} of ${
    stats.pages
  }; ${
    stats.withoutDatedReceipt
  } have no dated document under <code>docs/verification/</code> naming them</dd>
            <dt class="shot-facts__key">Frames with the wiki's own alt text</dt>
            <dd class="shot-facts__value">${stats.altFromWiki} of ${
    stats.pages
  }; ${stats.altFromCaption} fall back to their asset-table caption and ${
    stats.altDerived
  } to their file name and section, because the Feature Gallery embeds no image for them</dd>
            <dt class="shot-facts__key">Fields reported as unavailable</dt>
            <dd class="shot-facts__value">${
              stats.unavailableFields
            } across all pages, each stated in words on the page that lacks it</dd>
          </dl>
          ${
            stats.deferredWithoutFile.length > 0
              ? `<p class="md-body">
            Declared but not rendered: ${stats.deferredWithoutFile
              .map(output => `<code>${escapeHtml(output)}</code>`)
              .join(', ')}
            ${stats.deferredWithoutFile.length === 1 ? 'appears' : 'appear'} in
            <code>DeferredCanonicalOutputs</code> with no capture-plan entry and
            no PNG on disk, so no page exists for
            ${stats.deferredWithoutFile.length === 1 ? 'it' : 'them'}.
          </p>`
              : ''
          }
        </section>

        <section class="panel shot-panel">
          <h2 class="md-title">Jump to a capture batch</h2>
          <ul class="shot-links shot-links--columns">
${batchIndex}
          </ul>
        </section>

${groupSections}
      </section>`

  return renderShell({
    isIndex: true,
    payload: {
      single: false,
      imageBase: '../assets/screenshots/',
      items: entries.map(galleryRecord),
    },
    title: 'Screenshot documentation · Desktop Material',
    description: `One documentation page per Desktop Material gallery screenshot: ${stats.pages} frames across ${stats.batches} capture batches, with recorded scene, fixture, privacy gate, regeneration commands, dimensions and receipts.`,
    main: main,
  })
}

// ------------------------------------------------------------------- styles

/**
 * Page-local layout only. Colour, type, shape and elevation all come from the
 * hub's M3 tokens, so a theme, density or accent change in the shared
 * preference panel restyles these pages too. Mobile-first: single column from
 * 320 px, 44 px minimum interactive height, no horizontal page scroll, and both
 * reduced-motion and forced-colors honoured.
 */
function renderStylesheet() {
  return `/*
 * Desktop Material — screenshot documentation pages.
 *
 * Generated by script/generate-screenshot-docs.mjs. Layout only: every colour,
 * radius, font and elevation is a Material Design 3 token owned by
 * docs-hub.css, so the shared preference controls restyle these pages without
 * this file knowing anything about theming.
 */

/* ------------------------------------------------------ mobile-first guards */

/*
 * These pages are made of file paths: the footer names the generator and its
 * four sources, the fact tables name every asset, and the regeneration lists
 * quote whole commands. An inline \`code\` run offers a line breaker no break
 * opportunity, so \`.codex/verification/gallery_capture_plan.js\` measured
 * 363 px and pushed the document 59 px sideways at a 320 px viewport — the
 * whole page scrolled horizontally, not just the code. Scoped to this page
 * type by its body attribute, so the hub's own code spans are untouched.
 */
[data-page='screenshot-docs'] code {
  overflow-wrap: anywhere;
}

/*
 * The hub's dock and app-bar controls are 36 px (\`.btn--small\`) and 40 px
 * (\`.btn--icon\`, the search field) tall, which is below the 44 px minimum
 * touch target. Restored here rather than in the shared stylesheet, because
 * only these pages are being held to it.
 */
[data-page='screenshot-docs'] .btn--icon,
[data-page='screenshot-docs'] .btn--small,
[data-page='screenshot-docs'] .search-bar__field input {
  min-height: 44px;
}

[data-page='screenshot-docs'] .btn--icon {
  min-width: 44px;
}

/*
 * The hub's tab strip is one document with panels, so its JavaScript marks the
 * current tab \`aria-selected\`. These are separate documents whose strip is a
 * plain link list, so the index marks its own tab \`aria-current="page"\` — and
 * needs the matching visual state, because the hub's rule only ever looks at
 * \`aria-selected\`.
 */
[data-page='screenshot-docs'] .tab[aria-current='page'] {
  color: var(--md-primary);
  border-bottom-color: var(--md-primary);
}

@media (forced-colors: active) {
  [data-page='screenshot-docs'] .tab[aria-current='page'] {
    border: 2px solid Highlight;
  }
}

.shot-page {
  max-width: 74rem;
}

/* --------------------------------------------------------- the frame itself */

.shot-figure {
  margin: 0 0 1rem;
  padding: 0.75rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-lowest);
}

.shot-figure img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container);
}

.shot-figure figcaption {
  margin: 0.75rem 0 0;
  color: var(--md-on-surface-variant);
}

/* -------------------------------------------------------------- fact tables */

.shot-panel + .shot-panel,
.shot-panel + .shot-nav {
  margin-top: 1rem;
}

.shot-panel > h2 {
  margin: 0 0 0.75rem;
}

.shot-facts {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
}

.shot-facts__key {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--md-on-surface-variant);
}

.shot-facts__value {
  margin: 0 0 0.75rem;
  overflow-wrap: anywhere;
}

.shot-facts__value--unavailable,
.shot-unavailable {
  color: var(--md-on-surface-variant);
  font-style: italic;
}

/* A missing datum is information, so it is marked, not hidden. */
.shot-facts__value--unavailable::before,
.shot-unavailable::before {
  content: '⚠ ';
  font-style: normal;
}

@media (min-width: 48rem) {
  .shot-facts {
    grid-template-columns: minmax(10rem, 16rem) 1fr;
    align-items: baseline;
  }

  .shot-facts__key {
    text-align: end;
  }
}

/* ------------------------------------------------------------ command lists */

.shot-commands {
  margin: 0;
  padding-left: 1.25rem;
}

.shot-commands > li + li {
  margin-top: 0.75rem;
}

.shot-commands code {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

/* -------------------------------------------------------------------- links */

.shot-links {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.shot-links li {
  margin: 0;
}

.shot-links a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.25rem 0;
  color: var(--md-primary);
  overflow-wrap: anywhere;
}

@media (min-width: 48rem) {
  .shot-links--columns {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
    gap: 0 1rem;
  }
}

/* ------------------------------------------------------------- index groups */

.shot-group {
  margin-top: 2rem;
}

.shot-group > h3 {
  margin: 0 0 0.35rem;
  overflow-wrap: anywhere;
}

.shot-grid {
  margin-top: 1rem;
}

.shot-card {
  display: flex;
}

.shot-card__link {
  width: 100%;
  padding-top: 0.75rem;
}

.shot-card__thumb {
  display: block;
  width: 100%;
  height: auto;
  margin-bottom: 0.6rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container);
}

/* ---------------------------------------------------------------- prev/next */

.shot-nav {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.shot-nav__link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-height: 44px;
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container-low);
  color: inherit;
  text-decoration: none;
}

a.shot-nav__link:hover {
  background: var(--md-surface-container);
}

.shot-nav__link--none {
  color: var(--md-on-surface-variant);
  font-style: italic;
}

.shot-nav__label {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--md-on-surface-variant);
}

.shot-nav__title {
  overflow-wrap: anywhere;
}

@media (min-width: 48rem) {
  .shot-nav {
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
  }

  .shot-nav__link--next {
    text-align: end;
  }
}

/* ------------------------------------------------------------ environments */

@media (prefers-reduced-motion: reduce) {
  .shot-card__link,
  .shot-nav__link {
    transition: none;
  }
}

@media (forced-colors: active) {
  .shot-figure,
  .shot-card__thumb,
  .shot-nav__link {
    border: 1px solid CanvasText;
  }

  .shot-facts__value--unavailable,
  .shot-unavailable {
    color: CanvasText;
  }
}
`
}

// ----------------------------------------------------------------- file write

/**
 * Format with the repository's own Prettier configuration and write with LF
 * endings. Two reasons: `yarn prettier` lints every `.html` and `.css` in the
 * tree, and Prettier's output is a fixed point, so regenerating an unchanged
 * gallery rewrites byte-identical files.
 */
function writeFormatted(absolutePath, source) {
  const options = prettier.resolveConfig.sync(absolutePath) || {}
  const formatted = prettier.format(source, {
    ...options,
    filepath: absolutePath,
    endOfLine: 'lf',
  })
  fs.writeFileSync(absolutePath, formatted, 'utf8')
}

// ---------------------------------------------------------------------- main

function main() {
  const plan = require(PlanPath)
  const wiki = readGalleryWiki()
  const files = readScreenshotFiles()
  const receipts = readReceipts(Array.from(files.keys()))
  const entries = buildEntries(plan, wiki, files, receipts)

  const byKey = new Map()
  for (const entry of entries) {
    if (!byKey.has(entry.batchKey)) {
      byKey.set(entry.batchKey, [])
    }
    byKey.get(entry.batchKey).push(entry)
  }

  const groups = []
  for (const key of Object.keys(plan.CaptureBatches)) {
    const groupEntries = byKey.get(key) || []
    if (groupEntries.length === 0) {
      continue
    }
    const batch = plan.CaptureBatches[key]
    groups.push({
      key: key,
      isBatch: true,
      description: `Captured on ${batch.platform} through the batch's own command sequence, fixture and privacy gate.`,
      entries: groupEntries,
    })
  }
  const historicalEntries = byKey.get('retained-historical') || []
  if (historicalEntries.length > 0) {
    groups.push({
      key: 'retained-historical',
      isBatch: false,
      description:
        // These are exactly the frames the Feature Gallery does NOT caption: it
        // lists them in its historical-evidence tables, whose second column
        // names an acceptance run instead of describing the picture. Calling
        // them "captioned" would contradict every page in this group.
        'On disk with no capture-plan entry: retained historical evidence the Feature Gallery lists in its historical tables rather than captioning, deliberately outside the current Windows gallery target.',
      entries: historicalEntries,
    })
  }

  fs.mkdirSync(OutputDir, { recursive: true })

  let unavailableFields = 0
  const written = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const page = renderPage(
      entry,
      index > 0 ? entries[index - 1] : null,
      index < entries.length - 1 ? entries[index + 1] : null,
      index + 1,
      entries.length,
      entries
    )
    unavailableFields += page.unavailable
    writeFormatted(path.join(OutputDir, entry.page), page.html)
    written.push(entry.page)
  }

  const stats = {
    pages: entries.length,
    published: entries.filter(entry => entry.plan !== null).length,
    refreshGaps: entries.filter(entry => entry.refreshGap !== null).length,
    historical: entries.filter(entry => entry.plan === null).length,
    batches: groups.filter(group => group.isBatch).length,
    withDatedReceipt: entries.filter(entry => entry.datedReceipts.length > 0)
      .length,
    withoutDatedReceipt: entries.filter(
      entry => entry.datedReceipts.length === 0
    ).length,
    altFromWiki: entries.filter(entry => entry.altSource === 'wiki').length,
    altFromCaption: entries.filter(entry => entry.altSource === 'caption')
      .length,
    altDerived: entries.filter(entry => entry.altSource === 'derived').length,
    uncaptioned: entries.filter(entry => entry.caption === '').length,
    unavailableFields: unavailableFields,
    deferredWithoutFile: (plan.DeferredCanonicalOutputs || [])
      .concat(plan.DeferredSpecialistOutputs || [])
      .filter(output => !entries.some(entry => entry.output === output))
      .sort(),
  }

  writeFormatted(
    path.join(OutputDir, 'index.html'),
    renderIndex(entries, groups, stats)
  )
  written.push('index.html')
  writeFormatted(path.join(OutputDir, PageStylesheet), renderStylesheet())
  written.push(PageStylesheet)

  // Prune anything a previous run left behind, so the directory always
  // describes the current gallery and a rerun is genuinely idempotent.
  const expected = new Set(written)
  const removed = []
  for (const name of fs.readdirSync(OutputDir).sort()) {
    if (!/\.(html|css)$/i.test(name) || expected.has(name)) {
      continue
    }
    fs.unlinkSync(path.join(OutputDir, name))
    removed.push(name)
  }

  const lines = [
    'Screenshot documentation generated into docs/screenshots/',
    `  pages written                 ${stats.pages + 1} (${
      stats.pages
    } screenshot pages + index.html)`,
    `  stylesheet written            ${PageStylesheet}`,
    `  PNGs on disk                  ${files.size}`,
    `  published gallery outputs     ${stats.published} of ${plan.GalleryCapturePlan.length} plan entries`,
    `  retained historical frames    ${stats.historical}`,
    `  capture batches rendered      ${stats.batches} of ${
      Object.keys(plan.CaptureBatches).length
    } declared`,
    `  verification documents read   ${receipts.documentsScanned}`,
    `  frames with a dated receipt   ${stats.withDatedReceipt}`,
    `  frames without a receipt      ${stats.withoutDatedReceipt}`,
    `  frames with wiki alt text     ${stats.altFromWiki} (caption fallback ${stats.altFromCaption}, file-name fallback ${stats.altDerived})`,
    `  frames with no wiki caption   ${stats.uncaptioned}`,
    `  fields reported unavailable   ${stats.unavailableFields}`,
    `  stale files pruned            ${removed.length}${
      removed.length > 0 ? ` (${removed.join(', ')})` : ''
    }`,
  ]
  if (stats.deferredWithoutFile.length > 0) {
    lines.push(
      `  declared but not rendered     ${stats.deferredWithoutFile.join(
        ', '
      )} (no plan entry, no PNG)`
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

main()
