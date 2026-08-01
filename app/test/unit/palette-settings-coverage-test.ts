import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import { CommandPaletteCatalog } from '../../src/lib/command-palette-catalog'
import { RepositorySettingsTab } from '../../src/models/repository-settings'

const src = Path.resolve(__dirname, '../../src')

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
