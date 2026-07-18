import * as React from 'react'
import classNames from 'classnames'
import { Dialog, DialogContent } from '../dialog'
import {
  CommandPaletteCatalog,
  IPaletteCommand,
  filterPaletteCommands,
} from '../../lib/command-palette-catalog'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ICommandPaletteProps {
  /** Executes the chosen command's menu event or palette action id. */
  readonly onExecute: (event: string) => void

  readonly onDismissed: () => void
}

interface ICommandPaletteState {
  readonly query: string
  readonly highlightedIndex: number
}

/**
 * The Ctrl+F master command palette: fuzzy access to every named app
 * function the menus expose, executed through the same menu-event handler.
 */
export class CommandPalette extends React.Component<
  ICommandPaletteProps,
  ICommandPaletteState
> {
  private inputRef = React.createRef<HTMLInputElement>()

  public constructor(props: ICommandPaletteProps) {
    super(props)
    this.state = { query: '', highlightedIndex: 0 }
  }

  public componentDidMount() {
    this.inputRef.current?.focus()
  }

  private getMatches(): ReadonlyArray<IPaletteCommand> {
    return filterPaletteCommands(
      CommandPaletteCatalog,
      this.state.query,
      process.platform
    )
  }

  private execute(command: IPaletteCommand) {
    this.props.onDismissed()
    this.props.onExecute(command.event)
  }

  private onQueryChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.target.value, highlightedIndex: 0 })
  }

  private onKeyDown = (event: React.KeyboardEvent) => {
    const matches = this.getMatches()

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) {
        return
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      this.setState(previous => ({
        highlightedIndex:
          (previous.highlightedIndex + direction + matches.length) %
          matches.length,
      }))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const command = matches[this.state.highlightedIndex] ?? matches[0]
      if (command !== undefined) {
        this.execute(command)
      }
    }
  }

  private onRowClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.commandIndex)
    const command = this.getMatches()[index]
    if (command !== undefined) {
      this.execute(command)
    }
  }

  public render() {
    const matches = this.getMatches()

    return (
      <Dialog
        id="command-palette"
        title="Command palette"
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <div className="command-palette-search">
            <Octicon symbol={octicons.search} />
            <input
              ref={this.inputRef}
              type="text"
              value={this.state.query}
              onChange={this.onQueryChanged}
              onKeyDown={this.onKeyDown}
              placeholder="Type a command — push, clone, settings, worktree…"
              aria-label="Search commands"
              spellCheck={false}
            />
          </div>
          <div
            className="command-palette-results"
            role="listbox"
            aria-label="Commands"
          >
            {matches.length === 0 ? (
              <p className="command-palette-empty">No matching commands</p>
            ) : (
              matches.map((command, index) => (
                <button
                  key={command.event}
                  type="button"
                  role="option"
                  aria-selected={index === this.state.highlightedIndex}
                  className={classNames('command-palette-row', {
                    highlighted: index === this.state.highlightedIndex,
                  })}
                  data-command-index={index}
                  onClick={this.onRowClick}
                >
                  <span className="command-palette-group">{command.group}</span>
                  <span className="command-palette-title">{command.title}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
