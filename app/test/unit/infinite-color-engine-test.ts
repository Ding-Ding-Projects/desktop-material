import assert from 'node:assert'
import { describe, it } from 'node:test'

import * as ColorEngine from '../../src/ui/appearance/infinite-color-engine'

describe('infinite colour engine', () => {
  it('parses hex and round-trips it', () => {
    const color = ColorEngine.parse('#3366cc')
    assert.notEqual(color, null)
    assert.equal(ColorEngine.toHex(color!).toLowerCase(), '#3366cc')
  })

  it('parses the other notations the picker advertises', () => {
    for (const input of [
      'rgb(51, 102, 204)',
      'hsl(220, 60%, 50%)',
      '#3366ccff',
    ]) {
      assert.notEqual(
        ColorEngine.parse(input),
        null,
        `failed to parse ${input}`
      )
    }
  })

  it('refuses input that is not a colour', () => {
    for (const input of ['', 'not-a-colour', '#12345', null, undefined, {}]) {
      assert.equal(ColorEngine.parse(input as never), null)
    }
  })

  it('translates one colour into every advertised format', () => {
    const color = ColorEngine.parse('#3366cc')!
    const rows = ColorEngine.translate(color)
    assert.ok(rows.length > 1, 'expected more than one translated notation')
    // Every advertised format must actually produce a row, or the translator
    // is claiming a conversion the picker cannot perform.
    assert.equal(rows.length, ColorEngine.formats.length)
  })

  it('preserves alpha through hex8', () => {
    // `make` takes normalized 0..1 components, not 0..255 bytes; passing bytes
    // clamps every channel to 1 and silently yields white.
    const color = ColorEngine.make(51 / 255, 102 / 255, 204 / 255, 0.5)
    assert.match(ColorEngine.toHex8(color), /^#3366cc[0-9a-f]{2}$/i)
  })
})
