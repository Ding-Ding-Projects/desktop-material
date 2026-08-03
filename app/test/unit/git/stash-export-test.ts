import assert from 'node:assert'
import { describe, it } from 'node:test'
import { sevenZipArguments } from '../../../src/lib/git/stash-export'
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
})
