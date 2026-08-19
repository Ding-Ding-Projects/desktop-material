import * as React from 'react'
import classNames from 'classnames'

import { tFunny } from '../../lib/funny-level-text'
import { t } from '../../lib/i18n'
import {
  MaxRegexInputLength,
  MaxRegexTotalInputLength,
  compileSafeRegex,
} from '../../lib/safe-regex'
import { MaterialSymbol } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'
import {
  Md3EmptyState,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
import {
  IMd3BulkAction,
  Md3BulkBar,
  md3BulkExportMenuSpec,
} from './md3-bulk-bar'
import {
  IMd3ListExport,
  IMd3ListExportColumn,
  Md3ListExportFormat,
  serializeMd3ListExport,
} from './md3-list-export'
import {
  md3ApplySelection,
  md3BulkPartitionSummary,
  md3BulkScope,
  md3BulkScopeLabel,
  md3InvertSelection,
  md3PartitionBulk,
  md3SelectionIntent,
  md3ToggleSelectAll,
} from './md3-list-selection'
import { Md3DestructiveGate } from './md3-destructive-gate'
import { Md3MenuOverlay } from './md3-menu-overlay'
import { notify } from './md3-toast'

/**
 * The Terminal destination of the MD3 shell design contract
 * (`design/History MD3.dc.html`, the `<sc-if value="{{ isTerminal }}">` branch
 * and the `shellTabs` / `termLines` / `termPrompt` / `termMatchLabel` values in
 * `renderVals()`).
 *
 * In the contract's order: a horizontally scrolling row of 28px shell pills
 * ending in an `add` button; the `terminal` search field with its trailing
 * "N hits" label; the monospace 12px/19px output scroller carrying the terminal
 * context menu; and the input row — a primary-coloured prompt, a "Run a
 * command" box and a tonal `keyboard_return` Run button.
 *
 * Every measurement lives in `app/styles/ui/_md3-terminal.scss`.
 *
 * This view renders a REAL shell. It holds no session, spawns no process and
 * invents no output: sessions, their status and their lines arrive as props,
 * and `onRunCommand` hands the typed line to whatever is actually running it.
 * The contract's own prototype answers every command with the literal string
 * `ok`; that is fixture behaviour and is deliberately not reproduced here.
 */

/**
 * How a line is painted. The contract colours prompts in on-surface-variant,
 * command echoes in primary at weight 500, and everything else in on-surface.
 */
export type Md3TerminalLineKind = 'prompt' | 'cmd' | 'out'

/**
 * Why a Run press ran nothing: the box was empty, or the shell is already busy
 * with a command. `null` when the last press did run something.
 */
export type Md3TerminalRunNotice = 'empty' | 'busy' | null

export interface IMd3TerminalLine {
  /** Stable within a session, so React can key the list. */
  readonly id: string

  /** The visible text, already stripped of terminal control sequences. */
  readonly text: string

  readonly kind: Md3TerminalLineKind
}

/**
 * The lifecycle of one shell. `connecting`, `ready`, `exited` and `error` are
 * the states `IIntegratedTerminalSessionDescriptor` already reports; `running`
 * is the extra one this view needs, because a command in flight is what makes
 * Stop meaningful.
 */
export type Md3TerminalSessionStatus =
  | 'connecting'
  | 'ready'
  | 'running'
  | 'exited'
  | 'error'

export interface IMd3TerminalSession {
  readonly id: string

  /** The pill's visible label — the contract's `bash — desktop-material`. */
  readonly label: string

  readonly status: Md3TerminalSessionStatus

  /** The whole scrollback, oldest first. */
  readonly lines: ReadonlyArray<IMd3TerminalLine>

  /**
   * The contract's `termPrompt` — `'~/code/' + repo + ' $'`. Supplied rather
   * than derived: only the host knows the shell's real working directory.
   *
   * It is the ABBREVIATED form, as the contract's own sample is. A full
   * absolute path here is a defect: the row draws it at `flex: none`, so it
   * eats the width the command box needs and then ellipses away the only part
   * of a path that identifies anything.
   */
  readonly prompt: string

  /**
   * The shell's real working directory, unabbreviated.
   *
   * The prompt is what the 12px row draws; this is what its tooltip and the
   * input's accessible name say, so the abbreviation shortens the label
   * without hiding where a typed command will actually run.
   */
  readonly workingDirectory?: string

  /**
   * A sentence for the status banner when the shell is not `ready` — the exit
   * code, the spawn failure, the command in flight. Optional; the generic
   * status label is used when it is absent.
   */
  readonly statusDetail?: string
}

/** The search field's state and callbacks, owned by the host. */
export interface IMd3TerminalSearch {
  readonly value: string

  readonly regexEnabled: boolean

  readonly onChange: (value: string) => void

  readonly onClear: () => void

  readonly onToggleRegex: () => void

  readonly onOpenBuilder: () => void
}

export interface IMd3TerminalViewProps {
  /** Every open shell, in tab order. */
  readonly sessions: ReadonlyArray<IMd3TerminalSession>

  /** The selected shell, or `null` when none is open. */
  readonly activeSessionId: string | null

  readonly search: IMd3TerminalSearch

  /** The command line being composed. Controlled by the host. */
  readonly input: string

  readonly onInputChange: (value: string) => void

  /** Runs `command` in `sessionId`. The host clears `input` when it accepts. */
  readonly onRunCommand: (sessionId: string, command: string) => void

  readonly onSelectSession: (sessionId: string) => void

  /** The contract's `newShell` button. */
  readonly onCreateSession: () => void

  /**
   * False when the host cannot open a shell at all — no repository is
   * selected, typically. The `add` button and the empty state's action are
   * then disabled rather than left looking live and doing nothing, and the
   * empty state says which condition is unmet.
   *
   * Defaults to true.
   */
  readonly canCreateSession?: boolean

  /** Omit to hide the close affordance entirely. */
  readonly onCloseSession?: (sessionId: string) => void

  /** Offered on an `exited` or `error` shell. Omit to hide it. */
  readonly onRestartSession?: (sessionId: string) => void

  /** Ctrl+C, Escape and the Stop button while a command is `running`. */
  readonly onCancelCommand?: (sessionId: string) => void

  /**
   * Tab completion. Return the completed line, or the input unchanged when
   * there is no single candidate. Omit it and Tab moves focus normally.
   */
  readonly onCompleteInput?: (sessionId: string, input: string) => string

  /** The contract's `onContextTerminal` — opens the `terminalMenu` overlay. */
  readonly onContextMenu: (event: React.MouseEvent<HTMLElement>) => void

  /** Per-shell context menu, for close/restart without reaching the strip. */
  readonly onSessionContextMenu?: (
    sessionId: string,
    event: React.MouseEvent<HTMLElement>
  ) => void

  /**
   * The scrollback depth rendered at once. Older lines stay searchable —
   * filtering runs over the whole session before the tail is taken — and how
   * much is hidden is stated above the first rendered line.
   */
  readonly maxRenderedLines?: number

  /**
   * Receives a serialized export of the shells in the bulk scope. Omit it and
   * the bar draws no export button — a control that cannot work is not drawn.
   */
  readonly onExportSessions?: (
    payload: IMd3ListExport,
    sessions: ReadonlyArray<IMd3TerminalSession>
  ) => void

  readonly className?: string
}

/**
 * The export schema for one shell.
 *
 * `output` is the whole scrollback, which is the only reason anybody exports a
 * terminal session at all — and it is `multiline`, so the picker warns before
 * CSV, TSV or a Markdown table flattens it rather than after.
 */
export const Md3TerminalExportColumns: ReadonlyArray<IMd3ListExportColumn> = [
  { name: 'id' },
  { name: 'label' },
  { name: 'status' },
  { name: 'prompt' },
  { name: 'workingDirectory' },
  { name: 'statusDetail' },
  { name: 'lineCount' },
  { name: 'output', multiline: true },
]

/**
 * Flatten one shell for export.
 *
 * `workingDirectory` and `statusDetail` are optional on the session and become
 * the empty string rather than the word `undefined`; `lineCount` counts the
 * whole scrollback, not the rendered tail, because the tail is a rendering
 * budget and an exported file that reported it would understate the session.
 */
export function md3TerminalExportRecord(
  session: IMd3TerminalSession
): Readonly<Record<string, string | number | boolean>> {
  return {
    id: session.id,
    label: session.label,
    status: session.status,
    prompt: session.prompt,
    workingDirectory: session.workingDirectory ?? '',
    statusDetail: session.statusDetail ?? '',
    lineCount: session.lines.length,
    output: session.lines.map(line => line.text).join('\n'),
  }
}

/** A shell a Stop can reach: one with a command actually in flight. */
export function md3TerminalCanCancel(session: IMd3TerminalSession): boolean {
  return session.status === 'running'
}

/** A shell a Restart can reach: one whose process is already gone. */
export function md3TerminalCanRestart(session: IMd3TerminalSession): boolean {
  return session.status === 'exited' || session.status === 'error'
}

/** The tab pill's leading glyph, per the contract's `font-size: 14px`. */
const TabGlyphSize = 14

/** The banner's leading glyph. */
const BannerGlyphSize = 15

/**
 * Deep enough that a normal session never reaches it, shallow enough that a
 * command printing a hundred thousand lines cannot stall the renderer.
 */
const DefaultMaxRenderedLines = 1200

/** How close to the bottom still counts as "following the output". */
const PinnedToBottomSlack = 24

const Escape = String.fromCharCode(0x1b)
const Bell = String.fromCharCode(0x07)

// `ESC ] … BEL` or `ESC ] … ESC \` — how a shell sets the window title, which
// almost every prompt does.
const OscPattern = new RegExp(
  Escape + '\\][^]*?(?:' + Bell + '|' + Escape + '\\\\)',
  'g'
)
// `ESC [ … final` — colours, cursor moves, erases.
const CsiPattern = new RegExp(Escape + '\\[[0-9;?]*[ -/]*[@-~]', 'g')
// Any remaining two-character escape.
const TwoCharEscapePattern = new RegExp(Escape + '[@-Z\\\\-_]', 'g')
// C0 controls a plain-text renderer cannot show. Tab, LF and CR survive: the
// caller still needs them to split and align lines.
const ControlPattern = new RegExp(
  '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]',
  'g'
)

/** A stable empty array, so the filter memo does not rerun on every render. */
const EmptyLines: ReadonlyArray<IMd3TerminalLine> = []

let nextViewInstanceId = 0

/**
 * Remove the escape sequences a plain-text renderer cannot show.
 *
 * Exported so a host that splits output itself still normalises it the same
 * way this view's own adapter does.
 */
export function stripTerminalControlSequences(value: string): string {
  return value
    .replace(OscPattern, '')
    .replace(CsiPattern, '')
    .replace(TwoCharEscapePattern, '')
    .replace(ControlPattern, '')
}

/** Exported for a host classifying output it has already split. */
export function classifyTerminalLine(text: string): Md3TerminalLineKind {
  if (/^\s*[$>]\s+\S/.test(text)) {
    return 'cmd'
  }
  if (/^\S+@\S+[\s:]/.test(text) || /^[~/]\S*\s*[$>#]\s*$/.test(text)) {
    return 'prompt'
  }
  return 'out'
}

/**
 * Split raw terminal output into the contract's typed lines.
 *
 * The integrated terminal carries output as opaque chunks containing CRLF,
 * bare CR overwrites and ANSI escape sequences; the contract renders plain
 * wrapped text. This is the adapter between the two, so a host wiring the real
 * session needs one call rather than a hand-rolled parser per call site.
 *
 * Classification is a heuristic and is deliberately conservative: a line the
 * rules do not recognise is `out`, which is the neutral colour.
 */
export function createMd3TerminalLines(
  chunks: ReadonlyArray<string>,
  idPrefix: string = 'line'
): ReadonlyArray<IMd3TerminalLine> {
  const joined = chunks.join('')
  if (joined.length === 0) {
    return []
  }

  const normalized = stripTerminalControlSequences(joined).replace(
    /\r\n?/g,
    '\n'
  )
  const texts = normalized.split('\n')
  // A trailing newline produces a final empty element that is not a line the
  // shell ever printed; dropping it stops the scroller growing a blank row
  // after every command.
  if (texts.length > 1 && texts[texts.length - 1] === '') {
    texts.pop()
  }

  return texts.map((text, index) => ({
    id: `${idPrefix}-${index}`,
    text,
    kind: classifyTerminalLine(text),
  }))
}

function statusLabel(status: Md3TerminalSessionStatus): string {
  switch (status) {
    case 'connecting':
      return t('md3.terminal.status.connecting')
    case 'ready':
      return t('md3.terminal.status.ready')
    case 'running':
      return t('md3.terminal.status.running')
    case 'exited':
      return t('md3.terminal.status.exited')
    case 'error':
      return t('md3.terminal.status.error')
  }
}

/** Filter the scrollback exactly as the contract's `matcher()` does. */
function filterLines(
  lines: ReadonlyArray<IMd3TerminalLine>,
  query: string,
  regexEnabled: boolean
): ReadonlyArray<IMd3TerminalLine> {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return lines
  }

  if (regexEnabled) {
    // RE2, so a pathological pattern cannot freeze the renderer. An invalid
    // pattern matches everything, exactly as the contract's `matcher()` does —
    // otherwise the output blanks while the user is halfway through typing one.
    const { regex } = compileSafeRegex(trimmed, false)
    if (regex === null) {
      return lines
    }
    let budget = MaxRegexTotalInputLength
    return lines.filter(line => {
      if (line.text.length > MaxRegexInputLength || budget <= 0) {
        return false
      }
      budget -= line.text.length
      return regex.test(line.text)
    })
  }

  const needle = trimmed.toLowerCase()
  return lines.filter(line => line.text.toLowerCase().includes(needle))
}

export function Md3TerminalView(props: IMd3TerminalViewProps) {
  const {
    sessions,
    activeSessionId,
    search,
    input,
    onInputChange,
    onRunCommand,
    onSelectSession,
    onCreateSession,
    onCloseSession,
    onRestartSession,
    onCancelCommand,
    onCompleteInput,
    onSessionContextMenu,
    onExportSessions,
  } = props
  const canCreateSession = props.canCreateSession !== false

  const instanceId = React.useMemo(() => ++nextViewInstanceId, [])
  const panelId = `md3-terminal-${instanceId}-panel`
  const outputId = `md3-terminal-${instanceId}-output`
  const inputId = `md3-terminal-${instanceId}-input`
  const tabId = React.useCallback(
    (sessionId: string) => `md3-terminal-${instanceId}-tab-${sessionId}`,
    [instanceId]
  )

  const outputRef = React.useRef<HTMLDivElement | null>(null)
  const tablistRef = React.useRef<HTMLDivElement | null>(null)
  const pinnedToBottom = React.useRef(true)

  /** Commands actually submitted here, newest last, for Up/Down recall. */
  const [history, setHistory] = React.useState<ReadonlyArray<string>>([])
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null)
  /** Why the last Run did nothing, so the button is never silently inert. */
  const [runNotice, setRunNotice] = React.useState<Md3TerminalRunNotice>(null)
  const promptRef = React.useMemo(
    () => createObservableRef<HTMLSpanElement>(),
    []
  )

  const activeSession =
    sessions.find(session => session.id === activeSessionId) ??
    sessions[0] ??
    null

  const lines = activeSession === null ? EmptyLines : activeSession.lines
  const filtered = React.useMemo(
    () => filterLines(lines, search.value, search.regexEnabled),
    [lines, search.value, search.regexEnabled]
  )

  const maxRendered = Math.max(
    1,
    props.maxRenderedLines ?? DefaultMaxRenderedLines
  )
  const rendered = React.useMemo(
    () =>
      filtered.length > maxRendered ? filtered.slice(-maxRendered) : filtered,
    [filtered, maxRendered]
  )
  const hiddenCount = filtered.length - rendered.length
  const queryActive = search.value.trim().length > 0
  const activeId = activeSession?.id ?? null

  // A different shell starts at its own bottom rather than inheriting how far
  // up the previous one had been scrolled.
  React.useLayoutEffect(() => {
    pinnedToBottom.current = true
  }, [activeId])

  // Follow new output only while the reader is already at the bottom, so
  // scrolling back through a build log is not yanked away by the next line.
  // Nothing here moves focus: the input keeps it while output streams in.
  React.useLayoutEffect(() => {
    const node = outputRef.current
    if (node === null || !pinnedToBottom.current) {
      return
    }
    node.scrollTop = node.scrollHeight
  }, [rendered])

  const onOutputScroll = React.useCallback(() => {
    const node = outputRef.current
    if (node === null) {
      return
    }
    pinnedToBottom.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <=
      PinnedToBottomSlack
  }, [])

  const onTabClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const sessionId = event.currentTarget.dataset.sessionId
      if (sessionId !== undefined) {
        onSelectSession(sessionId)
      }
    },
    [onSelectSession]
  )

  const onTabContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const sessionId = event.currentTarget.dataset.sessionId
      if (sessionId === undefined || onSessionContextMenu === undefined) {
        return
      }
      event.preventDefault()
      onSessionContextMenu(sessionId, event)
    },
    [onSessionContextMenu]
  )

  const onTabKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (sessions.length === 0) {
        return
      }
      const current = sessions.findIndex(
        session => session.id === event.currentTarget.dataset.sessionId
      )
      if (current < 0) {
        return
      }

      let next: number | null = null
      switch (event.key) {
        case 'ArrowLeft':
          next = (current - 1 + sessions.length) % sessions.length
          break
        case 'ArrowRight':
          next = (current + 1) % sessions.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = sessions.length - 1
          break
        case 'Delete':
          if (onCloseSession !== undefined) {
            event.preventDefault()
            onCloseSession(sessions[current].id)
          }
          return
        default:
          return
      }

      event.preventDefault()
      onSelectSession(sessions[next].id)
      const node = tablistRef.current?.children.item(next)
      if (node instanceof HTMLElement) {
        node.focus()
      }
    },
    [sessions, onSelectSession, onCloseSession]
  )

  const runCommand = React.useCallback(() => {
    if (activeSession === null) {
      return
    }
    if (activeSession.status === 'running') {
      // This shell takes one command at a time, so the second press would be
      // dropped by the host without a word. Saying so is what stops Run
      // reading as broken while a long fetch is in flight — and the typed
      // command is left in the box rather than thrown away.
      setRunNotice('busy')
      notify(t('md3.terminal.alreadyRunning'))
      return
    }
    const command = input.trim()
    if (command.length === 0) {
      // The contract runs nothing here and says so; silence would read as a
      // dead button.
      setRunNotice('empty')
      notify(t('md3.terminal.nothingToRun'))
      return
    }
    setRunNotice(null)
    setHistory(previous =>
      previous[previous.length - 1] === command
        ? previous
        : [...previous, command]
    )
    setHistoryIndex(null)
    pinnedToBottom.current = true
    onRunCommand(activeSession.id, command)
  }, [activeSession, input, onRunCommand])

  const onInputTextChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRunNotice(null)
      setHistoryIndex(null)
      onInputChange(event.currentTarget.value)
    },
    [onInputChange]
  )

  const onInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (activeSession === null) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        runCommand()
        return
      }

      if (event.key === 'Tab' && onCompleteInput !== undefined) {
        const completed = onCompleteInput(activeSession.id, input)
        if (completed !== input) {
          event.preventDefault()
          onInputChange(completed)
        }
        return
      }

      if (
        (event.key === 'c' && event.ctrlKey) ||
        (event.key === 'Escape' && activeSession.status === 'running')
      ) {
        if (onCancelCommand !== undefined) {
          event.preventDefault()
          onCancelCommand(activeSession.id)
        }
        return
      }

      if (event.key === 'ArrowUp' && history.length > 0) {
        event.preventDefault()
        const next =
          historyIndex === null
            ? history.length - 1
            : Math.max(0, historyIndex - 1)
        setHistoryIndex(next)
        onInputChange(history[next])
        return
      }

      if (event.key === 'ArrowDown' && historyIndex !== null) {
        event.preventDefault()
        const next = historyIndex + 1
        if (next >= history.length) {
          setHistoryIndex(null)
          onInputChange('')
        } else {
          setHistoryIndex(next)
          onInputChange(history[next])
        }
      }
    },
    [
      activeSession,
      history,
      historyIndex,
      input,
      onCancelCommand,
      onCompleteInput,
      onInputChange,
      runCommand,
    ]
  )

  const onCloseActive = React.useCallback(() => {
    if (activeSession !== null) {
      onCloseSession?.(activeSession.id)
    }
  }, [activeSession, onCloseSession])

  const onRestartActive = React.useCallback(() => {
    if (activeSession !== null) {
      onRestartSession?.(activeSession.id)
    }
  }, [activeSession, onRestartSession])

  const onCancelActive = React.useCallback(() => {
    if (activeSession !== null) {
      onCancelCommand?.(activeSession.id)
    }
  }, [activeSession, onCancelCommand])

  // ---------------------------------------------------------------------
  // Bulk selection over the shells
  // ---------------------------------------------------------------------

  /*
   * The bulk selection is the view's own and is kept apart from
   * `activeSessionId` — that one decides which scrollback is on screen, and a
   * bulk selection of four shells has no single answer to that. Keeping them
   * separate is what lets a user tick four shells without the output pane
   * flicking through four sessions on the way.
   *
   * These are the shells the bulk bar acts on. The strip is not filtered: the
   * search field on this surface narrows the OUTPUT of the active shell, never
   * the shell list, so every open session is visible and `bulkFiltered` is
   * false. It is derived from the two lists rather than written as a literal
   * `false`, so the day this strip grows a filter the bar stops lying about its
   * own scope on its own.
   */
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const anchorIndex = React.useRef<number | null>(null)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [gateOpen, setGateOpen] = React.useState(false)
  const closeButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const exportButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const visibleSessionIds = React.useMemo(
    () => sessions.map(session => session.id),
    [sessions]
  )
  const bulkFiltered = visibleSessionIds.length < sessions.length

  // A shell that has been closed must leave the selection with it. A bulk stop
  // running against an id the strip no longer holds is the quiet way "stop 4"
  // stops 3 and still reports 4.
  React.useEffect(() => {
    setChecked(previous => {
      const next = new Set<string>()
      for (const id of visibleSessionIds) {
        if (previous.has(id)) {
          next.add(id)
        }
      }
      return next.size === previous.size ? previous : next
    })
  }, [visibleSessionIds])

  /*
   * These pills are selectable rows rather than checkboxes, so a Shift gesture
   * draws one range and that range IS the selection — `replace`, per
   * `Md3RangeMode`. A plain click is left alone entirely: it still switches
   * shells, which is what it has always done and what no bulk bar may take
   * away. Only Ctrl/Cmd-click and Shift-click reach the bulk selection.
   */
  const applySessionSelection = React.useCallback(
    (
      index: number,
      modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
    ) => {
      const intent = md3SelectionIntent(modifiers)
      if (intent === 'replace') {
        return false
      }
      setChecked(previous => {
        const result = md3ApplySelection(
          visibleSessionIds,
          previous,
          index,
          intent,
          anchorIndex.current,
          'replace'
        )
        if (intent !== 'range') {
          anchorIndex.current = result.anchor
        }
        return new Set(result.ids)
      })
      return true
    },
    [visibleSessionIds]
  )

  const onToggleSelectAll = React.useCallback(() => {
    setChecked(
      previous => new Set(md3ToggleSelectAll(visibleSessionIds, previous))
    )
    anchorIndex.current = null
  }, [visibleSessionIds])

  const onInvertSelection = React.useCallback(() => {
    setChecked(
      previous => new Set(md3InvertSelection(visibleSessionIds, previous))
    )
    anchorIndex.current = null
  }, [visibleSessionIds])

  const onClearSelection = React.useCallback(() => {
    setChecked(new Set<string>())
    anchorIndex.current = null
  }, [])

  /** What a bulk verb runs over: the ticked shells, or every open shell. */
  const scopeSessions = React.useMemo(
    () => md3BulkScope(sessions, checked, session => session.id),
    [sessions, checked]
  )

  const scopeLabel = md3BulkScopeLabel(
    checked.size,
    visibleSessionIds.length,
    bulkFiltered
  )

  /*
   * Stop and Restart are the two verbs whose eligibility is a real property of
   * the shell rather than a preference, so each carries its reason with it: the
   * button's count, the toast afterwards and the gate's preview all describe
   * the same set rather than the preview promising more than the action does.
   */
  const cancellable = React.useMemo(
    () =>
      md3PartitionBulk(
        scopeSessions,
        md3TerminalCanCancel,
        t('md3.terminal.bulkSkipNotRunning')
      ),
    [scopeSessions]
  )

  const restartable = React.useMemo(
    () =>
      md3PartitionBulk(
        scopeSessions,
        md3TerminalCanRestart,
        t('md3.terminal.bulkSkipHealthy')
      ),
    [scopeSessions]
  )

  const onBulkCancel = React.useCallback(() => {
    if (onCancelCommand === undefined) {
      return
    }
    for (const session of cancellable.applied) {
      onCancelCommand(session.id)
    }
    const skipped = md3BulkPartitionSummary(cancellable)
    if (skipped !== null) {
      notify(skipped, { kind: 'warning' })
    }
  }, [onCancelCommand, cancellable])

  const onBulkRestart = React.useCallback(() => {
    if (onRestartSession === undefined) {
      return
    }
    for (const session of restartable.applied) {
      onRestartSession(session.id)
    }
    const skipped = md3BulkPartitionSummary(restartable)
    if (skipped !== null) {
      notify(skipped, { kind: 'warning' })
    }
  }, [onRestartSession, restartable])

  const onRequestBulkClose = React.useCallback(() => setGateOpen(true), [])

  const onConfirmBulkClose = React.useCallback(() => {
    setGateOpen(false)
    if (onCloseSession === undefined) {
      return
    }
    for (const session of scopeSessions) {
      onCloseSession(session.id)
    }
    onClearSelection()
  }, [onCloseSession, scopeSessions, onClearSelection])

  const runExport = React.useCallback(
    (format: Md3ListExportFormat) => {
      if (onExportSessions === undefined) {
        return
      }
      const payload = serializeMd3ListExport(
        scopeSessions.map(md3TerminalExportRecord),
        {
          columns: Md3TerminalExportColumns,
          collectionName: 'sessions',
          recordName: 'session',
          title: 'Terminal sessions',
          baseName: 'terminal-sessions',
        },
        format,
        { scope: scopeLabel }
      )
      setExportOpen(false)
      onExportSessions(payload, scopeSessions)
      notify(
        payload.loss === null
          ? t('md3.bulk.toast.exported', {
              count: String(payload.count),
              format: payload.format.toUpperCase(),
            })
          : t('md3.bulk.toast.exportedLossy', {
              count: String(payload.count),
              format: payload.format.toUpperCase(),
              loss: payload.loss,
            })
      )
    },
    [onExportSessions, scopeSessions, scopeLabel]
  )

  const exportMenuSpec = React.useMemo(
    () =>
      md3BulkExportMenuSpec(Md3TerminalExportColumns, scopeLabel, runExport),
    [scopeLabel, runExport]
  )

  const bulkActions = React.useMemo((): ReadonlyArray<IMd3BulkAction> => {
    const actions: Array<IMd3BulkAction> = []
    if (onCancelCommand !== undefined) {
      actions.push({
        id: 'stop',
        label: t('md3.terminal.stop'),
        icon: 'block',
        disabled: cancellable.applied.length === 0,
        onClick: onBulkCancel,
      })
    }
    if (onRestartSession !== undefined) {
      actions.push({
        id: 'restart',
        label: t('md3.terminal.bulkRestart'),
        icon: 'restart_alt',
        disabled: restartable.applied.length === 0,
        onClick: onBulkRestart,
      })
    }
    if (onCloseSession !== undefined) {
      actions.push({
        id: 'close',
        label: t('md3.terminal.bulkClose'),
        icon: 'delete_sweep',
        destructive: true,
        hasPopup: 'dialog',
        buttonRef: closeButtonRef,
        disabled: scopeSessions.length === 0,
        onClick: onRequestBulkClose,
      })
    }
    return actions
  }, [
    onCancelCommand,
    onRestartSession,
    onCloseSession,
    cancellable,
    restartable,
    scopeSessions,
    onBulkCancel,
    onBulkRestart,
    onRequestBulkClose,
    closeButtonRef,
  ])

  /**
   * The pill's pointer route into the bulk selection.
   *
   * Ctrl/Cmd-click ticks this shell and Shift-click draws a range; a plain
   * click falls through and switches shells exactly as it always has.
   */
  const onTabClickWithSelection = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const index = visibleSessionIds.indexOf(
        event.currentTarget.dataset.sessionId ?? ''
      )
      if (index !== -1 && applySessionSelection(index, event)) {
        event.preventDefault()
        return
      }
      onTabClick(event)
    },
    [visibleSessionIds, applySessionSelection, onTabClick]
  )

  /**
   * And the keyboard equivalent: Ctrl+Space ticks the focused pill,
   * Ctrl+Shift+Space extends the range. Plain Space still activates the tab,
   * because that is how a tab has always been operated.
   */
  const onTabKeyDownWithSelection = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
        const index = visibleSessionIds.indexOf(
          event.currentTarget.dataset.sessionId ?? ''
        )
        if (index !== -1 && applySessionSelection(index, event)) {
          event.preventDefault()
          return
        }
      }
      onTabKeyDown(event)
    },
    [visibleSessionIds, applySessionSelection, onTabKeyDown]
  )

  const renderBulkBar = () => (
    <Md3BulkBar
      listId="terminal"
      label={t('md3.terminal.bulkLabel')}
      visibleIds={visibleSessionIds}
      selected={checked}
      filtered={bulkFiltered}
      scopeLabel={scopeLabel}
      actions={bulkActions}
      onToggleSelectAll={onToggleSelectAll}
      onInvertSelection={onInvertSelection}
      onClearSelection={onClearSelection}
      onExport={onExportSessions === undefined ? undefined : runExport}
      exportColumns={Md3TerminalExportColumns}
      onOpenExport={
        onExportSessions === undefined ? undefined : () => setExportOpen(true)
      }
      exportButtonRef={exportButtonRef}
    />
  )

  const renderTabStrip = () => (
    <div className="md3-terminal__tab-strip">
      <div
        ref={tablistRef}
        className="md3-terminal__tablist"
        role="tablist"
        aria-label={t('md3.terminal.shells')}
      >
        {sessions.map(session => {
          const selected = session.id === activeSession?.id
          const ticked = checked.has(session.id)
          return (
            <button
              key={session.id}
              id={tabId(session.id)}
              type="button"
              role="tab"
              className={classNames('md3-terminal__tab', {
                'md3-terminal__tab--active': selected,
                'md3-terminal__tab--ticked': ticked,
              })}
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              data-session-id={session.id}
              data-status={session.status}
              data-bulk-selected={ticked}
              onClick={onTabClickWithSelection}
              onKeyDown={onTabKeyDownWithSelection}
              onContextMenu={
                onSessionContextMenu === undefined
                  ? undefined
                  : onTabContextMenu
              }
            >
              <MaterialSymbol name="terminal" size={TabGlyphSize} />
              <span className="md3-terminal__tab-label">{session.label}</span>
              {/* The contract's pill is a glyph and a label. The state still
                  has to reach a screen reader, so it rides along unseen. */}
              <span className="sr-only">{statusLabel(session.status)}</span>
              {/* `aria-selected` on a tab already means "this is the shell on
                  screen", so bulk membership cannot borrow it and has to be
                  said in words instead. */}
              {ticked ? (
                <span className="sr-only">
                  {t('md3.terminal.bulkSelected')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <Md3IconButton
        small={true}
        icon="add"
        label={t('md3.terminal.newShell')}
        disabled={!canCreateSession}
        tooltip={
          canCreateSession
            ? t('md3.terminal.newShell')
            : t('md3.terminal.noRepository')
        }
        onClick={onCreateSession}
      />
      {onCloseSession === undefined || activeSession === null ? null : (
        <Md3IconButton
          small={true}
          icon="close"
          label={t('md3.terminal.closeShell', { shell: activeSession.label })}
          onClick={onCloseActive}
        />
      )}
    </div>
  )

  const renderBanner = (session: IMd3TerminalSession) => {
    if (session.status === 'ready') {
      return null
    }
    const canRestart =
      onRestartSession !== undefined &&
      (session.status === 'exited' || session.status === 'error')
    const canCancel =
      onCancelCommand !== undefined && session.status === 'running'

    return (
      <div
        className="md3-terminal__banner"
        data-status={session.status}
        role="status"
      >
        <MaterialSymbol
          name={session.status === 'error' ? 'error' : 'schedule'}
          size={BannerGlyphSize}
        />
        <span className="md3-terminal__banner-text">
          {session.statusDetail ?? statusLabel(session.status)}
        </span>
        {canCancel ? (
          <Md3TonalButton
            icon="block"
            label={t('md3.terminal.stop')}
            accessibleName={t('md3.terminal.stopName', {
              shell: session.label,
            })}
            onClick={onCancelActive}
          />
        ) : null}
        {canRestart ? (
          <Md3TonalButton
            icon="restart_alt"
            label={t('md3.terminal.restart')}
            accessibleName={t('md3.terminal.restartName', {
              shell: session.label,
            })}
            onClick={onRestartActive}
          />
        ) : null}
      </div>
    )
  }

  const renderOutput = (session: IMd3TerminalSession) => (
    <div
      ref={outputRef}
      id={outputId}
      className="md3-terminal__output"
      role="log"
      aria-label={t('md3.terminal.output', { shell: session.label })}
      // Terminal output is a keyboard-scrollable log; without this the
      // scrollback is unreachable without a pointer.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onScroll={onOutputScroll}
      onContextMenu={props.onContextMenu}
    >
      {hiddenCount > 0 ? (
        <p className="md3-terminal__truncation">
          {t('md3.terminal.truncated', {
            shown: String(rendered.length),
            total: String(filtered.length),
          })}
        </p>
      ) : null}
      {rendered.map(line => (
        <div
          key={line.id}
          className={classNames(
            'md3-terminal__line',
            `md3-terminal__line--${line.kind}`
          )}
        >
          <span className="md3-terminal__line-text">{line.text}</span>
        </div>
      ))}
      {rendered.length === 0 ? (
        <Md3EmptyState
          className="md3-terminal__empty-output"
          icon={queryActive ? 'search_off' : 'terminal'}
          message={
            queryActive
              ? t('md3.terminal.noMatches')
              : t('md3.terminal.noOutput')
          }
          actionLabel={t('md3.terminal.clearSearch')}
          onAction={queryActive ? search.onClear : undefined}
        />
      ) : null}
    </div>
  )

  const renderInputRow = (session: IMd3TerminalSession) => (
    <div className="md3-terminal__input-row">
      <span ref={promptRef} className="md3-terminal__prompt" aria-hidden="true">
        {session.prompt}
      </span>
      {session.workingDirectory === undefined ? null : (
        // The prompt is abbreviated, so the full directory has to be
        // recoverable without leaving the row.
        <Tooltip target={promptRef} applyAriaDescribedBy={false}>
          {session.workingDirectory}
        </Tooltip>
      )}
      <input
        id={inputId}
        type="text"
        className="md3-terminal__input"
        placeholder={t('md3.terminal.inputPlaceholder')}
        aria-label={t('md3.terminal.inputLabel', {
          shell: session.label,
          // The unabbreviated directory, when it is known: a screen-reader user
          // gets no benefit from an ellipsis standing in for the path a
          // command is about to run in.
          prompt: session.workingDirectory ?? session.prompt,
        })}
        aria-describedby={runNotice === null ? undefined : `${inputId}-hint`}
        value={input}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        onChange={onInputTextChange}
        onKeyDown={onInputKeyDown}
      />
      <Md3TonalButton
        icon="keyboard_return"
        label={t('md3.terminal.run')}
        accessibleName={t('md3.terminal.runName', { shell: session.label })}
        onClick={runCommand}
      />
    </div>
  )

  return (
    <div className={classNames('md3-terminal', 'md3-anim-up', props.className)}>
      <section
        className="md3-terminal__pane"
        aria-label={t('md3.terminal.region')}
      >
        {renderTabStrip()}
        {sessions.length === 0 ? null : renderBulkBar()}
        {activeSession === null ? (
          <Md3EmptyState
            className="md3-terminal__empty"
            icon="terminal"
            message={
              canCreateSession
                ? tFunny('md3.terminal.noSessions')
                : t('md3.terminal.noRepository')
            }
            actionLabel={t('md3.terminal.openShell')}
            onAction={canCreateSession ? onCreateSession : undefined}
          />
        ) : (
          <div
            id={panelId}
            className="md3-terminal__panel"
            role="tabpanel"
            aria-labelledby={tabId(activeSession.id)}
          >
            <Md3SearchField
              id={`md3-terminal-${instanceId}-search`}
              searchSurfaceId="md3-terminal"
              className="md3-terminal__search"
              value={search.value}
              placeholder={t('md3.terminal.searchPlaceholder')}
              fieldLabel={t('md3.terminal.searchField')}
              regexEnabled={search.regexEnabled}
              matchCount={filtered.length}
              onChange={search.onChange}
              onClear={search.onClear}
              onToggleRegex={search.onToggleRegex}
              onOpenBuilder={search.onOpenBuilder}
              onContextMenu={props.onContextMenu}
            />
            {renderOutput(activeSession)}
            {renderBanner(activeSession)}
            {renderInputRow(activeSession)}
            {runNotice === null ? null : (
              <p
                id={`${inputId}-hint`}
                className="md3-terminal__hint"
                role="status"
              >
                {runNotice === 'busy'
                  ? t('md3.terminal.alreadyRunning')
                  : t('md3.terminal.nothingToRun')}
              </p>
            )}
          </div>
        )}
      </section>

      {exportOpen ? (
        <Md3MenuOverlay
          spec={exportMenuSpec}
          onDismiss={() => setExportOpen(false)}
          onOpenRegexBuilder={search.onOpenBuilder}
          returnFocusTo={exportButtonRef}
        />
      ) : null}

      {gateOpen ? (
        <Md3DestructiveGate
          actionId="terminal-bulk-close"
          icon="delete_sweep"
          title={t('md3.terminal.gate.title', {
            count: String(scopeSessions.length),
          })}
          summary={t('md3.terminal.gate.summary', {
            count: String(scopeSessions.length),
            scope: scopeLabel,
          })}
          /*
           * "Close 4 shells" is a number, and a number is not something a
           * person can check. The labels are — and a shell in the list with a
           * build running in it is exactly the one a reader spots here and
           * nowhere else.
           */
          preview={scopeSessions.map(session => session.label)}
          irreversible={t('md3.terminal.gate.irreversible')}
          targetKeyLabel={t('md3.terminal.gate.keyTarget', {
            count: String(scopeSessions.length),
            scope: scopeLabel,
          })}
          effectKeyLabel={t('md3.terminal.gate.keyEffect')}
          confirmLabel={t('md3.terminal.gate.confirm', {
            count: String(scopeSessions.length),
          })}
          anchorTo={closeButtonRef}
          onConfirm={onConfirmBulkClose}
          onDismissed={() => setGateOpen(false)}
        />
      ) : null}
    </div>
  )
}
