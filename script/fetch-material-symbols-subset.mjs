// Regenerates the bundled Material Symbols Rounded WOFF2 subset.
//
// The app never fetches an icon font at runtime — every glyph ships inside the
// build. This script is the one sanctioned way to change which glyphs are in
// that bundle: it asks the official Google Fonts CSS v2 API for exactly the
// ligature names listed in `MaterialSymbolNames`, downloads the WOFF2 the API
// points at, writes it into app/styles/fonts, and rewrites the provenance
// entry in font-assets-manifest.json (URLs, status codes, byte counts,
// SHA-256s, response dates) so the bundled-fonts contract test can prove the
// binary is the byte-for-byte official response.
//
// Usage:
//   node script/fetch-material-symbols-subset.mjs            # write
//   node script/fetch-material-symbols-subset.mjs --check     # verify only
//
// The icon list is read from app/src/ui/lib/material-symbol.tsx so the source
// of truth for "which glyphs exist" is the TypeScript union the UI imports,
// never a second list that can drift from it.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const symbolSource = join(root, 'app', 'src', 'ui', 'lib', 'material-symbol.tsx')
const fontsDir = join(root, 'app', 'styles', 'fonts')
const manifestPath = join(fontsDir, 'font-assets-manifest.json')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const AXES = 'opsz,wght,FILL,GRAD@20..48,100..700,0..1,0'

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

/** The ligature names the UI is allowed to render, read from the TS union. */
export function readIconNames() {
  const source = readFileSync(symbolSource, 'utf8')
  const block = /export const MaterialSymbolNames = \[([\s\S]*?)\] as const/.exec(
    source
  )

  if (block === null) {
    throw new Error(
      'Could not find `export const MaterialSymbolNames = [...] as const` in ' +
        symbolSource
    )
  }

  const names = [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1])

  if (names.length === 0) {
    throw new Error('MaterialSymbolNames is empty')
  }

  const sorted = [...names].sort()
  const duplicates = sorted.filter((n, i) => i > 0 && n === sorted[i - 1])

  if (duplicates.length > 0) {
    throw new Error(`MaterialSymbolNames has duplicates: ${duplicates.join(', ')}`)
  }

  return sorted
}

export function cssRequestUrl(names) {
  return (
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:' +
    AXES +
    '&icon_names=' +
    names.join(',') +
    '&display=swap'
  )
}

async function get(url, accept) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}) },
  })

  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`)
  }

  const body = Buffer.from(await response.arrayBuffer())

  return {
    url,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    lastModified: response.headers.get('last-modified') ?? '',
    cacheControl: response.headers.get('cache-control') ?? '',
    body,
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const names = readIconNames()
  const fileName = `material-symbols-rounded-subset-${names.length}.woff2`
  const relativePath = `app/styles/fonts/${fileName}`

  const css = await get(cssRequestUrl(names), 'text/css,*/*')
  const cssText = css.body.toString('utf8')
  const src = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(cssText)

  if (src === null) {
    throw new Error('No fonts.gstatic.com src URL in the CSS v2 response')
  }

  const font = await get(src[1], 'font/woff2')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const index = manifest.assets.findIndex(a =>
    a.family === 'Material Symbols Rounded'
  )

  if (index < 0) {
    throw new Error('No Material Symbols Rounded asset in the manifest')
  }

  const previous = manifest.assets[index]

  if (check) {
    const onDisk = readFileSync(join(root, previous.relativePath))
    const matches =
      previous.sha256 === sha256(onDisk) && previous.bytes === onDisk.length
    process.stdout.write(
      `${matches ? 'ok' : 'MISMATCH'} ${previous.relativePath} ` +
        `(${previous.requestedIconNameCount} icons)\n`
    )
    process.exit(matches ? 0 : 1)
  }

  writeFileSync(join(fontsDir, fileName), font.body)

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  manifest.assets[index] = {
    ...previous,
    id: `material-symbols-rounded-subset-${names.length}`,
    relativePath,
    bytes: font.body.length,
    sha256: sha256(font.body),
    requestedIconNameCount: names.length,
    requestedIconNames: names,
    officialSubsetInspection: undefined,
    cssRequest: {
      url: css.url,
      status: css.status,
      contentType: css.contentType,
      bytes: css.body.length,
      sha256: sha256(css.body),
      responseDate: now,
      lastModified: css.lastModified || now,
      cacheControl: css.cacheControl,
    },
    source: {
      url: font.url,
      status: font.status,
      contentType: font.contentType,
      contentLength: font.body.length,
      sha256: sha256(font.body),
      responseDate: now,
      lastModified: font.lastModified || now,
      cacheControl: font.cacheControl,
    },
  }

  delete manifest.assets[index].officialSubsetInspection

  manifest.retrievedAtUtc = now
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  process.stdout.write(
    `wrote ${relativePath} (${font.body.length} bytes, ` +
      `${names.length} icons, sha256 ${sha256(font.body)})\n` +
      `previous asset ${previous.relativePath} is now unreferenced\n`
  )
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exit(1)
})
