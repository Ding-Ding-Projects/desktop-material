import * as React from 'react'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { RepositoryTabsStore } from '../../lib/stores'
import { FilterMode } from '../../lib/fuzzy-find'

interface ICloseTabsContainingPopoverProps {
  readonly tabsStore: RepositoryTabsStore
  readonly anchor: HTMLElement | null
  /** Called with the new active tab id once tabs have been closed. */
  readonly onClosed: (activeTabId: string | null) => void
  /** Called to dismiss the popover without closing any tabs. */
  readonly onClose: () => void
}

interface ICloseTabsContainingPopoverState {
  readonly query: string
  /** When true, the query is treated as a regular expression (`.*`). */
  readonly useRegex: boolean
}

/**
 * A small MD3 popover that closes every repository tab whose label or name
 * matches a query. A `.*` toggle switches between substring and regex matching,
 * and a live count previews how many tabs the current query would close.
 */
export class CloseTabsContainingPopover extends React.Component<
  ICloseTabsContainingPopoverProps,
  ICloseTabsContainingPopoverState
> {
  public constructor(props: ICloseTabsContainingPopoverProps) {
    super(props)
    this.state = { query: '', useRegex: false }
  }

  private get mode(): FilterMode {
    return this.state.useRegex ? FilterMode.Regex : FilterMode.Substring
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value })
  }

  private onToggleRegex = () => {
    this.setState(prev => ({ useRegex: !prev.useRegex }))
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.onConfirm()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.props.onClose()
    }
  }

  private onConfirm = () => {
    const { query } = this.state
    if (query.trim().length === 0) {
      return
    }
    this.props.tabsStore
      .closeTabsMatching(query, this.mode)
      .then(this.props.onClosed)
      .catch(err => log.error('Failed to close matching tabs', err))
    this.props.onClose()
  }

  public render() {
    const { query, useRegex } = this.state
    const { tabs, regexError } = this.props.tabsStore.findMatchingTabs(
      query,
      this.mode
    )
    const count = tabs.length
    const hasQuery = query.trim().length > 0

    const status =
      regexError !== null
        ? regexError
        : !hasQuery
        ? 'Type to preview matches'
        : count === 0
        ? 'No tabs match'
        : count === 1
        ? '1 tab matches'
        : `${count} tabs match`

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby="close-tabs-containing-title"
        onClickOutside={this.props.onClose}
      >
        <div className="close-tabs-containing">
          <h3 id="close-tabs-containing-title">Close tabs containing</h3>
          <div className="close-tabs-containing-field">
            <input
              type="text"
              className="close-tabs-containing-input"
              placeholder="Filter by name"
              value={query}
              autoFocus={true}
              onChange={this.onQueryChange}
              onKeyDown={this.onKeyDown}
              aria-label="Close tabs containing"
            />
            <button
              type="button"
              className={
                useRegex
                  ? 'close-tabs-containing-mode active'
                  : 'close-tabs-containing-mode'
              }
              aria-pressed={useRegex}
              aria-label="Use regular expression"
              onClick={this.onToggleRegex}
            >
              .*
            </button>
          </div>
          <div
            className={
              regexError !== null
                ? 'close-tabs-containing-status error'
                : 'close-tabs-containing-status'
            }
            role="status"
          >
            {status}
          </div>
          <div className="close-tabs-containing-actions">
            <button
              type="button"
              className="close-tabs-containing-cancel"
              onClick={this.props.onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="close-tabs-containing-confirm"
              disabled={count === 0}
              onClick={this.onConfirm}
            >
              {count > 0 ? `Close ${count}` : 'Close'}
            </button>
          </div>
        </div>
      </Popover>
    )
  }
}
