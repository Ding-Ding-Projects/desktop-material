/**
 * Proves the dim sum surprise is wired, polite, and un-switch-off-able.
 *
 * A draw nobody calls is the same as no surprise, and a surprise that gates
 * startup, steals focus, or grows a settings toggle is worse than none. These
 * assertions read the source, because that is where "is it wired?" lives.
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(root, ...parts), 'utf8')

/** Every TypeScript source at or under `target`, file or directory. */
function sourceFilesIn(target: string): ReadonlyArray<string> {
  if (statSync(target).isFile()) {
    return [target]
  }
  return readdirSync(target, { recursive: true, encoding: 'utf8' })
    .map(entry => join(target, entry))
    .filter(path => /\.tsx?$/.test(path) && statSync(path).isFile())
}

const app = read('app', 'src', 'ui', 'app.tsx')
const card = read('app', 'src', 'ui', 'dim-sum', 'dim-sum-surprise.tsx')
const styles = read('app', 'styles', 'ui', '_dim-sum-surprise.scss')
const styleIndex = read('app', 'styles', '_ui.scss')
const build = read('script', 'build.ts')

describe('dim sum surprise wiring', () => {
  it('draws from deferred startup, after the window is interactive', () => {
    // Inside performDeferredLaunchActions, which runs on an idle callback well
    // after the shell is committed — so the draw can never gate startup.
    const deferred = app.slice(
      app.indexOf('private async performDeferredLaunchActions()'),
      app.indexOf('private scheduleDeferredLaunchActions()')
    )
    assert.ok(deferred.length > 0, 'deferred startup block not found')
    assert.match(deferred, /this\.drawDimSumSurprise\(\)/)
    assert.match(app, /private drawDimSumSurprise\(\): void \{/)
  })

  it('spends exactly one draw per launch, hit or miss', () => {
    assert.match(app, /private dimSumDrawn = false/)
    assert.match(app, /if \(this\.dimSumDrawn\) \{\s*return\s*\}/)
    // The flag is set before the probability is consulted, so a miss cannot be
    // re-rolled by a later render or state update.
    const draw = app.slice(app.indexOf('private drawDimSumSurprise'))
    const setIndex = draw.indexOf('this.dimSumDrawn = true')
    const rollIndex = draw.indexOf('shouldShowDimSum(drawUnitRandom())')
    assert.ok(setIndex !== -1 && rollIndex !== -1)
    assert.ok(setIndex < rollIndex, 'the draw must be spent before the roll')
    // A uniform CSPRNG draw, not a biased one, so the stated rate is the real
    // rate. Math.random is banned repository-wide and unused here.
    assert.doesNotMatch(draw.slice(0, rollIndex + 200), /Math\.random/)
  })

  it('renders the card and checks every suppression path', () => {
    assert.match(app, /\{this\.renderDimSumSurprise\(\)\}/)
    assert.match(app, /<DimSumSurprise/)
    for (const field of [
      /firstRun: this\.state\.showWelcomeFlow/,
      /errorState:/,
      /updating: isUpdateInProgress\(this\.state\.updateState\.status\)/,
      /modalOpen: this\.isShowingModal/,
      /quietHours: isWithinDimSumQuietHours\(/,
    ]) {
      assert.match(app, field)
    }
  })

  it('deletes a retired opt-out instead of reading one', () => {
    assert.match(app, /migrateDimSumOptOut\(localStorage\)/)
    // Nothing in the app offers a way to switch the surprise off: not a
    // preference, not a searchable setting, not a palette command.
    const surfaces = [
      join(root, 'app', 'src', 'lib', 'settings-search'),
      join(root, 'app', 'src', 'lib', 'command-palette-catalog.ts'),
      join(root, 'app', 'src', 'ui', 'preferences'),
      join(root, 'app', 'src', 'ui', 'appearance'),
    ]
    for (const surface of surfaces) {
      for (const file of sourceFilesIn(surface)) {
        assert.doesNotMatch(
          readFileSync(file, 'utf8'),
          /dim.?sum/i,
          `${file} must not offer a dim sum setting`
        )
      }
    }
  })

  it('never takes focus and never blocks', () => {
    assert.match(card, /role="status"/)
    assert.match(card, /aria-live="polite"/)
    assert.doesNotMatch(card, /autoFocus/)
    assert.doesNotMatch(card, /role="dialog"/)
    assert.doesNotMatch(card, /tabIndex/)
    // It clears itself rather than waiting to be acknowledged.
    assert.match(card, /window\.setTimeout\(this\.beginLeaving, duration\)/)
    // And hands focus back if the reader had tabbed into it.
    assert.match(card, /origin\.focus\(\)/)
  })

  it('names the picture and both halves of the dish name', () => {
    assert.match(card, /alt=\{content\.alt\}/)
    assert.match(card, /lang=\{part\.lang \?\? undefined\}/)
    assert.match(card, /aria-label=\{content\.dismiss\}/)
  })

  it('loads the picture from the bundled directory, never the network', () => {
    assert.match(
      card,
      /encodePathAsUrl\(__dirname, DimSumAssetsDir, dish\.file\)/
    )
    assert.doesNotMatch(card, /https?:\/\//)
    assert.doesNotMatch(card, /fetch\(/)
    assert.match(build, /app', 'static', 'dim-sum'/)
  })

  it('respects reduced motion, forced colours, and a small window', () => {
    assert.ok(styleIndex.includes("@import 'ui/dim-sum-surprise';"))
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(styles, /animation: none/)
    assert.match(styles, /@media \(forced-colors: active\)/)
    // A fixed card cannot be scrolled into reach, so it caps its own size.
    assert.match(styles, /max-height: min\(calc\(100dvh/)
    assert.match(styles, /max-height: min\(calc\(100vh/)
    assert.match(styles, /overflow-y: auto/)
    // A comfortable dismiss target rather than a glyph-sized one.
    assert.match(styles, /min-width: 44px/)
    assert.match(styles, /min-height: 44px/)
  })

  it('keeps out of the error notices’ corner', () => {
    const notices = read('app', 'styles', 'ui', '_error-notice-stack.scss')
    assert.match(notices, /\.error-notice-stack \{[^}]*right:/s)
    assert.match(styles, /\.dim-sum-surprise \{[^}]*left:/s)
  })
})
