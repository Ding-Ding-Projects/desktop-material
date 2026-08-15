import { reedSolomonEncode } from './galois'
import {
  alignmentCentres,
  blockLayout,
  byteModeCountBits,
  dataCodewordCount,
  MaximumQrVersion,
  moduleCount,
  QrErrorCorrectionBits,
  QrErrorCorrectionLevel,
  QrModeByte,
  QrModeTerminator,
} from './qr-tables'

/**
 * An ISO/IEC 18004 QR encoder, written in-process.
 *
 * The registration surface must never send a secret to a QR web service or a
 * remote chart API — that would hand the shared key to a stranger's server on
 * the way to drawing it — so the whole encoder lives here and the renderer
 * paints the matrix it returns. Byte mode only: an `otpauth://` URI is mixed
 * case with `:` and `/` in it, which alphanumeric mode cannot carry.
 */

/** A finished symbol: a square grid of dark/light modules. */
export interface IQrMatrix {
  /** Width and height in modules. */
  readonly size: number
  /** The version, 1–20. */
  readonly version: number
  readonly level: QrErrorCorrectionLevel
  /** The data-mask pattern, 0–7, chosen by penalty scoring. */
  readonly mask: number
  /** Row-major; `true` is a dark module. */
  readonly modules: ReadonlyArray<ReadonlyArray<boolean>>
}

/** Thrown when a payload cannot be encoded at any supported version. */
export class QrEncodeError extends Error {}

/** The default level: 15% recovery, which every scanner handles comfortably. */
export const DefaultQrErrorCorrectionLevel: QrErrorCorrectionLevel = 'M'

/**
 * The quiet zone the standard requires, in modules.
 *
 * Four is not decoration. A symbol rendered flush against a card's edge is
 * routinely unreadable, and it is the single most common reason a
 * hand-rolled QR "does not scan".
 */
export const QrQuietZoneModules = 4

/** The pad bytes the standard alternates once the terminator has been written. */
const PadBytes = [0xec, 0x11] as const

/** A symbol's function patterns and the map of which modules they own. */
export interface IWorkingMatrix {
  readonly size: number
  /** `true` is dark. */
  readonly modules: Array<Array<boolean>>
  /** `true` where a function pattern or format area owns the module. */
  readonly reserved: Array<Array<boolean>>
}

function createWorkingMatrix(size: number): IWorkingMatrix {
  return {
    size,
    modules: Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false)
    ),
    reserved: Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false)
    ),
  }
}

function place(
  matrix: IWorkingMatrix,
  row: number,
  column: number,
  dark: boolean
): void {
  matrix.modules[row][column] = dark
  matrix.reserved[row][column] = true
}

function drawFinder(matrix: IWorkingMatrix, top: number, left: number): void {
  // The 7×7 finder plus its one-module separator, clipped to the symbol.
  for (let row = -1; row <= 7; row++) {
    for (let column = -1; column <= 7; column++) {
      const r = top + row
      const c = left + column
      if (r < 0 || r >= matrix.size || c < 0 || c >= matrix.size) {
        continue
      }
      const inRing =
        (row >= 0 && row <= 6 && (column === 0 || column === 6)) ||
        (column >= 0 && column <= 6 && (row === 0 || row === 6))
      const inCore = row >= 2 && row <= 4 && column >= 2 && column <= 4
      place(matrix, r, c, inRing || inCore)
    }
  }
}

function drawAlignment(matrix: IWorkingMatrix, version: number): void {
  const centres = alignmentCentres(version)
  const last = matrix.size - 8

  for (const row of centres) {
    for (const column of centres) {
      // The three finder corners already own their neighbourhoods.
      const inFinderCorner =
        (row <= 8 && column <= 8) ||
        (row <= 8 && column >= last) ||
        (row >= last && column <= 8)
      if (inFinderCorner) {
        continue
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc))
          place(matrix, row + dr, column + dc, ring !== 1)
        }
      }
    }
  }
}

function drawTiming(matrix: IWorkingMatrix): void {
  for (let index = 8; index < matrix.size - 8; index++) {
    const dark = index % 2 === 0
    if (!matrix.reserved[6][index]) {
      place(matrix, 6, index, dark)
    }
    if (!matrix.reserved[index][6]) {
      place(matrix, index, 6, dark)
    }
  }
}

function reserveFormatAreas(matrix: IWorkingMatrix, version: number): void {
  const size = matrix.size

  for (let index = 0; index <= 8; index++) {
    if (index !== 6) {
      matrix.reserved[8][index] = true
      matrix.reserved[index][8] = true
    }
  }
  for (let index = 0; index < 8; index++) {
    matrix.reserved[8][size - 1 - index] = true
    matrix.reserved[size - 1 - index][8] = true
  }

  // The always-dark module below the top-left finder.
  place(matrix, size - 8, 8, true)

  if (version >= 7) {
    for (let index = 0; index < 18; index++) {
      const row = Math.floor(index / 3)
      const column = size - 11 + (index % 3)
      matrix.reserved[row][column] = true
      matrix.reserved[column][row] = true
    }
  }
}

/** BCH(15,5) format information, masked with the standard's 0x5412. */
export function formatInformationBits(
  level: QrErrorCorrectionLevel,
  mask: number
): number {
  const data = (QrErrorCorrectionBits[level] << 3) | (mask & 0b111)
  let remainder = data << 10
  for (let bit = 14; bit >= 10; bit--) {
    if ((remainder & (1 << bit)) !== 0) {
      remainder ^= 0b10100110111 << (bit - 10)
    }
  }
  return ((data << 10) | remainder) ^ 0b101010000010010
}

/** BCH(18,6) version information, used from version 7 upwards. */
export function versionInformationBits(version: number): number {
  let remainder = version << 12
  for (let bit = 17; bit >= 12; bit--) {
    if ((remainder & (1 << bit)) !== 0) {
      remainder ^= 0b1111100100101 << (bit - 12)
    }
  }
  return (version << 12) | (remainder & 0xfff)
}

function writeFormatInformation(
  matrix: IWorkingMatrix,
  level: QrErrorCorrectionLevel,
  mask: number
): void {
  const bits = formatInformationBits(level, mask)
  const size = matrix.size

  for (let index = 0; index < 15; index++) {
    const dark = ((bits >> index) & 1) === 1

    // The copy around the top-left finder: bits 0–8 run down column 8, then
    // bits 9–14 run left along row 8.
    if (index < 6) {
      matrix.modules[index][8] = dark
    } else if (index === 6) {
      matrix.modules[7][8] = dark
    } else if (index === 7) {
      matrix.modules[8][8] = dark
    } else if (index === 8) {
      matrix.modules[8][7] = dark
    } else {
      matrix.modules[8][14 - index] = dark
    }

    // The split copy beside the other two finders.
    if (index < 8) {
      matrix.modules[8][size - 1 - index] = dark
    } else {
      matrix.modules[size - 15 + index][8] = dark
    }
  }
}

function writeVersionInformation(
  matrix: IWorkingMatrix,
  version: number
): void {
  if (version < 7) {
    return
  }
  const bits = versionInformationBits(version)
  const size = matrix.size

  for (let index = 0; index < 18; index++) {
    const dark = ((bits >> index) & 1) === 1
    const row = Math.floor(index / 3)
    const column = size - 11 + (index % 3)
    matrix.modules[row][column] = dark
    matrix.modules[column][row] = dark
  }
}

/** The eight data-mask conditions of ISO/IEC 18004 §8.8.1. */
export function maskCondition(
  mask: number,
  row: number,
  column: number
): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return column % 3 === 0
    case 3:
      return (row + column) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0
    case 7:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0
    default:
      throw new Error(`No such QR data mask: ${mask}`)
  }
}

/**
 * The zigzag module order the standard places codewords in: two-module-wide
 * columns from the bottom-right corner leftwards, alternating direction, with
 * the vertical timing column skipped entirely.
 */
export function codewordModuleOrder(
  size: number,
  reserved: ReadonlyArray<ReadonlyArray<boolean>>
): ReadonlyArray<readonly [row: number, column: number]> {
  const order: Array<readonly [number, number]> = []
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern; the pairing skips over it.
    const rightColumn = right <= 6 ? right - 1 : right

    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step
      for (const column of [rightColumn, rightColumn - 1]) {
        if (column < 0 || reserved[row][column]) {
          continue
        }
        order.push([row, column])
      }
    }
    upward = !upward
  }

  return order
}

function penalty(modules: ReadonlyArray<ReadonlyArray<boolean>>): number {
  const size = modules.length
  let score = 0

  // Rule 1: runs of five or more identical modules in a row or column.
  for (let index = 0; index < size; index++) {
    for (const readRow of [true, false]) {
      let runColour = modules[readRow ? index : 0][readRow ? 0 : index]
      let runLength = 1
      for (let step = 1; step < size; step++) {
        const module = readRow ? modules[index][step] : modules[step][index]
        if (module === runColour) {
          runLength++
          continue
        }
        if (runLength >= 5) {
          score += runLength - 2
        }
        runColour = module
        runLength = 1
      }
      if (runLength >= 5) {
        score += runLength - 2
      }
    }
  }

  // Rule 2: every 2×2 block of one colour.
  for (let row = 0; row < size - 1; row++) {
    for (let column = 0; column < size - 1; column++) {
      const first = modules[row][column]
      if (
        modules[row][column + 1] === first &&
        modules[row + 1][column] === first &&
        modules[row + 1][column + 1] === first
      ) {
        score += 3
      }
    }
  }

  // Rule 3: the 1:1:3:1:1 finder-lookalike, with four light modules on either
  // side, in any row or column.
  const pattern = [true, false, true, true, true, false, true]
  const light = [false, false, false, false]
  const matchesAt = (
    read: (offset: number) => boolean | undefined,
    sequence: ReadonlyArray<boolean>,
    start: number
  ) => sequence.every((value, offset) => read(start + offset) === value)

  for (let index = 0; index < size; index++) {
    for (const readRow of [true, false]) {
      const read = (offset: number) =>
        offset < 0 || offset >= size
          ? undefined
          : readRow
          ? modules[index][offset]
          : modules[offset][index]

      for (let start = 0; start <= size - 7; start++) {
        if (!matchesAt(read, pattern, start)) {
          continue
        }
        const before = matchesAt(read, light, start - 4)
        const after = matchesAt(read, light, start + 7)
        if (before || after) {
          score += 40
        }
      }
    }
  }

  // Rule 4: the deviation of the dark-module proportion from one half.
  let dark = 0
  for (const row of modules) {
    for (const module of row) {
      if (module) {
        dark++
      }
    }
  }
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

/** The smallest version that can carry `byteLength` bytes at this level. */
export function smallestVersionFor(
  byteLength: number,
  level: QrErrorCorrectionLevel
): number | null {
  for (let version = 1; version <= MaximumQrVersion; version++) {
    const capacityBits = dataCodewordCount(version, level) * 8
    const requiredBits = 4 + byteModeCountBits(version) + byteLength * 8
    if (requiredBits <= capacityBits) {
      return version
    }
  }
  return null
}

/** Build the interleaved codeword stream for a payload at a chosen version. */
function buildCodewords(
  payload: Uint8Array,
  version: number,
  level: QrErrorCorrectionLevel
): Array<number> {
  const capacity = dataCodewordCount(version, level)
  const countBits = byteModeCountBits(version)

  const bits: Array<number> = []
  const pushBits = (value: number, width: number) => {
    for (let index = width - 1; index >= 0; index--) {
      bits.push((value >> index) & 1)
    }
  }

  pushBits(QrModeByte, 4)
  pushBits(payload.length, countBits)
  for (const byte of payload) {
    pushBits(byte, 8)
  }

  // Terminator, up to four bits, then pad to a whole codeword.
  const capacityBits = capacity * 8
  for (let index = 0; index < 4 && bits.length < capacityBits; index++) {
    pushBits(QrModeTerminator, 1)
  }
  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  const data: Array<number> = []
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0
    for (let offset = 0; offset < 8; offset++) {
      byte = (byte << 1) | bits[index + offset]
    }
    data.push(byte)
  }
  for (let index = 0; data.length < capacity; index++) {
    data.push(PadBytes[index % PadBytes.length])
  }

  const layout = blockLayout(version, level)
  const dataBlocks: Array<Array<number>> = []
  const ecBlocks: Array<Array<number>> = []
  let cursor = 0

  const appendBlocks = (count: number, size: number) => {
    for (let index = 0; index < count; index++) {
      const block = data.slice(cursor, cursor + size)
      cursor += size
      dataBlocks.push(block)
      ecBlocks.push(reedSolomonEncode(block, layout.ecCodewordsPerBlock))
    }
  }

  appendBlocks(layout.group1Blocks, layout.group1DataCodewords)
  appendBlocks(layout.group2Blocks, layout.group2DataCodewords)

  const interleaved: Array<number> = []
  const longestData = Math.max(
    layout.group1DataCodewords,
    layout.group2DataCodewords
  )
  for (let index = 0; index < longestData; index++) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        interleaved.push(block[index])
      }
    }
  }
  for (let index = 0; index < layout.ecCodewordsPerBlock; index++) {
    for (const block of ecBlocks) {
      interleaved.push(block[index])
    }
  }

  return interleaved
}

/**
 * Draw every function pattern for a version and record which modules they own.
 *
 * Both the encoder and the decoder call this, so the two can never disagree
 * about which modules carry codewords — a disagreement that would make the app
 * unable to read its own QR while every unit test on either side still passed.
 */
export function buildFunctionPatterns(version: number): IWorkingMatrix {
  const size = moduleCount(version)
  const matrix = createWorkingMatrix(size)
  drawFinder(matrix, 0, 0)
  drawFinder(matrix, 0, size - 7)
  drawFinder(matrix, size - 7, 0)
  drawAlignment(matrix, version)
  drawTiming(matrix)
  reserveFormatAreas(matrix, version)
  return matrix
}

export interface IQrEncodeOptions {
  readonly level?: QrErrorCorrectionLevel
  /** Force a mask 0–7 instead of scoring for the best one. Tests use this. */
  readonly mask?: number
  /** Force a minimum version, so a symbol keeps its size across re-renders. */
  readonly minimumVersion?: number
}

/**
 * Encode UTF-8 text as a QR matrix.
 *
 * @throws {QrEncodeError} when the text does not fit in version 20 at the
 * requested error-correction level.
 */
export function encodeQr(
  text: string,
  options: IQrEncodeOptions = {}
): IQrMatrix {
  const level = options.level ?? DefaultQrErrorCorrectionLevel
  const payload = new TextEncoder().encode(text)

  const smallest = smallestVersionFor(payload.length, level)
  if (smallest === null) {
    throw new QrEncodeError(
      `${payload.length} bytes will not fit in a version-${MaximumQrVersion} QR symbol at error-correction level ${level}.`
    )
  }
  const version = Math.max(smallest, options.minimumVersion ?? 1)
  if (version > MaximumQrVersion) {
    throw new QrEncodeError(
      `QR version ${version} is above the supported maximum of ${MaximumQrVersion}.`
    )
  }

  const size = moduleCount(version)
  const codewords = buildCodewords(payload, version, level)

  const skeleton = buildFunctionPatterns(version)
  const order = codewordModuleOrder(size, skeleton.reserved)
  const bitCount = codewords.length * 8

  const candidates: Array<{ mask: number; modules: Array<Array<boolean>> }> = []
  const masks =
    options.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [options.mask]

  for (const mask of masks) {
    const modules = skeleton.modules.map(row => [...row])

    order.forEach(([row, column], index) => {
      const bit =
        index < bitCount ? (codewords[index >> 3] >> (7 - (index & 7))) & 1 : 0
      const dark = bit === 1
      modules[row][column] = maskCondition(mask, row, column) ? !dark : dark
    })

    const withFormat: IWorkingMatrix = {
      size,
      modules,
      reserved: skeleton.reserved,
    }
    writeFormatInformation(withFormat, level, mask)
    writeVersionInformation(withFormat, version)

    candidates.push({ mask, modules })
  }

  let best = candidates[0]
  let bestScore = penalty(best.modules)
  for (const candidate of candidates.slice(1)) {
    const score = penalty(candidate.modules)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return {
    size,
    version,
    level,
    mask: best.mask,
    modules: best.modules,
  }
}
