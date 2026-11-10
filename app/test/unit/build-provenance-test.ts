import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  FreeForeverNote,
  describeBuildProvenance,
  shortBuildCommit,
} from '../../src/lib/build-provenance'

describe('build provenance', () => {
  it('shortens a real commit and rejects anything else', () => {
    assert.equal(
      shortBuildCommit('03EC570A1B2C3D4E5F60718293A4B5C6D7E8F901'),
      '03ec570a1b'
    )
    assert.equal(shortBuildCommit('unknown'), null)
    assert.equal(shortBuildCommit(''), null)
    assert.equal(shortBuildCommit('abc'), null)
  })

  it('never claims a commit it does not have', () => {
    assert.equal(
      describeBuildProvenance('03ec570a1b2c3d4e'),
      'Built from commit 03ec570a1b.'
    )
    assert.match(describeBuildProvenance('dev'), /was not recorded/)
  })

  it('states that the app is free and credits what it builds on', () => {
    assert.match(FreeForeverNote, /stays free/)
    assert.match(FreeForeverNote, /GitHub Desktop/)
  })
})
