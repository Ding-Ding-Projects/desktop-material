import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DefaultBase64Options,
  buildTextDataUrl,
  decodeBase64Text,
  encodeBase64Text,
} from '../../src/lib/base64-toolkit'

const text = (result: ReturnType<typeof encodeBase64Text>) => {
  assert.ok(result.ok, result.ok ? '' : result.error)
  return result.text
}
const error = (result: ReturnType<typeof encodeBase64Text>) => {
  assert.ok(!result.ok)
  return result.error
}

describe('Base64 toolkit', () => {
  it('encodes UTF-8 text in each variant', () => {
    assert.equal(
      text(encodeBase64Text('點心?>', DefaultBase64Options)),
      '6bue5b+DPz4='
    )
    assert.equal(
      text(
        encodeBase64Text('點心?>', {
          ...DefaultBase64Options,
          variant: 'url-safe',
          padding: false,
        })
      ),
      '6bue5b-DPz4'
    )
    const mime = text(
      encodeBase64Text('x'.repeat(100), {
        ...DefaultBase64Options,
        variant: 'mime',
      })
    )
    const lines = mime.split('\r\n')
    assert.equal(lines.length, 2)
    assert.equal(lines[0].length, 76)
  })

  it('round-trips every variant, ignoring whitespace', () => {
    for (const variant of ['standard', 'url-safe', 'mime'] as const) {
      const options = { ...DefaultBase64Options, variant }
      const source =
        'Desktop Material ships motion everywhere. 飲茶 ~?>'.repeat(4)
      assert.equal(
        text(
          decodeBase64Text(text(encodeBase64Text(source, options)), options)
        ),
        source
      )
    }
    assert.equal(
      text(decodeBase64Text(' QU\nJD ', DefaultBase64Options)),
      'ABC'
    )
  })

  it('names the offset of a character that does not belong', () => {
    assert.match(
      error(decodeBase64Text('QUJ*', DefaultBase64Options)),
      /Character "\*" at offset 3 is not Base64/
    )
    assert.match(
      error(decodeBase64Text('6bue5b-D', DefaultBase64Options)),
      /Character "-" at offset 6/
    )
    assert.match(
      error(decodeBase64Text('QQ==QQ==', DefaultBase64Options)),
      /follows the padding/
    )
  })

  it('requires padding only in strict mode', () => {
    assert.match(
      error(decodeBase64Text('QUI', DefaultBase64Options)),
      /not a multiple of 4/
    )
    assert.equal(
      text(decodeBase64Text('QUI', { ...DefaultBase64Options, strict: false })),
      'AB'
    )
    assert.match(
      error(
        decodeBase64Text('QUJDR', { ...DefaultBase64Options, strict: false })
      ),
      /one character is left over/
    )
    assert.match(
      error(decodeBase64Text('QUI==', DefaultBase64Options)),
      /padding does not match/
    )
  })

  it('refuses bytes that are not UTF-8 text instead of showing garbage', () => {
    assert.match(
      error(decodeBase64Text('/w==', DefaultBase64Options)),
      /not UTF-8 text/
    )
  })

  it('builds a data URL and checks the media type', () => {
    assert.equal(
      text(buildTextDataUrl('hi', 'text/plain')),
      'data:text/plain;charset=utf-8;base64,aGk='
    )
    assert.match(error(buildTextDataUrl('hi', 'plain text')), /media type/)
  })
})
