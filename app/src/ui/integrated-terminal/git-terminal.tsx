import * as React from 'react'
import { parseCustomGitCommand } from '../../lib/custom-git-command'
import {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
  ICLIWorkbenchOperationRequest,
} from '../../lib/cli-workbench'
import {
  IIntegratedTerminalSessionDescriptor,
  IntegratedTerminalView,
} from './integrated-terminal-view'
import {
  applyGitTerminalCompletion,
  completeGitTerminalInput,
} from './git-terminal-completion'

const MaximumVisibleOutput = 4 * 1024 * 1024
const GitTerminalSessionId = 'git-terminal'
let runSequence = 0

export interface IGitTerminalClient {
  readonly start: (request: ICLIWorkbenchOperationRequest) => Promise<void>
  readonly cancel: (id: string) => Promise<boolean>
  readonly onOutput: (
    handler: (event: ICLICommandOutputEvent) => void
  ) => () => void
  readonly onState: (
    handler: (event: ICLICommandStateEvent) => void
  ) => () => void
}

export interface IGitTerminalProps {
  readonly repositoryPath: string
  readonly disabled: boolean
  readonly client: IGitTerminalClient
  /**
   * Called every time a command this terminal ran completes, so the caller
   * can refresh the same repository state (history graph included) that the
   * app's own Git operations already refresh after finishing. This is the
   * live-sync half of the integrated terminal: the graph reacts to Git
   * mutations that happened outside the app's own action dispatchers.
   */
  readonly onRefreshRepository: () => Promise<void>
  readonly onBusyChanged: (busy: boolean) => void
}

interface IGitTerminalState {
  readonly output: ReadonlyArray<string>
  readonly input: string
  readonly running: boolean
}

const Prompt = '$ '

function welcomeBanner(repositoryPath: string): string {
  return (
    `Git terminal — ${repositoryPath}\r\n` +
    'Type a Git subcommand (e.g. "status", "log --oneline -5", "diff", ' +
    '"blame path/to/file"). Tab completes subcommands and common flags. ' +
    'Every command runs through the same reviewed, allowlisted Git argv the ' +
    'rest of Repository tools uses — there is no shell.\r\n'
  )
}

/**
 * A real, if intentionally narrow, integrated terminal: it accepts typed Git
 * command lines, runs them through the CLI workbench's `custom-git-command`
 * operation (the same allowlisted, argument-validated path the Custom Git
 * Commands panel uses), streams their output live, and refreshes the
 * repository — including the R3 history graph — after every completed
 * command so external mutations are reflected without a manual refresh.
 */
export class GitTerminal extends React.Component<
  IGitTerminalProps,
  IGitTerminalState
> {
  private mounted = false
  private runId: string | null = null
  private unsubscribeOutput: (() => void) | null = null
  private unsubscribeState: (() => void) | null = null

  public constructor(props: IGitTerminalProps) {
    super(props)
    this.state = {
      output: [welcomeBanner(props.repositoryPath) + Prompt],
      input: '',
      running: false,
    }
  }

  public componentDidMount(): void {
    this.mounted = true
    this.subscribe(this.props.client)
  }

  public componentDidUpdate(prevProps: IGitTerminalProps): void {
    if (prevProps.client !== this.props.client) {
      this.unsubscribeOutput?.()
      this.unsubscribeState?.()
      this.cancelActiveRun(prevProps.client)
      this.subscribe(this.props.client)
    }
    if (prevProps.repositoryPath !== this.props.repositoryPath) {
      this.cancelActiveRun()
      this.props.onBusyChanged(false)
      this.setState({
        output: [welcomeBanner(this.props.repositoryPath) + Prompt],
        input: '',
        running: false,
      })
    }
  }

  public componentWillUnmount(): void {
    this.mounted = false
    this.unsubscribeOutput?.()
    this.unsubscribeState?.()
    this.cancelActiveRun()
  }

  private subscribe(client: IGitTerminalClient): void {
    this.unsubscribeOutput = client.onOutput(this.onOutput)
    this.unsubscribeState = client.onState(this.onState)
  }

  private cancelActiveRun(
    client: IGitTerminalClient = this.props.client
  ): void {
    const id = this.runId
    this.runId = null
    if (id !== null) {
      void client.cancel(id).catch(() => false)
    }
  }

  private appendOutput(chunk: string): void {
    if (!this.mounted || chunk.length === 0) {
      return
    }
    this.setState(state => {
      const combined = [...state.output, chunk]
      // Keep the controlled chunk list bounded the same way every other CLI
      // workbench output pane is bounded, so a runaway command cannot grow
      // renderer memory without limit.
      let total = combined.reduce((sum, part) => sum + part.length, 0)
      while (total > MaximumVisibleOutput && combined.length > 1) {
        total -= combined.shift()!.length
      }
      return { output: combined }
    })
  }

  private onOutput = (event: ICLICommandOutputEvent) => {
    if (event.id !== this.runId) {
      return
    }
    this.appendOutput(event.data.replace(/\n/g, '\r\n'))
  }

  private onState = (event: ICLICommandStateEvent) => {
    if (event.id !== this.runId || event.state === 'running') {
      return
    }
    this.runId = null
    this.props.onBusyChanged(false)
    this.setState({ running: false })

    if (event.state === 'completed') {
      this.appendOutput(`\r\n${Prompt}`)
      // Refresh unconditionally: this terminal accepts arbitrary allowlisted
      // Git subcommands, so — unlike a single named operation — there is no
      // fixed, statically known set of dimensions a given run can touch.
      void this.props.onRefreshRepository().catch(() => {
        this.appendOutput(
          '[terminal] The command finished, but refreshing the repository view failed.\r\n'
        )
      })
      return
    }

    const detail =
      event.state === 'cancelled'
        ? '[cancelled]'
        : event.error !== undefined
        ? `[failed] ${event.error}`
        : event.exitCode !== null
        ? `[exited with code ${event.exitCode}]`
        : '[failed]'
    this.appendOutput(`\r\n${detail}\r\n${Prompt}`)
  }

  private runLine(line: string): void {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      this.appendOutput(`\r\n${Prompt}`)
      return
    }

    const tokens = trimmed.split(/\s+/)
    const command = tokens[0] === 'git' ? tokens[1] : tokens[0]
    const rest = (tokens[0] === 'git' ? tokens.slice(2) : tokens.slice(1)).join(
      ' '
    )

    if (command === undefined) {
      this.appendOutput(`\r\n${Prompt}`)
      return
    }

    let operation: ReturnType<typeof parseCustomGitCommand>
    try {
      operation = parseCustomGitCommand(command, rest)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'That command is not allowed.'
      this.appendOutput(`\r\n[terminal] ${message}\r\n${Prompt}`)
      return
    }

    const id = `git-terminal-${Date.now()}-${++runSequence}`
    this.runId = id
    this.props.onBusyChanged(true)
    this.setState({ running: true })
    this.appendOutput('\r\n')
    void this.props.client
      .start({
        id,
        repositoryPath: this.props.repositoryPath,
        operation,
        confirmed: true,
      })
      .catch(error => {
        if (this.runId === id) {
          this.runId = null
          this.props.onBusyChanged(false)
          this.setState({ running: false })
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to start this command.'
          this.appendOutput(`[terminal] ${message}\r\n${Prompt}`)
        }
      })
  }

  private onTerminalInput = (_sessionId: string, data: string): void => {
    if (this.state.running || this.props.disabled) {
      return
    }

    for (const char of data) {
      if (char === '\r' || char === '\n') {
        const line = this.state.input
        this.appendOutput(line)
        this.setState({ input: '' })
        this.runLine(line)
      } else if (char === '\x7f' || char === '\b') {
        if (this.state.input.length > 0) {
          this.setState(state => ({ input: state.input.slice(0, -1) }))
          this.appendOutput('\b \b')
        }
      } else if (char === '\t') {
        this.completeCurrentInput()
      } else if (char === '\x03') {
        // Ctrl+C: cancel a running command, or clear the pending line.
        if (this.runId !== null) {
          this.cancelActiveRun()
        } else if (this.state.input.length > 0) {
          this.setState({ input: '' })
          this.appendOutput('^C\r\n' + Prompt)
        }
      } else if (char >= ' ' && char !== '\x7f') {
        this.setState(state => ({ input: state.input + char }))
        this.appendOutput(char)
      }
    }
  }

  private completeCurrentInput(): void {
    const result = completeGitTerminalInput(this.state.input)
    if (result.candidates.length !== 1) {
      return
    }
    const [candidate] = result.candidates
    const next = applyGitTerminalCompletion(this.state.input, result, candidate)
    if (next === this.state.input) {
      return
    }
    const added = next.slice(this.state.input.length)
    this.setState({ input: next })
    this.appendOutput(added)
  }

  private onTerminalResize = (): void => {
    // The output pane reflows with the container; no server-side PTY exists
    // to notify of a size change.
  }

  private getSessions(): ReadonlyArray<IIntegratedTerminalSessionDescriptor> {
    return [
      {
        id: GitTerminalSessionId,
        title: 'Git terminal',
        status: this.props.disabled ? 'error' : 'ready',
        output: this.state.output,
      },
    ]
  }

  public render(): React.ReactNode {
    return (
      <IntegratedTerminalView
        sessions={this.getSessions()}
        activeSessionId={GitTerminalSessionId}
        labels={GitTerminalLabels}
        onSelectSession={GitTerminalNoop}
        onInput={this.onTerminalInput}
        onResize={this.onTerminalResize}
      />
    )
  }
}

const GitTerminalNoop = (): void => {}

const GitTerminalLabels = {
  view: 'Git terminal',
  tabList: 'Git terminal sessions',
  create: 'New terminal',
  closeActive: (title: string) => `Close ${title}`,
  restart: (title: string) => `Restart ${title}`,
  terminal: (title: string) => title,
  empty: 'No terminal session is open.',
  status: {
    connecting: 'Connecting…',
    ready: 'Ready',
    exited: 'Exited',
    error: 'Unavailable',
  },
}
