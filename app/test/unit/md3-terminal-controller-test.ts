import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'

import type {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
} from '../../src/lib/cli-workbench'

/**
 * The Terminal destination's ADAPTER, not its view.
 *
 * `md3-terminal-view-fixtures.ts` is already contract-shaped — its pills read
 * `bash — sample` and its prompts read `~/code/sample $` — so a view test built
 * on it cannot see what the controller actually hands over. Every assertion
 * here therefore drives `Md3TerminalController` from a real repository path and
 * real workbench events, and reads `getViewProps()` back.
 */

type OutputHandler = (event: unknown, output: ICLICommandOutputEvent) => void
type StateHandler = (event: unknown, state: ICLICommandStateEvent) => void

let outputHandler: OutputHandler | null = null
let stateHandler: StateHandler | null = null
let started: Array<{ readonly id: string; readonly repositoryPath: string }> =
  []
let cancelled: Array<string> = []

mock.module('../../src/ui/main-process-proxy', {
  namedExports: {
    onCLICommandOutput: (handler: OutputHandler) => {
      outputHandler = handler
      return () => {
        outputHandler = null
      }
    },
    onCLICommandState: (handler: StateHandler) => {
      stateHandler = handler
      return () => {
        stateHandler = null
      }
    },
    startCLICommand: async (request: {
      id: string
      repositoryPath: string
    }) => {
      started.push({ id: request.id, repositoryPath: request.repositoryPath })
      return true
    },
    cancelCLICommand: async (id: string) => {
      cancelled.push(id)
      return true
    },
  },
})

let Md3TerminalController: typeof import('../../src/ui/md3/md3-terminal-controller').Md3TerminalController
let abbreviateMd3TerminalDirectory: typeof import('../../src/ui/md3/md3-terminal-controller').abbreviateMd3TerminalDirectory
let md3TerminalPrompt: typeof import('../../src/ui/md3/md3-terminal-controller').md3TerminalPrompt
let md3TerminalRepositoryName: typeof import('../../src/ui/md3/md3-terminal-controller').md3TerminalRepositoryName

before(async () => {
  ;({
    Md3TerminalController,
    abbreviateMd3TerminalDirectory,
    md3TerminalPrompt,
    md3TerminalRepositoryName,
  } = await import('../../src/ui/md3/md3-terminal-controller'))
})

/**
 * A path that is under nobody's home directory on any platform, so the
 * abbreviation the controller performs with the real `homedir()` is the same
 * on a Windows developer machine and a Linux runner.
 */
const RepositoryPath = '/srv/checkouts/github/desktop-material'

const searchBinding = {
  value: '',
  regexEnabled: false,
  onChange: () => {},
  onClear: () => {},
  onToggleRegex: () => {},
  onOpenBuilder: () => {},
}

function createController() {
  started = []
  cancelled = []
  const controller = new Md3TerminalController({
    onChanged: () => {},
    onRefreshRepository: async () => {},
    onContextMenu: () => {},
  })
  controller.start()
  return controller
}

function props(controller: InstanceType<typeof Md3TerminalController>) {
  return controller.getViewProps(searchBinding)
}

describe('Md3TerminalController session identity', () => {
  it('labels the shell pill with the program and the repository, not a session number', () => {
    const controller = createController()
    controller.setRepositoryPath(RepositoryPath)

    const [session] = props(controller).sessions
    assert.equal(session.label, 'git — desktop-material')
    // The contract's pill is `<shell> — <repository>`; "Session 1" names
    // neither, so a user with two repositories open cannot tell the pills apart.
    assert.ok(!/session/i.test(session.label))
    controller.dispose()
  })

  it('numbers a second shell on the same repository so two pills are distinguishable', () => {
    const controller = createController()
    controller.setRepositoryPath(RepositoryPath)
    props(controller).onCreateSession()

    const labels = props(controller).sessions.map(session => session.label)
    assert.deepStrictEqual(labels, [
      'git — desktop-material',
      'git — desktop-material (2)',
    ])
    controller.dispose()
  })

  it('renders an abbreviated prompt ending in the contract $ while carrying the whole path', () => {
    const controller = createController()
    controller.setRepositoryPath(RepositoryPath)

    const [session] = props(controller).sessions
    // The defect this replaces put the full absolute path into `prompt`, which
    // the row draws at `flex: none` — it took the width the command box needs
    // and then ellipsed away the only part of a path that identifies anything.
    assert.equal(session.prompt, '…/github/desktop-material $')
    assert.ok(session.prompt.endsWith(' $'))
    assert.ok(!session.prompt.includes('/srv/'))
    // Nothing is hidden: the tooltip and the input's accessible name read this.
    assert.equal(session.workingDirectory, RepositoryPath)
    controller.dispose()
  })

  it('reports that no shell can be opened while no repository is selected', () => {
    const controller = createController()
    controller.setRepositoryPath(null)

    const view = props(controller)
    assert.deepStrictEqual(view.sessions, [])
    // The `add` button and the empty state's action are wired to
    // `onCreateSession`, which cannot do anything without a repository. Saying
    // so is what stops them being controls that look live and do nothing.
    assert.equal(view.canCreateSession, false)

    controller.setRepositoryPath(RepositoryPath)
    assert.equal(props(controller).canCreateSession, true)
    controller.dispose()
  })
})

describe('Md3TerminalController line kinds', () => {
  it('opens the session with a prompt-coloured context line rather than output', () => {
    const controller = createController()
    controller.setRepositoryPath(RepositoryPath)

    const [session] = props(controller).sessions
    assert.equal(session.lines.length, 1)
    // `out` is on-surface — the colour of what a command printed. The app's own
    // context line painted that way is indistinguishable from real output.
    assert.equal(session.lines[0].kind, 'prompt')
    assert.ok(session.lines[0].text.includes(RepositoryPath))
    controller.dispose()
  })

  it('echoes a command as the abbreviated prompt and the command, in the cmd kind', () => {
    const controller = createController()
    controller.setRepositoryPath(RepositoryPath)
    const view = props(controller)
    view.onRunCommand(view.sessions[0].id, 'git status --short')

    const lines = props(controller).sessions[0].lines
    const echo = lines[lines.length - 1]
    assert.equal(echo.kind, 'cmd')
    assert.equal(echo.text, '…/github/desktop-material $ git status --short')
    assert.equal(started.length, 1)
    assert.equal(started[0].repositoryPath, RepositoryPath)
    controller.dispose()
  })

  it('refuses a second command while one is in flight, keeping the typed line', () => {
    const controller = createController()
    controller.setRepositoryPath(RepositoryPath)
    const view = props(controller)
    view.onInputChange('git fetch')
    view.onRunCommand(view.sessions[0].id, 'git status --short')
    // The run cleared the box; the user types the next command while it runs.
    props(controller).onInputChange('git fetch')
    props(controller).onRunCommand(
      props(controller).sessions[0].id,
      'git fetch'
    )

    assert.equal(started.length, 1)
    // Nothing was started, so nothing may be thrown away either.
    assert.equal(props(controller).input, 'git fetch')

    // Disposing cancels what this controller started rather than leaving a
    // process running with nothing listening to it.
    controller.dispose()
    assert.deepStrictEqual(cancelled, [started[0].id])
  })
})

describe('Md3TerminalController output streaming', () => {
  function runOne(controller: InstanceType<typeof Md3TerminalController>) {
    controller.setRepositoryPath(RepositoryPath)
    const view = props(controller)
    view.onRunCommand(view.sessions[0].id, 'git status --short')
    assert.equal(started.length, 1)
    return started[0].id
  }

  function outputLines(
    controller: InstanceType<typeof Md3TerminalController>
  ): ReadonlyArray<string> {
    return props(controller)
      .sessions[0].lines.filter(line => line.kind === 'out')
      .map(line => line.text)
  }

  it('strips the ANSI colour git writes when a command asked for it', () => {
    const controller = createController()
    const runId = runOne(controller)
    assert.ok(outputHandler !== null)
    outputHandler(undefined, {
      id: runId,
      stream: 'stdout',
      data: '\u001b[32m M app/src/ui/md3/md3-terminal-view.tsx\u001b[0m\n',
    })

    // Without the strip the row draws the literal escape text, which is the
    // "present, correctly typed and wrong" shape of defect exactly.
    assert.deepStrictEqual(outputLines(controller), [
      ' M app/src/ui/md3/md3-terminal-view.tsx',
    ])
    controller.dispose()
  })

  it('joins a line the workbench split across two chunks', () => {
    const controller = createController()
    const runId = runOne(controller)
    assert.ok(outputHandler !== null)
    outputHandler(undefined, {
      id: runId,
      stream: 'stdout',
      data: ' M app/styles/ui/',
    })
    // Mid-line: nothing may be emitted yet, or one row becomes two half-rows.
    assert.deepStrictEqual(outputLines(controller), [])

    outputHandler(undefined, {
      id: runId,
      stream: 'stdout',
      data: '_md3-terminal.scss\r\n M app/src/ui',
    })
    assert.deepStrictEqual(outputLines(controller), [
      ' M app/styles/ui/_md3-terminal.scss',
    ])

    assert.ok(stateHandler !== null)
    stateHandler(undefined, {
      id: runId,
      state: 'completed',
      exitCode: 0,
      signal: null,
    })
    // A run that ends without a trailing newline still owes its last line.
    assert.deepStrictEqual(outputLines(controller), [
      ' M app/styles/ui/_md3-terminal.scss',
      ' M app/src/ui',
    ])
    controller.dispose()
  })

  it('keeps a blank line the command actually printed', () => {
    const controller = createController()
    const runId = runOne(controller)
    assert.ok(outputHandler !== null)
    outputHandler(undefined, {
      id: runId,
      stream: 'stdout',
      data: 'commit 4f1c9ae\n\n    Rewrite the history panel\n',
    })

    assert.deepStrictEqual(outputLines(controller), [
      'commit 4f1c9ae',
      '',
      '    Rewrite the history panel',
    ])
    controller.dispose()
  })
})

describe('md3 terminal prompt abbreviation', () => {
  it('collapses the home directory to a tilde', () => {
    assert.equal(
      abbreviateMd3TerminalDirectory('/home/dev/code', '/home/dev'),
      '~/code'
    )
  })

  it('elides the middle of a deep path under home', () => {
    assert.equal(
      abbreviateMd3TerminalDirectory(
        'C:\\Users\\dev\\Documents\\GitHub\\desktop-material',
        'C:\\Users\\dev'
      ),
      '~/…/GitHub/desktop-material'
    )
  })

  it('keeps a short path outside home whole', () => {
    assert.equal(
      abbreviateMd3TerminalDirectory('/srv/site', '/home/dev'),
      '/srv/site'
    )
  })

  it('elides a deep path outside home', () => {
    assert.equal(
      abbreviateMd3TerminalDirectory('/srv/checkouts/a/b', '/home/dev'),
      '…/a/b'
    )
  })

  it('writes the contract prompt as an abbreviation and a dollar', () => {
    assert.equal(
      md3TerminalPrompt('/home/dev/code/desktop-material', '/home/dev'),
      '~/code/desktop-material $'
    )
  })

  it('reads the repository name off either separator', () => {
    assert.equal(
      md3TerminalRepositoryName('C:\\code\\desktop-material\\'),
      'desktop-material'
    )
    assert.equal(
      md3TerminalRepositoryName('/srv/code/desktop-material'),
      'desktop-material'
    )
  })
})
