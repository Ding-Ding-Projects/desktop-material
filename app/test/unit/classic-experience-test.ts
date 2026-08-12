import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  UseClassicExperienceChangedEvent,
  UseClassicExperienceDefault,
  UseClassicExperienceKey,
  getUseClassicExperience,
  getUseClassicExperienceProvenance,
  setUseClassicExperience,
} from '../../src/lib/classic-experience'
import '../helpers/ui/setup'

/**
 * "Use the classic experience" — the whole pre-rewrite interface behind one
 * switch.
 *
 * Two things have to be true and neither is provable by reading the setting on
 * its own: the preference must round-trip and report honest provenance, and
 * `App` must actually branch on it. A perfectly correct preference nothing
 * reads is a switch that does nothing, which is the exact failure this whole
 * rewrite has produced twice already.
 */

const root = process.cwd()
const app = readFileSync(join(root, 'app/src/ui/app.tsx'), 'utf8')

// jsdom's real `localStorage`, not a stub. A stub would prove the module's own
// arithmetic and nothing about whether the key it writes is the key it reads.
beforeEach(() => localStorage.removeItem(UseClassicExperienceKey))
afterEach(() => localStorage.removeItem(UseClassicExperienceKey))

describe('classic experience', () => {
  it('ships off, because a fork that hid its own rewrite would ship it to nobody', () => {
    assert.equal(UseClassicExperienceDefault, false)
  })

  it('round-trips and reports where the value came from', () => {
    assert.equal(
      getUseClassicExperience(),
      UseClassicExperienceDefault,
      'an unset preference must read as the shipped default'
    )
    assert.equal(
      getUseClassicExperienceProvenance(),
      'default',
      'nobody has chosen yet, and "default" is the honest word for that'
    )

    assert.equal(setUseClassicExperience(true), true)
    assert.equal(getUseClassicExperience(), true)
    assert.equal(getUseClassicExperienceProvenance(), 'stored')

    // A deliberate `false` must be distinguishable from never having chosen.
    assert.equal(setUseClassicExperience(false), false)
    assert.equal(getUseClassicExperience(), false)
    assert.equal(
      getUseClassicExperienceProvenance(),
      'stored',
      'a recorded `false` is a decision, not an absence'
    )
  })

  it('announces the change, so a mounted surface can swap layouts at once', () => {
    const fired: Array<string> = []
    const listener = () => fired.push(UseClassicExperienceChangedEvent)
    window.addEventListener(UseClassicExperienceChangedEvent, listener)
    try {
      setUseClassicExperience(true)
      assert.deepEqual(fired, [UseClassicExperienceChangedEvent])
    } finally {
      window.removeEventListener(UseClassicExperienceChangedEvent, listener)
    }
  })

  it('uses one key and not a store of its own', () => {
    assert.equal(UseClassicExperienceKey, 'use-classic-experience')
  })

  /**
   * The half that matters. Everything above proves the preference works; this
   * asks whether the application reads it.
   */
  it('is what App branches on before rendering the shell', () => {
    assert.match(
      app,
      /private classicExperience = getUseClassicExperience\(\)/,
      'App never reads the preference'
    )
    assert.match(
      app,
      /if \(this\.classicExperience\) \{\s*return this\.renderClassicApp\(\)/,
      'renderApp does not branch on the preference, so the switch changes ' +
        'nothing a user can see'
    )
  })

  it('renders the pre-rewrite chrome in the classic layout', () => {
    const classic = /private renderClassicApp\(\)[\s\S]*?\n  \}/.exec(app)
    assert.ok(classic !== null, 'renderClassicApp not found')

    // The layout is worthless if it drops the chrome it exists to restore.
    for (const piece of [
      'renderRepositoryTabStrip()',
      'renderToolbar()',
      'renderRepository()',
      'renderPopups()',
    ]) {
      assert.ok(
        classic[0].includes(piece),
        `the classic layout is missing ${piece}`
      )
    }

    // The MD3 shell must not appear inside it, or this is the new chrome
    // wearing the old one's name.
    assert.ok(!classic[0].includes('<Md3Shell'))
  })

  it('keeps updating live rather than waiting for a relaunch', () => {
    assert.match(
      app,
      /UseClassicExperienceChangedEvent,\s*\n\s*this\.onClassicExperienceChanged/
    )
    assert.match(
      app,
      /private onClassicExperienceChanged = \(\) => \{/,
      'without a handler the event is announced to nobody'
    )
  })
})
