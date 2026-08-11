import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import {
  addMd3Lock,
  DefaultMd3UnlockDuration,
  IMd3Lock,
  IMd3LockCredentialVault,
  IMd3LockTarget,
  IMd3UnlockDuration,
  isMd3TotpAvailable,
  isValidMd3LockPassword,
  MaximumLockPasswordLength,
  MaximumUnlockMinutes,
  Md3LockFactor,
  Md3LockStorage,
  Md3UnlockDurationKind,
  Md3UnlockDurationKinds,
  MinimumLockPasswordLength,
  MinimumUnlockMinutes,
  removeMd3Locks,
  setMd3LockPassword,
  updateMd3Lock,
} from '../../lib/md3-locks'
import { MaterialSymbol } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { Md3GhostButton, Md3IconButton, Md3TonalButton } from './md3-primitives'
import {
  md3LockPromptPosition,
  IMd3LockAnchorRect,
} from './md3-lock-unlock-prompt'
import { notify } from './md3-toast'

/**
 * The surface that creates or edits one lock.
 *
 * It opens anchored beside the control that asked for it — the tab's context
 * menu entry, or an appearance editor's own lock affordance — rather than as a
 * detached dialog, and it is non-modal: locking a tab is not a decision that
 * has to stop the rest of the app.
 *
 * Everything the contract requires this control to say, it says every time:
 *
 *  - **It is just for fun.** A fixed sentence, unstyled by the funny level,
 *    stating that this is not security, nothing is encrypted, and it does not
 *    keep out anybody else with this computer.
 *  - **How to recover**, naming the actual application-data folder. This is the
 *    setting that creates the lock, so it is one of the two places the contract
 *    names for the recovery route.
 *  - **What the setting does**, behind progressive disclosure, and a truthful
 *    provenance line saying whether each value is the shipped default or
 *    something saved for this particular lock.
 *
 * Two things it never does: reuse another lock's credential, and reveal
 * anything at all about a stored one. A new lock always takes a fresh
 * credential, and editing an existing lock edits its duration and its
 * re-lock-on-launch behaviour — changing the factor is a remove-and-create
 * pair, so the old credential is genuinely forgotten rather than orphaned.
 */

/** The `lock` glyph in the header. */
const HeaderGlyphSize = 18

/** The `close` glyph in the header's icon button. */
const CloseGlyphSize = 16

let nextInstanceId = 0

export interface IMd3LockSetupDialogProps {
  /**
   * The lock being edited, or `null` when one is being created. Editing never
   * changes the factor: see the note above.
   */
  readonly lock: IMd3Lock | null

  /** What the new lock will cover. Ignored when `lock` is supplied. */
  readonly target: IMd3LockTarget

  readonly anchorRect: IMd3LockAnchorRect | null

  /**
   * The absolute path of the app's local application-data folder, so the
   * recovery sentence can name it. `null` says so rather than inventing one.
   */
  readonly applicationDataFolder: string | null

  readonly onSaved: (lock: IMd3Lock) => void

  readonly onDismissed: () => void

  /** Injected by tests. Defaults to the installed platform vault. */
  readonly credentialVault?: IMd3LockCredentialVault

  /** Injected by tests. Defaults to `localStorage`. */
  readonly storage?: Md3LockStorage

  /** Injected by tests. Defaults to whether an authenticator is registered. */
  readonly totpAvailable?: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
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

/** The human-readable form of a duration, for the provenance line. */
export function describeUnlockDuration(duration: IMd3UnlockDuration): string {
  if (duration.kind === 'minutes') {
    return t('md3.locks.duration.minutesValue', {
      minutes: String(duration.minutes),
    })
  }
  return durationLabel(duration.kind)
}

export function Md3LockSetupDialog(props: IMd3LockSetupDialogProps) {
  const {
    lock,
    target,
    anchorRect,
    applicationDataFolder,
    onSaved,
    onDismissed,
    credentialVault,
    storage,
    totpAvailable,
  } = props

  const instanceId = React.useMemo(() => ++nextInstanceId, [])
  const titleId = `md3-lock-setup-title-${instanceId}`
  const leadId = `md3-lock-setup-lead-${instanceId}`
  const statusId = `md3-lock-setup-status-${instanceId}`
  const passwordId = `md3-lock-setup-password-${instanceId}`
  const confirmId = `md3-lock-setup-confirm-${instanceId}`
  const otpId = `md3-lock-setup-otp-${instanceId}`
  const minutesId = `md3-lock-setup-minutes-${instanceId}`
  const explanationId = `md3-lock-setup-explanation-${instanceId}`

  const editing = lock !== null
  const otpAvailable = totpAvailable ?? isMd3TotpAvailable()
  const languageMode = getPersistedLanguageMode()
  const funnyLevels = readFunnyLevels()

  const [factor, setFactor] = React.useState<Md3LockFactor>(
    lock?.factor ?? 'password'
  )
  const [password, setPassword] = React.useState('')
  const [confirmation, setConfirmation] = React.useState('')
  const [otpAccountKey, setOtpAccountKey] = React.useState(
    lock?.otpAccountKey ?? ''
  )
  const [duration, setDuration] = React.useState<IMd3UnlockDuration>(
    lock?.unlockDuration ?? DefaultMd3UnlockDuration
  )
  const [lockOnLaunch, setLockOnLaunch] = React.useState(
    lock?.lockOnLaunch ?? true
  )
  const [explanationOpen, setExplanationOpen] = React.useState(false)
  const [status, setStatus] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const firstFieldRef = React.useRef<HTMLInputElement | null>(null)
  const closeRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  React.useEffect(() => {
    const restoreTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    firstFieldRef.current?.focus()
    return () => {
      if (restoreTo?.isConnected === true) {
        restoreTo.focus()
      }
    }
  }, [])

  const position = md3LockPromptPosition(anchorRect, {
    width: typeof window === 'undefined' ? 340 : window.innerWidth,
    height: typeof window === 'undefined' ? 600 : window.innerHeight,
  })

  const onFactorChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFactor(event.currentTarget.value === 'otp' ? 'otp' : 'password')
      setStatus(null)
    },
    []
  )

  const onPasswordChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(event.currentTarget.value)
      setStatus(null)
    },
    []
  )

  const onConfirmationChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setConfirmation(event.currentTarget.value)
      setStatus(null)
    },
    []
  )

  const onOtpAccountChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setOtpAccountKey(event.currentTarget.value)
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

  const onLockOnLaunchChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setLockOnLaunch(event.currentTarget.checked)
    },
    []
  )

  const onToggleExplanation = React.useCallback(
    () => setExplanationOpen(current => !current),
    []
  )

  const save = React.useCallback(() => {
    if (busy) {
      return
    }

    if (editing && lock !== null) {
      const updated = updateMd3Lock(
        lock.id,
        {
          unlockDuration: duration,
          lockOnLaunch,
          otpAccountKey:
            factor === 'otp' ? otpAccountKey.trim() : lock.otpAccountKey,
        },
        storage
      )
      if (updated === null) {
        setStatus(t('md3.locks.setup.errorVault', { error: lock.id }))
        return
      }
      notify(t('md3.locks.toast.updated', { label: updated.target.label }))
      onSaved(updated)
      return
    }

    if (factor === 'otp') {
      if (!otpAvailable) {
        setStatus(t('md3.locks.setup.errorOtpUnavailable'))
        return
      }
      if (otpAccountKey.trim().length === 0) {
        setStatus(t('md3.locks.setup.errorOtpAccount'))
        return
      }
      const created = addMd3Lock(
        {
          target,
          factor: 'otp',
          unlockDuration: duration,
          lockOnLaunch,
          otpAccountKey: otpAccountKey.trim(),
        },
        storage
      )
      notify(t('md3.locks.toast.added', { label: created.target.label }))
      onSaved(created)
      return
    }

    if (!isValidMd3LockPassword(password)) {
      setStatus(
        t('md3.locks.setup.errorTooShort', {
          min: String(MinimumLockPasswordLength),
          max: String(MaximumLockPasswordLength),
        })
      )
      return
    }
    if (password !== confirmation) {
      setStatus(t('md3.locks.setup.errorMismatch'))
      return
    }

    // The lock record is written first so the credential has an id to hang on,
    // and removed again if the vault refuses — a lock nobody has the credential
    // for is the one state this feature must never leave behind.
    const created = addMd3Lock(
      { target, factor: 'password', unlockDuration: duration, lockOnLaunch },
      storage
    )
    setBusy(true)
    setMd3LockPassword(created.id, password, credentialVault).then(
      () => {
        setBusy(false)
        notify(t('md3.locks.toast.added', { label: created.target.label }))
        onSaved(created)
      },
      (error: Error) => {
        setBusy(false)
        // A lock nobody has the credential for is the one state this feature
        // must never leave behind, so the record written a moment ago goes too.
        removeMd3Locks([created.id], storage)
        setStatus(t('md3.locks.setup.errorVault', { error: error.message }))
      }
    )
  }, [
    busy,
    confirmation,
    credentialVault,
    duration,
    editing,
    factor,
    lock,
    lockOnLaunch,
    onSaved,
    otpAccountKey,
    otpAvailable,
    password,
    storage,
    target,
  ])

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      save()
    },
    [save]
  )

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

  const recovery =
    applicationDataFolder === null
      ? t('md3.locks.setup.recoveryUnknown')
      : t('md3.locks.setup.recovery', { folder: applicationDataFolder })

  // The provenance line is the truthful half of the settings contract: it says
  // whether this value came from something saved for this lock or from the
  // application's own compiled-in default, and names the real value either way.
  const durationProvenance =
    lock === null
      ? t('md3.locks.setup.provenanceDefault', {
          value: describeUnlockDuration(DefaultMd3UnlockDuration),
        })
      : t('md3.locks.setup.provenanceStored', {
          value: describeUnlockDuration(lock.unlockDuration),
        })

  return (
    // The dialog panel answers Escape itself, so the key never has to reach a
    // particular control inside it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      className="md3-lock-setup md3-anim-menu"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={`${leadId} ${statusId}`}
      style={{ top: position.top, left: position.left }}
      onKeyDown={onKeyDown}
      onSubmit={onSubmit}
    >
      <header className="md3-lock-setup__header">
        <MaterialSymbol
          name="lock"
          className="md3-lock-setup__header-icon"
          size={HeaderGlyphSize}
        />
        <h2 id={titleId} className="md3-lock-setup__title">
          {editing
            ? t('md3.locks.setup.titleEdit', { label: target.label })
            : t('md3.locks.setup.title', { label: target.label })}
        </h2>
        <Md3IconButton
          small={true}
          icon="close"
          iconSize={CloseGlyphSize}
          label={t('md3.locks.setup.close')}
          buttonRef={closeRef}
          onClick={onDismissed}
        />
      </header>

      <p id={leadId} className="md3-lock-setup__lead">
        {translateWithFunnyLevel(
          'md3.locks.setupLead',
          languageMode,
          funnyLevels
        )}
      </p>

      <button
        type="button"
        className="md3-lock-setup__explanation-toggle"
        aria-expanded={explanationOpen}
        aria-controls={explanationId}
        onClick={onToggleExplanation}
      >
        {explanationOpen
          ? t('md3.locks.setup.explanationHide')
          : t('md3.locks.setup.explanationShow')}
      </button>
      {explanationOpen ? (
        <p id={explanationId} className="md3-lock-setup__explanation">
          {t('md3.locks.setup.explanation')}
        </p>
      ) : null}

      {editing ? null : (
        <fieldset className="md3-lock-setup__factors">
          <legend>{t('md3.locks.setup.factorLegend')}</legend>
          <label className="md3-lock-setup__factor">
            <input
              type="radio"
              name={`md3-lock-setup-factor-${instanceId}`}
              value="password"
              checked={factor === 'password'}
              onChange={onFactorChanged}
            />
            <span>{t('md3.locks.setup.factorPassword')}</span>
          </label>
          <label className="md3-lock-setup__factor">
            <input
              type="radio"
              name={`md3-lock-setup-factor-${instanceId}`}
              value="otp"
              checked={factor === 'otp'}
              disabled={!otpAvailable}
              onChange={onFactorChanged}
            />
            <span>{t('md3.locks.setup.factorOtp')}</span>
          </label>
          {otpAvailable ? null : (
            // A disabled control names exactly which condition is unmet, rather
            // than sitting there greyed out with no explanation.
            <p className="md3-lock-setup__unavailable">
              {t('md3.locks.setup.otpUnavailable')}
            </p>
          )}
        </fieldset>
      )}

      {editing || factor === 'otp' ? null : (
        <>
          <label className="md3-lock-setup__field" htmlFor={passwordId}>
            <span>{t('md3.locks.setup.password')}</span>
            <input
              ref={firstFieldRef}
              id={passwordId}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              className="md3-lock-setup__input"
              value={password}
              aria-describedby={statusId}
              aria-invalid={status !== null}
              onChange={onPasswordChanged}
            />
          </label>
          <label className="md3-lock-setup__field" htmlFor={confirmId}>
            <span>{t('md3.locks.setup.passwordConfirm')}</span>
            <input
              id={confirmId}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              className="md3-lock-setup__input"
              value={confirmation}
              onChange={onConfirmationChanged}
            />
          </label>
        </>
      )}

      {factor === 'otp' ? (
        <label className="md3-lock-setup__field" htmlFor={otpId}>
          <span>{t('md3.locks.setup.otpAccount')}</span>
          <input
            id={otpId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            className="md3-lock-setup__input"
            value={otpAccountKey}
            onChange={onOtpAccountChanged}
          />
          <span className="md3-lock-setup__hint">
            {t('md3.locks.setup.otpAccountHint')}
          </span>
        </label>
      ) : null}

      <fieldset className="md3-lock-setup__durations">
        <legend>{t('md3.locks.setup.durationLegend')}</legend>
        {Md3UnlockDurationKinds.map(kind => (
          <label className="md3-lock-setup__duration" key={kind}>
            <input
              type="radio"
              name={`md3-lock-setup-duration-${instanceId}`}
              value={kind}
              checked={duration.kind === kind}
              onChange={onDurationChanged}
            />
            <span>{durationLabel(kind)}</span>
          </label>
        ))}
        {duration.kind === 'minutes' ? (
          <label className="md3-lock-setup__minutes" htmlFor={minutesId}>
            <span>{t('md3.locks.setup.minutesLabel')}</span>
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
        <p className="md3-lock-setup__provenance">{durationProvenance}</p>
      </fieldset>

      <label className="md3-lock-setup__toggle">
        <input
          type="checkbox"
          checked={lockOnLaunch}
          onChange={onLockOnLaunchChanged}
        />
        <span>{t('md3.locks.setup.lockOnLaunch')}</span>
      </label>

      <p
        id={statusId}
        className={classNames('md3-lock-setup__status', {
          'md3-lock-setup__status--problem': status !== null,
        })}
        role="status"
      >
        {status ?? ''}
      </p>

      {/* Fixed in every band and every language: this is not security. */}
      <p className="md3-lock-setup__for-fun">{t('md3.locks.setup.forFun')}</p>

      <p className="md3-lock-setup__recovery">{recovery}</p>

      <footer className="md3-lock-setup__footer">
        <Md3GhostButton
          label={t('md3.locks.setup.cancel')}
          onClick={onDismissed}
        />
        <Md3TonalButton
          label={t('md3.locks.setup.save')}
          icon="lock"
          disabled={busy}
          onClick={save}
          className="md3-lock-setup__save"
        />
      </footer>
    </form>
  )
}
