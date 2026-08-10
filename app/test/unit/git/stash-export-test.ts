import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  createAbortKill,
  sevenZipArguments,
} from '../../../src/lib/git/stash-export'
import type { IStashSevenZipOptions } from '../../../src/lib/git/stash-export'

describe('git/stash-export', () => {
  it('passes the selected 7z compression and safety options to 7-Zip', () => {
    const options: IStashSevenZipOptions = {
      method: 'LZMA2',
      level: 9,
      dictionary: '1g',
      matchFinder: 'BT4',
      fastBytes: 273,
      solid: true,
      threads: '8',
      splitVolumes: '100m',
      password: 'not persisted by the exporter',
      encryptHeaders: true,
    }

    assert.deepEqual(
      sevenZipArguments('C:\\exports\\stash.7z', 'C:\\temp\\stash', options),
      [
        'a',
        '-t7z',
        '-mx=9',
        '-m0=LZMA2',
        '-ms=on',
        '-mmt=8',
        '-md=1g',
        '-mfb=273',
        '-mmf=bt4',
        '-v100m',
        '-pnot persisted by the exporter',
        '-mhe=on',
        'C:\\exports\\stash.7z',
        'C:\\temp\\stash\\*',
      ]
    )
  })

  it('does not enable encrypted headers without a password', () => {
    const options: IStashSevenZipOptions = {
      method: 'Copy',
      level: 0,
      dictionary: '4m',
      matchFinder: 'HC4',
      fastBytes: 5,
      solid: false,
      threads: 'off',
      splitVolumes: '',
      password: '',
      encryptHeaders: true,
    }

    assert.ok(
      !sevenZipArguments('stash.7z', 'stash', options).includes('-mhe=on')
    )
  })

  it('stops listening for an abort once its Git command settles', () => {
    const controller = new AbortController()
    let killed = 0

    // One export shares this signal across every tree it archives, so a
    // listener left behind by a finished command accumulates for the whole run.
    for (let index = 0; index < 20; index++) {
      const abortKill = createAbortKill(controller.signal)
      abortKill.processCallback({ kill: () => killed++ })
      abortKill.dispose()
    }

    controller.abort()
    assert.equal(killed, 0)
  })

  it('kills the running Git process when the export is aborted', () => {
    const controller = new AbortController()
    let killed = 0
    const abortKill = createAbortKill(controller.signal)
    abortKill.processCallback({ kill: () => killed++ })

    controller.abort()
    assert.equal(killed, 1)

    // Disposing after the abort already fired must stay a no-op.
    abortKill.dispose()
    assert.equal(killed, 1)
  })

  it('is a no-op without a signal', () => {
    const abortKill = createAbortKill(undefined)
    assert.doesNotThrow(() => {
      abortKill.processCallback({ kill: () => undefined })
      abortKill.dispose()
    })
  })
})
