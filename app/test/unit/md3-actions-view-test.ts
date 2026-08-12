import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  classifyMd3LogLine,
  formatMd3RunDetail,
  formatMd3RunHeading,
  formatMd3RunMeta,
  md3ActionsLogDigits,
  md3ActionsStatusIcon,
  md3ActionsStatusLabel,
  md3LogLineBody,
  parseMd3LogGroupMarker,
  Md3ActionsChips,
  IMd3ActionsRun,
  md3ActionsFiltersActive,
  md3ActionsRerunPartition,
  md3ActionsCancelPartition,
  md3ActionsRunExportRecord,
  Md3ActionsRunExportColumns,
} from '../../src/ui/md3/md3-actions-view'
import {
  md3ActionsJobFixtures,
  md3ActionsLogFixture,
  md3ActionsRunFixtures,
  md3ActionsTimestampedLogFixture,
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

  it('colours a command line that GitHub timestamped', () => {
    // A real downloaded log line starts with an ISO-8601 timestamp, so it
    // starts with a digit. Testing the raw text means the command rule never
    // fires once in a real run's log — and no test using the contract's own
    // hand-typed fixture can see that, because that fixture has no timestamps.
    assert.equal(
      classifyMd3LogLine('2026-08-10T09:41:03.0234567Z $ npm run test:unit'),
      'command'
    )
    assert.equal(
      classifyMd3LogLine('2026-08-10T09:41:32Z FAIL  app/test/unit/x-test.ts'),
      'error'
    )
    assert.equal(
      classifyMd3LogLine('2026-08-10T09:41:31.5234567Z PASS  app/test/x.ts'),
      'plain'
    )
  })

  it('takes the timestamp off the body and leaves an untimestamped line alone', () => {
    assert.equal(
      md3LogLineBody('2026-08-10T09:41:03.0234567Z $ npm run test:unit'),
      '$ npm run test:unit'
    )
    assert.equal(md3LogLineBody('$ npm run test:unit'), '$ npm run test:unit')
    // A line whose own text merely mentions a date keeps all of it.
    assert.equal(
      md3LogLineBody('  saved 2026-08-10T09:41:03Z to the cache'),
      '  saved 2026-08-10T09:41:03Z to the cache'
    )
  })

  it('finds the group markers in a real timestamped log', () => {
    const markers = md3ActionsTimestampedLogFixture
      .split('\n')
      .map(parseMd3LogGroupMarker)
      .filter(marker => marker !== null)

    assert.equal(markers.length, 2)
    assert.deepStrictEqual(markers[0], {
      kind: 'start',
      title: 'Run actions/checkout@v4',
    })
    assert.deepStrictEqual(markers[1], { kind: 'end' })
  })

  it('ships a timestamped log fixture that still exercises both rules', () => {
    const kinds = new Set(
      md3ActionsTimestampedLogFixture.split('\n').map(classifyMd3LogLine)
    )
    assert.ok(kinds.has('command'), 'no command line survives the timestamp')
    assert.ok(kinds.has('error'))
    assert.ok(kinds.has('plain'))
  })

  it('widens the line-number gutter with the log it is numbering', () => {
    // The contract's 44px holds two digits. These are true line numbers, so a
    // long log's widest number is its own length, and `flex: none` with no
    // min-width paints an over-wide number across the text beside it.
    assert.equal(md3ActionsLogDigits(0), 1)
    assert.equal(md3ActionsLogDigits(14), 2)
    assert.equal(md3ActionsLogDigits(1500), 4)
    assert.equal(md3ActionsLogDigits(204_318), 6)
  })

  it('omits a segment the provider has not reported', () => {
    // A zero standing in for "not loaded" is a lie the reader cannot detect:
    // `0 jobs` is a real thing a run could be, and it is not what happened.
    assert.equal(
      formatMd3RunDetail(
        run({
          status: 'queued',
          statusLabel: undefined,
          actor: null,
          sha: 'c07d115',
          jobCount: null,
          time: null,
          attempt: 1,
        })
      ),
      'queued · c07d115 · attempt 1'
    )
    assert.equal(
      formatMd3RunMeta(
        run({ number: null, branch: null, event: 'push', duration: null })
      ),
      'push'
    )
    assert.equal(
      formatMd3RunHeading(run({ name: 'CI', number: null, branch: null })),
      'CI'
    )
  })

  it('reads the contract vocabulary for a status the provider did not refine', () => {
    assert.equal(md3ActionsStatusLabel('running'), 'running')
    assert.equal(md3ActionsStatusLabel('failed'), 'failed')
    assert.equal(md3ActionsStatusLabel('success'), 'success')
    assert.equal(md3ActionsStatusLabel('cancelled'), 'cancelled')
    assert.equal(md3ActionsStatusLabel('queued'), 'queued')
  })

  it('has a reader for every value the log viewer writes', () => {
    // A custom property nothing reads is a control that changes nothing, and
    // it fails silently forever: the value is set, the class is applied, and
    // the rendered pixels never move. Follow the property to the rule that
    // consumes it rather than assuming one exists.
    const stylesheet = readFileSync(
      join(process.cwd(), 'app/styles/ui/_md3-actions.scss'),
      'utf8'
    )

    assert.match(
      stylesheet,
      /var\(--md3-actions-log-digits/,
      'the gutter width the view computes is read by nothing'
    )
    assert.match(
      stylesheet,
      /^\.md3-actions-log__timestamp\s*\{/m,
      'the timestamp column has no rule of its own, so it renders at the ' +
        'log body’s full weight and colour'
    )
    assert.match(
      stylesheet,
      /^\.md3-actions-log__number\s*\{[^}]*min-width|^\.md3-actions-log__number\s*\{[^}]*max\(44px/m,
      'the gutter is still fixed at the contract’s two-digit 44px'
    )
  })

  it('ships a fixture whose values are not all reported', () => {
    const partial = md3ActionsRunFixtures.find(x => x.jobCount === null)
    assert.ok(
      partial !== undefined,
      'no fixture exercises an unreported value, so no preview or capture ' +
        'ever shows what a half-reported row looks like'
    )
    assert.equal(partial.actor, null)
    assert.equal(partial.duration, null)
  })
})

/**
 * The Actions destination's bulk-action wiring.
 *
 * The selection algebra itself lives in `md3-list-selection.ts` and is proven
 * there; nothing here retests it. What is tested here is the wiring only this
 * view can get wrong — what it calls the filtered set, which runs it declares
 * eligible for each verb, whether the export schema and the record it builds
 * agree, and whether the destructive verb actually reaches the gate.
 */
describe('Md3ActionsView bulk actions', () => {
  const noFilters = { workflow: '', branch: '', event: '', status: '' }

  const source = readFileSync(
    join(process.cwd(), 'app/src/ui/md3/md3-actions-view.tsx'),
    'utf8'
  )

  describe('md3ActionsFiltersActive', () => {
    it('reports an unfiltered list as unfiltered', () => {
      assert.strictEqual(md3ActionsFiltersActive('', [], noFilters), false)
    })

    it('reports a query as a filter, whitespace aside', () => {
      assert.strictEqual(md3ActionsFiltersActive('rel', [], noFilters), true)
      assert.strictEqual(md3ActionsFiltersActive('   ', [], noFilters), false)
    })

    it('reports an active chip as a filter', () => {
      assert.strictEqual(
        md3ActionsFiltersActive('', ['Failed'], noFilters),
        true
      )
    })

    it('reports every advanced select as a filter', () => {
      // Each one hides runs on its own, and a select-all that says "all 12"
      // while one of them is narrowing the list is the defect the bar cannot
      // see. So each is checked separately rather than as a group.
      for (const name of ['workflow', 'branch', 'event', 'status'] as const) {
        assert.strictEqual(
          md3ActionsFiltersActive('', [], { ...noFilters, [name]: 'x' }),
          true,
          `the ${name} filter does not count as narrowing the list`
        )
      }
    })
  })

  describe('partitions', () => {
    const active = run({ id: 'a', cancellable: true })
    const done = run({ id: 'b', cancellable: false })

    it('re-runs only the finished runs, and says what it skipped', () => {
      const partition = md3ActionsRerunPartition([active, done])
      assert.deepStrictEqual(
        partition.applied.map(x => x.id),
        ['b']
      )
      assert.deepStrictEqual(
        partition.excluded.map(x => x.id),
        ['a']
      )
      assert.notStrictEqual(partition.reason, null)
    })

    it('cancels only the active runs, and says what it skipped', () => {
      const partition = md3ActionsCancelPartition([active, done])
      assert.deepStrictEqual(
        partition.applied.map(x => x.id),
        ['a']
      )
      assert.deepStrictEqual(
        partition.excluded.map(x => x.id),
        ['b']
      )
      assert.notStrictEqual(partition.reason, null)
    })

    it('carries no reason when nothing was skipped', () => {
      assert.strictEqual(md3ActionsRerunPartition([done]).reason, null)
      assert.strictEqual(md3ActionsCancelPartition([active]).reason, null)
    })
  })

  describe('export', () => {
    it('builds a record carrying every declared column', () => {
      const record = md3ActionsRunExportRecord(run())
      for (const column of Md3ActionsRunExportColumns) {
        assert.ok(
          Object.hasOwn(record, column.name),
          `the export declares "${column.name}" and the record omits it, so ` +
            'every file exported from this list has a silently empty column'
        )
      }
      assert.strictEqual(
        Object.keys(record).length,
        Md3ActionsRunExportColumns.length,
        'the record carries a field the schema never declared, so a format ' +
          'that writes a header row drops it without saying so'
      )
    })

    it('exports an unreported value as empty rather than as a zero', () => {
      const record = md3ActionsRunExportRecord(
        run({ number: null, jobCount: null, actor: null, branch: null })
      )
      // `0 jobs` in a file reads as a run with no jobs, which is a claim the
      // reader has no way to doubt.
      assert.strictEqual(record.jobCount, '')
      assert.strictEqual(record.number, '')
      assert.strictEqual(record.actor, '')
      assert.strictEqual(record.branch, '')
    })
  })

  describe('wiring', () => {
    it('tells the bar the real filtered state', () => {
      assert.match(
        source,
        /<Md3BulkBar[\s\S]{0,600}?filtered=\{filtersActive\}/,
        'the bar is told a constant instead of the view’s own filter state'
      )
    })

    it('extends a Shift range rather than replacing the ticks', () => {
      // The rows carry checkboxes, so `replace` here would silently shrink a
      // selection the user was adding to.
      assert.match(source, /md3ApplySelection\([\s\S]{0,400}?'extend'/)
    })

    it('routes the bulk cancel through the destructive gate', () => {
      assert.match(
        source,
        /id: 'cancel',[\s\S]{0,600}?destructive: true,[\s\S]{0,200}?hasPopup: 'dialog'/,
        'the bulk cancel is not marked destructive, so it neither paints the ' +
          'error role nor announces that it opens a gate'
      )
      assert.match(source, /actionId="actions-bulk-cancel"/)
      assert.match(
        source,
        /onConfirm=\{onConfirmBulkCancel\}/,
        'the gate confirms into something other than the cancel, so the ' +
          'runs are abandoned by a route that never passed the two keys'
      )
    })

    it('previews the runs the cancel will and will not touch', () => {
      assert.match(source, /preview=\{cancellable\.applied\.map/)
      assert.match(source, /previewExcluded=\{cancellable\.excluded\.map/)
      assert.match(source, /previewExcludedReason=\{cancellable\.reason\}/)
    })

    it('keeps no private copy of the bulk bar', () => {
      assert.doesNotMatch(
        source,
        /className="md3-actions-bulk"/,
        'the ad-hoc bar is still rendered beside the shared one, so the two ' +
          'can disagree about what is selected'
      )
    })
  })
})
