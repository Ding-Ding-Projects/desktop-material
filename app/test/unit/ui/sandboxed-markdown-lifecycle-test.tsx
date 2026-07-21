import assert from 'node:assert'
import { describe, it, mock } from 'node:test'

import { SandboxedMarkdown } from '../../../src/ui/lib/sandboxed-markdown'

type ScrollHandler = EventListener & {
  readonly cancel: () => void
}

function createComponent(): SandboxedMarkdown {
  const component = new SandboxedMarkdown({
    markdown: 'Hello',
    emoji: new Map(),
    underlineLinks: true,
    ariaLabel: 'Rendered markdown',
  })
  component.renderMarkdown = async () => undefined
  return component
}

describe('SandboxedMarkdown lifecycle', () => {
  it('survives repeated reloads and releases deferred scroll work on unmount', async () => {
    const addEventListener = mock.method(document, 'addEventListener')
    const removeEventListener = mock.method(document, 'removeEventListener')
    const component = createComponent()
    const reload = mock.fn(async () => undefined)
    component.renderMarkdown = reload
    const scroll = mock.fn()
    const cancel = mock.fn()
    const scrollHandler = Object.assign(scroll, { cancel }) as ScrollHandler
    const componentInternals = component as unknown as {
      onDocumentScroll: ScrollHandler
      props: typeof component.props
      currentDocument: Document | null
      frameRef: HTMLIFrameElement | null
    }
    componentInternals.onDocumentScroll = scrollHandler
    componentInternals.currentDocument = document
    componentInternals.frameRef = document.createElement('iframe')
    let unmounted = false

    try {
      await component.componentDidMount()

      for (let index = 0; index < 25; index++) {
        const previousProps = component.props
        componentInternals.props = {
          ...previousProps,
          markdown: `Reload ${index}`,
        }
        await component.componentDidUpdate(previousProps)
      }
      assert.equal(reload.mock.calls.length, 26)

      const added = addEventListener.mock.calls.filter(
        call =>
          call.arguments[0] === 'scroll' && call.arguments[1] === scrollHandler
      )
      assert.equal(added.length, 1)
      assert.equal(added[0].arguments[2], true)
      document.dispatchEvent(new window.Event('scroll'))
      assert.equal(scroll.mock.calls.length, 1)

      component.componentWillUnmount()
      unmounted = true

      const removed = removeEventListener.mock.calls.find(
        call =>
          call.arguments[0] === 'scroll' && call.arguments[1] === scrollHandler
      )
      assert.ok(removed !== undefined)
      assert.equal(removed.arguments[2], true)
      document.dispatchEvent(new window.Event('scroll'))
      assert.equal(scroll.mock.calls.length, 1)
      assert.equal(cancel.mock.calls.length, 1)
      assert.equal(componentInternals.currentDocument, null)
      assert.equal(componentInternals.frameRef, null)
    } finally {
      if (!unmounted) {
        component.componentWillUnmount()
      }
      document.removeEventListener('scroll', scrollHandler, true)
      removeEventListener.mock.restore()
      addEventListener.mock.restore()
    }
  })
})
