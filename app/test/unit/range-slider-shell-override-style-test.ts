import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), 'app', 'styles', ...parts), 'utf8')

describe('sliders outside the shared hit-target wrapper', () => {
  it('still has the shell rule that makes every other input a tall text field', () => {
    // If this rule goes away the doubled classes below are no longer needed.
    assert.match(
      read('_material-shell.scss'),
      /input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\),[\s\S]*?min-height: 40px;/
    )
  })

  for (const [file, className] of [
    ['_live-chart.scss', 'live-chart-scrub'],
    ['_appearance-editors.scss', 'element-appearance-motion-speed'],
  ] as const) {
    it(`outranks that rule for .${className} and restores a 16px track`, () => {
      const pattern = new RegExp(
        `\\.${className} \\{[\\s\\S]*?&\\.${className} input\\[type='range'\\] \\{` +
          `[\\s\\S]*?border: 0;[\\s\\S]*?height: 16px;[\\s\\S]*?min-height: 0;[\\s\\S]*?padding: 0;`
      )
      assert.match(read('ui', file), pattern)
    })
  }
})
