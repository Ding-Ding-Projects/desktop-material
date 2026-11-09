import assert from 'node:assert'
import { describe, it } from 'node:test'

import { DefaultMotionSurfaceSwitches } from '../../src/models/motion-settings'
import {
  applyMotionToBody,
  clearMotionFromBody,
  isMotionEnabledFor,
} from '../../src/ui/lib/motion-runtime'

/** The few members of `<body>` the motion runtime touches. */
function fakeBody() {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  const body = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
    },
  }
  return { body: body as unknown as HTMLElement, attributes, properties }
}

describe('motion runtime', () => {
  it('writes the resolved level, the preference and the durations', () => {
    const { body, attributes, properties } = fakeBody()

    const applied = applyMotionToBody(
      body,
      {
        motion: 'full',
        motionSpeed: 2,
        motionSurfaces: DefaultMotionSurfaceSwitches,
      },
      false
    )

    assert.deepEqual(applied, { level: 'full', offSurfaces: [] })
    assert.equal(attributes.get('data-dm-motion'), 'full')
    assert.equal(attributes.get('data-dm-motion-preference'), 'full')
    assert.equal(attributes.has('data-dm-motion-off'), false)
    assert.equal(properties.get('--dm-motion-short'), '100ms')
    assert.equal(properties.get('--dm-motion-medium'), '150ms')
    assert.equal(properties.get('--dm-motion-long'), '250ms')
  })

  it('lists switched-off surfaces and removes the list when none are off', () => {
    const { body, attributes } = fakeBody()
    const appearance = {
      motion: 'calm' as const,
      motionSpeed: 1,
      motionSurfaces: {
        ...DefaultMotionSurfaceSwitches,
        dialogs: false,
        charts: false,
      },
    }

    assert.deepEqual(applyMotionToBody(body, appearance, false).offSurfaces, [
      'dialogs',
      'charts',
    ])
    assert.equal(attributes.get('data-dm-motion-off'), 'dialogs charts')
    assert.equal(isMotionEnabledFor('dialogs', body), false)
    assert.equal(isMotionEnabledFor('lists', body), true)

    applyMotionToBody(
      body,
      { ...appearance, motionSurfaces: DefaultMotionSurfaceSwitches },
      false
    )
    assert.equal(attributes.has('data-dm-motion-off'), false)
    assert.equal(isMotionEnabledFor('dialogs', body), true)
  })

  it('reduces everything when the system asks, whatever was stored', () => {
    const { body, attributes, properties } = fakeBody()

    applyMotionToBody(
      body,
      {
        motion: 'full',
        motionSpeed: 2,
        motionSurfaces: DefaultMotionSurfaceSwitches,
      },
      true
    )

    assert.equal(attributes.get('data-dm-motion'), 'reduced')
    assert.equal(attributes.get('data-dm-motion-preference'), 'full')
    assert.equal(properties.get('--dm-motion-long'), '1ms')
    assert.equal(isMotionEnabledFor('lists', body), false)
  })

  it('clears every attribute and property it set', () => {
    const { body, attributes, properties } = fakeBody()
    applyMotionToBody(
      body,
      {
        motion: 'full',
        motionSpeed: 1,
        motionSurfaces: { ...DefaultMotionSurfaceSwitches, tabs: false },
      },
      false
    )

    clearMotionFromBody(body)

    assert.equal(attributes.size, 0)
    assert.equal(properties.size, 0)
  })
})
