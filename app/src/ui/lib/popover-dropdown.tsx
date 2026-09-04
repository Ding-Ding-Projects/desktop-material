import * as React from 'react'
import { Button } from './button'
import { Popover, PopoverAnchorPosition, PopoverDecoration } from './popover'
import classNames from 'classnames'
import { createUniqueId, releaseUniqueId } from './id-pool'
import { MaterialSymbol } from './material-symbol'

const maxPopoverContentHeight = 500
const popoverFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface IPopoverDropdownProps {
  readonly className?: string
  readonly contentTitle: string
  readonly buttonContent: JSX.Element | string
  readonly buttonAriaLabel?: string
  readonly ariaDescribedBy?: string
  readonly closeButtonAriaLabel?: string
  readonly decoration?: PopoverDecoration
  readonly label?: string
  /**
   * The class name to apply to the open button. This is useful for
   * applying the dialog-preferred-focus class to the button when it
   * should receive focus ahead of a dialog's default focus target
   */
  readonly openButtonClassName?: string

  /**
   * Whether the popover owns a focus trap. Defaults to true. Search popovers
   * whose full Regex Builder is rendered in a document-level portal disable
   * this inner trap so keyboard focus can enter that owned overlay.
   */
  readonly trapFocus?: boolean

  /**
   * The maximum height of the popover content in pixels. Defaults to
   * `maxPopoverContentHeight` (500px). Pass a smaller value to constrain the
   * popover to fit its contents when there are only a few items.
   **/
  readonly maxHeight?: number
}

interface IPopoverDropdownState {
  readonly showPopover: boolean
}

/**
 * A dropdown component for displaying a dropdown button that opens
 * a popover to display contents relative to the button content.
 */
export class PopoverDropdown extends React.Component<
  IPopoverDropdownProps,
  IPopoverDropdownState
> {
  private invokeButtonRef: HTMLButtonElement | null = null
  private dropdownHeaderId: string | undefined = undefined
  private dropdownContentId: string | undefined = undefined
  private openButtonId: string | undefined = undefined
  private popoverWrapperRef = React.createRef<HTMLDivElement>()

  public constructor(props: IPopoverDropdownProps) {
    super(props)

    this.state = {
      showPopover: false,
    }
  }

  public componentWillUnmount() {
    if (this.dropdownHeaderId) {
      releaseUniqueId(this.dropdownHeaderId)
      this.dropdownHeaderId = undefined
    }

    if (this.dropdownContentId) {
      releaseUniqueId(this.dropdownContentId)
      this.dropdownContentId = undefined
    }

    if (this.openButtonId) {
      releaseUniqueId(this.openButtonId)
      this.openButtonId = undefined
    }
  }

  private getDropdownContentId() {
    this.dropdownContentId ??= createUniqueId('popover-dropdown-content')
    return this.dropdownContentId
  }

  private onInvokeButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.invokeButtonRef = buttonRef
  }

  private togglePopover = () => {
    this.setState({ showPopover: !this.state.showPopover })
  }

  public closePopover = () => {
    this.setState({ showPopover: false }, () => {
      this.invokeButtonRef?.focus()
    })
  }

  private closePopoverFromOutside = () => {
    this.setState({ showPopover: false })
  }

  /**
   * A dropdown which disables Popover's focus-trap wrapper to admit an owned
   * document-level overlay still keeps its closed-overlay keyboard semantics:
   * Tab wraps inside the picker, and Escape closes only this picker. React
   * events from the portalled Regex Builder bubble through this component, so
   * those are explicitly left to the builder's own trap and Escape handler.
   */
  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!this.state.showPopover || this.props.trapFocus !== false) {
      return
    }

    const target = event.target
    if (
      target instanceof Element &&
      target.closest('.regex-builder-overlay') !== null
    ) {
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closePopover()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const wrapper = this.popoverWrapperRef.current
    if (wrapper === null) {
      return
    }
    const focusable = Array.from(
      wrapper.querySelectorAll<HTMLElement>(popoverFocusableSelector)
    ).filter(
      element =>
        element.getAttribute('aria-hidden') !== 'true' &&
        element.getAttribute('hidden') === null
    )
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  private renderPopover() {
    if (!this.state.showPopover) {
      return
    }

    const { contentTitle, decoration = PopoverDecoration.Balloon } = this.props
    this.dropdownHeaderId ??= createUniqueId('popover-dropdown-header')
    const dropdownContentId = this.getDropdownContentId()

    return (
      <Popover
        className="popover-dropdown-popover"
        anchor={this.invokeButtonRef}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        maxHeight={this.props.maxHeight ?? maxPopoverContentHeight}
        decoration={decoration}
        onClickOutside={this.closePopoverFromOutside}
        ariaLabelledby={this.dropdownHeaderId}
        trapFocus={this.props.trapFocus}
      >
        <div ref={this.popoverWrapperRef} className="popover-dropdown-wrapper">
          <div className="popover-dropdown-header">
            <h3 id={this.dropdownHeaderId}>{contentTitle}</h3>

            <button
              type="button"
              className="close"
              onClick={this.closePopover}
              aria-label={this.props.closeButtonAriaLabel ?? 'Close'}
            >
              <MaterialSymbol name="close" />
            </button>
          </div>
          <div id={dropdownContentId} className="popover-dropdown-content">
            {this.props.children}
          </div>
        </div>
      </Popover>
    )
  }

  public render() {
    const { className, buttonContent, label } = this.props
    const cn = classNames('popover-dropdown-component', className)
    this.openButtonId ??= createUniqueId('popover-open-button')
    const ariaControls = this.state.showPopover
      ? this.getDropdownContentId()
      : undefined

    return (
      // The wrapper delegates Escape handling from its nested native controls.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div className={cn} onKeyDown={this.onKeyDown}>
        {label && <label htmlFor={this.openButtonId}>{label}</label>}
        <Button
          onClick={this.togglePopover}
          onButtonRef={this.onInvokeButtonRef}
          id={this.openButtonId}
          className={this.props.openButtonClassName}
          ariaExpanded={this.state.showPopover}
          ariaHaspopup="dialog"
          ariaControls={ariaControls}
          ariaLabel={this.props.buttonAriaLabel}
          ariaDescribedBy={this.props.ariaDescribedBy}
        >
          <div className="button-content">{buttonContent}</div>
          <MaterialSymbol name="arrow_drop_down" />
        </Button>
        {this.renderPopover()}
      </div>
    )
  }
}
