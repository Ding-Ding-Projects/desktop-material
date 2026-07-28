import assert from 'node:assert'
import { describe, it } from 'node:test'
import { compareFormUpdateChangesState } from '../../src/lib/compare-form-update'

describe('compare form update equality', () => {
  const current = {
    filterText: 'release',
    showBranchList: false,
  }

  it('rejects empty and identical updates', () => {
    assert.equal(compareFormUpdateChangesState(current, {}), false)
    assert.equal(
      compareFormUpdateChangesState(current, { filterText: 'release' }),
      false
    )
    assert.equal(
      compareFormUpdateChangesState(current, { showBranchList: false }),
      false
    )
  })

  it('accepts changes to either compare-form field', () => {
    assert.equal(
      compareFormUpdateChangesState(current, { filterText: 'main' }),
      true
    )
    assert.equal(
      compareFormUpdateChangesState(current, { showBranchList: true }),
      true
    )
  })
})
