import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  Md3CarryOverCommands,
  md3CarryOverMenu,
  md3UnplacedCarryOverCommands,
  buildMd3CarryOverExtensions,
  type Md3CarryOverCommand,
  type Md3CarryOverHandlers,
} from '../../src/ui/md3/md3-shell-carryover'
import { MenuKinds } from '../../src/ui/md3/md3-menu-specs'

/**
 * Carry-over REACHABILITY contract.
 *
 * `feature-ledger-test.ts` proves a capability still EXISTS in the source. It
 * cannot prove the interface can still reach it, and that distinction is
 * exactly where this rewrite nearly lost forty-four things.
 *
 * The eight MD3 destination views could not host every action their legacy
 * equivalents offered — compare-to-branch, the Actions cache manager, the
 * fourteen-command native file menu, the whole repository context menu. Those
 * were catalogued into `md3-shell-carryover.ts` with the menu each now belongs
 * to. But a catalogue is not a route: while `buildMd3CarryOverExtensions` went
 * uncalled, every one of those commands compiled, kept its dispatcher
 * operation, kept its dialog in `PopupType`, kept its feature document — and
 * was unreachable from the running app. Nothing was red. The ledger was green,
 * because it was asked the wrong question.
 *
 * So this asks the right one: does each catalogued command have a handler the
 * shell will actually render? The assertion runs FROM the catalogue AT the
 * wiring, because a test shaped "every wired handler is well-formed" passes on
 * an app that wires none of them.
 */

const root = process.cwd()

describe('MD3 carry-over reachability', () => {
  it('catalogues a list worth asserting against', () => {
    assert.ok(
      Md3CarryOverCommands.length >= 40,
      `only ${Md3CarryOverCommands.length} carry-over commands catalogued; the ` +
        'eight view agents reported more than forty capabilities their views ' +
        'could not host, so a shrinking catalogue means one was dropped rather ' +
        'than rehomed'
    )

    assert.equal(
      new Set(Md3CarryOverCommands).size,
      Md3CarryOverCommands.length,
      'duplicate carry-over command ids'
    )
  })

  it('gives every carry-over command a menu that really exists', () => {
    const menus = new Set<string>(MenuKinds)
    const orphaned = Md3CarryOverCommands.filter(
      command => !menus.has(md3CarryOverMenu(command))
    )

    assert.deepEqual(
      orphaned,
      [],
      'these commands are catalogued into a menu kind the shell does not ' +
        `render, so they can never appear: ${orphaned.join(', ')}`
    )
  })

  it('reports every command left without a handler', () => {
    // With no handlers at all, every command must be reported unplaced — the
    // helper's whole job. If it under-reports here it will under-report in the
    // app, and a command with no action would render as a dead menu row.
    const unplaced = md3UnplacedCarryOverCommands({})

    assert.deepEqual(
      [...unplaced].sort(),
      [...Md3CarryOverCommands].sort(),
      'md3UnplacedCarryOverCommands did not report every command as unplaced ' +
        'when given no handlers, so it cannot be trusted to report a real gap'
    )
  })

  it('renders no dead rows for commands without handlers', () => {
    const extensions = buildMd3CarryOverExtensions({})
    const rendered = Object.values(extensions).flatMap(items => items ?? [])

    assert.deepEqual(
      rendered,
      [],
      `${rendered.length} carry-over rows would render with no action behind ` +
        'them. A menu item that looks operable and does nothing is worse than ' +
        'an absent one, because the user believes they have tried it.'
    )
  })

  it('places a command into its catalogued menu once it has a handler', () => {
    const sample = Md3CarryOverCommands[0]
    const handlers = { [sample]: () => {} } as Md3CarryOverHandlers
    const extensions = buildMd3CarryOverExtensions(handlers)
    const menu = md3CarryOverMenu(sample)

    assert.ok(
      (extensions[menu] ?? []).some(item => item.id.includes(sample)),
      `${sample} has a handler but does not appear in its ${menu} menu`
    )
    assert.deepEqual(md3UnplacedCarryOverCommands(handlers).slice().sort(), [
      ...Md3CarryOverCommands.filter(command => command !== sample),
    ].sort())
  })

  /**
   * The one that matters. Everything above tests the module in isolation; this
   * asks whether the application actually uses it. A perfectly correct carry-over
   * module that nothing calls rehomes nothing.
   */
  it('is wired into the app rather than only catalogued', () => {
    const app = readFileSync(join(root, 'app/src/ui/app.tsx'), 'utf8')

    assert.ok(
      /buildMd3CarryOverExtensions\s*\(/.test(app),
      'app.tsx never calls buildMd3CarryOverExtensions, so none of the ' +
        `${Md3CarryOverCommands.length} carry-over capabilities can be reached ` +
        'from the running app. They still compile, still have their dispatcher ' +
        'operations and still have their feature documents — which is exactly ' +
        'why nothing else catches this.'
    )

    assert.ok(
      /menuExtensions\s*=/.test(app),
      'app.tsx builds the extensions but never passes menuExtensions to the ' +
        'shell, so they are computed and thrown away'
    )
  })

  it('leaves no carry-over command unhandled in the app', () => {
    const app = readFileSync(join(root, 'app/src/ui/app.tsx'), 'utf8')
    const handlerBlock = /buildMd3CarryOverExtensions\(([\s\S]*?)\n\s{4}\)/.exec(app)

    assert.ok(
      handlerBlock !== null,
      'could not read the handler object passed to buildMd3CarryOverExtensions'
    )

    const wired = new Set(
      [...handlerBlock[1].matchAll(/^\s*([A-Za-z0-9]+):/gm)].map(m => m[1])
    )
    const missing = Md3CarryOverCommands.filter(
      (command: Md3CarryOverCommand) => !wired.has(command)
    )

    assert.deepEqual(
      missing,
      [],
      `${missing.length} carry-over capabilities have no handler in app.tsx and ` +
        `are therefore unreachable:\n  ${missing.join('\n  ')}`
    )
  })
})
