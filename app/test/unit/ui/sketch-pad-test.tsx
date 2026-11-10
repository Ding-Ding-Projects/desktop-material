import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { SketchPad } from '../../../src/ui/repository-tools/sketch-pad'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('sketch pad', () => {
  it('draws with the chosen ink, undoes, and copies an SVG', () => {
    const copied = new Array<string>()
    render(<SketchPad copyText={text => copied.push(text)} />)

    const surface = screen.getByRole('img')
    assert.equal(
      surface.getAttribute('aria-label'),
      'Empty sketch. Drag to draw.'
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Copy as SVG' })
        .getAttribute('aria-disabled'),
      'true'
    )

    fireEvent.click(screen.getByLabelText('Red'))
    fireEvent.pointerDown(surface, { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(surface, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(surface)
    // A move after the pointer is released must not draw.
    fireEvent.pointerMove(surface, { clientX: 5, clientY: 5 })
    fireEvent.pointerDown(surface, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(surface)
    assert.equal(surface.getAttribute('aria-label'), 'Sketch with 2 strokes.')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    assert.equal(surface.getAttribute('aria-label'), 'Sketch with 1 stroke.')

    fireEvent.click(screen.getByRole('button', { name: 'Copy as SVG' }))
    assert.equal(copied.length, 1)
    assert.match(copied[0], /stroke="#ba1a1a"/)
    assert.ok(screen.getByText('Copied as SVG.'))

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    assert.equal(
      surface.getAttribute('aria-label'),
      'Empty sketch. Drag to draw.'
    )
  })
})
