import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode } from '../../models/language-mode'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { DialogEmoji } from '../lib/dialog-emoji'
import { createObservableRef } from '../lib/observable-ref'
import { Md3GhostButton, Md3TonalButton } from './md3-primitives'
import { Md3DestructiveActionId } from './md3-destructive-actions'

/**
 * The shared destructive-action super confirmation.
 *
 * Before this component the application carried three separate hand-rolled
 * versions of the same idea — one for unregistering a self-hosted runner, one
 * for transferring a repository and one for deleting notifications in bulk —
 * which is three chances for the keys, the slider, the focus restoration or the
 * emergency exit to be subtly different, and three places to fix anything found
 * wrong with one of them. Everything destructive now runs through this file.
 *
 * The gate is deliberately awkward to operate: two keys that are turned
 * independently, and only once both are turned does a full-range slider become
 * usable at all. Nothing happens until the slider reaches its maximum, so no
 * single click, keypress or stray pointer gesture can destroy anything.
 *
 * Two shapes are exported because the application has two kinds of host:
 *
 * - `Md3DestructiveGate` is the anchored surface the contract prefers. It
 *   positions itself beside the control that opened it, brings its own scrim,
 *   focus trap, Escape route, emergency exit and confirm button, and falls back
 *   to a centred modal only when the viewport cannot host the anchored panel
 *   without covering that control.
 * - `Md3DestructiveGateBody` is the same gate without any chrome, for surfaces
 *   that already sit inside the application's `Dialog`. Nesting a second modal
 *   inside a dialog would give a keyboard user two competing focus traps, so
 *   those hosts keep their own chrome and simply hold their affirmative button
 *   disabled until the body reports the gate authorized.
 *
 * One rule for hosts: when the consequence changes while the gate is on
 * screen — an option toggled, a fallback path taken — give the gate a new
 * `key` so it remounts. Otherwise it keeps the authorization the user gave for
 * a different outcome, and the mount effect's `onAuthorizationChanged(false)`
 * is what re-arms the host's own affirmative button.
 *
 * Copy: the framing sentence is banded by the per-language funny level, and
 * every fact — what is about to be destroyed, what cannot be undone, the exact
 * target — is supplied by the caller and rendered verbatim at every level and
 * in every language mode. A playful gate is fine; a gate that leaves the user
 * unsure what the button does is not.
 */

/** The slider's full range. Authorization completes only at the maximum. */
export const Md3GateAuthorizationMaximum = 100

/**
 * How far the gate has been operated.
 *
 * `locked` — one or both keys are still off, so the slider cannot move.
 * `armed` — both keys are turned and the slider is sitting at zero.
 * `moving` — the slider is between the ends; the dramatic progress treatment
 *   runs here.
 * `authorized` — the slider reached its maximum; the completion treatment runs
 *   and the confirm button becomes available.
 */
export type Md3GateState = 'locked' | 'armed' | 'moving' | 'authorized'

/**
 * Resolve the gate state from its three inputs.
 *
 * Pure, and exported so the state machine is testable without a DOM. Progress
 * is ignored entirely while either key is off, which is what makes turning a
 * key back off retract an authorization rather than leaving a slider parked at
 * the maximum for a single click to re-arm.
 */
export function md3GateState(
  firstKey: boolean,
  secondKey: boolean,
  progress: number
): Md3GateState {
  if (!firstKey || !secondKey) {
    return 'locked'
  }
  if (progress >= Md3GateAuthorizationMaximum) {
    return 'authorized'
  }
  return progress > 0 ? 'moving' : 'armed'
}

/** A rectangle in viewport coordinates. */
export interface IMd3GateRect {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** Where the anchored panel is painted, in viewport coordinates. */
export interface IMd3GatePosition {
  readonly top: number
  readonly left: number
}

/** The gap between the originating control and the anchored panel. */
const AnchorGap = 8

/** The smallest gap kept between the panel and any viewport edge. */
const ViewportMargin = 12

/**
 * Place the anchored panel beside its originating control, or report that it
 * cannot be placed.
 *
 * Returns `null` when the viewport is too small to hold the panel, or when the
 * panel would have to overlap the control to fit. The caller falls back to a
 * centred modal in that case: an anchored surface painted over the button that
 * opened it is the exact defect the overlay rules forbid, and a modal is an
 * honest presentation rather than a broken anchored one.
 */
export function md3GateAnchorPosition(
  anchor: IMd3GateRect,
  panel: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number }
): IMd3GatePosition | null {
  if (
    panel.width + ViewportMargin * 2 > viewport.width ||
    panel.height + ViewportMargin * 2 > viewport.height
  ) {
    return null
  }

  const maxLeft = viewport.width - panel.width - ViewportMargin
  const left = Math.min(Math.max(anchor.left, ViewportMargin), maxLeft)

  const below = anchor.top + anchor.height + AnchorGap
  if (below + panel.height <= viewport.height - ViewportMargin) {
    return { top: below, left }
  }

  const above = anchor.top - AnchorGap - panel.height
  if (above >= ViewportMargin) {
    return { top: above, left }
  }

  return null
}

/** Focusable descendants of the panel, in tab order. */
const FocusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** The `warning` glyph beside the irreversibility line. */
const IrreversibleGlyphSize = 15

/** The `key` glyph on each of the two key controls. */
const KeyGlyphSize = 15

/** The header glyph. */
const HeaderGlyphSize = 18

/** A minimal read-only ref shape, so any ref flavour can anchor the gate. */
export interface IMd3GateElementRef {
  readonly current: HTMLElement | null
}

let gateSequence = 0

/** Read the language mode and funny levels once, for this gate's lifetime. */
function useGateVoice(): {
  readonly languageMode: LanguageMode
  readonly funnyLevels: IFunnyLevels
} {
  return React.useMemo(
    () => ({
      languageMode: getPersistedLanguageMode(),
      funnyLevels: readFunnyLevels(),
    }),
    []
  )
}

export interface IMd3DestructiveGateBodyProps {
  /** The registered action this gate authorizes. */
  readonly actionId: Md3DestructiveActionId

  /**
   * Exactly what the confirmed action destroys, stated as a fact and rendered
   * verbatim. The caller owns naming the file, the branch, the count.
   */
  readonly summary: string

  /** Exactly what about it cannot be undone. Also rendered verbatim. */
  readonly irreversible: string

  /**
   * The reviewable preview: exactly which items the confirmed action affects,
   * one label per item.
   *
   * A bulk gate that says "delete 9 branches" states a number, and a number is
   * not something a person can check. The names are. Omit it for a gate whose
   * target is a single named thing the summary already names — a preview
   * repeating one row is noise — and supply it for every bulk action.
   */
  readonly preview?: ReadonlyArray<string>

  /**
   * The items the action will NOT touch, when the scope holds some it cannot.
   * Shown beside the preview so the count in the title and the work the button
   * actually does are visibly the same set.
   */
  readonly previewExcluded?: ReadonlyArray<string>

  /** Why those were excluded, already localized. */
  readonly previewExcludedReason?: string | null

  /** The first key's fact: the exact target being acted on. */
  readonly targetKeyLabel: string

  /** The second key's fact: the exact effect the user is accepting. */
  readonly effectKeyLabel: string

  /**
   * Freeze the whole gate — while the confirmed action is actually running, for
   * instance. A frozen gate keeps its state visible rather than resetting it.
   */
  readonly disabled?: boolean

  /**
   * Called whenever authorization is gained or lost, so a host that owns its
   * own affirmative button can enable and disable it.
   */
  readonly onAuthorizationChanged?: (authorized: boolean) => void

  /** Set on the element that states what will be destroyed. */
  readonly summaryId?: string

  readonly className?: string
}

/**
 * The gate itself: the two keys, the slider they unlock, the progress
 * treatment while it moves, the completion treatment once it arrives, and the
 * status region that says which of those is true in words.
 */
export function Md3DestructiveGateBody(props: IMd3DestructiveGateBodyProps) {
  const {
    actionId,
    summary,
    irreversible,
    preview,
    previewExcluded,
    previewExcludedReason,
    targetKeyLabel,
    effectKeyLabel,
    disabled,
    onAuthorizationChanged,
    summaryId,
    className,
  } = props

  const { languageMode, funnyLevels } = useGateVoice()
  const instanceId = React.useMemo(() => ++gateSequence, [])
  const sliderId = `md3-destructive-gate-slider-${instanceId}`
  const statusId = `md3-destructive-gate-status-${instanceId}`

  const [targetKey, setTargetKey] = React.useState(false)
  const [effectKey, setEffectKey] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  const state = md3GateState(targetKey, effectKey, progress)
  const authorized = state === 'authorized'
  const bothKeysTurned = targetKey && effectKey

  React.useEffect(() => {
    onAuthorizationChanged?.(authorized)
  }, [authorized, onAuthorizationChanged])

  // Turning either key back off retracts the authorization with it. A slider
  // left at its maximum beside an unticked key would let one click re-arm the
  // entire gate, which defeats the point of having two of them.
  const onTargetKey = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTargetKey(event.currentTarget.checked)
      setProgress(0)
    },
    []
  )

  const onEffectKey = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEffectKey(event.currentTarget.checked)
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

  const shownProgress = bothKeysTurned ? progress : 0
  const percent = String(shownProgress)

  const status =
    state === 'authorized'
      ? t('md3.destructiveGate.stateAuthorized')
      : state === 'moving'
      ? t('md3.destructiveGate.stateMoving')
      : state === 'armed'
      ? t('md3.destructiveGate.stateArmed')
      : t('md3.destructiveGate.stateLocked')

  return (
    <div
      className={classNames('md3-destructive-gate__body', className)}
      data-action-id={actionId}
      data-gate-state={state}
    >
      <p className="md3-destructive-gate__lead">
        {translateWithFunnyLevel(
          'md3.destructiveGate.lead',
          languageMode,
          funnyLevels
        )}
      </p>

      <p id={summaryId} className="md3-destructive-gate__summary">
        {summary}
      </p>

      <p className="md3-destructive-gate__irreversible">
        <MaterialSymbol name="warning" size={IrreversibleGlyphSize} />
        <strong className="md3-destructive-gate__irreversible-label">
          {t('md3.destructiveGate.irreversibleLabel')}
        </strong>
        <span>{irreversible}</span>
      </p>

      {preview === undefined || preview.length === 0 ? null : (
        <div className="md3-destructive-gate__preview">
          <p className="md3-destructive-gate__preview-heading">
            {t('md3.destructiveGate.previewHeading', {
              count: String(preview.length),
            })}
          </p>
          {/*
            A real list rather than a joined string, and one that scrolls
            inside its own bounds: a gate whose preview grows past the panel
            pushes its own confirm button off screen, and a preview capped
            with `overflow: hidden` deletes the rows past the cap with no
            scrollbar to say anything is missing.
          */}
          <ul
            className="md3-destructive-gate__preview-list"
            aria-label={t('md3.destructiveGate.previewHeading', {
              count: String(preview.length),
            })}
          >
            {preview.map(item => (
              <li key={item} className="md3-destructive-gate__preview-item">
                {item}
              </li>
            ))}
          </ul>
          {previewExcluded === undefined ||
          previewExcluded.length === 0 ||
          previewExcludedReason === undefined ||
          previewExcludedReason === null ? null : (
            <>
              <p className="md3-destructive-gate__preview-heading">
                {t('md3.destructiveGate.previewExcludedHeading', {
                  count: String(previewExcluded.length),
                  reason: previewExcludedReason,
                })}
              </p>
              <ul className="md3-destructive-gate__preview-list md3-destructive-gate__preview-list--excluded">
                {previewExcluded.map(item => (
                  <li key={item} className="md3-destructive-gate__preview-item">
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/*
        Both the fieldset and each input carry `disabled`. A fieldset genuinely
        disables its descendants for interaction, but the `disabled` IDL
        property on the inputs reflects only their own attribute, so anything
        that reads that property — a test, a tooling pass, a script — sees an
        enabled control on a frozen gate unless it is set here too.
      */}
      <fieldset className="md3-destructive-gate__keys" disabled={disabled}>
        <legend>{t('md3.destructiveGate.keysLegend')}</legend>
        <label className="md3-destructive-gate__key">
          <input
            type="checkbox"
            className="md3-destructive-gate__key-input"
            checked={targetKey}
            disabled={disabled}
            onChange={onTargetKey}
          />
          <MaterialSymbol name="key" size={KeyGlyphSize} />
          <span>
            {t('md3.destructiveGate.keyTarget', { target: targetKeyLabel })}
          </span>
        </label>
        <label className="md3-destructive-gate__key">
          <input
            type="checkbox"
            className="md3-destructive-gate__key-input"
            checked={effectKey}
            disabled={disabled}
            onChange={onEffectKey}
          />
          <MaterialSymbol name="key" size={KeyGlyphSize} />
          <span>
            {t('md3.destructiveGate.keyEffect', { effect: effectKeyLabel })}
          </span>
        </label>
      </fieldset>

      <div className="md3-destructive-gate__slider">
        {/*
          The visible label is the slider's accessible name and stays constant,
          so a screen reader is not read a new name on every step. The changing
          percentage reaches assistive technology through `aria-valuetext`,
          which is what it is for, and reaches sighted users through the
          adjacent output.
        */}
        <label
          className="md3-destructive-gate__slider-label"
          htmlFor={sliderId}
        >
          {t('md3.destructiveGate.sliderLabel')}
        </label>
        <div className="md3-destructive-gate__slider-row">
          <div
            className="md3-destructive-gate__slider-input-hit-target"
            style={
              {
                '--md3-gate-progress': `${shownProgress}%`,
              } as React.CSSProperties
            }
          >
            <input
              id={sliderId}
              type="range"
              className="md3-destructive-gate__slider-input"
              min={0}
              max={Md3GateAuthorizationMaximum}
              step={1}
              value={shownProgress}
              disabled={disabled === true || !bothKeysTurned}
              aria-describedby={statusId}
              aria-valuetext={t('md3.destructiveGate.sliderValue', { percent })}
              onChange={onProgress}
            />
          </div>
          <output className="md3-destructive-gate__slider-output">
            {t('md3.destructiveGate.sliderValue', { percent })}
          </output>
        </div>
      </div>

      {/*
        The bar is decoration for the slider that sits directly above it: the
        same value is already announced through `aria-valuetext` and the status
        region, so announcing it a third time would be noise.
      */}
      <div
        className={classNames('md3-destructive-gate__progress', {
          'md3-destructive-gate__progress--moving': state === 'moving',
          'md3-destructive-gate__progress--complete': authorized,
        })}
        aria-hidden={true}
      >
        <span
          className="md3-destructive-gate__progress-fill"
          style={{ width: `${shownProgress}%` }}
        />
        {authorized ? (
          <MaterialSymbol
            name="check_circle"
            className="md3-destructive-gate__progress-check"
            size={16}
          />
        ) : null}
      </div>

      <p id={statusId} className="md3-destructive-gate__status" role="status">
        {status}
      </p>
    </div>
  )
}

export interface IMd3DestructiveGateProps
  extends Omit<
    IMd3DestructiveGateBodyProps,
    'onAuthorizationChanged' | 'summaryId' | 'disabled'
  > {
  /** The question the gate is asking, naming the exact action. */
  readonly title: string

  /** The header glyph. Decorative — the title carries the meaning. */
  readonly icon?: MaterialSymbolName

  /** The affirmative button's visible label. */
  readonly confirmLabel: string

  /**
   * The control the gate belongs to. The panel is painted beside it, and focus
   * returns to it when the gate closes either way.
   */
  readonly anchorTo?: IMd3GateElementRef

  /**
   * Where focus goes on close, when that is not the anchor. Defaults to the
   * anchor, and then to whatever was focused when the gate opened.
   */
  readonly returnFocusTo?: IMd3GateElementRef

  /**
   * The confirmed action is running. The gate freezes and says so rather than
   * pretending it can still be cancelled — an irreversible operation already in
   * flight cannot be called back, and a cancel button that silently does
   * nothing is worse than one that explains itself.
   */
  readonly busy?: boolean

  /** A failure to state verbatim. Never styled by the funny level. */
  readonly error?: string | null

  /** Runs the action. Unreachable without both keys and a full slider. */
  readonly onConfirm: () => void

  /** The emergency exit, the scrim and Escape all call this. */
  readonly onDismissed: () => void
}

/**
 * The anchored destructive-action gate, with its own scrim, focus trap,
 * emergency exit and confirm button.
 */
export function Md3DestructiveGate(props: IMd3DestructiveGateProps) {
  const {
    actionId,
    summary,
    irreversible,
    targetKeyLabel,
    effectKeyLabel,
    title,
    icon,
    confirmLabel,
    anchorTo,
    returnFocusTo,
    busy,
    error,
    onConfirm,
    onDismissed,
  } = props

  const instanceId = React.useMemo(() => ++gateSequence, [])
  const titleId = `md3-destructive-gate-title-${instanceId}`
  const summaryId = `md3-destructive-gate-summary-${instanceId}`
  const errorId = `md3-destructive-gate-error-${instanceId}`

  const [authorized, setAuthorized] = React.useState(false)
  const [position, setPosition] = React.useState<IMd3GatePosition | null>(null)
  const [placed, setPlaced] = React.useState(anchorTo === undefined)

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
    // The emergency exit takes focus, so a gate opened by a stray keypress
    // cannot destroy anything on the next one.
    cancelRef.current?.focus()
  }, [cancelRef])

  React.useEffect(() => {
    const openedFrom = previouslyFocused
    return () => {
      const destination =
        returnFocusTo?.current ?? anchorTo?.current ?? openedFrom.current
      if (destination?.isConnected === true) {
        destination.focus()
      }
    }
  }, [anchorTo, returnFocusTo])

  const place = React.useCallback(() => {
    const panel = panelRef.current
    const anchor = anchorTo?.current
    if (panel === null || anchor === undefined || anchor === null) {
      setPlaced(true)
      return
    }

    const anchorRect = anchor.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    setPosition(
      md3GateAnchorPosition(
        {
          top: anchorRect.top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: anchorRect.height,
        },
        { width: panelRect.width, height: panelRect.height },
        { width: window.innerWidth, height: window.innerHeight }
      )
    )
    setPlaced(true)
  }, [anchorTo])

  React.useLayoutEffect(() => {
    place()
  }, [place])

  React.useEffect(() => {
    if (anchorTo === undefined) {
      return
    }
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorTo, place])

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (busy !== true) {
          onDismissed()
        }
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
    [busy, onDismissed]
  )

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (authorized && busy !== true) {
        onConfirm()
      }
    },
    [authorized, busy, onConfirm]
  )

  const onConfirmClick = React.useCallback(() => {
    if (authorized && busy !== true) {
      onConfirm()
    }
  }, [authorized, busy, onConfirm])

  const onScrimMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && busy !== true) {
        onDismissed()
      }
    },
    [busy, onDismissed]
  )

  const describedBy = [summaryId, error ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(' ')

  const anchored = position !== null

  return (
    <div
      className={classNames('md3-destructive-gate-scrim', {
        'md3-destructive-gate-scrim--anchored': anchored,
      })}
      role="presentation"
      onMouseDown={onScrimMouseDown}
    >
      {/*
        The panel is the dialog, so it is where Escape and the focus trap have
        to live: a keydown handler on a child would miss a key pressed while
        focus sits on the panel itself.
      */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <form
        ref={panelRef}
        className={classNames(
          'md3-destructive-gate',
          'md3-anim-menu',
          { 'md3-destructive-gate--placing': !placed },
          { 'md3-destructive-gate--anchored': anchored }
        )}
        style={position === null ? undefined : position}
        role="alertdialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        aria-busy={busy === true}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
      >
        <header className="md3-destructive-gate__header">
          <MaterialSymbol
            name={icon ?? 'delete'}
            className="md3-destructive-gate__header-icon"
            size={HeaderGlyphSize}
          />
          <DialogEmoji kind="destructive" />
          <div className="md3-destructive-gate__heading">
            <span className="md3-destructive-gate__eyebrow">
              {t('md3.destructiveGate.eyebrow')}
            </span>
            <h2 id={titleId} className="md3-destructive-gate__title">
              {title}
            </h2>
          </div>
        </header>

        <Md3DestructiveGateBody
          actionId={actionId}
          summary={summary}
          irreversible={irreversible}
          preview={props.preview}
          previewExcluded={props.previewExcluded}
          previewExcludedReason={props.previewExcludedReason}
          targetKeyLabel={targetKeyLabel}
          effectKeyLabel={effectKeyLabel}
          disabled={busy}
          summaryId={summaryId}
          onAuthorizationChanged={setAuthorized}
        />

        {error === null || error === undefined ? null : (
          <p id={errorId} className="md3-destructive-gate__error" role="alert">
            {error}
          </p>
        )}

        <footer className="md3-destructive-gate__footer">
          <Md3GhostButton
            label={t('md3.destructiveGate.emergencyExit')}
            accessibleName={t('md3.destructiveGate.emergencyExitName')}
            icon="close"
            buttonRef={cancelRef}
            disabled={busy === true}
            tooltip={
              busy === true
                ? t('md3.destructiveGate.busy')
                : t('md3.destructiveGate.emergencyExitName')
            }
            onClick={onDismissed}
            className="md3-destructive-gate__cancel"
          />
          <Md3TonalButton
            label={confirmLabel}
            icon="delete"
            disabled={!authorized || busy === true}
            className="md3-destructive-gate__confirm"
            onClick={onConfirmClick}
          />
        </footer>
      </form>
    </div>
  )
}
