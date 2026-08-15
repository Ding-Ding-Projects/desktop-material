import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { DialogEmoji } from '../lib/dialog-emoji'
import { createObservableRef } from '../lib/observable-ref'
import { Md3GhostButton, Md3TonalButton } from './md3-primitives'

/**
 * The destructive-action super confirmation for deleting support tickets.
 *
 * Every ticket deletion comes through here — one ticket or forty. The desk has
 * no undo, so a single-row delete is exactly as irreversible as a bulk one and
 * gating only the bulk case would be safety theatre in the shape of a
 * threshold nobody chose.
 *
 * It follows the gate this repository already ships elsewhere: two
 * independently operated keys, a full-range authorization slider that cannot
 * move until both are turned, a running progress treatment while it moves, a
 * distinct completion state, and an always-available emergency exit that holds
 * focus when the gate opens.
 *
 * The copy states the exact count and the exact scope. A funny level styles
 * the sentence around them; it never replaces the number of tickets that are
 * about to go.
 *
 * The shell also carries a shared gate primitive in `md3-destructive-gate.tsx`
 * whose registry (`md3-destructive-actions.ts`) enumerates the actions allowed
 * to open one. Folding this gate into that registry is the right end state and
 * is a deliberate follow-up rather than an oversight: the two landed in the
 * same rewrite, and the desk's own copy — which names tickets, their count and
 * their scope — is what the registry entry would have to carry.
 */

/** Focusable descendants of the panel, in tab order. */
const FocusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** The slider's full range. Authorization completes at the maximum. */
const AuthorizationMaximum = 100

export interface IMd3SupportTicketDeleteGateProps {
  /** How many tickets the confirmed action deletes. */
  readonly count: number

  /**
   * A plain sentence naming exactly which tickets those are — the selection,
   * the filtered set, or one named ticket. Rendered verbatim.
   */
  readonly scope: string

  /** Runs the deletion. Only reachable with both keys and a full slider. */
  readonly onConfirm: () => void

  /** The emergency exit, the scrim, and Escape all call this. */
  readonly onDismissed: () => void
}

let gateSequence = 0

export function Md3SupportTicketDeleteGate(
  props: IMd3SupportTicketDeleteGateProps
) {
  const { count, scope, onConfirm, onDismissed } = props

  const instanceId = React.useMemo(() => ++gateSequence, [])
  const titleId = `md3-support-ticket-gate-title-${instanceId}`
  const descriptionId = `md3-support-ticket-gate-description-${instanceId}`
  const statusId = `md3-support-ticket-gate-status-${instanceId}`
  const sliderId = `md3-support-ticket-gate-slider-${instanceId}`

  const [countKey, setCountKey] = React.useState(false)
  const [scopeKey, setScopeKey] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  const panelRef = React.useRef<HTMLFormElement | null>(null)
  const cancelRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    cancelRef.current?.focus()
    const restoreTo = previouslyFocused.current
    return () => {
      if (restoreTo?.isConnected === true) {
        restoreTo.focus()
      }
    }
  }, [cancelRef])

  const bothKeysTurned = countKey && scopeKey
  const authorized = bothKeysTurned && progress === AuthorizationMaximum
  const moving = bothKeysTurned && progress > 0 && !authorized

  // Turning a key back off retracts the authorization with it: a slider left
  // at 100% while a confirmation is unticked would let a single click re-arm
  // the whole gate.
  const onCountKey = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setCountKey(event.currentTarget.checked)
      setProgress(0)
    },
    []
  )

  const onScopeKey = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setScopeKey(event.currentTarget.checked)
      setProgress(0)
    },
    []
  )

  const onProgress = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setProgress(Number(event.currentTarget.value))
    },
    []
  )

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (authorized) {
        onConfirm()
      }
    },
    [authorized, onConfirm]
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onDismissed()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const panel = panelRef.current
      if (panel === null) {
        return
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FocusableSelector)
      )
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onDismissed]
  )

  const onScrimMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onDismissed()
      }
    },
    [onDismissed]
  )

  const status = authorized
    ? t('supportTickets.gate.statusAuthorized')
    : moving
    ? t('supportTickets.gate.statusMoving')
    : bothKeysTurned
    ? t('supportTickets.gate.statusReady')
    : t('supportTickets.gate.statusLocked')

  return (
    <div
      className="md3-support-gate md3-anim-fade--overlay"
      role="presentation"
      onMouseDown={onScrimMouseDown}
    >
      {/*
        eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
        the panel is the modal surface itself: it answers Escape and wraps Tab
        so neither can escape into the application behind the scrim. Every
        control inside it is separately focusable and separately operable.
      */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <form
        ref={panelRef}
        className="md3-support-gate__panel md3-anim-menu"
        role="alertdialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${statusId}`}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
      >
        <header className="md3-support-gate__header">
          <MaterialSymbol
            name="delete_sweep"
            className="md3-support-gate__header-icon"
            size={18}
          />
          <DialogEmoji kind="destructive" />
          <span className="md3-support-gate__eyebrow">
            {t('supportTickets.gate.eyebrow')}
          </span>
          <h2 id={titleId} className="md3-support-gate__title">
            {t('supportTickets.gate.title', { count: String(count) })}
          </h2>
        </header>

        <p id={descriptionId} className="md3-support-gate__description">
          {t('supportTickets.gate.description', {
            count: String(count),
            scope,
          })}
        </p>

        <fieldset className="md3-support-gate__keys">
          <legend>{t('supportTickets.gate.keysLegend')}</legend>
          <label className="md3-support-gate__key">
            <input
              type="checkbox"
              className="md3-support-checkbox"
              checked={countKey}
              onChange={onCountKey}
            />
            <span>
              {t('supportTickets.gate.keyCount', { count: String(count) })}
            </span>
          </label>
          <label className="md3-support-gate__key">
            <input
              type="checkbox"
              className="md3-support-checkbox"
              checked={scopeKey}
              onChange={onScopeKey}
            />
            <span>{t('supportTickets.gate.keyScope', { scope })}</span>
          </label>
        </fieldset>

        <label className="md3-support-gate__slider" htmlFor={sliderId}>
          <span>
            {t('supportTickets.gate.sliderLabel', {
              percent: String(progress),
            })}
          </span>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={AuthorizationMaximum}
            step={1}
            value={bothKeysTurned ? progress : 0}
            disabled={!bothKeysTurned}
            aria-valuetext={t('supportTickets.gate.sliderValue', {
              percent: String(progress),
            })}
            onChange={onProgress}
          />
        </label>

        <div
          className={classNames('md3-support-gate__progress', {
            'md3-support-gate__progress--moving': moving,
            'md3-support-gate__progress--complete': authorized,
          })}
          aria-hidden={true}
        >
          <span
            className="md3-support-gate__progress-fill"
            style={{ width: `${bothKeysTurned ? progress : 0}%` }}
          />
        </div>

        <p id={statusId} className="md3-support-gate__status" role="status">
          {status}
        </p>

        <footer className="md3-support-gate__footer">
          {/*
            The emergency exit takes focus when the gate opens, so a gate that
            appeared under a stray keypress cannot delete anything on the next
            one.
          */}
          <Md3GhostButton
            label={t('supportTickets.gate.emergencyExit')}
            icon="close"
            buttonRef={cancelRef}
            onClick={onDismissed}
            className="md3-support-gate__cancel"
          />
          <Md3TonalButton
            label={t('supportTickets.gate.confirm', { count: String(count) })}
            icon="delete"
            disabled={!authorized}
            className="md3-support-gate__confirm"
            onClick={onConfirm}
          />
        </footer>
      </form>
    </div>
  )
}
