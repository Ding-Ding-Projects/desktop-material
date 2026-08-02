/**
 * Build-time index of the bundled dim sum surprise pictures.
 *
 * The manifest is imported at build time (it ships with the app) and coerced
 * defensively here, so a hand-edited or partially-written entry costs one dish
 * rather than the app's startup. The renderer turns the filenames returned
 * here into `file://` URLs; nothing in this module reaches the network.
 *
 * `script/generate-dim-sum-assets.ts` writes the manifest and copies the
 * pictures byte for byte out of the shared dim sum catalog. Nothing generates,
 * downloads or re-encodes an image at any point.
 */

import { IDimSumDish } from '../models/dim-sum'
import manifestSource from '../../static/dim-sum/manifest.json'

/**
 * Directory (relative to the app root, i.e. `__dirname` in the renderer)
 * holding the manifest and every picture. The build copies
 * `app/static/dim-sum` here.
 */
export const DimSumAssetsDir = 'static/dim-sum'
/** Filename of the manifest within {@link DimSumAssetsDir}. */
export const DimSumManifestFile = 'manifest.json'

function coerceNames(value: unknown): { en: string; zhHant: string } | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const raw = value as Record<string, unknown>
  if (
    typeof raw.en !== 'string' ||
    raw.en.length === 0 ||
    typeof raw.zhHant !== 'string' ||
    raw.zhHant.length === 0
  ) {
    return null
  }
  return { en: raw.en, zhHant: raw.zhHant }
}

function coerceAlt(value: unknown): { en: string; yue: string } | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const raw = value as Record<string, unknown>
  if (
    typeof raw.en !== 'string' ||
    raw.en.length === 0 ||
    typeof raw.yue !== 'string' ||
    raw.yue.length === 0
  ) {
    return null
  }
  return { en: raw.en, yue: raw.yue }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && isFinite(value) && value > 0
    ? Math.floor(value)
    : null
}

/**
 * A picture whose filename could escape the bundled directory is dropped
 * rather than resolved: the manifest is committed, but a path traversal would
 * turn a data file into a way of reading the disk.
 */
function isSafeFilename(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9._-]+\.png$/.test(value) &&
    !value.startsWith('.')
  )
}

function coerceDish(value: unknown): IDimSumDish | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const raw = value as Record<string, unknown>

  const name = coerceNames(raw.name)
  const alt = coerceAlt(raw.alt)
  const bytes = positiveInteger(raw.bytes)
  const width = positiveInteger(raw.width)
  const height = positiveInteger(raw.height)

  if (
    typeof raw.id !== 'string' ||
    raw.id.length === 0 ||
    typeof raw.slug !== 'string' ||
    raw.slug.length === 0 ||
    name === null ||
    alt === null ||
    !isSafeFilename(raw.file) ||
    bytes === null ||
    width === null ||
    height === null ||
    typeof raw.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(raw.sha256)
  ) {
    return null
  }

  return {
    id: raw.id,
    slug: raw.slug,
    name,
    jyutping: typeof raw.jyutping === 'string' ? raw.jyutping : '',
    category: typeof raw.category === 'string' ? raw.category : '',
    alt,
    file: raw.file,
    bytes,
    width,
    height,
    sha256: raw.sha256,
  }
}

const dishes: ReadonlyArray<IDimSumDish> = (() => {
  const raw = (manifestSource as { dishes?: unknown }).dishes
  if (!Array.isArray(raw)) {
    return []
  }

  const seen = new Set<string>()
  const usable: Array<IDimSumDish> = []
  for (const candidate of raw) {
    const dish = coerceDish(candidate)
    // A duplicated id or picture would skew the draw towards one dish, so the
    // later copy is dropped rather than silently doubling its odds.
    if (dish === null || seen.has(dish.id) || seen.has(dish.file)) {
      continue
    }
    seen.add(dish.id)
    seen.add(dish.file)
    usable.push(dish)
  }
  return usable
})()

/** Every bundled dish, in manifest order. */
export function getDimSumDishes(): ReadonlyArray<IDimSumDish> {
  return dishes
}

/** Look up a bundled dish by its catalog id, or null when it is absent. */
export function getDimSumDish(id: string): IDimSumDish | null {
  return dishes.find(dish => dish.id === id) ?? null
}
