import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  MaxLogoImageBytes,
  MaxLogoImageDimension,
  MinLogoImageDimension,
  describeLogoRejection,
  detectImageFormat,
  inspectLogoImage,
  planLogoConversion,
  readImageDimensions,
} from '../../src/lib/logo-image'

/**
 * Fixtures are built byte by byte rather than checked in as files.
 *
 * The point of this module is that the bytes decide, so a test that reads a
 * `.png` off disk and trusts it to be a PNG has quietly reintroduced the
 * assumption under test. Constructing the header here means each case states
 * exactly which byte it is exercising, and a hostile case — a 60,000 pixel
 * declaration, an extension that lies — can be written as easily as a valid
 * one.
 */

function png(
  width: number,
  height: number,
  options: { readonly animated?: boolean } = {}
): Uint8Array {
  const chunks: Array<number> = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const header = new Uint8Array(25)
  const view = new DataView(header.buffer)
  view.setUint32(0, 13)
  header.set([0x49, 0x48, 0x44, 0x52], 4)
  view.setUint32(8, width)
  view.setUint32(12, height)
  chunks.push(...header)
  if (options.animated === true) {
    // acTL, which must precede IDAT to mean anything.
    chunks.push(0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c, 0, 0, 0, 2, 0, 0, 0, 0)
  }
  chunks.push(0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0)
  return new Uint8Array(chunks)
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes: Array<number> = [0xff, 0xd8, 0xff]
  // An APP0 segment first, so the walk has to actually walk rather than find
  // the frame header at a fixed offset.
  bytes.push(0xe0, 0x00, 0x10)
  for (let index = 0; index < 14; index++) {
    bytes.push(0)
  }
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08)
  bytes.push((height >> 8) & 0xff, height & 0xff)
  bytes.push((width >> 8) & 0xff, width & 0xff)
  for (let index = 0; index < 8; index++) {
    bytes.push(0)
  }
  return new Uint8Array(bytes)
}

function webpLossless(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12)
  const packed = (width - 1) | ((height - 1) << 14)
  new DataView(bytes.buffer).setUint32(21, packed, true)
  return bytes
}

function bmp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([0x42, 0x4d], 0)
  const view = new DataView(bytes.buffer)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  return bytes
}

function gif(): Uint8Array {
  return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0])
}

function svg(): Uint8Array {
  const text = '  <svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'
  return new Uint8Array([...text].map(character => character.charCodeAt(0)))
}

describe('logo image inspection', () => {
  describe('the bytes decide, not the name', () => {
    it('identifies each accepted format from its signature', () => {
      assert.strictEqual(detectImageFormat(png(64, 64)), 'png')
      assert.strictEqual(detectImageFormat(jpeg(64, 64)), 'jpeg')
      assert.strictEqual(detectImageFormat(webpLossless(64, 64)), 'webp')
      assert.strictEqual(detectImageFormat(bmp(64, 64)), 'bmp')
    })

    it('names a rejected format instead of calling it unrecognised', () => {
      assert.strictEqual(detectImageFormat(gif()), 'gif')
      assert.strictEqual(detectImageFormat(svg()), 'svg')
    })

    it('refuses a file whose bytes are not an image at all', () => {
      const text = new Uint8Array([...'not an image'].map(c => c.charCodeAt(0)))
      assert.strictEqual(detectImageFormat(text), null)

      const result = inspectLogoImage(text)
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'unrecognised'
      )
    })

    it('does not accept a WebP tag without the RIFF container around it', () => {
      // The four `WEBP` bytes at offset 8, and nothing else. A signature check
      // that looked only there would accept this.
      const impostor = new Uint8Array(32)
      impostor.set([0x57, 0x45, 0x42, 0x50], 8)
      assert.strictEqual(detectImageFormat(impostor), null)
    })

    it('reads the AVIF brand rather than assuming from the box', () => {
      const bytes = new Uint8Array(32)
      bytes.set([0x66, 0x74, 0x79, 0x70], 4)
      bytes.set([0x61, 0x76, 0x69, 0x66], 8)
      assert.strictEqual(detectImageFormat(bytes), 'avif')

      // The same box shape carrying an MP4 brand is not an image we recognise.
      const video = new Uint8Array(32)
      video.set([0x66, 0x74, 0x79, 0x70], 4)
      video.set([0x69, 0x73, 0x6f, 0x6d], 8)
      assert.strictEqual(detectImageFormat(video), null)
    })
  })

  describe('dimensions come out of the header, not a decoder', () => {
    it('reads each format', () => {
      assert.deepStrictEqual(readImageDimensions('png', png(320, 200)), {
        width: 320,
        height: 200,
      })
      assert.deepStrictEqual(readImageDimensions('jpeg', jpeg(320, 200)), {
        width: 320,
        height: 200,
      })
      assert.deepStrictEqual(
        readImageDimensions('webp', webpLossless(320, 200)),
        { width: 320, height: 200 }
      )
      assert.deepStrictEqual(readImageDimensions('bmp', bmp(320, 200)), {
        width: 320,
        height: 200,
      })
    })

    it('treats a negative BMP height as top-down rather than as a size', () => {
      assert.deepStrictEqual(readImageDimensions('bmp', bmp(320, -200)), {
        width: 320,
        height: 200,
      })
    })

    it('refuses a header declaring a zero side', () => {
      // Left unchecked this reaches a comparison as 0, which is below every
      // maximum, so the image would pass the bounds it should fail.
      assert.strictEqual(readImageDimensions('png', png(0, 64)), null)
    })

    it('does not spin on a JPEG claiming a zero-length segment', () => {
      const bytes = new Uint8Array(64)
      bytes.set([0xff, 0xd8, 0xff], 0)
      bytes.set([0xe0, 0x00, 0x00], 3)
      assert.strictEqual(readImageDimensions('jpeg', bytes), null)
    })
  })

  describe('bounds are checked before anything decodes', () => {
    it('accepts an ordinary logo', () => {
      const result = inspectLogoImage(png(512, 512))
      assert.strictEqual(result.accepted, true)
      if (result.accepted) {
        assert.strictEqual(result.image.format, 'png')
        assert.strictEqual(result.image.mayHaveTransparency, true)
        assert.deepStrictEqual(result.image.dimensions, {
          width: 512,
          height: 512,
        })
      }
    })

    it('refuses a decompression bomb on its declared size alone', () => {
      // 60,000 squared is about fourteen gigabytes decoded, declared in a
      // header a few dozen bytes long. Nothing here allocates it.
      const bomb = png(60000, 60000)
      assert.ok(bomb.length < 1024, 'the fixture is small; the claim is not')

      const result = inspectLogoImage(bomb)
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'dimension-limit'
      )
    })

    it('refuses a long thin slab that passes every per-side check', () => {
      // 4096 x 4096 is exactly at the per-side limit in both directions, so a
      // per-side check alone lets it through at 64MB decoded. The area budget
      // is what actually holds here.
      const wide = png(MaxLogoImageDimension, MaxLogoImageDimension)
      const result = inspectLogoImage(wide)
      assert.strictEqual(result.accepted, true, 'exactly at the limit is fine')

      const over = png(MaxLogoImageDimension + 1, 8)
      assert.strictEqual(
        inspectLogoImage(over).accepted,
        false,
        'one pixel past the per-side limit is not'
      )
    })

    it('refuses an image too small to render at any icon size', () => {
      const result = inspectLogoImage(png(MinLogoImageDimension - 1, 64))
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'too-small'
      )
    })

    it('refuses a file past the byte limit before reading its header', () => {
      const huge = new Uint8Array(MaxLogoImageBytes + 1)
      huge.set(png(64, 64), 0)
      const result = inspectLogoImage(huge)
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'too-large'
      )
    })

    it('refuses an empty file', () => {
      const result = inspectLogoImage(new Uint8Array(0))
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'empty'
      )
    })

    it('refuses an animated PNG, and says it is the animation', () => {
      const result = inspectLogoImage(png(64, 64, { animated: true }))
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'animated'
      )
    })

    it('does not read an acTL sequence appearing after the image data', () => {
      // Those four bytes can occur inside compressed pixel data by chance. Only
      // a real animation control chunk precedes IDAT, so the search stops there.
      const still = png(64, 64)
      const withLateBytes = new Uint8Array(still.length + 8)
      withLateBytes.set(still, 0)
      withLateBytes.set([0x61, 0x63, 0x54, 0x4c], still.length)
      assert.strictEqual(inspectLogoImage(withLateBytes).accepted, true)
    })

    it('refuses SVG, which is a document that can carry script', () => {
      const result = inspectLogoImage(svg())
      assert.strictEqual(result.accepted, false)
      assert.ok(!result.accepted)
      const rejection = result.accepted === false ? result.rejection : null
      assert.strictEqual(rejection?.kind, 'unsupported-format')
      assert.strictEqual(
        rejection?.kind === 'unsupported-format' ? rejection.format : null,
        'svg'
      )
    })

    it('refuses a truncated file whose signature was fine', () => {
      const result = inspectLogoImage(
        new Uint8Array(png(64, 64).subarray(0, 12))
      )
      assert.strictEqual(result.accepted, false)
      assert.strictEqual(
        result.accepted === false ? result.rejection.kind : null,
        'malformed'
      )
    })
  })

  describe('a refusal says what to do about it', () => {
    it('names the reason for every rejection this module can produce', () => {
      const cases = [
        inspectLogoImage(new Uint8Array(0)),
        inspectLogoImage(new Uint8Array(MaxLogoImageBytes + 1)),
        inspectLogoImage(new Uint8Array([1, 2, 3, 4])),
        inspectLogoImage(gif()),
        inspectLogoImage(png(64, 64, { animated: true })),
        inspectLogoImage(new Uint8Array(png(64, 64).subarray(0, 12))),
        inspectLogoImage(png(8, 8)),
        inspectLogoImage(png(60000, 60000)),
      ]

      const kinds = new Set<string>()
      for (const result of cases) {
        assert.strictEqual(result.accepted, false)
        if (result.accepted === false) {
          kinds.add(result.rejection.kind)
          const text = describeLogoRejection(result.rejection)
          assert.ok(text.length > 0, 'every rejection has copy')
          assert.ok(text.endsWith('.'), `rejection copy is a sentence: ${text}`)
        }
      }

      // Named individually so that adding a rejection kind without copy for it
      // fails here rather than passing on the strength of the others.
      for (const expected of [
        'empty',
        'too-large',
        'unrecognised',
        'unsupported-format',
        'animated',
        'malformed',
        'too-small',
        'dimension-limit',
      ]) {
        assert.ok(kinds.has(expected), `no case covers ${expected}`)
      }
    })
  })

  describe('a conversion says what it will change before it changes it', () => {
    const accepted = (bytes: Uint8Array) => {
      const result = inspectLogoImage(bytes)
      assert.strictEqual(result.accepted, true)
      if (!result.accepted) {
        throw new Error('unreachable')
      }
      return result.image
    }

    it('loses nothing converting a square PNG at its own size', () => {
      const plan = planLogoConversion(accepted(png(256, 256)), {
        renderedSize: 256,
        flattenTransparency: false,
        cropped: false,
      })
      assert.deepStrictEqual(plan.losses, [])
    })

    it('discloses the re-encode and the profile flattening for a JPEG', () => {
      const plan = planLogoConversion(accepted(jpeg(256, 256)), {
        renderedSize: 256,
        flattenTransparency: false,
        cropped: false,
      })
      const kinds = plan.losses.map(loss => loss.kind)
      assert.ok(kinds.includes('format'))
      assert.ok(kinds.includes('colour-profile'))
    })

    it('discloses a downscale, and names both sizes', () => {
      const plan = planLogoConversion(accepted(png(2048, 2048)), {
        renderedSize: 256,
        flattenTransparency: false,
        cropped: false,
      })
      const downscale = plan.losses.find(loss => loss.kind === 'downscale')
      assert.ok(downscale !== undefined)
      assert.ok(downscale.detail.includes('2048'))
      assert.ok(downscale.detail.includes('256'))
    })

    it('discloses flattening only when transparency is actually flattened', () => {
      const opaque = planLogoConversion(accepted(jpeg(256, 256)), {
        renderedSize: 256,
        flattenTransparency: true,
        cropped: false,
      })
      assert.ok(
        !opaque.losses.some(loss => loss.kind === 'transparency'),
        'a JPEG has no transparency to lose'
      )

      const alpha = planLogoConversion(accepted(png(256, 256)), {
        renderedSize: 256,
        flattenTransparency: true,
        cropped: false,
      })
      assert.ok(alpha.losses.some(loss => loss.kind === 'transparency'))
    })

    it('says a non-square image gets fitted, unless it was cropped', () => {
      const fitted = planLogoConversion(accepted(png(400, 200)), {
        renderedSize: 256,
        flattenTransparency: false,
        cropped: false,
      })
      assert.ok(fitted.losses.some(loss => loss.kind === 'crop'))

      const cropped = planLogoConversion(accepted(png(400, 200)), {
        renderedSize: 256,
        flattenTransparency: false,
        cropped: true,
      })
      assert.strictEqual(
        cropped.losses.filter(loss => loss.kind === 'crop').length,
        1,
        'a cropped image is disclosed once, not twice'
      )
    })
  })
})
