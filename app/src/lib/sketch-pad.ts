/**
 * Sketch pad: freehand strokes kept as plain points, with undo, clear and an
 * SVG export. Pure rules; the component only forwards pointer positions.
 */

export const SketchWidth = 1000
export const SketchHeight = 560

/** A sketch never holds more than this, so it stays quick to draw and copy. */
export const MaxSketchStrokes = 500
export const MaxSketchStrokePoints = 2000

export const SketchInks = ['#191c20', '#006493', '#ba1a1a', '#1b7f37'] as const
export type SketchInk = (typeof SketchInks)[number]

export const SketchInkNames: Readonly<Record<SketchInk, string>> = {
  '#191c20': 'Black',
  '#006493': 'Blue',
  '#ba1a1a': 'Red',
  '#1b7f37': 'Green',
}

export type SketchPoint = readonly [number, number]

export interface ISketchStroke {
  readonly ink: SketchInk
  readonly points: ReadonlyArray<SketchPoint>
}

export interface ISketch {
  readonly strokes: ReadonlyArray<ISketchStroke>
}

export const EmptySketch: ISketch = { strokes: [] }

function clampPoint(point: SketchPoint): SketchPoint {
  return [
    Math.round(Math.min(SketchWidth, Math.max(0, point[0]))),
    Math.round(Math.min(SketchHeight, Math.max(0, point[1]))),
  ]
}

/** Start a stroke. Refused, unchanged, once the sketch is full. */
export function beginSketchStroke(
  sketch: ISketch,
  ink: SketchInk,
  point: SketchPoint
): ISketch {
  if (sketch.strokes.length >= MaxSketchStrokes) {
    return sketch
  }
  return {
    strokes: [...sketch.strokes, { ink, points: [clampPoint(point)] }],
  }
}

/** Add a point to the stroke being drawn. Repeats of the last point are dropped. */
export function extendSketchStroke(
  sketch: ISketch,
  point: SketchPoint
): ISketch {
  const last = sketch.strokes[sketch.strokes.length - 1]
  if (last === undefined || last.points.length >= MaxSketchStrokePoints) {
    return sketch
  }
  const next = clampPoint(point)
  const previous = last.points[last.points.length - 1]
  if (previous[0] === next[0] && previous[1] === next[1]) {
    return sketch
  }
  return {
    strokes: [
      ...sketch.strokes.slice(0, -1),
      { ink: last.ink, points: [...last.points, next] },
    ],
  }
}

export function undoSketchStroke(sketch: ISketch): ISketch {
  return { strokes: sketch.strokes.slice(0, -1) }
}

/** The `points` attribute for one stroke. A single tap becomes a short dot. */
export function sketchStrokePoints(stroke: ISketchStroke): string {
  const points =
    stroke.points.length === 1
      ? [stroke.points[0], stroke.points[0]]
      : stroke.points
  return points.map(point => `${point[0]},${point[1]}`).join(' ')
}

/** A self-contained SVG document of the sketch on a white ground. */
export function sketchToSvg(sketch: ISketch): string {
  const strokes = sketch.strokes
    .filter(stroke => SketchInks.includes(stroke.ink))
    .map(
      stroke =>
        `<polyline points="${sketchStrokePoints(stroke)}" fill="none" ` +
        `stroke="${stroke.ink}" stroke-width="4" stroke-linecap="round" ` +
        `stroke-linejoin="round"/>`
    )
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SketchWidth} ${SketchHeight}" ` +
    `width="${SketchWidth}" height="${SketchHeight}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    strokes.join('') +
    `</svg>`
  )
}

export function describeSketch(sketch: ISketch): string {
  const count = sketch.strokes.length
  return count === 0
    ? 'Empty sketch. Drag to draw.'
    : `Sketch with ${count} ${count === 1 ? 'stroke' : 'strokes'}.`
}
