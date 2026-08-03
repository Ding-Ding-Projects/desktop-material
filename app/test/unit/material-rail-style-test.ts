import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const rail = readFileSync(
  join(process.cwd(), 'app/styles/ui/_material-rail.scss'),
  'utf8'
)

describe('material rail sizing', () => {
  it('scrolls the rail rather than crushing its entries', () => {
    // The rail is a column flex box that already scrolls. Its entries carry
    // `min-height: 0`, which lets a flex item shrink below its own content —
    // so without an explicit shrink guard the last label lost its lower half
    // ("Branches" clipped) instead of a scrollbar appearing.
    const entryRule = rail.match(
      /\.tab-bar\.vertical \.tab-bar-item,\s*\n\s*\.rail-nav-button \{([\s\S]*?)\n\s{2}\}/
    )?.[1]

    assert.ok(entryRule, 'could not find the shared rail entry rule')
    assert.match(
      entryRule,
      /flex:\s*none;/,
      'rail entries must keep their natural height so the rail scrolls instead'
    )
  })

  it('keeps the rail itself scrollable, which is what makes that safe', () => {
    assert.match(rail, /overflow-y:\s*auto;/)
    assert.match(rail, /max-height:\s*100%;/)
  })

  it('lets a long label wrap rather than truncating it', () => {
    const label = rail.match(/\.rail-label \{([\s\S]*?)\n\s{2}\}/)?.[1]

    assert.ok(label, 'could not find the rail label rule')
    assert.match(label, /white-space:\s*normal;/)
    assert.match(label, /overflow-wrap:\s*anywhere;/)
  })
})
