import * as React from 'react'
import {
  AppLogoChoice,
  AppLogoBorder,
  AppLogoShadow,
  AppLogoShape,
  AppNameFontWeight,
  AppNameFontWidth,
  AppNameHighlight,
  AppNameTextCase,
  AppNameTextEffect,
  DefaultAppIdentityCustomization,
  getAppDisplayName,
  getAppDisplayNameError,
  IAppIdentityCustomization,
  isValidCustomLogoPath,
  MaxAppNameCharacterSpacing,
  MaxAppNameFontSize,
  MaxAppNameOpacity,
  MaxAppBrandGap,
  MaxAppLogoInset,
  MaxAppLogoRotation,
  MaxAppLogoSize,
  MinAppNameCharacterSpacing,
  MinAppNameFontSize,
  MinAppNameOpacity,
  MinAppBrandGap,
  MinAppLogoInset,
  MinAppLogoRotation,
  MinAppLogoSize,
} from '../../models/app-identity'
import { tabFontOptions } from '../../models/repository-tab'
import { showOpenDialog } from '../main-process-proxy'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { AppBrand } from '../window/app-brand'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'

interface IAppIdentityProps {
  readonly value: IAppIdentityCustomization
  readonly onChange: (identity: IAppIdentityCustomization) => void
}

interface IAppIdentityState {
  readonly draftName: string
  readonly nameError: string | null
}

const logoChoices: ReadonlyArray<{
  readonly value: AppLogoChoice
  readonly label: string
  readonly symbol?: OcticonSymbol
}> = [
  { value: 'github', label: 'GitHub', symbol: octicons.markGithub },
  { value: 'repository', label: 'Repository', symbol: octicons.repo },
  { value: 'terminal', label: 'Terminal', symbol: octicons.terminal },
  { value: 'code', label: 'Code', symbol: octicons.code },
  { value: 'sparkle', label: 'Sparkle', symbol: octicons.sparkle },
  { value: 'monogram', label: 'Monogram' },
  { value: 'custom', label: 'Custom image', symbol: octicons.fileMedia },
]

const logoShapeLabels: ReadonlyArray<{
  readonly value: AppLogoShape
  readonly label: string
}> = [
  { value: 'rounded', label: 'Rounded square' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
]

const textCaseLabels: ReadonlyArray<{
  readonly value: AppNameTextCase
  readonly label: string
}> = [
  { value: 'normal', label: 'As typed' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize Words' },
]

const textEffectLabels: ReadonlyArray<{
  readonly value: AppNameTextEffect
  readonly label: string
}> = [
  { value: 'none', label: 'None' },
  { value: 'soft-shadow', label: 'Soft shadow' },
  { value: 'strong-shadow', label: 'Strong shadow' },
  { value: 'glow', label: 'Color glow' },
  { value: 'embossed', label: 'Embossed' },
]

const logoBorderLabels: ReadonlyArray<{
  readonly value: AppLogoBorder
  readonly label: string
}> = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'strong', label: 'Strong' },
]

const logoShadowLabels: ReadonlyArray<{
  readonly value: AppLogoShadow
  readonly label: string
}> = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'strong', label: 'Strong' },
]

const fontWidthLabels: ReadonlyArray<{
  readonly value: AppNameFontWidth
  readonly label: string
}> = [
  { value: 'condensed', label: 'Condensed' },
  { value: 'normal', label: 'Normal' },
  { value: 'expanded', label: 'Expanded' },
]

const highlightLabels: ReadonlyArray<{
  readonly value: AppNameHighlight
  readonly label: string
}> = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft rectangle' },
  { value: 'pill', label: 'Pill' },
]

export class AppIdentity extends React.Component<
  IAppIdentityProps,
  IAppIdentityState
> {
  private isEditingName = false
  private currentValue: IAppIdentityCustomization

  public constructor(props: IAppIdentityProps) {
    super(props)
    this.currentValue = props.value
    this.state = { draftName: props.value.displayName, nameError: null }
  }

  public componentDidUpdate(prevProps: IAppIdentityProps) {
    if (prevProps.value !== this.props.value) {
      this.currentValue = this.props.value
    }
    if (
      !this.isEditingName &&
      prevProps.value.displayName !== this.props.value.displayName &&
      this.state.draftName !== this.props.value.displayName
    ) {
      this.setState({
        draftName: this.props.value.displayName,
        nameError: null,
      })
    }
  }

  private update = (patch: Partial<IAppIdentityCustomization>) => {
    this.currentValue = { ...this.currentValue, ...patch }
    this.props.onChange(this.currentValue)
  }

  private onNameFocused = () => {
    this.isEditingName = true
  }

  private onNameChanged = (draftName: string) => {
    const nameError = getAppDisplayNameError(draftName)
    this.setState({ draftName, nameError })
    if (nameError === null) {
      this.update({ displayName: getAppDisplayName(draftName) })
    }
  }

  private onNameBlurred = (draftName: string) => {
    this.isEditingName = false
    const nameError = getAppDisplayNameError(draftName)
    if (nameError !== null) {
      this.setState({
        draftName: this.currentValue.displayName,
        nameError: null,
      })
      return
    }
    const displayName = getAppDisplayName(draftName)
    this.setState({ draftName: displayName, nameError: null })
    this.update({ displayName })
  }

  private onLogoChanged = (logo: AppLogoChoice) => {
    this.update({ logo })
  }

  private onLogoChoiceClicked = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const logo = event.currentTarget.id.replace('app-identity-logo-', '')
    if (logoChoices.some(choice => choice.value === logo)) {
      this.onLogoChanged(logo as AppLogoChoice)
    }
  }

  private onLogoVisibilityClicked = () => {
    this.update({ showLogo: !this.currentValue.showLogo })
  }

  private onChooseCustomLogo = async () => {
    const customLogoPath = await showOpenDialog({
      title: 'Choose an app logo',
      properties: ['openFile'],
      filters: [
        {
          name: 'Image files',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'],
        },
      ],
    })
    if (isValidCustomLogoPath(customLogoPath)) {
      this.update({ customLogoPath, logo: 'custom' })
    }
  }

  private onRemoveCustomLogo = () => {
    this.update({ customLogoPath: null, logo: 'github' })
  }

  private onLogoShapeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ logoShape: event.currentTarget.value as AppLogoShape })
  }

  private onLogoBorderChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ logoBorder: event.currentTarget.value as AppLogoBorder })
  }

  private onLogoShadowChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ logoShadow: event.currentTarget.value as AppLogoShadow })
  }

  private onFontFamilyChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ fontFamily: event.currentTarget.value })
  }

  private onFontWeightChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({
      fontWeight: parseInt(event.currentTarget.value, 10) as AppNameFontWeight,
    })
  }

  private onFontWidthChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ fontWidth: event.currentTarget.value as AppNameFontWidth })
  }

  private onHighlightChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({
      highlightStyle: event.currentTarget.value as AppNameHighlight,
    })
  }

  private onTextCaseChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ textCase: event.currentTarget.value as AppNameTextCase })
  }

  private onTextEffectChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.update({ textEffect: event.currentTarget.value as AppNameTextEffect })
  }

  private onFontSizeChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.update({ fontSize: parseFloat(event.currentTarget.value) })
  }

  private onCharacterSpacingChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.update({ characterSpacing: parseFloat(event.currentTarget.value) })
  }

  private onNumericSlider = (
    key: 'logoSize' | 'logoInset' | 'logoRotation' | 'brandGap' | 'fontOpacity',
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.update({ [key]: parseFloat(event.currentTarget.value) })
  }

  private onNumericSliderChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    switch (event.currentTarget.id) {
      case 'app-identity-logo-size':
        this.onNumericSlider('logoSize', event)
        break
      case 'app-identity-logo-inset':
        this.onNumericSlider('logoInset', event)
        break
      case 'app-identity-logo-rotation':
        this.onNumericSlider('logoRotation', event)
        break
      case 'app-identity-brand-gap':
        this.onNumericSlider('brandGap', event)
        break
      case 'app-identity-name-opacity':
        this.onNumericSlider('fontOpacity', event)
        break
    }
  }

  private onLogoColorChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.update({ logoColor: event.currentTarget.value })
  }

  private onFontColorChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.update({ fontColor: event.currentTarget.value })
  }

  private onLogoBorderColorChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.update({ logoBorderColor: event.currentTarget.value })
  }

  private onHighlightColorChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.update({ highlightColor: event.currentTarget.value })
  }

  private onClearLogoColor = () => {
    this.update({ logoColor: null })
  }

  private onClearLogoBorderColor = () => {
    this.update({ logoBorderColor: null })
  }

  private onClearFontColor = () => {
    this.update({ fontColor: null })
  }

  private onClearHighlightColor = () => {
    this.update({ highlightColor: null })
  }

  private toggle(
    key: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'smallCaps'
  ) {
    this.update({ [key]: !this.currentValue[key] })
  }

  private onFormatToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const key = event.currentTarget.id.replace('app-identity-format-', '')
    switch (key) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikeThrough':
      case 'smallCaps':
        this.toggle(key)
        break
    }
  }

  private clearNameFormatting = () => {
    const defaults = DefaultAppIdentityCustomization
    this.update({
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      fontWeight: defaults.fontWeight,
      fontWidth: defaults.fontWidth,
      fontColor: defaults.fontColor,
      fontOpacity: defaults.fontOpacity,
      highlightStyle: defaults.highlightStyle,
      highlightColor: defaults.highlightColor,
      bold: defaults.bold,
      italic: defaults.italic,
      underline: defaults.underline,
      strikeThrough: defaults.strikeThrough,
      smallCaps: defaults.smallCaps,
      textCase: defaults.textCase,
      characterSpacing: defaults.characterSpacing,
      textEffect: defaults.textEffect,
    })
  }

  private resetIdentity = () => {
    this.isEditingName = false
    this.setState({
      draftName: DefaultAppIdentityCustomization.displayName,
      nameError: null,
    })
    this.currentValue = {
      ...this.currentValue,
      ...DefaultAppIdentityCustomization,
    }
    this.props.onChange(this.currentValue)
  }

  private renderToggle(
    key: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'smallCaps',
    label: string,
    shortLabel: string
  ) {
    return (
      <Button
        id={`app-identity-format-${key}`}
        type="button"
        className="app-identity-format-button"
        ariaLabel={label}
        ariaPressed={this.props.value[key] as boolean}
        onClick={this.onFormatToggle}
      >
        <span aria-hidden={true}>{shortLabel}</span>
      </Button>
    )
  }

  public render() {
    const identity = this.props.value
    const customFont = tabFontOptions.some(
      option => option.family === identity.fontFamily
    )
      ? null
      : identity.fontFamily

    return (
      <section
        className="appearance-section app-identity-section"
        aria-labelledby="app-identity-heading"
      >
        <div className="app-identity-heading-row">
          <div>
            <h2 id="app-identity-heading">App identity</h2>
            <p>Personalize the in-app title bar for this profile.</p>
          </div>
          <Button type="button" size="small" onClick={this.resetIdentity}>
            Reset identity
          </Button>
        </div>

        <div
          className="app-identity-preview-surface"
          role="group"
          aria-label="Live app identity preview"
        >
          <span className="app-identity-preview-label">Live preview</span>
          <AppBrand identity={identity} preview={true} />
        </div>

        <div className="app-identity-name-row">
          <TextBox
            className="app-identity-name-input"
            label="App name"
            value={this.state.draftName}
            required={true}
            ariaDescribedBy="app-identity-name-help"
            onFocus={this.onNameFocused}
            onValueChanged={this.onNameChanged}
            onBlur={this.onNameBlurred}
          />
          <p
            id="app-identity-name-help"
            className={this.state.nameError === null ? '' : 'validation-error'}
          >
            {this.state.nameError ?? 'Shown in the title bar and window title.'}
          </p>
        </div>

        <fieldset className="app-identity-fieldset">
          <legend>Logo</legend>
          <div className="app-identity-logo-choices">
            {logoChoices.map(choice => (
              <Button
                key={choice.value}
                id={`app-identity-logo-${choice.value}`}
                type="button"
                className="app-identity-logo-choice"
                ariaPressed={identity.logo === choice.value}
                onClick={this.onLogoChoiceClicked}
              >
                <span
                  className="app-identity-logo-choice-icon"
                  aria-hidden={true}
                >
                  {choice.symbol === undefined ? (
                    'Aa'
                  ) : (
                    <Octicon symbol={choice.symbol} height={18} />
                  )}
                </span>
                <span>{choice.label}</span>
              </Button>
            ))}
          </div>
          <Button
            type="button"
            className="app-identity-visibility-toggle"
            ariaPressed={identity.showLogo}
            onClick={this.onLogoVisibilityClicked}
          >
            Show logo in title bar
          </Button>

          <div className="app-identity-logo-controls">
            <div className="app-identity-file-control">
              <TextBox
                label="Custom logo image"
                value={identity.customLogoPath ?? 'No image selected'}
                readOnly={true}
              />
              <div className="app-identity-file-actions">
                <Button type="button" onClick={this.onChooseCustomLogo}>
                  Choose image…
                </Button>
                <Button
                  type="button"
                  disabled={identity.customLogoPath === null}
                  onClick={this.onRemoveCustomLogo}
                >
                  Remove
                </Button>
              </div>
            </div>

            <Select
              label="Logo shape"
              value={identity.logoShape}
              onChange={this.onLogoShapeChanged}
            >
              {logoShapeLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              label="Logo border"
              value={identity.logoBorder}
              onChange={this.onLogoBorderChanged}
            >
              {logoBorderLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              label="Logo shadow"
              value={identity.logoShadow}
              onChange={this.onLogoShadowChanged}
            >
              {logoShadowLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <div className="app-identity-color-control">
              <label htmlFor="app-identity-logo-color">Logo color</label>
              <div>
                <input
                  id="app-identity-logo-color"
                  type="color"
                  value={identity.logoColor ?? '#0969da'}
                  aria-label="Logo color"
                  onChange={this.onLogoColorChanged}
                />
                <Button
                  type="button"
                  disabled={identity.logoColor === null}
                  onClick={this.onClearLogoColor}
                >
                  Use theme color
                </Button>
              </div>
            </div>

            <div className="app-identity-color-control">
              <label htmlFor="app-identity-logo-border-color">
                Border color
              </label>
              <div>
                <input
                  id="app-identity-logo-border-color"
                  type="color"
                  value={identity.logoBorderColor ?? '#8c959f'}
                  aria-label="Logo border color"
                  onChange={this.onLogoBorderColorChanged}
                />
                <Button
                  type="button"
                  disabled={identity.logoBorderColor === null}
                  onClick={this.onClearLogoBorderColor}
                >
                  Use theme color
                </Button>
              </div>
            </div>
          </div>

          <div className="app-identity-slider-grid app-identity-logo-sliders">
            <label htmlFor="app-identity-logo-size">
              <span>Logo size</span>
              <strong>{identity.logoSize}px</strong>
              <input
                id="app-identity-logo-size"
                type="range"
                min={MinAppLogoSize}
                max={MaxAppLogoSize}
                step={1}
                value={identity.logoSize}
                aria-label="Logo size"
                aria-valuetext={`${identity.logoSize} pixels`}
                onChange={this.onNumericSliderChanged}
              />
            </label>
            <label htmlFor="app-identity-logo-inset">
              <span>Icon inset</span>
              <strong>{identity.logoInset}px</strong>
              <input
                id="app-identity-logo-inset"
                type="range"
                min={MinAppLogoInset}
                max={MaxAppLogoInset}
                step={1}
                value={identity.logoInset}
                aria-label="Logo icon inset"
                aria-valuetext={`${identity.logoInset} pixels`}
                onChange={this.onNumericSliderChanged}
              />
            </label>
            <label htmlFor="app-identity-logo-rotation">
              <span>Logo rotation</span>
              <strong>{identity.logoRotation}°</strong>
              <input
                id="app-identity-logo-rotation"
                type="range"
                min={MinAppLogoRotation}
                max={MaxAppLogoRotation}
                step={1}
                value={identity.logoRotation}
                aria-label="Logo rotation"
                aria-valuetext={`${identity.logoRotation} degrees`}
                onChange={this.onNumericSliderChanged}
              />
            </label>
            <label htmlFor="app-identity-brand-gap">
              <span>Logo and name gap</span>
              <strong>{identity.brandGap}px</strong>
              <input
                id="app-identity-brand-gap"
                type="range"
                min={MinAppBrandGap}
                max={MaxAppBrandGap}
                step={1}
                value={identity.brandGap}
                aria-label="Logo and name gap"
                aria-valuetext={`${identity.brandGap} pixels`}
                onChange={this.onNumericSliderChanged}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="app-identity-fieldset">
          <legend>Name typography</legend>
          <div className="app-identity-typography-grid">
            <Select
              label="Font"
              value={identity.fontFamily}
              onChange={this.onFontFamilyChanged}
            >
              {customFont !== null && (
                <option value={customFont}>{customFont}</option>
              )}
              {tabFontOptions.map(option => (
                <option key={option.family} value={option.family}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Weight"
              value={identity.fontWeight.toString()}
              onChange={this.onFontWeightChanged}
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra bold</option>
            </Select>
            <Select
              label="Font width"
              value={identity.fontWidth}
              onChange={this.onFontWidthChanged}
            >
              {fontWidthLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Letter case"
              value={identity.textCase}
              onChange={this.onTextCaseChanged}
            >
              {textCaseLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Text effect"
              value={identity.textEffect}
              onChange={this.onTextEffectChanged}
            >
              {textEffectLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Name highlight"
              value={identity.highlightStyle}
              onChange={this.onHighlightChanged}
            >
              {highlightLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div
            className="app-identity-format-buttons"
            role="group"
            aria-label="App name formatting"
          >
            {this.renderToggle('bold', 'Bold', 'B')}
            {this.renderToggle('italic', 'Italic', 'I')}
            {this.renderToggle('underline', 'Underline', 'U')}
            {this.renderToggle('strikeThrough', 'Strikethrough', 'S')}
            {this.renderToggle('smallCaps', 'Small caps', 'SC')}
            <Button
              type="button"
              className="app-identity-clear-formatting"
              onClick={this.clearNameFormatting}
            >
              Clear name formatting
            </Button>
          </div>

          <div className="app-identity-slider-grid">
            <label htmlFor="app-identity-font-size">
              <span>Name size</span>
              <strong>{identity.fontSize}px</strong>
              <input
                id="app-identity-font-size"
                type="range"
                min={MinAppNameFontSize}
                max={MaxAppNameFontSize}
                step={0.5}
                value={identity.fontSize}
                aria-label="Name size"
                aria-valuetext={`${identity.fontSize} pixels`}
                onChange={this.onFontSizeChanged}
              />
            </label>
            <label htmlFor="app-identity-character-spacing">
              <span>Character spacing</span>
              <strong>{identity.characterSpacing}px</strong>
              <input
                id="app-identity-character-spacing"
                type="range"
                min={MinAppNameCharacterSpacing}
                max={MaxAppNameCharacterSpacing}
                step={0.25}
                value={identity.characterSpacing}
                aria-label="Character spacing"
                aria-valuetext={`${identity.characterSpacing} pixels`}
                onChange={this.onCharacterSpacingChanged}
              />
            </label>
            <label htmlFor="app-identity-name-opacity">
              <span>Name opacity</span>
              <strong>{Math.round(identity.fontOpacity * 100)}%</strong>
              <input
                id="app-identity-name-opacity"
                type="range"
                min={MinAppNameOpacity}
                max={MaxAppNameOpacity}
                step={0.05}
                value={identity.fontOpacity}
                aria-label="App name opacity"
                aria-valuetext={`${Math.round(
                  identity.fontOpacity * 100
                )} percent`}
                onChange={this.onNumericSliderChanged}
              />
            </label>
          </div>

          <div className="app-identity-color-control app-identity-name-color">
            <label htmlFor="app-identity-name-color">Name color</label>
            <div>
              <input
                id="app-identity-name-color"
                type="color"
                value={identity.fontColor ?? '#24292f'}
                aria-label="App name color"
                onChange={this.onFontColorChanged}
              />
              <Button
                type="button"
                disabled={identity.fontColor === null}
                onClick={this.onClearFontColor}
              >
                Use theme color
              </Button>
            </div>
          </div>
          <div className="app-identity-color-control app-identity-name-color">
            <label htmlFor="app-identity-highlight-color">
              Highlight color
            </label>
            <div>
              <input
                id="app-identity-highlight-color"
                type="color"
                value={identity.highlightColor ?? '#dbeafe'}
                aria-label="App name highlight color"
                onChange={this.onHighlightColorChanged}
              />
              <Button
                type="button"
                disabled={identity.highlightColor === null}
                onClick={this.onClearHighlightColor}
              >
                Use theme color
              </Button>
            </div>
          </div>
        </fieldset>

        <p className="app-identity-boundary-note">
          This changes the in-app identity only. The signed installer,
          executable, and operating-system taskbar icon keep their release
          identity.
        </p>
      </section>
    )
  }
}
