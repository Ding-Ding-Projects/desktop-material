import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  clearStoredPaneWidth,
  readStoredPaneWidth,
  writeStoredPaneWidth,
} from '../../src/ui/md3/md3-resizable-pane'
import '../helpers/ui/setup'

/**
 * Persisted pane widths.
 *
 * The interesting cases are all about what is already in storage rather than
 * what the component writes to it. Storage outlives the release that wrote it,
 * so it holds values from older versions, hand-edited profiles and half-written
 * entries, and every one of those has to land the user somewhere usable.
 */
describe('resizable pane width persistence', () => {
  const surface = 'test-pane'

  beforeEach(() => clearStoredPaneWidth(surface))
  afterEach(() => clearStoredPaneWidth(surface))

  it('falls back to the default when nothing has been stored', () => {
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 356)
  })

  it('round-trips a chosen width', () => {
    writeStoredPaneWidth(surface, 480)
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 480)
  })

  it('clamps a stored width wider than the window allows', () => {
    // The failure this prevents is not cosmetic. A pane restored at 9000px
    // pushes its own resize handle off-screen, so the user has no way to drag
    // it back and the view is unusable until the profile is edited by hand.
    writeStoredPaneWidth(surface, 9000)
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 720)
  })

  it('clamps a stored width below the minimum', () => {
    writeStoredPaneWidth(surface, 10)
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 240)
  })

  it('ignores a stored value that is not a number', () => {
    localStorage.setItem('md3-pane-width:test-pane', 'wide')
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 356)
  })

  it('ignores a stored NaN rather than rendering one', () => {
    // `parseFloat('NaN')` is NaN, and NaN passes through a naive clamp
    // untouched — every comparison against it is false. A pane styled
    // `width: NaN` collapses to nothing with no error anywhere.
    localStorage.setItem('md3-pane-width:test-pane', 'NaN')
    const width = readStoredPaneWidth(surface, 356, 240, 720)
    assert.ok(Number.isFinite(width), `width was ${width}`)
    assert.strictEqual(width, 356)
  })

  it('forgets the stored width when it is cleared', () => {
    writeStoredPaneWidth(surface, 500)
    clearStoredPaneWidth(surface)
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 356)
  })

  it('keeps each surface separate', () => {
    writeStoredPaneWidth(surface, 500)
    writeStoredPaneWidth('other-pane', 300)
    assert.strictEqual(readStoredPaneWidth(surface, 356, 240, 720), 500)
    clearStoredPaneWidth('other-pane')
  })
})

/**
 * The handle is a control, not a cursor change.
 *
 * These read the source because the behaviours they name — a keyboard path, a
 * value a screen reader can announce, listeners on the window rather than the
 * handle — are each the kind of thing that is easy to drop in a refactor and
 * impossible to notice by looking at the interface.
 */
describe('the resize handle is reachable without a pointer', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/src/ui/md3/md3-resizable-pane.tsx'),
    'utf8'
  )

  it('is a separator with a value and a range', () => {
    for (const attribute of [
      'role="separator"',
      'aria-orientation',
      'aria-valuenow',
      'aria-valuemin',
      'aria-valuemax',
      'aria-valuetext',
      'aria-label',
    ]) {
      assert.ok(source.includes(attribute), `the handle needs ${attribute}`)
    }
  })

  it('takes focus', () => {
    assert.match(source, /tabIndex=\{0\}/)
  })

  it('handles every key the pattern expects', () => {
    for (const key of [
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'Home',
      'End',
    ]) {
      assert.ok(source.includes(`case '${key}'`), `no handler for ${key}`)
    }
  })

  it('offers a reset from the keyboard as well as the pointer', () => {
    assert.match(source, /onDoubleClick/, 'pointer reset')
    assert.match(source, /case 'Enter':/, 'keyboard reset')
  })

  it('tracks the drag on the window, not on the handle', () => {
    // Bound to the handle, a pointer moving faster than the render loop leaves
    // it behind and the drag silently stops part-way.
    assert.match(source, /window\.addEventListener\('mousemove'/)
    assert.match(source, /window\.addEventListener\('mouseup'/)
  })

  it('removes those listeners when the pane goes away', () => {
    // A view change mid-drag would otherwise leave the window resizing a pane
    // that no longer exists.
    assert.match(
      source,
      /componentWillUnmount\(\)[\s\S]{0,200}detachDragListeners/
    )
  })
})
