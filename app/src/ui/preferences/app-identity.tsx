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
import { RangeSlider } from '../lib/range-slider'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { InfiniteColorPicker } from '../appearance/infinite-color-picker'
import { getPersistedLanguageMode } from '../../lib/i18n'
import { AppearanceCustomizationStorageKey } from '../../lib/appearance-customization'
import {
  SelectionSettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

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
  private localize(english: string, cantonese: string): string {
    switch (getPersistedLanguageMode()) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private renderSelectionExplanation(
    settingId: string,
    explanationEnglish: string,
    explanationCantonese: string,
    current: string,
    shipped: string
  ): JSX.Element {
    return (
      <SelectionSettingExplanation
        settingId={settingId}
        explanationEnglish={explanationEnglish}
        explanationCantonese={explanationCantonese}
        currentEnglish={current}
        currentCantonese={current}
        shippedEnglish={shipped}
        shippedCantonese={shipped}
        storageKey={AppearanceCustomizationStorageKey}
      />
    )
  }

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

  private onLogoColorChanged = (logoColor: string) => this.update({ logoColor })

  private onFontColorChanged = (fontColor: string) => this.update({ fontColor })

  private onLogoBorderColorChanged = (logoBorderColor: string) =>
    this.update({ logoBorderColor })

  private onHighlightColorChanged = (highlightColor: string) =>
    this.update({ highlightColor })

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
        ariaDescribedBy={
          settingExplanationDescriptionIds(`app-identity-${key}`)
            .ariaDescribedBy
        }
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
            ariaDescribedBy={`app-identity-name-help ${
              settingExplanationDescriptionIds('app-identity-display-name')
                .ariaDescribedBy
            }`}
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
          {this.renderSelectionExplanation(
            'app-identity-display-name',
            'Changes the name shown in the title bar, window title, and application notifications without changing installed identity or data locations.',
            '更改標題列、視窗標題同應用程式通知顯示嘅名稱，但唔會改安裝身份或者資料位置。',
            identity.displayName,
            DefaultAppIdentityCustomization.displayName
          )}
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
                ariaDescribedBy={
                  settingExplanationDescriptionIds('app-identity-logo-choice')
                    .ariaDescribedBy
                }
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
          {this.renderSelectionExplanation(
            'app-identity-logo-choice',
            'Chooses the shipped or validated custom mark displayed beside the application name.',
            '揀顯示喺應用程式名稱旁邊嘅隨附標誌或者已驗證自訂標誌。',
            identity.logo,
            DefaultAppIdentityCustomization.logo
          )}
          <Button
            type="button"
            className="app-identity-visibility-toggle"
            ariaPressed={identity.showLogo}
            ariaDescribedBy={
              settingExplanationDescriptionIds('app-identity-show-logo')
                .ariaDescribedBy
            }
            onClick={this.onLogoVisibilityClicked}
          >
            Show logo in title bar
          </Button>
          {this.renderSelectionExplanation(
            'app-identity-show-logo',
            'Controls whether the selected application mark appears beside the display name.',
            '控制所選應用程式標誌係咪顯示喺名稱旁邊。',
            identity.showLogo ? 'on' : 'off',
            DefaultAppIdentityCustomization.showLogo ? 'on' : 'off'
          )}

          <div className="app-identity-logo-controls">
            <div className="app-identity-file-control">
              <TextBox
                label={this.localize('Custom logo image', '自訂 logo 圖片')}
                value={identity.customLogoPath ?? 'No image selected'}
                readOnly={true}
                ariaDescribedBy={
                  settingExplanationDescriptionIds(
                    'app-identity-custom-logo-image'
                  ).ariaDescribedBy
                }
              />
              {this.renderSelectionExplanation(
                'app-identity-custom-logo-image',
                'Shows whether a validated local custom logo image is selected. The source path remains local and is not copied into exports or telemetry.',
                '顯示有冇揀到已驗證本機自訂 logo 圖片；來源路徑只留喺本機，唔會複製去匯出或者 telemetry。',
                identity.customLogoPath === null ? 'none selected' : 'selected',
                'none selected'
              )}
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
              label={this.localize('Logo shape', 'Logo 形狀')}
              value={identity.logoShape}
              onChange={this.onLogoShapeChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-logo-shape')
                  .ariaDescribedBy
              }
            >
              {logoShapeLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-logo-shape',
              'Chooses the clipping shape applied to the app logo in the title bar and previews.',
              '揀標題列同預覽入面應用程式 logo 使用嘅裁切形狀。',
              identity.logoShape,
              DefaultAppIdentityCustomization.logoShape
            )}

            <Select
              label={this.localize('Logo border', 'Logo 邊框')}
              value={identity.logoBorder}
              onChange={this.onLogoBorderChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-logo-border')
                  .ariaDescribedBy
              }
            >
              {logoBorderLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-logo-border',
              'Chooses the visual border strength around the app logo.',
              '揀應用程式 logo 外圍邊框嘅視覺強度。',
              identity.logoBorder,
              DefaultAppIdentityCustomization.logoBorder
            )}

            <Select
              label={this.localize('Logo shadow', 'Logo 陰影')}
              value={identity.logoShadow}
              onChange={this.onLogoShadowChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-logo-shadow')
                  .ariaDescribedBy
              }
            >
              {logoShadowLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-logo-shadow',
              'Chooses the shadow treatment behind the app logo.',
              '揀應用程式 logo 後面嘅陰影效果。',
              identity.logoShadow,
              DefaultAppIdentityCustomization.logoShadow
            )}

            <div className="app-identity-color-control">
              <label htmlFor="app-identity-logo-color">Logo color</label>
              <div>
                <InfiniteColorPicker
                  id="app-identity-logo-color"
                  value={identity.logoColor ?? '#0969da'}
                  label="Logo color"
                  ariaDescribedBy={
                    settingExplanationDescriptionIds('app-identity-logo-color')
                      .ariaDescribedBy
                  }
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
              {this.renderSelectionExplanation(
                'app-identity-logo-color',
                'Chooses a custom logo foreground color, or leaves the logo on its live theme color.',
                '揀自訂 logo 前景色，或者保留使用即時主題顏色。',
                identity.logoColor ?? 'theme color',
                DefaultAppIdentityCustomization.logoColor ?? 'theme color'
              )}
            </div>

            <div className="app-identity-color-control">
              <label htmlFor="app-identity-logo-border-color">
                Border color
              </label>
              <div>
                <InfiniteColorPicker
                  id="app-identity-logo-border-color"
                  value={identity.logoBorderColor ?? '#8c959f'}
                  label="Logo border color"
                  ariaDescribedBy={
                    settingExplanationDescriptionIds(
                      'app-identity-logo-border-color'
                    ).ariaDescribedBy
                  }
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
              {this.renderSelectionExplanation(
                'app-identity-logo-border-color',
                'Chooses a custom border color for the logo, or leaves the border on its live theme color.',
                '揀自訂 logo 邊框顏色，或者保留使用即時主題顏色。',
                identity.logoBorderColor ?? 'theme color',
                DefaultAppIdentityCustomization.logoBorderColor ?? 'theme color'
              )}
            </div>
          </div>

          <div className="app-identity-slider-grid app-identity-logo-sliders">
            <RangeSlider
              id="app-identity-logo-size"
              label="Logo size"
              min={MinAppLogoSize}
              max={MaxAppLogoSize}
              step={1}
              value={identity.logoSize}
              valueText={`${identity.logoSize}px`}
              ariaValueText={`${identity.logoSize} pixels`}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-logo-size')
                  .ariaDescribedBy
              }
              onChange={value => this.update({ logoSize: value })}
            />
            <RangeSlider
              id="app-identity-logo-inset"
              label="Logo icon inset"
              min={MinAppLogoInset}
              max={MaxAppLogoInset}
              step={1}
              value={identity.logoInset}
              valueText={`${identity.logoInset}px`}
              ariaValueText={`${identity.logoInset} pixels`}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-logo-inset')
                  .ariaDescribedBy
              }
              onChange={value => this.update({ logoInset: value })}
            />
            <RangeSlider
              id="app-identity-logo-rotation"
              label="Logo rotation"
              min={MinAppLogoRotation}
              max={MaxAppLogoRotation}
              step={1}
              value={identity.logoRotation}
              valueText={`${identity.logoRotation}°`}
              ariaValueText={`${identity.logoRotation} degrees`}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-logo-rotation')
                  .ariaDescribedBy
              }
              onChange={value => this.update({ logoRotation: value })}
            />
            <RangeSlider
              id="app-identity-brand-gap"
              label="Logo and name gap"
              min={MinAppBrandGap}
              max={MaxAppBrandGap}
              step={1}
              value={identity.brandGap}
              valueText={`${identity.brandGap}px`}
              ariaValueText={`${identity.brandGap} pixels`}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-brand-gap')
                  .ariaDescribedBy
              }
              onChange={value => this.update({ brandGap: value })}
            />
          </div>
          {this.renderSelectionExplanation(
            'app-identity-logo-size',
            'Sets the rendered logo box size in pixels across the title bar and previews.',
            '設定標題列同預覽入面 logo 方框嘅像素大小。',
            `${identity.logoSize}px`,
            `${DefaultAppIdentityCustomization.logoSize}px`
          )}
          {this.renderSelectionExplanation(
            'app-identity-logo-inset',
            'Sets the internal spacing between the logo artwork and its outer shape.',
            '設定 logo 圖案同外圍形狀之間嘅內距。',
            `${identity.logoInset}px`,
            `${DefaultAppIdentityCustomization.logoInset}px`
          )}
          {this.renderSelectionExplanation(
            'app-identity-logo-rotation',
            'Rotates the logo artwork without rotating its outer shape or changing the source image.',
            '旋轉 logo 圖案，但唔旋轉外圍形狀亦唔改來源圖片。',
            `${identity.logoRotation} degrees`,
            `${DefaultAppIdentityCustomization.logoRotation} degrees`
          )}
          {this.renderSelectionExplanation(
            'app-identity-brand-gap',
            'Sets the pixel gap between the logo and application display name.',
            '設定 logo 同應用程式顯示名稱之間嘅像素距離。',
            `${identity.brandGap}px`,
            `${DefaultAppIdentityCustomization.brandGap}px`
          )}
        </fieldset>

        <fieldset className="app-identity-fieldset">
          <legend>Name typography</legend>
          <div className="app-identity-typography-grid">
            <Select
              label={this.localize('Font', '字型')}
              value={identity.fontFamily}
              onChange={this.onFontFamilyChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-font-family')
                  .ariaDescribedBy
              }
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
            {this.renderSelectionExplanation(
              'app-identity-font-family',
              'Chooses the typeface used by the application display name.',
              '揀應用程式顯示名稱使用嘅字型。',
              identity.fontFamily,
              DefaultAppIdentityCustomization.fontFamily
            )}
            <Select
              label={this.localize('Weight', '字重')}
              value={identity.fontWeight.toString()}
              onChange={this.onFontWeightChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-font-weight')
                  .ariaDescribedBy
              }
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra bold</option>
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-font-weight',
              'Chooses the numeric font weight used by the application display name.',
              '揀應用程式顯示名稱使用嘅數值字重。',
              identity.fontWeight.toString(),
              DefaultAppIdentityCustomization.fontWeight.toString()
            )}
            <Select
              label={this.localize('Font width', '字型寬度')}
              value={identity.fontWidth}
              onChange={this.onFontWidthChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-font-width')
                  .ariaDescribedBy
              }
            >
              {fontWidthLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-font-width',
              'Chooses condensed, normal, or expanded letter width for the application display name.',
              '揀應用程式顯示名稱使用窄身、正常或者闊身字寬。',
              identity.fontWidth,
              DefaultAppIdentityCustomization.fontWidth
            )}
            <Select
              label={this.localize('Letter case', '英文字母大小寫')}
              value={identity.textCase}
              onChange={this.onTextCaseChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-letter-case')
                  .ariaDescribedBy
              }
            >
              {textCaseLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-letter-case',
              'Transforms the displayed application name to the selected capitalization without changing stable application identity.',
              '將顯示嘅應用程式名稱轉成所選大小寫，但唔會改穩定應用程式身分。',
              identity.textCase,
              DefaultAppIdentityCustomization.textCase
            )}
            <Select
              label={this.localize('Text effect', '文字效果')}
              value={identity.textEffect}
              onChange={this.onTextEffectChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-text-effect')
                  .ariaDescribedBy
              }
            >
              {textEffectLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-text-effect',
              'Chooses the shadow, glow, emboss, or plain effect applied to the display name.',
              '揀顯示名稱使用陰影、發光、浮雕或者普通效果。',
              identity.textEffect,
              DefaultAppIdentityCustomization.textEffect
            )}
            <Select
              label={this.localize('Name highlight', '名稱底色')}
              value={identity.highlightStyle}
              onChange={this.onHighlightChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-highlight')
                  .ariaDescribedBy
              }
            >
              {highlightLabels.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {this.renderSelectionExplanation(
              'app-identity-highlight',
              'Chooses whether the display name has no highlight, a soft rectangle, or a pill background.',
              '揀顯示名稱冇底色、用柔和長方形，定係藥丸形背景。',
              identity.highlightStyle,
              DefaultAppIdentityCustomization.highlightStyle
            )}
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
          {this.renderSelectionExplanation(
            'app-identity-bold',
            'Applies an additional bold treatment to the application display name.',
            '為應用程式顯示名稱加上額外粗體效果。',
            identity.bold ? 'on' : 'off',
            DefaultAppIdentityCustomization.bold ? 'on' : 'off'
          )}
          {this.renderSelectionExplanation(
            'app-identity-italic',
            'Applies an italic treatment to the application display name.',
            '為應用程式顯示名稱加上斜體效果。',
            identity.italic ? 'on' : 'off',
            DefaultAppIdentityCustomization.italic ? 'on' : 'off'
          )}
          {this.renderSelectionExplanation(
            'app-identity-underline',
            'Draws an underline beneath the application display name.',
            '喺應用程式顯示名稱下面畫底線。',
            identity.underline ? 'on' : 'off',
            DefaultAppIdentityCustomization.underline ? 'on' : 'off'
          )}
          {this.renderSelectionExplanation(
            'app-identity-strikeThrough',
            'Draws a line through the application display name.',
            '喺應用程式顯示名稱中間畫刪除線。',
            identity.strikeThrough ? 'on' : 'off',
            DefaultAppIdentityCustomization.strikeThrough ? 'on' : 'off'
          )}
          {this.renderSelectionExplanation(
            'app-identity-smallCaps',
            'Uses small-cap styling for lowercase letters in the application display name.',
            '將應用程式顯示名稱嘅細階英文字母用小型大寫樣式顯示。',
            identity.smallCaps ? 'on' : 'off',
            DefaultAppIdentityCustomization.smallCaps ? 'on' : 'off'
          )}

          <div className="app-identity-slider-grid">
            <RangeSlider
              id="app-identity-font-size"
              label="Name size"
              min={MinAppNameFontSize}
              max={MaxAppNameFontSize}
              step={0.5}
              value={identity.fontSize}
              valueText={`${identity.fontSize}px`}
              ariaValueText={`${identity.fontSize} pixels`}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-font-size')
                  .ariaDescribedBy
              }
              onChange={value => this.update({ fontSize: value })}
            />
            <RangeSlider
              id="app-identity-character-spacing"
              label="Character spacing"
              min={MinAppNameCharacterSpacing}
              max={MaxAppNameCharacterSpacing}
              step={0.25}
              value={identity.characterSpacing}
              valueText={`${identity.characterSpacing}px`}
              ariaValueText={`${identity.characterSpacing} pixels`}
              ariaDescribedBy={
                settingExplanationDescriptionIds(
                  'app-identity-character-spacing'
                ).ariaDescribedBy
              }
              onChange={value => this.update({ characterSpacing: value })}
            />
            <RangeSlider
              id="app-identity-name-opacity"
              label="App name opacity"
              min={MinAppNameOpacity}
              max={MaxAppNameOpacity}
              step={0.05}
              value={identity.fontOpacity}
              valueText={`${Math.round(identity.fontOpacity * 100)}%`}
              ariaValueText={`${Math.round(
                identity.fontOpacity * 100
              )} percent`}
              ariaDescribedBy={
                settingExplanationDescriptionIds('app-identity-name-opacity')
                  .ariaDescribedBy
              }
              onChange={value => this.update({ fontOpacity: value })}
            />
          </div>
          {this.renderSelectionExplanation(
            'app-identity-font-size',
            'Sets the application display-name size in pixels.',
            '設定應用程式顯示名稱嘅像素大小。',
            `${identity.fontSize}px`,
            `${DefaultAppIdentityCustomization.fontSize}px`
          )}
          {this.renderSelectionExplanation(
            'app-identity-character-spacing',
            'Adds or removes horizontal spacing between display-name characters.',
            '增加或者減少顯示名稱字元之間嘅橫向距離。',
            `${identity.characterSpacing}px`,
            `${DefaultAppIdentityCustomization.characterSpacing}px`
          )}
          {this.renderSelectionExplanation(
            'app-identity-name-opacity',
            'Sets the display-name opacity without changing its selected color.',
            '設定顯示名稱透明度，但唔改所選顏色。',
            `${Math.round(identity.fontOpacity * 100)}%`,
            `${Math.round(DefaultAppIdentityCustomization.fontOpacity * 100)}%`
          )}

          <div className="app-identity-color-control app-identity-name-color">
            <label htmlFor="app-identity-name-color">Name color</label>
            <div>
              <InfiniteColorPicker
                id="app-identity-name-color"
                value={identity.fontColor ?? '#24292f'}
                label="App name color"
                ariaDescribedBy={
                  settingExplanationDescriptionIds('app-identity-name-color')
                    .ariaDescribedBy
                }
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
            {this.renderSelectionExplanation(
              'app-identity-name-color',
              'Chooses a custom display-name color, or leaves the name on its live theme color.',
              '揀自訂顯示名稱顏色，或者保留使用即時主題顏色。',
              identity.fontColor ?? 'theme color',
              DefaultAppIdentityCustomization.fontColor ?? 'theme color'
            )}
          </div>
          <div className="app-identity-color-control app-identity-name-color">
            <label htmlFor="app-identity-highlight-color">
              Highlight color
            </label>
            <div>
              <InfiniteColorPicker
                id="app-identity-highlight-color"
                value={identity.highlightColor ?? '#dbeafe'}
                label="App name highlight color"
                ariaDescribedBy={
                  settingExplanationDescriptionIds(
                    'app-identity-highlight-color'
                  ).ariaDescribedBy
                }
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
            {this.renderSelectionExplanation(
              'app-identity-highlight-color',
              'Chooses a custom background color for the selected name-highlight shape, or uses the live theme color.',
              '揀所選名稱底色形狀嘅自訂背景顏色，或者使用即時主題顏色。',
              identity.highlightColor ?? 'theme color',
              DefaultAppIdentityCustomization.highlightColor ?? 'theme color'
            )}
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
