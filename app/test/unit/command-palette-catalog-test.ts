import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  CommandPaletteCatalog,
  IPaletteCommandContext,
  filterPaletteCommands,
  preferencesPaletteEvent,
  resolvePaletteHome,
} from '../../src/lib/command-palette-catalog'
import { PreferencesTab } from '../../src/models/preferences'
import {
  TeleportTargetSelectors,
  teleportTargetSelector,
} from '../../src/lib/teleport-targets'
import { translate } from '../../src/lib/i18n'
import { languageModes } from '../../src/models/language-mode'

/** A selection with nothing usefully selected. */
const emptyContext: IPaletteCommandContext = {
  platform: 'win32',
  hasRepository: false,
  hasRemote: false,
  hasBranch: false,
  isGitHubRepository: false,
}

/** A repository selected and checked out on a valid branch with a remote. */
const branchContext: IPaletteCommandContext = {
  platform: 'win32',
  hasRepository: true,
  hasRemote: true,
  hasBranch: true,
  isGitHubRepository: true,
}

/** A repository selected but not on a named branch (detached / unborn). */
const repositoryContext: IPaletteCommandContext = {
  platform: 'win32',
  hasRepository: true,
  hasRemote: false,
  hasBranch: false,
  isGitHubRepository: false,
}

/** Newly added palette commands the expansion must keep registered. */
const NewCommandEvents = [
  'select-all',
  'palette:toggle-theme',
  'palette:preferences-accounts',
  'palette:preferences-appearance',
  'palette:preferences-integrations',
  'palette:preferences-automation',
  'palette:preferences-advanced',
  'palette:preferences-notifications',
  'palette:preferences-git',
  'palette:preferences-accessibility',
  'palette:ollama-model-manager',
  'palette:ollama-chat',
  'palette:preferences-copilot',
  'palette:preferences-sound',
  'palette:background-queue',
  'palette:cheap-lfs-settings',
  'palette:repository-automation',
  'palette:tag-lifecycle',
  'palette:github-api-explorer',
  'palette:notification-centre',
  'palette:notification-history',
  'palette:notification-automations',
  'palette:copy-repo-path',
  'palette:copy-branch-name',
  'palette:copy-commit-sha',
  'palette:resolve-conflicts-with-agent',
  'palette:fix-ci-with-agent',
  'palette:hide-background-progress',
  'palette:show-background-progress',
  'palette:toggle-cheap-lfs-restore-progress',
]

const CommandPaletteUiKeys = [
  'commandPalette.title',
  'commandPalette.searchPlaceholder',
  'commandPalette.searchLabel',
  'commandPalette.commands',
  'commandPalette.noMatches',
  'commandPalette.searchTerms',
  'commandPalette.customizeAppearance',
  'commandPalette.appearanceDialog',
  'commandPalette.appearanceHeading',
  'commandPalette.rowDensity',
  'commandPalette.comfortable',
  'commandPalette.comfortableDescription',
  'commandPalette.compact',
  'commandPalette.compactDescription',
  'commandPalette.showInEachRow',
  'commandPalette.icons',
  'commandPalette.groupChips',
  'commandPalette.keywordLine',
  'commandPalette.resetDefaults',
  'commandPalette.groupApp',
  'commandPalette.groupBranch',
  'commandPalette.groupChanges',
  'commandPalette.groupEdit',
  'commandPalette.groupNavigate',
  'commandPalette.groupRepository',
] as const

describe('command palette catalog', () => {
  it('assigns every command a unique event and a titled group', () => {
    const events = CommandPaletteCatalog.map(command => command.event)
    assert.equal(new Set(events).size, events.length)
    for (const command of CommandPaletteCatalog) {
      assert.ok(command.title.length > 0, command.event)
      assert.ok(command.group.length > 0, command.event)
    }
  })

  it('covers the flagship app functions', () => {
    const events = new Set(CommandPaletteCatalog.map(c => c.event))
    for (const required of [
      'push',
      'pull',
      'fetch',
      'clone-repository',
      'create-branch',
      'create-worktree',
      'show-preferences',
      'show-repository-tools',
      'view-log-history',
      'palette:find-in-view',
    ]) {
      assert.ok(events.has(required), required)
    }
  })

  it('ranks title prefixes above substrings above keyword matches', () => {
    const matches = filterPaletteCommands(CommandPaletteCatalog, 'pu')
    assert.equal(matches[0]?.event, 'push')
    assert.equal(matches[1]?.event, 'pull')

    const worktree = filterPaletteCommands(CommandPaletteCatalog, 'worktree')
    assert.ok(worktree.length >= 2)
    assert.ok(
      worktree.findIndex(c => c.event === 'create-worktree') < worktree.length
    )

    const keyword = filterPaletteCommands(CommandPaletteCatalog, 'docker')
    assert.equal(keyword[0]?.event, 'build-and-run')
  })

  it('filters platform-restricted commands', () => {
    const win = filterPaletteCommands(
      CommandPaletteCatalog,
      'command line',
      'win32'
    )
    assert.ok(win.some(c => c.event === 'install-windows-cli'))
    assert.ok(!win.some(c => c.event === 'install-darwin-cli'))

    const mac = filterPaletteCommands(
      CommandPaletteCatalog,
      'command line',
      'darwin'
    )
    assert.ok(mac.some(c => c.event === 'install-darwin-cli'))
    assert.ok(!mac.some(c => c.event === 'install-windows-cli'))
  })

  it('returns the full platform-eligible catalog for an empty query', () => {
    const all = filterPaletteCommands(CommandPaletteCatalog, '', 'win32')
    assert.ok(all.length >= 55)
    assert.ok(!all.some(c => c.platform === 'darwin'))
  })

  it('registers every newly added command exactly once', () => {
    const events = CommandPaletteCatalog.map(c => c.event)
    const set = new Set(events)
    assert.equal(set.size, events.length)
    for (const event of NewCommandEvents) {
      assert.ok(set.has(event), event)
    }
  })

  it('localizes new command titles in all three language modes', () => {
    for (const command of CommandPaletteCatalog) {
      if (command.titleKey === undefined) {
        continue
      }
      for (const mode of languageModes) {
        const title = translate(command.titleKey, mode)
        assert.ok(
          title.trim().length > 0,
          `${command.event} has an empty ${mode} title`
        )
      }
      // The bilingual view must surface both languages, not one repeated.
      const english = translate(command.titleKey, 'english')
      const cantonese = translate(command.titleKey, 'cantonese')
      const bilingual = translate(command.titleKey, 'bilingual')
      assert.ok(bilingual.includes(english), command.event)
      assert.ok(bilingual.includes(cantonese), command.event)
    }
  })

  it('localizes the visible row and appearance controls in all modes', () => {
    for (const key of CommandPaletteUiKeys) {
      const english = translate(key, 'english', { terms: 'push clone' })
      const cantonese = translate(key, 'cantonese', { terms: 'push clone' })
      const bilingual = translate(key, 'bilingual', { terms: 'push clone' })
      assert.ok(english.trim().length > 0, `${key} has no English copy`)
      assert.ok(cantonese.trim().length > 0, `${key} has no Cantonese copy`)
      assert.ok(bilingual.includes(english), key)
      assert.ok(bilingual.includes(cantonese), key)
    }
  })

  it('gives every new command a non-empty group and keywords', () => {
    const byEvent = new Map(CommandPaletteCatalog.map(c => [c.event, c]))
    for (const event of NewCommandEvents) {
      const command = byEvent.get(event)
      assert.ok(command, event)
      assert.ok(command!.group.length > 0, event)
      assert.ok((command!.keywords ?? '').length > 0, event)
    }
  })

  it('hides repository/branch commands when nothing is selected', () => {
    const idle = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        emptyContext
      ).map(c => c.event)
    )
    for (const gated of [
      'palette:copy-repo-path',
      'palette:copy-branch-name',
      'palette:copy-commit-sha',
    ]) {
      assert.ok(!idle.has(gated), gated)
    }
    // Commands with no predicate remain available with nothing selected.
    assert.ok(idle.has('palette:toggle-theme'))
    assert.ok(idle.has('palette:preferences-appearance'))
  })

  it('offers build-and-run only when a repository is selected', () => {
    const buildAndRun = CommandPaletteCatalog.find(
      c => c.event === 'build-and-run'
    )
    assert.ok(buildAndRun, 'expected a build-and-run command')
    // It carries a localizable title so the palette row is translated.
    assert.equal(buildAndRun!.titleKey, 'palette.buildAndRun')

    const idle = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        emptyContext
      ).map(c => c.event)
    )
    assert.ok(!idle.has('build-and-run'), 'hidden with no repository')

    const withRepo = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        repositoryContext
      ).map(c => c.event)
    )
    assert.ok(withRepo.has('build-and-run'), 'shown once a repository exists')
  })

  it('reveals repository commands only once a repository is selected', () => {
    const repoOnly = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        repositoryContext
      ).map(c => c.event)
    )
    assert.ok(repoOnly.has('palette:copy-repo-path'))
    // Branch-scoped commands stay hidden without a valid branch.
    assert.ok(!repoOnly.has('palette:copy-branch-name'))
    assert.ok(!repoOnly.has('palette:copy-commit-sha'))

    const onBranch = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        branchContext
      ).map(c => c.event)
    )
    assert.ok(onBranch.has('palette:copy-branch-name'))
    assert.ok(onBranch.has('palette:copy-commit-sha'))
  })

  it('teleports each requested repair and progress feature from a palette result', () => {
    const withRepo = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        repositoryContext
      ).map(command => command.event)
    )
    for (const event of [
      'palette:resolve-conflicts-with-agent',
      'palette:fix-ci-with-agent',
      'palette:hide-background-progress',
      'palette:show-background-progress',
      'palette:toggle-cheap-lfs-restore-progress',
    ]) {
      assert.ok(withRepo.has(event), event)
    }
  })

  it('dispatches the exact event id for each match via a fake executor', () => {
    const executed: string[] = []
    const onExecute = (event: string) => executed.push(event)

    const matches = filterPaletteCommands(
      CommandPaletteCatalog,
      'preferences',
      'win32',
      branchContext
    )
    assert.ok(matches.length > 0)
    for (const command of matches) {
      onExecute(command.event)
    }

    assert.deepEqual(
      executed,
      matches.map(c => c.event)
    )
    assert.ok(executed.includes('palette:preferences-accounts'))
  })
})

describe('command palette rich controls and homes', () => {
  it('renders every control against a value shape it declares', () => {
    for (const command of CommandPaletteCatalog) {
      const control = command.control
      if (control === undefined) {
        continue
      }
      // A setting the palette can change must localize its own title so the
      // inline control is announced in every language mode.
      assert.ok(command.titleKey !== undefined, command.event)
      if (control.kind === 'number') {
        assert.ok(control.min < control.max, command.event)
      }
      if (control.kind === 'choice') {
        assert.ok(control.options.length >= 2, command.event)
        const values = control.options.map(o => o.value)
        assert.equal(new Set(values).size, values.length, command.event)
        for (const option of control.options) {
          for (const mode of languageModes) {
            assert.ok(
              translate(option.labelKey, mode).trim().length > 0,
              `${command.event} option ${option.value} has no ${mode} label`
            )
          }
        }
      }
    }
  })

  it('declares the expected control kinds for the flagship settings', () => {
    const byEvent = new Map(CommandPaletteCatalog.map(c => [c.event, c]))
    assert.equal(byEvent.get('palette:toggle-theme')?.control?.kind, 'toggle')
    assert.equal(
      byEvent.get('palette:set-language-mode')?.control?.kind,
      'choice'
    )
    assert.equal(
      byEvent.get('palette:set-funny-english')?.control?.kind,
      'number'
    )
    assert.equal(
      byEvent.get('palette:entry-commit-summary')?.control?.kind,
      'entry'
    )
    assert.equal(byEvent.get('palette:entry-clone-url')?.control?.kind, 'entry')
    assert.equal(
      byEvent.get('palette:set-notifications-enabled')?.control?.kind,
      'toggle'
    )
  })

  it('resolves a home for every command and a selector for every target', () => {
    for (const command of CommandPaletteCatalog) {
      const home = resolvePaletteHome(command)
      if (home.kind === 'surface') {
        for (const mode of languageModes) {
          assert.ok(
            translate(home.labelKey, mode).trim().length > 0,
            `${command.event} home has no ${mode} label`
          )
        }
      }
      if (home.targetId !== undefined) {
        const selector = teleportTargetSelector(home.targetId)
        assert.ok(selector.length > 0, command.event)
      }
    }
  })

  it('opens all signing rows on the real Repository Tools signing target', () => {
    const signingEvents = [
      'palette:set-signing-commits',
      'palette:set-signing-tags',
      'palette:signing-policy',
    ]

    for (const event of signingEvents) {
      const command = CommandPaletteCatalog.find(
        candidate => candidate.event === event
      )
      assert.ok(command, event)
      assert.equal(command.home?.kind, 'surface', event)
      if (command.home?.kind !== 'surface') {
        continue
      }
      assert.equal(
        command.home.labelKey,
        'commandPalette.homeRepositoryTools',
        event
      )
      assert.equal(command.home.openEvent, 'show-repository-tools', event)
      assert.equal(command.home.targetId, 'repositoryToolsSigning', event)
      assert.equal(command.isAvailable?.(emptyContext), false, event)
      assert.equal(command.isAvailable?.(repositoryContext), true, event)
    }

    assert.equal(
      teleportTargetSelector('repositoryToolsSigning'),
      '[data-teleport-target="repository-tools-signing"]'
    )
  })

  it('opens tag lifecycle through its own exact Repository Tools route', () => {
    const command = CommandPaletteCatalog.find(
      candidate => candidate.event === 'palette:tag-lifecycle'
    )
    assert.ok(command)
    assert.equal(command.home?.kind, 'surface')
    if (command.home?.kind !== 'surface') {
      return
    }
    assert.equal(command.home.labelKey, 'commandPalette.homeRepositoryTools')
    assert.equal(command.home.openEvent, 'self')
    assert.equal(command.home.targetId, undefined)
  })

  it('never dispatches a network or destructive command as its own opener', () => {
    for (const event of [
      'push',
      'force-push',
      'pull',
      'fetch',
      'stash-all-changes',
      'discard-all-changes',
      'permanently-discard-all-changes',
      'remove-repository',
    ]) {
      const command = CommandPaletteCatalog.find(c => c.event === event)
      assert.ok(command, event)
      const home = resolvePaletteHome(command!)
      assert.equal(home.kind, 'surface', event)
      if (home.kind === 'surface') {
        assert.notEqual(
          home.openEvent,
          'self',
          `${event} must not run itself when teleporting`
        )
      }
    }
  })

  it('maps every Preferences tab to a registered palette event', () => {
    const events = new Set(CommandPaletteCatalog.map(c => c.event))
    const tabs = Object.values(PreferencesTab).filter(
      (value): value is PreferencesTab => typeof value === 'number'
    )
    for (const tab of tabs) {
      const event = preferencesPaletteEvent(tab)
      assert.ok(events.has(event), `tab ${tab} resolves to unknown ${event}`)
    }
  })

  it('keeps every teleport selector syntactically valid and unique', () => {
    const selectors = Object.values(TeleportTargetSelectors)
    assert.equal(new Set(selectors).size, selectors.length)
    for (const selector of selectors) {
      assert.ok(/^[#.\[][-\w"=\[\]#.]+$/.test(selector), selector)
    }
  })

  it('localizes descriptions and home labels in all three modes', () => {
    for (const command of CommandPaletteCatalog) {
      if (command.descriptionKey === undefined) {
        continue
      }
      const english = translate(command.descriptionKey, 'english')
      const cantonese = translate(command.descriptionKey, 'cantonese')
      const bilingual = translate(command.descriptionKey, 'bilingual')
      assert.ok(english.trim().length > 0, command.event)
      assert.ok(cantonese.trim().length > 0, command.event)
      assert.ok(bilingual.includes(english), command.event)
      assert.ok(bilingual.includes(cantonese), command.event)
    }
  })
})
