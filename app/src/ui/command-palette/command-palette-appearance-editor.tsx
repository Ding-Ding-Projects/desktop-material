import * as React from 'react'
import classNames from 'classnames'
import { t, translateForAccessibleName } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { teleportAnchor } from '../../lib/teleport-targets'
import {
  CommandPaletteDensity,
  CommandPaletteSize,
  DefaultCommandPaletteAppearance,
  ICommandPaletteAppearance,
} from './command-palette-appearance'

interface ICommandPaletteAppearanceEditorProps {
  readonly appearance: ICommandPaletteAppearance
  readonly resolvedAppearance: ICommandPaletteAppearance
  readonly onChange: (appearance: ICommandPaletteAppearance) => void
}

interface ICommandPaletteAppearanceEditorState {
  readonly open: boolean
}

/**
 * The "Customize appearance" control that sits beside the palette's filter
 * mode/regex controls. It opens an editor anchored to its own button rather
 * than a separate dialog, so the result list stays visible while the reader
 * adjusts it and every change applies immediately.
 */
export class CommandPaletteAppearanceEditor extends React.Component<
  ICommandPaletteAppearanceEditorProps,
  ICommandPaletteAppearanceEditorState
> {
  private containerRef = React.createRef<HTMLDivElement>()
  private toggleRef = React.createRef<HTMLButtonElement>()
  private readonly editorId = 'command-palette-appearance-editor'

  public constructor(props: ICommandPaletteAppearanceEditorProps) {
    super(props)
    this.state = { open: false }
  }

  public componentDidMount() {
    document.addEventListener('mousedown', this.onDocumentMouseDown, true)
    document.addEventListener('keydown', this.onDocumentKeyDown, true)
  }

  public componentWillUnmount() {
    document.removeEventListener('mousedown', this.onDocumentMouseDown, true)
    document.removeEventListener('keydown', this.onDocumentKeyDown, true)
  }

  /**
   * Close on Escape while the editor owns focus, and stop that Escape from
   * also dismissing the palette behind it. Bound at the document rather than
   * on the panel so the panel stays a plain, non-interactive container.
   */
  private onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.state.open) {
      return
    }
    const container = this.containerRef.current
    if (
      container !== null &&
      event.target instanceof Node &&
      container.contains(event.target)
    ) {
      event.stopPropagation()
      event.preventDefault()
      this.setState({ open: false }, () => this.toggleRef.current?.focus())
    }
  }

  /** Dismiss when the pointer goes down anywhere outside the anchored editor. */
  private onDocumentMouseDown = (event: MouseEvent) => {
    if (!this.state.open) {
      return
    }
    const container = this.containerRef.current
    if (
      container !== null &&
      event.target instanceof Node &&
      !container.contains(event.target)
    ) {
      this.setState({ open: false })
    }
  }

  private onToggle = () => {
    this.setState(previous => ({ open: !previous.open }))
  }

  private onDensityChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const density = event.currentTarget.value as CommandPaletteDensity
    this.props.onChange({ ...this.props.appearance, density })
  }

  private onShowIconsChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onChange({
      ...this.props.appearance,
      showIcons: event.currentTarget.checked,
    })
  }

  private onShowGroupsChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.props.onChange({
      ...this.props.appearance,
      showGroups: event.currentTarget.checked,
    })
  }

  private onShowKeywordsChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.props.onChange({
      ...this.props.appearance,
      showKeywords: event.currentTarget.checked,
    })
  }

  private onReset = () => {
    this.props.onChange(DefaultCommandPaletteAppearance)
  }

  private onRandomPerRepositoryChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.props.onChange({
      ...this.props.appearance,
      mode: event.currentTarget.checked ? 'random-per-repository' : 'manual',
    })
  }

  private onSizeChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const size = event.currentTarget.value as CommandPaletteSize
    this.props.onChange({ ...this.props.appearance, size })
  }

  private renderSizeOption(
    value: CommandPaletteSize,
    label: string,
    description: string,
    checked: boolean
  ) {
    return (
      <label
        className="command-palette-appearance-option"
        aria-label={`${label}. ${description}`}
      >
        <input
          type="radio"
          name="command-palette-size"
          value={value}
          checked={checked}
          onChange={this.onSizeChanged}
        />
        <span className="command-palette-appearance-option-copy">
          <span className="command-palette-appearance-option-label">
            {label}
          </span>
          <span className="command-palette-appearance-option-description">
            {description}
          </span>
        </span>
      </label>
    )
  }

  private renderDensityOption(
    value: CommandPaletteDensity,
    label: string,
    description: string,
    checked: boolean
  ) {
    return (
      <label
        className="command-palette-appearance-option"
        aria-label={`${label}. ${description}`}
      >
        <input
          type="radio"
          name="command-palette-density"
          value={value}
          checked={checked}
          onChange={this.onDensityChanged}
        />
        <span className="command-palette-appearance-option-copy">
          <span className="command-palette-appearance-option-label">
            {label}
          </span>
          <span className="command-palette-appearance-option-description">
            {description}
          </span>
        </span>
      </label>
    )
  }

  public render() {
    const { appearance } = this.props
    const { open } = this.state
    const randomPerRepository = appearance.mode === 'random-per-repository'
    const displayedAppearance = randomPerRepository
      ? this.props.resolvedAppearance
      : appearance

    return (
      <div className="command-palette-appearance" ref={this.containerRef}>
        <button
          ref={this.toggleRef}
          {...teleportAnchor('palette-appearance-button')}
          type="button"
          className={classNames('command-palette-appearance-toggle', { open })}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={this.editorId}
          aria-label={translateForAccessibleName(
            'commandPalette.customizeAppearance'
          )}
          onClick={this.onToggle}
        >
          <MaterialSymbol name="tune" size={16} />
        </button>
        {open && (
          <div
            id={this.editorId}
            className="command-palette-appearance-editor"
            role="dialog"
            aria-label={translateForAccessibleName(
              'commandPalette.appearanceDialog'
            )}
          >
            <h3>{t('commandPalette.appearanceHeading')}</h3>
            <fieldset className="command-palette-appearance-mode">
              <label
                className="command-palette-appearance-check"
                aria-label={`${translateForAccessibleName(
                  'commandPalette.randomPerRepository'
                )}. ${translateForAccessibleName(
                  'commandPalette.randomPerRepositoryDescription'
                )}`}
              >
                <input
                  type="checkbox"
                  checked={randomPerRepository}
                  onChange={this.onRandomPerRepositoryChanged}
                />
                <span className="command-palette-appearance-option-copy">
                  <span className="command-palette-appearance-option-label">
                    {t('commandPalette.randomPerRepository')}
                  </span>
                  <span className="command-palette-appearance-option-description">
                    {t('commandPalette.randomPerRepositoryDescription')}
                  </span>
                </span>
              </label>
            </fieldset>
            <fieldset>
              <legend>{t('commandPalette.paletteSize')}</legend>
              {this.renderSizeOption(
                'compact',
                t('commandPalette.sizeCompact'),
                t('commandPalette.sizeCompactDescription'),
                displayedAppearance.size === 'compact'
              )}
              {this.renderSizeOption(
                'medium',
                t('commandPalette.sizeMedium'),
                t('commandPalette.sizeMediumDescription'),
                displayedAppearance.size === 'medium'
              )}
              {this.renderSizeOption(
                'full',
                t('commandPalette.sizeFull'),
                t('commandPalette.sizeFullDescription'),
                displayedAppearance.size === 'full'
              )}
            </fieldset>
            <fieldset disabled={randomPerRepository}>
              <legend>{t('commandPalette.rowDensity')}</legend>
              {this.renderDensityOption(
                'comfortable',
                t('commandPalette.comfortable'),
                t('commandPalette.comfortableDescription'),
                displayedAppearance.density === 'comfortable'
              )}
              {this.renderDensityOption(
                'compact',
                t('commandPalette.compact'),
                t('commandPalette.compactDescription'),
                displayedAppearance.density === 'compact'
              )}
            </fieldset>
            <fieldset disabled={randomPerRepository}>
              <legend>{t('commandPalette.showInEachRow')}</legend>
              <label className="command-palette-appearance-check">
                <input
                  type="checkbox"
                  checked={displayedAppearance.showIcons}
                  onChange={this.onShowIconsChanged}
                />
                <span>{t('commandPalette.icons')}</span>
              </label>
              <label className="command-palette-appearance-check">
                <input
                  type="checkbox"
                  checked={displayedAppearance.showGroups}
                  onChange={this.onShowGroupsChanged}
                />
                <span>{t('commandPalette.groupChips')}</span>
              </label>
              <label className="command-palette-appearance-check">
                <input
                  type="checkbox"
                  checked={displayedAppearance.showKeywords}
                  onChange={this.onShowKeywordsChanged}
                />
                <span>{t('commandPalette.keywordLine')}</span>
              </label>
            </fieldset>
            <button
              type="button"
              className="command-palette-appearance-reset"
              onClick={this.onReset}
            >
              {t('commandPalette.resetDefaults')}
            </button>
          </div>
        )}
      </div>
    )
  }
}
