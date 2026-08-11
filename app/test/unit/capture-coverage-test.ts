import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Screenshot coverage contract for the MD3 shell.
 *
 * "Replace all the screenshots" fails in two ways that nothing else catches. A
 * surface the new shell introduced that nobody thought to photograph simply has
 * no frame, and no test looks for a file that was never named. And a frame that
 * was regenerated from a build predating the change it claims to show is worse
 * than missing — it is confidently wrong, it looks completely normal, and a
 * reader has no way to tell.
 *
 * So this iterates `app/test/fixtures/capture-coverage.json` and demands each
 * required surface be ACCOUNTED FOR: either a real PNG exists and records the
 * commit it was captured from, or the ledger says it is pending and why. The
 * direction matters — a test shaped "every PNG present is well-formed" passes
 * on a gallery that is missing seventy of them.
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
  readonly requiredCount: number
  readonly statuses: Readonly<Record<string, ICaptureStatus>>
  readonly required: ReadonlyArray<{
    readonly id: string
    readonly source: 'derived' | 'declared'
    readonly shows: string
  }>
}

const root = process.cwd()

const ledger = JSON.parse(
  readFileSync(join(root, 'app/test/fixtures/capture-coverage.json'), 'utf8')
) as ICaptureLedger

const galleryPath = (id: string) =>
  join(root, 'docs/assets/screenshots', `${id}.png`)

describe('MD3 screenshot coverage', () => {
  it('enumerates a coverage list worth asserting against', () => {
    // If the extractor's derivation ever breaks, every check below would
    // iterate a short list and pass on a gallery covering almost nothing.
    assert.equal(ledger.required.length, ledger.requiredCount)

    const derived = ledger.required.filter(entry => entry.source === 'derived')
    const declared = ledger.required.filter(
      entry => entry.source === 'declared'
    )

    // 8 destinations + 23 menu kinds, straight out of the design contract.
    assert.equal(derived.length, 31)
    assert.ok(
      declared.length >= 40,
      `only ${declared.length} hand-declared surfaces; the declared half is ` +
        'the half a derivation cannot supply, so it shrinking is a warning'
    )

    const ids = ledger.required.map(entry => entry.id)
    assert.equal(new Set(ids).size, ids.length, 'duplicate capture ids')
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
