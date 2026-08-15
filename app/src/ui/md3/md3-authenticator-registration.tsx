import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode } from '../../models/language-mode'
import {
  decodeBase32,
  encodeBase32,
  groupBase32,
  isBase32,
} from '../../lib/authenticator/base32'
import {
  buildOtpauthUri,
  IOtpauthDescriptor,
  OtpauthParseFailure,
  parseOtpauthUri,
} from '../../lib/authenticator/otpauth-uri'
import {
  clampTotpDigits,
  clampTotpPeriod,
  DefaultTotpAlgorithm,
  DefaultTotpDigits,
  DefaultTotpPeriod,
  generateTotpSecret,
  MaximumTotpDigits,
  MinimumTotpDigits,
  parseTotpAlgorithm,
  TotpAlgorithm,
  TotpAlgorithms,
  verifyTotp,
} from '../../lib/authenticator/totp'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { DialogEmoji } from '../lib/dialog-emoji'
import { Md3GhostButton, Md3IconButton, Md3TonalButton } from './md3-primitives'
import { notify } from './md3-toast'
import { Md3AuthenticatorQr } from './md3-authenticator-qr'
import {
  decodeQrFromBlob,
  hasCameraDevice,
  IMd3CameraScan,
  Md3CaptureResult,
  readQrFromClipboard,
  startCameraScan,
} from './md3-authenticator-capture'

/**
 * Registering a second factor, and editing one that already exists.
 *
 * Every route the contract names converges here: a secret generated on this
 * machine, an `otpauth://` link pasted in, a QR read from an image file, a QR
 * read from the clipboard, a QR scanned with a camera, and a base32 secret
 * typed by hand. All six produce the same descriptor, and all six then have to
 * pass the same pairing confirmation — the user types one current code back,
 * and nothing is stored until it matches.
 *
 * That last step is the one worth defending. Without it a mis-scanned or
 * mistyped secret is stored perfectly, produces beautifully formatted digits,
 * and is refused by every server on earth — and the first the user hears of it
 * is at a login screen, with no error anywhere to read.
 *
 * The generated secret is shown exactly once, here, behind an explicit reveal.
 * From the moment it reaches the credential vault neither this app nor anybody
 * working on it displays, hints at, or characterises its value, length or
 * composition.
 */

/** Where a registration's secret comes from. */
export type Md3RegistrationSource =
  | 'generate'
  | 'uri'
  | 'manual'
  | 'image'
  | 'clipboard'
  | 'camera'

/** The sources, in the order the picker lists them. */
export const Md3RegistrationSources: ReadonlyArray<Md3RegistrationSource> = [
  'generate',
  'uri',
  'manual',
  'image',
  'clipboard',
  'camera',
]

const SourceIcons: Readonly<Record<Md3RegistrationSource, MaterialSymbolName>> =
  {
    generate: 'auto_awesome',
    uri: 'content_paste_go',
    manual: 'edit',
    image: 'folder_open',
    clipboard: 'content_paste',
    camera: 'crop_square',
  }

/** What the dialog hands back once a factor has proved itself. */
export interface IMd3RegistrationResult {
  readonly issuer: string
  readonly account: string
  readonly group: string
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  readonly period: number
  /**
   * The base32 secret, for the credential vault and nowhere else. Absent in
   * edit mode, where the existing secret is never re-read or re-shown.
   */
  readonly secret?: string
}

/** The entry being edited, when the dialog opens in edit mode. */
export interface IMd3RegistrationSubject {
  readonly title: string
  readonly issuer: string
  readonly account: string
  readonly group: string
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  readonly period: number
}

export interface IMd3AuthenticatorRegistrationProps {
  /** Omit to register a new factor; supply one to edit an existing entry. */
  readonly subject?: IMd3RegistrationSubject

  /** Existing group names, offered as a datalist rather than free text alone. */
  readonly groups?: ReadonlyArray<string>

  /** Called once the pairing has been confirmed. */
  readonly onCommit: (result: IMd3RegistrationResult) => void

  /** The close button, the scrim and Escape all call this. */
  readonly onDismissed: () => void

  /** Copy text to the clipboard. Omit and the copy actions are not rendered. */
  readonly onCopy?: (text: string) => void

  /** Overridable so a test can pin the instant codes are checked against. */
  readonly nowUnixSeconds?: () => number

  /** Overridable so a test can supply a known secret instead of fresh entropy. */
  readonly generateSecret?: () => Uint8Array
}

/** Focusable descendants of the panel, in tab order. */
const FocusableSelector = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const HeaderGlyphSize = 18
const SourceGlyphSize = 15

let registrationSequence = 0

function captureFailureMessage(result: Md3CaptureResult): string {
  if (result.ok) {
    return ''
  }
  switch (result.reason) {
    case 'unreadable-file':
      return t('md3.auth.register.error.unreadableFile')
    case 'no-image':
    case 'no-finder-patterns':
      return t('md3.auth.register.error.noQr')
    case 'not-a-qr-grid':
    case 'unreadable-format':
      return t('md3.auth.register.error.notSquare')
    case 'too-damaged':
      return t('md3.auth.register.error.damaged')
    case 'unsupported-content':
      return t('md3.auth.register.error.unsupported')
  }
}

function parseFailureMessage(reason: OtpauthParseFailure): string {
  switch (reason) {
    case 'wrong-type':
      return t('md3.auth.register.error.wrongType')
    case 'bad-secret':
      return t('md3.auth.register.error.badSecret')
    case 'missing-account':
      return t('md3.auth.register.error.missingAccount')
    default:
      return t('md3.auth.register.error.badUri')
  }
}

export function Md3AuthenticatorRegistration(
  props: IMd3AuthenticatorRegistrationProps
) {
  const {
    subject,
    groups,
    onCommit,
    onDismissed,
    onCopy,
    nowUnixSeconds,
    generateSecret,
  } = props

  const editing = subject !== undefined

  const voice = React.useMemo<{
    readonly languageMode: LanguageMode
    readonly funnyLevels: IFunnyLevels
  }>(
    () => ({
      languageMode: getPersistedLanguageMode(),
      funnyLevels: readFunnyLevels(),
    }),
    []
  )

  const instanceId = React.useMemo(() => ++registrationSequence, [])
  const titleId = `md3-auth-register-title-${instanceId}`
  const explainId = `md3-auth-register-explain-${instanceId}`
  const errorId = `md3-auth-register-error-${instanceId}`
  const groupListId = `md3-auth-register-groups-${instanceId}`

  const [source, setSource] = React.useState<Md3RegistrationSource>('generate')
  const [issuer, setIssuer] = React.useState(subject?.issuer ?? '')
  const [account, setAccount] = React.useState(subject?.account ?? '')
  const [group, setGroup] = React.useState(subject?.group ?? '')
  const [algorithm, setAlgorithm] = React.useState<TotpAlgorithm>(
    subject?.algorithm ?? DefaultTotpAlgorithm
  )
  const [digits, setDigits] = React.useState(
    subject?.digits ?? DefaultTotpDigits
  )
  const [period, setPeriod] = React.useState(
    subject?.period ?? DefaultTotpPeriod
  )
  const [typedSecret, setTypedSecret] = React.useState('')
  const [uriText, setUriText] = React.useState('')
  const [revealed, setRevealed] = React.useState(false)
  const [explained, setExplained] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [cameraAvailable, setCameraAvailable] = React.useState<boolean | null>(
    null
  )
  const [cameraRunning, setCameraRunning] = React.useState(false)
  /** True once a source other than `generate` supplied the parameters. */
  const [fromIssuer, setFromIssuer] = React.useState(false)

  const panelRef = React.useRef<HTMLFormElement | null>(null)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const scanRef = React.useRef<IMd3CameraScan | null>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)
  const closeRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  /**
   * The generated secret, minted once per dialog and never regenerated by a
   * re-render. Regenerating it under the user would invalidate a QR they were
   * halfway through scanning.
   */
  const generated = React.useMemo(
    () => encodeBase32((generateSecret ?? generateTotpSecret)()),
    [generateSecret]
  )

  React.useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeRef.current?.focus()
    const restoreTo = previouslyFocused.current
    return () => {
      if (restoreTo?.isConnected === true) {
        restoreTo.focus()
      }
    }
  }, [closeRef])

  React.useEffect(() => {
    let live = true
    void hasCameraDevice().then(available => {
      if (live) {
        setCameraAvailable(available)
      }
    })
    return () => {
      live = false
    }
  }, [])

  // A camera left running behind a closed dialog keeps the platform's own
  // recording indicator lit, which is alarming and entirely our fault.
  React.useEffect(
    () => () => {
      scanRef.current?.stop()
      scanRef.current = null
    },
    []
  )

  const secret = editing
    ? ''
    : source === 'generate'
    ? generated
    : typedSecret.replace(/[\s-]/g, '').toUpperCase()

  const secretValid = editing || (secret.length > 0 && isBase32(secret))

  const descriptor = React.useMemo<IOtpauthDescriptor | null>(() => {
    if (editing || !secretValid || account.trim().length === 0) {
      return null
    }
    return { account, issuer, secret, algorithm, digits, period }
  }, [editing, secretValid, account, issuer, secret, algorithm, digits, period])

  /** Adopt a descriptor read from a link, an image, the clipboard or a camera. */
  const adopt = React.useCallback((adopted: IOtpauthDescriptor) => {
    setIssuer(adopted.issuer)
    setAccount(adopted.account)
    setAlgorithm(adopted.algorithm)
    setDigits(adopted.digits)
    setPeriod(adopted.period)
    setTypedSecret(adopted.secret)
    setFromIssuer(true)
    setError(null)
  }, [])

  const adoptText = React.useCallback(
    (text: string) => {
      const parsed = parseOtpauthUri(text)
      if (parsed.ok) {
        adopt(parsed.descriptor)
        return
      }
      setError(parseFailureMessage(parsed.reason))
    },
    [adopt]
  )

  const onSelectSource = React.useCallback((next: Md3RegistrationSource) => {
    scanRef.current?.stop()
    scanRef.current = null
    setCameraRunning(false)
    setSource(next)
    setError(null)
    if (next === 'generate') {
      setFromIssuer(false)
    }
  }, [])

  const onSourceKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = Md3RegistrationSources.indexOf(source)
      if (index === -1) {
        return
      }
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
      if (step === 0) {
        return
      }
      event.preventDefault()
      const next =
        Md3RegistrationSources[
          (index + step + Md3RegistrationSources.length) %
            Md3RegistrationSources.length
        ]
      onSelectSource(next)
      const buttons =
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role="radio"]'
        )
      buttons[Md3RegistrationSources.indexOf(next)]?.focus()
    },
    [source, onSelectSource]
  )

  const onChooseImage = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      // Clear the input so choosing the same file twice still fires a change.
      event.currentTarget.value = ''
      if (file === undefined) {
        return
      }
      const result = await decodeQrFromBlob(file)
      if (result.ok) {
        adoptText(result.text)
        return
      }
      setError(captureFailureMessage(result))
    },
    [adoptText]
  )

  const onReadClipboard = React.useCallback(async () => {
    const result = await readQrFromClipboard()
    if (result.ok) {
      adoptText(result.text)
      return
    }
    setError(captureFailureMessage(result))
  }, [adoptText])

  const onStartCamera = React.useCallback(async () => {
    const video = videoRef.current
    if (video === null) {
      return
    }
    setError(null)
    setCameraRunning(true)
    scanRef.current = await startCameraScan(
      video,
      text => {
        setCameraRunning(false)
        adoptText(text)
      },
      reason => {
        setCameraRunning(false)
        setError(
          reason === 'no-camera'
            ? t('md3.auth.register.cameraMissing')
            : t('md3.auth.register.cameraRefused')
        )
      }
    )
  }, [adoptText])

  const onStopCamera = React.useCallback(() => {
    scanRef.current?.stop()
    scanRef.current = null
    setCameraRunning(false)
  }, [])

  const onUriChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value
      setUriText(value)
      // Parse as the user types rather than behind a button: a pasted link is
      // one gesture, and asking for a second one to "apply" it is ceremony.
      if (value.trim().length > 0) {
        adoptText(value)
      }
    },
    [adoptText]
  )

  const onTypedSecretChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setTypedSecret(event.currentTarget.value),
    []
  )

  const onIssuerChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setIssuer(event.currentTarget.value),
    []
  )

  const onAccountChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setAccount(event.currentTarget.value),
    []
  )

  const onGroupChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setGroup(event.currentTarget.value),
    []
  )

  const onAlgorithmChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      setAlgorithm(
        parseTotpAlgorithm(event.currentTarget.value) ?? DefaultTotpAlgorithm
      ),
    []
  )

  const onDigitsChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setDigits(clampTotpDigits(Number(event.currentTarget.value))),
    []
  )

  const onPeriodChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setPeriod(clampTotpPeriod(Number(event.currentTarget.value))),
    []
  )

  const onCodeChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setCode(event.currentTarget.value.replace(/[^0-9]/g, ''))
      setError(null)
    },
    []
  )

  const onToggleRevealed = React.useCallback(
    () => setRevealed(current => !current),
    []
  )

  const onToggleExplained = React.useCallback(
    () => setExplained(current => !current),
    []
  )

  const onImageChosen = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      void onChooseImage(event)
    },
    [onChooseImage]
  )

  const onClipboardRequested = React.useCallback(() => {
    void onReadClipboard()
  }, [onReadClipboard])

  const onCameraToggled = React.useCallback(() => {
    if (cameraRunning) {
      onStopCamera()
    } else {
      void onStartCamera()
    }
  }, [cameraRunning, onStopCamera, onStartCamera])

  const onEncodeFailed = React.useCallback(
    (detail: string) =>
      setError(t('md3.auth.register.error.encodeFailed', { detail })),
    []
  )

  const onCommitClicked = React.useCallback(
    () => panelRef.current?.requestSubmit(),
    []
  )

  const onCopySecret = React.useCallback(() => {
    onCopy?.(secret)
    notify(t('md3.auth.register.copiedSecret'))
  }, [onCopy, secret])

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (account.trim().length === 0) {
        setError(t('md3.auth.register.error.accountRequired'))
        return
      }

      if (editing) {
        onCommit({
          issuer,
          account,
          group,
          algorithm,
          digits,
          period,
        })
        return
      }

      if (!secretValid) {
        setError(t('md3.auth.register.error.badSecret'))
        return
      }

      // The pairing confirmation. Nothing reaches the vault until a code the
      // user read off their own authenticator matches this secret.
      const now = (nowUnixSeconds ?? (() => Date.now() / 1000))()
      const matched = verifyTotp(
        decodeBase32(secret),
        code,
        now,
        { algorithm, digits, period },
        1
      )
      if (!matched) {
        setError(t('md3.auth.register.verifyFailed'))
        return
      }

      onCommit({
        issuer,
        account,
        group,
        algorithm,
        digits,
        period,
        secret,
      })
    },
    [
      account,
      editing,
      onCommit,
      issuer,
      group,
      algorithm,
      digits,
      period,
      secretValid,
      nowUnixSeconds,
      secret,
      code,
    ]
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
      ).filter(element => element.getClientRects().length > 0)
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

  const parameterVariables = {
    algorithm,
    digits: String(digits),
    period: String(period),
  }

  const provenance = fromIssuer
    ? t('md3.auth.register.explain.provenanceIssuer', parameterVariables)
    : t('md3.auth.register.explain.provenanceDefault', parameterVariables)

  const qrAlt =
    issuer.trim().length === 0
      ? t('md3.auth.register.qrAltNoIssuer', {
          account,
          ...parameterVariables,
        })
      : t('md3.auth.register.qrAlt', {
          account,
          issuer,
          ...parameterVariables,
        })

  const canSubmit = editing
    ? account.trim().length > 0
    : account.trim().length > 0 && secretValid && code.trim().length >= digits

  /**
   * Exactly which condition is holding the commit button shut.
   *
   * A disabled control that says nothing reads as broken rather than blocked,
   * so this is rendered as the button's own hover hint and reaches assistive
   * technology through it.
   */
  const unmetCondition =
    account.trim().length === 0
      ? t('md3.auth.register.error.accountRequired')
      : !editing && !secretValid
      ? t('md3.auth.register.error.badSecret')
      : !editing && code.trim().length < digits
      ? t('md3.auth.register.confirmHint.plain')
      : undefined

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       the scrim is a click target for dismissal only. Escape and the two
       explicit close controls are the keyboard routes, so it carries no
       keyboard handler of its own and nothing is reachable only through it. */
    <div
      className="md3-auth-register md3-anim-fade--overlay"
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
        className="md3-auth-register__panel md3-anim-sheet"
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
      >
        <header className="md3-auth-register__header">
          <MaterialSymbol
            name="key"
            className="md3-auth-register__header-icon"
            size={HeaderGlyphSize}
          />
          <DialogEmoji kind="security" />
          <h2 id={titleId} className="md3-auth-register__title">
            {editing
              ? t('md3.auth.register.editTitle', { title: subject.title })
              : t('md3.auth.register.title')}
          </h2>
          <Md3IconButton
            small={true}
            icon="close"
            label={t('md3.auth.register.close')}
            buttonRef={closeRef}
            onClick={onDismissed}
          />
        </header>

        {editing ? null : (
          <>
            {/*
              The group itself is never a tab stop: the roving tabindex lives
              on the radios, exactly as the ARIA pattern asks, so Tab reaches
              the picker once and the arrow keys move within it. `tabIndex={-1}`
              says that explicitly rather than leaving it to be inferred.
            */}
            <div
              className="md3-auth-register__sources"
              role="radiogroup"
              tabIndex={-1}
              aria-label={t('md3.auth.register.sourceLegend')}
              onKeyDown={onSourceKeyDown}
            >
              {Md3RegistrationSources.map(candidate => (
                <SourceButton
                  key={candidate}
                  source={candidate}
                  active={candidate === source}
                  onSelect={onSelectSource}
                />
              ))}
            </div>
            <p className="md3-auth-register__hint">{sourceHint(source)}</p>
          </>
        )}

        {editing || source !== 'uri' ? null : (
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.uriLabel')}</span>
            <input
              type="text"
              className="md3-auth-register__input"
              placeholder={t('md3.auth.register.uriPlaceholder')}
              value={uriText}
              spellCheck={false}
              autoComplete="off"
              onChange={onUriChange}
            />
          </label>
        )}

        {editing || source !== 'manual' ? null : (
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.secretLabel')}</span>
            <input
              type={revealed ? 'text' : 'password'}
              className="md3-auth-register__input"
              placeholder={t('md3.auth.register.secretPlaceholder')}
              value={typedSecret}
              spellCheck={false}
              autoComplete="off"
              onChange={onTypedSecretChange}
            />
          </label>
        )}

        {editing || source !== 'image' ? null : (
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.chooseImage')}</span>
            <input
              type="file"
              className="md3-auth-register__file"
              accept="image/*"
              onChange={onImageChosen}
            />
          </label>
        )}

        {editing || source !== 'clipboard' ? null : (
          <div className="md3-auth-register__row">
            <Md3TonalButton
              label={t('md3.auth.register.readClipboard')}
              icon="content_paste"
              onClick={onClipboardRequested}
            />
          </div>
        )}

        {editing || source !== 'camera' ? null : (
          <div className="md3-auth-register__camera">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption --
                a live viewfinder has no track to caption; the status line
                beneath it is what tells a non-sighted user what is happening. */}
            <video
              ref={videoRef}
              className="md3-auth-register__video"
              aria-label={t('md3.auth.register.cameraPreview')}
              playsInline={true}
            />
            <div className="md3-auth-register__row">
              <Md3TonalButton
                label={
                  cameraRunning
                    ? t('md3.auth.register.stopCamera')
                    : t('md3.auth.register.startCamera')
                }
                icon="crop_square"
                disabled={cameraAvailable === false}
                onClick={onCameraToggled}
              />
            </div>
            <p className="md3-auth-register__status" role="status">
              {cameraAvailable === false
                ? t('md3.auth.register.cameraMissing')
                : cameraRunning
                ? t('md3.auth.register.cameraLive')
                : ''}
            </p>
          </div>
        )}

        {editing || source !== 'generate' || descriptor === null ? null : (
          <div className="md3-auth-register__pairing">
            <Md3AuthenticatorQr
              value={buildOtpauthUri(descriptor)}
              alternativeText={qrAlt}
              onEncodeFailed={onEncodeFailed}
            />
            <div className="md3-auth-register__pairing-copy">
              <p className="md3-auth-register__caption">
                {t('md3.auth.register.qrCaption')}
              </p>
              <p className="md3-auth-register__parameters">
                {t('md3.auth.register.parameterSummary', parameterVariables)}
              </p>
              {revealed ? (
                <output className="md3-auth-register__secret">
                  {groupBase32(secret)}
                </output>
              ) : (
                <p className="md3-auth-register__secret-hidden">
                  {t('md3.auth.register.secretHidden')}
                </p>
              )}
              <div className="md3-auth-register__row">
                <Md3GhostButton
                  label={
                    revealed
                      ? t('md3.auth.register.hideSecret')
                      : t('md3.auth.register.revealSecret')
                  }
                  icon="visibility"
                  pressed={revealed}
                  onClick={onToggleRevealed}
                />
                {onCopy === undefined || !revealed ? null : (
                  <Md3GhostButton
                    label={t('md3.auth.register.copySecret')}
                    icon="content_copy"
                    onClick={onCopySecret}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="md3-auth-register__grid">
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.issuerLabel')}</span>
            <input
              type="text"
              className="md3-auth-register__input"
              placeholder={t('md3.auth.register.issuerPlaceholder')}
              value={issuer}
              autoComplete="off"
              onChange={onIssuerChange}
            />
          </label>
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.accountLabel')}</span>
            <input
              type="text"
              className="md3-auth-register__input"
              placeholder={t('md3.auth.register.accountPlaceholder')}
              value={account}
              required={true}
              autoComplete="off"
              onChange={onAccountChange}
            />
          </label>
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.groupLabel')}</span>
            <input
              type="text"
              className="md3-auth-register__input"
              placeholder={t('md3.auth.register.groupPlaceholder')}
              list={groupListId}
              value={group}
              autoComplete="off"
              onChange={onGroupChange}
            />
            <datalist id={groupListId}>
              {(groups ?? []).map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.algorithmLabel')}</span>
            <select
              className="md3-auth-register__input"
              value={algorithm}
              onChange={onAlgorithmChange}
            >
              {TotpAlgorithms.map(candidate => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.digitsLabel')}</span>
            <input
              type="number"
              className="md3-auth-register__input"
              min={MinimumTotpDigits}
              max={MaximumTotpDigits}
              value={digits}
              onChange={onDigitsChange}
            />
          </label>
          <label className="md3-auth-register__field">
            <span>{t('md3.auth.register.periodLabel')}</span>
            <input
              type="number"
              className="md3-auth-register__input"
              min={1}
              value={period}
              onChange={onPeriodChange}
            />
          </label>
        </div>

        <div className="md3-auth-register__explain">
          <button
            type="button"
            className="md3-auth-register__explain-toggle"
            aria-expanded={explained}
            aria-controls={explainId}
            onClick={onToggleExplained}
          >
            <MaterialSymbol name="help" size={SourceGlyphSize} />
            <span>{t('md3.auth.register.explain.toggle')}</span>
          </button>
          <p id={explainId} hidden={!explained}>
            {t('md3.auth.register.explain.storage')}
          </p>
          <p className="md3-auth-register__provenance">{provenance}</p>
        </div>

        {editing ? null : (
          <fieldset className="md3-auth-register__confirm">
            <legend>{t('md3.auth.register.confirmHeading')}</legend>
            <p className="md3-auth-register__hint">
              {translateWithFunnyLevel(
                'md3.auth.register.confirmHint',
                voice.languageMode,
                voice.funnyLevels
              )}
            </p>
            <label className="md3-auth-register__field">
              <span>{t('md3.auth.register.confirmLabel')}</span>
              <input
                type="text"
                className="md3-auth-register__input md3-auth-register__code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('md3.auth.register.confirmPlaceholder')}
                value={code}
                aria-invalid={error !== null}
                aria-describedby={error === null ? undefined : errorId}
                onChange={onCodeChange}
              />
            </label>
          </fieldset>
        )}

        {error === null ? null : (
          <p id={errorId} className="md3-auth-register__error" role="alert">
            <MaterialSymbol name="error" size={SourceGlyphSize} />
            <span>{error}</span>
          </p>
        )}

        <footer className="md3-auth-register__footer">
          <Md3GhostButton
            label={t('md3.auth.register.cancel')}
            icon="close"
            onClick={onDismissed}
          />
          <Md3TonalButton
            label={
              editing ? t('md3.auth.register.save') : t('md3.auth.register.add')
            }
            icon="check"
            disabled={!canSubmit}
            tooltip={canSubmit ? undefined : unmetCondition}
            className="md3-auth-register__commit"
            onClick={onCommitClicked}
          />
        </footer>
      </form>
    </div>
  )
}

function sourceLabel(source: Md3RegistrationSource): string {
  switch (source) {
    case 'generate':
      return t('md3.auth.register.source.generate')
    case 'uri':
      return t('md3.auth.register.source.uri')
    case 'manual':
      return t('md3.auth.register.source.manual')
    case 'image':
      return t('md3.auth.register.source.image')
    case 'clipboard':
      return t('md3.auth.register.source.clipboard')
    case 'camera':
      return t('md3.auth.register.source.camera')
  }
}

function sourceHint(source: Md3RegistrationSource): string {
  switch (source) {
    case 'generate':
      return t('md3.auth.register.hint.generate')
    case 'uri':
      return t('md3.auth.register.hint.uri')
    case 'manual':
      return t('md3.auth.register.hint.manual')
    case 'image':
      return t('md3.auth.register.hint.image')
    case 'clipboard':
      return t('md3.auth.register.hint.clipboard')
    case 'camera':
      return t('md3.auth.register.hint.camera')
  }
}

interface ISourceButtonProps {
  readonly source: Md3RegistrationSource
  readonly active: boolean
  readonly onSelect: (source: Md3RegistrationSource) => void
}

function SourceButton(props: ISourceButtonProps) {
  const { source, active, onSelect } = props
  const onClick = React.useCallback(() => onSelect(source), [onSelect, source])

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      className={classNames('md3-auth-register__source', {
        'md3-auth-register__source--active': active,
      })}
      onClick={onClick}
    >
      <MaterialSymbol name={SourceIcons[source]} size={SourceGlyphSize} />
      <span>{sourceLabel(source)}</span>
    </button>
  )
}
