import assert from 'node:assert'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Feature-preservation contract.
 *
 * `app/test/fixtures/feature-ledger.json` is a frozen inventory of every
 * user-facing surface the app had before the MD3 shell rewrite. Replacing a
 * whole interface is exactly the change where a capability disappears without
 * anybody deciding to remove it: a dialog only the old toolbar opened, a menu
 * command whose only caller was the old sidebar, a documented feature whose
 * entry point moved and never arrived. Nothing goes red — the implementation
 * still compiles, it is merely unreachable — and the first person to notice is
 * a user looking for it.
 *
 * So these assertions run FROM the ledger AT the tree. A test shaped "every
 * dialog present is well-formed" passes cleanly on a tree that has lost half of
 * them; it never looked for the missing ones, because it only iterated what was
 * there. Every check below iterates the recorded baseline instead.
 *
 * A surface may MOVE freely — the ledger asserts the capability still exists,
 * not that it lives where it used to. A surface may only DISAPPEAR by being
 * listed in the ledger's `retired` array with a reason, which makes a removal a
 * decision somebody wrote down.
 */

interface IFeatureLedger {
  readonly retired: ReadonlyArray<{ readonly id: string; readonly reason: string }>
  readonly popupTypes: ReadonlyArray<string>
  readonly menuIds: ReadonlyArray<string>
  readonly featureDocs: ReadonlyArray<string>
  readonly uiAreas: ReadonlyArray<string>
  readonly dispatcherOperations: ReadonlyArray<string>
}

const root = process.cwd()

const ledger = JSON.parse(
  readFileSync(join(root, 'app/test/fixtures/feature-ledger.json'), 'utf8')
) as IFeatureLedger

const retired = new Set(ledger.retired.map(entry => entry.id))
const kept = (entries: ReadonlyArray<string>) =>
  entries.filter(entry => !retired.has(entry))

const source = (relativePath: string) =>
  readFileSync(join(root, relativePath), 'utf8')

describe('feature preservation ledger', () => {
  it('records a reason for every deliberately retired surface', () => {
    for (const entry of ledger.retired) {
      assert.ok(
        entry.reason.trim().length > 10,
        `retired entry ${entry.id} needs a real reason, not "${entry.reason}"`
      )
    }
  })

  it('still declares every dialog the app could open', () => {
    const popup = source('app/src/models/popup.ts')
    const block = /export enum PopupType \{([\s\S]*?)^\}/m.exec(popup)
    assert.ok(block !== null, 'PopupType enum not found')

    const present = new Set(
      [...block[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\s*(?:=|,)/gm)].map(m => m[1])
    )
    const missing = kept(ledger.popupTypes).filter(name => !present.has(name))

    assert.deepEqual(
      missing,
      [],
      `dialogs dropped from PopupType: ${missing.join(', ')}. ` +
        'Restore them, or record each in the ledger\'s `retired` list with a reason.'
    )
  })

  it('still declares every application-menu command', () => {
    const ids = source('app/src/models/menu-ids.ts')
    const present = new Set([...ids.matchAll(/'([^']+)'/g)].map(m => m[1]))
    const missing = kept(ledger.menuIds).filter(id => !present.has(id))

    assert.deepEqual(
      missing,
      [],
      `menu commands dropped from MenuIDs: ${missing.join(', ')}`
    )
  })

  it('still ships every documented feature article', () => {
    const missing = kept(ledger.featureDocs).filter(
      path => !existsSync(join(root, path))
    )

    assert.deepEqual(
      missing,
      [],
      `feature documents deleted: ${missing.join(', ')}. ` +
        'A documented capability with no document is a capability nobody can find.'
    )
  })

  it('still ships every UI feature area', () => {
    const base = join(root, 'app/src/ui')
    const present = new Set(
      readdirSync(base).filter(entry => statSync(join(base, entry)).isDirectory())
    )
    const missing = kept(ledger.uiAreas).filter(area => !present.has(area))

    assert.deepEqual(
      missing,
      [],
      `UI feature areas deleted: ${missing.join(', ')}`
    )
  })

  it('still exposes every dispatcher operation the UI can invoke', () => {
    const candidates = [
      'app/src/ui/dispatcher/dispatcher.ts',
      'app/src/ui/dispatcher/index.ts',
    ]
    const file = candidates.find(candidate => existsSync(join(root, candidate)))
    assert.ok(file !== undefined, 'dispatcher source not found')

    const present = new Set(
      [...source(file).matchAll(/^\s{2}public (?:async )?([A-Za-z0-9_]+)\s*[(<]/gm)].map(
        m => m[1]
      )
    )
    const missing = kept(ledger.dispatcherOperations).filter(
      operation => !present.has(operation)
    )

    assert.deepEqual(
      missing,
      [],
      `dispatcher operations removed: ${missing.join(', ')}. ` +
        'An operation with no caller is dead code; an operation the UI lost the ' +
        'route to is a deleted feature.'
    )
  })

  // The checks above prove a surface still EXISTS. This one proves the ledger
  // itself is not quietly shrinking: a refresh run over a removal would rewrite
  // the baseline and every assertion above would pass on the smaller tree.
  it('has not shrunk below the recorded baseline sizes', () => {
    const floors: ReadonlyArray<readonly [string, number, number]> = [
      ['popupTypes', ledger.popupTypes.length, 134],
      ['menuIds', ledger.menuIds.length, 54],
      ['featureDocs', ledger.featureDocs.length, 154],
      ['uiAreas', ledger.uiAreas.length, 129],
      ['dispatcherOperations', ledger.dispatcherOperations.length, 506],
    ]

    for (const [name, actual, floor] of floors) {
      assert.ok(
        actual + retired.size >= floor,
        `${name} fell from the ${floor} recorded before the MD3 rewrite to ` +
          `${actual}, with only ${retired.size} retirements recorded. ` +
          'Something was removed without a decision.'
      )
    }
  })
})
