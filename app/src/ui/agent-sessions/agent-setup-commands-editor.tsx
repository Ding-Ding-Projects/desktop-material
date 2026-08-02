/* eslint-disable react/jsx-no-bind -- bounded command and argument rows bind their exact reviewed indices */
import * as React from 'react'

import {
  AgentSetupExecutableId,
  AgentSetupExecutableIds,
  IAgentSetupCommand,
  IAgentSetupCommandProblem,
  MaximumAgentSetupArguments,
  MaximumAgentSetupCommands,
  validateAgentSetupCommands,
} from '../../lib/agent-sessions'
import { LanguageModeChangedEvent, t } from '../../lib/i18n'
import { Button } from '../lib/button'
import { MaterialSymbol } from '../lib/material-symbol'

interface IAgentSetupCommandsEditorProps {
  readonly commands: ReadonlyArray<IAgentSetupCommand>
  readonly onSave: (commands: ReadonlyArray<IAgentSetupCommand>) => boolean
  readonly onCancel: () => void
}

interface IEditableAgentSetupCommand extends IAgentSetupCommand {
  readonly key: number
  readonly args: ReadonlyArray<string>
}

interface IAgentSetupCommandsEditorState {
  readonly commands: ReadonlyArray<IEditableAgentSetupCommand>
  readonly saveFailed: boolean
}

function cloneEditableCommand(
  command: IAgentSetupCommand,
  key: number
): IEditableAgentSetupCommand {
  return {
    key,
    enabled: command.enabled,
    executable: command.executable,
    args: [...command.args],
  }
}

export class AgentSetupCommandsEditor extends React.Component<
  IAgentSetupCommandsEditorProps,
  IAgentSetupCommandsEditorState
> {
  private readonly dialogRef = React.createRef<HTMLDivElement>()
  private nextKey: number

  public constructor(props: IAgentSetupCommandsEditorProps) {
    super(props)
    this.nextKey = props.commands.length
    this.state = {
      commands: props.commands.map(cloneEditableCommand),
      saveFailed: false,
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    const firstControl = this.dialogRef.current?.querySelector<HTMLElement>(
      'select, button, input'
    )
    this.dialogRef.current?.addEventListener('keydown', this.onKeyDown)
    firstControl?.focus()
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.dialogRef.current?.removeEventListener('keydown', this.onKeyDown)
  }

  private onLanguageModeChanged = () => this.forceUpdate()

  private get persistedCommands(): ReadonlyArray<IAgentSetupCommand> {
    return this.state.commands.map(command => ({
      enabled: command.enabled,
      executable: command.executable,
      args: [...command.args],
    }))
  }

  private get problems(): ReadonlyArray<IAgentSetupCommandProblem> {
    return validateAgentSetupCommands(this.persistedCommands)
  }

  private updateCommand(
    index: number,
    update: (command: IEditableAgentSetupCommand) => IEditableAgentSetupCommand,
    onUpdated?: () => void
  ) {
    this.setState(
      previous => ({
        commands: previous.commands.map((command, commandIndex) =>
          commandIndex === index ? update(command) : command
        ),
        saveFailed: false,
      }),
      onUpdated
    )
  }

  private focusCommandAfterRemoval(index: number) {
    const commands = this.dialogRef.current?.querySelectorAll<HTMLElement>(
      '.agent-setup-command'
    )
    const target =
      commands === undefined || commands.length === 0
        ? this.dialogRef.current?.querySelector<HTMLElement>(
            '.agent-setup-add-command'
          )
        : commands[
            Math.min(index, commands.length - 1)
          ].querySelector<HTMLElement>('input, select, button')
    target?.focus()
  }

  private focusArgumentAfterRemoval(
    commandIndex: number,
    argumentIndex: number
  ) {
    const command = this.dialogRef.current?.querySelectorAll<HTMLElement>(
      '.agent-setup-command'
    )[commandIndex]
    const argumentsInCommand = command?.querySelectorAll<HTMLInputElement>(
      '.agent-setup-command-argument input'
    )
    const target =
      argumentsInCommand !== undefined && argumentsInCommand.length > 0
        ? argumentsInCommand[
            Math.min(argumentIndex, argumentsInCommand.length - 1)
          ]
        : command?.querySelector<HTMLElement>('.agent-setup-add-argument')
    target?.focus()
  }

  private onAddCommand = () => {
    if (this.state.commands.length >= MaximumAgentSetupCommands) {
      return
    }
    const key = this.nextKey++
    this.setState(previous => ({
      commands: [
        ...previous.commands,
        { key, enabled: true, executable: 'node', args: [''] },
      ],
      saveFailed: false,
    }))
  }

  private onRemoveCommand = (index: number) => {
    this.setState(
      previous => ({
        commands: previous.commands.filter(
          (_, candidate) => candidate !== index
        ),
        saveFailed: false,
      }),
      () => this.focusCommandAfterRemoval(index)
    )
  }

  private onMoveCommand = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= this.state.commands.length) {
      return
    }
    this.setState(previous => {
      const commands = [...previous.commands]
      ;[commands[index], commands[target]] = [commands[target], commands[index]]
      return { commands, saveFailed: false }
    })
  }

  private onExecutableChanged = (
    index: number,
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const executable = event.currentTarget.value as AgentSetupExecutableId
    this.updateCommand(index, command => ({ ...command, executable }))
  }

  private onArgumentChanged = (
    commandIndex: number,
    argumentIndex: number,
    value: string
  ) => {
    this.updateCommand(commandIndex, command => ({
      ...command,
      args: command.args.map((argument, index) =>
        index === argumentIndex ? value : argument
      ),
    }))
  }

  private onAddArgument = (commandIndex: number) => {
    this.updateCommand(commandIndex, command =>
      command.args.length >= MaximumAgentSetupArguments
        ? command
        : { ...command, args: [...command.args, ''] }
    )
  }

  private onRemoveArgument = (commandIndex: number, argumentIndex: number) => {
    this.updateCommand(
      commandIndex,
      command => ({
        ...command,
        args: command.args.filter((_, index) => index !== argumentIndex),
      }),
      () => this.focusArgumentAfterRemoval(commandIndex, argumentIndex)
    )
  }

  private onSave = () => {
    if (this.problems.length > 0) {
      return
    }
    if (!this.props.onSave(this.persistedCommands)) {
      this.setState({ saveFailed: true })
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.props.onCancel()
    }
  }

  private problemText(problem: IAgentSetupCommandProblem): string {
    const command = String((problem.commandIndex ?? 0) + 1)
    const argument = String((problem.argumentIndex ?? 0) + 1)
    switch (problem.kind) {
      case 'too-many-commands':
        return t('agentSessions.setup.problem.tooManyCommands', {
          count: String(MaximumAgentSetupCommands),
        })
      case 'missing-argument':
        return problem.argumentIndex === undefined
          ? t('agentSessions.setup.problem.missingArgument', { command })
          : t('agentSessions.setup.problem.emptyArgument', {
              command,
              argument,
            })
      case 'too-many-arguments':
        return t('agentSessions.setup.problem.tooManyArguments', {
          command,
          count: String(MaximumAgentSetupArguments),
        })
      case 'argument-too-long':
        return t('agentSessions.setup.problem.argumentTooLong', {
          command,
          argument,
        })
      case 'argument-credential':
        return t('agentSessions.setup.problem.credential', {
          command,
          argument,
        })
      case 'argument-cwd-override':
        return t('agentSessions.setup.problem.cwdOverride', {
          command,
          argument,
        })
      case 'argument-command-string':
        return t('agentSessions.setup.problem.commandString', {
          command,
          argument,
        })
      default:
        return t('agentSessions.setup.problem.unsafeArgument', {
          command,
          argument,
        })
    }
  }

  private renderCommand(
    command: IEditableAgentSetupCommand,
    commandIndex: number
  ) {
    const problems = this.problems.filter(
      problem => problem.commandIndex === commandIndex
    )
    const onEnabledChanged = (event: React.FormEvent<HTMLInputElement>) => {
      const enabled = event.currentTarget.checked
      this.updateCommand(commandIndex, current => ({ ...current, enabled }))
    }
    const onExecutableChanged = (event: React.FormEvent<HTMLSelectElement>) =>
      this.onExecutableChanged(commandIndex, event)
    const onAddArgument = () => this.onAddArgument(commandIndex)
    const onMoveUp = () => this.onMoveCommand(commandIndex, -1)
    const onMoveDown = () => this.onMoveCommand(commandIndex, 1)
    const onRemoveCommand = () => this.onRemoveCommand(commandIndex)
    return (
      <fieldset className="agent-setup-command" key={command.key}>
        <legend>
          {t('agentSessions.setup.commandLabel', {
            count: String(commandIndex + 1),
          })}
        </legend>
        <label className="agent-setup-command-enabled">
          <input
            type="checkbox"
            checked={command.enabled}
            onChange={onEnabledChanged}
          />
          {t('agentSessions.setup.enabled')}
        </label>
        <label className="agent-setup-command-executable">
          <span>{t('agentSessions.setup.executable')}</span>
          <select value={command.executable} onChange={onExecutableChanged}>
            {AgentSetupExecutableIds.map(executable => (
              <option key={executable} value={executable}>
                {executable}
              </option>
            ))}
          </select>
        </label>
        <div className="agent-setup-command-arguments">
          {command.args.map((argument, argumentIndex) => {
            const id = `agent-setup-${command.key}-argument-${argumentIndex}`
            const invalid = problems.some(
              problem => problem.argumentIndex === argumentIndex
            )
            const onArgumentChanged = (
              event: React.FormEvent<HTMLInputElement>
            ) =>
              this.onArgumentChanged(
                commandIndex,
                argumentIndex,
                event.currentTarget.value
              )
            const onRemoveArgument = () =>
              this.onRemoveArgument(commandIndex, argumentIndex)
            return (
              <div className="agent-setup-command-argument" key={id}>
                <label htmlFor={id}>
                  {t('agentSessions.setup.argumentLabel', {
                    count: String(argumentIndex + 1),
                  })}
                </label>
                <input
                  id={id}
                  type="text"
                  value={argument}
                  aria-invalid={invalid || undefined}
                  onChange={onArgumentChanged}
                />
                <Button
                  size="small"
                  ariaLabel={t('agentSessions.setup.removeArgument', {
                    count: String(argumentIndex + 1),
                  })}
                  onClick={onRemoveArgument}
                >
                  <MaterialSymbol name="remove" size={18} />
                </Button>
              </div>
            )
          })}
          <Button
            className="agent-setup-add-argument"
            size="small"
            onClick={onAddArgument}
            disabled={command.args.length >= MaximumAgentSetupArguments}
          >
            <MaterialSymbol name="add" size={18} />
            {t('agentSessions.setup.addArgument')}
          </Button>
        </div>
        <div className="agent-setup-command-actions">
          <Button
            size="small"
            ariaLabel={t('agentSessions.setup.moveUp', {
              count: String(commandIndex + 1),
            })}
            onClick={onMoveUp}
            disabled={commandIndex === 0}
          >
            <MaterialSymbol name="arrow_upward" size={18} />
          </Button>
          <Button
            size="small"
            ariaLabel={t('agentSessions.setup.moveDown', {
              count: String(commandIndex + 1),
            })}
            onClick={onMoveDown}
            disabled={commandIndex === this.state.commands.length - 1}
          >
            <MaterialSymbol name="keyboard_arrow_down" size={18} />
          </Button>
          <Button
            size="small"
            ariaLabel={t('agentSessions.setup.removeCommand', {
              count: String(commandIndex + 1),
            })}
            onClick={onRemoveCommand}
          >
            <MaterialSymbol name="delete" size={18} />
          </Button>
        </div>
      </fieldset>
    )
  }

  public render() {
    const problems = this.problems
    return (
      <div
        id="agent-setup-commands-editor"
        data-verification="agent-setup-editor"
        ref={this.dialogRef}
        className="agent-setup-commands-editor"
        role="dialog"
        aria-modal="false"
        aria-labelledby="agent-setup-commands-title"
      >
        <div className="agent-setup-commands-heading">
          <h3 id="agent-setup-commands-title">
            {t('agentSessions.setup.title')}
          </h3>
          <p>{t('agentSessions.setup.description')}</p>
        </div>
        <p className="agent-setup-commands-count" aria-live="polite">
          {this.state.commands.length === 0
            ? t('agentSessions.setup.count.none')
            : this.state.commands.length === 1
            ? t('agentSessions.setup.count.one')
            : t('agentSessions.setup.count.some', {
                count: String(this.state.commands.length),
              })}
        </p>
        {this.state.commands.map((command, index) =>
          this.renderCommand(command, index)
        )}
        <Button
          className="agent-setup-add-command"
          onClick={this.onAddCommand}
          disabled={this.state.commands.length >= MaximumAgentSetupCommands}
        >
          <MaterialSymbol name="add" size={18} />
          {t('agentSessions.setup.addCommand')}
        </Button>
        <div className="agent-setup-command-problems" role="status">
          {problems.slice(0, 1).map(problem => (
            <p
              key={`${problem.kind}-${problem.commandIndex}-${problem.argumentIndex}`}
            >
              {this.problemText(problem)}
            </p>
          ))}
          {this.state.saveFailed && (
            <p>{t('agentSessions.setup.problem.saveFailed')}</p>
          )}
        </div>
        <div className="agent-setup-editor-actions">
          <Button onClick={this.props.onCancel}>
            {t('agentSessions.cancel')}
          </Button>
          <Button
            className="agent-setup-save"
            onClick={this.onSave}
            disabled={problems.length > 0}
          >
            {t('agentSessions.setup.save')}
          </Button>
        </div>
      </div>
    )
  }
}
