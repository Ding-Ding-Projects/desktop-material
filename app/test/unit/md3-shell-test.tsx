import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { englishTranslations } from '../../src/lib/i18n-resources'
import {
  ShowClassicToolbarKey,
  getShowClassicToolbar,
  setShowClassicToolbar,
} from '../../src/lib/classic-toolbar'
import { DefaultAppIdentityCustomization } from '../../src/models/app-identity'
import { emptyRepositoryBulkSelection } from '../../src/ui/repositories-list/repository-bulk-selection'
import {
  IMd3ShellState,
  IMd3ShellViews,
  Md3DestinationIds,
  Md3SearchFieldKeys,
  Md3Shell,
  Md3ShellAction,
  Md3ShellHeadingId,
  Md3ShellPaneId,
  createMd3ShellState,
  md3DestinationAnnouncement,
  md3NoViews,
  md3PaneDestination,
  md3SearchBinding,
  md3SearchFieldLabel,
  md3ShellReducer,
} from '../../src/ui/md3/md3-shell'
import { Md3DestinationId } from '../../src/ui/md3/md3-navigation-drawer'
import {
  IMd3MenuHandlers,
  defaultMd3MenuContext,
} from '../../src/ui/md3/md3-menu-specs'
import { md3Toasts } from '../../src/ui/md3/md3-toast'
import {
  md3HistoryCommitFixtures,
  md3HistoryDiffFixtures,
  md3HistoryFileFixtures,
} from '../../src/ui/md3/md3-history-view-fixtures'
import {
  md3ChangesFixture,
  md3DiffFixture,
} from '../../src/ui/md3/md3-changes-view-fixtures'
import { md3BranchFixtures } from '../../src/ui/md3/md3-branches-view-fixtures'
import {
  md3ActionsAttemptFixture,
  md3ActionsFilterOptionFixtures,
  md3ActionsFilterValueFixtures,
  md3ActionsJobFixtures,
  md3ActionsLogFixture,
  md3ActionsPaginationFixture,
  md3ActionsRunFixtures,
} from '../../src/ui/md3/md3-actions-view-fixtures'
import { md3InboxFixtureNotifications } from '../../src/ui/md3/md3-inbox-fixtures'
import { md3TerminalSampleSessions } from '../../src/ui/md3/md3-terminal-view-fixtures'
import {
  md3AgentsFixtureConversation,
  md3AgentsFixtureSessions,
} from '../../src/ui/md3/md3-agents-view-fixtures'
import { md3RepositoryFixtureRows } from '../../src/ui/md3/md3-repositories-view-fixtures'
import { fireEvent, render, screen, waitFor } from '../helpers/ui/render'

/**
 * The MD3 shell, rendered.
 *
 * The shell is the one component that owns state nothing else can reach —
 * which destination is showing, whether the drawer is expanded, the eleven
 * independent search fields, which overlay is up — so almost everything here
 * is a behaviour no screenshot reveals: an accessible name that survives a
 * collapse, a regex pattern landing in the field that asked for it and in no
 * other, a compose dialog refusing an empty summary *and saying so*.
 *
 * Where the shell talks to something real it is exercised for real: the toast
 * store is the process-wide `md3Toasts` every module calls `notify()` through,
 * and the classic-toolbar preference is the real `localStorage`-backed setting
 * rather than a boolean invented by the test.
 */

const noop = () => undefined

// jsdom implements no layout, so it ships no `scrollIntoView`; the menu overlay
// and the virtualized lists call it on real browsers. The gap is the
// environment's, not the components'.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no layout in jsdom, so there is nothing to scroll */
  }
}

// ---------------------------------------------------------------------------
// The eight destination views, with real props
// ---------------------------------------------------------------------------

/**
 * The root class each destination view paints.
 *
 * Written out by hand rather than derived: a routing test that asked the view
 * itself what it renders would agree with whatever it found, including nothing.
 */
const ViewRootSelectors: Readonly<Record<Md3DestinationId, string>> = {
  changes: '.md3-changes-view',
  history: '.md3-history',
  branches: '.md3-branches',
  actions: '.md3-actions-view',
  inbox: '.md3-inbox',
  terminal: '.md3-terminal',
  agents: '.md3-agents',
  repositories: '.md3-repositories-view',
}

function searchProps() {
  return {
    value: '',
    regexEnabled: false,
    onChange: noop,
    onClear: noop,
    onToggleRegex: noop,
    onOpenBuilder: noop,
  }
}

function diffProps() {
  return {
    filePath: 'app/src/ui/md3/md3-shell.tsx',
    wrapLines: false,
    onToggleWrap: noop,
    onOpenDiffOptions: noop,
    onOpenFileMenu: noop,
    searchValue: '',
    searchRegexEnabled: false,
    onSearchChange: noop,
    onSearchClear: noop,
    onToggleSearchRegex: noop,
    onOpenSearchBuilder: noop,
    lines: md3DiffFixture,
  }
}

/**
 * Every destination wired to its real view.
 *
 * @param overrides Merged over the built props, so one test can replace a
 *                  single view's handlers without restating the other seven.
 */
function buildViews(overrides: Partial<IMd3ShellViews> = {}): IMd3ShellViews {
  const views: IMd3ShellViews = {
    changes: {
      files: md3ChangesFixture,
      totalFileCount: md3ChangesFixture.length,
      includedFileCount: md3ChangesFixture.length,
      selectedPaths: [md3ChangesFixture[0].path],
      onSelectionChanged: noop,
      onIncludeChanged: noop,
      onIncludeAllChanged: noop,
      onOpenRowMenu: noop,
      onFileContextMenu: noop,
      onOpenChangesMenu: noop,
      searchValue: '',
      searchRegexEnabled: false,
      onSearchChange: noop,
      onSearchClear: noop,
      onToggleSearchRegex: noop,
      onOpenSearchBuilder: noop,
      authorInitials: 'AL',
      authorName: 'Alice Lindqvist',
      commitSummary: '',
      commitDescription: '',
      onCommitSummaryChanged: noop,
      onCommitDescriptionChanged: noop,
      branchName: 'development',
      onCommit: noop,
      onCommitAndPush: noop,
      onOpenComposer: noop,
      onDraftWithCopilot: noop,
      onAddCoAuthors: noop,
      diff: diffProps(),
      onIncludeHunk: noop,
    },
    history: {
      commits: md3HistoryCommitFixtures,
      selectedShas: [md3HistoryCommitFixtures[0].sha],
      onSelectionChanged: noop,
      filterText: '',
      filterRegexEnabled: false,
      onFilterTextChanged: noop,
      onFilterRegexToggled: noop,
      onOpenFilterRegexBuilder: noop,
      activeFilters: [],
      onFiltersChanged: noop,
      showCommitGraph: true,
      onShowCommitGraphChanged: noop,
      showAbsoluteDates: false,
      onShowAbsoluteDatesChanged: noop,
      diff: {
        ...diffProps(),
        lines: md3HistoryDiffFixtures,
        fileTabs: md3HistoryFileFixtures,
        activeFileTabPath: md3HistoryFileFixtures[0].path,
        onSelectFileTab: noop,
      },
      detailsOpen: false,
      onDetailsOpenChanged: noop,
      onOpenListMenu: noop,
      onOpenRowMenu: noop,
      onOpenFileMenu: noop,
      onTogglePin: noop,
      onCopySha: noop,
      onViewOnGitHub: noop,
      onRevertCommit: noop,
    },
    branches: {
      branches: md3BranchFixtures,
      filterText: '',
      onFilterTextChanged: noop,
      regexEnabled: false,
      onToggleRegex: noop,
      onOpenRegexBuilder: noop,
      activeChips: [],
      onToggleChip: noop,
      onResetFilters: noop,
      selectedBranchName: md3BranchFixtures[0].name,
      onSelectBranch: noop,
      onCheckoutBranch: noop,
      onNewBranch: noop,
      onMergeAll: noop,
      currentBranchName: 'development',
      onOpenRowMenu: noop,
    },
    actions: {
      runSearch: searchProps(),
      activeChips: [],
      onToggleChip: noop,
      thisBranchAvailable: true,
      canDispatch: true,
      onDispatchWorkflow: noop,
      filtersOpen: false,
      onToggleFilters: noop,
      filterValues: md3ActionsFilterValueFixtures,
      filterOptions: md3ActionsFilterOptionFixtures,
      onFilterChange: noop,
      onResetFilters: noop,
      selectionMode: false,
      onToggleSelectionMode: noop,
      selectedRunIds: new Set<string>(),
      onToggleRunSelection: noop,
      onToggleAllVisibleRuns: noop,
      onClearRunSelection: noop,
      onBulkRerun: noop,
      onBulkCancel: noop,
      bulkBusy: false,
      runs: md3ActionsRunFixtures,
      selectedRunId: md3ActionsRunFixtures[0].id,
      onSelectRun: noop,
      onRerunRun: noop,
      onOpenRunMenu: noop,
      pagination: md3ActionsPaginationFixture,
      onLoadMoreRuns: noop,
      onLoadAllRuns: noop,
      selectedRun: md3ActionsRunFixtures[0],
      onRerunSelectedRun: noop,
      onRerunFailedJobs: noop,
      onOpenPaneMenu: noop,
      onCancelSelectedRun: noop,
      attempts: md3ActionsAttemptFixture,
      onSelectAttempt: noop,
      jobs: md3ActionsJobFixtures,
      selectedStepId: null,
      onSelectStep: noop,
      jobsLoading: false,
      jobsLoadingMore: false,
      jobsError: null,
      jobsHasMore: false,
      jobsTruncated: false,
      onLoadMoreJobs: noop,
      onReloadJobs: noop,
      onRerunJob: noop,
      logSearch: searchProps(),
      logText: md3ActionsLogFixture,
      logLoading: false,
      logError: null,
      onRetryLog: noop,
    },
    inbox: {
      notifications: md3InboxFixtureNotifications,
      onOpen: noop,
      onSetRead: noop,
      onDelete: noop,
      onMarkAllRead: noop,
    },
    terminal: {
      sessions: md3TerminalSampleSessions,
      activeSessionId: md3TerminalSampleSessions[0].id,
      search: searchProps(),
      input: '',
      onInputChange: noop,
      onRunCommand: noop,
      onSelectSession: noop,
      onCreateSession: noop,
      onContextMenu: noop,
    },
    agents: {
      sessions: md3AgentsFixtureSessions,
      selectedSessionId: md3AgentsFixtureSessions[0].id,
      conversation: md3AgentsFixtureConversation,
      agentReadAccess: 'on',
      agentCommitAccess: 'ask',
      agentPushAccess: 'off',
      onSelectSession: noop,
      onNewSession: noop,
      onPauseSession: noop,
      onResumeSession: noop,
      onSendInstruction: noop,
      onOpenSessionLog: noop,
      onDuplicateSession: noop,
      onDeleteSession: noop,
      onConfigureAgentAccess: noop,
    },
    repositories: {
      repositories: md3RepositoryFixtureRows,
      searchValue: '',
      regexEnabled: false,
      activeChips: [],
      selectedRepositoryId: md3RepositoryFixtureRows[0].id,
      selection: emptyRepositoryBulkSelection,
      groupNames: [],
      run: null,
      notice: null,
      removalCandidates: null,
      onSearchChange: noop,
      onClearSearch: noop,
      onToggleRegex: noop,
      onOpenRegexBuilder: noop,
      onToggleChip: noop,
      onResetFilters: noop,
      onClone: noop,
      onAddLocal: noop,
      onPullAll: noop,
      onSelectRepository: noop,
      onOpenRepository: noop,
      onOpenRowMenu: noop,
      onSelectionChanged: noop,
      onBulkOperation: noop,
      onCancelRun: noop,
      onDismissRun: noop,
      onConfirmRemoval: noop,
      onCancelRemoval: noop,
    },
  }

  return { ...views, ...overrides }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface IHarnessProps {
  readonly initialState?: Partial<IMd3ShellState>

  readonly navigation?: 'drawer' | 'rail'

  readonly accountSwitcherAnchor?: 'header' | 'rail' | null

  readonly onOpenAccountSwitcher?: (anchor: 'header' | 'rail') => void

  readonly headerAccountButtonRef?: React.Ref<HTMLButtonElement>

  readonly railAccountButtonRef?: React.Ref<HTMLButtonElement>

  /** Receives every state the shell moves to, newest last. */
  readonly onState?: (state: IMd3ShellState, action: Md3ShellAction) => void

  /**
   * Built from the live shell state, so a test can wire a view's own search
   * field to one of the eleven and watch which slot it writes into.
   */
  readonly views?: (
    state: IMd3ShellState,
    dispatch: (action: Md3ShellAction) => void
  ) => IMd3ShellViews

  readonly menuHandlers?: Partial<IMd3MenuHandlers>

  readonly repositoryTabStrip?: React.ReactNode
  readonly showRepositoryTabStrip?: boolean
  readonly classicToolbar?: React.ReactNode
  readonly showClassicToolbar?: boolean

  readonly onCommit?: () => void
  readonly onCommitAndPush?: () => void
  readonly destinationCounts?: Partial<Record<Md3DestinationId, string>>
}

/**
 * The shell driven as a real host drives it: the host owns the state, feeds it
 * back in, and builds the views' search wiring from the same eleven fields.
 */
function Harness(props: IHarnessProps) {
  const [state, setState] = React.useState<IMd3ShellState>(() =>
    createMd3ShellState(props.initialState)
  )
  const [summary, setSummary] = React.useState('')
  const [description, setDescription] = React.useState('')

  // Deliberately not memoized: this reads `props.onState` on every render, so
  // a test that swaps the observer mid-run is heard rather than silently
  // reporting into the closure it was mounted with.
  const onStateChange = (next: IMd3ShellState, action: Md3ShellAction) => {
    setState(next)
    props.onState?.(next, action)
  }

  const dispatch = (action: Md3ShellAction) =>
    onStateChange(md3ShellReducer(state, action), action)

  const menuHandlers: IMd3MenuHandlers = {
    onCommand: noop,
    onNavigate: noop,
    onToggle: noop,
    onSwitchRepository: noop,
    onSwitchBranch: noop,
    onSwitchAccount: noop,
    onOpenMenu: noop,
    onOpenRegexBuilder: noop,
    ...props.menuHandlers,
  }

  return (
    <Md3Shell
      state={state}
      onStateChange={onStateChange}
      navigation={props.navigation}
      appIdentity={DefaultAppIdentityCustomization}
      accountInitials="AL"
      accountName="Alice Lindqvist"
      unreadCount={3}
      onCommitAndPush={noop}
      onOpenPalette={noop}
      onOpenNotifications={noop}
      onToggleTheme={noop}
      onOpenSettings={noop}
      onOpenAccountSwitcher={
        props.onOpenAccountSwitcher ?? (() => undefined)
      }
      accountSwitcherAnchor={props.accountSwitcherAnchor}
      headerAccountButtonRef={props.headerAccountButtonRef}
      railAccountButtonRef={props.railAccountButtonRef}
      repositoryName="desktop-material"
      branchName="development"
      pushState="ahead"
      aheadCount={3}
      onFetch={noop}
      onPush={noop}
      destinationCounts={props.destinationCounts}
      menuContext={defaultMd3MenuContext}
      menuHandlers={menuHandlers}
      compose={{
        summary,
        description,
        includedFileCount: 4,
        totalFileCount: 6,
        addedLineCount: 218,
        deletedLineCount: 96,
        branchName: 'development',
        onSummaryChanged: setSummary,
        onDescriptionChanged: setDescription,
        onCommit: props.onCommit ?? noop,
        onCommitAndPush: props.onCommitAndPush ?? noop,
        onDraftWithCopilot: noop,
        onAddCoAuthors: noop,
      }}
      views={props.views?.(state, dispatch) ?? md3NoViews}
      renderLegacyDestination={destination => (
        <div data-legacy-destination={destination}>
          legacy surface for {destination}
        </div>
      )}
      repositoryTabStrip={props.repositoryTabStrip}
      showRepositoryTabStrip={props.showRepositoryTabStrip}
      classicToolbar={props.classicToolbar}
      showClassicToolbar={props.showClassicToolbar}
    />
  )
}

function destinationTab(id: Md3DestinationId): HTMLElement {
  return screen.getByRole('tab', {
    name: englishTranslations[`md3.drawer.destination.${id}`],
  })
}

/**
 * The accessible name of a control, computed the two ways that actually apply
 * here: an explicit `aria-label`, or the text of descendants that are not
 * hidden from assistive technology.
 */
function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label')
  if (label !== null) {
    return label.trim()
  }

  const clone = element.cloneNode(true) as HTMLElement
  for (const hidden of Array.from(
    clone.querySelectorAll('[aria-hidden="true"]')
  )) {
    hidden.remove()
  }
  return (clone.textContent ?? '').trim()
}

afterEach(() => {
  md3Toasts.clear()
  localStorage.removeItem(ShowClassicToolbarKey)
})

// ---------------------------------------------------------------------------
// Destination routing
// ---------------------------------------------------------------------------

describe('md3 shell — destination routing', () => {
  it('knows all eight destinations, and says so by count', () => {
    assert.equal(Md3DestinationIds.length, 8)
    assert.deepStrictEqual(
      Object.keys(ViewRootSelectors).sort(),
      [...Md3DestinationIds].sort()
    )
  })

  for (const destination of Md3DestinationIds) {
    it(`renders the ${destination} view and only that view`, () => {
      const { container } = render(
        <Harness initialState={{ destination }} views={() => buildViews()} />
      )

      assert.ok(
        container.querySelector(ViewRootSelectors[destination]) !== null,
        `the ${destination} destination must render its own view`
      )

      for (const other of Md3DestinationIds) {
        if (other === destination) {
          continue
        }
        assert.equal(
          container.querySelector(ViewRootSelectors[other]),
          null,
          `${destination} must not also render the ${other} view`
        )
      }
    })
  }

  it('switches destination when a drawer tab is activated', () => {
    const { container } = render(<Harness views={() => buildViews()} />)

    // The contract opens on History.
    assert.ok(container.querySelector(ViewRootSelectors.history) !== null)

    fireEvent.click(destinationTab('branches'))
    assert.ok(container.querySelector(ViewRootSelectors.branches) !== null)
    assert.equal(container.querySelector(ViewRootSelectors.history), null)

    fireEvent.click(destinationTab('terminal'))
    assert.ok(container.querySelector(ViewRootSelectors.terminal) !== null)
    assert.equal(container.querySelector(ViewRootSelectors.branches), null)
  })

  it('falls back to the legacy surface for a destination with no MD3 view', () => {
    const { container } = render(
      <Harness initialState={{ destination: 'actions' }} />
    )

    const legacy = container.querySelector('[data-legacy-destination]')
    assert.ok(legacy !== null)
    assert.equal(
      (legacy as HTMLElement).dataset.legacyDestination,
      'actions',
      'the fallback must be told which destination it is standing in for'
    )
    assert.equal(container.querySelector(ViewRootSelectors.actions), null)
  })

  it('names the pane after the destination, in the pane header shape', () => {
    render(<Harness initialState={{ destination: 'inbox' }} />)
    assert.equal(md3PaneDestination('inbox'), 'Inbox')

    const heading = document.getElementById(Md3ShellHeadingId)
    assert.ok(heading !== null)
    assert.equal(
      (heading as HTMLElement).textContent,
      englishTranslations['md3.drawer.destination.inbox']
    )
  })

  it('moves focus to the pane heading after a destination change, but not on first paint', () => {
    render(<Harness />)
    const heading = document.getElementById(Md3ShellHeadingId)
    assert.notEqual(
      document.activeElement,
      heading,
      'the first paint is not a destination change; stealing focus there ' +
        'would take it from whatever the app focused on startup'
    )

    fireEvent.click(destinationTab('agents'))
    assert.equal(document.activeElement, heading)
  })

  it('announces the destination politely, naming it in every funny band', () => {
    render(<Harness initialState={{ destination: 'terminal' }} />)

    const label = englishTranslations['md3.drawer.destination.terminal']
    const announcement = md3DestinationAnnouncement(label)
    assert.ok(
      announcement.includes(label),
      'the funny level styles the framing; which surface you landed on is a ' +
        'fact and must survive every band'
    )

    const status = screen
      .getAllByRole('status')
      .find(node => node.textContent === announcement)
    assert.ok(status !== undefined, 'the shell must announce the destination')

    // Polite, not assertive: this is the result of something the user just
    // did, so it must not interrupt whatever is already being read out.
    assert.equal((status as HTMLElement).getAttribute('role'), 'status')
  })

  it('closes an open overlay when the destination changes', () => {
    const states: Array<IMd3ShellState> = []
    render(<Harness onState={state => states.push(state)} />)

    fireEvent.contextMenu(
      screen.getByRole('navigation', {
        name: englishTranslations['md3.drawer.label'],
      })
    )
    assert.equal(states.at(-1)?.overlay?.kind, 'menu')

    fireEvent.click(destinationTab('changes'))
    assert.equal(
      states.at(-1)?.overlay,
      null,
      'a menu built for the pane that was showing must not survive onto a ' +
        'different pane'
    )
  })
})

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

describe('md3 shell — navigation drawer', () => {
  const menuButtonName = englishTranslations['md3.appHeader.menu']

  it('expands and collapses from the header control', () => {
    const { container } = render(<Harness />)
    const drawer = container.querySelector('.md3-navigation-drawer')
    assert.ok(drawer !== null)
    assert.equal(
      (drawer as HTMLElement).classList.contains(
        'md3-navigation-drawer--collapsed'
      ),
      false
    )

    const toggle = screen.getByRole('button', { name: menuButtonName })
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')

    fireEvent.click(toggle)
    assert.equal(
      (drawer as HTMLElement).classList.contains(
        'md3-navigation-drawer--collapsed'
      ),
      true
    )
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')

    fireEvent.click(toggle)
    assert.equal(
      (drawer as HTMLElement).classList.contains(
        'md3-navigation-drawer--collapsed'
      ),
      false
    )
  })

  it('keeps every collapsed row named — the failure no screenshot reveals', () => {
    const { container } = render(
      <Harness initialState={{ drawerExpanded: false }} />
    )

    // The name has to be an EXPLICIT `aria-label`, not the visible label's
    // text. Collapsing hides that text with a stylesheet, and jsdom applies no
    // stylesheet — so a computed-name check here would keep passing on a
    // drawer that becomes eight unnamed buttons the moment it narrows, which
    // is precisely the defect this test exists for.
    for (const id of Md3DestinationIds) {
      const label = englishTranslations[`md3.drawer.destination.${id}`]
      const tab = screen.getByRole('tab', { name: label })
      assert.equal(
        tab.getAttribute('aria-label'),
        label,
        `${id} carries no name a collapse cannot hide`
      )
    }

    const compose = container.querySelector('.md3-navigation-drawer__compose')
    assert.ok(compose !== null)
    assert.equal(
      (compose as Element).getAttribute('aria-label'),
      englishTranslations['md3.drawer.commit']
    )

    const repository = container.querySelector(
      '.md3-navigation-drawer__repository'
    )
    assert.ok(repository !== null)
    assert.equal(
      (repository as Element).getAttribute('aria-label'),
      englishTranslations['md3.drawer.repository'].replace(
        '{name}',
        'desktop-material'
      )
    )
  })

  it('marks the showing destination selected and current', () => {
    render(<Harness initialState={{ destination: 'branches' }} />)

    const active = destinationTab('branches')
    assert.equal(active.getAttribute('aria-selected'), 'true')
    assert.equal(active.getAttribute('aria-current'), 'page')
    assert.equal(active.getAttribute('aria-controls'), Md3ShellPaneId)

    const inactive = destinationTab('history')
    assert.equal(inactive.getAttribute('aria-selected'), 'false')
    assert.equal(inactive.getAttribute('aria-current'), null)
  })

  it('takes one tab stop and moves between destinations with the arrow keys', () => {
    render(<Harness initialState={{ destination: 'history' }} />)

    const tabs = screen.getAllByRole('tab')
    assert.equal(tabs.length, 8)
    assert.equal(
      tabs.filter(tab => tab.getAttribute('tabindex') === '0').length,
      1,
      'a tab list is one tab stop, not eight'
    )
    assert.equal(destinationTab('history').getAttribute('tabindex'), '0')

    const history = destinationTab('history')
    history.focus()
    fireEvent.keyDown(history, { key: 'ArrowDown' })
    assert.equal(document.activeElement, destinationTab('branches'))

    fireEvent.keyDown(destinationTab('branches'), { key: 'ArrowUp' })
    assert.equal(document.activeElement, destinationTab('history'))

    fireEvent.keyDown(destinationTab('history'), { key: 'End' })
    assert.equal(document.activeElement, destinationTab('repositories'))

    fireEvent.keyDown(destinationTab('repositories'), { key: 'Home' })
    assert.equal(document.activeElement, destinationTab('changes'))
  })

  it('folds a badge into the destination name rather than leaving it unspoken', () => {
    render(<Harness destinationCounts={{ changes: '12' }} />)

    const expected = englishTranslations['md3.drawer.destinationWithCount']
      .replace('{label}', englishTranslations['md3.drawer.destination.changes'])
      .replace('{count}', '12')
    assert.ok(
      screen.getByRole('tab', { name: expected }) instanceof HTMLElement
    )
  })
})

// ---------------------------------------------------------------------------
// The eleven search fields
// ---------------------------------------------------------------------------

describe('md3 shell — the eleven search fields', () => {
  it('carries exactly the eleven the contract names', () => {
    assert.equal(Md3SearchFieldKeys.length, 11)
    assert.deepStrictEqual(
      [...Md3SearchFieldKeys],
      [
        'global',
        'history',
        'changes',
        'branches',
        'actions',
        'logs',
        'inbox',
        'terminal',
        'agents',
        'repositories',
        'diffSearch',
      ]
    )
  })

  it('gives every field its own localized builder target name', () => {
    const names = Md3SearchFieldKeys.map(md3SearchFieldLabel)
    for (const name of names) {
      assert.ok(name.trim().length > 0)
    }
    assert.equal(
      new Set(names).size,
      names.length,
      'two fields sharing a builder title are two builders nobody can tell ' +
        'apart by ear'
    )
  })

  for (const field of Md3SearchFieldKeys) {
    it(`types, clears and toggles ${field} without touching the other ten`, () => {
      const others = Md3SearchFieldKeys.filter(key => key !== field)
      let state = createMd3ShellState()

      state = md3ShellReducer(state, {
        type: 'set-search',
        field,
        value: 'tonal',
      })
      assert.equal(state.search[field].value, 'tonal')
      for (const other of others) {
        assert.equal(state.search[other].value, '', `${other} was rewritten`)
      }

      state = md3ShellReducer(state, { type: 'toggle-search-regex', field })
      assert.equal(state.search[field].regexEnabled, true)
      for (const other of others) {
        assert.equal(
          state.search[other].regexEnabled,
          false,
          `${other}'s regex mode was flipped by ${field}`
        )
      }

      state = md3ShellReducer(state, { type: 'toggle-search-regex', field })
      assert.equal(state.search[field].regexEnabled, false)

      state = md3ShellReducer(state, { type: 'clear-search', field })
      assert.equal(state.search[field].value, '')
      assert.equal(
        state.search[field].regexEnabled,
        false,
        'clearing a query must not silently change the mode it is read in'
      )
    })

    it(`applies a built pattern to ${field} alone, and turns ${field}'s regex mode on`, () => {
      const others = Md3SearchFieldKeys.filter(key => key !== field)
      let state = createMd3ShellState()

      state = md3ShellReducer(state, {
        type: 'set-search',
        field,
        value: 'feat',
      })
      state = md3ShellReducer(state, {
        type: 'open-builder',
        target: { kind: 'search', field },
      })
      assert.deepStrictEqual(state.overlay, {
        kind: 'builder',
        target: { kind: 'search', field },
        pattern: 'feat',
      })

      state = md3ShellReducer(state, {
        type: 'apply-builder',
        pattern: '^feat\\(.+\\)',
      })

      assert.equal(state.search[field].value, '^feat\\(.+\\)')
      assert.equal(
        state.search[field].regexEnabled,
        true,
        'writing a pattern into a field still reading plain text would search ' +
          'for the pattern characters themselves'
      )
      assert.equal(state.overlay, null)

      for (const other of others) {
        assert.equal(state.search[other].value, '')
        assert.equal(state.search[other].regexEnabled, false)
      }
    })
  }

  it('binds a field to the shape the views actually ask for', () => {
    const actions: Array<Md3ShellAction> = []
    const state = createMd3ShellState()
    const binding = md3SearchBinding(
      state,
      action => actions.push(action),
      'logs'
    )

    assert.equal(binding.value, '')
    assert.equal(binding.regexEnabled, false)

    binding.onChange('error')
    binding.onClear()
    binding.onToggleRegex()
    binding.onOpenBuilder()

    assert.deepStrictEqual(actions, [
      { type: 'set-search', field: 'logs', value: 'error' },
      { type: 'clear-search', field: 'logs' },
      { type: 'toggle-search-regex', field: 'logs' },
      { type: 'open-builder', target: { kind: 'search', field: 'logs' } },
    ])
  })
})

describe('md3 shell — shared account switcher anchors', () => {
  it('routes each avatar, separates expanded state, and preserves focus anchors', () => {
    const anchors: Array<'header' | 'rail'> = []
    const headerRef = React.createRef<HTMLButtonElement>()
    const railRef = React.createRef<HTMLButtonElement>()
    const view = render(
      <Harness
        navigation="rail"
        accountSwitcherAnchor="header"
        onOpenAccountSwitcher={anchor => anchors.push(anchor)}
        headerAccountButtonRef={headerRef}
        railAccountButtonRef={railRef}
      />
    )

    const header = view.container.querySelector(
      '.md3-app-header__account'
    ) as HTMLButtonElement | null
    const rail = view.container.querySelector(
      '.md3-navigation-rail__account'
    ) as HTMLButtonElement | null
    assert.ok(header !== null)
    assert.ok(rail !== null)
    assert.equal(headerRef.current, header)
    assert.equal(railRef.current, rail)
    assert.notEqual(headerRef.current, railRef.current)

    assert.equal(header.getAttribute('aria-expanded'), 'true')
    assert.equal(rail.getAttribute('aria-expanded'), 'false')

    fireEvent.click(header)
    fireEvent.click(rail)
    assert.deepStrictEqual(anchors, ['header', 'rail'])

    view.rerender(
      <Harness
        navigation="rail"
        accountSwitcherAnchor="rail"
        onOpenAccountSwitcher={anchor => anchors.push(anchor)}
        headerAccountButtonRef={headerRef}
        railAccountButtonRef={railRef}
      />
    )

    assert.equal(header.getAttribute('aria-expanded'), 'false')
    assert.equal(rail.getAttribute('aria-expanded'), 'true')

    headerRef.current?.focus()
    assert.equal(
      document.activeElement,
      header,
      'the shared switcher can return focus to the header avatar that opened it'
    )
    railRef.current?.focus()
    assert.equal(
      document.activeElement,
      rail,
      'the shared switcher can return focus to the rail avatar that opened it'
    )
  })
})

describe('md3 shell — the global search field, rendered', () => {
  const placeholder = englishTranslations['md3.appHeader.searchPlaceholder']
  const fieldLabel = englishTranslations['md3.appHeader.searchField']

  it('types, clears and toggles regex through the real header field', () => {
    const states: Array<IMd3ShellState> = []
    render(<Harness onState={state => states.push(state)} />)

    const input = screen.getByRole('searchbox', {
      name: placeholder,
    }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tonal' } })
    assert.equal(states.at(-1)?.search.global.value, 'tonal')
    assert.equal(input.value, 'tonal')

    const regex = screen.getByRole('button', {
      name: `Regex mode for ${fieldLabel}`,
    })
    fireEvent.click(regex)
    assert.equal(states.at(-1)?.search.global.regexEnabled, true)
    assert.equal(regex.getAttribute('aria-pressed'), 'true')

    fireEvent.click(screen.getByRole('button', { name: `Clear ${fieldLabel}` }))
    assert.equal(states.at(-1)?.search.global.value, '')
    assert.equal(
      states.at(-1)?.search.global.regexEnabled,
      true,
      'clearing the text must not silently reset the mode'
    )
  })

  it('writes an applied pattern back into the global field', () => {
    const states: Array<IMd3ShellState> = []
    render(<Harness onState={state => states.push(state)} />)

    fireEvent.change(screen.getByRole('searchbox', { name: placeholder }), {
      target: { value: 'feat' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: `Regex builder for ${fieldLabel}` })
    )

    const target = md3SearchFieldLabel('global')
    const patternInput = screen.getByRole('textbox', {
      name: englishTranslations['md3.regexBuilder.patternLabel'],
    })
    assert.equal(
      (patternInput as HTMLInputElement).value,
      'feat',
      'the builder opens on what the field already holds'
    )

    fireEvent.change(patternInput, { target: { value: '^feat' } })
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.regexBuilder.applyName'].replace(
          '{target}',
          target
        ),
      })
    )

    const final = states.at(-1)
    assert.equal(final?.search.global.value, '^feat')
    assert.equal(final?.search.global.regexEnabled, true)
    assert.equal(final?.overlay, null)
    for (const other of Md3SearchFieldKeys.filter(key => key !== 'global')) {
      assert.equal(final?.search[other].value, '')
      assert.equal(final?.search[other].regexEnabled, false)
    }
  })
})

describe('md3 shell — a view field bound through the shell', () => {
  /**
   * The History filter, wired the way a host wires it: through
   * `md3SearchBinding`, into the real view. This is the seam the pure reducer
   * tests cannot reach — it proves the binding's shape actually fits a view's
   * props rather than merely type-checking against them.
   */
  function historyWiredViews(
    state: IMd3ShellState,
    dispatch: (action: Md3ShellAction) => void
  ): IMd3ShellViews {
    const binding = md3SearchBinding(state, dispatch, 'history')
    const built = buildViews()
    return {
      ...built,
      history: {
        ...built.history!,
        filterText: binding.value,
        filterRegexEnabled: binding.regexEnabled,
        onFilterTextChanged: binding.onChange,
        onFilterRegexToggled: binding.onToggleRegex,
        onOpenFilterRegexBuilder: () => binding.onOpenBuilder(),
      },
    }
  }

  it('writes into the history slot and nowhere else', () => {
    const states: Array<IMd3ShellState> = []
    const { container } = render(
      <Harness
        views={historyWiredViews}
        onState={state => states.push(state)}
      />
    )

    const filter = container.querySelector<HTMLInputElement>(
      '#md3-history-filter'
    )
    assert.ok(filter !== null)

    fireEvent.change(filter as HTMLInputElement, {
      target: { value: 'md3' },
    })

    const state = states.at(-1)
    assert.equal(state?.search.history.value, 'md3')
    assert.equal(
      state?.search.global.value,
      '',
      'the history filter must not leak into the global search'
    )
  })

  it('applies a built pattern to history alone, leaving the global field alone', () => {
    const states: Array<IMd3ShellState> = []
    render(
      <Harness
        views={historyWiredViews}
        onState={state => states.push(state)}
      />
    )

    const builderButton = screen.getByRole('button', {
      name: `Regex builder for ${englishTranslations['md3.history.fieldLabel']}`,
    })
    fireEvent.click(builderButton)

    fireEvent.change(
      screen.getByRole('textbox', {
        name: englishTranslations['md3.regexBuilder.patternLabel'],
      }),
      { target: { value: '^Rewrite' } }
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.regexBuilder.applyName'].replace(
          '{target}',
          md3SearchFieldLabel('history')
        ),
      })
    )

    const state = states.at(-1)
    assert.equal(state?.search.history.value, '^Rewrite')
    assert.equal(state?.search.history.regexEnabled, true)
    assert.equal(state?.search.global.value, '')
    assert.equal(state?.search.global.regexEnabled, false)
  })
})

// ---------------------------------------------------------------------------
// Menus opened from the shell
// ---------------------------------------------------------------------------

describe('md3 shell — menus', () => {
  it('opens the pane menu from the pane header and closes it again', () => {
    const states: Array<IMd3ShellState> = []
    render(<Harness onState={state => states.push(state)} />)

    const paneMenuButton = screen
      .getAllByRole('button')
      .find(
        button =>
          button.getAttribute('aria-expanded') === 'false' &&
          button.classList.contains('md3-icon-button') &&
          accessibleName(button).length > 0 &&
          button.closest('.md3-pane-header') !== null
      )
    assert.ok(paneMenuButton !== undefined, 'the pane header must offer a menu')

    fireEvent.click(paneMenuButton as HTMLElement)
    assert.equal(states.at(-1)?.overlay?.kind, 'menu')

    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.menuOverlay.close'],
      })
    )
    assert.equal(states.at(-1)?.overlay, null)
  })

  it('seeds a menu filter from a pattern built inside that menu', () => {
    const states: Array<IMd3ShellState> = []
    render(<Harness onState={state => states.push(state)} />)

    fireEvent.contextMenu(
      screen.getByRole('navigation', {
        name: englishTranslations['md3.drawer.label'],
      })
    )
    const opened = states.at(-1)?.overlay
    assert.equal(opened?.kind, 'menu')

    const dialog = screen.getByRole('dialog')
    const title = dialog.querySelector('.md3-menu-overlay__title')?.textContent
    assert.ok(title !== undefined && title !== null)

    fireEvent.click(
      screen.getByRole('button', { name: `Regex builder for ${title}` })
    )

    fireEvent.change(
      screen.getByRole('textbox', {
        name: englishTranslations['md3.regexBuilder.patternLabel'],
      }),
      { target: { value: '^Coll' } }
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.regexBuilder.applyName'].replace(
          '{target}',
          title as string
        ),
      })
    )

    const state = states.at(-1)
    assert.equal(state?.overlay?.kind, 'menu')
    assert.equal(
      state?.overlay?.kind === 'menu' ? state.overlay.filter : null,
      '^Coll',
      'the menu that opened the builder must come back carrying the pattern'
    )
    assert.equal(
      state?.overlay?.kind === 'menu' ? state.overlay.regexEnabled : null,
      true
    )

    // And nothing was written into any of the eleven view search fields.
    for (const field of Md3SearchFieldKeys) {
      assert.equal(state?.search[field].value, '')
      assert.equal(state?.search[field].regexEnabled, false)
    }
  })
})

// ---------------------------------------------------------------------------
// Compose dialog
// ---------------------------------------------------------------------------

describe('md3 shell — compose dialog', () => {
  function openCompose() {
    const view = render(<Harness />)
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.drawer.commit'],
      })
    )
    return view
  }

  it('opens from the drawer', () => {
    openCompose()
    assert.ok(
      screen.getByRole('dialog', {
        name: englishTranslations['md3.compose.title'],
      }) instanceof HTMLElement
    )
  })

  it('refuses an empty summary and says so out loud', async () => {
    let commits = 0
    render(<Harness onCommit={() => commits++} />)
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.drawer.commit'],
      })
    )

    const summary = screen.getByRole('textbox', {
      name: englishTranslations['md3.compose.summaryPlaceholder'],
    }) as HTMLInputElement
    assert.equal(summary.getAttribute('aria-invalid'), 'true')
    assert.ok(
      screen.getByText(
        englishTranslations['md3.compose.hintRequired']
      ) instanceof HTMLElement
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(englishTranslations['md3.compose.commitOnly']),
      })
    )

    assert.equal(commits, 0, 'nothing may be committed without a summary')

    // The refusal reaches the real process-wide toast queue and the shell's
    // own host renders it. A stubbed notifier would prove neither.
    await waitFor(() =>
      assert.ok(
        screen.getByText(
          englishTranslations['md3.compose.summaryStillRequired']
        ) instanceof HTMLElement
      )
    )
    assert.equal(
      document.activeElement,
      summary,
      'the refusal must put the caret in the field that needs filling in'
    )
  })

  it('commits once there is a summary', () => {
    let commits = 0
    render(<Harness onCommit={() => commits++} />)
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.drawer.commit'],
      })
    )

    const summary = screen.getByRole('textbox', {
      name: englishTranslations['md3.compose.summaryPlaceholder'],
    })
    fireEvent.change(summary, { target: { value: 'Land the MD3 shell' } })

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(englishTranslations['md3.compose.commitOnly']),
      })
    )
    assert.equal(commits, 1)
    assert.equal(md3Toasts.toasts.length, 0, 'a valid commit raises no refusal')
  })

  it('closes on Escape', () => {
    openCompose()
    const dialog = screen.getByRole('dialog', {
      name: englishTranslations['md3.compose.title'],
    })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    assert.equal(
      screen.queryByRole('dialog', {
        name: englishTranslations['md3.compose.title'],
      }),
      null
    )
  })
})

// ---------------------------------------------------------------------------
// Legacy chrome
// ---------------------------------------------------------------------------

describe('md3 shell — legacy chrome', () => {
  it('shows the repository tab strip by default', () => {
    const { container } = render(
      <Harness
        repositoryTabStrip={<div data-testid="tab-strip">repository tabs</div>}
      />
    )
    assert.ok(container.querySelector('.md3-shell__tab-strip') !== null)
    assert.ok(screen.getByTestId('tab-strip') instanceof HTMLElement)
  })

  it('hides the tab strip only when the host explicitly says so', () => {
    const { container } = render(
      <Harness
        repositoryTabStrip={<div data-testid="tab-strip">repository tabs</div>}
        showRepositoryTabStrip={false}
      />
    )
    assert.equal(container.querySelector('.md3-shell__tab-strip'), null)
    assert.equal(screen.queryByTestId('tab-strip'), null)
  })

  it('shows the classic toolbar under the real, defaulted-on preference', () => {
    // No stored value: this is the shipped fallback flowing through the real
    // setting rather than a boolean the test made up.
    localStorage.removeItem(ShowClassicToolbarKey)
    const { container } = render(
      <Harness
        classicToolbar={<div data-testid="classic-toolbar">toolbar</div>}
        showClassicToolbar={getShowClassicToolbar()}
      />
    )
    assert.ok(container.querySelector('.md3-shell__classic-toolbar') !== null)
    assert.ok(screen.getByTestId('classic-toolbar') instanceof HTMLElement)
  })

  it('hides the classic toolbar once the user turns the preference off', () => {
    setShowClassicToolbar(false)
    const { container } = render(
      <Harness
        classicToolbar={<div data-testid="classic-toolbar">toolbar</div>}
        showClassicToolbar={getShowClassicToolbar()}
      />
    )
    assert.equal(container.querySelector('.md3-shell__classic-toolbar'), null)
    assert.equal(screen.queryByTestId('classic-toolbar'), null)
  })
})

// ---------------------------------------------------------------------------
// Accessibility across the shell
// ---------------------------------------------------------------------------

describe('md3 shell — accessible names and keyboard reachability', () => {
  it('names every button the shell paints', () => {
    const { container } = render(<Harness views={() => buildViews()} />)

    const unnamed = Array.from(container.querySelectorAll('button'))
      .filter(button => accessibleName(button).length === 0)
      .map(button => button.className)

    assert.deepStrictEqual(
      unnamed,
      [],
      'an unnamed button is a control nobody using a screen reader can ' +
        'identify'
    )
  })

  it('names the header landmark, the drawer and the pane', () => {
    render(<Harness />)

    assert.ok(
      screen.getByRole('banner', {
        name: englishTranslations['md3.appHeader.label'],
      }) instanceof HTMLElement
    )
    assert.ok(
      screen.getByRole('navigation', {
        name: englishTranslations['md3.drawer.label'],
      }) instanceof HTMLElement
    )

    const pane = document.getElementById(Md3ShellPaneId)
    assert.ok(pane !== null)
    assert.equal(
      (pane as HTMLElement).getAttribute('aria-labelledby'),
      Md3ShellHeadingId
    )
  })

  it('orients the destination list vertically, which decides its arrow keys', () => {
    render(<Harness />)
    const tablist = screen.getByRole('tablist', {
      name: englishTranslations['md3.drawer.destinations'],
    })
    assert.equal(
      tablist.getAttribute('aria-orientation'),
      'vertical',
      'a strip announced as horizontal is a strip whose arrow keys a screen ' +
        'reader user will press in the wrong direction'
    )
  })

  it('gives the unread badge a spoken count rather than a bare number', () => {
    render(<Harness />)
    const bell = screen.getByRole('button', {
      name: englishTranslations['md3.appHeader.notificationsUnread'].replace(
        '{count}',
        '3'
      ),
    })
    assert.ok(bell instanceof HTMLElement)
    assert.ok(
      screen.getByLabelText(
        englishTranslations['md3.appHeader.unreadBadge'].replace('{count}', '3')
      ) instanceof HTMLElement
    )
  })

  it('makes the pane heading a focus target without putting it in the tab order', () => {
    render(<Harness />)
    const heading = document.getElementById(Md3ShellHeadingId)
    assert.ok(heading !== null)
    assert.equal((heading as HTMLElement).getAttribute('tabindex'), '-1')
  })
})
