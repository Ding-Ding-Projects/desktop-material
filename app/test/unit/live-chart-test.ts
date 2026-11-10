import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  ILiveSample,
  describeLiveChart,
  liveChartPoints,
  liveChartStatus,
  liveChartTrend,
  liveSampleIndexAt,
  pushLiveSample,
} from '../../src/lib/live-chart'

const at = (second: number, value: number): ILiveSample => ({
  time: second * 1000,
  value,
})
const mb = (value: number) => `${value} MB`

describe('live chart rules', () => {
  it('keeps a bounded window and refuses values that are not numbers', () => {
    let samples: ReadonlyArray<ILiveSample> = []
    for (let i = 0; i < 5; i++) {
      samples = pushLiveSample(samples, at(i, i), 3)
    }
    assert.deepEqual(
      samples.map(s => s.value),
      [2, 3, 4]
    )
    assert.equal(pushLiveSample(samples, at(9, NaN), 3), samples)
    assert.equal(pushLiveSample(samples, at(9, Infinity), 3), samples)
  })

  it('reports loading, live, stale and paused', () => {
    assert.equal(liveChartStatus([], 0, false), 'loading')
    assert.equal(liveChartStatus([at(10, 1)], 12_000, false), 'live')
    assert.equal(liveChartStatus([at(10, 1)], 16_000, false), 'stale')
    assert.equal(liveChartStatus([at(10, 1)], 16_000, true), 'paused')
    assert.equal(liveChartStatus([], 0, true), 'paused')
  })

  it('places samples inside the box, highest at the top', () => {
    const points = liveChartPoints(
      [at(0, 10), at(1, 30), at(2, 20)],
      100,
      50,
      5
    )
    assert.deepEqual(points, [
      { x: 5, y: 45 },
      { x: 50, y: 5 },
      { x: 95, y: 25 },
    ])
    assert.deepEqual(liveChartPoints([at(0, 7)], 100, 50), [{ x: 50, y: 25 }])
    assert.deepEqual(
      liveChartPoints([at(0, 7), at(1, 7)], 100, 50, 5).map(p => p.y),
      [25, 25]
    )
    assert.deepEqual(liveChartPoints([], 100, 50), [])
  })

  it('maps a pointer position to the nearest sample', () => {
    assert.equal(liveSampleIndexAt(5, 0, 200), 0)
    assert.equal(liveSampleIndexAt(5, 100, 200), 2)
    assert.equal(liveSampleIndexAt(5, 999, 200), 4)
    assert.equal(liveSampleIndexAt(0, 10, 200), null)
  })

  it('names the trend only when the change is more than noise', () => {
    assert.equal(liveChartTrend([at(0, 100), at(1, 101)]), 'steady')
    assert.equal(liveChartTrend([at(0, 100), at(1, 110)]), 'rising')
    assert.equal(liveChartTrend([at(0, 110), at(1, 100)]), 'falling')
    assert.equal(liveChartTrend([at(0, 100)]), 'steady')
  })

  it('describes the chart in one sentence and never estimates', () => {
    assert.equal(
      describeLiveChart('Memory', [], 'loading', mb),
      'Memory: waiting for the first sample.'
    )
    assert.equal(
      describeLiveChart(
        'Memory',
        [at(0, 400), at(30, 380), at(60, 430)],
        'live',
        mb
      ),
      'Memory: latest 430 MB, lowest 380 MB, highest 430 MB over 60 seconds, rising.'
    )
    assert.match(
      describeLiveChart('Memory', [at(0, 400), at(1, 400)], 'stale', mb),
      /steady\. No new sample has arrived recently\.$/
    )
  })
})
