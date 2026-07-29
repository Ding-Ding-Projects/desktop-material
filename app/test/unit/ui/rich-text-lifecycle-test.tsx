import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { RichText } from '../../../src/ui/lib/rich-text'
import { render, waitFor } from '../../helpers/ui/render'

class ControlledResizeObserver implements ResizeObserver {
  public static instances = new Array<ControlledResizeObserver>()
  public readonly targets = new Set<Element>()
  public disconnects = 0

  public constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this)
  }

  public observe(target: Element) {
    this.targets.add(target)
  }

  public unobserve(target: Element) {
    this.targets.delete(target)
  }

  public disconnect() {
    this.disconnects++
    this.targets.clear()
  }

  public trigger(width: number) {
    const target = this.targets.values().next().value as Element | undefined
    if (target === undefined) {
      throw new Error('ResizeObserver has no observed target')
    }

    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, width, 20),
        } as ResizeObserverEntry,
      ],
      this
    )
  }
}

const originalWindowResizeObserver = (window as any).ResizeObserver
const originalGlobalResizeObserver = globalThis.ResizeObserver
const originalRequestAnimationFrame = window.requestAnimationFrame
const originalCancelAnimationFrame = window.cancelAnimationFrame
const originalScrollWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollWidth'
)
const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth'
)

let nextFrameId = 0
let scheduledFrames = new Map<number, FrameRequestCallback>()
let measuredScrollWidth = 200
let measuredClientWidth = 100
let layoutReads = 0

function flushNextFrame() {
  const entry = scheduledFrames.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined
  if (entry === undefined) {
    throw new Error('No animation frame was scheduled')
  }

  const [id, callback] = entry
  scheduledFrames.delete(id)
  callback(16)
}

beforeEach(() => {
  ControlledResizeObserver.instances = []
  nextFrameId = 0
  scheduledFrames = new Map()
  measuredScrollWidth = 200
  measuredClientWidth = 100
  layoutReads = 0
  ;(window as any).ResizeObserver = ControlledResizeObserver
  ;(globalThis as any).ResizeObserver = ControlledResizeObserver
  window.requestAnimationFrame = callback => {
    const id = ++nextFrameId
    scheduledFrames.set(id, callback)
    return id
  }
  window.cancelAnimationFrame = id => {
    scheduledFrames.delete(id)
  }

  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      if ((this as HTMLElement).classList.contains('rich-text-lifecycle')) {
        layoutReads++
        return measuredScrollWidth
      }
      return 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if ((this as HTMLElement).classList.contains('rich-text-lifecycle')) {
        layoutReads++
        return measuredClientWidth
      }
      return 0
    },
  })
})

afterEach(() => {
  ;(window as any).ResizeObserver = originalWindowResizeObserver
  ;(globalThis as any).ResizeObserver = originalGlobalResizeObserver
  window.requestAnimationFrame = originalRequestAnimationFrame
  window.cancelAnimationFrame = originalCancelAnimationFrame

  if (originalScrollWidth === undefined) {
    delete (HTMLElement.prototype as any).scrollWidth
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollWidth',
      originalScrollWidth
    )
  }
  if (originalClientWidth === undefined) {
    delete (HTMLElement.prototype as any).clientWidth
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientWidth',
      originalClientWidth
    )
  }
})

describe('RichText overflow measurement lifecycle', () => {
  it('defers the initial layout read and skips a render when overflow is unchanged', async () => {
    let richText: RichText | null = null
    const view = render(
      <RichText
        ref={instance => {
          richText = instance
        }}
        className="rich-text-lifecycle"
        emoji={new Map()}
        text="A long commit summary"
      />
    )

    assert.equal(layoutReads, 0)
    assert.equal(scheduledFrames.size, 1)
    assert.ok(richText)
    const mountedRichText = richText as unknown as RichText

    const originalRender = mountedRichText.render.bind(mountedRichText)
    let updateRenders = 0
    mountedRichText.render = () => {
      updateRenders++
      return originalRender()
    }

    flushNextFrame()
    await waitFor(() => assert.equal(updateRenders, 1))
    assert.equal(layoutReads, 2)

    ControlledResizeObserver.instances[0].trigger(120)
    assert.equal(scheduledFrames.size, 1)
    flushNextFrame()
    await Promise.resolve()

    assert.equal(layoutReads, 4)
    assert.equal(updateRenders, 1)
    view.unmount()
  })

  it('remeasures changed text even when the container width does not change', async () => {
    measuredScrollWidth = 50
    const view = render(
      <RichText
        className="rich-text-lifecycle"
        emoji={new Map()}
        text="Short"
      />
    )

    flushNextFrame()
    assert.equal(
      view.container
        .querySelector('.rich-text-lifecycle')
        ?.hasAttribute('data-tooltip-target'),
      false
    )

    measuredScrollWidth = 200
    view.rerender(
      <RichText
        className="rich-text-lifecycle"
        emoji={new Map()}
        text="A newly expanded commit summary"
      />
    )

    assert.equal(scheduledFrames.size, 1)
    flushNextFrame()
    await waitFor(() =>
      assert.equal(
        view.container
          .querySelector('.rich-text-lifecycle')
          ?.getAttribute('data-tooltip-target'),
        'true'
      )
    )
    view.unmount()
  })

  it('cancels the owned animation frame when the component unmounts', () => {
    const view = render(
      <RichText
        className="rich-text-lifecycle"
        emoji={new Map()}
        text="Pending measurement"
      />
    )
    const observer = ControlledResizeObserver.instances[0]

    assert.equal(scheduledFrames.size, 1)
    view.unmount()

    assert.equal(scheduledFrames.size, 0)
    assert.ok(observer.disconnects >= 1)
  })
})
