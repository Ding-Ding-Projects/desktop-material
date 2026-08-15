import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  gfDivide,
  gfMultiply,
  reedSolomonDecode,
  reedSolomonEncode,
} from '../../src/lib/authenticator/galois'
import {
  buildFunctionPatterns,
  codewordModuleOrder,
  DefaultQrErrorCorrectionLevel,
  encodeQr,
  formatInformationBits,
  maskCondition,
  QrEncodeError,
  QrQuietZoneModules,
  smallestVersionFor,
  versionInformationBits,
} from '../../src/lib/authenticator/qr-encode'
import {
  decodeQrFromRgba,
  decodeQrMatrix,
  luminanceFromRgba,
  otsuThreshold,
} from '../../src/lib/authenticator/qr-decode'
import {
  blockLayout,
  dataCodewordCount,
  MaximumQrVersion,
  moduleCount,
  QrErrorCorrectionLevels,
  rawCodewordCapacity,
  totalCodewordCount,
} from '../../src/lib/authenticator/qr-tables'
import { buildOtpauthUri } from '../../src/lib/authenticator/otpauth-uri'

/**
 * The in-process QR codec.
 *
 * The one failure this file exists to prevent is a shared-table error: a
 * mistyped row in `qr-tables.ts` would make the encoder and the decoder agree
 * perfectly with each other and produce a symbol no phone on earth can scan, so
 * a round-trip assertion alone proves nothing about that. Every table row is
 * therefore also checked against ISO/IEC 18004's own module-count formula,
 * which is derived from the symbol's geometry and shares no input with the
 * table.
 */

/** Render a module matrix as RGBA pixels, the way the surface paints it. */
function render(
  modules: ReadonlyArray<ReadonlyArray<boolean>>,
  scale: number,
  quiet: number
): { readonly width: number; readonly rgba: Uint8ClampedArray } {
  const size = modules.length
  const width = (size + quiet * 2) * scale
  const rgba = new Uint8ClampedArray(width * width * 4).fill(255)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!modules[row][column]) {
        continue
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (row + quiet) * scale + dy
          const x = (column + quiet) * scale + dx
          const offset = (y * width + x) * 4
          rgba[offset] = 0
          rgba[offset + 1] = 0
          rgba[offset + 2] = 0
          rgba[offset + 3] = 255
        }
      }
    }
  }
  return { width, rgba }
}

const SampleUri = buildOtpauthUri({
  account: 'lily@example.com',
  issuer: 'Desktop Material',
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
})

describe('the QR tables', () => {
  it('agrees with the standard’s own module-count formula', () => {
    // `rawCodewordCapacity` is computed from the symbol geometry — module
    // count, alignment patterns, version-information area — and shares no
    // input with the hand-entered block layouts. A mistyped row cannot satisfy
    // both.
    for (let version = 1; version <= MaximumQrVersion; version++) {
      const expected = rawCodewordCapacity(version)
      for (const level of QrErrorCorrectionLevels) {
        assert.equal(
          totalCodewordCount(version, level),
          expected,
          `version ${version} level ${level}`
        )
      }
    }
  })

  it('sizes every symbol as 4v+17 modules', () => {
    assert.equal(moduleCount(1), 21)
    assert.equal(moduleCount(10), 57)
    assert.equal(moduleCount(20), 97)
  })

  it('leaves fewer data codewords as the error correction gets stronger', () => {
    for (let version = 1; version <= MaximumQrVersion; version++) {
      const levels = QrErrorCorrectionLevels.map(level =>
        dataCodewordCount(version, level)
      )
      for (let index = 1; index < levels.length; index++) {
        assert.ok(
          levels[index] < levels[index - 1],
          `version ${version} level ${QrErrorCorrectionLevels[index]}`
        )
      }
    }
  })

  it('refuses a version outside the supported range', () => {
    assert.throws(() => blockLayout(0, 'M'), /outside the supported/)
    assert.throws(
      () => blockLayout(MaximumQrVersion + 1, 'M'),
      /outside the supported/
    )
  })
})

describe('GF(256) and Reed–Solomon', () => {
  it('multiplies and divides consistently', () => {
    for (let value = 1; value < 256; value++) {
      assert.equal(gfDivide(gfMultiply(value, 7), 7), value)
    }
    assert.equal(gfMultiply(0, 123), 0)
    assert.throws(() => gfDivide(1, 0), /Division by zero/)
  })

  it('corrects up to half the error-correction codewords', () => {
    // Deterministic pseudo-random rather than Math.random: a failing case must
    // reproduce on the next run rather than only on the run that found it.
    //
    // xorshift32 rather than a multiply-and-mask LCG: the multiply in a
    // textbook LCG overflows JavaScript's 53-bit float mantissa, the low bits
    // are lost, and the generator can settle on a fixed point — which turns
    // the `while` below into an infinite loop rather than a failing test.
    let seed = 20260811
    const next = () => {
      seed ^= seed << 13
      seed |= 0
      seed ^= seed >>> 17
      seed ^= seed << 5
      seed |= 0
      return seed >>> 0
    }

    for (let trial = 0; trial < 200; trial++) {
      const degree = 10 + (trial % 21)
      const dataLength = 16 + (trial % 40)
      const data = Array.from({ length: dataLength }, () => next() % 256)
      const block = [...data, ...reedSolomonEncode(data, degree)]

      const positions = new Set<number>()
      while (positions.size < Math.floor(degree / 2)) {
        positions.add(next() % block.length)
      }
      const damaged = [...block]
      for (const position of positions) {
        damaged[position] = (damaged[position] + 1 + (next() % 255)) % 256
      }

      assert.deepEqual(
        reedSolomonDecode(damaged, degree),
        block,
        `trial ${trial}: degree ${degree}, ${positions.size} errors`
      )
    }
  })

  it('reports an unrecoverable block rather than guessing at one', () => {
    // A mis-corrected block decodes into a plausible-looking secret that
    // produces codes nobody accepts, so past the code's capacity the honest
    // answer is null.
    const data = Array.from({ length: 30 }, (_, index) => (index * 11) % 256)
    const degree = 10
    const damaged = [...data, ...reedSolomonEncode(data, degree)]
    for (let index = 0; index < degree; index++) {
      damaged[index] ^= 0xa5
    }
    assert.equal(reedSolomonDecode(damaged, degree), null)
  })

  it('returns an undamaged block untouched', () => {
    const data = [1, 2, 3, 4, 5]
    const block = [...data, ...reedSolomonEncode(data, 10)]
    assert.deepEqual(reedSolomonDecode(block, 10), block)
  })
})

describe('format and version information', () => {
  it('encodes the format word the standard specifies', () => {
    // ISO/IEC 18004 Table C.1: level M with mask 0 is 0b101010000010010.
    assert.equal(formatInformationBits('M', 0), 0b101010000010010)
    assert.equal(formatInformationBits('L', 0), 0b111011111000100)
    assert.equal(formatInformationBits('Q', 7), 0b010101111101101)
  })

  it('gives every format word at least three bits of separation', () => {
    // The BCH(15,5) code has distance 7, so any two legal words differ in at
    // least seven places. The decoder relies on that to correct a damaged one.
    const words: Array<number> = []
    for (const level of QrErrorCorrectionLevels) {
      for (let mask = 0; mask < 8; mask++) {
        words.push(formatInformationBits(level, mask))
      }
    }
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        let difference = words[i] ^ words[j]
        let distance = 0
        while (difference !== 0) {
          distance += difference & 1
          difference >>= 1
        }
        assert.ok(distance >= 7, `words ${i} and ${j} differ in ${distance}`)
      }
    }
  })

  it('encodes the version word the standard specifies', () => {
    // ISO/IEC 18004 Table D.1, in the hexadecimal form every reference
    // implementation publishes it in.
    assert.equal(versionInformationBits(7), 0x07c94)
    assert.equal(versionInformationBits(10), 0x0a4d3)
    assert.equal(versionInformationBits(20), 0x149a6)
  })

  it('leaves the six version bits readable in the top of the word', () => {
    for (let version = 7; version <= MaximumQrVersion; version++) {
      assert.equal(versionInformationBits(version) >> 12, version)
    }
  })
})

describe('the module layout', () => {
  it('places exactly as many codeword modules as the version can carry', () => {
    for (let version = 1; version <= MaximumQrVersion; version++) {
      const patterns = buildFunctionPatterns(version)
      const order = codewordModuleOrder(patterns.size, patterns.reserved)
      // The standard's remainder bits are the difference between the placed
      // modules and eight times the codeword count; there are never eight of
      // them, or another codeword would fit.
      const remainder = order.length - rawCodewordCapacity(version) * 8
      assert.ok(
        remainder >= 0 && remainder < 8,
        `version ${version} left ${remainder} remainder bits`
      )
    }
  })

  it('never places a codeword twice or in a function pattern', () => {
    const patterns = buildFunctionPatterns(7)
    const order = codewordModuleOrder(patterns.size, patterns.reserved)
    const seen = new Set<string>()
    for (const [row, column] of order) {
      const key = `${row},${column}`
      assert.equal(seen.has(key), false, `${key} placed twice`)
      seen.add(key)
      assert.equal(patterns.reserved[row][column], false, `${key} is reserved`)
    }
  })

  it('implements all eight mask conditions', () => {
    assert.equal(maskCondition(0, 0, 0), true)
    assert.equal(maskCondition(0, 0, 1), false)
    assert.equal(maskCondition(1, 2, 5), true)
    assert.equal(maskCondition(2, 5, 3), true)
    assert.equal(maskCondition(3, 1, 2), true)
    assert.equal(maskCondition(4, 0, 0), true)
    assert.equal(maskCondition(5, 0, 0), true)
    assert.equal(maskCondition(6, 0, 0), true)
    assert.equal(maskCondition(7, 0, 0), true)
    assert.throws(() => maskCondition(8, 0, 0), /No such QR data mask/)
  })
})

describe('encoding and decoding', () => {
  it('round-trips through every mask at every error-correction level', () => {
    for (const level of QrErrorCorrectionLevels) {
      for (let mask = 0; mask < 8; mask++) {
        const matrix = encodeQr('mask probe 12345', { level, mask })
        assert.equal(matrix.mask, mask)
        assert.equal(matrix.level, level)
        const decoded = decodeQrMatrix(matrix.modules)
        assert.ok(
          decoded.ok,
          `level ${level} mask ${mask}: ${!decoded.ok && decoded.reason}`
        )
        assert.equal(decoded.text, 'mask probe 12345')
      }
    }
  })

  it('round-trips a real pairing URI', () => {
    const matrix = encodeQr(SampleUri)
    const decoded = decodeQrMatrix(matrix.modules)
    assert.ok(decoded.ok)
    assert.equal(decoded.text, SampleUri)
  })

  it('round-trips at every version the encoder will reach', () => {
    // One payload per version: the smallest length that no smaller version can
    // carry, so the version-information area is exercised from 7 upwards.
    for (let version = 1; version <= MaximumQrVersion; version++) {
      const capacity = dataCodewordCount(version, DefaultQrErrorCorrectionLevel)
      const previous =
        version === 1
          ? 0
          : dataCodewordCount(version - 1, DefaultQrErrorCorrectionLevel)
      const length = Math.min(capacity - 3, previous)
      const text = 'v'.repeat(Math.max(1, length))
      const matrix = encodeQr(text)
      assert.ok(matrix.version >= version - 1)
      const decoded = decodeQrMatrix(matrix.modules)
      assert.ok(decoded.ok, `version ${version}`)
      assert.equal(decoded.text, text)
    }
  })

  it('carries non-ASCII text through byte mode as UTF-8', () => {
    const text = '驗證器 · lily@example.com'
    const decoded = decodeQrMatrix(encodeQr(text).modules)
    assert.ok(decoded.ok)
    assert.equal(decoded.text, text)
  })

  it('picks the smallest version that fits and honours a floor', () => {
    assert.equal(smallestVersionFor(10, 'M'), 1)
    assert.equal(smallestVersionFor(dataCodewordCount(1, 'M'), 'M'), 2)
    assert.equal(smallestVersionFor(100_000, 'M'), null)
    assert.equal(encodeQr('short', { minimumVersion: 5 }).version, 5)
  })

  it('refuses a payload no supported version can carry', () => {
    assert.throws(() => encodeQr('x'.repeat(20_000)), QrEncodeError)
  })

  it('survives damage up to the level’s correction capacity', () => {
    // Level Q corrects roughly a quarter of the codewords. Flipping a patch of
    // data modules is what a smudge on a printed code does.
    const matrix = encodeQr(SampleUri, { level: 'Q', mask: 0 })
    const damaged = matrix.modules.map(row => [...row])
    const patterns = buildFunctionPatterns(matrix.version)
    const order = codewordModuleOrder(matrix.size, patterns.reserved)
    for (let index = 0; index < 40; index++) {
      const [row, column] = order[index]
      damaged[row][column] = !damaged[row][column]
    }
    const decoded = decodeQrMatrix(damaged)
    assert.ok(decoded.ok)
    assert.equal(decoded.text, SampleUri)
  })

  it('names why a matrix cannot be read rather than returning nothing', () => {
    const tooSmall = decodeQrMatrix([[true, false]])
    assert.equal(tooSmall.ok, false)
    assert.equal(tooSmall.ok ? '' : tooSmall.reason, 'not-a-qr-grid')

    const ragged = decodeQrMatrix([
      [true, true, true],
      [true, true],
    ])
    assert.equal(ragged.ok, false)
  })
})

describe('reading a QR out of an image', () => {
  it('decodes a rendered symbol at several scales', () => {
    const matrix = encodeQr(SampleUri)
    for (const scale of [3, 4, 7]) {
      const { width, rgba } = render(matrix.modules, scale, QrQuietZoneModules)
      const decoded = decodeQrFromRgba(width, width, rgba)
      assert.ok(decoded.ok, `scale ${scale}: ${!decoded.ok && decoded.reason}`)
      assert.equal(decoded.text, SampleUri)
    }
  })

  it('decodes a small symbol as readily as a large one', () => {
    for (const text of ['HELLO', SampleUri, 'x'.repeat(400)]) {
      const matrix = encodeQr(text)
      const { width, rgba } = render(matrix.modules, 4, QrQuietZoneModules)
      const decoded = decodeQrFromRgba(width, width, rgba)
      assert.ok(
        decoded.ok,
        `${text.slice(0, 12)}: ${!decoded.ok && decoded.reason}`
      )
      assert.equal(decoded.text, text)
    }
  })

  it('reports an image with no finder patterns in it', () => {
    const blank = new Uint8ClampedArray(64 * 64 * 4).fill(255)
    const decoded = decodeQrFromRgba(64, 64, blank)
    assert.equal(decoded.ok, false)
    assert.equal(decoded.ok ? '' : decoded.reason, 'no-finder-patterns')
  })

  it('reports an image far too small to hold a symbol', () => {
    const tiny = new Uint8ClampedArray(8 * 8 * 4).fill(255)
    assert.equal(decodeQrFromRgba(8, 8, tiny).ok, false)
  })

  it('separates the two brightness modes of a rendered symbol', () => {
    // A pure black-and-white render is separated by any threshold below 255,
    // so the interesting case is a low-contrast one: the threshold must land
    // strictly between the two tones rather than at an end of the range.
    const matrix = encodeQr('HELLO')
    const { width, rgba } = render(matrix.modules, 4, QrQuietZoneModules)

    const flat = luminanceFromRgba(width, width, rgba)
    assert.ok(otsuThreshold(flat) < 255, 'a two-tone image must be separable')

    const greyed = {
      width: flat.width,
      height: flat.height,
      data: Uint8ClampedArray.from(flat.data, value =>
        value < 128 ? 60 : 200
      ),
    }
    const threshold = otsuThreshold(greyed)
    assert.ok(
      threshold >= 60 && threshold < 200,
      `threshold ${threshold} did not land between the two tones`
    )
  })
})
