import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { formatRelative } from '../../lib/format-relative'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
import { statusTone } from './md3-style-contract'
import {
  IMd3MenuContext,
  IMd3MenuHandlers,
  Md3MenuPermission,
  defaultMd3MenuContext,
  getMenuSpec,
} from './md3-menu-specs'
import { Md3MenuOverlay } from './md3-menu-overlay'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import { notify } from './md3-toast'

/**
 * The Agents destination of the MD3 shell design contract
 * (`design/History MD3.dc.html`, the `isAgents` branch): a 320px session list
 * on the left and the selected session's conversation on the right.
 *
 * Every measurement lives in `app/styles/ui/_md3-agents.scss`; the contract's
 * inline `style` strings are not reproduced here, so a value that appears in
 * two views resolves to the same pixel in both.
 *
 * This component owns no application state and imports no store. Sessions,
 * their live conversation and every action arrive as props, so the same view
 * renders real worktree sessions in the app and fixture data in a test without
 * either knowing about the other.
 *
 * Three honest extensions to the prototype, none of which changes its shape:
 *
 *  - **`error` and `idle` are real session states.** The prototype only draws
 *    Running / Done / Paused; a worktree whose agent failed, and one that has
 *    never been started, both exist in this application and would otherwise be
 *    rendered as something they are not.
 *  - **The row's meta line names the branch** when the session has one. It is
 *    the fact the previous fleet card led with, and losing it would make two
 *    worktrees of the same name indistinguishable.
 *  - **Locked, missing and main-worktree badges survive** from the fleet card,
 *    as a badge group before the state pill.
 */

/** How a session is doing right now. */
export type Md3AgentSessionState =
  | 'running'
  | 'done'
  | 'paused'
  | 'error'
  | 'idle'

/** Who produced one turn of the conversation. */
export type Md3AgentTurnRole = 'user' | 'agent' | 'error' | 'meta'

/** Which permission the agent-access menu was asked to change. */
export type Md3AgentAccessTopic = 'read' | 'commit' | 'push'

/** One turn in a session's transcript. */
export interface IMd3AgentTurn {
  /** Unique within the conversation. */
  readonly id: string

  readonly role: Md3AgentTurnRole

  /** The turn's text, already stripped of control characters by the host. */
  readonly text: string
}

/** The selected session's live transcript. */
export interface IMd3AgentConversation {
  /** The session this transcript belongs to, so a stale one is never shown. */
  readonly sessionId: string

  readonly turns: ReadonlyArray<IMd3AgentTurn>

  /**
   * The already-localized live status the host wants shown beside the header —
   * "running", "exited", "failed". Owned by the caller because it is copy
   * about the run rather than about this view.
   */
  readonly statusLabel: string | null
}

/** One agent session — in this application, one worktree. */
export interface IMd3AgentSession {
  /** Stable key. The worktree's canonical path in the real application. */
  readonly id: string

  /** Display name — the worktree directory's base name. */
  readonly name: string

  /** Absolute path, shown as the row's hover hint. */
  readonly path: string

  /** The agent's display name — "Codex CLI", "OpenCode". */
  readonly agentName: string

  readonly state: Md3AgentSessionState

  /** Short branch name, or `null` when HEAD is detached. */
  readonly branch: string | null

  /** Epoch milliseconds the run started, or `null` when it never has. */
  readonly startedAt: number | null

  /** The model the run reported, or `null` when it reported none. */
  readonly model: string | null

  readonly turnCount: number

  /** How long the run has been going, or `null` when it has not started. */
  readonly elapsedMs: number | null

  /**
   * The already-localized permission summary the contract's detail line ends
   * with — "read + stage permissions". Owned by the caller: it describes the
   * agent's granted access, which this view never decides.
   */
  readonly permissionsSummary: string

  readonly isMainWorktree: boolean

  readonly isLocked: boolean

  /** True when git still has a record but the directory is gone. */
  readonly isMissing: boolean

  /** Present only when `state` is `error`. */
  readonly errorMessage: string | null

  /** True when the header's Pause action applies to this session. */
  readonly canPause: boolean

  /** True when the header's Resume action applies to this session. */
  readonly canResume: boolean

  /** True when this session can accept a typed instruction right now. */
  readonly canSendInstruction: boolean

  /**
   * Why it cannot, already localized. Shown beside the disabled composer, so
   * a person is never left guessing at a control that looks live and is not.
   */
  readonly sendUnavailableReason: string | null
}

export interface IMd3AgentsViewProps {
  readonly sessions: ReadonlyArray<IMd3AgentSession>

  /** The selected session's id, or `null` when nothing is selected. */
  readonly selectedSessionId: string | null

  /** The selected session's transcript, or `null` when there is none yet. */
  readonly conversation: IMd3AgentConversation | null

  readonly agentReadAccess: Md3MenuPermission

  readonly agentCommitAccess: Md3MenuPermission

  readonly agentPushAccess: Md3MenuPermission

  readonly onSelectSession: (sessionId: string) => void

  /** Opens the host's new-session dialog — the form, agent picker and the
   * setup-commands editor all live behind it. */
  readonly onNewSession: () => void

  readonly onPauseSession: (sessionId: string) => void

  readonly onResumeSession: (sessionId: string) => void

  readonly onSendInstruction: (sessionId: string, instruction: string) => void

  readonly onOpenSessionLog: (sessionId: string) => void

  readonly onDuplicateSession: (sessionId: string) => void

  readonly onDeleteSession: (sessionId: string) => void

  readonly onConfigureAgentAccess: (topic: Md3AgentAccessTopic) => void
}

/** The state glyph, per the contract's `agentRows` mapping. */
const StateIcons: Readonly<Record<Md3AgentSessionState, MaterialSymbolName>> = {
  running: 'progress_activity',
  done: 'check_circle',
  paused: 'pause_circle',
  error: 'error',
  idle: 'pause_circle',
}

/**
 * The contract's `statusTone()` key for each state: running is primary, done
 * is green, paused and idle are the quiet surface tone, and an error is the
 * error tone.
 */
const StateToneKeys: Readonly<Record<Md3AgentSessionState, string>> = {
  running: 'running',
  done: 'success',
  paused: 'cancelled',
  error: 'failed',
  idle: 'cancelled',
}

const StateLabelKeys = {
  running: 'md3.agents.state.running',
  done: 'md3.agents.state.done',
  paused: 'md3.agents.state.paused',
  error: 'md3.agents.state.error',
  idle: 'md3.agents.state.idle',
} as const

/** The glyph size of the row's leading state icon. */
const RowIconSize = 17

/** The `smart_toy` glyph in the conversation header. */
const HeaderIconSize = 17

/** How close to the bottom counts as "following" the transcript, in pixels. */
const FollowThreshold = 48

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** The contract's `2m 41s` / `48s` elapsed label. */
export function formatMd3AgentElapsed(elapsedMs: number): string {
  const total = Math.max(0, Math.round(elapsedMs / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  if (hours > 0) {
    return t('md3.agents.elapsed.hours', {
      hours: String(hours),
      minutes: pad(minutes),
    })
  }
  if (minutes > 0) {
    return t('md3.agents.elapsed.minutes', {
      minutes: String(minutes),
      seconds: pad(seconds),
    })
  }
  return t('md3.agents.elapsed.seconds', { seconds: String(seconds) })
}

/**
 * The contract's `<agent> · started 3m ago`, with the branch folded in when
 * the session has one.
 */
export function formatMd3AgentMeta(
  session: IMd3AgentSession,
  now: number
): string {
  const started =
    session.startedAt === null ? null : formatRelative(session.startedAt - now)

  if (session.branch === null) {
    return started === null
      ? t('md3.agents.meta.notStarted', { agent: session.agentName })
      : t('md3.agents.meta.started', {
          agent: session.agentName,
          time: started,
        })
  }

  return started === null
    ? t('md3.agents.meta.branchNotStarted', {
        agent: session.agentName,
        branch: session.branch,
      })
    : t('md3.agents.meta.branchStarted', {
        agent: session.agentName,
        branch: session.branch,
        time: started,
      })
}

/**
 * The contract's `model gpt-5 · 12 turns · 2m 41s · read + stage permissions`.
 *
 * A part the host has no value for is dropped rather than printed as
 * `undefined`; the permissions summary is always present because a session
 * always runs under some access, even if that access is "none".
 */
export function formatMd3AgentDetail(session: IMd3AgentSession): string {
  const parts: Array<string> = []

  parts.push(
    session.model === null
      ? t('md3.agents.detail.noModel')
      : t('md3.agents.detail.model', { model: session.model })
  )
  parts.push(
    session.turnCount === 1
      ? t('md3.agents.detail.oneTurn')
      : t('md3.agents.detail.turns', { count: String(session.turnCount) })
  )
  if (session.elapsedMs !== null) {
    parts.push(formatMd3AgentElapsed(session.elapsedMs))
  }
  parts.push(session.permissionsSummary)

  return parts.join(' · ')
}

/**
 * The contract's `matcher(key)`: a case-insensitive substring test, or a
 * case-insensitive regular expression when regex mode is on. A pattern that
 * does not compile matches everything, exactly as the contract's `catch` does,
 * so the list stays whole while somebody is halfway through typing `(foo`.
 */
export function md3AgentSessionMatcher(
  query: string,
  regexEnabled: boolean
): (session: IMd3AgentSession) => boolean {
  const raw = query.trim()
  if (raw.length === 0) {
    return () => true
  }

  const fields = (session: IMd3AgentSession) => [
    session.name,
    session.agentName,
    session.branch ?? '',
    session.path,
  ]

  if (regexEnabled) {
    let expression: RegExp
    try {
      expression = new RegExp(raw, 'i')
    } catch {
      return () => true
    }
    return session => fields(session).some(field => expression.test(field))
  }

  const needle = raw.toLowerCase()
  return session =>
    fields(session).some(field => field.toLowerCase().includes(needle))
}

interface IOpenMenu {
  readonly kind: 'agentRowMenu' | 'agentAccess'

  /** The session the menu acts on, or `null` for the plain access menu. */
  readonly sessionId: string | null

  /**
   * Which control opened it, so focus goes back to that control on close.
   *
   * `row` means a right-click or the context-menu key on a list row; the
   * overlay's own default — restore whatever held focus when it mounted — is
   * correct there, and naming a button instead would move focus out of the
   * list the reader was in.
   */
  readonly source: 'access' | 'more' | 'row'
}

export function Md3AgentsView(props: IMd3AgentsViewProps) {
  const {
    sessions,
    selectedSessionId,
    conversation,
    onSelectSession,
    onNewSession,
    onPauseSession,
    onResumeSession,
    onSendInstruction,
    onOpenSessionLog,
    onDuplicateSession,
    onDeleteSession,
    onConfigureAgentAccess,
  } = props

  const [query, setQuery] = React.useState('')
  const [regexEnabled, setRegexEnabled] = React.useState(false)
  const [builderPattern, setBuilderPattern] = React.useState<string | null>(
    null
  )
  const [menu, setMenu] = React.useState<IOpenMenu | null>(null)
  const [draft, setDraft] = React.useState('')
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null
  )

  const rowRefs = React.useRef(new Map<string, HTMLDivElement>())
  const logRef = React.useRef<HTMLDivElement | null>(null)
  const shouldFollow = React.useRef(true)
  const moreButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const accessButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const visible = React.useMemo(() => {
    const matches = md3AgentSessionMatcher(query, regexEnabled)
    return sessions.filter(matches)
  }, [sessions, query, regexEnabled])

  const selected =
    sessions.find(session => session.id === selectedSessionId) ?? null

  // Roving tab stop: whatever the arrows last landed on, else the selection,
  // else the first visible row. A stale id (its session filtered away) falls
  // through rather than leaving the list with no tab stop at all.
  const tabbableId =
    [activeSessionId, selectedSessionId].find(
      candidate =>
        candidate !== null && visible.some(session => session.id === candidate)
    ) ?? (visible.length === 0 ? null : visible[0].id)

  // A different session means a different composer; carrying a half-typed
  // instruction across would send it to the wrong agent.
  const lastSelection = React.useRef(selectedSessionId)
  React.useEffect(() => {
    if (lastSelection.current !== selectedSessionId) {
      lastSelection.current = selectedSessionId
      setDraft('')
      shouldFollow.current = true
    }
  }, [selectedSessionId])

  const turns = React.useMemo(() => {
    if (
      conversation === null ||
      selected === null ||
      conversation.sessionId !== selected.id
    ) {
      return []
    }
    return conversation.turns
  }, [conversation, selected])

  // Follow the transcript only while the reader is already at the bottom, so a
  // new agent turn never yanks somebody out of the line they were reading.
  React.useEffect(() => {
    const log = logRef.current
    if (log === null || !shouldFollow.current) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [turns.length])

  const onLogScroll = React.useCallback(() => {
    const log = logRef.current
    if (log === null) {
      return
    }
    const distance = log.scrollHeight - log.scrollTop - log.clientHeight
    shouldFollow.current = distance <= FollowThreshold
  }, [])

  const setRowRef = React.useCallback(
    (id: string, element: HTMLDivElement | null) => {
      if (element === null) {
        rowRefs.current.delete(id)
      } else {
        rowRefs.current.set(id, element)
      }
    },
    []
  )

  const focusRow = React.useCallback(
    (index: number) => {
      if (visible.length === 0) {
        return
      }
      const clamped = Math.min(Math.max(index, 0), visible.length - 1)
      const id = visible[clamped].id
      setActiveSessionId(id)
      rowRefs.current.get(id)?.focus()
    },
    [visible]
  )

  const openRowMenu = React.useCallback((sessionId: string) => {
    setMenu({ kind: 'agentRowMenu', sessionId, source: 'row' })
  }, [])

  const onRowKeyDown = React.useCallback(
    (session: IMd3AgentSession, event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = visible.findIndex(candidate => candidate.id === session.id)
      if (index === -1) {
        return
      }

      switch (event.key) {
        case 'ArrowDown':
          focusRow(index + 1)
          break
        case 'ArrowUp':
          focusRow(index - 1)
          break
        case 'Home':
          focusRow(0)
          break
        case 'End':
          focusRow(visible.length - 1)
          break
        case 'Enter':
        case ' ':
          onSelectSession(session.id)
          break
        case 'ContextMenu':
          openRowMenu(session.id)
          break
        case 'F10':
          if (!event.shiftKey) {
            return
          }
          openRowMenu(session.id)
          break
        default:
          return
      }

      // Only reached when a key was handled, so the list never swallows Tab or
      // a shortcut the surrounding shell owns.
      event.preventDefault()
    },
    [visible, focusRow, onSelectSession, openRowMenu]
  )

  const onSearchChange = React.useCallback((value: string) => {
    setQuery(value)
    setActiveSessionId(null)
  }, [])

  const onClearSearch = React.useCallback(() => {
    setQuery('')
    setActiveSessionId(null)
  }, [])

  const onToggleRegex = React.useCallback(() => {
    setRegexEnabled(current => !current)
  }, [])

  const onOpenBuilder = React.useCallback(() => {
    setBuilderPattern(query)
  }, [query])

  const onCloseBuilder = React.useCallback(() => setBuilderPattern(null), [])

  const onApplyBuiltPattern = React.useCallback(
    (application: IMd3RegexBuilderApplication) => {
      // Applying a pattern must also turn regex mode on, or the field would
      // search for the pattern's literal characters.
      setQuery(application.pattern)
      setRegexEnabled(true)
      setActiveSessionId(null)
    },
    []
  )

  const builderSamples = React.useMemo(
    () => visible.map(session => session.name),
    [visible]
  )

  const onOpenAccessMenu = React.useCallback(() => {
    setMenu({ kind: 'agentAccess', sessionId: null, source: 'access' })
  }, [])

  const onDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.currentTarget.value)
    },
    []
  )

  const onResetFilters = React.useCallback(() => {
    setQuery('')
    setRegexEnabled(false)
    setActiveSessionId(null)
  }, [])

  const onOpenSelectedMenu = React.useCallback(() => {
    if (selectedSessionId !== null) {
      setMenu({
        kind: 'agentRowMenu',
        sessionId: selectedSessionId,
        source: 'more',
      })
    }
  }, [selectedSessionId])

  const onTogglePause = React.useCallback(() => {
    if (selected === null) {
      return
    }
    if (selected.canPause) {
      onPauseSession(selected.id)
    } else {
      onResumeSession(selected.id)
    }
  }, [selected, onPauseSession, onResumeSession])

  const onSend = React.useCallback(() => {
    if (selected === null || !selected.canSendInstruction) {
      notify(t('md3.agents.nothingToSend'), { kind: 'warning' })
      return
    }
    const instruction = draft.trim()
    if (instruction.length === 0) {
      // The contract's `if (!this.state.agentInput.trim()) notify('Nothing to
      // send')` — an empty Send reports itself rather than silently no-opping.
      notify(t('md3.agents.nothingToSend'), { kind: 'warning' })
      return
    }
    shouldFollow.current = true
    setDraft('')
    onSendInstruction(selected.id, instruction)
  }, [selected, draft, onSendInstruction])

  const onInstructionKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        onSend()
      }
    },
    [onSend]
  )

  const closeMenu = React.useCallback(() => setMenu(null), [])

  const menuContext: IMd3MenuContext = React.useMemo(
    () => ({
      ...defaultMd3MenuContext,
      agentReadAccess: props.agentReadAccess,
      agentCommitAccess: props.agentCommitAccess,
      agentPushAccess: props.agentPushAccess,
    }),
    [props.agentReadAccess, props.agentCommitAccess, props.agentPushAccess]
  )

  const menuSessionId = menu?.sessionId ?? selectedSessionId
  const menuSource = menu?.source ?? 'row'

  const menuHandlers: IMd3MenuHandlers = React.useMemo(() => {
    const withSession = (run: (sessionId: string) => void) => () => {
      if (menuSessionId !== null) {
        run(menuSessionId)
      }
      setMenu(null)
    }

    return {
      onCommand: command => {
        switch (command) {
          case 'resumeAgentSession':
            withSession(onResumeSession)()
            return
          case 'pauseAgentSession':
            withSession(onPauseSession)()
            return
          case 'openAgentSessionLog':
            withSession(onOpenSessionLog)()
            return
          case 'duplicateAgentSession':
            withSession(onDuplicateSession)()
            return
          case 'deleteAgentSession':
            withSession(onDeleteSession)()
            return
          case 'configureAgentReadAccess':
            onConfigureAgentAccess('read')
            break
          case 'configureAgentCommitAccess':
            onConfigureAgentAccess('commit')
            break
          case 'configureAgentPushAccess':
            onConfigureAgentAccess('push')
            break
          default:
            break
        }
        setMenu(null)
      },
      onNavigate: () => setMenu(null),
      onToggle: () => setMenu(null),
      onSwitchRepository: () => setMenu(null),
      onSwitchBranch: () => setMenu(null),
      onSwitchAccount: () => setMenu(null),
      onOpenMenu: kind => {
        if (kind === 'agentAccess' || kind === 'agentRowMenu') {
          // Replacing one menu with another keeps the original opener, so
          // closing the second one still lands on the control that started it.
          setMenu({ kind, sessionId: menuSessionId, source: menuSource })
        } else {
          setMenu(null)
        }
      },
      onOpenRegexBuilder: pattern => {
        setMenu(null)
        setBuilderPattern(pattern)
      },
    }
  }, [
    menuSessionId,
    onResumeSession,
    onPauseSession,
    onOpenSessionLog,
    onDuplicateSession,
    onDeleteSession,
    onConfigureAgentAccess,
  ])

  const now = Date.now()
  const statusLabel =
    selected === null ||
    conversation === null ||
    conversation.sessionId !== selected.id
      ? null
      : conversation.statusLabel
  const pauseLabel =
    selected !== null && !selected.canPause
      ? t('md3.agents.resume')
      : t('md3.agents.pause')
  const pauseIcon: MaterialSymbolName =
    selected !== null && !selected.canPause ? 'play_arrow' : 'pause'

  return (
    <div className="md3-agents md3-anim-up">
      <section
        className="md3-agents__list-pane"
        aria-label={t('md3.agents.sessionsPane')}
      >
        <Md3SearchField
          id="md3-agents-search"
          value={query}
          placeholder={t('md3.agents.searchPlaceholder')}
          fieldLabel={t('md3.agents.searchFieldLabel')}
          regexEnabled={regexEnabled}
          onChange={onSearchChange}
          onClear={onClearSearch}
          onToggleRegex={onToggleRegex}
          onOpenBuilder={onOpenBuilder}
        />
        <Md3ChipRow label={t('md3.agents.actionsLabel')}>
          <Md3TonalButton
            icon="add"
            label={t('md3.agents.newSession')}
            hasPopup="dialog"
            onClick={onNewSession}
          />
          <Md3ChipRowSpacer />
          <Md3IconButton
            small={true}
            icon="shield"
            label={t('md3.agents.agentAccess')}
            hasPopup="menu"
            expanded={menu?.kind === 'agentAccess'}
            buttonRef={accessButtonRef}
            onClick={onOpenAccessMenu}
          />
        </Md3ChipRow>
        <div className="md3-agents__list">
          {visible.length === 0 ? (
            <Md3EmptyState
              message={
                sessions.length === 0
                  ? t('md3.agents.emptyNoSessions')
                  : t('md3.agents.emptyNoMatches')
              }
              onAction={sessions.length === 0 ? undefined : onResetFilters}
            />
          ) : (
            <div
              className="md3-agents__rows"
              role="listbox"
              aria-label={t('md3.agents.listLabel')}
            >
              {visible.map(session => (
                <Md3AgentSessionRow
                  key={session.id}
                  session={session}
                  now={now}
                  isSelected={session.id === selectedSessionId}
                  isTabbable={session.id === tabbableId}
                  onSelect={onSelectSession}
                  onKeyDown={onRowKeyDown}
                  onOpenMenu={openRowMenu}
                  onRef={setRowRef}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section
        className="md3-agents__detail-pane"
        aria-label={t('md3.agents.conversationPane')}
      >
        <div className="md3-agents__detail-header">
          <MaterialSymbol
            className="md3-agents__detail-icon"
            name="smart_toy"
            size={HeaderIconSize}
          />
          <span className="md3-agents__detail-name">
            {selected === null ? t('md3.agents.noSelection') : selected.name}
          </span>
          {statusLabel === null ? null : (
            <span className="md3-agents__detail-status">{statusLabel}</span>
          )}
          <Md3TonalButton
            icon={pauseIcon}
            label={pauseLabel}
            accessibleName={
              selected === null
                ? undefined
                : t(
                    pauseIcon === 'pause'
                      ? 'md3.agents.pauseAccessibleName'
                      : 'md3.agents.resumeAccessibleName',
                    { label: pauseLabel, name: selected.name }
                  )
            }
            disabled={
              selected === null || (!selected.canPause && !selected.canResume)
            }
            onClick={onTogglePause}
          />
          <Md3IconButton
            icon="more_vert"
            label={t('md3.agents.more')}
            hasPopup="menu"
            expanded={menu?.kind === 'agentRowMenu'}
            disabled={selected === null}
            buttonRef={moreButtonRef}
            onClick={onOpenSelectedMenu}
          />
        </div>

        <div
          ref={logRef}
          className="md3-agents__log"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label={
            selected === null
              ? t('md3.agents.conversationPane')
              : t('md3.agents.conversationLabel', { name: selected.name })
          }
          onScroll={onLogScroll}
        >
          {selected === null || turns.length === 0 ? (
            // Deliberately not `Md3EmptyState`: that carries `role="status"`,
            // and a live region nested inside this `role="log"` one would make
            // a screen reader announce the same sentence twice.
            <div className="md3-empty-state">
              <MaterialSymbol name="smart_toy" size={26} />
              <span className="md3-empty-state__message">
                {selected === null
                  ? t('md3.agents.noSelectionHint')
                  : t('md3.agents.noTurns')}
              </span>
            </div>
          ) : (
            turns.map(turn => (
              <article
                key={turn.id}
                className={classNames(
                  'md3-agents__turn',
                  `md3-agents__turn--${turn.role}`
                )}
              >
                <span className="md3-agents__role">
                  {turnRoleLabel(turn.role, selected.agentName)}
                </span>
                <span className="md3-agents__turn-text">{turn.text}</span>
              </article>
            ))
          )}
        </div>

        <div className="md3-agents__composer">
          <input
            id="md3-agents-instruction"
            type="text"
            className="md3-agents__input"
            placeholder={t('md3.agents.instructionPlaceholder')}
            aria-label={t('md3.agents.instructionPlaceholder')}
            aria-describedby={
              selected !== null &&
              !selected.canSendInstruction &&
              selected.sendUnavailableReason !== null
                ? 'md3-agents-send-hint'
                : undefined
            }
            value={draft}
            spellCheck={false}
            autoComplete="off"
            disabled={selected === null || !selected.canSendInstruction}
            onChange={onDraftChange}
            onKeyDown={onInstructionKeyDown}
          />
          <Md3TonalButton
            icon="send"
            label={t('md3.agents.send')}
            accessibleName={
              selected === null
                ? undefined
                : t('md3.agents.sendAccessibleName', {
                    label: t('md3.agents.send'),
                    name: selected.name,
                  })
            }
            disabled={selected === null || !selected.canSendInstruction}
            onClick={onSend}
          />
        </div>
        {selected !== null &&
        !selected.canSendInstruction &&
        selected.sendUnavailableReason !== null ? (
          <p className="md3-agents__send-hint" id="md3-agents-send-hint">
            {selected.sendUnavailableReason}
          </p>
        ) : null}
      </section>

      {menu === null ? null : (
        <Md3MenuOverlay
          spec={getMenuSpec(menu.kind, menuContext, menuHandlers)}
          onDismiss={closeMenu}
          onOpenRegexBuilder={setBuilderPattern}
          returnFocusTo={
            menu.source === 'access'
              ? accessButtonRef
              : menu.source === 'more'
              ? moreButtonRef
              : undefined
          }
        />
      )}

      {builderPattern === null ? null : (
        <Md3RegexBuilderDialog
          targetLabel={t('md3.agents.searchFieldLabel')}
          initialPattern={builderPattern}
          sampleItems={builderSamples}
          onApply={onApplyBuiltPattern}
          onDismissed={onCloseBuilder}
        />
      )}
    </div>
  )
}

function turnRoleLabel(role: Md3AgentTurnRole, agentName: string): string {
  switch (role) {
    case 'user':
      return t('md3.agents.role.you')
    case 'error':
      return t('md3.agents.role.error')
    case 'agent':
    case 'meta':
      return agentName
  }
}

interface IMd3AgentSessionRowProps {
  readonly session: IMd3AgentSession
  readonly now: number
  readonly isSelected: boolean
  readonly isTabbable: boolean
  readonly onSelect: (sessionId: string) => void
  readonly onKeyDown: (
    session: IMd3AgentSession,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void
  readonly onOpenMenu: (sessionId: string) => void
  readonly onRef: (sessionId: string, element: HTMLDivElement | null) => void
}

/**
 * One session row: the state glyph, the name / meta / detail column, the
 * surviving fleet badges, and the tonal state pill.
 */
function Md3AgentSessionRow(props: IMd3AgentSessionRowProps) {
  const { session, onSelect, onKeyDown, onOpenMenu, onRef } = props
  const tone = statusTone(StateToneKeys[session.state])
  const stateLabel = t(StateLabelKeys[session.state])

  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => onRef(session.id, element),
    [onRef, session.id]
  )
  const onClick = React.useCallback(
    () => onSelect(session.id),
    [onSelect, session.id]
  )
  const onRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => onKeyDown(session, event),
    [onKeyDown, session]
  )
  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      // Right-click also moves the roving tab stop, so closing the menu
      // returns focus to the row it acted on rather than to the document.
      event.currentTarget.focus()
      onOpenMenu(session.id)
    },
    [onOpenMenu, session.id]
  )

  const badges: Array<string> = []
  if (session.isMainWorktree) {
    badges.push(t('md3.agents.badge.main'))
  }
  if (session.isLocked) {
    badges.push(t('md3.agents.badge.locked'))
  }
  if (session.isMissing) {
    badges.push(t('md3.agents.badge.missing'))
  }

  return (
    <div
      ref={setRef}
      role="option"
      aria-selected={props.isSelected}
      tabIndex={props.isTabbable ? 0 : -1}
      className={classNames('md3-row', 'md3-agents__row', {
        'md3-row--active': props.isSelected,
      })}
      onClick={onClick}
      onKeyDown={onRowKeyDown}
      onContextMenu={onContextMenu}
    >
      <MaterialSymbol
        className={classNames('md3-agents__row-icon', tone.on)}
        name={StateIcons[session.state]}
        size={RowIconSize}
      />
      <span className="md3-agents__row-text">
        <span
          className={classNames('md3-row__name', {
            'md3-row__name--active': props.isSelected,
          })}
        >
          {session.name}
        </span>
        <span className="md3-agents__meta">
          {formatMd3AgentMeta(session, props.now)}
        </span>
        <span className="md3-row__detail">{formatMd3AgentDetail(session)}</span>
        {session.errorMessage === null ? null : (
          <span className="md3-agents__row-error">{session.errorMessage}</span>
        )}
      </span>
      {badges.length === 0 ? null : (
        <span className="md3-agents__badges">
          {badges.map(badge => (
            <span key={badge} className="md3-agents__badge">
              {badge}
            </span>
          ))}
        </span>
      )}
      <span
        className={classNames('md3-agents__state', tone.container, tone.on)}
      >
        {stateLabel}
      </span>
    </div>
  )
}
