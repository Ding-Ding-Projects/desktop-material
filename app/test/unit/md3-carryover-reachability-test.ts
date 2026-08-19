import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  Md3CarryOverCommands,
  md3CarryOverIsDestructive,
  md3CarryOverMenu,
  md3UnplacedCarryOverCommands,
  buildMd3CarryOverExtensions,
  type Md3CarryOverCommand,
  type Md3CarryOverHandlers,
} from '../../src/ui/md3/md3-shell-carryover'
import {
  IMd3MenuHandlers,
  MenuKind,
  MenuKinds,
  defaultMd3MenuContext,
} from '../../src/ui/md3/md3-menu-specs'
import {
  IMd3ShellState,
  Md3Shell,
  createMd3ShellState,
  md3NoViews,
} from '../../src/ui/md3/md3-shell'
import { MaterialSymbolNames } from '../../src/ui/lib/material-symbol'
import { DefaultAppIdentityCustomization } from '../../src/models/app-identity'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../src/lib/i18n-resources'
import { PopupType } from '../../src/models/popup'
import { FetchType } from '../../src/models/fetch'
import {
  loadBranchVisibilityState,
  saveBranchVisibilityState,
} from '../../src/lib/branch-visibility'
import { generateRepositoryListContextMenu } from '../../src/ui/repositories-list/repository-list-item-context-menu'
import { Repository } from '../../src/models/repository'
import { IMenuItem } from '../../src/lib/menu-item'
import { fireEvent, render } from '../helpers/ui/render'

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
    assert.deepEqual(
      md3UnplacedCarryOverCommands(handlers).slice().sort(),
      [...Md3CarryOverCommands.filter(command => command !== sample)].sort()
    )
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
    const handlerBlock =
      /buildMd3CarryOverExtensions\(([\s\S]*?)\n\s{4}\)/.exec(app)

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

// ---------------------------------------------------------------------------
// The route, driven end to end
// ---------------------------------------------------------------------------

/**
 * Everything above proves a handler EXISTS. That is one question short of the
 * one that matters, and it is the same shortfall that let forty-four
 * capabilities sit green while nothing could reach them: a handler nobody can
 * click is exactly as unreachable as no handler at all.
 *
 * So the tests below run the whole route — catalogue, `menuExtensions`, the
 * real `Md3Shell`, the real menu overlay, a real click — and then assert what
 * ACTUALLY HAPPENED at the far end of it. Each representative command's
 * handler is wired to real application machinery rather than to a counter: a
 * real `PopupType` reaches a recording dispatcher, a real fetch call is made
 * with the real `FetchType`, the real repository-list context menu is built by
 * the real builder and one of its items is invoked, and a real persisted
 * branch-visibility record is written and read back from real storage.
 *
 * A test that only asserted "the spy ran" would pass on a handler that
 * receives the click and does nothing with it, which is the shape of every
 * defect this file exists to catch.
 */

// jsdom implements no layout, so it ships no `scrollIntoView`; the menu
// overlay calls it on a real browser. The gap is the environment's.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no layout in jsdom, so there is nothing to scroll */
  }
}

const noop = () => undefined

const menuHandlers: IMd3MenuHandlers = {
  onCommand: noop,
  onNavigate: noop,
  onToggle: noop,
  onSwitchRepository: noop,
  onSwitchBranch: noop,
  onSwitchAccount: noop,
  onOpenMenu: noop,
  onOpenRegexBuilder: noop,
}

function openOn(menu: MenuKind): IMd3ShellState {
  return createMd3ShellState({
    overlay: { kind: 'menu', menu, filter: '', regexEnabled: false },
  })
}

/**
 * Mount the real shell with one menu already open and the carry-over
 * extensions built from `handlers`, then click the row belonging to `command`.
 *
 * The row is found by the id `buildMd3CarryOverExtensions` gives it, so a
 * command that was built into the wrong menu, or not built at all, fails here
 * rather than in an assertion about its side effect.
 */
function clickCarryOverRow(
  command: Md3CarryOverCommand,
  handlers: Md3CarryOverHandlers
) {
  const menu = md3CarryOverMenu(command)
  const view = render(
    React.createElement(Md3Shell, {
      initialState: openOn(menu),
      appIdentity: DefaultAppIdentityCustomization,
      accountInitials: 'AL',
      unreadCount: 0,
      onCommitAndPush: noop,
      onOpenPalette: noop,
      onOpenNotifications: noop,
      onToggleTheme: noop,
      onOpenSettings: noop,
      onOpenAccountSwitcher: noop,
      repositoryName: 'desktop-material',
      branchName: 'development',
      pushState: 'clean' as const,
      aheadCount: 0,
      onFetch: noop,
      onPush: noop,
      menuContext: defaultMd3MenuContext,
      menuHandlers,
      menuExtensions: buildMd3CarryOverExtensions(handlers),
      compose: {
        summary: '',
        description: '',
        includedFileCount: 0,
        totalFileCount: 0,
        addedLineCount: 0,
        deletedLineCount: 0,
        branchName: 'development',
        onSummaryChanged: noop,
        onDescriptionChanged: noop,
        onCommit: noop,
        onCommitAndPush: noop,
        onDraftWithCopilot: noop,
        onAddCoAuthors: noop,
      },
      views: md3NoViews,
      renderLegacyDestination: () => null,
    })
  )

  const row = view.container.ownerDocument.querySelector<HTMLButtonElement>(
    `[data-item-id="carry-${command}"]`
  )

  assert.ok(
    row !== null,
    `${command} rendered no row in its catalogued ${menu} menu, so nothing ` +
      'the user can click reaches its handler'
  )

  fireEvent.click(row)
  return view
}

/** The smallest dispatcher-shaped double that records what was asked of it. */
interface IRecordingDispatcher {
  readonly popups: Array<{ readonly type: PopupType }>
  readonly fetches: Array<{
    readonly repository: Repository
    readonly fetchType: FetchType
  }>
}

function recordingDispatcher(): IRecordingDispatcher {
  return { popups: [], fetches: [] }
}

const sampleRepository = new Repository(
  'C:/repos/desktop-material',
  4711,
  null,
  false
)

describe('MD3 carry-over reachability — the route, end to end', () => {
  it('opens a real dialog when a dialog-opening row is clicked', () => {
    // `discardFile` is the representative dialog opener, and it is one of the
    // destructive six: the dialog it opens is the one hosting the shared
    // two-key gate, so reaching that exact popup is what keeps the gate on the
    // path rather than beside it.
    const dispatcher = recordingDispatcher()

    clickCarryOverRow('discardFile', {
      discardFile: () =>
        dispatcher.popups.push({ type: PopupType.ConfirmDiscardChanges }),
    })

    assert.deepEqual(
      dispatcher.popups.map(popup => popup.type),
      [PopupType.ConfirmDiscardChanges],
      'clicking the discard row did not open the discard dialog; the row is ' +
        'reachable but its action never reaches a surface'
    )
  })

  it('makes a real dispatcher call when a dispatching row is clicked', () => {
    const dispatcher = recordingDispatcher()

    clickCarryOverRow('fetchRemoteBranches', {
      fetchRemoteBranches: () =>
        dispatcher.fetches.push({
          repository: sampleRepository,
          fetchType: FetchType.UserInitiatedTask,
        }),
    })

    assert.equal(dispatcher.fetches.length, 1)
    assert.equal(dispatcher.fetches[0].repository, sampleRepository)
    assert.equal(
      dispatcher.fetches[0].fetchType,
      FetchType.UserInitiatedTask,
      'a fetch started from a menu the user just clicked is user-initiated; a ' +
        'background fetch type would suppress the very progress the click asked to see'
    )
  })

  it('builds a real native context menu when the repository row is clicked', () => {
    // The repository list menu is the one carried-over capability whose whole
    // content is the platform's own menu, so the assertion is that the REAL
    // builder produced real, labelled, invocable items — not that a callback
    // fired.
    const shown: Array<ReadonlyArray<IMenuItem>> = []
    const removed: Array<Repository> = []

    clickCarryOverRow('repositoryListMenu', {
      repositoryListMenu: () =>
        shown.push(
          generateRepositoryListContextMenu({
            repository: sampleRepository,
            accounts: [],
            shellLabel: undefined,
            externalEditorLabel: undefined,
            askForConfirmationOnRemoveRepository: false,
            onViewOnGitHub: noop,
            onOpenInNewWindow: noop,
            onOpenInShell: noop,
            onShowRepository: noop,
            onOpenInExternalEditor: noop,
            onRemoveRepository: repository =>
              removed.push(repository as Repository),
            onChangeRepositoryAlias: noop,
            onRemoveRepositoryAlias: noop,
            onChangeRepositoryGroupName: noop,
            onRemoveRepositoryGroupName: noop,
          })
        ),
    })

    assert.equal(shown.length, 1, 'no context menu was built')

    const items = shown[0]
    const labelled = items.filter(
      item => typeof item.label === 'string' && item.label.length > 0
    )
    assert.ok(
      labelled.length >= 5,
      `the repository context menu built only ${labelled.length} labelled ` +
        'items; the capability being carried over is the whole menu, not a stub'
    )

    const remove = items.find(item => item.label === 'Remove')
    assert.ok(remove !== undefined, 'the built menu has no Remove item')
    remove.action?.()

    assert.deepEqual(
      removed,
      [sampleRepository],
      'the built menu item is inert: invoking it ran no action, which is the ' +
        'decorative-control defect wearing a native menu'
    )
  })

  it('writes a real persisted preference when a toggling row is clicked', () => {
    // Branch visibility is a persisted per-repository record rather than a
    // session flag, so the honest proof is a write followed by a read back out
    // of the same store the branches view loads from on the next launch.
    const repositoryId = 90210
    saveBranchVisibilityState(repositoryId, {
      pinned: [],
      hidden: [],
      solo: null,
    })

    clickCarryOverRow('togglePinBranch', {
      togglePinBranch: () => {
        const current = loadBranchVisibilityState(repositoryId)
        saveBranchVisibilityState(repositoryId, {
          ...current,
          pinned: [...current.pinned, 'release/26.8'],
        })
      },
    })

    assert.deepEqual(
      loadBranchVisibilityState(repositoryId).pinned,
      ['release/26.8'],
      'the pin row ran but nothing was persisted, so the pin is gone at the ' +
        'next launch and the row only appeared to work'
    )
  })

  it('closes the menu after a carry-over row runs', () => {
    // A menu left open over the surface its own action just changed is the
    // same defect as a row that does nothing: the user cannot see what
    // happened. `Md3Shell` closes for the host, because the host cannot see
    // the overlay state.
    let ran = 0
    const view = clickCarryOverRow('copyBranchName', {
      copyBranchName: () => {
        ran += 1
      },
    })

    assert.equal(ran, 1)
    assert.equal(
      view.container.ownerDocument.querySelectorAll('[role="menuitem"]').length,
      0,
      'the menu stayed open after its row ran'
    )
  })

  it('renders and runs every catalogued command, in its own menu', () => {
    // The four above are representative; this is the sweep. Running it per
    // command is what makes a single mis-catalogued menu kind fail by name
    // rather than hiding inside a summary count.
    const failures: Array<string> = []

    for (const command of Md3CarryOverCommands) {
      let ran = 0
      try {
        clickCarryOverRow(command, {
          [command]: () => {
            ran += 1
          },
        } as Md3CarryOverHandlers)
      } catch (error) {
        failures.push(`${command}: ${(error as Error).message}`)
        continue
      }
      if (ran !== 1) {
        failures.push(`${command}: clicked, but its handler ran ${ran} times`)
      }
    }

    assert.deepEqual(
      failures,
      [],
      `carry-over rows that cannot be operated:\n  ${failures.join('\n  ')}`
    )
  })
})

// ---------------------------------------------------------------------------
// The catalogue's own facts
// ---------------------------------------------------------------------------

describe('MD3 carry-over reachability — the catalogue is renderable', () => {
  it('names only glyphs the bundled symbol font actually carries', () => {
    // A name the bundled subset does not carry does not fall back to a box:
    // the ligature font renders the literal English word, so `push_pin` would
    // read as the words "push pin" beside the label.
    const bundled = new Set<string>(MaterialSymbolNames)
    const built = buildMd3CarryOverExtensions(
      Object.fromEntries(
        Md3CarryOverCommands.map(command => [command, noop])
      ) as Md3CarryOverHandlers
    )

    const unknown = Object.values(built)
      .flatMap(items => items ?? [])
      .filter(item => !bundled.has(item.icon))
      .map(item => `${item.id} → ${item.icon}`)

    assert.deepEqual(
      unknown,
      [],
      `carry-over rows naming a glyph the bundled font does not have, which ` +
        `renders the literal English word instead:\n  ${unknown.join('\n  ')}`
    )
  })

  it('has real copy in both catalogues for every command', () => {
    const missing: Array<string> = []
    const untranslated: Array<string> = []

    const built = buildMd3CarryOverExtensions(
      Object.fromEntries(
        Md3CarryOverCommands.map(command => [command, noop])
      ) as Md3CarryOverHandlers
    )
    const labels = new Map(
      Object.values(built)
        .flatMap(items => items ?? [])
        .map(item => [item.id, item.label])
    )

    for (const command of Md3CarryOverCommands) {
      const key =
        `md3.shell.carry.${command}` as keyof typeof englishTranslations
      const english = englishTranslations[key]
      const cantonese = cantoneseTranslations[key]

      if (typeof english !== 'string' || english.length === 0) {
        missing.push(`${key} (English)`)
        continue
      }
      if (typeof cantonese !== 'string' || cantonese.length === 0) {
        missing.push(`${key} (Cantonese)`)
        continue
      }
      if (cantonese === english) {
        untranslated.push(key)
      }

      // The rendered row must carry that copy rather than a key or a stub,
      // which is what a colliding namespace would silently produce.
      assert.equal(
        labels.get(`carry-${command}`),
        english,
        `${command} renders "${labels.get(`carry-${command}`)}" rather than ` +
          `its own copy "${english}"`
      )
    }

    assert.deepEqual(
      missing,
      [],
      `carry-over copy missing: ${missing.join(', ')}`
    )
    assert.deepEqual(
      untranslated,
      [],
      `carry-over copy left as the English string in the Cantonese ` +
        `catalogue: ${untranslated.join(', ')}`
    )
  })

  it('keeps the destructive flags somebody decided on', () => {
    // Hand-written, because the flag is what routes an action through the
    // shared two-key gate. A test that read the catalogue back to itself would
    // agree with a command that had quietly lost its flag, and the first
    // person to notice would be whoever discarded their work without a gate.
    const expected = [
      'bulkDeleteBranches',
      'discardAll',
      'discardFile',
      'mergeAndDelete',
      'permanentlyDiscardAll',
      'permanentlyDiscardFile',
    ]

    assert.deepEqual(
      Md3CarryOverCommands.filter(md3CarryOverIsDestructive).slice().sort(),
      expected,
      'the set of destructive carry-over commands changed; each one routes ' +
        'through the shared destructive gate, so adding or removing a flag is ' +
        'a decision that belongs in this list too'
    )
  })
})
