import * as React from 'react'

import {
  EmptySketch,
  ISketch,
  MaxSketchStrokes,
  SketchHeight,
  SketchInk,
  SketchInkNames,
  SketchInks,
  SketchPoint,
  SketchWidth,
  beginSketchStroke,
  describeSketch,
  extendSketchStroke,
  sketchStrokePoints,
  sketchToSvg,
  undoSketchStroke,
} from '../../lib/sketch-pad'
import { Button } from '../lib/button'

interface ISketchPadProps {
  /** Injectable so tests do not need a clipboard. */
  readonly copyText?: (text: string) => void
}

interface ISketchPadState {
  readonly sketch: ISketch
  readonly ink: SketchInk
  readonly drawing: boolean
  readonly copied: boolean
}

const defaultCopyText = (text: string) => {
  void navigator.clipboard.writeText(text)
}

/**
 * A small freehand sketch pad. The drawing stays in this window until it is
 * copied; nothing is saved or sent by itself.
 */
export class SketchPad extends React.Component<
  ISketchPadProps,
  ISketchPadState
> {
  public constructor(props: ISketchPadProps) {
    super(props)
    this.state = {
      sketch: EmptySketch,
      ink: SketchInks[0],
      drawing: false,
      copied: false,
    }
  }

  private pointFor(event: React.PointerEvent<SVGSVGElement>): SketchPoint {
    const box = event.currentTarget.getBoundingClientRect()
    return [
      box.width > 0
        ? ((event.clientX - box.left) / box.width) * SketchWidth
        : 0,
      box.height > 0
        ? ((event.clientY - box.top) / box.height) * SketchHeight
        : 0,
    ]
  }

  private onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = this.pointFor(event)
    this.setState(state => ({
      drawing: true,
      copied: false,
      sketch: beginSketchStroke(state.sketch, state.ink, point),
    }))
  }

  private onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!this.state.drawing) {
      return
    }
    const point = this.pointFor(event)
    this.setState(state => ({
      sketch: extendSketchStroke(state.sketch, point),
    }))
  }

  private onPointerEnd = () => {
    if (this.state.drawing) {
      this.setState({ drawing: false })
    }
  }

  private onUndo = () => {
    this.setState(state => ({
      sketch: undoSketchStroke(state.sketch),
      copied: false,
    }))
  }

  private onClear = () => {
    this.setState({ sketch: EmptySketch, copied: false })
  }

  private onCopy = () => {
    ;(this.props.copyText ?? defaultCopyText)(sketchToSvg(this.state.sketch))
    this.setState({ copied: true })
  }

  private onInkChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ ink: event.currentTarget.value as SketchInk })
  }

  public render() {
    const { sketch, ink, copied } = this.state
    const empty = sketch.strokes.length === 0
    const full = sketch.strokes.length >= MaxSketchStrokes
    return (
      <section className="sketch-pad" aria-labelledby="sketch-pad-title">
        <div className="sketch-pad-toolbar">
          <h3 id="sketch-pad-title">Sketch pad</h3>
          <fieldset className="sketch-pad-inks">
            <legend>Ink</legend>
            {SketchInks.map(value => (
              <label key={value}>
                <input
                  type="radio"
                  name="sketch-pad-ink"
                  value={value}
                  checked={ink === value}
                  onChange={this.onInkChanged}
                />
                <span
                  className="sketch-pad-swatch"
                  style={{ backgroundColor: value }}
                  aria-hidden="true"
                />
                {SketchInkNames[value]}
              </label>
            ))}
          </fieldset>
          <Button onClick={this.onUndo} disabled={empty}>
            Undo
          </Button>
          <Button onClick={this.onClear} disabled={empty}>
            Clear
          </Button>
          <Button onClick={this.onCopy} disabled={empty}>
            Copy as SVG
          </Button>
        </div>
        <svg
          className="sketch-pad-surface"
          viewBox={`0 0 ${SketchWidth} ${SketchHeight}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={describeSketch(sketch)}
          onPointerDown={this.onPointerDown}
          onPointerMove={this.onPointerMove}
          onPointerUp={this.onPointerEnd}
          onPointerLeave={this.onPointerEnd}
          onPointerCancel={this.onPointerEnd}
        >
          {sketch.strokes.map((stroke, index) => (
            <polyline
              key={index}
              points={sketchStrokePoints(stroke)}
              fill="none"
              stroke={stroke.ink}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        <p className="sketch-pad-status" role="status">
          {copied
            ? 'Copied as SVG.'
            : full
              ? 'This sketch is full. Undo or clear to keep drawing.'
              : describeSketch(sketch)}
        </p>
        <p className="sketch-pad-note">
          The drawing stays in this window. Nothing is saved or sent until you
          copy it.
        </p>
      </section>
    )
  }
}
