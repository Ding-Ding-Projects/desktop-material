/**
 * The ISO/IEC 18004 tables the QR codec reads, for versions 1 to 20.
 *
 * Twenty versions is a deliberate ceiling rather than an unfinished one:
 * version 20 at error-correction level M carries 666 data codewords, and the
 * longest `otpauth://totp/` URI this app will look at is 4096 characters — of
 * which a realistic one is under 250. A payload past version 20 is refused
 * with a named error instead of being silently truncated.
 *
 * A mistyped row here produces a QR that this app's own decoder reads back
 * perfectly and no phone in the world can scan, because both sides would share
 * the same wrong table. `app/test/unit/authenticator-qr-test.ts` therefore
 * checks every row against the standard's own module-count formula, which is
 * derived independently of these numbers.
 */

/** The four error-correction levels, in the standard's own bit order. */
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/** Every level, weakest first. */
export const QrErrorCorrectionLevels: ReadonlyArray<QrErrorCorrectionLevel> = [
  'L',
  'M',
  'Q',
  'H',
]

/**
 * The two-bit field-info encoding of each level. Note that it is not the
 * obvious 0..3 — the standard orders them M, L, H, Q.
 */
export const QrErrorCorrectionBits: Readonly<
  Record<QrErrorCorrectionLevel, number>
> = { M: 0b00, L: 0b01, H: 0b10, Q: 0b11 }

/** The reverse of {@link QrErrorCorrectionBits}, for the decoder. */
export function levelFromBits(bits: number): QrErrorCorrectionLevel | null {
  switch (bits & 0b11) {
    case 0b00:
      return 'M'
    case 0b01:
      return 'L'
    case 0b10:
      return 'H'
    case 0b11:
      return 'Q'
    default:
      return null
  }
}

/** The highest version this codec builds and reads. */
export const MaximumQrVersion = 20

/** One version-and-level row: how the codewords are split into RS blocks. */
export interface IQrBlockLayout {
  /** Error-correction codewords per block. */
  readonly ecCodewordsPerBlock: number
  /** How many blocks carry `group1DataCodewords` data codewords. */
  readonly group1Blocks: number
  readonly group1DataCodewords: number
  /** How many blocks carry one more data codeword than group one. Often zero. */
  readonly group2Blocks: number
  readonly group2DataCodewords: number
}

type Row = readonly [
  ecCodewordsPerBlock: number,
  group1Blocks: number,
  group1DataCodewords: number,
  group2Blocks: number,
  group2DataCodewords: number
]

/** Indexed by version (1-based, index 0 unused), then by level. */
const Layouts: ReadonlyArray<Readonly<Record<QrErrorCorrectionLevel, Row>>> = [
  // Index 0 is a placeholder so the array is indexed by version directly.
  {
    L: [0, 0, 0, 0, 0],
    M: [0, 0, 0, 0, 0],
    Q: [0, 0, 0, 0, 0],
    H: [0, 0, 0, 0, 0],
  },
  {
    L: [7, 1, 19, 0, 0],
    M: [10, 1, 16, 0, 0],
    Q: [13, 1, 13, 0, 0],
    H: [17, 1, 9, 0, 0],
  },
  {
    L: [10, 1, 34, 0, 0],
    M: [16, 1, 28, 0, 0],
    Q: [22, 1, 22, 0, 0],
    H: [28, 1, 16, 0, 0],
  },
  {
    L: [15, 1, 55, 0, 0],
    M: [26, 1, 44, 0, 0],
    Q: [18, 2, 17, 0, 0],
    H: [22, 2, 13, 0, 0],
  },
  {
    L: [20, 1, 80, 0, 0],
    M: [18, 2, 32, 0, 0],
    Q: [26, 2, 24, 0, 0],
    H: [16, 4, 9, 0, 0],
  },
  {
    L: [26, 1, 108, 0, 0],
    M: [24, 2, 43, 0, 0],
    Q: [18, 2, 15, 2, 16],
    H: [22, 2, 11, 2, 12],
  },
  {
    L: [18, 2, 68, 0, 0],
    M: [16, 4, 27, 0, 0],
    Q: [24, 4, 19, 0, 0],
    H: [28, 4, 15, 0, 0],
  },
  {
    L: [20, 2, 78, 0, 0],
    M: [18, 4, 31, 0, 0],
    Q: [18, 2, 14, 4, 15],
    H: [26, 4, 13, 1, 14],
  },
  {
    L: [24, 2, 97, 0, 0],
    M: [22, 2, 38, 2, 39],
    Q: [22, 4, 18, 2, 19],
    H: [26, 4, 14, 2, 15],
  },
  {
    L: [30, 2, 116, 0, 0],
    M: [22, 3, 36, 2, 37],
    Q: [20, 4, 16, 4, 17],
    H: [24, 4, 12, 4, 13],
  },
  {
    L: [18, 2, 68, 2, 69],
    M: [26, 4, 43, 1, 44],
    Q: [24, 6, 19, 2, 20],
    H: [28, 6, 15, 2, 16],
  },
  {
    L: [20, 4, 81, 0, 0],
    M: [30, 1, 50, 4, 51],
    Q: [28, 4, 22, 4, 23],
    H: [24, 3, 12, 8, 13],
  },
  {
    L: [24, 2, 92, 2, 93],
    M: [22, 6, 36, 2, 37],
    Q: [26, 4, 20, 6, 21],
    H: [28, 7, 14, 4, 15],
  },
  {
    L: [26, 4, 107, 0, 0],
    M: [22, 8, 37, 1, 38],
    Q: [24, 8, 20, 4, 21],
    H: [22, 12, 11, 4, 12],
  },
  {
    L: [30, 3, 115, 1, 116],
    M: [24, 4, 40, 5, 41],
    Q: [20, 11, 16, 5, 17],
    H: [24, 11, 12, 5, 13],
  },
  {
    L: [22, 5, 87, 1, 88],
    M: [24, 5, 41, 5, 42],
    Q: [30, 5, 24, 7, 25],
    H: [24, 11, 12, 7, 13],
  },
  {
    L: [24, 5, 98, 1, 99],
    M: [28, 7, 45, 3, 46],
    Q: [24, 15, 19, 2, 20],
    H: [30, 3, 15, 13, 16],
  },
  {
    L: [28, 1, 107, 5, 108],
    M: [28, 10, 46, 1, 47],
    Q: [28, 1, 22, 15, 23],
    H: [28, 2, 14, 17, 15],
  },
  {
    L: [30, 5, 120, 1, 121],
    M: [26, 9, 43, 4, 44],
    Q: [28, 17, 22, 1, 23],
    H: [28, 2, 14, 19, 15],
  },
  {
    L: [28, 3, 113, 4, 114],
    M: [26, 3, 44, 11, 45],
    Q: [26, 17, 21, 4, 22],
    H: [26, 9, 13, 16, 14],
  },
  {
    L: [28, 3, 107, 5, 108],
    M: [26, 3, 41, 13, 42],
    Q: [30, 15, 24, 5, 25],
    H: [28, 15, 15, 10, 16],
  },
]

/** The RS block layout for a version and level. */
export function blockLayout(
  version: number,
  level: QrErrorCorrectionLevel
): IQrBlockLayout {
  if (version < 1 || version > MaximumQrVersion) {
    throw new Error(`QR version ${version} is outside the supported 1–20 range`)
  }
  const row = Layouts[version][level]
  return {
    ecCodewordsPerBlock: row[0],
    group1Blocks: row[1],
    group1DataCodewords: row[2],
    group2Blocks: row[3],
    group2DataCodewords: row[4],
  }
}

/** Data codewords available to the payload at this version and level. */
export function dataCodewordCount(
  version: number,
  level: QrErrorCorrectionLevel
): number {
  const layout = blockLayout(version, level)
  return (
    layout.group1Blocks * layout.group1DataCodewords +
    layout.group2Blocks * layout.group2DataCodewords
  )
}

/** Data plus error-correction codewords — the whole symbol's capacity. */
export function totalCodewordCount(
  version: number,
  level: QrErrorCorrectionLevel
): number {
  const layout = blockLayout(version, level)
  return (
    layout.group1Blocks *
      (layout.group1DataCodewords + layout.ecCodewordsPerBlock) +
    layout.group2Blocks *
      (layout.group2DataCodewords + layout.ecCodewordsPerBlock)
  )
}

/** The symbol's width and height in modules. */
export function moduleCount(version: number): number {
  return version * 4 + 17
}

/**
 * The standard's own count of codeword-carrying modules, derived from the
 * geometry rather than from {@link Layouts}.
 *
 * This is what makes the table above checkable: the two numbers are computed
 * from entirely different inputs and must agree.
 */
export function rawCodewordCapacity(version: number): number {
  let modules = 16 * version * version + 128 * version + 64

  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2
    modules -= 25 * alignments * alignments - 10 * alignments - 55
  }
  if (version >= 7) {
    modules -= 36
  }

  return Math.floor(modules / 8)
}

/** Alignment-pattern centre coordinates, indexed by version. */
const AlignmentCentres: ReadonlyArray<ReadonlyArray<number>> = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
]

/** Where the alignment patterns sit for a version. Empty for version 1. */
export function alignmentCentres(version: number): ReadonlyArray<number> {
  if (version < 1 || version > MaximumQrVersion) {
    throw new Error(`QR version ${version} is outside the supported 1–20 range`)
  }
  return AlignmentCentres[version]
}

/** Bits the byte-mode character count uses at this version. */
export function byteModeCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

/** The four-bit mode indicators this codec understands. */
export const QrModeNumeric = 0b0001
export const QrModeAlphanumeric = 0b0010
export const QrModeByte = 0b0100
export const QrModeKanji = 0b1000
export const QrModeEci = 0b0111
export const QrModeTerminator = 0b0000
