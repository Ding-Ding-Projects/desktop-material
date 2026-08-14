import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  InterfaceModeChangedEvent,
  InterfaceModeDefault,
  InterfaceModeKey,
  LegacyUseClassicExperienceKey,
  getInterfaceMode,
  getInterfaceModeProvenance,
  isClassicMode,
  setInterfaceMode,
} from '../../src/lib/interface-mode'
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
beforeEach(() => {
  localStorage.removeItem(InterfaceModeKey)
  localStorage.removeItem(LegacyUseClassicExperienceKey)
})
afterEach(() => {
  localStorage.removeItem(InterfaceModeKey)
  localStorage.removeItem(LegacyUseClassicExperienceKey)
})

describe('interface mode', () => {
  it('ships in Classic mode, the interface the app rendered before the MD3 rewrite', () => {
    // Reverted from 'material' on 2026-08-14 at the user's request. Pinned
    // rather than left to drift: which interface a new profile opens in is a
    // product decision somebody made deliberately, and a default that changes
    // because nobody was watching is how it got changed the first time.
    assert.equal(InterfaceModeDefault, 'classic')
    assert.equal(getInterfaceMode(), 'classic')
    assert.equal(isClassicMode(), true)
  })

  it('round-trips and reports where the value came from', () => {
    assert.equal(
      getInterfaceMode(),
      InterfaceModeDefault,
      'an unset preference must read as the shipped default'
    )
    assert.equal(
      getInterfaceModeProvenance(),
      'default',
      'nobody has chosen yet, and "default" is the honest word for that'
    )

    assert.equal(setInterfaceMode('classic'), 'classic')
    assert.equal(getInterfaceMode(), 'classic')
    assert.equal(getInterfaceModeProvenance(), 'stored')

    // Choosing the default explicitly is still a decision, and must be
    // distinguishable from never having chosen.
    assert.equal(setInterfaceMode('material'), 'material')
    assert.equal(getInterfaceMode(), 'material')
    assert.equal(
      getInterfaceModeProvenance(),
      'stored',
      'a recorded `material` is a decision, not an absence'
    )
  })

  it('announces the change, so a mounted surface can swap modes at once', () => {
    const fired: Array<string> = []
    const listener = () => fired.push(InterfaceModeChangedEvent)
    window.addEventListener(InterfaceModeChangedEvent, listener)
    try {
      setInterfaceMode('classic')
      assert.deepEqual(fired, [InterfaceModeChangedEvent])
    } finally {
      window.removeEventListener(InterfaceModeChangedEvent, listener)
    }
  })

  it('uses one key and not a store of its own', () => {
    assert.equal(InterfaceModeKey, 'interface-mode')
  })

  /**
   * The rename must not reset anyone. Somebody who chose the classic interface
   * before it was called a mode keeps that choice.
   */
  it('honours a choice recorded before the rename', () => {
    localStorage.setItem(LegacyUseClassicExperienceKey, '1')
    assert.equal(getInterfaceMode(), 'classic')
    assert.equal(
      getInterfaceModeProvenance(),
      'stored',
      'an old recorded choice is still a choice'
    )

    localStorage.setItem(LegacyUseClassicExperienceKey, '0')
    assert.equal(
      getInterfaceMode(),
      'material',
      'an old recorded `false` meant the new interface and still does'
    )
  })

  it('retires the old key once a mode is chosen', () => {
    localStorage.setItem(LegacyUseClassicExperienceKey, '1')
    setInterfaceMode('material')

    assert.equal(
      localStorage.getItem(LegacyUseClassicExperienceKey),
      null,
      'leaving the old key behind lets the migration resurrect a stale answer'
    )
    assert.equal(getInterfaceMode(), 'material')
  })

  it('falls back rather than throwing on an unrecognised stored value', () => {
    localStorage.setItem(InterfaceModeKey, 'wharrgarbl')
    assert.equal(
      getInterfaceMode(),
      InterfaceModeDefault,
      'the interface a user sees must not depend on a settings value parsing'
    )
  })

  /**
   * The half that matters. Everything above proves the preference works; this
   * asks whether the application reads it.
   */
  it('is what App branches on before rendering the shell', () => {
    assert.match(
      app,
      /private classicExperience = isClassicMode\(\)/,
      'App never reads the mode'
    )
    assert.match(
      app,
      /if \(this\.classicExperience\) \{\s*return this\.renderClassicApp\(\)/,
      'renderApp does not branch on the preference, so the switch changes ' +
        'nothing a user can see'
    )
  })

  /**
   * What "classic" actually is, corrected against the pre-rewrite tip.
   *
   * This test previously asserted that `renderClassicApp` inlines the old
   * chrome and contains no `<Md3Shell>` — and that was simply wrong about the
   * thing it was describing. At `f443f3cd10`, the commit immediately before the
   * rewrite, there was no `renderClassicApp` at all: `renderApp` rendered
   * `<Md3Shell>` and handed it `repositoryTabStrip={this.renderRepositoryTabStrip()}`
   * as a prop. The shell *is* the classic chrome; what the rewrite added was
   * the eight destination views inside it.
   *
   * So classic mode is the same shell with no views, the two modes differ by
   * exactly one argument, and the chrome lives in the shared renderer rather
   * than in either branch. A test asserting the opposite would force the next
   * person to rebuild an interface this fork never had.
   */
  it('renders the classic layout through the same shell, without views', () => {
    const classic = /private renderClassicApp\(\)[\s\S]*?\n  \}/.exec(app)
    assert.ok(classic !== null, 'renderClassicApp not found')

    assert.match(
      classic[0],
      /this\.renderMd3Shell\(/,
      'classic mode must render through the shared shell renderer, or the two ' +
        'modes are two interfaces and a change to the chrome reaches one'
    )
    assert.match(
      classic[0],
      /md3NoViews/,
      'classic mode is the shell without its destination views'
    )
  })

  it('keeps the chrome in the renderer both modes share', () => {
    // The pieces this used to look for in `renderClassicApp`. They are not
    // missing; they moved to where both modes get them.
    const shell = /private renderMd3Shell\([\s\S]*?\n  \}/.exec(app)
    assert.ok(shell !== null, 'renderMd3Shell not found')

    for (const piece of ['renderRepositoryTabStrip()', 'renderToolbar()']) {
      assert.ok(
        shell[0].includes(piece),
        `the shared shell renderer is missing ${piece}, so one mode loses it`
      )
    }
  })

  /**
   * Parity between the two layouts.
   *
   * Both must keep moving together. The moment a shared layer is added to one
   * branch of `renderApp` and not the other, half the users lose it — and
   * which half depends on a setting, which is the worst possible way for a
   * feature to be missing, because it cannot be reproduced by whoever added it.
   *
   * The list is hand-written on purpose. A rule that compared the two branches
   * wholesale would fail forever on the chrome that is legitimately different
   * — that difference is the entire point of the setting. What must match is
   * the layers that belong to neither chrome.
   */
  it('renders every shared layer in the renderer both modes go through', () => {
    // Rewritten, and the reason is the interesting part.
    //
    // This used to assert each layer appeared in `renderClassicApp` *and* in
    // `renderApp` — a duplication check, which was the right guard while the
    // two branches each built their own tree. They no longer do: both call
    // `renderMd3Shell`, and every shared layer lives there exactly once.
    //
    // That is strictly stronger than what this test was buying. A layer added
    // to the shared renderer cannot reach one mode and not the other, because
    // there is no second tree for it to be missing from. So the assertion moves
    // to where the layers actually are, and the parity it was protecting is now
    // structural rather than checked.
    const sharedShell = [
      'renderUpdateDownloadProgress()',
      'renderCheapLfsRestoreProgress()',
      'renderBanner()',
      'renderSubmoduleRepositoryContext()',
      'renderNotificationCentre()',
      'renderAppearanceEditor()',
      'renderPopups()',
      'renderDragElement()',
      'renderRepositoryDropOverlay()',
    ]

    const shell = /private renderMd3Shell\([\s\S]*?\n  \}/.exec(app)
    assert.ok(shell !== null, 'renderMd3Shell not found')

    const missing = sharedShell.filter(layer => !shell[0].includes(layer))
    assert.deepEqual(
      missing,
      [],
      'a shared layer must render in the shell both modes go through, or the ' +
        'feature it carries exists only for whoever set the toggle one way'
    )

    // The Build & Run panel lives in the legacy destination renderer, which
    // both modes also reach. Named separately rather than quietly dropped from
    // the list, because a layer that disappears from a guard is exactly how a
    // feature comes to exist for half the users.
    const legacy = /private renderMd3LegacyDestination[\s\S]*?\n  \}/.exec(app)
    assert.ok(legacy !== null, 'renderMd3LegacyDestination not found')
    assert.ok(legacy[0].includes('renderBuildRunPanel()'))
  })

  it('keeps updating live rather than waiting for a relaunch', () => {
    assert.match(
      app,
      /InterfaceModeChangedEvent,\s*\n\s*this\.onClassicExperienceChanged/
    )
    assert.match(
      app,
      /private onClassicExperienceChanged = \(\) => \{/,
      'without a handler the event is announced to nobody'
    )
  })
})
