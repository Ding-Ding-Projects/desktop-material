import * as React from 'react'

import {
  getNumber,
  getStringArray,
  setNumber,
  setStringArray,
} from '../../lib/local-storage'
import {
  AnimatedRainbowColor,
  isAnimatedRainbowColor,
} from '../../models/color-value'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import * as ColorEngine from './infinite-color-engine'
import type { IInfiniteColor } from './infinite-color-engine'

export { AnimatedRainbowColor, isAnimatedRainbowColor }

export type RainbowSpeedLevel = 1 | 2 | 3 | 4 | 5

/**
 * One global speed scale, shared by every rainbow surface. Higher means faster.
 * The stylesheet consumes the published duration rather than running a timer.
 */
export const RainbowDurationSeconds: Readonly<
  Record<RainbowSpeedLevel, number>
> = {
  1: 24,
  2: 16,
  3: 10,
  4: 6,
  5: 3,
}

const DefaultColor = '#006493'
const DefaultRainbowSpeed: RainbowSpeedLevel = 3
const RainbowSpeedStorageKey = 'infinite-color-picker-rainbow-speed'
const RecentColorStorageKey = 'infinite-color-picker-recent-colors'
const RecentColorLimit = 12
const FieldStep = 0.01
const FieldLargeStep = 0.1

const DefaultSwatches: ReadonlyArray<string> = [
  '#000000',
  '#ffffff',
  '#ba1a1a',
  '#9a6700',
  '#3a6a00',
  '#006a60',
  '#006493',
  '#6f43c0',
  '#a93a5b',
]

let pickerSequence = 0

export function isInfiniteColorValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (isAnimatedRainbowColor(value) || ColorEngine.parse(value) !== null)
  )
}

export function normalizeRainbowSpeed(value: unknown): RainbowSpeedLevel {
  const number = typeof value === 'number' ? Math.round(value) : NaN
  return number >= 1 && number <= 5
    ? (number as RainbowSpeedLevel)
    : DefaultRainbowSpeed
}

export function rainbowDurationSeconds(value: unknown): number {
  return RainbowDurationSeconds[normalizeRainbowSpeed(value)]
}

/** Publish the one duration all CSS rainbow animations consume. */
export function publishRainbowSpeed(value: unknown): RainbowSpeedLevel {
  const level = normalizeRainbowSpeed(value)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(
      '--dm-rainbow-duration',
      `${RainbowDurationSeconds[level]}s`
    )
  }
  return level
}

function readRainbowSpeed(): RainbowSpeedLevel {
  if (typeof localStorage === 'undefined') {
    return DefaultRainbowSpeed
  }
  return normalizeRainbowSpeed(getNumber(RainbowSpeedStorageKey))
}

function serializeColor(color: IInfiniteColor): string {
  return color.alpha >= 1 ? ColorEngine.toHex(color) : ColorEngine.toHex8(color)
}

function colorOrDefault(value: unknown): IInfiniteColor {
  return (
    ColorEngine.parse(value) ??
    (ColorEngine.parse(DefaultColor) as IInfiniteColor)
  )
}

function readRecentColors(): ReadonlyArray<string> {
  if (typeof localStorage === 'undefined') {
    return []
  }
  return getStringArray(RecentColorStorageKey)
    .filter(value => !isAnimatedRainbowColor(value))
    .filter(value => ColorEngine.parse(value) !== null)
    .slice(0, RecentColorLimit)
}

export interface IInfiniteColorPickerProps {
  readonly id?: string
  readonly label: string
  readonly value: string
  readonly disabled?: boolean
  readonly allowAlpha?: boolean
  readonly allowRainbow?: boolean
  readonly swatches?: ReadonlyArray<string>
  readonly contrastAgainst?: string
  readonly onChange: (value: string) => void
}

interface IInfiniteColorPickerState {
  readonly color: IInfiniteColor
  readonly hue: number
  readonly open: boolean
  readonly rainbow: boolean
  readonly rainbowSpeed: RainbowSpeedLevel
  readonly recentColors: ReadonlyArray<string>
  readonly entry: string
  readonly error: string | null
  readonly copiedFormat: string | null
}

/**
 * Material Design 3 infinite color control shared by every app color surface.
 * The native opaque color well is deliberately absent: the continuous field,
 * alpha, format translator, contrast evidence, and rainbow are one control.
 */
export class InfiniteColorPicker extends React.Component<
  IInfiniteColorPickerProps,
  IInfiniteColorPickerState
> {
  private readonly triggerRef = React.createRef<HTMLButtonElement>()
  private readonly instanceId =
    this.props.id ?? `infinite-color-picker-${++pickerSequence}`
  private dragging = false
  private copyTimer: number | null = null

  public constructor(props: IInfiniteColorPickerProps) {
    super(props)
    const color = colorOrDefault(props.value)
    const hsv = ColorEngine.rgbToHsv(color.r, color.g, color.b)
    const speed = publishRainbowSpeed(readRainbowSpeed())
    this.state = {
      color,
      hue: hsv.h,
      open: false,
      rainbow: isAnimatedRainbowColor(props.value),
      rainbowSpeed: speed,
      recentColors: readRecentColors(),
      entry: serializeColor(color),
      error: null,
      copiedFormat: null,
    }
  }

  public componentDidUpdate(previous: IInfiniteColorPickerProps) {
    if (previous.value !== this.props.value) {
      const color = colorOrDefault(this.props.value)
      const hsv = ColorEngine.rgbToHsv(color.r, color.g, color.b)
      this.setState({
        color,
        hue: hsv.s > 0.0001 && hsv.v > 0.0001 ? hsv.h : this.state.hue,
        rainbow: isAnimatedRainbowColor(this.props.value),
        entry: serializeColor(color),
        error: null,
      })
    }
    if (this.props.disabled === true && this.state.open) {
      this.setState({ open: false })
    }
  }

  public componentWillUnmount() {
    if (this.copyTimer !== null) {
      window.clearTimeout(this.copyTimer)
    }
  }

  private open = () => {
    if (this.props.disabled !== true) {
      this.setState({ open: true })
    }
  }

  private close = () => {
    this.setState({ open: false }, () => this.triggerRef.current?.focus())
  }

  private toggle = () => {
    if (this.state.open) {
      this.close()
    } else {
      this.open()
    }
  }

  private remember(value: string) {
    if (isAnimatedRainbowColor(value) || ColorEngine.parse(value) === null) {
      return
    }
    const normalized = value.toLowerCase()
    const recent = [
      normalized,
      ...this.state.recentColors.filter(
        candidate => candidate.toLowerCase() !== normalized
      ),
    ].slice(0, RecentColorLimit)
    this.setState({ recentColors: recent })
    if (typeof localStorage !== 'undefined') {
      setStringArray(RecentColorStorageKey, recent)
    }
  }

  private setColor(color: IInfiniteColor, commit: boolean) {
    const hsv = ColorEngine.rgbToHsv(color.r, color.g, color.b)
    const value = serializeColor(color)
    this.setState({
      color,
      hue: hsv.s > 0.0001 && hsv.v > 0.0001 ? hsv.h : this.state.hue,
      rainbow: false,
      entry: value,
      error: null,
    })
    if (commit) {
      this.remember(value)
      this.props.onChange(value)
    }
  }

  private commitCurrentColor = () => {
    const value = serializeColor(this.state.color)
    this.remember(value)
    this.props.onChange(value)
  }

  private onEntryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const entry = event.currentTarget.value
    const color = ColorEngine.parse(entry)
    if (color === null) {
      this.setState({ entry })
      return
    }
    this.setColor(color, true)
  }

  private commitText(text: string) {
    const color = ColorEngine.parse(text)
    if (color === null) {
      this.setState({
        error:
          'That value is not a supported color. The text is kept so it can be corrected.',
      })
      return false
    }
    this.setColor(color, true)
    return true
  }

  private onEntryBlur = () => {
    this.commitText(this.state.entry)
  }

  private onEntryKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commitText(this.state.entry)
    }
  }

  private setFromField(clientX: number, clientY: number) {
    const field = document.getElementById(`${this.instanceId}-field`)
    if (field === null) {
      return
    }
    const bounds = field.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) {
      return
    }
    const saturation = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width)
    )
    const value =
      1 - Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height))
    const rgb = ColorEngine.hsvToRgb(this.state.hue, saturation, value)
    this.setColor(
      ColorEngine.make(rgb.r, rgb.g, rgb.b, this.state.color.alpha),
      false
    )
  }

  private onFieldPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    this.dragging = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is a convenience; the field still handles local input.
    }
    event.currentTarget.focus()
    this.setFromField(event.clientX, event.clientY)
    event.preventDefault()
  }

  private onFieldPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (this.dragging) {
      this.setFromField(event.clientX, event.clientY)
    }
  }

  private onFieldPointerUp = () => {
    if (this.dragging) {
      this.dragging = false
      this.commitCurrentColor()
    }
  }

  private onFieldPointerCancel = () => {
    this.dragging = false
  }

  private onFieldKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const hsv = ColorEngine.rgbToHsv(
      this.state.color.r,
      this.state.color.g,
      this.state.color.b
    )
    const step = event.shiftKey ? FieldLargeStep : FieldStep
    let saturation = hsv.s
    let value = hsv.v
    switch (event.key) {
      case 'ArrowLeft':
        saturation -= step
        break
      case 'ArrowRight':
        saturation += step
        break
      case 'ArrowUp':
        value += step
        break
      case 'ArrowDown':
        value -= step
        break
      case 'Home':
        saturation = 0
        break
      case 'End':
        saturation = 1
        break
      case 'PageUp':
        value = 1
        break
      case 'PageDown':
        value = 0
        break
      default:
        return
    }
    event.preventDefault()
    const rgb = ColorEngine.hsvToRgb(
      this.state.hue,
      Math.max(0, Math.min(1, saturation)),
      Math.max(0, Math.min(1, value))
    )
    this.setColor(
      ColorEngine.make(rgb.r, rgb.g, rgb.b, this.state.color.alpha),
      true
    )
  }

  private onHueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const hue = event.currentTarget.valueAsNumber
    const hsv = ColorEngine.rgbToHsv(
      this.state.color.r,
      this.state.color.g,
      this.state.color.b
    )
    const rgb = ColorEngine.hsvToRgb(hue, hsv.s, hsv.v)
    const color = ColorEngine.make(rgb.r, rgb.g, rgb.b, this.state.color.alpha)
    this.setState({ hue })
    this.setColor(color, true)
  }

  private onAlphaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setColor(
      ColorEngine.make(
        this.state.color.r,
        this.state.color.g,
        this.state.color.b,
        event.currentTarget.valueAsNumber / 100
      ),
      true
    )
  }

  private onSwatch = (event: React.MouseEvent<HTMLButtonElement>) => {
    const value = event.currentTarget.value
    const color = ColorEngine.parse(value)
    if (color !== null) {
      this.setColor(color, true)
    }
  }

  private selectRainbow = () => {
    if (this.props.allowRainbow !== false) {
      this.setState({ rainbow: true, error: null })
      this.props.onChange(AnimatedRainbowColor)
    }
  }

  private onRainbowSpeedChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const rainbowSpeed = publishRainbowSpeed(event.currentTarget.valueAsNumber)
    this.setState({ rainbowSpeed })
    if (typeof localStorage !== 'undefined') {
      setNumber(RainbowSpeedStorageKey, rainbowSpeed)
    }
  }

  private onTranslationBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    this.commitText(event.currentTarget.value)
  }

  private onTranslationKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commitText(event.currentTarget.value)
    }
  }

  private onCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const value = event.currentTarget.dataset.value
    const format = event.currentTarget.dataset.format
    if (value === undefined || format === undefined) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      this.setState({ copiedFormat: format })
      if (this.copyTimer !== null) {
        window.clearTimeout(this.copyTimer)
      }
      this.copyTimer = window.setTimeout(
        () => this.setState({ copiedFormat: null }),
        1400
      )
    } catch {
      this.setState({ error: 'The color value could not be copied.' })
    }
  }

  private renderSwatches(
    title: string,
    values: ReadonlyArray<string>,
    className: string
  ) {
    const filtered = values
      .filter(value => !isAnimatedRainbowColor(value))
      .filter(value => ColorEngine.parse(value) !== null)
    if (filtered.length === 0) {
      return null
    }
    return (
      <section className="infinite-color-picker-swatches">
        <h4>{title}</h4>
        <div className="infinite-color-picker-swatch-row">
          {filtered.map(value => (
            <button
              key={`${className}-${value}`}
              type="button"
              className="infinite-color-picker-swatch"
              style={{ backgroundColor: value }}
              value={value}
              aria-label={`${title}: ${value}`}
              onClick={this.onSwatch}
            />
          ))}
        </div>
      </section>
    )
  }

  private renderTranslator() {
    return (
      <section className="infinite-color-picker-translator">
        <h4>Color translator</h4>
        <p>Every row is editable and copyable.</p>
        <div className="infinite-color-picker-translation-list">
          {ColorEngine.translate(this.state.color).map(row => (
            <div
              className="infinite-color-picker-translation-row"
              key={`${row.id}-${serializeColor(this.state.color)}`}
            >
              <label htmlFor={`${this.instanceId}-${row.id}`}>
                {row.label}
              </label>
              <input
                id={`${this.instanceId}-${row.id}`}
                type="text"
                defaultValue={row.value ?? ''}
                placeholder={row.defined ? undefined : 'No defined name'}
                maxLength={96}
                spellCheck={false}
                aria-label={`${row.label} color value`}
                onBlur={this.onTranslationBlur}
                onKeyDown={this.onTranslationKeyDown}
              />
              <button
                type="button"
                disabled={!row.defined || row.value === null}
                data-format={row.id}
                data-value={row.value ?? undefined}
                aria-label={`Copy ${row.label} color value`}
                onClick={this.onCopy}
              >
                {this.state.copiedFormat === row.id ? 'Copied' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </section>
    )
  }

  private renderPopover() {
    const hsv = ColorEngine.rgbToHsv(
      this.state.color.r,
      this.state.color.g,
      this.state.color.b
    )
    const serialized = serializeColor(this.state.color)
    const backdrop = colorOrDefault(this.props.contrastAgainst ?? '#ffffff')
    const contrast = ColorEngine.contrastReport(this.state.color, backdrop)
    const alphaTrackStyle = {
      '--dm-infinite-alpha-color': ColorEngine.toHex(this.state.color),
    } as React.CSSProperties
    const fieldStyle = {
      backgroundColor: `hsl(${this.state.hue}deg 100% 50%)`,
    }

    return (
      <Popover
        anchor={this.triggerRef.current}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        className="infinite-color-picker-popover"
        decoration={PopoverDecoration.Bordered}
        ariaLabelledby={`${this.instanceId}-heading`}
        onMousedownOutside={this.close}
        onClickOutside={this.close}
      >
        <div className="infinite-color-picker-panel">
          <header>
            <div>
              <h3 id={`${this.instanceId}-heading`}>{this.props.label}</h3>
              <span>
                {this.state.rainbow ? 'Animated rainbow' : serialized}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close color picker"
              onClick={this.close}
            >
              Close
            </button>
          </header>

          <div className="infinite-color-picker-preview-row">
            <span
              className={
                this.state.rainbow
                  ? 'infinite-color-picker-preview infinite-color-picker-rainbow-background'
                  : 'infinite-color-picker-preview'
              }
              style={
                this.state.rainbow ? undefined : { backgroundColor: serialized }
              }
              role="img"
              aria-label={
                this.state.rainbow
                  ? 'Animated rainbow color preview'
                  : `${serialized} color preview`
              }
            />
            <div>
              <strong>
                {ColorEngine.toName(this.state.color) ?? serialized}
              </strong>
              <span>
                {this.state.color.clipped ? 'Outside sRGB (clipped)' : 'sRGB'} ·{' '}
                {Math.round(this.state.color.alpha * 100)}% opacity
              </span>
            </div>
          </div>

          <div
            id={`${this.instanceId}-field`}
            className="infinite-color-picker-field"
            role="slider"
            tabIndex={0}
            aria-label="Saturation and brightness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.v * 100)}
            aria-valuetext={`Saturation ${Math.round(
              hsv.s * 100
            )}%, brightness ${Math.round(hsv.v * 100)}%`}
            style={fieldStyle}
            onPointerDown={this.onFieldPointerDown}
            onPointerMove={this.onFieldPointerMove}
            onPointerUp={this.onFieldPointerUp}
            onPointerCancel={this.onFieldPointerCancel}
            onKeyDown={this.onFieldKeyDown}
          >
            <span
              className="infinite-color-picker-field-marker"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>

          <label className="infinite-color-picker-range">
            <span>Hue</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={Math.round(this.state.hue)}
              aria-label="Hue"
              onChange={this.onHueChange}
            />
            <output>{Math.round(this.state.hue)}°</output>
          </label>

          {this.props.allowAlpha !== false && (
            <label
              className="infinite-color-picker-range infinite-color-picker-alpha"
              style={alphaTrackStyle}
            >
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(this.state.color.alpha * 100)}
                aria-label="Opacity"
                onChange={this.onAlphaChange}
              />
              <output>{Math.round(this.state.color.alpha * 100)}%</output>
            </label>
          )}

          <label className="infinite-color-picker-entry">
            <span>{this.props.label}</span>
            <input
              type="text"
              value={this.state.entry}
              maxLength={96}
              spellCheck={false}
              aria-invalid={this.state.error !== null}
              aria-describedby={`${this.instanceId}-message`}
              onChange={this.onEntryChange}
              onBlur={this.onEntryBlur}
              onKeyDown={this.onEntryKeyDown}
            />
          </label>

          {this.props.allowRainbow !== false && (
            <section className="infinite-color-picker-rainbow">
              <div>
                <button
                  type="button"
                  className={this.state.rainbow ? 'active' : undefined}
                  aria-pressed={this.state.rainbow}
                  onClick={this.selectRainbow}
                >
                  <span className="infinite-color-picker-rainbow-background" />
                  Animated rainbow
                </button>
                <span>
                  Stored as a marker; CSS animates every rainbow surface
                  together.
                </span>
              </div>
              <label className="infinite-color-picker-range">
                <span>Rainbow speed</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={this.state.rainbowSpeed}
                  aria-label="Rainbow speed, 1 slow to 5 fast"
                  onChange={this.onRainbowSpeedChange}
                />
                <output>
                  {this.state.rainbowSpeed} ·{' '}
                  {RainbowDurationSeconds[this.state.rainbowSpeed]}s
                </output>
              </label>
            </section>
          )}

          <p
            id={`${this.instanceId}-message`}
            className={
              this.state.error === null
                ? 'infinite-color-picker-status'
                : 'infinite-color-picker-status error'
            }
            aria-live="polite"
          >
            {this.state.error ??
              `Contrast ${contrast.ratio.toFixed(2)}:1 against ${
                this.props.contrastAgainst ?? '#ffffff'
              } · ${
                contrast.passesAA
                  ? 'AA'
                  : contrast.passesAALarge
                  ? 'AA large'
                  : 'below AA'
              }`}
          </p>

          {this.state.color.clipped && (
            <p className="infinite-color-picker-gamut" role="status">
              This value is outside sRGB. The preview is clipped to the nearest
              color this display can show.
            </p>
          )}

          {this.renderSwatches(
            'Custom swatches',
            this.props.swatches ?? DefaultSwatches,
            'custom'
          )}
          {this.renderSwatches(
            'Recent colors',
            this.state.recentColors,
            'recent'
          )}
          {this.renderTranslator()}
        </div>
      </Popover>
    )
  }

  public render() {
    const serialized = serializeColor(this.state.color)
    return (
      <span className="infinite-color-picker-control">
        <button
          id={this.props.id}
          type="button"
          className="infinite-color-picker-trigger"
          disabled={this.props.disabled}
          aria-haspopup="dialog"
          aria-expanded={this.state.open}
          aria-label={`${this.props.label} picker`}
          ref={this.triggerRef}
          onClick={this.toggle}
        >
          <span
            className={
              this.state.rainbow
                ? 'infinite-color-picker-trigger-swatch infinite-color-picker-rainbow-background'
                : 'infinite-color-picker-trigger-swatch'
            }
            style={
              this.state.rainbow ? undefined : { backgroundColor: serialized }
            }
            aria-hidden="true"
          />
          <span>{this.state.rainbow ? 'Rainbow' : serialized}</span>
        </button>
        <input
          className="infinite-color-picker-inline-input"
          type="text"
          value={this.state.entry}
          aria-label={this.props.label}
          onChange={this.onEntryChange}
          onBlur={this.onEntryBlur}
          disabled={this.props.disabled}
          spellCheck={false}
        />
        {this.state.open && this.renderPopover()}
      </span>
    )
  }
}
