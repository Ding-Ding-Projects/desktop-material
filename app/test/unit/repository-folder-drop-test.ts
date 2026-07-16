import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  isRepositoryFileDrag,
  uniqueDroppedRepositoryPaths,
} from '../../src/lib/repository-folder-drop'

describe('repository folder drop helpers', () => {
  it('distinguishes operating-system folders from internal tab drags', () => {
    assert.equal(isRepositoryFileDrag(['Files']), true)
    assert.equal(isRepositoryFileDrag(['text/plain']), false)
    assert.equal(isRepositoryFileDrag([]), false)
  })

  it('removes empty and duplicate renderer paths without reordering', () => {
    assert.deepEqual(
      uniqueDroppedRepositoryPaths([
        'C:\\work\\alpha',
        '',
        'C:\\work\\beta',
        'C:\\work\\alpha',
        'c:/WORK/alpha/',
      ]),
      ['C:\\work\\alpha', 'C:\\work\\beta']
    )
  })
})
