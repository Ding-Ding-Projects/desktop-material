#!/usr/bin/env node
//
// Vendors every third-party asset the published Material Design 3 site needs.
//
//   node script/vendor-site-assets.mjs
//
// The site is one Design Component: `site/index.html` holds the template and
// its logic class, and `site/support.js` renders it. Left alone that runtime
// pulls React from unpkg and the typefaces from fonts.googleapis.com, which the
// project's own rule against third-party requests forbids. This script
// downloads both, writes them under `site/vendor/`, and emits:
//
//   vendor/dc-resources.js  — a `window.__resources` map the runtime consults
//                             before it reaches for a CDN URL. It is a
//                             documented runtime hook, so support.js itself is
//                             the byte-for-byte upstream build.
//   vendor/fonts/fonts.css  — @font-face rules pointing at the local WOFF2s.
//   vendor/manifest.json    — provenance: source URL, bytes, SHA-256, license.
//   vendor/fonts/coverage.json
//                           — the icon ligatures and CJK code points the
//                             subsets were built for, so the Pages contract
//                             test can prove coverage without a network.
//
// Two families are subsetted by content rather than by script: the icon face
// carries only the ligatures the page names, and Noto Sans HK carries only the
// characters the Cantonese copy actually renders. Both sets are derived from
// `site/index.html` on every run, so adding copy and re-running is the whole
// maintenance story — and `script/site-dc-pages-test.mjs` turns a forgotten
// re-run into a red build instead of a page full of tofu.
//
// Network access is required. Nothing else in the build needs it: the outputs
// are committed.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DC_SOURCE_FILES,
  RUNTIME_RESOURCES,
  fontRequests,
  requiredCjkCharacters,
  requiredIconNames,
} from './site-dc-assets.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siteRoot = join(repositoryRoot, 'site')
const vendorRoot = join(siteRoot, 'vendor')
const fontRoot = join(vendorRoot, 'fonts')
const licenseRoot = join(vendorRoot, 'licenses')

// Google's CSS API serves WOFF2 only to browsers that advertise support for it.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const LICENSES = [
  {
    id: 'react-mit',
    spdx: 'MIT',
    covers: ['react.production.min.js', 'react-dom.production.min.js'],
    url: 'https://raw.githubusercontent.com/facebook/react/v18.3.1/LICENSE',
    file: 'React-MIT.txt',
  },
  {
    id: 'roboto-flex-ofl-1.1',
    spdx: 'OFL-1.1',
    covers: ['Roboto Flex'],
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/robotoflex/OFL.txt',
    file: 'Roboto-Flex-OFL-1.1.txt',
  },
  {
    id: 'roboto-mono-ofl-1.1',
    spdx: 'OFL-1.1',
    covers: ['Roboto Mono'],
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/robotomono/OFL.txt',
    file: 'Roboto-Mono-OFL-1.1.txt',
  },
  {
    id: 'noto-sans-hk-ofl-1.1',
    spdx: 'OFL-1.1',
    covers: ['Noto Sans HK'],
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshk/OFL.txt',
    file: 'Noto-Sans-HK-OFL-1.1.txt',
  },
  {
    id: 'material-symbols-apache-2.0',
    spdx: 'Apache-2.0',
    covers: ['Material Symbols Outlined'],
    url: 'https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE',
    file: 'Material-Symbols-Apache-2.0.txt',
  },
]

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

const sriFor = buffer =>
  `sha384-${createHash('sha384').update(buffer).digest('base64')}`

async function download(url, { asText = false } = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
  })
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return asText ? buffer.toString('utf8') : buffer
}

/**
 * Splits a Google Fonts CSS response into its @font-face blocks, keeping the
 * `/* latin *\/`-style comment that labels each one. A content-subsetted
 * response carries no such comment, so `subset` is null there.
 */
function parseFontFaces(css) {
  const faces = []
  const blocks = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g
  let match
  while ((match = blocks.exec(css)) !== null) {
    const body = match[2]
    const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1]
    if (!url) continue
    faces.push({
      subset: match[1] ?? null,
      body,
      url: url.replace(/^['"]|['"]$/g, ''),
      style: /font-style:\s*([^;]+);/.exec(body)?.[1].trim() ?? 'normal',
      weight: /font-weight:\s*([^;]+);/.exec(body)?.[1].trim() ?? '400',
      stretch: /font-stretch:\s*([^;]+);/.exec(body)?.[1].trim() ?? null,
      display: /font-display:\s*([^;]+);/.exec(body)?.[1].trim() ?? 'swap',
      unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim() ?? null,
    })
  }
  return faces
}

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')

async function main() {
  const html = DC_SOURCE_FILES.map(name =>
    readFileSync(join(siteRoot, name), 'utf8')
  ).join('\n')
  const iconNames = requiredIconNames(html)
  const cjkText = requiredCjkCharacters(html)

  process.stdout.write(
    `Deriving subsets from ${DC_SOURCE_FILES.join(', ')}: ${
      iconNames.size
    } icon ligatures, ${cjkText.length} CJK code points.\n`
  )

  // A clean slate keeps a renamed or dropped face from lingering as an
  // unreferenced binary that nothing serves but everything ships.
  rmSync(vendorRoot, { recursive: true, force: true })
  mkdirSync(fontRoot, { recursive: true })
  mkdirSync(licenseRoot, { recursive: true })

  const retrievedAtUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const manifest = {
    schemaVersion: 1,
    retrievedAtUtc,
    generatedBy: 'script/vendor-site-assets.mjs',
    acquisition: {
      method:
        'Official unpkg UMD builds and Google Fonts CSS v2 responses with ' +
        'their fonts.gstatic.com WOFF2 URLs',
      userAgent: BROWSER_USER_AGENT,
      documentation: [
        'https://developers.google.com/fonts/docs/css2',
        'https://developers.google.com/fonts/docs/material_symbols',
      ],
      transformations:
        'None. Every binary is the byte-for-byte upstream response; the icon ' +
        'and Hong Kong Chinese faces are subsetted by Google itself through ' +
        'the icon_names and text query parameters.',
    },
    runtime: [],
    fonts: [],
    licenses: [],
  }

  // ---------------------------------------------------------------- runtime
  for (const resource of RUNTIME_RESOURCES) {
    const bytes = await download(resource.url)
    const sri = sriFor(bytes)
    if (sri !== resource.sri) {
      throw new Error(
        `${resource.url} does not match the digest site/support.js pins.\n` +
          `  expected ${resource.sri}\n  received ${sri}\n` +
          'Refusing to vendor a build the runtime would have rejected.'
      )
    }
    writeFileSync(join(siteRoot, resource.local), bytes)
    manifest.runtime.push({
      url: resource.url,
      path: `site/${resource.local}`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      sri,
    })
    process.stdout.write(`  runtime  ${resource.local} (${bytes.length} B)\n`)
  }

  // ------------------------------------------------------------------ fonts
  const cssSections = []
  for (const request of fontRequests({ iconNames, cjkText })) {
    const cssUrl = `https://fonts.googleapis.com/css2?${request.query}`
    const css = await download(cssUrl, { asText: true })
    const faces = parseFontFaces(css).filter(
      face => request.subsets == null || request.subsets.includes(face.subset)
    )
    if (faces.length === 0) {
      throw new Error(`no @font-face survived filtering for ${request.family}`)
    }

    const rules = []
    // A variable family answers every weight in a `wght@400;500;700` request
    // with the same binary. Content-addressing the downloads means those three
    // faces share one file instead of shipping the same 72 KiB three times.
    const writtenByDigest = new Map()
    for (const [index, face] of faces.entries()) {
      const label = face.subset ? slug(face.subset) : 'subset'
      const bytes = await download(face.url)
      const digest = sha256(bytes)
      const name =
        writtenByDigest.get(digest) ??
        `${request.id}-${label}-${slug(face.style)}-${slug(
          face.weight
        )}-${index}.woff2`
      if (writtenByDigest.has(digest)) {
        process.stdout.write(
          `  font     ${name} reused for weight ${face.weight}\n`
        )
      } else {
        writtenByDigest.set(digest, name)
        writeFileSync(join(fontRoot, name), bytes)
        process.stdout.write(`  font     ${name} (${bytes.length} B)\n`)
      }
      manifest.fonts.push({
        family: request.family,
        cssUrl,
        woff2Url: face.url,
        path: `site/vendor/fonts/${name}`,
        subset: face.subset,
        style: face.style,
        weight: face.weight,
        bytes: bytes.length,
        sha256: digest,
      })
      rules.push(
        [
          '@font-face {',
          `  font-family: '${request.family}';`,
          `  font-style: ${face.style};`,
          `  font-weight: ${face.weight};`,
          ...(face.stretch ? [`  font-stretch: ${face.stretch};`] : []),
          `  font-display: ${face.display};`,
          `  src: url('./${name}') format('woff2');`,
          ...(face.unicodeRange
            ? [`  unicode-range: ${face.unicodeRange};`]
            : []),
          '}',
        ].join('\n')
      )
    }
    cssSections.push(
      `/* ${request.family} — ${
        request.subsets ? request.subsets.join(', ') : 'content subset'
      } */\n${rules.join('\n\n')}`
    )
  }

  writeFileSync(
    join(fontRoot, 'fonts.css'),
    [
      '/*',
      ' * Generated by script/vendor-site-assets.mjs — do not edit by hand.',
      ' * Re-run that script after changing the icons or Cantonese copy in',
      ' * site/index.html, or the subsets below will be missing glyphs.',
      ' */',
      '',
      ...cssSections,
      '',
    ].join('\n')
  )

  writeFileSync(
    join(fontRoot, 'coverage.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        retrievedAtUtc,
        note:
          'What the two content-subsetted faces were built to cover. ' +
          'script/site-dc-pages-test.mjs compares this against what ' +
          'site/index.html actually renders.',
        materialSymbolsOutlined: [...iconNames].sort(),
        notoSansHk: cjkText,
      },
      null,
      2
    )}\n`
  )

  // --------------------------------------------------------------- licenses
  for (const license of LICENSES) {
    const text = await download(license.url)
    writeFileSync(join(licenseRoot, license.file), text)
    manifest.licenses.push({
      id: license.id,
      spdx: license.spdx,
      covers: license.covers,
      upstreamUrl: license.url,
      path: `site/vendor/licenses/${license.file}`,
      bytes: text.length,
      sha256: sha256(text),
    })
    process.stdout.write(`  license  ${license.file} (${text.length} B)\n`)
  }

  // ------------------------------------------------------------- resources
  const resourceMap = Object.fromEntries(
    RUNTIME_RESOURCES.map(resource => [
      resource.url,
      `./${resource.local.replace(/^vendor\//, 'vendor/')}`,
    ])
  )
  writeFileSync(
    join(vendorRoot, 'dc-resources.js'),
    [
      '// Generated by script/vendor-site-assets.mjs — do not edit by hand.',
      '//',
      '// site/support.js resolves its pinned React URLs through this map before',
      '// it falls back to a CDN, so loading it first is what keeps the published',
      '// page free of third-party requests. Keep it ahead of support.js in the',
      '// document head: the runtime reads the map at load time, not at boot.',
      'window.__resources = Object.assign(window.__resources || {}, ' +
        `${JSON.stringify(resourceMap, null, 2)})`,
      '',
    ].join('\n')
  )

  writeFileSync(
    join(vendorRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )

  // Deduplicated faces share a path, so bytes on disk are counted per file
  // rather than per @font-face rule.
  const onDisk = new Map()
  for (const entry of [...manifest.runtime, ...manifest.fonts]) {
    onDisk.set(entry.path, entry.bytes)
  }
  const total = [...onDisk.values()].reduce((sum, bytes) => sum + bytes, 0)
  process.stdout.write(
    `\nVendored ${manifest.runtime.length} runtime files and ` +
      `${manifest.fonts.length} font faces across ${
        onDisk.size - manifest.runtime.length
      } files (${(total / 1024).toFixed(1)} KiB on disk).\n`
  )
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
