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
  readonly retired: ReadonlyArray<{
    readonly id: string
    readonly reason: string
  }>
  readonly orphanedPopupTypes: ReadonlyArray<string>
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
        "Restore them, or record each in the ledger's `retired` list with a reason."
    )
  })

  /**
   * The REACHABILITY dimension.
   *
   * Every assertion above this one asks whether a capability still EXISTS.
   * That is the wrong question on its own, and answering it is precisely how
   * forty-four carried-over capabilities sat green in this repository while
   * nothing in the running application could reach a single one of them: they
   * still compiled, still had their dispatcher operations, still had their
   * feature documents, and still had their entry in `PopupType`.
   *
   * A dialog whose last caller disappears behaves exactly the same way. The
   * enum still declares it, `renderPopup` still has a `case` that draws it,
   * every test that iterates what is present still passes — and no route in
   * the product opens it ever again.
   *
   * So this asks the other question: for every dialog the ledger records, does
   * some file actually CONSTRUCT one? A `case PopupType.X:` deliberately does
   * not count. That proves the app can draw the dialog once somebody hands it
   * one, which is the half that never breaks.
   */
  const popupOpeningSites = (): ReadonlyMap<string, ReadonlySet<string>> => {
    const sites = new Map<string, Set<string>>()
    const base = join(root, 'app/src')

    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry.name)) {
          continue
        }

        const relativePath = full
          .slice(root.length + 1)
          .split(/[\\/]/)
          .join('/')

        // The union's own declarations name every popup by definition, so
        // counting them would make this assertion vacuous — it would report
        // every dialog reachable, forever, including the ones nobody opens.
        if (relativePath === 'app/src/models/popup.ts') {
          continue
        }

        const text = readFileSync(full, 'utf8')
        for (const match of text.matchAll(
          /type\s*[:=]\s*PopupType\.([A-Za-z0-9_]+)/g
        )) {
          const found = sites.get(match[1]) ?? new Set<string>()
          found.add(relativePath)
          sites.set(match[1], found)
        }
      }
    }

    walk(base)
    return sites
  }

  it('counts a construction as a route and a render switch as nothing', () => {
    // The matcher above is the whole assertion, so it gets its own test. A
    // pattern that also matched `case PopupType.X:` would find a route for
    // every dialog the renderer can draw and this file would report a clean
    // tree no matter how many dialogs had lost their last caller.
    const pattern = /type\s*[:=]\s*PopupType\.([A-Za-z0-9_]+)/g

    const renderSwitch = `
      switch (popup.type) {
        case PopupType.About:
          return this.renderAboutDialog(popup)
      }
    `
    assert.deepEqual(
      [...renderSwitch.matchAll(pattern)].map(match => match[1]),
      [],
      'a render switch was counted as a route, which makes the reachability ' +
        'assertion below pass on a dialog nothing opens'
    )

    const openings = `
      this.props.dispatcher.showPopup({ type: PopupType.About })
      const type = PopupType.StashAndSwitchBranch
    `
    assert.deepEqual(
      [...openings.matchAll(pattern)].map(match => match[1]),
      ['About', 'StashAndSwitchBranch'],
      'the matcher missed a real opening site, so it would report a reachable ' +
        'dialog as orphaned and the baseline below would grow for no reason'
    )
  })

  it('still has a live route to every dialog it declares', () => {
    const sites = popupOpeningSites()

    // A scan that matched nothing would report every dialog orphaned, which
    // reads as a catastrophe rather than as a broken scan. Say which it is.
    assert.ok(
      sites.size > 100,
      `only ${sites.size} dialogs have an opening site at all; that is a ` +
        'broken scan rather than a tree that lost its dialogs'
    )

    const orphaned = kept(ledger.popupTypes).filter(name => !sites.has(name))
    const baseline = new Set(ledger.orphanedPopupTypes)

    const grown = orphaned.filter(name => !baseline.has(name))
    assert.deepEqual(
      grown,
      [],
      `these dialogs are declared and rendered but nothing opens them: ` +
        `${grown.join(', ')}. The enum entry, the render case and the ` +
        'component all still exist, so nothing else in this suite notices. ' +
        "Give each one a route, or record it in the ledger's " +
        '`orphanedPopupTypes` baseline with the change that orphaned it.'
    )

    // The baseline is a debt list, not a permission slip: an entry that has
    // since been given a route must leave it, or the list stops meaning
    // anything and the next real orphan hides behind a stale name.
    const reconnected = ledger.orphanedPopupTypes.filter(name =>
      sites.has(name)
    )
    assert.deepEqual(
      reconnected,
      [],
      `these dialogs are listed as orphaned but now have a route: ` +
        `${reconnected.join(', ')}. Remove them from ` +
        '`orphanedPopupTypes` so the list keeps naming only real debt.'
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
      readdirSync(base).filter(entry =>
        statSync(join(base, entry)).isDirectory()
      )
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
      [
        ...source(file).matchAll(
          /^\s{2}public (?:async )?([A-Za-z0-9_]+)\s*[(<]/gm
        ),
      ].map(m => m[1])
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
