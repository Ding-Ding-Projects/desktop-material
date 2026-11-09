import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import { motionSurfaces } from '../../src/models/motion-settings'

const styles = Path.resolve(__dirname, '../../styles')

describe('motion transitions style contract', () => {
  it('is imported after the keyframes it depends on', async () => {
    const material = await readFile(Path.join(styles, '_material.scss'), 'utf8')
    const motion = material.indexOf("@import 'material/motion';")
    const transitions = material.indexOf("@import 'material/transitions';")
    assert.ok(motion >= 0)
    assert.ok(transitions > motion)
  })

  it('points the Material duration tokens at the resolved durations', async () => {
    const source = await readFile(
      Path.join(styles, 'material', '_transitions.scss'),
      'utf8'
    )
    for (const [token, variable] of [
      ['short4', 'short'],
      ['medium2', 'medium'],
      ['long2', 'long'],
    ]) {
      assert.match(
        source,
        new RegExp(
          `--md-sys-motion-duration-${token}: var\\(--dm-motion-${variable},`
        )
      )
    }
  })

  it('has an instant path for every surface that can be switched off', async () => {
    const source = await readFile(
      Path.join(styles, 'material', '_transitions.scss'),
      'utf8'
    )
    for (const surface of motionSurfaces) {
      assert.match(
        source,
        new RegExp(`body\\[data-dm-motion-off~='${surface}'\\]`)
      )
    }
    assert.doesNotMatch(source, /@keyframes/)
  })
})
