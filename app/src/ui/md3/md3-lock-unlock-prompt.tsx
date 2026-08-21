import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import {
  createActiveUnlock,
  clearMd3LockWait,
  IMd3ActiveUnlock,
  IMd3Lock,
  IMd3UnlockDuration,
  isMd3LockSupportTicketsAvailable,
  IMd3LockVerification,
  MaximumUnlockMinutes,
  MinimumUnlockMinutes,
  Md3UnlockDurationKind,
  Md3UnlockDurationKinds,
  md3LockAttemptState,
  openMd3LockSupportTickets,
  verifyMd3Lock,
} from '../../lib/md3-locks'
import { isSchoolModeEnabled } from '../../lib/school-mode'
import {
  UnlockLadderMaxSkipsPerRollingHour,
  UnlockLadderRollingWindowMs,
  IUnlockLadderChallenge,
  IUnlockLadderLockoutState,
  IUnlockLadderServiceResult,
  IUnlockLadderStartRequest,
  UnlockLadderAnswer,
} from '../../models/unlock-ladder'
import { MaterialSymbol } from '../lib/material-symbol'
import { DialogEmoji } from '../lib/dialog-emoji'
import { createObservableRef } from '../lib/observable-ref'
import { Md3GhostButton, Md3IconButton, Md3TonalButton } from './md3-primitives'
import { notify } from './md3-toast'
import { UnlockLadder } from '../unlock-ladder/unlock-ladder'
import { unlockLadderText } from '../unlock-ladder/unlock-ladder-localization'
import {
  issueUnlockLadderChallenge,
  recordUnlockLadderMoleHit,
  startUnlockLadder,
  submitUnlockLadder,
} from '../main-process-proxy'

/**
 * The unlock prompt for a locked tab, tab group or appearance value.
 *
 * It is **anchored and non-modal**, per the contract: it opens beside the
 * control the user activated rather than as a detached dialog in the middle of
 * the screen, it does not scrim the app, and cancelling returns focus to the
 * control that opened it. It paints its own surface and stays inside the
 * viewport, scrolling internally rather than clipping — a prompt whose recovery
 * sentence has fallen off the bottom edge is a prompt that has hidden the one
 * thing a locked-out user needs.
 *
 * Three things it always says, at every funny level and in every language mode:
 *
 *  - **It is just for fun.** Not security, not encryption, and no protection
 *    from anybody else who has this computer. The funny level styles the lead
 *    sentence; it never softens this one.
 *  - **How to recover**, naming the actual application-data folder. Forgetting
 *    a toy lock is a normal outcome, so the way out is stated where the user
 *    will be looking for it rather than buried in documentation.
 *  - **What actually happened** on a wrong answer: that it did not match, how
 *    many wrong answers there have been, and how long the next attempt waits.
 *    Nothing is wiped, nothing escalates, and no lockout is claimed.
 *
 * The prompt never reveals anything about the stored credential — not its
 * value, not its length, not its composition. The only question it answers is
 * whether what was typed matched.
 */

/** The `lock` glyph in the prompt's header. */
const HeaderGlyphSize = 18

/** The `close` glyph in the header's icon button. */
const CloseGlyphSize = 16

/** How far the prompt is kept from the viewport edge, in CSS pixels. */
const ViewportMargin = 8

/** The prompt's own width, mirrored in `_md3-locks.scss`. */
const PromptWidth = 320

/** React 16 has no `useId`; one counter gives each open prompt stable ids. */
let nextInstanceId = 0

/** The anchor the prompt opens beside, in viewport coordinates. */
export interface IMd3LockAnchorRect {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

export interface IMd3LockPanelSize {
  readonly width: number
  readonly height: number
}

export interface IMd3LockUnlockPromptProps {
  readonly lock: IMd3Lock

  /**
   * The rect of the control the user activated, from
   * `element.getBoundingClientRect()`. When `null` the prompt centres itself
   * near the top of the viewport, which is the honest fallback for a lock
   * reached from the command palette rather than from a visible control.
   */
  readonly anchorRect: IMd3LockAnchorRect | null

  /**
   * The absolute path of the app's local application-data folder, so the
   * recovery sentence can name it. `null` renders the recovery sentence
   * without a path and says so, rather than inventing one.
   */
  readonly applicationDataFolder: string | null

  /** Called with the granted unlock after a matching answer. */
  readonly onUnlocked: (unlock: IMd3ActiveUnlock) => void

  /** The close button, Cancel and Escape all call this. */
  readonly onDismissed: () => void

  /** Injected by tests. Defaults to the shared verifier. */
  readonly verify?: (
    lock: IMd3Lock,
    answer: string,
    now: number
  ) => Promise<IMd3LockVerification>

  /** Injected by tests. Defaults to `Date.now`. */
  readonly now?: () => number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Place the prompt beside its anchor without letting it leave the viewport.
 *
 * An anchored surface that paints past the edge is unreachable, and one that
 * covers the control it belongs to hides the thing the user was pointing at.
 */
export function md3LockPromptPosition(
  anchor: IMd3LockAnchorRect | null,
  viewport: { readonly width: number; readonly height: number },
  panelSize: IMd3LockPanelSize = { width: PromptWidth, height: 0 }
): { readonly top: number; readonly left: number } {
  const width = clamp(
    panelSize.width > 0 ? panelSize.width : PromptWidth,
    ViewportMargin,
    Math.max(ViewportMargin, viewport.width - ViewportMargin * 2)
  )
  // Before the first layout pass there is no measured height. Use the full
  // available viewport as a safe provisional panel; ResizeObserver replaces
  // this with the actual rendered dimensions immediately after mount.
  const height = clamp(
    panelSize.height > 0
      ? panelSize.height
      : Math.max(ViewportMargin, viewport.height - ViewportMargin * 2),
    ViewportMargin,
    Math.max(ViewportMargin, viewport.height - ViewportMargin * 2)
  )
  const maxLeft = Math.max(
    ViewportMargin,
    viewport.width - width - ViewportMargin
  )
  const maxTop = Math.max(
    ViewportMargin,
    viewport.height - height - ViewportMargin
  )

  if (anchor === null) {
    return {
      top: ViewportMargin * 8,
      left: clamp(
        Math.round((viewport.width - width) / 2),
        ViewportMargin,
        maxLeft
      ),
    }
  }

  const preferredTop = anchor.top + anchor.height + ViewportMargin
  const preferredAbove = anchor.top - height - ViewportMargin
  const top =
    preferredTop + height > viewport.height - ViewportMargin &&
    preferredAbove >= ViewportMargin
      ? preferredAbove
      : clamp(preferredTop, ViewportMargin, maxTop)
  const left = clamp(anchor.left, ViewportMargin, maxLeft)

  return { top, left }
}

export function Md3LockUnlockPrompt(props: IMd3LockUnlockPromptProps) {
  const {
    lock,
    anchorRect,
    applicationDataFolder,
    onUnlocked,
    onDismissed,
    verify,
    now,
  } = props

  const instanceId = React.useMemo(() => ++nextInstanceId, [])
  const titleId = `md3-lock-unlock-title-${instanceId}`
  const leadId = `md3-lock-unlock-lead-${instanceId}`
  const answerId = `md3-lock-unlock-answer-${instanceId}`
  const statusId = `md3-lock-unlock-status-${instanceId}`
  const minutesId = `md3-lock-unlock-minutes-${instanceId}`

  const readNow = React.useMemo(() => now ?? (() => Date.now()), [now])
  const runVerify = React.useMemo(
    () =>
      verify ??
      ((candidate: IMd3Lock, answer: string, at: number) =>
        verifyMd3Lock(candidate, answer, at)),
    [verify]
  )

  const languageMode = getPersistedLanguageMode()
  const funnyLevels = readFunnyLevels()

  const initialAttemptState = React.useMemo(
    () => md3LockAttemptState(lock.id),
    [lock.id]
  )

  const [answer, setAnswer] = React.useState('')
  const [duration, setDuration] = React.useState<IMd3UnlockDuration>(
    lock.unlockDuration
  )
  const [status, setStatus] = React.useState<string | null>(null)
  const [retryAt, setRetryAt] = React.useState(initialAttemptState.retryAt)
  const [ladder, setLadder] = React.useState<{
    readonly lockoutId: string
    readonly challenge: IUnlockLadderChallenge
    readonly remainingSkips: number
  } | null>(null)
  const [ladderStarting, setLadderStarting] = React.useState(false)
  const [ladderDismissed, setLadderDismissed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  const panelRef = React.useRef<HTMLFormElement | null>(null)
  const [panelSize, setPanelSize] = React.useState<IMd3LockPanelSize>({
    width: PromptWidth,
    height: 0,
  })
  const answerRef = React.useRef<HTMLInputElement | null>(null)
  const closeRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const restoreFocusTo = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    answerRef.current?.focus()
    const target = restoreFocusTo.current
    return () => {
      // Cancelling returns focus to the control that was clicked, so a keyboard
      // user is not dropped back at the top of the document.
      if (target?.isConnected === true) {
        target.focus()
      }
    }
  }, [])

  React.useLayoutEffect(() => {
    const panel = panelRef.current
    if (panel === null) {
      return
    }
    const measure = () => {
      const rect = panel.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setPanelSize(current =>
          current.width === rect.width && current.height === rect.height
            ? current
            : { width: rect.width, height: rect.height }
        )
      }
    }
    measure()
    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    resizeObserver?.observe(panel)
    window.addEventListener('resize', measure)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ladder, status])

  // While a wrong-answer delay is running the remaining seconds have to visibly
  // count down, or the prompt looks broken rather than patient.
  const throttleRemainingMs = Math.max(0, retryAt - readNow())
  React.useEffect(() => {
    if (throttleRemainingMs <= 0) {
      return
    }
    const timer = setTimeout(() => setTick(current => current + 1), 250)
    return () => clearTimeout(timer)
  }, [throttleRemainingMs, tick])

  const throttled = throttleRemainingMs > 0
  const throttleSeconds = Math.ceil(throttleRemainingMs / 1000)

  const ladderLockoutId = React.useMemo(
    () => `md3-lockout:${lock.id}:${instanceId}`,
    [instanceId, lock.id]
  )

  const startLadderIfWaiting = React.useCallback(
    (waitUntil: number, failures: number) => {
      if (
        waitUntil <= readNow() ||
        ladder !== null ||
        ladderStarting ||
        ladderDismissed
      ) {
        return
      }
      setLadderStarting(true)
      const request: IUnlockLadderStartRequest = {
        lockoutId: ladderLockoutId,
        lockoutLevel: failures,
        // This is intentionally zero: the wait ladder never owns or refunds
        // the credential lock's attempt budget.
        attemptsRemaining: 0,
        waitUntil,
        schoolMode: isSchoolModeEnabled(),
      }
      void startUnlockLadder(request)
        .then((state: IUnlockLadderLockoutState) =>
          issueUnlockLadderChallenge(state.lockoutId).then(challenge => ({
            challenge,
            remainingSkips: Math.max(
              0,
              UnlockLadderMaxSkipsPerRollingHour -
                state.ladderSkipTimestamps.filter(
                  timestamp =>
                    readNow() - timestamp < UnlockLadderRollingWindowMs
                ).length
            ),
          }))
        )
        .then(({ challenge, remainingSkips }) => {
          setLadder({
            lockoutId: ladderLockoutId,
            challenge,
            remainingSkips,
          })
        })
        .catch(() => {
          setLadderDismissed(true)
          setStatus('The wait ladder is unavailable; continue waiting.')
        })
        .finally(() => setLadderStarting(false))
    },
    [
      issueUnlockLadderChallenge,
      ladder,
      ladderLockoutId,
      ladderDismissed,
      ladderStarting,
      readNow,
    ]
  )

  React.useEffect(() => {
    if (throttled) {
      startLadderIfWaiting(retryAt, initialAttemptState.consecutiveFailures)
    }
  }, [
    initialAttemptState.consecutiveFailures,
    retryAt,
    startLadderIfWaiting,
    throttled,
  ])

  const position = md3LockPromptPosition(
    anchorRect,
    {
      width: typeof window === 'undefined' ? PromptWidth : window.innerWidth,
      height: typeof window === 'undefined' ? 600 : window.innerHeight,
    },
    panelSize
  )

  const onAnswerChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAnswer(event.currentTarget.value)
      setStatus(null)
    },
    []
  )

  const onDurationChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const kind = Md3UnlockDurationKinds.find(
        entry => entry === event.currentTarget.value
      )
      if (kind !== undefined) {
        setDuration(current => ({ ...current, kind }))
      }
    },
    []
  )

  const onLadderSubmit = React.useCallback(
    async (
      answerToGrade: UnlockLadderAnswer
    ): Promise<IUnlockLadderServiceResult | null> => {
      if (ladder === null) {
        return null
      }
      const result = await submitUnlockLadder({
        lockoutId: ladder.lockoutId,
        challengeId: ladder.challenge.challengeId,
        nonce: ladder.challenge.nonce,
        answer: answerToGrade,
      })
      if (result.waitingCleared) {
        // Clear only the current retry deadline. The failure count survives,
        // so the ladder never refunds or erases credential escalation.
        clearMd3LockWait(lock.id)
        setRetryAt(0)
        setLadder(null)
        setLadderDismissed(false)
        setStatus(
          unlockLadderText('credentialNext', languageMode, {
            english: funnyLevels.english,
            cantonese: funnyLevels.cantonese,
          })
        )
        return result
      }

      try {
        const challenge = await issueUnlockLadderChallenge(ladder.lockoutId)
        setLadder(current =>
          current === null ? current : { ...current, challenge }
        )
      } catch {
        // The service reaches the clock rung after the failed mole round.
        setLadder(null)
        setStatus(
          unlockLadderText('clock', languageMode, {
            english: funnyLevels.english,
            cantonese: funnyLevels.cantonese,
          })
        )
      }
      return result
    },
    [funnyLevels, issueUnlockLadderChallenge, languageMode, ladder, lock.id]
  )

  const onLadderMoleHit = React.useCallback(
    (
      request: Readonly<{
        readonly challengeId: string
        readonly nonce: string
        readonly moleId: string
      }>
    ) => recordUnlockLadderMoleHit({ ...request, lockoutId: ladderLockoutId }),
    [ladderLockoutId]
  )

  const onLadderCancel = React.useCallback(() => {
    setLadder(null)
    setLadderDismissed(true)
    setStatus(null)
  }, [])

  const onMinutesChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const minutes = Number(event.currentTarget.value)
      setDuration(current => ({
        ...current,
        minutes: Number.isFinite(minutes)
          ? clamp(
              Math.round(minutes),
              MinimumUnlockMinutes,
              MaximumUnlockMinutes
            )
          : current.minutes,
      }))
    },
    []
  )

  const attempt = React.useCallback(() => {
    if (busy) {
      return
    }
    const at = readNow()
    if (retryAt > at) {
      return
    }

    setBusy(true)
    runVerify(lock, answer, at).then(
      result => {
        setBusy(false)
        setRetryAt(result.retryAt)

        if (result.retryAt > at) {
          startLadderIfWaiting(result.retryAt, result.consecutiveFailures)
        }

        if (result.outcome === 'matched') {
          setStatus(null)
          notify(t('md3.locks.unlock.success', { label: lock.target.label }))
          onUnlocked(createActiveUnlock(lock.id, duration, at))
          return
        }

        if (result.outcome === 'throttled') {
          setStatus(
            t('md3.locks.unlock.throttled', {
              seconds: String(Math.ceil((result.retryAt - at) / 1000)),
            })
          )
          return
        }

        if (result.outcome === 'unavailable') {
          setStatus(t('md3.locks.unlock.unavailable'))
          return
        }

        setStatus(
          translateWithFunnyLevel(
            'md3.locks.wrongAttempt',
            languageMode,
            funnyLevels,
            { failures: String(result.consecutiveFailures) }
          )
        )
        setAnswer('')
        answerRef.current?.focus()
      },
      (error: Error) => {
        setBusy(false)
        // A vault that will not answer is the app's failure, not the user's,
        // so it is reported as itself rather than as a wrong password.
        setStatus(t('md3.locks.setup.errorVault', { error: error.message }))
      }
    )
  }, [
    answer,
    busy,
    duration,
    funnyLevels,
    languageMode,
    lock,
    onUnlocked,
    readNow,
    retryAt,
    runVerify,
    startLadderIfWaiting,
  ])

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      attempt()
    },
    [attempt]
  )

  // The tonal button is styled by the shell rather than being a native submit,
  // so it runs the same attempt the form's own submit does. Two routes, one
  // code path: they cannot drift into disagreeing about what Unlock means.
  const onSubmitClick = React.useCallback(() => attempt(), [attempt])

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onDismissed()
      }
    },
    [onDismissed]
  )

  const onForgotten = React.useCallback(() => {
    const opened = openMd3LockSupportTickets({
      lockId: lock.id,
      targetLabel: lock.target.label,
    })
    if (!opened) {
      setStatus(t('md3.locks.unlock.forgottenUnavailable'))
    }
  }, [lock])

  const recovery =
    applicationDataFolder === null
      ? t('md3.locks.unlock.recoveryUnknown')
      : t('md3.locks.unlock.recovery', { folder: applicationDataFolder })

  const answerLabel =
    lock.factor === 'otp'
      ? t('md3.locks.unlock.codeLabel')
      : t('md3.locks.unlock.passwordLabel')

  return (
    // The dialog panel answers Escape itself, so the key never has to reach a
    // particular control inside it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      ref={panelRef}
      className="md3-lock-prompt md3-anim-menu"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={`${leadId} ${statusId}`}
      style={{ top: position.top, left: position.left }}
      onKeyDown={onKeyDown}
      onSubmit={onSubmit}
    >
      <header className="md3-lock-prompt__header">
        <MaterialSymbol
          name="lock"
          className="md3-lock-prompt__header-icon"
          size={HeaderGlyphSize}
        />
        <DialogEmoji kind="security" />
        <h2 id={titleId} className="md3-lock-prompt__title">
          {t('md3.locks.unlock.title', { label: lock.target.label })}
        </h2>
        <Md3IconButton
          small={true}
          icon="close"
          iconSize={CloseGlyphSize}
          label={t('md3.locks.unlock.cancel')}
          buttonRef={closeRef}
          onClick={onDismissed}
        />
      </header>

      <p id={leadId} className="md3-lock-prompt__lead">
        {translateWithFunnyLevel(
          'md3.locks.unlockLead',
          languageMode,
          funnyLevels
        )}
      </p>

      {ladder === null ? (
        <>
          <label className="md3-lock-prompt__field" htmlFor={answerId}>
            <span>{answerLabel}</span>
            <input
              ref={answerRef}
              id={answerId}
              className="md3-lock-prompt__input"
              type={lock.factor === 'otp' ? 'text' : 'password'}
              inputMode={lock.factor === 'otp' ? 'numeric' : undefined}
              autoComplete="off"
              spellCheck={false}
              value={answer}
              aria-describedby={statusId}
              aria-invalid={status !== null}
              disabled={busy}
              onChange={onAnswerChanged}
            />
          </label>

          <fieldset className="md3-lock-prompt__durations">
            <legend>{t('md3.locks.unlock.durationLegend')}</legend>
            {Md3UnlockDurationKinds.map(kind => (
              <label className="md3-lock-prompt__duration" key={kind}>
                <input
                  type="radio"
                  name={`md3-lock-unlock-duration-${instanceId}`}
                  value={kind}
                  checked={duration.kind === kind}
                  onChange={onDurationChanged}
                />
                <span>{durationLabel(kind)}</span>
              </label>
            ))}
            {duration.kind === 'minutes' ? (
              <label className="md3-lock-prompt__minutes" htmlFor={minutesId}>
                <span>{t('md3.locks.unlock.minutesLabel')}</span>
                <input
                  id={minutesId}
                  type="number"
                  min={MinimumUnlockMinutes}
                  max={MaximumUnlockMinutes}
                  step={1}
                  value={duration.minutes}
                  onChange={onMinutesChanged}
                />
              </label>
            ) : null}
          </fieldset>
        </>
      ) : (
        <UnlockLadder
          challenge={ladder.challenge}
          languageMode={languageMode}
          funnyLevels={funnyLevels}
          remainingSkips={ladder.remainingSkips}
          onSubmit={onLadderSubmit}
          onMoleHit={onLadderMoleHit}
          onCancel={onLadderCancel}
        />
      )}

      <p
        id={statusId}
        className={classNames('md3-lock-prompt__status', {
          'md3-lock-prompt__status--problem': status !== null,
        })}
        role="status"
      >
        {throttled
          ? t('md3.locks.unlock.throttled', {
              seconds: String(throttleSeconds),
            })
          : status ?? ''}
      </p>

      {/*
        The honesty line is a single fixed string in both languages. No funny
        level styles it, because "this is not security" is the fact the whole
        feature rests on rather than a matter of voice.
      */}
      <p className="md3-lock-prompt__for-fun">{t('md3.locks.unlock.forFun')}</p>

      <p className="md3-lock-prompt__recovery">{recovery}</p>

      <footer className="md3-lock-prompt__footer">
        <button
          type="button"
          className="md3-lock-prompt__forgotten"
          onClick={onForgotten}
        >
          {t('md3.locks.unlock.forgotten')}
        </button>
        <span className="md3-lock-prompt__footer-spacer" />
        <Md3GhostButton
          label={t('md3.locks.unlock.cancel')}
          onClick={onDismissed}
        />
        <Md3TonalButton
          label={t('md3.locks.unlock.submit')}
          icon="key"
          disabled={busy || throttled || answer.trim().length === 0}
          accessibleName={`${t('md3.locks.unlock.submit')} ${
            lock.target.label
          }`}
          onClick={onSubmitClick}
          className="md3-lock-prompt__submit"
        />
      </footer>
    </form>
  )
}

/** Whether Support Tickets can actually be reached from this build. */
export function md3LockForgottenRouteAvailable(): boolean {
  return isMd3LockSupportTicketsAvailable()
}

function durationLabel(kind: Md3UnlockDurationKind): string {
  if (kind === 'surface') {
    return t('md3.locks.duration.surface')
  }
  if (kind === 'session') {
    return t('md3.locks.duration.session')
  }
  return t('md3.locks.duration.minutes')
}
