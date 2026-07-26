import * as React from 'react'
import classNames from 'classnames'
import { normalizeOperationProgress } from '../../lib/progress/operation-progress'

export interface IOperationProgressRowProps {
  /**
   * The accessible name of the bar itself, e.g. "Deepening history". Always
   * required — a progressbar without a name is unusable with a screen reader.
   */
  readonly label: string

  /**
   * Human-readable description of what is happening right now, rendered into a
   * polite live region above the bar. Keep this a full sentence or phrase; it
   * is the line sighted users read.
   */
  readonly description?: string

  /**
   * Units completed. Pass null (or omit) while the operation is running but
   * its extent is unknown — the row then renders the indeterminate indicator
   * and omits `aria-valuenow`.
   */
  readonly value?: number | null

  /** Total units of work, or null when unknown. */
  readonly max?: number | null

  /**
   * Spoken alternative for the current value, e.g. "3 of 12 branches deleted".
   * Falls back to a plain "x of y" when omitted on a determinate bar.
   */
  readonly valueText?: string

  /** Optional secondary line under the bar (bytes, rate, current item). */
  readonly detail?: React.ReactNode

  /** Rendered on the right of the heading, e.g. "3/12". Decorative. */
  readonly countText?: string

  readonly className?: string
}

/**
 * The shared progress row every long-running operation in the app mounts.
 *
 * It is deliberately tiny: a live-region description, a `role="progressbar"`
 * track that is determinate whenever real counts exist and indeterminate
 * otherwise, and an optional detail line. Reusing it keeps the ARIA wiring
 * identical everywhere rather than each surface reinventing it.
 */
export class OperationProgressRow extends React.Component<IOperationProgressRowProps> {
  public render() {
    const { value, max } = normalizeOperationProgress(
      this.props.value,
      this.props.max
    )
    const determinate = value !== null && max !== null
    const percent = determinate ? Math.round((value / max) * 100) : null
    const valueText =
      this.props.valueText ?? (determinate ? `${value} of ${max}` : undefined)

    return (
      <div className={classNames('operation-progress', this.props.className)}>
        {(this.props.description !== undefined ||
          this.props.countText !== undefined) && (
          <div className="operation-progress-heading">
            {this.props.description !== undefined && (
              <span
                className="operation-progress-description"
                role="status"
                aria-live="polite"
              >
                {this.props.description}
              </span>
            )}
            {this.props.countText !== undefined && (
              <span className="operation-progress-count" aria-hidden="true">
                {this.props.countText}
              </span>
            )}
          </div>
        )}
        <div
          className={classNames('operation-progress-track', {
            indeterminate: !determinate,
          })}
          role="progressbar"
          aria-label={this.props.label}
          aria-busy={true}
          aria-valuemin={0}
          aria-valuemax={determinate ? max : undefined}
          aria-valuenow={determinate ? value : undefined}
          aria-valuetext={valueText}
        >
          {percent !== null && <span style={{ width: `${percent}%` }} />}
        </div>
        {this.props.detail !== undefined && this.props.detail !== null && (
          <div className="operation-progress-detail">{this.props.detail}</div>
        )}
      </div>
    )
  }
}
