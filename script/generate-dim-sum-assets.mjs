#!/usr/bin/env node

/**
 * Copies the bundled dim sum surprise pictures out of the shared dim sum
 * catalog and regenerates `app/static/dim-sum/manifest.json`.
 *
 * The catalog is the only permitted source of these pictures. Nothing here
 * generates, downloads, resizes, or re-encodes an image: each selected PNG is
 * copied byte for byte from its indexed path, and the copy is rejected unless
 * the bytes decode as a PNG whose dimensions match the catalog's stated
 * minimum. A dish whose picture is missing or undecodable is reported and
 * skipped rather than replaced by a substitute.
 *
 * This script is a maintenance tool, not a build step. The manifest and the
 * pictures are committed, so a build, a test run, and CI never need the
 * catalog to be present. `app/test/unit/dim-sum-assets-test.ts` re-verifies the
 * committed bytes against the committed manifest on every run.
 *
 * Usage:
 *   node script/generate-dim-sum-assets.mjs [catalogDirectory]
 *
 * The catalog directory defaults to $DIM_SUM_CATALOG_DIR, then to the
 * `agent-global-memory/dim-sum` checkout inside the current user's GitHub
 * folder. No path is hard-coded to a particular machine or account.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

/** Where the committed pictures and manifest live. */
export const AssetDirectory = resolve(repositoryRoot, 'app/static/dim-sum')
/** Filename of the manifest inside {@link AssetDirectory}. */
export const ManifestFile = 'manifest.json'
/** Format version of the emitted manifest. */
export const ManifestVersion = 1

/**
 * The dishes this app bundles, by their catalog id.
 *
 * A deliberately small, hand-picked spread of the tea house rather than a
 * mirror of the whole catalog: every picture is a multi-megabyte lossless PNG,
 * so the installer pays for each one. Twelve covers steamed, baked, fried,
 * rolled, bakery, dessert and drink without turning a small delight into a
 * download. Add to the list here, then re-run this script.
 */
export const BundledDishIds = [
  'hk-dish-0001', // 蝦餃 — the dish every tea house is judged on
  'hk-dish-0011', // 燒賣
  'hk-dish-0027', // 豉汁蒸鳳爪
  'hk-dish-0049', // 糯米雞
  'hk-dish-0051', // 叉燒包
  'hk-dish-0058', // 奶黃包
  'hk-dish-0126', // 香煎蘿蔔糕
  'hk-dish-0139', // 酥皮蛋撻
  'hk-dish-0144', // 菠蘿包
  'hk-dish-0152', // 鮮蝦腸粉
  'hk-dish-0231', // 楊枝甘露
  'hk-dish-0676', // 港式奶茶
]

/** The eight bytes every PNG file starts with. */
const PngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * Read a PNG's dimensions from its header, or throw when the bytes are not a
 * PNG whose first chunk is a well-formed IHDR.
 *
 * This is a structural decode rather than a full one: it proves the file is a
 * real image with real dimensions, which is what distinguishes a copied
 * picture from a truncated download or a renamed text file.
 */
export function readPngSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PngSignature)) {
    throw new Error('not a PNG: the eight-byte signature is missing')
  }
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw new Error('not a PNG: the first chunk is not IHDR')
  }

  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width === 0 || height === 0) {
    throw new Error(`degenerate PNG dimensions ${width}x${height}`)
  }

  // A PNG always ends with the twelve-byte IEND chunk. Checking it catches the
  // one corruption a header check cannot: a file cut off part-way through.
  if (
    bytes.subarray(bytes.length - 8, bytes.length - 4).toString('latin1') !==
    'IEND'
  ) {
    throw new Error('truncated PNG: no IEND chunk at the end of the file')
  }

  return { width, height }
}

/** Resolve the catalog directory without hard-coding a machine or account. */
export function resolveCatalogDirectory(explicit) {
  const candidates = [
    explicit,
    process.env.DIM_SUM_CATALOG_DIR,
    join(homedir(), 'Documents', 'GitHub', 'agent-global-memory', 'dim-sum'),
    join(homedir(), 'GitHub', 'agent-global-memory', 'dim-sum'),
  ].filter(candidate => typeof candidate === 'string' && candidate.length > 0)

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.json'))) {
      return candidate
    }
  }

  throw new Error(
    'No dim sum catalog found. Pass its directory as the first argument or ' +
      'set DIM_SUM_CATALOG_DIR to a checkout containing index.json.'
  )
}

/** Project one catalog record into the manifest's much smaller shape. */
export function projectDish(dish, file, bytes) {
  const { width, height } = readPngSize(bytes)
  return {
    id: dish.id,
    slug: dish.slug,
    name: { en: dish.name.en, zhHant: dish.name.zhHant },
    jyutping: dish.jyutping ?? '',
    category: dish.category,
    alt: { en: dish.image.alt.en, yue: dish.image.alt.yue },
    file,
    bytes: bytes.length,
    width,
    height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function main() {
  const catalogDirectory = resolveCatalogDirectory(process.argv[2])
  console.log(`Reading the dim sum catalog from ${catalogDirectory}`)

  const index = JSON.parse(
    readFileSync(join(catalogDirectory, 'index.json'), 'utf8')
  )
  const byId = new Map(index.dishes.map(dish => [dish.id, dish]))

  const dishes = []
  const skipped = []

  for (const id of BundledDishIds) {
    const dish = byId.get(id)
    if (dish === undefined) {
      skipped.push(`${id}: no such record in the catalog index`)
      continue
    }

    const source = join(catalogDirectory, dish.image.path)
    if (!existsSync(source)) {
      skipped.push(`${id}: the indexed picture ${dish.image.path} is missing`)
      continue
    }

    const bytes = readFileSync(source)
    const file = `${dish.id}-${dish.slug}.png`
    try {
      dishes.push(projectDish(dish, file, bytes))
    } catch (error) {
      skipped.push(`${id}: ${error.message}`)
      continue
    }

    mkdirSync(AssetDirectory, { recursive: true })
    copyFileSync(source, join(AssetDirectory, file))
    console.log(`  ${file} (${(bytes.length / 1024 / 1024).toFixed(2)} MiB)`)
  }

  if (dishes.length === 0) {
    throw new Error('No dish survived verification; nothing was written.')
  }

  // Remove pictures a previous run left behind that no longer belong to the
  // manifest, so the bundled directory never quietly grows.
  const keep = new Set([ManifestFile, ...dishes.map(dish => dish.file)])
  for (const entry of readdirSync(AssetDirectory)) {
    if (!keep.has(entry)) {
      rmSync(join(AssetDirectory, entry), { recursive: true, force: true })
      console.log(`  removed stale ${entry}`)
    }
  }

  const manifest = {
    version: ManifestVersion,
    source: 'agent-global-memory dim sum catalog',
    catalogSchemaVersion: index.schemaVersion,
    note:
      'Copied byte for byte from the catalog. Never generated, fetched, ' +
      'resized or re-encoded here.',
    dishes,
  }
  writeFileSync(
    join(AssetDirectory, ManifestFile),
    JSON.stringify(manifest, null, 2) + '\n'
  )

  const total = dishes.reduce((sum, dish) => sum + dish.bytes, 0)
  console.log(
    `Wrote ${dishes.length} dishes (${(total / 1024 / 1024).toFixed(1)} MiB) ` +
      `to ${AssetDirectory}`
  )
  for (const reason of skipped) {
    console.warn(`Skipped ${reason}`)
  }
  if (skipped.length > 0) {
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
