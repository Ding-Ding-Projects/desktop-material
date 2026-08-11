import { reedSolomonDecode } from './galois'
import {
  buildFunctionPatterns,
  codewordModuleOrder,
  formatInformationBits,
  maskCondition,
} from './qr-encode'
import {
  blockLayout,
  byteModeCountBits,
  MaximumQrVersion,
  QrErrorCorrectionLevel,
  QrErrorCorrectionLevels,
  QrModeAlphanumeric,
  QrModeByte,
  QrModeEci,
  QrModeNumeric,
  QrModeTerminator,
} from './qr-tables'

/**
 * The reader half of the in-process QR codec.
 *
 * Registration accepts a QR from an image file, from the clipboard, and from a
 * camera frame, and every one of those routes lands here. It is deliberately
 * the same file's-worth of tables the encoder uses, so a round trip through
 * both is a real assertion rather than two implementations agreeing by luck.
 *
 * The geometry it recovers is affine: rotation and mild shear are handled, and
 * a photograph taken at a steep angle is not. That is a documented limit
 * rather than a silent one — {@link decodeQrFromLuminance} returns a named
 * failure the surface turns into "hold the camera square to the code", which
 * is a sentence somebody can act on.
 */

/** Why an image or matrix could not be read. */
export type QrDecodeFailure =
  | 'no-finder-patterns'
  | 'not-a-qr-grid'
  | 'unreadable-format'
  | 'too-damaged'
  | 'unsupported-content'

export type QrDecodeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: QrDecodeFailure }

/** A greyscale image: row-major luminance, 0 is black and 255 is white. */
export interface IQrLuminanceSource {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray | Uint8Array
}

/** Flatten RGBA bytes — an `ImageData.data` — into luminance. */
export function luminanceFromRgba(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array
): IQrLuminanceSource {
  const data = new Uint8ClampedArray(width * height)
  for (let index = 0; index < data.length; index++) {
    const offset = index * 4
    // Rec. 601 luma, in integer arithmetic.
    data[index] =
      (rgba[offset] * 77 + rgba[offset + 1] * 150 + rgba[offset + 2] * 29) >> 8
  }
  return { width, height, data }
}

/** Otsu's method: the threshold that best separates the two brightness modes. */
export function otsuThreshold(source: IQrLuminanceSource): number {
  const histogram = new Uint32Array(256)
  for (const value of source.data) {
    histogram[value]++
  }

  const total = source.data.length
  let sum = 0
  for (let level = 0; level < 256; level++) {
    sum += level * histogram[level]
  }

  let backgroundWeight = 0
  let backgroundSum = 0
  let best = 0
  let bestVariance = -1

  for (let level = 0; level < 256; level++) {
    backgroundWeight += histogram[level]
    if (backgroundWeight === 0) {
      continue
    }
    const foregroundWeight = total - backgroundWeight
    if (foregroundWeight === 0) {
      break
    }
    backgroundSum += level * histogram[level]

    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean = (sum - backgroundSum) / foregroundWeight
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) *
      (backgroundMean - foregroundMean)

    if (variance > bestVariance) {
      bestVariance = variance
      best = level
    }
  }

  return best
}

/** A binary image; `true` is a dark pixel. */
interface IBinaryImage {
  readonly width: number
  readonly height: number
  readonly dark: Uint8Array
}

function binarize(source: IQrLuminanceSource): IBinaryImage {
  const threshold = otsuThreshold(source)
  const dark = new Uint8Array(source.width * source.height)
  for (let index = 0; index < dark.length; index++) {
    dark[index] = source.data[index] <= threshold ? 1 : 0
  }
  return { width: source.width, height: source.height, dark }
}

interface IPoint {
  readonly x: number
  readonly y: number
}

interface IFinderCandidate extends IPoint {
  /** Estimated module width in pixels. */
  readonly moduleSize: number
}

/** Consecutive same-coloured runs along one scan line. */
function runsAlong(
  read: (index: number) => number,
  length: number
): ReadonlyArray<{ value: number; start: number; length: number }> {
  const runs: Array<{ value: number; start: number; length: number }> = []
  let value = read(0)
  let start = 0
  for (let index = 1; index < length; index++) {
    const next = read(index)
    if (next !== value) {
      runs.push({ value, start, length: index - start })
      value = next
      start = index
    }
  }
  runs.push({ value, start, length: length - start })
  return runs
}

/**
 * Whether five runs read as a finder pattern's 1:1:3:1:1 dark-light-dark
 * -light-dark profile, within the standard's own 50% per-element tolerance.
 */
function matchesFinderRatio(
  lengths: ReadonlyArray<number>
): { readonly moduleSize: number } | null {
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total < 7) {
    return null
  }
  const moduleSize = total / 7
  const tolerance = moduleSize / 2
  const expected = [1, 1, 3, 1, 1]

  for (let index = 0; index < 5; index++) {
    if (Math.abs(expected[index] * moduleSize - lengths[index]) > tolerance) {
      return null
    }
  }
  return { moduleSize }
}

/** Scan one line's runs for finder profiles, reporting each centre. */
function findProfilesInLine(
  runs: ReadonlyArray<{ value: number; start: number; length: number }>
): ReadonlyArray<{ centre: number; moduleSize: number }> {
  const found: Array<{ centre: number; moduleSize: number }> = []
  for (let index = 0; index + 4 < runs.length; index++) {
    const window = runs.slice(index, index + 5)
    if (window[0].value !== 1) {
      continue
    }
    const match = matchesFinderRatio(window.map(run => run.length))
    if (match === null) {
      continue
    }
    found.push({
      centre: window[2].start + window[2].length / 2,
      moduleSize: match.moduleSize,
    })
  }
  return found
}

/** Locate every finder-pattern centre in a binarized image. */
function findFinderPatterns(
  image: IBinaryImage
): ReadonlyArray<IFinderCandidate> {
  const candidates: Array<IFinderCandidate> = []

  for (let y = 0; y < image.height; y++) {
    const rowRuns = runsAlong(x => image.dark[y * image.width + x], image.width)
    for (const horizontal of findProfilesInLine(rowRuns)) {
      const x = Math.round(horizontal.centre)
      if (x < 0 || x >= image.width) {
        continue
      }
      // Confirm vertically through the same centre. A single row can match the
      // ratio across unrelated marks; two axes agreeing almost never do.
      const columnRuns = runsAlong(
        row => image.dark[row * image.width + x],
        image.height
      )
      for (const vertical of findProfilesInLine(columnRuns)) {
        if (Math.abs(vertical.centre - y) > horizontal.moduleSize) {
          continue
        }
        const ratio = vertical.moduleSize / horizontal.moduleSize
        if (ratio < 0.5 || ratio > 2) {
          continue
        }
        candidates.push({
          x: horizontal.centre,
          y: vertical.centre,
          moduleSize: (horizontal.moduleSize + vertical.moduleSize) / 2,
        })
      }
    }
  }

  // Merge the many near-identical hits each pattern produces, one per scanned
  // row, into one centre apiece.
  const clusters: Array<{ points: Array<IFinderCandidate> }> = []
  for (const candidate of candidates) {
    const cluster = clusters.find(entry => {
      const first = entry.points[0]
      return (
        Math.abs(first.x - candidate.x) < first.moduleSize * 2 &&
        Math.abs(first.y - candidate.y) < first.moduleSize * 2
      )
    })
    if (cluster === undefined) {
      clusters.push({ points: [candidate] })
    } else {
      cluster.points.push(candidate)
    }
  }

  return clusters
    .filter(cluster => cluster.points.length >= 2)
    .map(cluster => {
      const count = cluster.points.length
      return {
        x: cluster.points.reduce((sum, point) => sum + point.x, 0) / count,
        y: cluster.points.reduce((sum, point) => sum + point.y, 0) / count,
        moduleSize:
          cluster.points.reduce((sum, point) => sum + point.moduleSize, 0) /
          count,
      }
    })
}

function distance(from: IPoint, to: IPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/**
 * Pick the three finder patterns of one symbol and name their corners.
 *
 * The top-left is the one at the right angle: the pair furthest apart is the
 * hypotenuse, and the remaining pattern is opposite it.
 */
function orientPatterns(patterns: ReadonlyArray<IFinderCandidate>): {
  readonly topLeft: IFinderCandidate
  readonly a: IFinderCandidate
  readonly b: IFinderCandidate
} | null {
  if (patterns.length < 3) {
    return null
  }

  // With more than three candidates, take the three with the most consistent
  // module size — a stray mark rarely matches the real patterns' scale.
  const chosen = [...patterns]
    .sort((left, right) => left.moduleSize - right.moduleSize)
    .slice(0, 3)

  const [first, second, third] = chosen
  const pairs: ReadonlyArray<
    readonly [number, IFinderCandidate, IFinderCandidate, IFinderCandidate]
  > = [
    [distance(second, third), first, second, third],
    [distance(first, third), second, first, third],
    [distance(first, second), third, first, second],
  ]

  const hypotenuse = pairs.reduce((longest, pair) =>
    pair[0] > longest[0] ? pair : longest
  )

  return { topLeft: hypotenuse[1], a: hypotenuse[2], b: hypotenuse[3] }
}

/** Round a measured module count to the nearest legal QR dimension. */
function snapDimension(estimate: number): number | null {
  const rounded = Math.round(estimate)
  const remainder = rounded % 4
  const dimension =
    remainder === 1
      ? rounded
      : remainder === 0
      ? rounded + 1
      : remainder === 2
      ? rounded - 1
      : rounded + 2

  if (dimension < 21 || dimension > MaximumQrVersion * 4 + 17) {
    return null
  }
  return dimension
}

/**
 * Read the module grid out of an image, given the corner patterns.
 *
 * The mapping is affine: the top-left finder's centre is module (3, 3), the
 * other two centres are (3, dimension-4) and (dimension-4, 3), and everything
 * between is linear interpolation. Each module is sampled at its centre.
 */
function sampleGrid(
  image: IBinaryImage,
  topLeft: IPoint,
  topRight: IPoint,
  bottomLeft: IPoint,
  dimension: number
): Array<Array<boolean>> {
  const span = dimension - 7
  const columnStep = {
    x: (topRight.x - topLeft.x) / span,
    y: (topRight.y - topLeft.y) / span,
  }
  const rowStep = {
    x: (bottomLeft.x - topLeft.x) / span,
    y: (bottomLeft.y - topLeft.y) / span,
  }

  const modules: Array<Array<boolean>> = []
  for (let row = 0; row < dimension; row++) {
    const line: Array<boolean> = []
    for (let column = 0; column < dimension; column++) {
      const x = Math.round(
        topLeft.x + (column - 3) * columnStep.x + (row - 3) * rowStep.x
      )
      const y = Math.round(
        topLeft.y + (column - 3) * columnStep.y + (row - 3) * rowStep.y
      )
      const inside = x >= 0 && x < image.width && y >= 0 && y < image.height
      line.push(inside && image.dark[y * image.width + x] === 1)
    }
    modules.push(line)
  }

  return modules
}

/** The 32 legal format words, for correcting a damaged one by distance. */
const FormatWords: ReadonlyArray<{
  readonly bits: number
  readonly level: QrErrorCorrectionLevel
  readonly mask: number
}> = QrErrorCorrectionLevels.flatMap(level =>
  [0, 1, 2, 3, 4, 5, 6, 7].map(mask => ({
    bits: formatInformationBits(level, mask),
    level,
    mask,
  }))
)

function hammingDistance(left: number, right: number): number {
  let difference = left ^ right
  let count = 0
  while (difference !== 0) {
    count += difference & 1
    difference >>= 1
  }
  return count
}

/** Read the two format copies and correct whichever is closest to legal. */
function readFormat(
  modules: ReadonlyArray<ReadonlyArray<boolean>>
): { readonly level: QrErrorCorrectionLevel; readonly mask: number } | null {
  const size = modules.length
  const bit = (row: number, column: number) => (modules[row][column] ? 1 : 0)

  let first = 0
  let second = 0
  for (let index = 0; index < 15; index++) {
    const primary =
      index < 6
        ? bit(index, 8)
        : index === 6
        ? bit(7, 8)
        : index === 7
        ? bit(8, 8)
        : index === 8
        ? bit(8, 7)
        : bit(8, 14 - index)
    const secondary =
      index < 8 ? bit(8, size - 1 - index) : bit(size - 15 + index, 8)

    first |= primary << index
    second |= secondary << index
  }

  let best: { level: QrErrorCorrectionLevel; mask: number } | null = null
  let bestDistance = 4

  for (const candidate of FormatWords) {
    for (const observed of [first, second]) {
      const gap = hammingDistance(candidate.bits, observed)
      if (gap < bestDistance) {
        bestDistance = gap
        best = { level: candidate.level, mask: candidate.mask }
      }
    }
  }

  return best
}

/** De-interleave and error-correct the codeword stream into data codewords. */
function recoverDataCodewords(
  stream: ReadonlyArray<number>,
  version: number,
  level: QrErrorCorrectionLevel
): Array<number> | null {
  const layout = blockLayout(version, level)
  const blockSizes: Array<number> = [
    ...new Array<number>(layout.group1Blocks).fill(layout.group1DataCodewords),
    ...new Array<number>(layout.group2Blocks).fill(layout.group2DataCodewords),
  ]

  const dataBlocks = blockSizes.map(() => [] as Array<number>)
  const ecBlocks = blockSizes.map(() => [] as Array<number>)

  let cursor = 0
  const longest = Math.max(...blockSizes)
  for (let index = 0; index < longest; index++) {
    for (let block = 0; block < blockSizes.length; block++) {
      if (index < blockSizes[block]) {
        dataBlocks[block].push(stream[cursor++] ?? 0)
      }
    }
  }
  for (let index = 0; index < layout.ecCodewordsPerBlock; index++) {
    for (let block = 0; block < blockSizes.length; block++) {
      ecBlocks[block].push(stream[cursor++] ?? 0)
    }
  }

  const recovered: Array<number> = []
  for (let block = 0; block < blockSizes.length; block++) {
    const corrected = reedSolomonDecode(
      [...dataBlocks[block], ...ecBlocks[block]],
      layout.ecCodewordsPerBlock
    )
    if (corrected === null) {
      return null
    }
    recovered.push(...corrected.slice(0, blockSizes[block]))
  }

  return recovered
}

/** Alphanumeric mode's 45-character table, in the standard's own order. */
const AlphanumericTable = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

class BitReader {
  private position = 0

  public constructor(private readonly codewords: ReadonlyArray<number>) {}

  public get remaining(): number {
    return this.codewords.length * 8 - this.position
  }

  public read(width: number): number {
    let value = 0
    for (let index = 0; index < width; index++) {
      const byte = this.codewords[this.position >> 3] ?? 0
      value = (value << 1) | ((byte >> (7 - (this.position & 7))) & 1)
      this.position++
    }
    return value
  }
}

function countBitsFor(mode: number, version: number): number {
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2
  switch (mode) {
    case QrModeNumeric:
      return [10, 12, 14][band]
    case QrModeAlphanumeric:
      return [9, 11, 13][band]
    case QrModeByte:
      return byteModeCountBits(version)
    default:
      return 0
  }
}

/** Read the segment stream out of the recovered data codewords. */
function decodeSegments(
  codewords: ReadonlyArray<number>,
  version: number
): string | null {
  const reader = new BitReader(codewords)
  const bytes: Array<number> = []
  let text = ''
  let sawByteSegment = false

  const flushBytes = () => {
    if (bytes.length === 0) {
      return
    }
    text += new TextDecoder('utf-8').decode(Uint8Array.from(bytes))
    bytes.length = 0
  }

  while (reader.remaining >= 4) {
    const mode = reader.read(4)
    if (mode === QrModeTerminator) {
      break
    }

    if (mode === QrModeEci) {
      // One, two or three bytes of ECI designator. The app only ever writes
      // UTF-8 and every reader treats byte mode as UTF-8 in practice, so the
      // designator is consumed and the assignment left alone.
      const lead = reader.read(8)
      if ((lead & 0b1100_0000) === 0b1000_0000) {
        reader.read(8)
      } else if ((lead & 0b1110_0000) === 0b1100_0000) {
        reader.read(16)
      }
      continue
    }

    const countBits = countBitsFor(mode, version)
    if (countBits === 0) {
      // Kanji and the structured-append header are legal QR content this app
      // has no use for. Saying so is better than returning half a URI.
      return null
    }
    const count = reader.read(countBits)

    if (mode === QrModeByte) {
      if (count * 8 > reader.remaining) {
        return null
      }
      sawByteSegment = true
      for (let index = 0; index < count; index++) {
        bytes.push(reader.read(8))
      }
      continue
    }

    flushBytes()

    if (mode === QrModeNumeric) {
      let read = 0
      while (read + 3 <= count) {
        text += String(reader.read(10)).padStart(3, '0')
        read += 3
      }
      if (count - read === 2) {
        text += String(reader.read(7)).padStart(2, '0')
      } else if (count - read === 1) {
        text += String(reader.read(4))
      }
      continue
    }

    if (mode === QrModeAlphanumeric) {
      let read = 0
      while (read + 2 <= count) {
        const pair = reader.read(11)
        text += AlphanumericTable[Math.floor(pair / 45)]
        text += AlphanumericTable[pair % 45]
        read += 2
      }
      if (count - read === 1) {
        text += AlphanumericTable[reader.read(6)]
      }
      continue
    }

    return null
  }

  flushBytes()
  return text.length === 0 && !sawByteSegment ? null : text
}

/**
 * Decode a module matrix that has already been sampled off an image or built
 * by the encoder.
 */
export function decodeQrMatrix(
  modules: ReadonlyArray<ReadonlyArray<boolean>>
): QrDecodeResult {
  const size = modules.length
  if (
    size < 21 ||
    (size - 17) % 4 !== 0 ||
    modules.some(row => row.length !== size)
  ) {
    return { ok: false, reason: 'not-a-qr-grid' }
  }

  const version = (size - 17) / 4
  if (version > MaximumQrVersion) {
    return { ok: false, reason: 'not-a-qr-grid' }
  }

  const format = readFormat(modules)
  if (format === null) {
    return { ok: false, reason: 'unreadable-format' }
  }

  const skeleton = buildFunctionPatterns(version)
  const order = codewordModuleOrder(size, skeleton.reserved)

  const bits: Array<number> = []
  for (const [row, column] of order) {
    const raw = modules[row][column]
    const unmasked = maskCondition(format.mask, row, column) ? !raw : raw
    bits.push(unmasked ? 1 : 0)
  }

  const stream: Array<number> = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    let byte = 0
    for (let offset = 0; offset < 8; offset++) {
      byte = (byte << 1) | bits[index + offset]
    }
    stream.push(byte)
  }

  const data = recoverDataCodewords(stream, version, format.level)
  if (data === null) {
    return { ok: false, reason: 'too-damaged' }
  }

  const text = decodeSegments(data, version)
  if (text === null) {
    return { ok: false, reason: 'unsupported-content' }
  }

  return { ok: true, text }
}

/**
 * Find and decode a QR symbol in a greyscale image.
 *
 * Both corner assignments are attempted rather than derived from a cross
 * product, because the sign convention flips with the image's y direction and
 * the cost of trying the other one is one more sample-and-decode.
 */
export function decodeQrFromLuminance(
  source: IQrLuminanceSource
): QrDecodeResult {
  if (source.width < 21 || source.height < 21) {
    return { ok: false, reason: 'not-a-qr-grid' }
  }

  const image = binarize(source)
  const patterns = findFinderPatterns(image)
  const oriented = orientPatterns(patterns)

  if (oriented === null) {
    return { ok: false, reason: 'no-finder-patterns' }
  }

  const { topLeft, a, b } = oriented
  const moduleSize = (topLeft.moduleSize + a.moduleSize + b.moduleSize) / 3
  if (moduleSize <= 0) {
    return { ok: false, reason: 'not-a-qr-grid' }
  }

  let lastFailure: QrDecodeFailure = 'not-a-qr-grid'

  for (const [topRight, bottomLeft] of [
    [a, b],
    [b, a],
  ] as const) {
    const dimension = snapDimension(
      distance(topLeft, topRight) / moduleSize + 7
    )
    if (dimension === null) {
      continue
    }
    const modules = sampleGrid(image, topLeft, topRight, bottomLeft, dimension)
    const result = decodeQrMatrix(modules)
    if (result.ok) {
      return result
    }
    lastFailure = result.reason
  }

  return { ok: false, reason: lastFailure }
}

/** Build a luminance source from RGBA image bytes and decode it. */
export function decodeQrFromRgba(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array
): QrDecodeResult {
  return decodeQrFromLuminance(luminanceFromRgba(width, height, rgba))
}
