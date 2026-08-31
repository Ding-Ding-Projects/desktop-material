import * as React from 'react'
import classNames from 'classnames'
import { singleFlightActions } from '../../lib/single-flight-action'

let nextFormActionId = 0

interface IFormProps {
  /** The class name for the form. */
  readonly className?: string

  /** Called when the form is submitted. */
  readonly onSubmit?: () => void | PromiseLike<unknown>

  /** Coordinate alternate submit controls for this exact operation. */
  readonly activationKey?: string
}

/** A form element with app-standard styles. */
export class Form extends React.Component<IFormProps, {}> {
  private readonly instanceActivationKey = `form:${++nextFormActionId}`

  public render() {
    const className = classNames('form-component', this.props.className)
    return (
      <form className={className} onSubmit={this.onSubmit}>
        {this.props.children}
      </form>
    )
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (this.props.onSubmit) {
      void singleFlightActions.run(
        this.props.activationKey ?? this.instanceActivationKey,
        this.props.onSubmit
      )
    }
  }
}
