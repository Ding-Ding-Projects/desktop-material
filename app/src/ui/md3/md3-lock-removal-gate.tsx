import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { DialogEmoji } from '../lib/dialog-emoji'
import { createObservableRef } from '../lib/observable-ref'
import { Md3GhostButton, Md3TonalButton } from './md3-primitives'

/**
 * The destructive-action super confirmation for removing locks in bulk.
 *
 * Removing a lock forgets its stored credential, and a credential cannot be
 * recovered — so a bulk removal is irreversible in one gesture and goes through
 * the same gate this repository already uses for unregistering a runner and for
 * bulk notification deletion: two independently operated keys, an authorization
 * slider that cannot move until both are turned, a running progress treatment
 * while it moves, a distinct completed state, and an always-available emergency
 * exit which takes focus when the gate opens.
 *
 * Removing a single lock from its own row does not come through here. That path
 * removes one named thing the user is looking at, and gating it would be
 * ceremony rather than safety.
 *
 * The copy states the exact count and the exact scope, and states plainly that
 * what is removed is the lock rather than the surface: nothing behind a lock is
 * deleted by unlocking it, and nothing behind a lock is deleted by removing it
 * either.
 */

/** Focusable descendants of the panel, in tab order. */
const FocusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** The slider's full range. Authorization completes at the maximum. */
const AuthorizationMaximum = 100

/** The `delete_sweep` glyph in the header. */
const HeaderGlyphSize = 18

let gateSequence = 0

export interface IMd3LockRemovalGateProps {
  /** How many locks the confirmed action removes. */
  readonly count: number

  /**
   * A plain sentence naming exactly which locks those are — the selection, or
   * the set the active search is showing. Rendered verbatim, so the caller owns
   * saying "matching this search" out loud.
   */
  readonly scope: string

  /** Runs the removal. Only reachable with both keys and a full slider. */
  readonly onConfirm: () => void

  /** The emergency exit, the scrim and Escape all call this. */
  readonly onDismissed: () => void
}

export function Md3LockRemovalGate(props: IMd3LockRemovalGateProps) {
  const { count, scope, onConfirm, onDismissed } = props

  const instanceId = React.useMemo(() => ++gateSequence, [])
  const titleId = `md3-lock-gate-title-${instanceId}`
  const descriptionId = `md3-lock-gate-description-${instanceId}`
  const statusId = `md3-lock-gate-status-${instanceId}`
  const sliderId = `md3-lock-gate-slider-${instanceId}`

  const [countKey, setCountKey] = React.useState(false)
  const [scopeKey, setScopeKey] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  const panelRef = React.useRef<HTMLFormElement | null>(null)
  const cancelRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  React.useEffect(() => {
    const restoreTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    cancelRef.current?.focus()
    return () => {
      if (restoreTo?.isConnected === true) {
        restoreTo.focus()
      }
    }
  }, [cancelRef])

  const bothKeysTurned = countKey && scopeKey
  const authorized = bothKeysTurned && progress === AuthorizationMaximum
  const moving = bothKeysTurned && progress > 0 && !authorized

  // Turning a key back off retracts the authorization with it: a slider left at
  // 100% while a confirmation is unticked would let one click re-arm the gate.
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
    ? t('md3.locks.gate.statusAuthorized')
    : moving
    ? t('md3.locks.gate.statusMoving')
    : bothKeysTurned
    ? t('md3.locks.gate.statusReady')
    : t('md3.locks.gate.statusLocked')

  return (
    <div
      className="md3-lock-gate md3-anim-fade--overlay"
      role="presentation"
      onMouseDown={onScrimMouseDown}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
          the dialog panel answers Escape itself, so the key never has to reach a
          particular control inside it. */}
      <form
        ref={panelRef}
        className="md3-lock-gate__panel md3-anim-menu"
        role="alertdialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${statusId}`}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
      >
        <header className="md3-lock-gate__header">
          <MaterialSymbol
            name="delete_sweep"
            className="md3-lock-gate__header-icon"
            size={HeaderGlyphSize}
          />
          <DialogEmoji kind="destructive" />
          <span className="md3-lock-gate__eyebrow">
            {t('md3.locks.gate.eyebrow')}
          </span>
          <h2 id={titleId} className="md3-lock-gate__title">
            {t('md3.locks.gate.title', { count: String(count) })}
          </h2>
        </header>

        <p id={descriptionId} className="md3-lock-gate__description">
          {t('md3.locks.gate.description', { count: String(count), scope })}
        </p>

        <fieldset className="md3-lock-gate__keys">
          <legend>{t('md3.locks.gate.keysLegend')}</legend>
          <label className="md3-lock-gate__key">
            <input type="checkbox" checked={countKey} onChange={onCountKey} />
            <span>
              {t('md3.locks.gate.keyCount', { count: String(count) })}
            </span>
          </label>
          <label className="md3-lock-gate__key">
            <input type="checkbox" checked={scopeKey} onChange={onScopeKey} />
            <span>{t('md3.locks.gate.keyScope', { scope })}</span>
          </label>
        </fieldset>

        <label className="md3-lock-gate__slider" htmlFor={sliderId}>
          <span>
            {t('md3.locks.gate.sliderLabel', { percent: String(progress) })}
          </span>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={AuthorizationMaximum}
            step={1}
            value={bothKeysTurned ? progress : 0}
            disabled={!bothKeysTurned}
            aria-valuetext={t('md3.locks.gate.sliderValue', {
              percent: String(progress),
            })}
            onChange={onProgress}
          />
        </label>

        <div
          className={classNames('md3-lock-gate__progress', {
            'md3-lock-gate__progress--moving': moving,
            'md3-lock-gate__progress--complete': authorized,
          })}
          aria-hidden={true}
        >
          <span
            className="md3-lock-gate__progress-fill"
            style={{ width: `${bothKeysTurned ? progress : 0}%` }}
          />
        </div>

        <p id={statusId} className="md3-lock-gate__status" role="status">
          {status}
        </p>

        <footer className="md3-lock-gate__footer">
          {/*
            The emergency exit takes focus when the gate opens, so a gate that
            appeared under a stray keypress cannot remove anything on the next.
          */}
          <Md3GhostButton
            label={t('md3.locks.gate.emergencyExit')}
            icon="close"
            buttonRef={cancelRef}
            onClick={onDismissed}
            className="md3-lock-gate__cancel"
          />
          <Md3TonalButton
            label={t('md3.locks.gate.confirm', { count: String(count) })}
            icon="delete"
            disabled={!authorized}
            className="md3-lock-gate__confirm"
            onClick={onConfirm}
          />
        </footer>
      </form>
    </div>
  )
}
