import * as React from 'react'
import { externalOpenGuard } from '../../lib/external-open-guard'

interface IExternalOpenBusyProps {
  /**
   * The guard key of the open this control starts, built with
   * `externalOpenTarget`. `null` renders the children as never busy, which is
   * what a control with nothing selected needs.
   */
  readonly target: string | null

  /** Renders the control, told whether its own target is currently opening. */
  readonly children: (isOpening: boolean) => JSX.Element | null
}

interface IExternalOpenBusyState {
  readonly isOpening: boolean
}

/**
 * Reports whether one external-open target is still being launched, so a
 * button that triggers it can render `aria-busy` (and stay visibly inert) for
 * exactly as long as the guard is refusing repeats.
 *
 * The guard is a plain observable rather than app state because the launch is
 * an OS-level side effect that any part of the tree can start; a control only
 * needs to know about its own target.
 */
export class ExternalOpenBusy extends React.Component<
  IExternalOpenBusyProps,
  IExternalOpenBusyState
> {
  private unsubscribe: (() => void) | null = null

  public constructor(props: IExternalOpenBusyProps) {
    super(props)
    this.state = { isOpening: this.readIsOpening(props.target) }
  }

  public componentDidMount() {
    this.unsubscribe = externalOpenGuard.subscribe(this.onGuardChanged)
    this.onGuardChanged()
  }

  public componentDidUpdate(prevProps: IExternalOpenBusyProps) {
    if (prevProps.target !== this.props.target) {
      this.onGuardChanged()
    }
  }

  public componentWillUnmount() {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private readIsOpening(target: string | null) {
    return target !== null && externalOpenGuard.isOpening(target)
  }

  private onGuardChanged = () => {
    const isOpening = this.readIsOpening(this.props.target)
    if (isOpening !== this.state.isOpening) {
      this.setState({ isOpening })
    }
  }

  public render() {
    return this.props.children(this.state.isOpening)
  }
}
