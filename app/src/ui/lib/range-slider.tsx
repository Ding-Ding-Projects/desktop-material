import * as React from 'react'
import classNames from 'classnames'
import { personalizeOptionalText } from '../../lib/personal-vocabulary-rendering'

interface IRangeSliderProps {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly valueText?: string
  readonly ariaDescribedBy?: string
  readonly ariaValueText?: string
  readonly disabled?: boolean
  readonly className?: string
  readonly onChange: (value: number) => void
}

/**
 * Shared Material range control for preference values.
 *
 * The global Material controls stylesheet owns the track and thumb anatomy;
 * this wrapper keeps labels, output, and numeric change plumbing consistent so
 * a preference never needs to hand-roll a bare range input.
 */
export function RangeSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  valueText = String(value),
  ariaDescribedBy,
  ariaValueText = valueText,
  disabled = false,
  className,
  onChange,
}: IRangeSliderProps) {
  const outputId = `${id}-value`
  return (
    <div className={classNames('range-slider-component', className)}>
      <div className="range-slider-label-row">
        <label htmlFor={id}>{personalizeOptionalText(label)}</label>
        <output id={outputId} htmlFor={id} aria-live="polite">
          {personalizeOptionalText(valueText)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        aria-valuetext={personalizeOptionalText(ariaValueText)}
        onChange={event => onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}
