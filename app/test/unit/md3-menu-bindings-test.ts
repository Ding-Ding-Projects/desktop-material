import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  Md3MenuCommandActions,
  Md3MenuCommandRoutes,
  Md3ShellOwnedCommands,
  isMd3ShellOwnedCommand,
  runMd3MenuCommand,
  type IMd3MenuCommandEnvironment,
} from '../../src/ui/md3/md3-menu-bindings'
import type { Md3MenuCommand } from '../../src/ui/md3/md3-menu-specs'
import {
  CommandPaletteCatalog,
  resolvePaletteHome,
} from '../../src/lib/command-palette-catalog'
import {
  teleportTargetSelector,
  type TeleportTargetId,
} from '../../src/lib/teleport-targets'
import {
  getMd3ViewPreferences,
  setMd3CommitSortOrder,
} from '../../src/lib/md3-view-preferences'
import { translate } from '../../src/lib/i18n'
import { languageModes } from '../../src/models/language-mode'

/**
 * Every command the MD3 menus can emit, written out by hand.
 *
 * A list derived from `Md3MenuCommandActions` would validate whichever
 * commands happened to be bound — it would never notice one that had gone
 * missing, because it only ever iterated what was there. Enumerating them
 * separately is what makes a dropped binding a failure rather than a smaller
 * green run.
 */
const EveryCommand: ReadonlyArray<Md3MenuCommand> = [
  'commitAndPushAllChanges',
  'fetchOrigin',
  'pullAllRepositories',
  'mergeAllBranches',
  'openAutomationSettings',
  'openCopilotPreferences',
  'openUndoHistoryManager',
  'openGitSettings',
  'openIntegrationSettings',
  'openNotificationSettings',
  'addGitHubAccount',
  'addGitLabSelfHostedAccount',
  'commitAndPushWithCopilotMessage',
  'pullOrigin',
  'forcePush',
  'buildAndRun',
  'sortCommitsNewestFirst',
  'sortCommitsOldestFirst',
  'groupCommitsByDay',
  'selectMultipleCommits',
  'showUnifiedDiff',
  'showSplitDiff',
  'hideWhitespaceChanges',
  'increaseDiffContextLines',
  'openFileInExternalEditor',
  'copyFilePath',
  'openFileHistory',
  'openBlame',
  'discardFileChanges',
  'ignoreFile',
  'ignoreFileType',
  'revealInFileManager',
  'revertCommit',
  'cherryPickCommit',
  'createTagAtCommit',
  'resetToCommit',
  'copyCommitSha',
  'viewCommitOnGitHub',
  'includeAllFiles',
  'excludeAllFiles',
  'stashAllChanges',
  'discardAllChanges',
  'groupChangesByFolder',
  'mergeBranchIntoCurrent',
  'rebaseBranchOntoCurrent',
  'openPullRequest',
  'renameBranch',
  'deleteBranch',
  'rerunAllJobs',
  'rerunFailedJobs',
  'cancelRun',
  'dispatchWorkflow',
  'viewRawLogs',
  'fetchRepository',
  'pullRepository',
  'changeRepositoryAlias',
  'moveRepositoryToGroup',
  'removeRepositoryFromList',
  'writeCommitMessageWithCopilot',
  'addCoAuthors',
  'commitAndPush',
  'configureAgentReadAccess',
  'configureAgentCommitAccess',
  'configureAgentPushAccess',
  'openAgentSessionLog',
  'markNotificationRead',
  'markNotificationUnread',
  'openNotificationInBrowser',
  'muteNotificationThread',
  'deleteNotification',
  'resumeAgentSession',
  'pauseAgentSession',
  'duplicateAgentSession',
  'deleteAgentSession',
  'copyTerminalSelection',
  'pasteIntoTerminal',
  'clearTerminalOutput',
  'splitShell',
  'openSystemTerminal',
  'newShellSession',
  'toggleSearchRegexMode',
  'clearSearchField',
  'showRegexGuideEntry',
]

/**
 * The commands whose whole effect is a persisted presentation preference.
 *
 * Hand-written rather than derived: a command that quietly stopped writing its
 * preference would drop off a derived list and take its own coverage with it.
 */
const PreferenceBackedCommands: ReadonlyArray<Md3MenuCommand> = [
  'sortCommitsNewestFirst',
  'sortCommitsOldestFirst',
  'groupCommitsByDay',
  'groupChangesByFolder',
  'increaseDiffContextLines',
]

/**
 * The commands whose whole effect leaves the application — a clipboard write
 * or a native file-manager window.
 *
 * `electron.clipboard.writeText` is a no-op stub in this suite and the native
 * shell is not present at all, so a call to either is genuinely unobservable
 * from here. Listing them by hand keeps that gap a decision rather than a
 * silently skipped command, and the assertion below still checks that each one
 * is routed and documented.
 */
const ExternalBackedCommands: ReadonlyArray<Md3MenuCommand> = [
  'copyFilePath',
  'copyCommitSha',
  'copyTerminalSelection',
  'revealInFileManager',
]

/** What a run of a command touched. */
interface ICallLog {
  readonly dispatcher: string[]
  readonly menuEvents: string[]
  readonly preferences: number[]
  readonly reveals: string[]
}

/**
 * An environment whose every member records that it was called.
 *
 * Nothing here is a spy on a real object: the point is to prove each binding
 * reaches *some* real route, and a recorded call is the only evidence a pure
 * test can have of that. `hasRepository: false` is the harder case — most
 * commands guard on a selection — so the suite runs both.
 */
function fakeEnvironment(hasRepository: boolean): {
  readonly env: IMd3MenuCommandEnvironment
  readonly log: ICallLog
} {
  const log: ICallLog = {
    dispatcher: [],
    menuEvents: [],
    preferences: [],
    reveals: [],
  }

  const dispatcher = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        return (...args: ReadonlyArray<unknown>) => {
          log.dispatcher.push(property)
          // `showPopup` is the one call whose argument carries the identity of
          // what was opened, so the popup type is recorded beside the call.
          const first = args[0]
          if (
            property === 'showPopup' &&
            typeof first === 'object' &&
            first !== null &&
            'type' in first
          ) {
            log.dispatcher.push(String((first as { type: unknown }).type))
          }
          return Promise.resolve()
        }
      },
    }
  ) as IMd3MenuCommandEnvironment['dispatcher']

  const repository = hasRepository
    ? ({
        path: '/tmp/repo',
        name: 'repo',
        gitHubRepository: { htmlURL: 'https://github.com/o/repo' },
      } as unknown as IMd3MenuCommandEnvironment['repository'])
    : null

  // A selection the row-scoped commands can actually act on: one changed file
  // and one commit. Without it a command that correctly does nothing when
  // nothing is selected would be indistinguishable from one that is not bound
  // at all, which is the exact confusion this suite exists to remove.
  const state = hasRepository
    ? ({
        changesState: {
          selection: {
            kind: 'WorkingDirectory',
            selectedFileIDs: ['file-1'],
          },
          workingDirectory: {
            files: [{ id: 'file-1', path: 'src/index.ts' }],
          },
        },
        commitSelection: { shas: ['0123456789abcdef'] },
        commitLookup: new Map([
          [
            '0123456789abcdef',
            { sha: '0123456789abcdef', summary: 'A commit' },
          ],
        ]),
        localTags: null,
      } as unknown as IMd3MenuCommandEnvironment['state'])
    : null

  const env: IMd3MenuCommandEnvironment = {
    dispatcher,
    repository,
    state,
    hideWhitespaceInChangesDiff: false,
    runMenuEvent: event => log.menuEvents.push(event),
    showPreferences: tab => log.preferences.push(tab),
    showRepositoryTool: tool => log.reveals.push(`tool:${tool}`),
    openNotificationCentre: () => log.reveals.push('notification-centre'),
    showAgentSessions: () => log.reveals.push('agent-sessions'),
    cherryPick: () => log.dispatcher.push('cherryPick'),
  }

  return { env, log }
}

function touched(log: ICallLog): number {
  return (
    log.dispatcher.length +
    log.menuEvents.length +
    log.preferences.length +
    log.reveals.length
  )
}

describe('MD3 menu bindings', () => {
  it('binds every command the contract can emit', () => {
    const missing = EveryCommand.filter(
      command => typeof Md3MenuCommandActions[command] !== 'function'
    )
    assert.deepEqual(
      missing,
      [],
      `commands with no binding: ${missing.join(', ')}`
    )
  })

  it('records a route for every command', () => {
    for (const command of EveryCommand) {
      const route = Md3MenuCommandRoutes[command]
      assert.ok(route !== undefined, `${command} has no recorded route`)
      assert.ok(
        ['menu', 'direct', 'reveal'].includes(route.kind),
        `${command} has an unknown route kind`
      )
      assert.ok(
        route.note.trim().length > 10,
        `${command} needs a real note, not "${route.note}"`
      )
    }
  })

  it('says why every revealing command cannot act on a row', () => {
    // A command that reveals a surface instead of acting is a deliberate
    // decision, and the reason is the whole of what makes it one. This is the
    // list a reviewer reads to find the rows still waiting on a destination.
    const reveals = EveryCommand.filter(
      command => Md3MenuCommandRoutes[command].kind === 'reveal'
    )
    assert.ok(reveals.length > 0, 'the revealing commands are recorded')
    for (const command of reveals) {
      assert.match(
        Md3MenuCommandRoutes[command].note,
        /reveal|Reveal|instructional|Instructional/,
        `${command} is routed 'reveal' but its note does not say what it reveals`
      )
    }
  })

  it('reaches a real route for every command with a repository selected', () => {
    // The three search commands are performed by the shell before the host
    // sees them, so the binding here is deliberately inert; the five below
    // write a persisted preference rather than calling the application, and
    // are proved by the test after this one. Every other command must touch
    // something.
    for (const command of EveryCommand) {
      if (
        isMd3ShellOwnedCommand(command) ||
        PreferenceBackedCommands.includes(command) ||
        ExternalBackedCommands.includes(command)
      ) {
        continue
      }
      const { env, log } = fakeEnvironment(true)
      runMd3MenuCommand(command, env)
      assert.ok(
        touched(log) > 0,
        `${command} ran without reaching any application route`
      )
    }
  })

  it('documents the commands whose effect leaves the application', () => {
    // These four cannot be observed from a node test, so what is checked is
    // that each is still a recorded, documented route rather than a command
    // that quietly became a no-op behind an unobservable call.
    for (const command of ExternalBackedCommands) {
      const route = Md3MenuCommandRoutes[command]
      assert.equal(route.kind, 'direct', command)
      assert.match(
        route.note,
        /clipboard|Reveals/,
        `${command} must say which external surface it reaches`
      )
    }
  })

  it('writes a persisted preference for every preference-backed command', () => {
    const { env } = fakeEnvironment(true)

    // Each assertion drives the preference to the opposite of what the command
    // will leave it at first, so a command that did nothing at all cannot pass
    // by happening to agree with the value already stored.
    setMd3CommitSortOrder('oldest')
    runMd3MenuCommand('sortCommitsNewestFirst', env)
    assert.equal(getMd3ViewPreferences().commitSortOrder, 'newest')

    runMd3MenuCommand('sortCommitsOldestFirst', env)
    assert.equal(getMd3ViewPreferences().commitSortOrder, 'oldest')

    const beforeGrouping = getMd3ViewPreferences().groupCommitsByDay
    runMd3MenuCommand('groupCommitsByDay', env)
    assert.equal(getMd3ViewPreferences().groupCommitsByDay, !beforeGrouping)

    const beforeFolders = getMd3ViewPreferences().groupChangesByFolder
    runMd3MenuCommand('groupChangesByFolder', env)
    assert.equal(getMd3ViewPreferences().groupChangesByFolder, !beforeFolders)

    const beforeContext = getMd3ViewPreferences().diffContextLines
    runMd3MenuCommand('increaseDiffContextLines', env)
    assert.notEqual(getMd3ViewPreferences().diffContextLines, beforeContext)
  })

  it('never throws when nothing is selected', () => {
    // A menu can be opened with no repository, and a command that assumed one
    // would take the whole renderer down rather than doing nothing.
    for (const command of EveryCommand) {
      const { env } = fakeEnvironment(false)
      assert.doesNotThrow(
        () => runMd3MenuCommand(command, env),
        `${command} threw with no repository selected`
      )
    }
  })

  it('opens the existing dialog rather than a second one', () => {
    // Every one of these already had a dialog before the MD3 shell existed.
    // Building a second is how two surfaces start disagreeing about what a
    // branch is called, so each must route through the app's own menu event.
    const throughMenuEvents: ReadonlyArray<[Md3MenuCommand, string]> = [
      ['renameBranch', 'rename-branch'],
      ['deleteBranch', 'delete-branch'],
      ['mergeBranchIntoCurrent', 'merge-branch'],
      ['rebaseBranchOntoCurrent', 'rebase-branch'],
      ['openPullRequest', 'open-pull-request'],
      ['removeRepositoryFromList', 'remove-repository'],
      ['discardAllChanges', 'discard-all-changes'],
      ['stashAllChanges', 'stash-all-changes'],
      ['forcePush', 'force-push'],
      ['buildAndRun', 'build-and-run'],
    ]

    for (const [command, event] of throughMenuEvents) {
      const { env, log } = fakeEnvironment(true)
      runMd3MenuCommand(command, env)
      assert.deepEqual(
        log.menuEvents,
        [event],
        `${command} must run the existing '${event}' command`
      )
    }
  })

  it('opens the recorded popup for each dialog-backed command', () => {
    const popups: ReadonlyArray<[Md3MenuCommand, string]> = [
      ['pullAllRepositories', 'PullAllRepositories'],
      ['mergeAllBranches', 'MergeAll'],
      ['openUndoHistoryManager', 'SettingsHistory'],
      ['changeRepositoryAlias', 'ChangeRepositoryAlias'],
      ['moveRepositoryToGroup', 'ChangeRepositoryGroupName'],
      ['muteNotificationThread', 'NotificationAutomations'],
      ['viewRawLogs', 'LogHistory'],
    ]

    for (const [command, popup] of popups) {
      const { env, log } = fakeEnvironment(true)
      runMd3MenuCommand(command, env)
      assert.ok(
        log.dispatcher.includes(popup),
        `${command} must open the existing ${popup} dialog, got ${log.dispatcher.join(
          ', '
        )}`
      )
    }
  })

  it('lists exactly the three commands the shell performs itself', () => {
    assert.deepEqual([...Md3ShellOwnedCommands].sort(), [
      'clearSearchField',
      'showRegexGuideEntry',
      'toggleSearchRegexMode',
    ])
  })
})

/** The MD3 surfaces the palette must be able to reach. */
const Md3PaletteEvents: ReadonlyArray<string> = [
  'palette:md3-changes',
  'palette:md3-history',
  'palette:md3-branches',
  'palette:md3-actions',
  'palette:md3-inbox',
  'palette:md3-terminal',
  'palette:md3-agents',
  'palette:md3-repositories',
  'palette:md3-focus-search',
  'palette:md3-search-regex',
  'palette:md3-search-builder',
  'palette:md3-search-menu',
  'palette:md3-regex-guide',
  'palette:md3-compose',
  'palette:md3-drawer',
  'palette:md3-drawer-menu',
  'palette:md3-repository-menu',
  'palette:md3-branch-menu',
  'palette:md3-pane-menu',
  'palette:md3-commit-sort',
  'palette:md3-group-commits-by-day',
  'palette:md3-commit-graph',
  'palette:md3-wrap-long-lines',
  'palette:md3-diff-context-lines',
  'palette:md3-group-changes-by-folder',
]

/** Every destination and the drawer tab its palette row must land on. */
const DestinationTargets: ReadonlyArray<[string, TeleportTargetId]> = [
  ['palette:md3-changes', 'md3DestinationChanges'],
  ['palette:md3-history', 'md3DestinationHistory'],
  ['palette:md3-branches', 'md3DestinationBranches'],
  ['palette:md3-actions', 'md3DestinationActions'],
  ['palette:md3-inbox', 'md3DestinationInbox'],
  ['palette:md3-terminal', 'md3DestinationTerminal'],
  ['palette:md3-agents', 'md3DestinationAgents'],
  ['palette:md3-repositories', 'md3DestinationRepositories'],
]

describe('MD3 surfaces in the command palette', () => {
  it('registers every MD3 surface exactly once', () => {
    const events = CommandPaletteCatalog.map(command => command.event)
    const set = new Set(events)
    assert.equal(set.size, events.length, 'duplicate palette events')
    for (const event of Md3PaletteEvents) {
      assert.ok(set.has(event), `${event} is not in the palette`)
    }
  })

  it('teleports each destination to its own drawer tab', () => {
    // Landing on the drawer and leaving the reader to find the row is the
    // "general page" outcome the teleport exists to avoid, so each row names
    // its own destination's tab and no two share one.
    const seen = new Set<string>()
    for (const [event, targetId] of DestinationTargets) {
      const command = CommandPaletteCatalog.find(
        candidate => candidate.event === event
      )
      assert.ok(command, event)
      const home = resolvePaletteHome(command)
      assert.equal(home.kind, 'surface', event)
      if (home.kind !== 'surface') {
        continue
      }
      assert.equal(home.openEvent, 'self', `${event} must switch the pane`)
      assert.equal(home.targetId, targetId, event)
      assert.ok(!seen.has(targetId), `${targetId} is claimed twice`)
      seen.add(targetId)
      assert.match(teleportTargetSelector(targetId), /^\[data-destination-id=/)
    }
  })

  it('gives every MD3 row a home, a group and search terms', () => {
    for (const event of Md3PaletteEvents) {
      const command = CommandPaletteCatalog.find(
        candidate => candidate.event === event
      )
      assert.ok(command, event)
      assert.ok(command.home !== undefined, `${event} has no home`)
      assert.ok(command.group.length > 0, `${event} has no group`)
      assert.ok((command.keywords ?? '').length > 0, `${event} has no keywords`)
      const home = resolvePaletteHome(command)
      if (home.targetId !== undefined) {
        assert.ok(teleportTargetSelector(home.targetId).length > 0, event)
      }
    }
  })

  it('localizes every MD3 row in all three language modes', () => {
    for (const event of Md3PaletteEvents) {
      const command = CommandPaletteCatalog.find(
        candidate => candidate.event === event
      )
      assert.ok(command, event)
      assert.ok(command.titleKey !== undefined, `${event} has no title key`)
      if (command.titleKey === undefined) {
        continue
      }
      for (const mode of languageModes) {
        assert.ok(
          translate(command.titleKey, mode).trim().length > 0,
          `${event} has an empty ${mode} title`
        )
      }
      const english = translate(command.titleKey, 'english')
      const cantonese = translate(command.titleKey, 'cantonese')
      const bilingual = translate(command.titleKey, 'bilingual')
      assert.ok(bilingual.includes(english), event)
      assert.ok(bilingual.includes(cantonese), event)
    }
  })

  it('renders a live control for every value the shell owns', () => {
    // A row that merely takes you to a value the palette could have shown is a
    // round trip the interface did not have to make.
    const controls: ReadonlyArray<[string, string]> = [
      ['palette:md3-search-regex', 'toggle'],
      ['palette:md3-drawer', 'toggle'],
      ['palette:md3-commit-sort', 'choice'],
      ['palette:md3-group-commits-by-day', 'toggle'],
      ['palette:md3-commit-graph', 'toggle'],
      ['palette:md3-wrap-long-lines', 'toggle'],
      ['palette:md3-diff-context-lines', 'number'],
      ['palette:md3-group-changes-by-folder', 'toggle'],
    ]

    for (const [event, kind] of controls) {
      const command = CommandPaletteCatalog.find(
        candidate => candidate.event === event
      )
      assert.ok(command, event)
      assert.equal(command.control?.kind, kind, event)
    }
  })
})
