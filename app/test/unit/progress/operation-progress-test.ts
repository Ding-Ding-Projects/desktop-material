import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  normalizeOperationProgress,
  operationProgressFraction,
  operationProgressPercent,
  operationStepCounter,
} from '../../../src/lib/progress/operation-progress'

describe('shared operation progress helpers', () => {
  it('keeps a well-formed determinate reading intact', () => {
    assert.deepStrictEqual(normalizeOperationProgress(3, 12), {
      value: 3,
      max: 12,
    })
    assert.equal(operationProgressPercent(3, 12), 25)
    assert.equal(operationProgressFraction(3, 12), 0.25)
  })

  it('collapses a missing or non-positive total to indeterminate', () => {
    for (const max of [
      null,
      undefined,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      assert.deepStrictEqual(
        normalizeOperationProgress(3, max),
        { value: null, max: null },
        `total ${String(max)} should be indeterminate`
      )
      assert.equal(operationProgressPercent(3, max), null)
      assert.equal(operationProgressFraction(3, max), null)
    }
  })

  it('keeps the total but drops the value when only the value is unusable', () => {
    for (const value of [null, undefined, -4, Number.NaN]) {
      assert.deepStrictEqual(normalizeOperationProgress(value, 10), {
        value: null,
        max: 10,
      })
      assert.equal(operationProgressPercent(value, 10), null)
    }
  })

  it('never reports past the end of its own track', () => {
    assert.deepStrictEqual(normalizeOperationProgress(99, 10), {
      value: 10,
      max: 10,
    })
    assert.equal(operationProgressPercent(99, 10), 100)
  })

  it('floors fractional readings rather than rendering a fractional count', () => {
    assert.deepStrictEqual(normalizeOperationProgress(2.9, 10.7), {
      value: 2,
      max: 10,
    })
  })

  it('reports a one-based current step without overrunning the total', () => {
    assert.deepStrictEqual(operationStepCounter(0, 5), {
      completed: 0,
      current: 1,
      total: 5,
    })
    assert.deepStrictEqual(operationStepCounter(2, 5), {
      completed: 2,
      current: 3,
      total: 5,
    })
    // The last item in flight must not read "6 of 5".
    assert.deepStrictEqual(operationStepCounter(5, 5), {
      completed: 5,
      current: 5,
      total: 5,
    })
  })

  it('reports an empty batch as having no current step', () => {
    assert.deepStrictEqual(operationStepCounter(0, 0), {
      completed: 0,
      current: 0,
      total: 0,
    })
    assert.deepStrictEqual(operationStepCounter(3, -1), {
      completed: 0,
      current: 0,
      total: 0,
    })
  })
})
