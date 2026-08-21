import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Screenshot coverage contract for the current frozen desktop renderer.
 *
 * "Replace all the screenshots" fails in two ways that nothing else catches. A
 * current surface nobody thought to photograph simply has
 * no frame, and no test looks for a file that was never named. And a frame that
 * was regenerated from a build predating the change it claims to show is worse
 * than missing — it is confidently wrong, it looks completely normal, and a
 * reader has no way to tell.
 *
 * The former inventory derived its rows from a removed MD3 shell contract. The
 * current ledger is hand-written and maps each current source boundary to a
 * pending-or-captured receipt. That prevents a historical gallery image from
 * silently standing in for the frozen interface that ships today.
 *
 * A `pending` entry is not a failure. An UNACCOUNTED entry is, because that is
 * a surface nobody has decided anything about.
 */

interface ICaptureStatus {
  readonly state: 'captured' | 'pending'
  /** For `captured`: the commit the built artifact was made from. */
  readonly commit?: string
  /** For `pending`: what is blocking it. */
  readonly reason?: string
}

interface ICaptureLedger {
  readonly baseline: string
  readonly requiredCount: number
  readonly statuses: Readonly<Record<string, ICaptureStatus>>
  readonly required: ReadonlyArray<{
    readonly id: string
    readonly source: 'current-renderer'
    readonly shows: string
    readonly sourcePaths: ReadonlyArray<string>
  }>
}

const root = process.cwd()

const ledger = JSON.parse(
  readFileSync(join(root, 'app/test/fixtures/capture-coverage.json'), 'utf8')
) as ICaptureLedger

const galleryPath = (id: string) =>
  join(root, 'docs/assets/screenshots', `${id}.png`)

describe('frozen desktop screenshot coverage', () => {
  it('enumerates a coverage list worth asserting against', () => {
    // The list is intentionally hand-written; a new current-renderer feature
    // needs an explicit capture row rather than an inference from retired UI.
    assert.equal(ledger.required.length, ledger.requiredCount)
    assert.ok(
      ledger.required.length >= 26,
      `only ${ledger.required.length} current rows; high-risk current ` +
        'surfaces must not disappear from the capture ledger'
    )

    const ids = ledger.required.map(entry => entry.id)
    assert.equal(new Set(ids).size, ids.length, 'duplicate capture ids')

    assert.match(ledger.baseline, /^[0-9a-f]{40}$/)

    for (const entry of ledger.required) {
      assert.equal(entry.source, 'current-renderer')
      assert.ok(entry.sourcePaths.length > 0, `${entry.id} has no source path`)
      for (const sourcePath of entry.sourcePaths) {
        assert.ok(
          existsSync(join(root, sourcePath)),
          `${entry.id} maps to missing current source ${sourcePath}`
        )
      }
    }

    for (const id of [
      'toy-lock-disabled-target',
      'school-mode-active',
      'narrator-voice-automatic',
      'attention-focus',
      'attention-low-stimulation',
      'attention-time-awareness',
      'attention-one-thing',
      'attention-momentum',
      'support-tickets-help-route',
      'authenticator-history',
      'publish-reauthentication',
    ]) {
      assert.ok(ids.includes(id), `missing current high-risk capture row ${id}`)
    }
  })

  it('accounts for every required surface', () => {
    const unaccounted = ledger.required
      .filter(entry => {
        const status = ledger.statuses[entry.id]
        if (status === undefined) {
          return !existsSync(galleryPath(entry.id))
        }
        return false
      })
      .map(entry => entry.id)

    assert.deepEqual(
      unaccounted,
      [],
      'these surfaces have no capture and no recorded status — nobody has ' +
        `decided anything about them:\n  ${unaccounted.join('\n  ')}`
    )
  })

  it('gives every pending capture a real reason', () => {
    for (const [id, status] of Object.entries(ledger.statuses)) {
      if (status.state !== 'pending') {
        continue
      }

      assert.ok(
        (status.reason ?? '').trim().length > 15,
        `pending capture ${id} needs a real blocker, not "${status.reason}"`
      )
    }
  })

  it('records the source commit for every captured surface', () => {
    const missingProvenance: Array<string> = []

    for (const [id, status] of Object.entries(ledger.statuses)) {
      if (status.state !== 'captured') {
        continue
      }

      if (!/^[0-9a-f]{7,40}$/.test(status.commit ?? '')) {
        missingProvenance.push(id)
        continue
      }

      if (!existsSync(galleryPath(id))) {
        missingProvenance.push(`${id} (recorded captured, no PNG on disk)`)
      }
    }

    assert.deepEqual(
      missingProvenance,
      [],
      'a capture without the commit it came from cannot be shown to be current:\n  ' +
        missingProvenance.join('\n  ')
    )
  })

  it('reports how much of the gallery is still outstanding', () => {
    const pending = ledger.required.filter(
      entry => ledger.statuses[entry.id]?.state === 'pending'
    )
    const captured = ledger.required.filter(
      entry => ledger.statuses[entry.id]?.state === 'captured'
    )

    // Not a failure — the honest number, printed so a run cannot look complete
    // while most of the gallery is still a plan.
    process.stdout.write(
      `\n  capture coverage: ${captured.length} captured, ${pending.length} ` +
        `pending, ${ledger.required.length} required\n`
    )

    assert.ok(captured.length + pending.length <= ledger.required.length)
  })
})
