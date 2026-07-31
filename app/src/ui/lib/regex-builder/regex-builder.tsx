import * as React from 'react'
import * as ReactDOM from 'react-dom'
import classNames from 'classnames'
import { Octicon, OcticonSymbol } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import { IRegexFlags, flagsToString } from './regex-block-model'
import { RegexCategories, RegexBuilderPalette } from './regex-builder-palette'
import { RegexTestArea } from './regex-test-area'
import { RegexBuilderGuide } from './regex-builder-guide'
import { clampDialogOffset } from '../../dialog/dialog-geometry'
import {
  compileSafeRegex,
  MaxRegexInputLength,
  MaxRegexPatternLength,
} from '../../../lib/safe-regex'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../../lib/i18n'
import {
  LanguageMode,
  normalizeLanguageMode,
} from '../../../models/language-mode'

/** The maximum number of visible items used to seed the tester's sample. */
const MaxSampleItems = 50

/**
 * Id of the dedicated top-level layer the builder overlay is portalled into.
 * Kept alongside `#dialog-layer` / `#foldout-container` / `#dragElement` as one
 * of the app's inert overlay hosts.
 */
const RegexBuilderLayerId = 'regex-builder-layer'
const RegexBuilderFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Resolve (creating once) the top-level host the builder overlay renders into.
 *
 * The builder is a viewport-anchored (`position: fixed`) floating surface that
 * must cover the whole app. Rendered inline it is re-parented into whichever
 * host `<dialog>` opened it, and every non-modal dialog is BOTH a fixed-position
 * containing block (`transform: scale(1)`, _dialog.scss) AND a clipping box
 * (`overflow: hidden`, _dialog-layer.scss). That combination re-anchors the
 * `inset: 0` overlay to the small dialog box and crops it — the palette rail and
 * live tester lose ~150px per side inside a 600px dialog and the footer "Apply"
 * button falls below the clipped edge, so a composed pattern can never be
 * applied.
 *
 * Portalling the overlay into a dedicated layer on `document.body` (which the
 * `#regex-builder-layer` rule collapses with `display: contents`) removes it
 * from every host's containing block and overflow scope. Its `position: fixed`
 * box then resolves against the real viewport, so the responsive contract in
 * _regex-builder.scss — `min(900px, 100vw - 50px)` × `min(644px, 100vh - 50px)`,
 * the internal `overflow-y: auto` scroll region, and the two-column → one-column
 * palette collapse — is honoured at the actual window size and every control,
 * including the Apply footer, stays visible and keyboard reachable at 100–200%
 * zoom. React portals preserve component-tree event bubbling, so host dialogs
 * that inspect `event.target.closest('.regex-builder-overlay')` keep working.
 */
function getRegexBuilderPortalHost(): HTMLElement | null {
  if (typeof document === 'undefined' || document.body === null) {
    return null
  }

  const existing = document.getElementById(RegexBuilderLayerId)
  if (existing !== null) {
    return existing
  }

  const host = document.createElement('div')
  host.id = RegexBuilderLayerId
  document.body.appendChild(host)
  return host
}

interface IRegexBuilderProps {
  /** Stable audit identity of the search surface that opened this builder. */
  readonly searchSurfaceId?: string

  /**
   * A human readable label for the search surface this builder applies to
   * (e.g. "Changes", "Branches"). Used in the subtitle and Apply button.
   */
  readonly targetLabel: string

  /** The pattern to seed the builder with. */
  readonly initialPattern: string

  /**
   * The originating search's case mode. If omitted, the consumer has no
   * mutable case option, so the builder tests case-sensitively and hides the
   * ignore-case chip rather than advertising a flag it cannot apply.
   */
  readonly caseSensitive?: boolean

  /**
   * Visible items from the originating list, used to seed the live tester's
   * sample text. Capped at {@link MaxSampleItems}.
   */
  readonly sampleItems: ReadonlyArray<string>

  /** Called with the composed pattern and its truthful case mode. */
  readonly onApply: (pattern: string, caseSensitive: boolean) => void

  /** Called when the builder is dismissed without applying. */
  readonly onDismissed: () => void

  /**
   * Restore focus to the launcher on unmount. Collapsible hosts disable this
   * while hiding the launcher so focus remains on their disclosure control.
   */
  readonly restoreFocusOnUnmount?: boolean
}

/** The two top-level views of the builder: composing vs. the static guide. */
type RegexBuilderView = 'build' | 'guide'

interface IRegexBuilderState {
  readonly pattern: string
  readonly flags: IRegexFlags
  readonly view: RegexBuilderView
  readonly activeCategory: number
  readonly sample: string
  readonly dragOffset: { readonly x: number; readonly y: number }
  readonly languageMode: LanguageMode
}

const FlagChips: ReadonlyArray<{
  readonly key: keyof IRegexFlags
  readonly labelKey: TranslationKey
}> = [{ key: 'i', labelKey: 'regex.builder.flag.ignoreCase' }]

interface IFlagChipProps {
  readonly flagKey: keyof IRegexFlags
  readonly accessibleLabel: string
  readonly on: boolean
  readonly onToggleFlag: (key: keyof IRegexFlags) => void
}

/** The one search flag every originating surface can apply truthfully. */
class FlagChip extends React.Component<IFlagChipProps> {
  private onClick = () => {
    this.props.onToggleFlag(this.props.flagKey)
  }

  public render() {
    const { flagKey, accessibleLabel, on } = this.props
    return (
      <button
        type="button"
        aria-label={`${flagKey} — ${accessibleLabel}`}
        aria-pressed={on}
        className={classNames('regex-flag-chip', { on })}
        onClick={this.onClick}
      >
        {flagKey}
      </button>
    )
  }
}

interface IViewTabProps {
  readonly view: RegexBuilderView
  readonly label: string
  readonly accessibleLabel: string
  readonly icon: OcticonSymbol
  readonly selected: boolean
  readonly onSelectView: (view: RegexBuilderView) => void
  readonly onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    view: RegexBuilderView
  ) => void
}

/**
 * One of the two segmented Build / "How regex works" view tabs rendered
 * directly under the builder's header.
 */
class RegexBuilderViewTab extends React.Component<IViewTabProps> {
  private onClick = () => {
    this.props.onSelectView(this.props.view)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    this.props.onKeyDown(event, this.props.view)
  }

  public render() {
    const { view, label, accessibleLabel, icon, selected } = this.props
    return (
      <button
        type="button"
        id={`regex-builder-view-tab-${view}`}
        role="tab"
        aria-label={accessibleLabel}
        aria-selected={selected}
        aria-controls={`regex-builder-view-${view}`}
        tabIndex={selected ? 0 : -1}
        className={classNames('regex-builder-view-tab', { selected })}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
      >
        <Octicon symbol={icon} />
        {label}
      </button>
    )
  }
}

/**
 * A self-contained, non-modal, draggable regex builder overlay. It floats over
 * the live app (its own `pointer-events` scaffold lets clicks pass through the
 * empty margin). The overlay is portalled into a top-level layer (see
 * {@link getRegexBuilderPortalHost}) so it escapes the fixed-position containing
 * block and overflow clip of any host dialog that opened it — the clone,
 * repository-settings, submodule/subtree, notification-automation, command
 * palette, and preferences dialogs all embed it without cropping it. Applying
 * writes the composed pattern back into the originating search field and turns
 * that field's regex mode on.
 */
export class RegexBuilder extends React.Component<
  IRegexBuilderProps,
  IRegexBuilderState
> {
  private dialogRef = React.createRef<HTMLDivElement>()
  private patternInputRef = React.createRef<HTMLInputElement>()
  private returnFocusElement: HTMLElement | null = null
  private dragPointerId: number | null = null
  private clampFrameId: number | null = null
  private dragStart: {
    readonly x: number
    readonly y: number
    readonly baseX: number
    readonly baseY: number
  } | null = null

  public constructor(props: IRegexBuilderProps) {
    super(props)

    this.state = {
      pattern: props.initialPattern,
      flags: {
        g: false,
        i: props.caseSensitive === undefined ? false : !props.caseSensitive,
        m: false,
        s: false,
        u: false,
        y: false,
      },
      view: 'build',
      activeCategory: 0,
      sample: this.defaultSample(),
      dragOffset: { x: 0, y: 0 },
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount = () => {
    const activeElement = document.activeElement
    this.returnFocusElement =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null
    window.addEventListener('resize', this.scheduleKeepOnScreen)
    window.addEventListener('keydown', this.onWindowKeyDown, true)
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.scheduleKeepOnScreen()
    this.patternInputRef.current?.focus()
  }

  public componentWillUnmount = () => {
    window.removeEventListener('resize', this.scheduleKeepOnScreen)
    window.removeEventListener('keydown', this.onWindowKeyDown, true)
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    if (this.clampFrameId !== null) {
      window.cancelAnimationFrame(this.clampFrameId)
    }
    if (this.props.restoreFocusOnUnmount !== false) {
      const returnFocusElement = this.returnFocusElement
      window.requestAnimationFrame(() => {
        if (returnFocusElement?.isConnected) {
          returnFocusElement.focus()
        }
      })
    }
  }

  public componentDidUpdate(prevProps: IRegexBuilderProps) {
    if (
      this.props.caseSensitive !== undefined &&
      prevProps.caseSensitive !== this.props.caseSensitive &&
      this.state.flags.i === this.props.caseSensitive
    ) {
      this.setState(state => ({
        flags: { ...state.flags, i: !this.props.caseSensitive },
      }))
    }
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    if (languageMode !== this.state.languageMode) {
      this.setState({ languageMode })
    }
  }

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

  private accessibleText = (
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) => translateForAccessibleName(key, variables, this.state.languageMode)

  private scheduleKeepOnScreen = () => {
    if (this.clampFrameId !== null) {
      window.cancelAnimationFrame(this.clampFrameId)
    }
    this.clampFrameId = window.requestAnimationFrame(() => {
      this.clampFrameId = null
      this.keepOnScreen()
    })
  }

  private keepOnScreen = () => {
    const dialog = this.dialogRef.current
    if (dialog === null) {
      return
    }

    const nextOffset = clampDialogOffset(
      dialog.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      this.state.dragOffset,
      8,
      8
    )

    if (
      nextOffset.x !== this.state.dragOffset.x ||
      nextOffset.y !== this.state.dragOffset.y
    ) {
      this.setState({ dragOffset: nextOffset })
    }
  }

  private defaultSample(): string {
    const items = this.props.sampleItems.slice(0, MaxSampleItems)
    if (items.length === 0) {
      return 'app/styles/_material.scss\napp/src/ui/toolbar/toolbar.tsx\ndocs/material-motion.md'
    }
    return items.join('\n').slice(0, MaxRegexInputLength)
  }

  private validationError(): string | null {
    if (this.state.pattern.length === 0) {
      return null
    }
    return compileSafeRegex(this.state.pattern, !this.state.flags.i).error
  }

  private onInsertToken = (token: string) => {
    this.setState(prev => ({ pattern: prev.pattern + token }))
  }

  private onPatternChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ pattern: event.currentTarget.value })
  }

  private onBackspace = () => {
    this.setState(prev => ({ pattern: prev.pattern.slice(0, -1) }))
  }

  private onClear = () => {
    this.setState({ pattern: '' })
  }

  private onToggleFlag = (key: keyof IRegexFlags) => {
    this.setState(prev => ({
      flags: { ...prev.flags, [key]: !prev.flags[key] },
    }))
  }

  private onCategoryChange = (index: number) => {
    this.setState({ activeCategory: index })
  }

  private onSelectView = (view: RegexBuilderView) => {
    this.setState({ view })
  }

  private onViewTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentView: RegexBuilderView
  ) => {
    const views: ReadonlyArray<RegexBuilderView> = ['build', 'guide']
    const currentIndex = views.indexOf(currentView)
    let nextIndex = currentIndex

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % views.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + views.length) % views.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = views.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const nextView = views[nextIndex]
    this.setState({ view: nextView }, () => {
      document.getElementById(`regex-builder-view-tab-${nextView}`)?.focus()
    })
  }

  private onSampleChanged = (sample: string) => {
    this.setState({ sample })
  }

  private onApply = () => {
    this.props.onApply(this.state.pattern, !this.state.flags.i)
  }

  private onWindowKeyDown = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.props.onDismissed()
    }
  }

  private onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.props.onDismissed()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const dialog = this.dialogRef.current
    if (dialog === null) {
      return
    }
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(RegexBuilderFocusableSelector)
    ).filter(
      element => element.closest('[hidden], [aria-hidden="true"]') === null
    )
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (active === last || !dialog.contains(active))
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  private onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    if ((event.target as HTMLElement).closest('button') !== null) {
      return
    }

    this.dragPointerId = event.pointerId
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      baseX: this.state.dragOffset.x,
      baseY: this.state.dragOffset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  private onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (this.dragStart === null || this.dragPointerId !== event.pointerId) {
      return
    }

    const dx = event.clientX - this.dragStart.x
    const dy = event.clientY - this.dragStart.y
    this.setState({
      dragOffset: {
        x: this.dragStart.baseX + dx,
        y: this.dragStart.baseY + dy,
      },
    })
  }

  private onHeaderPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (this.dragPointerId === event.pointerId) {
      this.dragPointerId = null
      this.dragStart = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      this.scheduleKeepOnScreen()
    }
  }

  private renderViewTabs() {
    const { view } = this.state
    return (
      <div
        className="regex-builder-views"
        role="tablist"
        aria-label={this.accessibleText('regex.builder.viewsLabel')}
      >
        <RegexBuilderViewTab
          view="build"
          label={this.text('regex.builder.view.build')}
          accessibleLabel={this.accessibleText('regex.builder.view.build')}
          icon={octicons.tools}
          selected={view === 'build'}
          onSelectView={this.onSelectView}
          onKeyDown={this.onViewTabKeyDown}
        />
        <RegexBuilderViewTab
          view="guide"
          label={this.text('regex.builder.view.guide')}
          accessibleLabel={this.accessibleText('regex.builder.view.guide')}
          icon={octicons.book}
          selected={view === 'guide'}
          onSelectView={this.onSelectView}
          onKeyDown={this.onViewTabKeyDown}
        />
      </div>
    )
  }

  private renderBuildView(hidden: boolean) {
    return (
      <div
        id="regex-builder-view-build"
        className="regex-builder-build-view"
        role="tabpanel"
        aria-labelledby="regex-builder-view-tab-build"
        hidden={hidden}
      >
        <RegexBuilderPalette
          categories={RegexCategories}
          activeCategory={this.state.activeCategory}
          languageMode={this.state.languageMode}
          onCategoryChange={this.onCategoryChange}
          onInsertToken={this.onInsertToken}
        />

        <RegexTestArea
          pattern={this.state.pattern}
          flags={flagsToString(this.state.flags)}
          sample={this.state.sample}
          languageMode={this.state.languageMode}
          onSampleChanged={this.onSampleChanged}
          externalPatternErrorId="regex-builder-pattern-error"
        />
      </div>
    )
  }

  private renderValidityIcon() {
    if (this.state.pattern.length === 0) {
      return (
        <Octicon className="regex-validity empty" symbol={octicons.pencil} />
      )
    }

    return this.validationError() === null ? (
      <Octicon className="regex-validity valid" symbol={octicons.checkCircle} />
    ) : (
      <Octicon className="regex-validity invalid" symbol={octicons.alert} />
    )
  }

  public render() {
    const validationError = this.validationError()
    const invalid = validationError !== null
    const flagsString = flagsToString(this.state.flags)
    const transform = `translate(${this.state.dragOffset.x}px, ${this.state.dragOffset.y}px)`

    const overlay = (
      <div
        className="regex-builder-overlay"
        data-search-surface-id={this.props.searchSurfaceId}
      >
        {/* The non-modal dialog owns Tab/Escape for its nested native controls. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          className="regex-builder-dialog"
          style={{ transform }}
          ref={this.dialogRef}
          role="dialog"
          aria-modal="false"
          aria-label={this.accessibleText('regex.builder.title')}
          aria-describedby="regex-builder-description"
          onKeyDown={this.onDialogKeyDown}
        >
          <div
            className="regex-builder-header"
            onPointerDown={this.onHeaderPointerDown}
            onPointerMove={this.onHeaderPointerMove}
            onPointerUp={this.onHeaderPointerUp}
            onPointerCancel={this.onHeaderPointerUp}
          >
            <span className="regex-builder-glyph">.*</span>
            <div className="regex-builder-heading">
              <h2 id="regex-builder-title">
                {this.text('regex.builder.title')}
              </h2>
              <p id="regex-builder-description">
                {this.text('regex.builder.description', {
                  target: this.props.targetLabel,
                })}
              </p>
            </div>
            <button
              type="button"
              className="regex-builder-close"
              aria-label={this.accessibleText('regex.builder.close')}
              onClick={this.props.onDismissed}
            >
              <Octicon symbol={octicons.x} />
            </button>
          </div>

          {this.renderViewTabs()}

          <div className="regex-builder-scroll-region">
            <div
              className={classNames('regex-builder-pattern-row', { invalid })}
            >
              <div className="regex-builder-pattern-field">
                <span className="regex-delimiter">/</span>
                <input
                  ref={this.patternInputRef}
                  type="text"
                  className="regex-pattern-input"
                  aria-label={this.accessibleText('regex.builder.patternLabel')}
                  aria-invalid={invalid}
                  aria-describedby={
                    invalid ? 'regex-builder-pattern-error' : undefined
                  }
                  maxLength={MaxRegexPatternLength}
                  spellCheck={false}
                  placeholder={this.text('regex.builder.patternPlaceholder')}
                  value={this.state.pattern}
                  onChange={this.onPatternChanged}
                />
                <span className="regex-delimiter">/{flagsString}</span>
                {this.renderValidityIcon()}
              </div>
              <button
                type="button"
                className="regex-builder-icon-button"
                aria-label={this.accessibleText('regex.builder.deleteLast')}
                onClick={this.onBackspace}
              >
                &#9003;
              </button>
              <button
                type="button"
                className="regex-builder-icon-button destructive"
                aria-label={this.accessibleText('regex.builder.clear')}
                onClick={this.onClear}
              >
                <Octicon symbol={octicons.trash} />
              </button>
            </div>

            {validationError === null ? null : (
              <p
                id="regex-builder-pattern-error"
                className="regex-builder-pattern-error"
                role="alert"
              >
                {validationError}
              </p>
            )}

            <div className="regex-builder-flags">
              <span className="regex-builder-flags-label">SAFE RE2</span>
              {this.props.caseSensitive === undefined
                ? null
                : FlagChips.map(({ key, labelKey }) => (
                    <FlagChip
                      key={key}
                      flagKey={key}
                      accessibleLabel={this.accessibleText(labelKey)}
                      on={this.state.flags[key]}
                      onToggleFlag={this.onToggleFlag}
                    />
                  ))}
            </div>

            {this.renderBuildView(this.state.view !== 'build')}
            <RegexBuilderGuide
              hidden={this.state.view !== 'guide'}
              languageMode={this.state.languageMode}
            />
          </div>

          <div className="regex-builder-footer">
            <button
              type="button"
              className="regex-builder-cancel"
              aria-label={this.accessibleText('regex.builder.cancel')}
              onClick={this.props.onDismissed}
            >
              {this.text('regex.builder.cancel')}
            </button>
            <button
              type="button"
              className="regex-builder-apply"
              aria-label={this.accessibleText('regex.builder.apply', {
                target: this.props.targetLabel,
              })}
              disabled={invalid}
              onClick={this.onApply}
            >
              <Octicon symbol={octicons.check} />
              {this.text('regex.builder.apply', {
                target: this.props.targetLabel,
              })}
            </button>
          </div>
        </div>
      </div>
    )

    // Escape any host dialog's fixed-position containing block + overflow clip
    // by portalling into a top-level layer; fall back to inline rendering only
    // when there is no document (non-DOM environments).
    const host = getRegexBuilderPortalHost()
    return host === null ? overlay : ReactDOM.createPortal(overlay, host)
  }
}
