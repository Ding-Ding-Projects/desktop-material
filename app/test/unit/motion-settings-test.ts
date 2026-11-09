import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DefaultMotionSpeed,
  DefaultMotionSurfaceSwitches,
  MaxMotionSpeed,
  MinMotionSpeed,
  motionDurations,
  normalizeMotionSpeed,
  normalizeMotionSurfaces,
  resolveMotionLevel,
} from '../../src/models/motion-settings'

describe('motion settings', () => {
  it('clamps a stored speed to the slider range and its steps', () => {
    assert.equal(normalizeMotionSpeed(1), 1)
    assert.equal(normalizeMotionSpeed(1.26), 1.3)
    assert.equal(normalizeMotionSpeed(0.1), MinMotionSpeed)
    assert.equal(normalizeMotionSpeed(9), MaxMotionSpeed)
  })

  it('falls back to the design speed for anything that is not a number', () => {
    for (const value of [undefined, null, '2', NaN, Infinity, {}]) {
      assert.equal(normalizeMotionSpeed(value), DefaultMotionSpeed)
    }
  })

  it('keeps known surface switches and defaults the rest to on', () => {
    assert.deepEqual(
      normalizeMotionSurfaces({ dialogs: false, lists: 'no', unknown: false }),
      { ...DefaultMotionSurfaceSwitches, dialogs: false }
    )
    for (const value of [undefined, null, [], 'dialogs']) {
      assert.deepEqual(
        normalizeMotionSurfaces(value),
        DefaultMotionSurfaceSwitches
      )
    }
  })

  it('lets the calmer of the stored level and the system signal win', () => {
    assert.equal(resolveMotionLevel('system', false), 'full')
    assert.equal(resolveMotionLevel('system', true), 'reduced')
    assert.equal(resolveMotionLevel('full', true), 'reduced')
    assert.equal(resolveMotionLevel('calm', false), 'calm')
    assert.equal(resolveMotionLevel('calm', true), 'reduced')
    assert.equal(resolveMotionLevel('reduced', false), 'reduced')
  })

  it('scales durations by speed and never by speed when reduced', () => {
    assert.deepEqual(motionDurations('full', 1), {
      short: 200,
      medium: 300,
      long: 500,
    })
    assert.deepEqual(motionDurations('full', 2), {
      short: 100,
      medium: 150,
      long: 250,
    })
    assert.deepEqual(motionDurations('calm', 0.5), {
      short: 280,
      medium: 360,
      long: 480,
    })
    assert.deepEqual(motionDurations('reduced', 2), {
      short: 1,
      medium: 1,
      long: 1,
    })
    assert.deepEqual(motionDurations('reduced', 0.5), {
      short: 1,
      medium: 1,
      long: 1,
    })
  })
})
