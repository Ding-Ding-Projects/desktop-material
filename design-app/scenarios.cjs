'use strict'

const HistoryReference = 'History MD3.dc.html'
const HistoryViewport = Object.freeze({ width: 1440, height: 900 })

function clickTitle(name) {
  return { kind: 'click-title', name, scopeLabel: null }
}

function clickText(name) {
  return { kind: 'click-text-button', name, scopeLabel: null }
}

function clickCss(selector, index, description) {
  return { kind: 'click-indexed-css', selector, index, description }
}

function clickNear(placeholder, title) {
  return { kind: 'click-near-placeholder-title', placeholder, title }
}

function fill(placeholder, value) {
  return { kind: 'fill-placeholder', placeholder, value }
}

function contextSelector(selector, index, description) {
  return { kind: 'context-menu-selector', selector, index, description }
}

function contextText(text) {
  return { kind: 'context-menu-text', text }
}

function historyRoute(name, actions, options = {}) {
  return {
    name,
    reference: HistoryReference,
    theme: 'dark',
    actions,
    expectedVisibleText: options.text ?? [],
    expectedVisibleSelectors: options.selectors ?? [],
    expectedDrawerWidth: options.drawerWidth ?? null,
    settleMs: options.settleMs ?? 1100,
  }
}

const destinationRoutes = [
  historyRoute('history-history', [], {
    text: ['Navigation drawer: badge counts and a searchable repository list'],
    selectors: [
      'input[placeholder="Filter commits"]',
      'button[title="Commit graph"]',
    ],
  }),
  historyRoute('history-changes', [clickTitle('Changes')], {
    selectors: [
      'input[placeholder="Filter changed files"]',
      'input[placeholder="Summary (required)"]',
    ],
  }),
  historyRoute('history-branches', [clickTitle('Branches')], {
    text: ['New branch'],
    selectors: ['input[placeholder="Filter branches"]'],
  }),
  historyRoute('history-actions', [clickTitle('Actions')], {
    selectors: [
      'input[placeholder="Filter workflow runs"]',
      'input[placeholder="Search log output"]',
    ],
  }),
  historyRoute('history-inbox', [clickTitle('Inbox')], {
    text: ['Mark all read'],
    selectors: ['input[placeholder="Search notifications"]'],
  }),
  historyRoute('history-terminal', [clickTitle('Terminal')], {
    selectors: [
      'input[placeholder="Search terminal output"]',
      'input[placeholder="Run a command"]',
    ],
  }),
  historyRoute('history-agents', [clickTitle('Agents')], {
    selectors: [
      'input[placeholder="Search agent sessions"]',
      'input[placeholder="Send an instruction"]',
    ],
  }),
  historyRoute('history-repositories', [clickTitle('Repositories')], {
    text: ['Pull all'],
    selectors: ['input[placeholder="Search repositories, orgs, languages"]'],
  }),
]

const majorRoutes = [
  historyRoute('history-detail-sheet', [clickText('Details')], {
    text: ['View on GitHub'],
    selectors: ['button[title="Copy SHA"]', 'button[title="Close"]'],
  }),
  historyRoute(
    'history-compose-dialog',
    [clickCss('nav button', 0, 'Open commit composer')],
    {
      text: ['Compose commit message'],
      selectors: [
        'input[placeholder="Summary (required)"]',
        'textarea[placeholder="Description (optional)"]',
      ],
    }
  ),
  historyRoute(
    'history-regex-builder',
    [
      clickNear(
        'Search commits, files, branches, repositories',
        'Regex builder'
      ),
    ],
    {
      text: ['Regex builder — global'],
      selectors: [
        'input[placeholder="pattern"]',
        'input[placeholder="Test string"]',
      ],
    }
  ),
  historyRoute('history-toast-fetch', [clickTitle('Fetch origin')], {
    text: ['Fetched origin', 'Undo'],
    settleMs: 950,
  }),
  historyRoute('history-collapsed-drawer', [clickTitle('Menu')], {
    drawerWidth: 68,
    settleMs: 350,
  }),
  historyRoute('history-progress-fetch', [clickTitle('Fetch origin')], {
    selectors: ['div[style*="transition: width 85ms linear"]'],
    settleMs: 180,
  }),
  historyRoute(
    'history-empty',
    [fill('Filter commits', '__no_history_match__')],
    {
      text: ['No commits match this filter.', 'Reset filters'],
      settleMs: 120,
    }
  ),
  historyRoute(
    'history-repositories-empty',
    [
      clickTitle('Repositories'),
      fill('Search repositories, orgs, languages', '__no_repository_match__'),
    ],
    {
      text: ['No repositories match.', 'Reset filters'],
      settleMs: 120,
    }
  ),
]

function menu(name, actions, heading) {
  return historyRoute(name, actions, {
    text: [heading],
    selectors: ['button[title="Close"]'],
    settleMs: 180,
  })
}

const menuRoutes = [
  menu(
    'history-menu-palette',
    [clickTitle('Command palette')],
    'Command palette'
  ),
  menu('history-menu-settings', [clickTitle('Settings')], 'Settings'),
  menu('history-menu-account', [clickTitle('Account switcher')], 'Accounts'),
  menu(
    'history-menu-repository',
    [
      clickCss(
        'main section > div:first-child > button:nth-of-type(1)',
        0,
        'Open repository menu'
      ),
    ],
    'Switch repository'
  ),
  menu(
    'history-menu-branch',
    [
      clickCss(
        'main section > div:first-child > button:nth-of-type(2)',
        0,
        'Open branch menu'
      ),
    ],
    'Switch branch'
  ),
  menu('history-menu-pane', [clickTitle('More actions')], 'Repository actions'),
  menu('history-menu-list', [clickTitle('Sort and group')], 'Commit list'),
  menu(
    'history-menu-diff-options',
    [clickCss('button[title="Diff options"]', 0, 'Open diff options')],
    'Diff options'
  ),
  menu(
    'history-menu-file',
    [clickTitle('Open in editor, copy path, blame')],
    'File actions'
  ),
  menu(
    'history-menu-commit-row',
    [
      clickCss(
        'button[title="Revert, cherry-pick, tag, reset"]',
        0,
        'Open commit actions'
      ),
    ],
    'commit actions'
  ),
  menu(
    'history-menu-changes',
    [clickTitle('Changes'), clickTitle('Discard, ignore, stash')],
    'Changed files'
  ),
  menu(
    'history-menu-change-row',
    [
      clickTitle('Changes'),
      clickCss(
        'button[title="Discard, ignore, reveal"]',
        0,
        'Open changed-file actions'
      ),
    ],
    'File actions'
  ),
  menu(
    'history-menu-branch-row',
    [
      clickTitle('Branches'),
      clickCss(
        'button[title="Merge, rename, delete, open PR"]',
        0,
        'Open branch actions'
      ),
    ],
    'Branch actions'
  ),
  menu(
    'history-menu-run-row',
    [
      clickTitle('Actions'),
      clickCss(
        'button[title="Re-run failed jobs, cancel, view logs"]',
        0,
        'Open workflow-run actions'
      ),
    ],
    'Workflow run'
  ),
  menu(
    'history-menu-repository-row',
    [
      clickTitle('Repositories'),
      clickCss(
        'button[title="Fetch, remove, reveal, settings"]',
        0,
        'Open repository actions'
      ),
    ],
    'Repository actions'
  ),
  menu(
    'history-menu-agent-access',
    [clickTitle('Agents'), clickTitle('Agent access')],
    'Agent access'
  ),
  menu(
    'history-menu-inbox-row',
    [clickTitle('Inbox'), contextText('CI passed on development')],
    'Notification'
  ),
  menu(
    'history-menu-agent-row',
    [
      clickTitle('Agents'),
      contextText('Resolve merge conflicts in _material-shell.scss'),
    ],
    'Agent session'
  ),
  menu(
    'history-menu-terminal',
    [clickTitle('Terminal'), contextText('$ git status --short')],
    'Terminal'
  ),
  menu(
    'history-menu-drawer',
    [contextSelector('nav', 0, 'Open navigation menu')],
    'Navigation'
  ),
  menu(
    'history-menu-search',
    [
      contextSelector(
        'input[placeholder="Search commits, files, branches, repositories"]',
        0,
        'Open search-field menu'
      ),
    ],
    'Search field'
  ),
  menu(
    'history-menu-guide',
    [
      clickNear(
        'Search commits, files, branches, repositories',
        'Regex builder'
      ),
      clickText('Guide'),
    ],
    'How regex works'
  ),
]

const HistoryRoutes = Object.freeze(
  [...destinationRoutes, ...majorRoutes, ...menuRoutes].map(route =>
    Object.freeze({
      ...route,
      expectedLabels: [],
      suppliedPng: null,
      suppliedPngDisposition: null,
      expectedViewport: {
        registration: {
          ...HistoryViewport,
          autoFit: false,
          uiScalePercent: 100,
          theme: route.theme,
        },
        logical: {
          ...HistoryViewport,
          autoFit: false,
          uiScalePercent: 100,
          themes: ['light', 'dark'],
        },
      },
    })
  )
)

const UnreachableHistoryStates = Object.freeze([
  {
    name: 'history-menu-compose',
    reason:
      "menuSpec() defines overlay 'compose', but the source exposes no click or context-menu action that opens it.",
  },
])

module.exports = {
  HistoryReference,
  HistoryRoutes,
  UnreachableHistoryStates,
}
