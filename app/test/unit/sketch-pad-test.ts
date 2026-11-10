import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  EmptySketch,
  ISketch,
  MaxSketchStrokes,
  beginSketchStroke,
  describeSketch,
  extendSketchStroke,
  sketchStrokePoints,
  sketchToSvg,
  undoSketchStroke,
} from '../../src/lib/sketch-pad'

describe('sketch pad rules', () => {
  it('builds a stroke, clamps it to the surface and drops repeated points', () => {
    let sketch = beginSketchStroke(EmptySketch, '#006493', [10.4, 20.6])
    sketch = extendSketchStroke(sketch, [10.4, 20.6])
    sketch = extendSketchStroke(sketch, [-50, 9999])
    assert.deepEqual(sketch.strokes, [
      {
        ink: '#006493',
        points: [
          [10, 21],
          [0, 560],
        ],
      },
    ])
    assert.equal(extendSketchStroke(EmptySketch, [1, 1]), EmptySketch)
  })

  it('undoes the newest stroke only', () => {
    let sketch = beginSketchStroke(EmptySketch, '#191c20', [1, 1])
    sketch = beginSketchStroke(sketch, '#ba1a1a', [2, 2])
    assert.deepEqual(
      undoSketchStroke(sketch).strokes.map(s => s.ink),
      ['#191c20']
    )
    assert.deepEqual(undoSketchStroke(EmptySketch), EmptySketch)
  })

  it('stops adding strokes when the sketch is full', () => {
    let sketch: ISketch = EmptySketch
    for (let index = 0; index < MaxSketchStrokes + 5; index++) {
      sketch = beginSketchStroke(sketch, '#191c20', [index % 100, 1])
    }
    assert.equal(sketch.strokes.length, MaxSketchStrokes)
  })

  it('exports a self-contained SVG and turns a tap into a dot', () => {
    let sketch = beginSketchStroke(EmptySketch, '#1b7f37', [5, 6])
    assert.equal(sketchStrokePoints(sketch.strokes[0]), '5,6 5,6')
    sketch = extendSketchStroke(sketch, [7, 8])
    const svg = sketchToSvg(sketch)
    assert.match(
      svg,
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 560"/
    )
    assert.match(svg, /<polyline points="5,6 7,8" fill="none" stroke="#1b7f37"/)
    assert.match(svg, /<\/svg>$/)
    assert.equal(sketchToSvg(EmptySketch).includes('<polyline'), false)
  })

  it('describes the sketch in words', () => {
    assert.equal(describeSketch(EmptySketch), 'Empty sketch. Drag to draw.')
    assert.equal(
      describeSketch(beginSketchStroke(EmptySketch, '#191c20', [1, 1])),
      'Sketch with 1 stroke.'
    )
  })
})
