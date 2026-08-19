import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  IMd3TerminalSession,
  IMd3TerminalViewProps,
  Md3TerminalExportColumns,
  Md3TerminalView,
  md3TerminalCanCancel,
  md3TerminalCanRestart,
  md3TerminalExportRecord,
} from '../../src/ui/md3/md3-terminal-view'
import { md3TerminalSampleSessions } from '../../src/ui/md3/md3-terminal-view-fixtures'
import {
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'
import { DefaultFunnyLevels, funnyBand } from '../../src/lib/funny-level-text'
import { fireEvent, render, screen } from '../helpers/ui/render'

/**
 * The empty state is one of the eight banded destination families, so the words
 * on screen depend on the English funny level rather than being one fixed
 * string. Nothing is stored in this test's profile, so the default level is
 * what renders.
 */
const emptySessionsText =
  englishTranslations[
    `md3.terminal.noSessions.${funnyBand(DefaultFunnyLevels.english)}`
  ]

/**
 * The view half of the Terminal destination.
 *
 * The controller's own mapping is asserted in
 * `md3-terminal-controller-test.ts`; what is asserted here is the behaviour the
 * view owns — that no control on this surface is one that looks live and does
 * nothing.
 */

const readySession = md3TerminalSampleSessions[0]

function createProps(
  overrides: Partial<IMd3TerminalViewProps> = {}
): IMd3TerminalViewProps {
  return {
    sessions: [readySession],
    activeSessionId: readySession.id,
    search: {
      value: '',
      regexEnabled: false,
      onChange: () => {},
      onClear: () => {},
      onToggleRegex: () => {},
      onOpenBuilder: () => {},
    },
    input: '',
    onInputChange: () => {},
    onRunCommand: () => {},
    onSelectSession: () => {},
    onCreateSession: () => {},
    onContextMenu: () => {},
    ...overrides,
  }
}

function runButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: englishTranslations['md3.terminal.runName'].replace(
      '{shell}',
      readySession.label
    ),
  }) as HTMLButtonElement
}

describe('Md3TerminalView run affordance', () => {
  it('says why nothing ran when the shell is already busy', () => {
    const runs: Array<string> = []
    const busy: IMd3TerminalSession = { ...readySession, status: 'running' }
    render(
      <Md3TerminalView
        {...createProps({
          sessions: [busy],
          activeSessionId: busy.id,
          input: 'git fetch',
          onRunCommand: (_id, command) => runs.push(command),
        })}
      />
    )

    fireEvent.click(runButton())

    // The host drops a second command silently, so without this the button
    // reads as broken for exactly as long as the first command takes.
    assert.equal(runs.length, 0)
    assert.ok(
      screen.getByText(englishTranslations['md3.terminal.alreadyRunning']) !==
        null
    )
  })

  it('runs the command when the shell is ready', () => {
    const runs: Array<string> = []
    render(
      <Md3TerminalView
        {...createProps({
          input: 'git fetch',
          onRunCommand: (_id, command) => runs.push(command),
        })}
      />
    )

    fireEvent.click(runButton())
    assert.deepEqual(runs, ['git fetch'])
  })
})

describe('Md3TerminalView shell creation', () => {
  function newShellButton(): HTMLButtonElement {
    return screen.getByRole('button', {
      name: englishTranslations['md3.terminal.newShell'],
    }) as HTMLButtonElement
  }

  it('offers the new-shell button while a shell can be opened', () => {
    render(<Md3TerminalView {...createProps({ sessions: [], input: '' })} />)
    assert.equal(newShellButton().disabled, false)
    assert.ok(screen.getByText(emptySessionsText) !== null)
  })

  it('disables it and names the unmet condition when no repository is selected', () => {
    render(
      <Md3TerminalView
        {...createProps({
          sessions: [],
          activeSessionId: null,
          canCreateSession: false,
        })}
      />
    )

    assert.equal(newShellButton().disabled, true)
    // The empty state is the adjacent text that explains the disabled control.
    assert.ok(
      screen.getByText(englishTranslations['md3.terminal.noRepository']) !==
        null
    )
    assert.equal(
      screen.queryByRole('button', {
        name: englishTranslations['md3.terminal.openShell'],
      }),
      null
    )
  })
})

describe('Md3TerminalView prompt', () => {
  it('draws the abbreviated prompt and names the whole directory to assistive technology', () => {
    render(<Md3TerminalView {...createProps()} />)

    const input = screen.getByRole('textbox', {
      name: englishTranslations['md3.terminal.inputLabel']
        .replace('{shell}', readySession.label)
        .replace('{prompt}', readySession.workingDirectory ?? ''),
    })
    assert.ok(input !== null)
    // The row itself still draws the short form the contract specifies.
    assert.ok(screen.getByText(readySession.prompt) !== null)
  })
})

/**
 * The bulk-action bar over the shell strip.
 *
 * The selection algebra is proven in `md3-list-selection-test.ts`; what is
 * asserted here is this view's own wiring — that the bar's scope is the shells
 * and not the filtered scrollback, that a verb which cannot reach every shell
 * in scope skips exactly what it says it skips, that closing goes through the
 * gate rather than round it, and that the export record carries every column
 * the schema declares.
 */

const allSessions = md3TerminalSampleSessions

function bulkProps(
  overrides: Partial<IMd3TerminalViewProps> = {}
): IMd3TerminalViewProps {
  return createProps({
    sessions: allSessions,
    activeSessionId: allSessions[0].id,
    onCloseSession: () => {},
    onRestartSession: () => {},
    onCancelCommand: () => {},
    ...overrides,
  })
}

function bulkButton(key: TranslationKey): HTMLButtonElement {
  return screen.getByRole('button', {
    name: englishTranslations['md3.bulk.scopedAction']
      .replace('{label}', englishTranslations[key])
      .replace(
        '{scope}',
        englishTranslations['md3.bulk.scopeEverything'].replace(
          '{count}',
          String(allSessions.length)
        )
      ),
  }) as HTMLButtonElement
}

describe('Md3TerminalView bulk scope', () => {
  it('scopes the bar to every shell, and says so, while the output search narrows the scrollback', () => {
    // The search field on this surface filters LINES. If that leaked into the
    // bar the select-all would claim a filtered scope over an unfiltered strip
    // — the one defect neither the bar nor the user can see.
    render(
      <Md3TerminalView
        {...bulkProps({
          search: {
            value: 'npm',
            regexEnabled: false,
            onChange: () => {},
            onClear: () => {},
            onToggleRegex: () => {},
            onOpenBuilder: () => {},
          },
        })}
      />
    )

    assert.ok(
      screen.getByRole('checkbox', {
        name: englishTranslations['md3.bulk.selectAllEverything'].replace(
          '{count}',
          String(allSessions.length)
        ),
      }) !== null
    )
    assert.equal(
      screen.queryByRole('checkbox', {
        name: englishTranslations['md3.bulk.selectAllFiltered'].replace(
          '{count}',
          String(allSessions.length)
        ),
      }),
      null
    )
  })

  it('ticks a shell on Ctrl-click without switching to it', () => {
    const switched: Array<string> = []
    render(
      <Md3TerminalView
        {...bulkProps({ onSelectSession: id => switched.push(id) })}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: /sample-tools/ }), {
      ctrlKey: true,
    })

    assert.deepEqual(
      switched,
      [],
      'a modifier click is a selection, not a navigation'
    )
    assert.ok(
      screen.getByText(
        englishTranslations['md3.bulk.selectionCount'].replace('{count}', '1')
      ) !== null
    )
  })
})

describe('Md3TerminalView bulk verbs', () => {
  it('restarts only the shells that have exited, and skips the rest by name', () => {
    const restarted: Array<string> = []
    render(
      <Md3TerminalView
        {...bulkProps({ onRestartSession: id => restarted.push(id) })}
      />
    )

    fireEvent.click(bulkButton('md3.terminal.bulkRestart'))

    assert.deepEqual(
      restarted,
      allSessions.filter(md3TerminalCanRestart).map(session => session.id)
    )
    assert.ok(
      restarted.length < allSessions.length,
      'the fixture must contain an ineligible shell or this proves nothing'
    )
  })

  it('stops only the shells with a command in flight', () => {
    const stopped: Array<string> = []
    render(
      <Md3TerminalView
        {...bulkProps({ onCancelCommand: id => stopped.push(id) })}
      />
    )

    fireEvent.click(bulkButton('md3.terminal.stop'))

    assert.deepEqual(
      stopped,
      allSessions.filter(md3TerminalCanCancel).map(session => session.id)
    )
    assert.ok(
      stopped.length < allSessions.length,
      'the fixture must contain an ineligible shell or this proves nothing'
    )
  })

  it('routes the bulk close through the destructive gate rather than closing on the press', () => {
    const closed: Array<string> = []
    render(
      <Md3TerminalView
        {...bulkProps({ onCloseSession: id => closed.push(id) })}
      />
    )

    const close = bulkButton('md3.terminal.bulkClose')
    assert.equal(close.getAttribute('aria-haspopup'), 'dialog')

    fireEvent.click(close)

    assert.deepEqual(
      closed,
      [],
      'nothing may close before the gate authorizes it'
    )
    // The gate names the exact action and the exact count; the title and the
    // confirm button deliberately say the same words, so this asks the dialog
    // for its own accessible name rather than for text that appears twice.
    assert.equal(
      screen.getByRole('alertdialog', {
        name: englishTranslations['md3.terminal.gate.title'].replace(
          '{count}',
          String(allSessions.length)
        ),
      }).tagName,
      'FORM'
    )
  })
})

describe('Md3TerminalView export record', () => {
  it('carries every column the schema declares', () => {
    for (const session of allSessions) {
      const record = md3TerminalExportRecord(session)
      for (const column of Md3TerminalExportColumns) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(record, column.name),
          `the export record is missing the declared column ${column.name}`
        )
      }
    }
  })

  it('declares the scrollback as multiline, so the picker warns before a CSV flattens it', () => {
    const output = Md3TerminalExportColumns.find(
      column => column.name === 'output'
    )
    assert.equal(output?.multiline, true)
    assert.equal(
      md3TerminalExportRecord(allSessions[0]).output,
      allSessions[0].lines.map(line => line.text).join('\n')
    )
  })
})
