import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  CloneProgressEtaEstimator,
  formatCloneEta,
  formatCloneSpeed,
} from '../../../src/lib/progress/clone-eta'

describe('formatCloneSpeed', () => {
  it('formats a positive rate with IEC units and a /s suffix', () => {
    const formatted = formatCloneSpeed(2.4 * 1024 ** 2)
    assert.ok(formatted.endsWith('/s'))
    assert.ok(formatted.includes('MiB'))
    assert.ok(formatted.startsWith('2.4'))
  })

  it('formats sub-mebibyte rates in kibibytes', () => {
    const formatted = formatCloneSpeed(1.5 * 1024)
    assert.ok(formatted.includes('KiB'))
    assert.ok(formatted.endsWith('/s'))
  })

  it('returns an empty string for a missing or non-positive rate', () => {
    assert.equal(formatCloneSpeed(0), '')
    assert.equal(formatCloneSpeed(-1), '')
    assert.equal(formatCloneSpeed(NaN), '')
  })
})

describe('formatCloneEta', () => {
  it('formats sub-minute estimates in seconds', () => {
    assert.equal(formatCloneEta(45), '~45s left')
    assert.equal(formatCloneEta(0), '~0s left')
  })

  it('formats minute-and-second estimates', () => {
    assert.equal(formatCloneEta(150), '~2m 30s left')
    assert.equal(formatCloneEta(120), '~2m left')
  })

  it('formats hour-and-minute estimates', () => {
    assert.equal(formatCloneEta(3661), '~1h 1m left')
    assert.equal(formatCloneEta(3600), '~1h left')
  })

  it('returns an empty string for a missing or negative estimate', () => {
    assert.equal(formatCloneEta(-1), '')
    assert.equal(formatCloneEta(NaN), '')
  })
})

describe('CloneProgressEtaEstimator', () => {
  it('withholds an estimate until the window covers enough time', () => {
    const estimator = new CloneProgressEtaEstimator()
    const t0 = 1_000_000

    assert.equal(estimator.record(0, t0), undefined)
    assert.equal(estimator.record(0.1, t0 + 1000), undefined)
  })

  it('derives seconds remaining from the smoothed rate', () => {
    const estimator = new CloneProgressEtaEstimator()
    const t0 = 1_000_000

    estimator.record(0, t0)
    // 0.2 progress over 2s => 0.1/s; remaining 0.8 => 8s.
    assert.equal(estimator.record(0.2, t0 + 2000), 8)
  })

  it('reports zero once complete', () => {
    const estimator = new CloneProgressEtaEstimator()
    const t0 = 1_000_000

    estimator.record(0, t0)
    assert.equal(estimator.record(1, t0 + 2000), 0)
  })

  it('withholds an estimate when progress stalls', () => {
    const estimator = new CloneProgressEtaEstimator()
    const t0 = 1_000_000

    estimator.record(0.5, t0)
    assert.equal(estimator.record(0.5, t0 + 3000), undefined)
  })
})
