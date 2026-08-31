import * as React from 'react'
import { shell } from '../../lib/app-shell'
import classNames from 'classnames'
import { Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'
import { getButtonHint } from './button'
import { singleFlightActions } from '../../lib/single-flight-action'

let nextLinkButtonActionId = 0

interface ILinkButtonProps {
  /** A URI to open on click. */
  readonly uri?: string

  /** A function to call on click. */
  readonly onClick?: () => void | PromiseLike<unknown>

  /** Coordinate alternate controls which start the same consequential action. */
  readonly activationKey?: string

  /** A function to call when mouse is hovered over */
  readonly onMouseOver?: () => void

  /** A function to call when mouse is moved off */
  readonly onMouseOut?: () => void

  /** CSS classes attached to the component */
  readonly className?: string

  /** The tab index of the anchor element. */
  readonly tabIndex?: number

  /** Disable the link from being clicked */
  readonly disabled?: boolean

  /** title-text or tooltip for the link */
  readonly title?: string

  /** aria-label for the link */
  readonly ariaLabel?: string
}

/**
 * A link component.
 *
 * Provide `children` elements for the title of the rendered hyperlink.
 */
export class LinkButton extends React.Component<ILinkButtonProps, {}> {
  private readonly anchorRef = createObservableRef<HTMLAnchorElement>()
  private readonly instanceActivationKey = `link-button:${++nextLinkButtonActionId}`
  private unsubscribeFromAction: (() => void) | null = null

  public componentDidMount() {
    this.subscribeToAction()
  }

  public componentDidUpdate(previousProps: ILinkButtonProps) {
    if (previousProps.activationKey !== this.props.activationKey) {
      this.subscribeToAction()
    }
  }

  public componentWillUnmount() {
    this.unsubscribeFromAction?.()
  }

  public render() {
    const href = this.props.uri || ''
    const disabled = this.props.disabled === true || this.isActionActive
    /**
     * If this component is to open something external like a link, it should
     * have the role of link as is default by the <a> tag. If this component is
     * to be used as a button, it should have the role of button. Otherwise,
     * screen readers may be confused by the results of the click.
     * */
    const role = this.props.uri === undefined ? 'button' : undefined
    const className = classNames('link-button-component', this.props.className)
    const tooltip = getButtonHint(
      this.props.title,
      this.props.ariaLabel,
      this.props.children,
      role === 'button'
    )

    return (
      <a
        ref={this.anchorRef}
        className={className}
        href={href}
        onMouseOver={this.props.onMouseOver}
        onMouseOut={this.props.onMouseOut}
        onFocus={this.props.onMouseOver}
        onBlur={this.props.onMouseOut}
        onClick={this.onClick}
        tabIndex={disabled ? -1 : this.props.tabIndex}
        aria-label={this.props.ariaLabel}
        aria-disabled={disabled || undefined}
        aria-busy={this.isActionActive || undefined}
        role={role}
      >
        {tooltip && (
          <Tooltip
            target={this.anchorRef}
            applyAriaDescribedBy={this.props.title !== undefined}
          >
            {tooltip}
          </Tooltip>
        )}
        {this.props.children}
      </a>
    )
  }

  private onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()

    if (this.props.disabled || this.isActionActive) {
      return
    }

    const uri = this.props.uri
    if (uri) {
      const onClick = this.props.onClick
      void singleFlightActions.run(this.activationKey, () => {
        const opened = shell.openExternal(uri)
        const clicked = onClick?.()
        return Promise.all([opened, clicked])
      })
      return
    }

    const onClick = this.props.onClick
    if (onClick) {
      void singleFlightActions.run(this.activationKey, onClick)
    }
  }

  private get activationKey() {
    return this.props.activationKey ?? this.instanceActivationKey
  }

  private get isActionActive() {
    return singleFlightActions.isActive(this.activationKey)
  }

  private subscribeToAction() {
    this.unsubscribeFromAction?.()
    this.unsubscribeFromAction = singleFlightActions.subscribe(
      this.activationKey,
      () => this.forceUpdate()
    )
  }
}
