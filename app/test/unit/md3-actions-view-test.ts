import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  classifyMd3LogLine,
  formatMd3RunDetail,
  formatMd3RunHeading,
  formatMd3RunMeta,
  md3ActionsStatusIcon,
  Md3ActionsChips,
  IMd3ActionsRun,
} from '../../src/ui/md3/md3-actions-view'
import {
  md3ActionsJobFixtures,
  md3ActionsLogFixture,
  md3ActionsRunFixtures,
} from '../../src/ui/md3/md3-actions-view-fixtures'

/**
 * The Actions destination's pure derivations.
 *
 * Every assertion starts from the design contract's own literals
 * (`design/History MD3.dc.html`, the `isActions` branch and the `runRows`,
 * `runDetail`, `runChips` and `logLines` values in `renderVals()`), so a row
 * that stops rendering the shape the contract specified fails rather than
 * merely looking different.
 */

const run = (overrides: Partial<IMd3ActionsRun> = {}): IMd3ActionsRun => ({
  ...md3ActionsRunFixtures[1],
  ...overrides,
})

describe('md3 actions view', () => {
  it('declares the contract filter chips in the contract order', () => {
    assert.deepStrictEqual(Md3ActionsChips, [
      'Running',
      'Failed',
      'Success',
      'This branch',
    ])
  })

  it('renders the contract meta line', () => {
    assert.equal(
      formatMd3RunMeta(
        run({
          number: 1482,
          branch: 'development',
          event: 'push',
          duration: '2m 14s',
        })
      ),
      '#1482 · development · push · 2m 14s'
    )
  })

  it('renders the contract detail line', () => {
    assert.equal(
      formatMd3RunDetail(
        run({
          status: 'failed',
          actor: 'alice',
          sha: '4f1c9ae',
          jobCount: 6,
          time: '2m 14s',
          attempt: 2,
        })
      ),
      'failed · triggered by alice · 4f1c9ae · 6 jobs · 2m 14s · attempt 2'
    )
  })

  it('prefers the provider status wording over the tone key', () => {
    // `status` selects the glyph and the colour; it is not always the most
    // precise word for the sentence, and the detail line is a sentence.
    assert.match(
      formatMd3RunDetail(run({ status: 'failed', statusLabel: 'timed out' })),
      /^timed out · /
    )
  })

  it('renders the contract detail-pane heading', () => {
    assert.equal(
      formatMd3RunHeading(run({ name: 'CI', number: 1481, branch: 'main' })),
      'CI · #1481 · main'
    )
  })

  it('maps every status to the contract glyph', () => {
    assert.equal(md3ActionsStatusIcon('success'), 'check_circle')
    assert.equal(md3ActionsStatusIcon('failed'), 'error')
    assert.equal(md3ActionsStatusIcon('running'), 'progress_activity')
    assert.equal(md3ActionsStatusIcon('cancelled'), 'cancel')
  })

  it('does not report a queued run as cancelled', () => {
    // The contract's `runIcon()` has no queued branch and falls through to
    // `cancel`, which would draw a run that has not started yet as one that
    // was stopped on purpose.
    assert.equal(md3ActionsStatusIcon('queued'), 'schedule')
  })

  it('classifies log lines by the contract rules', () => {
    assert.equal(classifyMd3LogLine('$ npm run test:unit'), 'command')
    assert.equal(classifyMd3LogLine('FAIL  app/test/unit/x-test.ts'), 'error')
    assert.equal(classifyMd3LogLine('Error: 1 test failed.'), 'error')
    assert.equal(classifyMd3LogLine('  ● renders the detail line'), 'error')
    assert.equal(classifyMd3LogLine('PASS  app/test/unit/y-test.ts'), 'plain')
  })

  it('reads the error rule before the command rule', () => {
    // A failing command line is a failure first: `$ exit 1` in the fixture
    // carries no error token, but `$ FAIL` would, and the contract's own
    // ordering paints it as an error.
    assert.equal(classifyMd3LogLine('$ exit 1'), 'command')
    assert.equal(classifyMd3LogLine('$ echo FAIL'), 'error')
  })

  it('ships fixtures covering every rendered status', () => {
    const statuses = new Set(md3ActionsRunFixtures.map(x => x.status))
    for (const status of ['running', 'failed', 'success', 'cancelled']) {
      assert.ok(statuses.has(status as never), `no fixture is ${status}`)
    }
  })

  it('ships a job fixture whose steps exercise the step tones', () => {
    const steps = md3ActionsJobFixtures.flatMap(job => job.steps)
    const statuses = new Set(steps.map(step => step.status))
    assert.ok(statuses.has('success'))
    assert.ok(statuses.has('failed'))
    assert.ok(statuses.has('running'))
  })

  it('ships a log fixture that exercises both colouring rules', () => {
    const kinds = new Set(
      md3ActionsLogFixture.split('\n').map(classifyMd3LogLine)
    )
    assert.ok(kinds.has('command'))
    assert.ok(kinds.has('error'))
    assert.ok(kinds.has('plain'))
  })
})
