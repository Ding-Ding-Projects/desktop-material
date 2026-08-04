import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import { CommandPaletteCatalog } from '../../src/lib/command-palette-catalog'
import { RepositorySettingsTab } from '../../src/models/repository-settings'
import { PreferencesTab } from '../../src/models/preferences'

const src = Path.resolve(__dirname, '../../src')

/** Escapes the characters a palette event id can contain. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('palette settings coverage', () => {
  it('offers every repository settings tab by name', () => {
    // A user who knows what a setting is called should not have to know which
    // of eleven tabs it lives on. Enumerating the real enum rather than a
    // hand-written list means a new tab fails this until it is offered too.
    const tabs = Object.values(RepositorySettingsTab).filter(
      value => typeof value === 'number'
    ) as ReadonlyArray<RepositorySettingsTab>

    assert.ok(tabs.length >= 11, 'the tab enum should not have shrunk silently')

    for (const tab of tabs) {
      const command = CommandPaletteCatalog.find(
        c => c.home?.kind === 'repositorySettings' && c.home.tab === tab
      )
      assert.notEqual(
        command,
        undefined,
        `repository settings tab ${tab} is not reachable from the palette`
      )
      assert.ok((command?.title.length ?? 0) > 0)
      assert.notEqual(
        command?.titleKey,
        undefined,
        `${command?.event} must be translated, not English-only`
      )
    }
  })

  it('gates the one tab that only exists for some repositories', () => {
    const plain = {
      hasRepository: true,
      hasRemote: true,
      hasBranch: true,
      isGitHubRepository: true,
    }

    // Fork settings is the only conditionally-rendered tab, so it is the only
    // row that may be withheld — offering it for an ordinary repository would
    // teleport the reader to a tab that is not there.
    const fork = CommandPaletteCatalog.find(
      c => c.event === 'palette:repository-settings-fork-settings'
    )
    assert.equal(fork?.isAvailable?.(plain), false)
    assert.equal(fork?.isAvailable?.({ ...plain, isFork: true }), true)

    // Every other tab is rendered unconditionally, so gating its row would
    // hide a tab that is genuinely always there — a palette that is less
    // complete than the dialog it points at.
    for (const command of CommandPaletteCatalog) {
      if (
        command.home?.kind !== 'repositorySettings' ||
        command.event.endsWith('fork-settings')
      ) {
        continue
      }
      assert.equal(
        command.isAvailable?.(plain),
        true,
        `${command.event} must be offered for an ordinary repository`
      )
    }
  })

  it('reaches every Settings tab, not just the ones with a dialog', () => {
    // The palette used to open Settings and stop there. A user who knows a
    // setting's name should land on it, which means every tab has to be
    // represented by at least one row that names something on it.
    const tabs = Object.values(PreferencesTab).filter(
      v => typeof v === 'number'
    ) as ReadonlyArray<PreferencesTab>

    for (const tab of tabs) {
      const rows = CommandPaletteCatalog.filter(
        c => c.home?.kind === 'preferences' && c.home.tab === tab
      )
      assert.ok(
        rows.length > 0,
        `Settings tab ${PreferencesTab[tab]} has no palette row`
      )
    }
  })

  it('never renders a control it cannot actually read and write', async () => {
    const app = await readFile(Path.join(src, 'ui/app.tsx'), 'utf8')
    for (const command of CommandPaletteCatalog) {
      if (command.control === undefined) {
        continue
      }
      // A switch that does not move, or moves and changes nothing, is worse
      // than a row that simply takes you to the setting. Every control row
      // must have both halves of its wiring.
      // Whitespace-tolerant: the formatter wraps a long `values.set(...)`
      // onto its own lines, and a literal match would then report a wiring
      // that is plainly there.
      assert.match(
        app,
        new RegExp(`values\\.set\\(\\s*'${escapeRegex(command.event)}'`),
        `${command.event} renders a control with nothing reading its value`
      )
      assert.ok(
        app.includes(`case '${command.event}':`),
        `${command.event} renders a control that writes nowhere`
      )
    }
  })

  it('never offers a row that does nothing when selected', async () => {
    const app = await readFile(Path.join(src, 'ui/app.tsx'), 'utf8')
    const dead = CommandPaletteCatalog.filter(
      command =>
        command.home === undefined &&
        command.control === undefined &&
        !app.includes(`case '${command.event}':`)
    )
    // Three ways a row can mean something: it goes somewhere, it changes a
    // value in place, or it runs a handler. A row with none of the three is
    // the one outcome worse than not offering the command at all — the user
    // finds it, selects it, and nothing happens.
    assert.deepEqual(
      dead.map(c => c.event),
      [],
      'these rows have no home, no control and no handler'
    )
  })

  it('does not offer the same setting twice under two names', () => {
    // Two rows pointing at one setting is how a palette starts disagreeing
    // with itself: change one, and the other still shows the old value.
    const destinations = new Map<string, string>()
    for (const command of CommandPaletteCatalog) {
      const home = command.home
      if (
        home?.kind !== 'repositorySettings' ||
        command.control !== undefined
      ) {
        continue
      }
      const key = `repositorySettings:${home.tab}`
      const first = destinations.get(key)
      assert.equal(
        first,
        undefined,
        `${command.event} and ${first} both stand for the same tab`
      )
      destinations.set(key, command.event)
    }
  })

  it('reaches the Help links that lived only in the menu bar', async () => {
    const app = await readFile(Path.join(src, 'ui/app.tsx'), 'utf8')
    for (const event of [
      'palette:report-issue',
      'palette:contact-support',
      'palette:user-guides',
      'palette:keyboard-shortcuts',
      'palette:show-logs-folder',
    ]) {
      assert.notEqual(
        CommandPaletteCatalog.find(c => c.event === event),
        undefined,
        `${event} is missing from the catalog`
      )
      // A catalog entry with no handler is a row that does nothing when
      // selected, which is worse than not offering the command at all.
      assert.ok(
        app.includes(`case '${event}':`),
        `${event} has no handler in app.tsx`
      )
    }
  })

  it('keeps the live notification centre separate from local history', async () => {
    const app = await readFile(Path.join(src, 'ui/app.tsx'), 'utf8')
    const centre = CommandPaletteCatalog.find(
      command => command.event === 'palette:notification-centre'
    )
    const history = CommandPaletteCatalog.find(
      command => command.event === 'palette:notification-history'
    )

    assert.equal(centre?.titleKey, 'palette.notificationCentre')
    assert.equal(history?.titleKey, 'palette.notificationHistory')
    assert.equal(centre?.home?.kind, 'surface')
    assert.equal(
      centre?.home?.kind === 'surface' ? centre.home.labelKey : undefined,
      'commandPalette.homeNotificationCentre'
    )
    assert.notEqual(centre?.title, history?.title)
    assert.match(
      app,
      /case 'palette:notification-centre':\s*return this\.props\.dispatcher\.setNotificationCentreOpen\(true\)/
    )
    assert.match(
      app,
      /case 'palette:notification-history':\s*return this\.props\.dispatcher\.showPopup\(\{\s*type: PopupType\.NotificationHistory/
    )
  })

  it('dispatches every repository settings row to a real handler', async () => {
    const app = await readFile(Path.join(src, 'ui/app.tsx'), 'utf8')
    for (const command of CommandPaletteCatalog) {
      if (command.home?.kind !== 'repositorySettings') {
        continue
      }
      assert.ok(
        app.includes(`case '${command.event}':`),
        `${command.event} has no handler in app.tsx`
      )
    }
  })
})
