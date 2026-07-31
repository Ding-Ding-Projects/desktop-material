import * as React from 'react'
import classNames from 'classnames'
import { FilterMode } from '../../lib/fuzzy-find'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { RegexBuilder } from './regex-builder/regex-builder'

/** The cycle order of filter modes when the mode button is pressed. */
const ModeCycle: ReadonlyArray<FilterMode> = [
  FilterMode.Fuzzy,
  FilterMode.Substring,
  FilterMode.Regex,
]

const ModeLabelKeys: Record<FilterMode, TranslationKey> = {
  [FilterMode.Fuzzy]: 'filter.mode.fuzzy',
  [FilterMode.Substring]: 'filter.mode.substring',
  [FilterMode.Regex]: 'filter.mode.regex',
}

/** Advance to the next mode in the cycle. */
export function nextFilterMode(mode: FilterMode): FilterMode {
  const index = ModeCycle.indexOf(mode)
  return ModeCycle[(index + 1) % ModeCycle.length]
}

interface IFilterModeControlProps {
  /** Stable audit identity shared with the originating search input. */
  readonly searchSurfaceId: string

  /** The current filter mode. */
  readonly mode: FilterMode

  /** Whether matching is case sensitive (Substring / Regex only). */
  readonly caseSensitive: boolean

  /** Called when the user cycles the filter mode. */
  readonly onModeChange: (mode: FilterMode) => void

  /** Called when the user toggles case sensitivity. */
  readonly onCaseSensitiveChange: (caseSensitive: boolean) => void

  /**
   * A human readable label for the list this control filters (e.g. "Branches").
   * Shown in the regex builder.
   */
  readonly regexBuilderTarget: string

  /**
   * Returns the currently visible item strings, used to seed the regex
   * builder's live tester.
   */
  readonly getSampleItems: () => ReadonlyArray<string>

  /** The current filter text, used to seed the regex builder. */
  readonly filterText: string

  /**
   * Called when a pattern is applied from the regex builder. This control
   * synchronizes case and regex mode first; the consumer adopts the text.
   */
  readonly onRegexPatternApply: (
    pattern: string,
    caseSensitive: boolean
  ) => void

  /**
   * Whether to render the inline regex-builder launcher button. Defaults to
   * true. Surfaces that provide their own regex-builder affordance (e.g. the
   * Changes filter's §6.3 chip row) pass `false` to avoid a duplicate launcher.
   */
  readonly showRegexBuilder?: boolean

  /**
   * Whether the originating search surface is currently available. A
   * collapsible host sets this false before hiding its field so a portalled
   * builder cannot outlive the anchor that owns it.
   */
  readonly enabled?: boolean
}

interface IFilterModeControlState {
  readonly isBuilderOpen: boolean
  readonly languageMode: LanguageMode
}

/**
 * The trailing control cluster inside a filter list's search field: a mode
 * cycle button (with a monospace `.*` glyph), an `Aa` case-sensitivity toggle,
 * and a launcher for the full regex builder.
 */
export class FilterModeControl extends React.Component<
  IFilterModeControlProps,
  IFilterModeControlState
> {
  public constructor(props: IFilterModeControlProps) {
    super(props)
    this.state = {
      isBuilderOpen: false,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentDidUpdate(prevProps: IFilterModeControlProps) {
    if (
      prevProps.enabled !== false &&
      this.props.enabled === false &&
      this.state.isBuilderOpen
    ) {
      this.setState({ isBuilderOpen: false })
    }
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
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

  private onCycleMode = () => {
    this.props.onModeChange(nextFilterMode(this.props.mode))
  }

  private onToggleCase = () => {
    this.props.onCaseSensitiveChange(!this.props.caseSensitive)
  }

  private onOpenBuilder = () => {
    if (this.props.enabled === false) {
      return
    }
    this.setState({ isBuilderOpen: true })
  }

  private onCloseBuilder = () => {
    this.setState({ isBuilderOpen: false })
  }

  private onApplyPattern = (pattern: string, caseSensitive: boolean) => {
    this.setState({ isBuilderOpen: false })
    if (caseSensitive !== this.props.caseSensitive) {
      this.props.onCaseSensitiveChange(caseSensitive)
    }
    this.props.onModeChange(FilterMode.Regex)
    this.props.onRegexPatternApply(pattern, caseSensitive)
  }

  private renderBuilder() {
    if (this.props.showRegexBuilder === false || !this.state.isBuilderOpen) {
      return null
    }

    return (
      <RegexBuilder
        searchSurfaceId={this.props.searchSurfaceId}
        targetLabel={this.props.regexBuilderTarget}
        initialPattern={this.props.filterText}
        caseSensitive={this.props.caseSensitive}
        sampleItems={this.props.getSampleItems()}
        restoreFocusOnUnmount={this.props.enabled !== false}
        onApply={this.onApplyPattern}
        onDismissed={this.onCloseBuilder}
      />
    )
  }

  public render() {
    const { mode, caseSensitive } = this.props
    const caseDisabled = mode === FilterMode.Fuzzy
    const modeLabel = this.accessibleText(ModeLabelKeys[mode])

    return (
      <div
        className="filter-mode-control"
        data-search-surface-id={this.props.searchSurfaceId}
      >
        {/*
         * The interactive controls live in their own flex cluster so they can
         * wrap independently (e.g. the regex-builder chip dropping below the
         * `.*` / `Aa` buttons) on a cramped search row without dragging the
         * fixed-position regex-builder overlay into a containing block.
         */}
        <div className="filter-mode-control-cluster">
          {/*
           * Every control is type="button": hosts may mount the cluster
           * inside a dialog <form>, where the implicit submit type would
           * dismiss the dialog on click.
           */}
          <button
            type="button"
            className={classNames('filter-mode-button', {
              active: mode !== FilterMode.Fuzzy,
            })}
            aria-label={this.accessibleText('filter.mode.cycleLabel', {
              mode: modeLabel,
            })}
            onClick={this.onCycleMode}
          >
            <span className="filter-mode-glyph">.*</span>
          </button>
          <button
            type="button"
            className={classNames('filter-case-button', {
              active: !caseDisabled && caseSensitive,
            })}
            aria-label={this.accessibleText('filter.case.match')}
            aria-pressed={caseSensitive}
            disabled={caseDisabled}
            onClick={this.onToggleCase}
          >
            Aa
          </button>
          {this.props.showRegexBuilder !== false && (
            <button
              type="button"
              className="filter-regex-builder-button"
              aria-label={this.accessibleText('filter.regexBuilder.open')}
              disabled={this.props.enabled === false}
              onClick={this.onOpenBuilder}
            >
              <span className="filter-mode-glyph">.*</span>
              <span className="filter-regex-builder-label">
                {this.text('filter.regexBuilder.label')}
              </span>
            </button>
          )}
        </div>
        {this.renderBuilder()}
      </div>
    )
  }
}
