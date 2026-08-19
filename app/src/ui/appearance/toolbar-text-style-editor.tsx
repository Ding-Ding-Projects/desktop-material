/* eslint-disable react/jsx-no-bind -- compact controlled typography choices */
import * as React from 'react'

import {
  DefaultToolbarFontSize,
  MaxToolbarFontSize,
  normalizeToolbarTextStyle,
  resolveToolbarTextStyle,
} from '../../models/appearance-customization'
import {
  DefaultTabCharacterSpacing,
  ITabTitleStyle,
  MaxTabCharacterSpacing,
  MinTabCharacterSpacing,
  MinTabFontSize,
  isValidTabColor,
  tabFontOptions,
  tabTitleStyleToCss,
} from '../../models/repository-tab'
import { t } from '../../lib/i18n'
import { Button } from '../lib/button'
import { Select } from '../lib/select'

const ToolbarTextColors: ReadonlyArray<string> = [
  '#000000',
  '#ffffff',
  '#404040',
  '#006493',
  '#6f43c0',
  '#006a60',
  '#3a6a00',
  '#9a6700',
  '#a93a5b',
  '#ba1a1a',
]

type BooleanStyleKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'smallCaps'
type ChoiceStyleKey = 'textAlign' | 'textCase' | 'textEffect'

export interface IToolbarTextStyleEditorProps {
  /** Null means theme defaults for a profile or complete profile inheritance. */
  readonly value: ITabTitleStyle | null
  /** Present only for a repository-scoped partial override. */
  readonly inherited?: ITabTitleStyle | null
  readonly repositoryScoped?: boolean
  readonly onChange: (value: ITabTitleStyle | null) => void
}

/**
 * Complete, controlled toolbar typography editor. Repository values remain a
 * partial layer so clearing one property returns just that property to the
 * profile without disturbing the rest of the repository override.
 */
export class ToolbarTextStyleEditor extends React.Component<IToolbarTextStyleEditorProps> {
  private get effectiveStyle(): ITabTitleStyle | null {
    return this.props.repositoryScoped === true
      ? resolveToolbarTextStyle(this.props.inherited ?? null, this.props.value)
      : normalizeToolbarTextStyle(this.props.value)
  }

  private patch(patch: Partial<ITabTitleStyle>) {
    const next: Record<string, unknown> = {
      ...(this.props.value ?? {}),
      ...patch,
    }
    for (const key of Object.keys(next)) {
      if (next[key] === undefined) {
        delete next[key]
      }
    }
    this.props.onChange(normalizeToolbarTextStyle(next))
  }

  private clear = () => this.props.onChange(null)

  private toggle = (key: BooleanStyleKey) => {
    const local = this.props.value?.[key]
    this.patch({
      [key]:
        typeof local === 'boolean'
          ? undefined
          : this.effectiveStyle?.[key] !== true,
    })
  }

  private choose = (
    key: ChoiceStyleKey,
    value: NonNullable<ITabTitleStyle[ChoiceStyleKey]>
  ) => {
    this.patch({ [key]: this.props.value?.[key] === value ? undefined : value })
  }

  private clearField = (key: keyof ITabTitleStyle) =>
    this.patch({ [key]: undefined })

  private onFontChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.patch({ fontFamily: event.currentTarget.value || undefined })
  }

  private onSizeChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.patch({ fontSize: event.currentTarget.valueAsNumber })
  }

  private onSpacingChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.patch({ characterSpacing: event.currentTarget.valueAsNumber })
  }

  private onCustomColor = (event: React.FormEvent<HTMLInputElement>) => {
    if (isValidTabColor(event.currentTarget.value)) {
      this.patch({ color: event.currentTarget.value })
    }
  }

  private renderToggle(
    key: BooleanStyleKey,
    label: string,
    glyph: string
  ): JSX.Element {
    const active = this.effectiveStyle?.[key] === true
    const local = typeof this.props.value?.[key] === 'boolean'
    return (
      <button
        type="button"
        className={`toolbar-typography-choice${active ? ' active' : ''}`}
        aria-label={label}
        aria-pressed={active}
        data-local-value={local ? 'true' : undefined}
        onClick={() => this.toggle(key)}
      >
        {glyph}
      </button>
    )
  }

  private renderChoice(
    key: ChoiceStyleKey,
    value: NonNullable<ITabTitleStyle[ChoiceStyleKey]>,
    label: string,
    glyph: string
  ): JSX.Element {
    const active =
      (this.effectiveStyle?.[key] ?? this.defaultChoice(key)) === value
    const local = this.props.value?.[key] === value
    return (
      <button
        type="button"
        className={`toolbar-typography-choice${active ? ' active' : ''}`}
        aria-label={label}
        aria-pressed={active}
        data-local-value={local ? 'true' : undefined}
        onClick={() => this.choose(key, value)}
      >
        {glyph}
      </button>
    )
  }

  private defaultChoice(key: ChoiceStyleKey): string {
    switch (key) {
      case 'textAlign':
        return 'left'
      case 'textCase':
        return 'normal'
      case 'textEffect':
        return 'none'
    }
  }

  private renderPreview(): JSX.Element {
    const effective = this.effectiveStyle
    const css = tabTitleStyleToCss(effective)
    const textAlign = css.textAlign ?? 'left'
    const textStyle = { ...css, textAlign: undefined }
    const descriptionStyle = {
      ...textStyle,
      fontSize:
        effective?.fontSize === undefined
          ? undefined
          : `${Math.max(MinTabFontSize, effective.fontSize - 3)}px`,
    }

    return (
      <section
        className="toolbar-typography-preview"
        aria-label={t('appearance.toolbarTypographyPreview')}
      >
        <span className="toolbar-typography-preview-label">
          {t('appearance.toolbarTypographyPreview')}
        </span>
        <div className="toolbar-typography-preview-control">
          <span className="toolbar-typography-preview-icon" aria-hidden="true">
            ◫
          </span>
          <span
            className="toolbar-typography-preview-text"
            style={{ textAlign }}
          >
            <span style={textStyle}>
              {t('appearance.toolbarTypographyPreviewTitle')}
            </span>
            <span style={descriptionStyle}>
              {t('appearance.toolbarTypographyPreviewDescription')}
            </span>
          </span>
        </div>
      </section>
    )
  }

  public render(): JSX.Element {
    const effective = this.effectiveStyle
    const size = effective?.fontSize ?? DefaultToolbarFontSize
    const spacing =
      typeof effective?.characterSpacing === 'number'
        ? effective.characterSpacing
        : DefaultTabCharacterSpacing
    const repositoryScoped = this.props.repositoryScoped === true
    const inheritedLabel = repositoryScoped
      ? t('appearance.toolbarTypographyInheritProfile')
      : t('appearance.toolbarTypographyThemeDefaults')
    const selectedColor = effective?.color
    const pickerColor =
      selectedColor !== undefined && /^#[0-9a-f]{6}$/i.test(selectedColor)
        ? selectedColor
        : '#006493'

    return (
      <section
        className="toolbar-text-style-editor"
        aria-label={t('appearance.toolbarTypographyHeading')}
      >
        <header className="toolbar-typography-header">
          <div>
            <h3>{t('appearance.toolbarTypographyHeading')}</h3>
            <span>
              {repositoryScoped
                ? this.props.value === null
                  ? t('appearance.toolbarTypographyRepositoryInherited')
                  : t('appearance.toolbarTypographyRepositoryOverride')
                : t('appearance.toolbarTypographyProfile')}
            </span>
          </div>
          <Button
            type="button"
            size="small"
            disabled={this.props.value === null}
            onClick={this.clear}
          >
            {inheritedLabel}
          </Button>
        </header>

        {this.renderPreview()}

        <fieldset className="toolbar-typography-group">
          <legend>{t('appearance.toolbarFontStyle')}</legend>
          <div className="toolbar-typography-choice-row">
            {this.renderToggle('bold', t('appearance.toolbarBold'), 'B')}
            {this.renderToggle('italic', t('appearance.toolbarItalic'), 'I')}
            {this.renderToggle(
              'underline',
              t('appearance.toolbarUnderline'),
              'U'
            )}
            {this.renderToggle(
              'strikeThrough',
              t('appearance.toolbarStrikethrough'),
              'S'
            )}
          </div>
        </fieldset>

        <fieldset className="toolbar-typography-group">
          <legend>{t('appearance.toolbarAlignment')}</legend>
          <div className="toolbar-typography-choice-row">
            {this.renderChoice(
              'textAlign',
              'left',
              t('appearance.toolbarAlignLeft'),
              '≡←'
            )}
            {this.renderChoice(
              'textAlign',
              'center',
              t('appearance.toolbarAlignCenter'),
              '≡'
            )}
            {this.renderChoice(
              'textAlign',
              'right',
              t('appearance.toolbarAlignRight'),
              '→≡'
            )}
          </div>
        </fieldset>

        <Select
          label={t('appearance.toolbarFont')}
          value={this.props.value?.fontFamily ?? ''}
          onChange={this.onFontChanged}
        >
          <option value="">
            {repositoryScoped
              ? t('appearance.toolbarInheritFont')
              : t('appearance.toolbarThemeFont')}
          </option>
          {tabFontOptions.map(option => (
            <option key={option.family} value={option.family}>
              {option.label}
            </option>
          ))}
        </Select>

        <div className="toolbar-typography-range">
          <label htmlFor="toolbar-typography-size">
            {t('appearance.toolbarSize')}
          </label>
          <input
            id="toolbar-typography-size"
            type="range"
            min={MinTabFontSize}
            max={MaxToolbarFontSize}
            step={1}
            value={size}
            onChange={this.onSizeChanged}
          />
          <output htmlFor="toolbar-typography-size">{size}px</output>
          <button
            type="button"
            className="toolbar-typography-reset-field"
            disabled={this.props.value?.fontSize === undefined}
            onClick={() => this.clearField('fontSize')}
          >
            {repositoryScoped
              ? t('appearance.toolbarInheritSize')
              : t('appearance.toolbarThemeSize')}
          </button>
        </div>

        <fieldset className="toolbar-typography-group">
          <legend>{t('appearance.toolbarLetterCase')}</legend>
          <div className="toolbar-typography-choice-row toolbar-typography-choice-row-wrap">
            {this.renderChoice(
              'textCase',
              'normal',
              t('appearance.toolbarNormalCase'),
              'Aa'
            )}
            {this.renderChoice(
              'textCase',
              'uppercase',
              t('appearance.toolbarUppercase'),
              'AA'
            )}
            {this.renderChoice(
              'textCase',
              'lowercase',
              t('appearance.toolbarLowercase'),
              'aa'
            )}
            {this.renderChoice(
              'textCase',
              'capitalize',
              t('appearance.toolbarCapitalize'),
              'Ab'
            )}
            {this.renderToggle(
              'smallCaps',
              t('appearance.toolbarSmallCaps'),
              'SC'
            )}
          </div>
        </fieldset>

        <div className="toolbar-typography-range">
          <label htmlFor="toolbar-typography-spacing">
            {t('appearance.toolbarSpacing')}
          </label>
          <input
            id="toolbar-typography-spacing"
            type="range"
            min={MinTabCharacterSpacing}
            max={MaxTabCharacterSpacing}
            step={0.25}
            value={spacing}
            onChange={this.onSpacingChanged}
          />
          <output htmlFor="toolbar-typography-spacing">{spacing}px</output>
          <button
            type="button"
            className="toolbar-typography-reset-field"
            disabled={this.props.value?.characterSpacing === undefined}
            onClick={() => this.clearField('characterSpacing')}
          >
            {repositoryScoped
              ? t('appearance.toolbarInheritSpacing')
              : t('appearance.toolbarThemeSpacing')}
          </button>
        </div>

        <fieldset className="toolbar-typography-group">
          <legend>{t('appearance.toolbarTextEffect')}</legend>
          <div className="toolbar-typography-choice-row">
            {this.renderChoice(
              'textEffect',
              'none',
              t('appearance.toolbarNoEffect'),
              'None'
            )}
            {this.renderChoice(
              'textEffect',
              'soft-shadow',
              t('appearance.toolbarSoftShadow'),
              'Soft'
            )}
            {this.renderChoice(
              'textEffect',
              'strong-shadow',
              t('appearance.toolbarStrongShadow'),
              'Strong'
            )}
          </div>
        </fieldset>

        <fieldset className="toolbar-typography-group toolbar-typography-colors">
          <legend>{t('appearance.toolbarTextColor')}</legend>
          <div className="toolbar-typography-color-actions">
            <button
              type="button"
              className="toolbar-typography-reset-field"
              disabled={this.props.value?.color === undefined}
              onClick={() => this.clearField('color')}
            >
              {repositoryScoped
                ? t('appearance.toolbarInheritColor')
                : t('appearance.toolbarThemeColor')}
            </button>
            <label className="toolbar-typography-custom-color">
              <span style={{ backgroundColor: pickerColor }} />
              {t('appearance.toolbarCustomColor')}
              <input
                type="color"
                value={pickerColor}
                aria-label={t('appearance.toolbarCustomColor')}
                onChange={this.onCustomColor}
              />
            </label>
          </div>
          <div className="toolbar-typography-swatches">
            {ToolbarTextColors.map(color => {
              const active =
                selectedColor?.toLowerCase() === color.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  className={`toolbar-typography-swatch${
                    active ? ' active' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`${t('appearance.toolbarTextColor')} ${color}`}
                  aria-pressed={active}
                  onClick={() => this.patch({ color })}
                />
              )
            })}
          </div>
        </fieldset>
      </section>
    )
  }
}
