import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import {
  MaxRegexInputLength,
  MaxRegexTotalInputLength,
  compileSafeRegex,
} from '../../lib/safe-regex'
import { MaterialSymbol } from '../lib/material-symbol'
import {
  Md3EmptyState,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
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
   */
  readonly prompt: string

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

  readonly className?: string
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
  } = props

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
  const [emptyRunReported, setEmptyRunReported] = React.useState(false)

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
    const command = input.trim()
    if (command.length === 0) {
      // The contract runs nothing here and says so; silence would read as a
      // dead button.
      setEmptyRunReported(true)
      notify(t('md3.terminal.nothingToRun'))
      return
    }
    setEmptyRunReported(false)
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
      setEmptyRunReported(false)
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
          return (
            <button
              key={session.id}
              id={tabId(session.id)}
              type="button"
              role="tab"
              className={classNames('md3-terminal__tab', {
                'md3-terminal__tab--active': selected,
              })}
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              data-session-id={session.id}
              data-status={session.status}
              onClick={onTabClick}
              onKeyDown={onTabKeyDown}
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
            </button>
          )
        })}
      </div>
      <Md3IconButton
        small={true}
        icon="add"
        label={t('md3.terminal.newShell')}
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
      <span className="md3-terminal__prompt" aria-hidden="true">
        {session.prompt}
      </span>
      <input
        id={inputId}
        type="text"
        className="md3-terminal__input"
        placeholder={t('md3.terminal.inputPlaceholder')}
        aria-label={t('md3.terminal.inputLabel', {
          shell: session.label,
          prompt: session.prompt,
        })}
        aria-describedby={emptyRunReported ? `${inputId}-hint` : undefined}
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
        {activeSession === null ? (
          <Md3EmptyState
            className="md3-terminal__empty"
            icon="terminal"
            message={t('md3.terminal.noSessions')}
            actionLabel={t('md3.terminal.openShell')}
            onAction={onCreateSession}
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
            {emptyRunReported ? (
              <p
                id={`${inputId}-hint`}
                className="md3-terminal__hint"
                role="status"
              >
                {t('md3.terminal.nothingToRun')}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
