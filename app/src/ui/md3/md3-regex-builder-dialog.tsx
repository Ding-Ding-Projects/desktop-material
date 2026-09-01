import * as React from 'react'
import * as ReactDOM from 'react-dom'
import classNames from 'classnames'

import { t, TranslationKey } from '../../lib/i18n'
import {
  compileSafeRegex,
  getRegexInputLengthError,
  MaxRegexInputLength,
  MaxRegexPatternLength,
} from '../../lib/safe-regex'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { DialogEmoji } from '../lib/dialog-emoji'
import {
  flagsToString,
  IRegexFlags,
} from '../lib/regex-builder/regex-block-model'
import { RegexGuideSections } from '../lib/regex-builder/regex-builder-guide'
import { Md3IconButton, Md3TonalButton } from './md3-primitives'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'

/**
 * The MD3 regex builder dialog from `design/History MD3.dc.html` (the
 * `builderOpen` overlay).
 *
 * This is a *presentation* of the builder the app already has, not a second
 * one. Every regular expression it compiles goes through
 * {@link compileSafeRegex} — the vetted RE2 adapter in `lib/safe-regex.ts`,
 * which is linear-time by construction and therefore cannot freeze the
 * renderer through catastrophic backtracking — and its flag model is the
 * existing {@link IRegexFlags}/{@link flagsToString} pair from
 * `regex-block-model.ts`. No new regex engine is introduced here.
 *
 * The contract's evaluation used `new RegExp(pattern, flags)`. That is exactly
 * the native engine the repository forbids for user-authored patterns, so the
 * six contract flags are mapped onto the RE2 evaluator instead:
 *
 * - `i` compiles case-insensitively (RE2's own `CASE_INSENSITIVE`).
 * - `m` and `s` are applied as RE2's zero-width inline flag groups `(?m)` and
 *   `(?s)`, prefixed to the source. They shift no match index.
 * - `y` (sticky) is JavaScript's "must match at `lastIndex`" rule; on a fresh
 *   pattern that means index 0, so a match that does not start at 0 is
 *   reported as no match.
 * - `g` is a `lastIndex` bookkeeping flag. It never changes *whether* a string
 *   matches, so the tester ignores it; it is still carried into the applied
 *   `/pattern/flags` string, which is what the target search consumes.
 * - `u` is a no-op for the tester because RE2 is Unicode-aware unconditionally,
 *   so the flag is already the engine's behaviour rather than an opt-in.
 *
 * Two of the contract's tokens — `(?=…)` lookahead and `(?<=…)` lookbehind —
 * describe constructs RE2 does not implement at all. They are shipped exactly
 * as the contract lists them, and inserting one produces an honest
 * "Invalid pattern: …" from the live tester rather than a silently missing
 * button.
 */

/** The `construction` glyph beside the dialog title. */
const HeaderGlyphSize = 18

/** The `close` glyph in the header's icon button. */
const CloseGlyphSize = 16

/** The `check` glyph on the primary "Apply to search" pill. */
const ApplyGlyphSize = 16

/** The leading glyph on a guide section heading. */
const GuideGlyphSize = 16

/**
 * Shown in place of a capture group that did not participate in the match.
 * The contract's `m.slice(1).join(', ')` rendered those as `undefined`.
 */
const NonParticipatingGroup = '—'

/**
 * The dedicated top-level host this dialog is portalled into.
 *
 * The panel is a viewport-anchored (`position: fixed`) surface that must cover
 * the whole app. Rendered inline it is re-parented into whichever host
 * `<dialog>` opened it, and every non-modal dialog in this app is BOTH a
 * fixed-position containing block (`transform: scale(1)`, `_dialog.scss`) AND
 * a clipping box (`overflow: hidden`, `_dialog-layer.scss`). That pairing
 * re-anchors the `inset: 0` scrim to the small dialog box and crops it, so the
 * footer's Apply button falls below the clipped edge and a composed pattern can
 * never be applied. `#md3-regex-builder-layer` is collapsed with
 * `display: contents` in `_md3-regex-builder.scss`, generating no box at all,
 * so the dialog's geometry resolves against the real viewport. React portals
 * preserve component-tree event bubbling, so host surfaces that inspect
 * `event.target.closest(...)` keep working.
 */
const Md3RegexBuilderLayerId = 'md3-regex-builder-layer'

const FocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getMd3RegexBuilderPortalHost(): HTMLElement | null {
  if (typeof document === 'undefined' || document.body === null) {
    return null
  }

  const existing = document.getElementById(Md3RegexBuilderLayerId)
  if (existing !== null) {
    return existing
  }

  const host = document.createElement('div')
  host.id = Md3RegexBuilderLayerId
  document.body.appendChild(host)
  return host
}

/** React 16 has no `useId`; one counter gives each open dialog stable ids. */
let nextInstanceId = 0

/** The contract's flag row, in its exact order with its exact hint copy. */
interface IMd3RegexFlagDefinition {
  readonly key: keyof IRegexFlags
  readonly nameKey: TranslationKey
}

const Md3RegexFlags: ReadonlyArray<IMd3RegexFlagDefinition> = [
  { key: 'i', nameKey: 'md3.regexBuilder.flag.i' },
  { key: 'g', nameKey: 'md3.regexBuilder.flag.g' },
  { key: 'm', nameKey: 'md3.regexBuilder.flag.m' },
  { key: 's', nameKey: 'md3.regexBuilder.flag.s' },
  { key: 'u', nameKey: 'md3.regexBuilder.flag.u' },
  { key: 'y', nameKey: 'md3.regexBuilder.flag.y' },
]

interface IMd3RegexToken {
  /** The literal text inserted at the caret. */
  readonly token: string
  readonly labelKey: TranslationKey
}

interface IMd3RegexTokenGroup {
  /** Stable id used to build the group's heading/`aria-labelledby` pair. */
  readonly id: string
  readonly titleKey: TranslationKey
  readonly tokens: ReadonlyArray<IMd3RegexToken>
}

/** The contract's four token groups, verbatim. */
export const Md3RegexTokenGroups: ReadonlyArray<IMd3RegexTokenGroup> = [
  {
    id: 'anchors',
    titleKey: 'md3.regexBuilder.group.anchors',
    tokens: [
      { token: '^', labelKey: 'md3.regexBuilder.token.start' },
      { token: '$', labelKey: 'md3.regexBuilder.token.end' },
      { token: '\\b', labelKey: 'md3.regexBuilder.token.wordBoundary' },
      { token: '\\B', labelKey: 'md3.regexBuilder.token.notWordBoundary' },
    ],
  },
  {
    id: 'classes',
    titleKey: 'md3.regexBuilder.group.classes',
    tokens: [
      { token: '\\w', labelKey: 'md3.regexBuilder.token.word' },
      { token: '\\d', labelKey: 'md3.regexBuilder.token.digit' },
      { token: '\\s', labelKey: 'md3.regexBuilder.token.space' },
      { token: '[a-z]', labelKey: 'md3.regexBuilder.token.charRange' },
      { token: '[^x]', labelKey: 'md3.regexBuilder.token.notX' },
      { token: '.', labelKey: 'md3.regexBuilder.token.any' },
      { token: '\\W', labelKey: 'md3.regexBuilder.token.notWord' },
      { token: '\\D', labelKey: 'md3.regexBuilder.token.notDigit' },
      { token: '\\S', labelKey: 'md3.regexBuilder.token.notSpace' },
    ],
  },
  {
    id: 'quantifiers',
    titleKey: 'md3.regexBuilder.group.quantifiers',
    tokens: [
      { token: '+', labelKey: 'md3.regexBuilder.token.oneOrMore' },
      { token: '*', labelKey: 'md3.regexBuilder.token.zeroOrMore' },
      { token: '?', labelKey: 'md3.regexBuilder.token.optional' },
      { token: '{2,4}', labelKey: 'md3.regexBuilder.token.repeatRange' },
      { token: '{3}', labelKey: 'md3.regexBuilder.token.exactly' },
      { token: '{2,}', labelKey: 'md3.regexBuilder.token.atLeast' },
    ],
  },
  {
    id: 'groups',
    titleKey: 'md3.regexBuilder.group.groups',
    tokens: [
      { token: '(…)', labelKey: 'md3.regexBuilder.token.capture' },
      { token: '(?:…)', labelKey: 'md3.regexBuilder.token.nonCapture' },
      { token: 'a|b', labelKey: 'md3.regexBuilder.token.either' },
      { token: '(?=…)', labelKey: 'md3.regexBuilder.token.lookahead' },
      { token: '(?<=…)', labelKey: 'md3.regexBuilder.token.lookbehind' },
    ],
  },
  {
    id: 'lazy',
    titleKey: 'md3.regexBuilder.group.lazy',
    tokens: [
      { token: '+?', labelKey: 'md3.regexBuilder.token.lazyOneOrMore' },
      { token: '*?', labelKey: 'md3.regexBuilder.token.lazyZeroOrMore' },
      { token: '??', labelKey: 'md3.regexBuilder.token.lazyOptional' },
      { token: '{2,4}?', labelKey: 'md3.regexBuilder.token.lazyRepeatRange' },
    ],
  },
  {
    id: 'references',
    titleKey: 'md3.regexBuilder.group.references',
    tokens: [
      { token: '(?<name>…)', labelKey: 'md3.regexBuilder.token.namedCapture' },
      {
        token: '\\k<name>',
        labelKey: 'md3.regexBuilder.token.namedBackreference',
      },
      { token: '\\1', labelKey: 'md3.regexBuilder.token.backreference' },
      { token: '(?!…)', labelKey: 'md3.regexBuilder.token.negativeLookahead' },
      {
        token: '(?<!…)',
        labelKey: 'md3.regexBuilder.token.negativeLookbehind',
      },
    ],
  },
  {
    id: 'escapes',
    titleKey: 'md3.regexBuilder.group.escapes',
    tokens: [
      { token: '\\t', labelKey: 'md3.regexBuilder.token.tab' },
      { token: '\\n', labelKey: 'md3.regexBuilder.token.newline' },
      { token: '\\r', labelKey: 'md3.regexBuilder.token.carriageReturn' },
      { token: '\\x41', labelKey: 'md3.regexBuilder.token.hexEscape' },
      { token: '\\u2014', labelKey: 'md3.regexBuilder.token.unicodeEscape' },
      { token: '\\u{1F600}', labelKey: 'md3.regexBuilder.token.unicodePoint' },
      { token: '\\p{L}', labelKey: 'md3.regexBuilder.token.unicodeLetter' },
      { token: '\\p{Nd}', labelKey: 'md3.regexBuilder.token.unicodeNumber' },
      {
        token: '\\p{Script=Han}',
        labelKey: 'md3.regexBuilder.token.unicodeScript',
      },
    ],
  },
]

/**
 * Material Symbols for the shared guide sections. The guide's own definitions
 * carry Octicons because it is rendered by the pre-MD3 builder; the MD3
 * presentation needs a ligature, and every name below is in
 * `MaterialSymbolNames`.
 */
const GuideSectionIcons: {
  readonly [titleKey: string]: MaterialSymbolName | undefined
} = {
  'regex.builder.guide.matching.title': 'school',
  'regex.builder.guide.anchors.title': 'anchor',
  'regex.builder.guide.classes.title': 'category',
  'regex.builder.guide.quantifiers.title': 'repeat',
  'regex.builder.guide.groups.title': 'join_inner',
  'regex.builder.guide.alternation.title': 'call_split',
  'regex.builder.guide.flags.title': 'flag',
  'regex.builder.guide.usage.title': 'search',
}

/** The contract's three result states: idle, matched, failed. */
export type Md3RegexResultTone = 'idle' | 'match' | 'error'

export interface IMd3RegexEvaluation {
  readonly tone: Md3RegexResultTone
  readonly message: string
}

/** The flag set the contract's builder opens with (`builderFlags: ['i']`). */
export const Md3RegexDefaultFlags: IRegexFlags = {
  g: false,
  i: true,
  m: false,
  s: false,
  u: false,
  y: false,
}

/**
 * Compile the pattern through the renderer-safe RE2 evaluator and describe the
 * outcome exactly as the contract's live tester does.
 *
 * Exported so the behaviour is testable without mounting the dialog.
 */
export function evaluateMd3RegexPattern(
  pattern: string,
  flags: IRegexFlags,
  testString: string
): IMd3RegexEvaluation {
  if (pattern.length === 0) {
    return { tone: 'idle', message: t('md3.regexBuilder.result.idle') }
  }

  const inputError = getRegexInputLengthError(testString.length)
  if (inputError !== null) {
    return { tone: 'error', message: inputError }
  }

  const inlineFlags = `${flags.m ? '(?m)' : ''}${flags.s ? '(?s)' : ''}`
  const compilation = compileSafeRegex(inlineFlags + pattern, !flags.i)
  if (compilation.regex === null) {
    return {
      tone: 'error',
      message: t('md3.regexBuilder.result.invalid', {
        message: compilation.error ?? '',
      }),
    }
  }

  // One match is all the contract's result line reports, and asking for one
  // keeps the work bounded no matter how large the sample is.
  const { matches } = compilation.regex.findAll(testString, 1, true)
  const match = matches[0]
  if (match === undefined || (flags.y && match.index !== 0)) {
    return { tone: 'error', message: t('md3.regexBuilder.result.noMatch') }
  }

  if (match.groups.length === 0) {
    return {
      tone: 'match',
      message: t('md3.regexBuilder.result.match', { text: match.text }),
    }
  }

  return {
    tone: 'match',
    message: t('md3.regexBuilder.result.matchWithGroups', {
      text: match.text,
      groups: match.groups
        .map(group => group.value ?? NonParticipatingGroup)
        .join(', '),
    }),
  }
}

/** What the host must write back into the search field it opened this for. */
export interface IMd3RegexBuilderApplication {
  /** The composed pattern. */
  readonly pattern: string

  /** The full flag set, for a host that stores flags structurally. */
  readonly flags: IRegexFlags

  /** The same flags serialised, e.g. `gim` — what the panel renders. */
  readonly flagString: string

  /** `false` when the `i` flag is on; the shape `compileSafeRegex` takes. */
  readonly caseSensitive: boolean
}

export interface IMd3RegexBuilderDialogProps {
  /**
   * The contract's `builderTargetLabel` — a short name for the field this
   * applies to ("commits", "the diff", "workflow runs"). It is rendered in the
   * title and in the Apply button's accessible name, so six builders opened
   * from six search bars are distinguishable by ear as well as by eye.
   */
  readonly targetLabel: string

  /** Stable identity of the search surface this builder edits. */
  readonly searchSurfaceId?: string

  /** Optional trigger anchor for a non-modal, bounded builder popover. */
  readonly anchor?: HTMLElement | null

  /** Preferred edge when the builder is anchored to its trigger. */
  readonly anchorPosition?: PopoverAnchorPosition

  /** The pattern the originating field already holds. */
  readonly initialPattern: string

  /** Defaults to {@link Md3RegexDefaultFlags}. */
  readonly initialFlags?: IRegexFlags

  /**
   * Seeds the live tester. When omitted the first entry of `sampleItems` is
   * used, and when there is neither the tester opens empty — never with
   * invented sample content.
   */
  readonly initialTestString?: string

  /** Real candidates from the originating list, used to seed the tester. */
  readonly sampleItems?: ReadonlyArray<string>

  /**
   * Called with the composed pattern when "Apply to search" is pressed.
   *
   * The contract does two things here and the host must do both: write
   * `pattern` into the target search field AND turn that field's regex mode
   * on. Applying a pattern to a field still reading its query as plain text
   * would silently search for the pattern's literal characters.
   *
   * The dialog closes itself immediately afterwards by calling `onDismissed`.
   */
  readonly onApply: (application: IMd3RegexBuilderApplication) => void

  /** Called for the close button, the scrim, Escape, and after Apply. */
  readonly onDismissed: () => void

  /**
   * Opens the host's shared "How regex works" menu, per the contract's
   * `openRegexGuide`. When omitted the Guide button toggles the same guide
   * content inside this dialog instead, so the control always does something.
   */
  readonly onOpenGuide?: () => void

  /** Return focus to the launcher on unmount. Defaults to `true`. */
  readonly restoreFocusOnUnmount?: boolean
}

/**
 * The contract's regex builder overlay: a scrimmed modal dialog holding the
 * pattern row, the six flag toggles, the four token groups, the live tester
 * and the Apply / Clear / Guide footer.
 */
export function Md3RegexBuilderDialog(props: IMd3RegexBuilderDialogProps) {
  const {
    targetLabel,
    initialPattern,
    initialFlags,
    initialTestString,
    sampleItems,
    onApply,
    onDismissed,
    onOpenGuide,
  } = props

  const instanceId = React.useMemo(() => `md3-regex-${nextInstanceId++}`, [])
  const host = React.useMemo(() => getMd3RegexBuilderPortalHost(), [])

  // A compact viewport cannot hold the builder beside its trigger without
  // covering that trigger or hiding the token/tester regions. In that one
  // constrained case the existing centered dialog remains the honest,
  // bounded fallback. Normal desktop dimensions use Floating UI below.
  const anchored =
    props.anchor !== undefined &&
    props.anchor !== null &&
    typeof window !== 'undefined' &&
    window.innerWidth >= 620 &&
    window.innerHeight >= 560

  const [pattern, setPattern] = React.useState(initialPattern)
  const [flags, setFlags] = React.useState<IRegexFlags>(
    initialFlags ?? Md3RegexDefaultFlags
  )
  const [testString, setTestString] = React.useState(
    () =>
      initialTestString ??
      (sampleItems === undefined ? '' : sampleItems[0] ?? '')
  )
  const [showGuide, setShowGuide] = React.useState(false)

  const panelRef = React.useRef<HTMLDivElement>(null)
  const patternRef = React.useRef<HTMLInputElement>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(null)
  const pendingCaretRef = React.useRef<number | null>(null)

  // Mirrors, so the mount-once effects below never close over a stale prop and
  // never need the prop in their dependency list (which would re-run them).
  const dismissRef = React.useRef(onDismissed)
  dismissRef.current = onDismissed
  const restoreFocusRef = React.useRef(props.restoreFocusOnUnmount)
  restoreFocusRef.current = props.restoreFocusOnUnmount

  React.useEffect(() => {
    const active = document.activeElement
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null
    patternRef.current?.focus()

    return () => {
      if (restoreFocusRef.current === false) {
        return
      }
      const element = returnFocusRef.current
      window.requestAnimationFrame(() => {
        if (element !== null && element.isConnected) {
          element.focus()
        }
      })
    }
  }, [])

  React.useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissRef.current()
      }
    }

    window.addEventListener('keydown', onWindowKeyDown, true)
    return () => window.removeEventListener('keydown', onWindowKeyDown, true)
  }, [])

  // Put the caret after a token the user inserted, rather than at whichever
  // position React restored — otherwise a second insert lands in the wrong
  // place and composing a pattern by clicking becomes guesswork.
  React.useEffect(() => {
    const caret = pendingCaretRef.current
    if (caret === null) {
      return
    }
    pendingCaretRef.current = null
    const input = patternRef.current
    if (input === null) {
      return
    }
    input.focus()
    input.setSelectionRange(caret, caret)
  }, [pattern])

  const flagString = flagsToString(flags)
  const evaluation = evaluateMd3RegexPattern(pattern, flags, testString)

  const titleId = `${instanceId}-title`
  const resultId = `${instanceId}-result`

  const onPatternChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPattern(event.currentTarget.value)
    },
    []
  )

  const onTestChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTestString(event.currentTarget.value)
    },
    []
  )

  const onInsertToken = React.useCallback((token: string) => {
    const input = patternRef.current
    setPattern(current => {
      const start = input?.selectionStart ?? current.length
      const end = input?.selectionEnd ?? current.length
      const next = current.slice(0, start) + token + current.slice(end)
      if (next.length > MaxRegexPatternLength) {
        return current
      }
      pendingCaretRef.current = start + token.length
      return next
    })
  }, [])

  const onToggleFlag = React.useCallback((key: keyof IRegexFlags) => {
    setFlags(current => ({ ...current, [key]: !current[key] }))
  }, [])

  const onClear = React.useCallback(() => {
    setPattern('')
    patternRef.current?.focus()
  }, [])

  const onApplyClick = React.useCallback(() => {
    onApply({
      pattern,
      flags,
      flagString: flagsToString(flags),
      caseSensitive: !flags.i,
    })
    onDismissed()
  }, [onApply, onDismissed, pattern, flags])

  const onGuideClick = React.useCallback(() => {
    if (onOpenGuide !== undefined) {
      onOpenGuide()
      return
    }
    setShowGuide(current => !current)
  }, [onOpenGuide])

  const onScrimClick = React.useCallback(() => {
    onDismissed()
  }, [onDismissed])

  const onPanelClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation()
    },
    []
  )

  const onPanelKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
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
      ).filter(
        element => element.closest('[hidden], [aria-hidden="true"]') === null
      )

      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (active === last || !panel.contains(active))
      ) {
        event.preventDefault()
        first.focus()
      }
    },
    [onDismissed]
  )

  const onAnchoredOutside = React.useCallback(
    (event?: MouseEvent) => {
      // The trigger click that mounts this portal can continue bubbling after
      // the anchored Popover subscribes to document events. Treat that one
      // click as belonging to the builder opener, otherwise the builder
      // appears and immediately dismisses itself on roomy viewports.
      if (
        event?.target instanceof Node &&
        props.anchor !== undefined &&
        props.anchor !== null &&
        props.anchor.contains(event.target)
      ) {
        return
      }
      onDismissed()
    },
    [onDismissed, props.anchor]
  )

  if (host === null) {
    return null
  }

  const dialog = (
    // Click-to-dismiss on the scrim is a pointer convenience only. Every
    // keyboard route out of the dialog already exists and is reachable:
    // Escape (the window listener above) and the header's real close button,
    // which is in the tab order. Giving the scrim its own key handler would
    // add a second, undiscoverable way to do the same thing.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="md3-regex-builder-scrim md3-anim-fade--overlay"
      onClick={onScrimClick}
    >
      {/* A modal dialog is a non-interactive role, but a focus trap is
          precisely a keyboard handler on the container: it is what keeps Tab
          inside the modal and what makes Escape work when focus sits on a
          control that swallows the window listener. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={anchored ? false : true}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="md3-regex-builder md3-anim-menu"
        data-search-surface-id={props.searchSurfaceId}
        onClick={onPanelClick}
        onKeyDown={onPanelKeyDown}
      >
        <div className="md3-regex-builder__header">
          <MaterialSymbol
            name="construction"
            className="md3-regex-builder__header-icon"
            size={HeaderGlyphSize}
          />
          <DialogEmoji kind="search" />
          <span id={titleId} className="md3-regex-builder__title">
            {t('md3.regexBuilder.title', { target: targetLabel })}
          </span>
          <Md3IconButton
            small={true}
            icon="close"
            iconSize={CloseGlyphSize}
            label={t('md3.regexBuilder.close')}
            onClick={onScrimClick}
          />
        </div>

        <div className="md3-regex-builder__pattern">
          <span className="md3-regex-builder__delimiter" aria-hidden={true}>
            /
          </span>
          <input
            ref={patternRef}
            type="text"
            className="md3-regex-builder__pattern-input"
            placeholder={t('md3.regexBuilder.patternPlaceholder')}
            aria-label={t('md3.regexBuilder.patternLabel')}
            aria-describedby={resultId}
            value={pattern}
            maxLength={MaxRegexPatternLength}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={onPatternChange}
          />
          <span className="md3-regex-builder__delimiter" aria-hidden={true}>
            /{flagString}
          </span>
        </div>

        <div
          className="md3-regex-builder__flags"
          role="group"
          aria-label={t('md3.regexBuilder.flagsLabel')}
        >
          {Md3RegexFlags.map(flag => (
            <Md3RegexFlagToggle
              key={flag.key}
              flagKey={flag.key}
              name={t(flag.nameKey)}
              on={flags[flag.key]}
              onToggle={onToggleFlag}
            />
          ))}
        </div>

        <div className="md3-regex-builder__body">
          {showGuide ? (
            <Md3RegexGuide headingId={`${instanceId}-guide`} />
          ) : (
            Md3RegexTokenGroups.map(group => (
              <Md3RegexTokenGroupSection
                key={group.id}
                group={group}
                headingId={`${instanceId}-${group.id}`}
                onInsertToken={onInsertToken}
              />
            ))
          )}

          <div className="md3-regex-builder__tester">
            <span
              className="md3-regex-builder__section-title"
              id={`${instanceId}-tester`}
            >
              {t('md3.regexBuilder.tester')}
            </span>
            <input
              type="text"
              className="md3-regex-builder__test-input"
              placeholder={t('md3.regexBuilder.testLabel')}
              aria-label={t('md3.regexBuilder.testLabel')}
              aria-describedby={resultId}
              value={testString}
              maxLength={MaxRegexInputLength}
              spellCheck={false}
              autoComplete="off"
              onChange={onTestChange}
            />
            <span
              id={resultId}
              role="status"
              aria-live="polite"
              className={classNames(
                'md3-regex-builder__result',
                `md3-regex-builder__result--${evaluation.tone}`
              )}
            >
              {evaluation.message}
            </span>
          </div>
        </div>

        <div className="md3-regex-builder__footer">
          <button
            type="button"
            className="md3-regex-builder__apply"
            aria-label={t('md3.regexBuilder.applyName', {
              target: targetLabel,
            })}
            onClick={onApplyClick}
          >
            <MaterialSymbol name="check" size={ApplyGlyphSize} />
            <span>{t('md3.regexBuilder.apply')}</span>
          </button>
          <Md3TonalButton
            icon="backspace"
            label={t('md3.regexBuilder.clear')}
            accessibleName={t('md3.regexBuilder.clearName')}
            onClick={onClear}
          />
          <Md3TonalButton
            icon="help"
            label={t('md3.regexBuilder.guide')}
            accessibleName={t('md3.regexBuilder.guideName')}
            pressed={onOpenGuide === undefined ? showGuide : undefined}
            hasPopup={onOpenGuide === undefined ? undefined : 'menu'}
            onClick={onGuideClick}
          />
        </div>
      </div>
    </div>
  )

  const content = anchored ? (
    <Popover
      anchor={props.anchor ?? null}
      anchorPosition={props.anchorPosition ?? PopoverAnchorPosition.BottomLeft}
      decoration={PopoverDecoration.Bordered}
      trapFocus={true}
      isDialog={false}
      style={{ zIndex: 50 }}
      onClickOutside={onAnchoredOutside}
      onMousedownOutside={onAnchoredOutside}
    >
      {dialog.props.children}
    </Popover>
  ) : (
    dialog
  )

  return ReactDOM.createPortal(content, host)
}

interface IMd3RegexFlagToggleProps {
  readonly flagKey: keyof IRegexFlags
  readonly name: string
  readonly on: boolean
  readonly onToggle: (key: keyof IRegexFlags) => void
}

/** One of the six round 28px flag toggles. */
function Md3RegexFlagToggle(props: IMd3RegexFlagToggleProps) {
  const { onToggle, flagKey } = props
  const onClick = React.useCallback(() => {
    onToggle(flagKey)
  }, [onToggle, flagKey])

  return (
    <button
      type="button"
      className={classNames('md3-regex-builder__flag', {
        'md3-regex-builder__flag--active': props.on,
      })}
      aria-pressed={props.on}
      aria-label={t('md3.regexBuilder.flagToggle', {
        flag: flagKey,
        name: props.name,
      })}
      onClick={onClick}
    >
      {flagKey}
    </button>
  )
}

interface IMd3RegexTokenGroupSectionProps {
  readonly group: IMd3RegexTokenGroup
  readonly headingId: string
  readonly onInsertToken: (token: string) => void
}

function Md3RegexTokenGroupSection(props: IMd3RegexTokenGroupSectionProps) {
  return (
    <div className="md3-regex-builder__group">
      <span
        id={props.headingId}
        className="md3-regex-builder__section-title md3-regex-builder__group-title"
      >
        {t(props.group.titleKey)}
      </span>
      <div
        className="md3-regex-builder__tokens"
        role="group"
        aria-labelledby={props.headingId}
      >
        {props.group.tokens.map(token => (
          <Md3RegexTokenButton
            key={token.token}
            token={token}
            onInsertToken={props.onInsertToken}
          />
        ))}
      </div>
    </div>
  )
}

interface IMd3RegexTokenButtonProps {
  readonly token: IMd3RegexToken
  readonly onInsertToken: (token: string) => void
}

/** One 28px outlined token pill: the token itself plus its plain-language label. */
function Md3RegexTokenButton(props: IMd3RegexTokenButtonProps) {
  const { onInsertToken, token } = props
  const onClick = React.useCallback(() => {
    onInsertToken(token.token)
  }, [onInsertToken, token.token])

  const label = t(token.labelKey)

  return (
    <button
      type="button"
      className="md3-regex-builder__token"
      aria-label={t('md3.regexBuilder.token.insert', {
        token: token.token,
        label,
      })}
      onClick={onClick}
    >
      <span className="md3-regex-builder__token-code">{token.token}</span>
      <span className="md3-regex-builder__token-label">{label}</span>
    </button>
  )
}

interface IMd3RegexGuideProps {
  readonly headingId: string
}

/**
 * The in-dialog "How regex works" panel, rendered from the same
 * {@link RegexGuideSections} content the pre-MD3 builder teaches from, so the
 * two surfaces can never disagree about what the dialect supports.
 */
function Md3RegexGuide(props: IMd3RegexGuideProps) {
  return (
    <section
      className="md3-regex-builder__guide"
      aria-labelledby={props.headingId}
    >
      <span
        id={props.headingId}
        className="md3-regex-builder__section-title md3-regex-builder__group-title"
      >
        {t('md3.regexBuilder.guideHeading')}
      </span>
      {RegexGuideSections.map(section => (
        <div
          key={section.titleKey}
          className="md3-regex-builder__guide-section"
        >
          <h3 className="md3-regex-builder__guide-heading">
            <MaterialSymbol
              name={GuideSectionIcons[section.titleKey] ?? 'help'}
              size={GuideGlyphSize}
            />
            <span>{t(section.titleKey)}</span>
          </h3>
          <p className="md3-regex-builder__guide-body">{t(section.bodyKey)}</p>
          {section.code === undefined ? null : (
            <p className="md3-regex-builder__guide-code">
              <span className="md3-regex-builder__guide-code-token">
                {section.code}
              </span>
              {section.codeNoteKey === undefined ? null : (
                <span className="md3-regex-builder__guide-code-note">
                  {' '}
                  {t(section.codeNoteKey)}
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}
