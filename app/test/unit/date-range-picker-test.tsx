import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { IDateRange } from '../../src/lib/changelog/changelog-dates'
import { DateRangePicker } from '../../src/ui/lib/date-range-picker'
import { fireEvent, render } from '../helpers/ui/render'

/** 15 July 2026, so the presets and the opening month are deterministic. */
const Today = new Date(2026, 6, 15)

interface IHarnessProps {
  readonly initialRange: IDateRange
  readonly onRangeChanged?: (range: IDateRange) => void
}

/**
 * A controlled parent, because the picker is used as one: the changelog dialog
 * stores the emitted range and hands it straight back as a prop. Rendering the
 * picker uncontrolled hides every defect that lives in that round trip.
 */
class Harness extends React.Component<IHarnessProps, { range: IDateRange }> {
  public constructor(props: IHarnessProps) {
    super(props)
    this.state = { range: props.initialRange }
  }

  private onRangeChanged = (range: IDateRange) => {
    this.props.onRangeChanged?.(range)
    this.setState({ range })
  }

  public render() {
    return (
      <DateRangePicker
        range={this.state.range}
        onRangeChanged={this.onRangeChanged}
        languageMode="english"
        locale="en"
        today={Today}
      />
    )
  }
}

/**
 * Types onto the end of whatever the field currently holds, one character at a
 * time — the point being that a field which rewrites itself mid-word is typed
 * into on top of the rewrite, exactly as a person with a keyboard would.
 */
function typeInto(field: HTMLInputElement, characters: string) {
  for (const character of characters) {
    fireEvent.change(field, { target: { value: field.value + character } })
  }
}

function field(view: ReturnType<typeof render>, label: string) {
  return view.getByLabelText(label) as HTMLInputElement
}

describe('DateRangePicker typed fields', () => {
  it('leaves a half-typed date alone rather than rewriting it under the caret', () => {
    const emitted = new Array<IDateRange>()
    const view = render(
      <Harness
        initialRange={{ from: null, to: '2026-01-05' }}
        onRangeChanged={range => emitted.push(range)}
      />
    )
    const from = field(view, 'From')
    const to = field(view, 'To')

    typeInto(from, '2026-07-3')
    // The ISO pattern takes a one-digit day, so this parses while it is still
    // being typed. The parsed form used to come back down as a prop and replace
    // the text with `2026-07-03`, caret at the end.
    assert.equal(from.value, '2026-07-3')
    // And it must not travel: normalising a range mid-keystroke swapped the
    // ends, dropping the half-typed value into To and To's old value into From.
    assert.equal(to.value, '2026-01-05')

    typeInto(from, '1')
    assert.equal(from.value, '2026-07-31')
    assert.equal(to.value, '2026-01-05')
    assert.deepEqual(emitted[emitted.length - 1], {
      from: '2026-07-31',
      to: '2026-01-05',
    })
    assert.equal(view.container.querySelector('.date-range-error'), null)
  })

  it('reports a partial entry inline without discarding the typed text', () => {
    const view = render(<Harness initialRange={{ from: null, to: null }} />)
    const from = field(view, 'From')

    typeInto(from, '2026-')
    assert.equal(from.value, '2026-')
    assert.equal(from.getAttribute('aria-invalid'), 'true')
    const error = view.container.querySelector('.date-range-error')
    assert.ok(error !== null)
    assert.equal(error.getAttribute('role'), 'alert')
  })

  it('still puts the ends in order when the calendar is clicked out of order', () => {
    const view = render(<Harness initialRange={{ from: null, to: null }} />)

    fireEvent.click(view.getByRole('button', { name: '7/20/2026' }))
    fireEvent.click(view.getByRole('button', { name: '7/5/2026' }))

    assert.equal(field(view, 'From').value, '2026-07-05')
    assert.equal(field(view, 'To').value, '2026-07-20')
  })

  it('lets a preset rewrite a field that had been typed into', () => {
    const view = render(<Harness initialRange={{ from: null, to: null }} />)
    const from = field(view, 'From')

    typeInto(from, '2026-07-31')
    fireEvent.click(view.getByRole('button', { name: 'Last 7 days' }))

    assert.equal(from.value, '2026-07-09')
    assert.equal(field(view, 'To').value, '2026-07-15')
  })
})

describe('DateRangePicker calendar grid', () => {
  const tabStops = (view: ReturnType<typeof render>) =>
    Array.from(
      view.container.querySelectorAll<HTMLElement>(
        '.date-range-days [data-date]'
      )
    ).filter(cell => cell.tabIndex === 0)

  it('offers one tab stop in a month holding both ends, and one holding neither', () => {
    const view = render(
      <Harness initialRange={{ from: '2026-07-09', to: '2026-07-15' }} />
    )

    // Two selected days used to claim a tab stop apiece.
    const july = tabStops(view)
    assert.equal(july.length, 1)
    assert.equal(july[0].dataset.date, '2026-07-09')

    fireEvent.click(view.getByRole('button', { name: 'Previous month' }))

    // June holds neither end, and the fallback stop used to exist only while no
    // range was set — so the whole grid fell out of the tab order, taking the
    // arrow-key roving inside it with it.
    const june = tabStops(view)
    assert.equal(june.length, 1)
    assert.equal(june[0].dataset.date, '2026-06-01')
  })

  it('anchors the tab stop on whichever end the visible month holds', () => {
    const view = render(
      <Harness initialRange={{ from: '2026-06-30', to: '2026-07-15' }} />
    )

    const june = tabStops(view)
    assert.equal(june.length, 1)
    assert.equal(june[0].dataset.date, '2026-06-30')

    fireEvent.click(view.getByRole('button', { name: 'Next month' }))

    const july = tabStops(view)
    assert.equal(july.length, 1)
    assert.equal(july[0].dataset.date, '2026-07-15')
  })
})
