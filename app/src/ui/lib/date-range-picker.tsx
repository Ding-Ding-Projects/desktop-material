import * as React from 'react'
import classNames from 'classnames'

import {
  DateRangePresetId,
  DateRangePresetIds,
  formatIsoDate,
  getTypedDateHint,
  IDateRange,
  matchDateRangePreset,
  normalizeDateRange,
  parseTypedDate,
  ParsedDate,
  resolveDateRangePreset,
  toIsoDate,
} from '../../lib/changelog/changelog-dates'
import {
  SupportedLocale,
  translate,
  TranslationKey,
  TranslationVariables,
  translateForAccessibleName,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import { MaterialSymbol } from './material-symbol'

/**
 * An inclusive date-range picker: a month grid with month and year jumps,
 * named presets, and two typed fields that accept ISO alongside the locale's
 * own order.
 *
 * The calendar and the fields are two views of one range, never two states: a
 * click updates the text, typing moves the calendar, and neither clears the
 * other. A partial or impossible entry is reported under its field and the
 * typed characters are left alone, because a field that erases what you typed
 * the moment you pause is unusable with a keyboard.
 */

const MonthNames: Readonly<Record<SupportedLocale, ReadonlyArray<string>>> = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  'zh-HK': [
    '一月',
    '二月',
    '三月',
    '四月',
    '五月',
    '六月',
    '七月',
    '八月',
    '九月',
    '十月',
    '十一月',
    '十二月',
  ],
}

/** Sunday-first, matching the platform calendar on Windows. */
const WeekdayNames: Readonly<Record<SupportedLocale, ReadonlyArray<string>>> = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  'zh-HK': ['日', '一', '二', '三', '四', '五', '六'],
}

const PresetKeys: Readonly<Record<DateRangePresetId, TranslationKey>> = {
  all: 'dateRange.preset.all',
  last7: 'dateRange.preset.last7',
  last30: 'dateRange.preset.last30',
  last90: 'dateRange.preset.last90',
  thisYear: 'dateRange.preset.thisYear',
  lastYear: 'dateRange.preset.lastYear',
}

const FailureKeys: Readonly<Record<string, TranslationKey>> = {
  incomplete: 'dateRange.error.incomplete',
  outOfRange: 'dateRange.error.outOfRange',
  unrecognized: 'dateRange.error.unrecognized',
}

interface IDateRangePickerProps {
  readonly range: IDateRange
  readonly onRangeChanged: (range: IDateRange) => void
  readonly languageMode: LanguageMode
  readonly locale: SupportedLocale
  /**
   * The clock the presets resolve against. Injected so a range cannot shift
   * under a picker left open past midnight, and so tests are deterministic.
   */
  readonly today: Date
  /** Bounds the calendar will not navigate past, when the data has bounds. */
  readonly earliest?: string | null
  readonly latest?: string | null
}

interface IDateRangePickerState {
  /** The month the grid is showing, as the first of that month. */
  readonly visibleMonth: Date
  /** Exactly what the user typed, never normalised behind their back. */
  readonly fromText: string
  readonly toText: string
  readonly fromParse: ParsedDate
  readonly toParse: ParsedDate
  /** Which end the next calendar click sets. */
  readonly nextEdge: 'from' | 'to'
}

/** A known-good bound as an already-parsed value; null reads as an empty field. */
function parsedFrom(iso: string | null): ParsedDate {
  return iso === null ? { kind: 'empty' } : { kind: 'valid', iso }
}

function firstOfMonth(iso: string | null, fallback: Date): Date {
  if (iso === null) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), 1)
  }
  const [year, month] = iso.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

export class DateRangePicker extends React.Component<
  IDateRangePickerProps,
  IDateRangePickerState
> {
  private gridRef = React.createRef<HTMLDivElement>()

  /**
   * The range this component last sent up from a typed field.
   *
   * A keystroke reaches the parent and comes straight back as a new `range`
   * prop, so `componentDidUpdate` has no way of its own to tell an outside
   * change from the echo of the character just typed. Remembering what was sent
   * makes the echo recognisable, which is the difference between a field you can
   * type `2026-07-31` into and one that rewrites itself to `2026-07-03` after
   * the eighth character and parks the caret at the end.
   */
  private typedEcho: IDateRange | null = null

  public constructor(props: IDateRangePickerProps) {
    super(props)
    this.state = {
      visibleMonth: firstOfMonth(
        props.range.from ?? props.range.to,
        props.today
      ),
      fromText: props.range.from ?? '',
      toText: props.range.to ?? '',
      fromParse: parsedFrom(props.range.from),
      toParse: parsedFrom(props.range.to),
      nextEdge: 'from',
    }
  }

  public componentDidUpdate(prevProps: IDateRangePickerProps) {
    if (
      prevProps.range.from === this.props.range.from &&
      prevProps.range.to === this.props.range.to
    ) {
      return
    }

    const echo = this.typedEcho
    this.typedEcho = null
    if (
      echo !== null &&
      echo.from === this.props.range.from &&
      echo.to === this.props.range.to
    ) {
      // The user's own keystroke coming back around. Rewriting the field here
      // would replace a half-typed date with its parsed form and drop the caret
      // at the end of it, so the next character lands in the wrong place.
      return
    }

    // Anything else — a preset, a calendar click, a reset, a correction the
    // parent made to what was typed — rewrites the fields, because the calendar
    // and the fields are two views of one range.
    this.setState({
      fromText: this.props.range.from ?? '',
      toText: this.props.range.to ?? '',
      fromParse:
        this.props.range.from === null
          ? { kind: 'empty' }
          : { kind: 'valid', iso: this.props.range.from },
      toParse:
        this.props.range.to === null
          ? { kind: 'empty' }
          : { kind: 'valid', iso: this.props.range.to },
    })
  }

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.props.languageMode, variables)

  private accessibleText = (
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) => translateForAccessibleName(key, variables, this.props.languageMode)

  /** Sends a finished choice — a calendar click or a preset — up, in order. */
  private emit(range: IDateRange) {
    this.typedEcho = null
    this.props.onRangeChanged(normalizeDateRange(range))
  }

  /**
   * Sends a typed range up exactly as typed, without putting it in order.
   *
   * Swapping the ends is right for a click, which is a finished choice, and
   * wrong for a keystroke, which is not: `2026-07-3` typed into From against a
   * To of `2026-01-05` reads as backwards for exactly as long as it takes to
   * type the last digit, and swapping there throws a half-written date into the
   * other field while the user is still in the middle of it.
   */
  private emitTyped(range: IDateRange) {
    this.typedEcho = range
    this.props.onRangeChanged(range)
  }

  private onFromTextChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fromText = event.target.value
    const fromParse = parseTypedDate(fromText, this.props.locale)
    this.setState({ fromText, fromParse })
    if (fromParse.kind === 'valid') {
      this.setState({
        visibleMonth: firstOfMonth(fromParse.iso, this.props.today),
      })
      this.emitTyped({ from: fromParse.iso, to: this.props.range.to })
    } else if (fromParse.kind === 'empty') {
      this.emitTyped({ from: null, to: this.props.range.to })
    }
    // An invalid entry changes nothing but its own message: the last good
    // range keeps filtering, so the list does not empty out mid-keystroke.
  }

  private onToTextChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const toText = event.target.value
    const toParse = parseTypedDate(toText, this.props.locale)
    this.setState({ toText, toParse })
    if (toParse.kind === 'valid') {
      this.setState({
        visibleMonth: firstOfMonth(toParse.iso, this.props.today),
      })
      this.emitTyped({ from: this.props.range.from, to: toParse.iso })
    } else if (toParse.kind === 'empty') {
      this.emitTyped({ from: this.props.range.from, to: null })
    }
  }

  private onPresetClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const preset = event.currentTarget.dataset.preset as DateRangePresetId
    const range = resolveDateRangePreset(preset, this.props.today)
    this.setState({
      visibleMonth: firstOfMonth(range.from, this.props.today),
      nextEdge: 'from',
    })
    this.emit(range)
  }

  private onMonthChanged = (event: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({
      visibleMonth: new Date(
        this.state.visibleMonth.getFullYear(),
        Number(event.target.value),
        1
      ),
    })
  }

  private onYearChanged = (event: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({
      visibleMonth: new Date(
        Number(event.target.value),
        this.state.visibleMonth.getMonth(),
        1
      ),
    })
  }

  private stepMonth = (delta: number) => {
    this.setState({
      visibleMonth: new Date(
        this.state.visibleMonth.getFullYear(),
        this.state.visibleMonth.getMonth() + delta,
        1
      ),
    })
  }

  private onPreviousMonth = () => this.stepMonth(-1)
  private onNextMonth = () => this.stepMonth(1)

  private onDayClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const iso = event.currentTarget.dataset.date
    if (iso === undefined) {
      return
    }
    // Click one end then the other; a third click starts a new range rather
    // than extending the old one, which is what every calendar does.
    if (this.state.nextEdge === 'from' || this.props.range.from === null) {
      this.setState({ nextEdge: 'to' })
      this.emit({ from: iso, to: null })
      return
    }
    this.setState({ nextEdge: 'from' })
    this.emit({ from: this.props.range.from, to: iso })
  }

  private onGridKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const focused = document.activeElement
    if (
      !(focused instanceof HTMLElement) ||
      focused.dataset.date === undefined
    ) {
      return
    }
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    }
    const delta = deltas[event.key]
    if (delta === undefined) {
      return
    }
    event.preventDefault()
    const [year, month, day] = focused.dataset.date.split('-').map(Number)
    const target = new Date(year, month - 1, day + delta)
    const iso = toIsoDate(target)
    this.setState({ visibleMonth: firstOfMonth(iso, this.props.today) }, () => {
      const next = this.gridRef.current?.querySelector<HTMLElement>(
        `[data-date="${iso}"]`
      )
      next?.focus()
    })
  }

  private renderPresets() {
    const active = matchDateRangePreset(this.props.range, this.props.today)
    return (
      <div
        className="date-range-presets"
        role="group"
        aria-label={this.accessibleText('dateRange.presetsLabel')}
      >
        {DateRangePresetIds.map(preset => (
          <button
            key={preset}
            type="button"
            data-preset={preset}
            className={classNames('date-range-preset', {
              active: active === preset,
            })}
            aria-pressed={active === preset}
            onClick={this.onPresetClick}
          >
            {this.text(PresetKeys[preset])}
          </button>
        ))}
      </div>
    )
  }

  private renderField(edge: 'from' | 'to') {
    const isFrom = edge === 'from'
    const value = isFrom ? this.state.fromText : this.state.toText
    const parse = isFrom ? this.state.fromParse : this.state.toParse
    const id = `date-range-${edge}`
    const invalid = parse.kind === 'invalid'
    const describedBy = invalid ? `${id}-error` : `${id}-hint`

    return (
      <div className={classNames('date-range-field', { invalid })}>
        <label htmlFor={id}>
          {this.text(isFrom ? 'dateRange.from' : 'dateRange.to')}
        </label>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={getTypedDateHint(this.props.locale)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={isFrom ? this.onFromTextChanged : this.onToTextChanged}
        />
        {invalid ? (
          <p className="date-range-error" id={`${id}-error`} role="alert">
            {this.text(FailureKeys[parse.reason])}
          </p>
        ) : (
          <p className="date-range-hint" id={`${id}-hint`}>
            {getTypedDateHint(this.props.locale)}
          </p>
        )}
      </div>
    )
  }

  private renderGrid() {
    const { locale } = this.props
    const year = this.state.visibleMonth.getFullYear()
    const month = this.state.visibleMonth.getMonth()
    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leading = first.getDay()
    const cells = new Array<JSX.Element>()

    for (let index = 0; index < leading; index++) {
      cells.push(
        <span
          key={`pad-${index}`}
          className="date-range-day empty"
          role="presentation"
        />
      )
    }

    const { from, to } = this.props.range
    const todayIso = toIsoDate(this.props.today)

    // Exactly one roving tab stop, chosen before the loop rather than tested per
    // cell. Deriving it from `selected` alone gives a month holding both ends
    // two stops, and a month holding neither — one page back from any set range
    // — none at all, which drops the whole grid out of the tab order and leaves
    // no way to reach the arrow keys that move within it.
    const visibleMonthIso = toIsoDate(first).slice(0, 7)
    const dayWithinMonth = (iso: string | null) =>
      iso !== null && iso.slice(0, 7) === visibleMonthIso
        ? Number(iso.slice(8))
        : null
    const tabStopDay = dayWithinMonth(from) ?? dayWithinMonth(to) ?? 1

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(new Date(year, month, day))
      const selected = iso === from || iso === to
      const inRange = from !== null && to !== null && iso > from && iso < to
      const outside =
        (this.props.earliest != null && iso < this.props.earliest) ||
        (this.props.latest != null && iso > this.props.latest)

      cells.push(
        <button
          key={iso}
          type="button"
          data-date={iso}
          className={classNames('date-range-day', {
            selected,
            'in-range': inRange,
            today: iso === todayIso,
            outside,
          })}
          // Roving tabindex: one stop for the whole grid, arrows move inside it.
          tabIndex={day === tabStopDay ? 0 : -1}
          aria-pressed={selected}
          aria-label={formatIsoDate(iso, locale)}
          onClick={this.onDayClick}
          // The arrow keys live on the buttons rather than on the container:
          // the container is a plain group, and hanging a keyboard listener on
          // a non-interactive element is both a lint failure and a real trap
          // for anyone navigating with the keyboard.
          onKeyDown={this.onGridKeyDown}
        >
          {day}
        </button>
      )
    }

    return (
      // A `group` of buttons rather than an ARIA `grid`. A real grid requires
      // every cell to sit inside a `row`, which this month layout does not
      // produce, and a half-formed grid role announces worse than no grid at
      // all: each day button already carries its full date as an accessible
      // name, and buttons are natively focusable, so arrow-key roving works
      // without borrowing a role the markup cannot honour.
      <div
        className="date-range-grid"
        ref={this.gridRef}
        role="group"
        aria-label={this.accessibleText('dateRange.calendarLabel')}
      >
        <div className="date-range-weekdays" aria-hidden={true}>
          {WeekdayNames[locale].map(name => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className="date-range-days">{cells}</div>
      </div>
    )
  }

  public render() {
    const { locale } = this.props
    const year = this.state.visibleMonth.getFullYear()
    // Ten years either side of the visible month covers the whole recorded
    // history without a select the length of a scrollbar.
    const years = new Array<number>()
    for (let value = year - 10; value <= year + 10; value++) {
      years.push(value)
    }

    return (
      <div className="date-range-picker">
        {this.renderPresets()}
        <div className="date-range-fields">
          {this.renderField('from')}
          {this.renderField('to')}
        </div>
        <div className="date-range-navigation">
          <button
            type="button"
            className="date-range-step"
            aria-label={this.accessibleText('dateRange.previousMonth')}
            onClick={this.onPreviousMonth}
          >
            <MaterialSymbol name="keyboard_arrow_left" />
          </button>
          <select
            className="date-range-month"
            aria-label={this.accessibleText('dateRange.month')}
            value={this.state.visibleMonth.getMonth()}
            onChange={this.onMonthChanged}
          >
            {MonthNames[locale].map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="date-range-year"
            aria-label={this.accessibleText('dateRange.year')}
            value={year}
            onChange={this.onYearChanged}
          >
            {years.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="date-range-step"
            aria-label={this.accessibleText('dateRange.nextMonth')}
            onClick={this.onNextMonth}
          >
            <MaterialSymbol name="keyboard_arrow_right" />
          </button>
        </div>
        {this.renderGrid()}
      </div>
    )
  }
}
