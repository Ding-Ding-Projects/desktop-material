/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- the bounded console needs keyboard scrolling */
import * as React from 'react'

import {
  DefaultMinecraftPort,
  IMinecraftServerState,
  MaxMinecraftConsoleLines,
  MinecraftEulaUrl,
  MinecraftServerDraft,
  MinecraftServerStatus,
  normalizeMinecraftCommand,
  validateMinecraftServer,
} from '../../lib/minecraft/server'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { TextBox } from '../lib/text-box'
import { WebPanelCard } from './web-panel-card'
import {
  acceptMinecraftEula,
  listMinecraftServers,
  openMinecraftServerFolder,
  readMinecraftConsole,
  removeMinecraftServer,
  saveMinecraftServer,
  sendMinecraftCommand,
  startMinecraftServer,
  stopMinecraftServer,
} from '../main-process-proxy'

/** The calls the manager makes. Injectable for tests. */
export interface IMinecraftServersClient {
  readonly list: () => Promise<ReadonlyArray<IMinecraftServerState>>
  readonly save: (
    draft: MinecraftServerDraft,
    id: string | null
  ) => Promise<ReadonlyArray<string>>
  readonly remove: (id: string) => Promise<void>
  readonly acceptEula: (id: string) => Promise<void>
  readonly start: (id: string) => Promise<string | null>
  readonly stop: (id: string) => Promise<void>
  readonly command: (id: string, command: string) => Promise<boolean>
  readonly console: (
    id: string,
    after: number
  ) => Promise<{
    readonly next: number
    readonly lines: ReadonlyArray<string>
    readonly status: MinecraftServerStatus
  }>
  readonly openFolder: (id: string) => Promise<void>
}

const defaultClient: IMinecraftServersClient = {
  list: listMinecraftServers,
  save: saveMinecraftServer,
  remove: removeMinecraftServer,
  acceptEula: acceptMinecraftEula,
  start: startMinecraftServer,
  stop: stopMinecraftServer,
  command: sendMinecraftCommand,
  console: readMinecraftConsole,
  openFolder: openMinecraftServerFolder,
}

const StatusLabels: Record<MinecraftServerStatus, string> = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  crashed: 'Stopped unexpectedly',
}

interface IMinecraftServersProps {
  /** Leave the web panel card out. For tests of the server list alone. */
  readonly hideWebPanel?: boolean
  readonly client?: IMinecraftServersClient
  /** Starts the console refresh; returns how to stop it. For tests. */
  readonly schedule?: (tick: () => void) => () => void
}

interface IMinecraftServersState {
  readonly loading: boolean
  readonly servers: ReadonlyArray<IMinecraftServerState>
  readonly selected: string | null
  readonly error: string | null
  readonly adding: boolean
  readonly name: string
  readonly directory: string
  readonly jar: string
  readonly javaPath: string
  readonly memory: string
  readonly port: string
  readonly formErrors: ReadonlyArray<string>
  readonly eulaChecked: boolean
  readonly consoleLines: ReadonlyArray<string>
  readonly command: string
}

const defaultSchedule = (tick: () => void) => {
  const id = window.setInterval(tick, 1000)
  return () => window.clearInterval(id)
}

/**
 * Minecraft server manager: the servers kept on this computer, a start and
 * stop switch for each, the EULA step that must come first, and a live
 * console with a command line.
 */
export class MinecraftServers extends React.Component<
  IMinecraftServersProps,
  IMinecraftServersState
> {
  private mounted = false
  private cancelSchedule: (() => void) | null = null
  private consolePosition = 0
  private consoleFor: string | null = null
  private reading = false

  public constructor(props: IMinecraftServersProps) {
    super(props)
    this.state = {
      loading: true,
      servers: [],
      selected: null,
      error: null,
      adding: false,
      name: '',
      directory: '',
      jar: 'server.jar',
      javaPath: 'java',
      memory: '2048',
      port: String(DefaultMinecraftPort),
      formErrors: [],
      eulaChecked: false,
      consoleLines: [],
      command: '',
    }
  }

  private get client() {
    return this.props.client ?? defaultClient
  }

  public componentDidMount() {
    this.mounted = true
    void this.refresh()
    this.cancelSchedule = (this.props.schedule ?? defaultSchedule)(() => {
      void this.poll()
    })
  }

  public componentWillUnmount() {
    this.mounted = false
    this.cancelSchedule?.()
  }

  private refresh = async () => {
    try {
      const servers = await this.client.list()
      if (!this.mounted) {
        return
      }
      this.setState(state => ({
        loading: false,
        servers,
        selected:
          state.selected !== null &&
          servers.some(s => s.server.id === state.selected)
            ? state.selected
            : (servers[0]?.server.id ?? null),
      }))
    } catch (error) {
      if (this.mounted) {
        this.setState({ loading: false, error: (error as Error).message })
      }
    }
  }

  /** One refresh: new console lines for the open server, and its state. */
  private poll = async () => {
    const id = this.state.selected
    if (id === null || this.reading) {
      return
    }
    this.reading = true
    try {
      if (this.consoleFor !== id) {
        this.consoleFor = id
        this.consolePosition = 0
        this.setState({ consoleLines: [] })
      }
      const page = await this.client.console(id, this.consolePosition)
      if (!this.mounted || this.state.selected !== id) {
        return
      }
      this.consolePosition = page.next
      if (page.lines.length > 0) {
        this.setState(state => ({
          consoleLines: [...state.consoleLines, ...page.lines].slice(
            -MaxMinecraftConsoleLines
          ),
        }))
      }
      const known = this.state.servers.find(s => s.server.id === id)
      if (known !== undefined && known.status !== page.status) {
        await this.refresh()
      }
    } catch {
      // The next refresh tries again.
    } finally {
      this.reading = false
    }
  }

  private run = async (action: () => Promise<string | null | void>) => {
    this.setState({ error: null })
    try {
      const problem = await action()
      if (this.mounted && typeof problem === 'string') {
        this.setState({ error: problem })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: (error as Error).message })
      }
    }
    await this.refresh()
    await this.poll()
  }

  private get draft(): MinecraftServerDraft {
    return {
      name: this.state.name,
      directory: this.state.directory,
      jar: this.state.jar,
      javaPath: this.state.javaPath,
      memoryMegabytes: Number(this.state.memory),
      port: Number(this.state.port),
    }
  }

  private onShowAdd = () => this.setState({ adding: true, formErrors: [] })
  private onCancelAdd = () => this.setState({ adding: false, formErrors: [] })
  private onNameChanged = (name: string) => this.setState({ name })
  private onDirectoryChanged = (directory: string) =>
    this.setState({ directory })
  private onJarChanged = (jar: string) => this.setState({ jar })
  private onJavaChanged = (javaPath: string) => this.setState({ javaPath })
  private onMemoryChanged = (memory: string) => this.setState({ memory })
  private onPortChanged = (port: string) => this.setState({ port })
  private onCommandChanged = (command: string) => this.setState({ command })

  private onAdd = async () => {
    const local = validateMinecraftServer(this.draft)
    if (local.length > 0) {
      this.setState({ formErrors: local })
      return
    }
    const formErrors = await this.client.save(this.draft, null)
    if (!this.mounted) {
      return
    }
    if (formErrors.length > 0) {
      this.setState({ formErrors })
      return
    }
    this.setState({ adding: false, formErrors: [], name: '', directory: '' })
    await this.refresh()
  }

  private onSelect = (event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.server ?? null
    this.setState({ selected: id, eulaChecked: false, error: null }, () => {
      void this.poll()
    })
  }

  private onEulaChecked = (event: React.FormEvent<HTMLInputElement>) =>
    this.setState({ eulaChecked: event.currentTarget.checked })

  private withSelected(action: (id: string) => Promise<string | null | void>) {
    const id = this.state.selected
    if (id !== null) {
      void this.run(() => action(id))
    }
  }

  private onAcceptEula = () => {
    if (this.state.eulaChecked) {
      this.withSelected(id => this.client.acceptEula(id))
    }
  }
  private onStart = () => this.withSelected(id => this.client.start(id))
  private onStop = () => this.withSelected(id => this.client.stop(id))
  private onRemove = () => this.withSelected(id => this.client.remove(id))
  private onOpenFolder = () =>
    this.withSelected(id => this.client.openFolder(id))

  private onSendCommand = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const command = normalizeMinecraftCommand(this.state.command)
    if (command === null) {
      return
    }
    this.setState({ command: '' })
    this.withSelected(async id => {
      const sent = await this.client.command(id, command)
      return sent ? null : 'The command was not sent. Is the server running?'
    })
  }

  private renderAddForm() {
    const { formErrors } = this.state
    return (
      <div className="minecraft-servers-form">
        <TextBox
          label="Name"
          value={this.state.name}
          onValueChanged={this.onNameChanged}
        />
        <TextBox
          label="Server folder"
          placeholder={'D:\\Minecraft\\survival'}
          value={this.state.directory}
          onValueChanged={this.onDirectoryChanged}
        />
        <TextBox
          label="Server jar"
          value={this.state.jar}
          onValueChanged={this.onJarChanged}
        />
        <TextBox
          label="Java"
          value={this.state.javaPath}
          onValueChanged={this.onJavaChanged}
        />
        <TextBox
          label="Memory in MB"
          value={this.state.memory}
          onValueChanged={this.onMemoryChanged}
        />
        <TextBox
          label="Port"
          value={this.state.port}
          onValueChanged={this.onPortChanged}
        />
        {formErrors.length > 0 && (
          <ul className="minecraft-servers-errors" role="alert">
            {formErrors.map(error => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <div className="minecraft-servers-actions">
          <Button type="submit" onClick={this.onAdd}>
            Add server
          </Button>
          <Button onClick={this.onCancelAdd}>Cancel</Button>
        </div>
      </div>
    )
  }

  private renderSelected(state: IMinecraftServerState) {
    const { server, status, eulaAccepted, message } = state
    const active = status !== 'stopped' && status !== 'crashed'
    return (
      <div className="minecraft-servers-detail">
        <div className="minecraft-servers-heading">
          <h4>{server.name}</h4>
          <span
            className={`minecraft-servers-status minecraft-servers-status-${status}`}
            role="status"
          >
            {StatusLabels[status]}
          </span>
        </div>
        <p className="minecraft-servers-meta">
          {server.directory} · {server.jar} · {server.memoryMegabytes} MB · port{' '}
          {server.port}
        </p>
        {message !== null && (
          <p className="minecraft-servers-message" role="alert">
            {message}
          </p>
        )}
        {!eulaAccepted && (
          <div className="minecraft-servers-eula">
            <p>
              A Minecraft server only runs after you accept the{' '}
              <LinkButton uri={MinecraftEulaUrl}>Minecraft EULA</LinkButton>.
              Accepting writes eula.txt in this server folder.
            </p>
            <Checkbox
              label="I have read and agree to the Minecraft EULA"
              value={
                this.state.eulaChecked ? CheckboxValue.On : CheckboxValue.Off
              }
              onChange={this.onEulaChecked}
            />
            <Button
              disabled={!this.state.eulaChecked}
              onClick={this.onAcceptEula}
            >
              Accept for this server
            </Button>
          </div>
        )}
        <div className="minecraft-servers-actions">
          <Button disabled={active || !eulaAccepted} onClick={this.onStart}>
            Start
          </Button>
          <Button
            disabled={status !== 'running' && status !== 'starting'}
            onClick={this.onStop}
          >
            Stop
          </Button>
          <Button onClick={this.onOpenFolder}>Open folder</Button>
          <Button disabled={active} onClick={this.onRemove}>
            Remove from list
          </Button>
        </div>
        <pre
          role="log"
          className="minecraft-servers-console"
          aria-label={`Console of ${server.name}`}
          tabIndex={0}
        >
          {this.state.consoleLines.length === 0
            ? 'The console is empty. Start the server to see its output.'
            : this.state.consoleLines.join('\n')}
        </pre>
        <form
          className="minecraft-servers-command"
          onSubmit={this.onSendCommand}
        >
          <TextBox
            label="Console command"
            placeholder="say Hello"
            value={this.state.command}
            disabled={status !== 'running'}
            onValueChanged={this.onCommandChanged}
          />
          <Button type="submit" disabled={status !== 'running'}>
            Send
          </Button>
        </form>
      </div>
    )
  }

  public render() {
    const { loading, servers, selected, error, adding } = this.state
    const current = servers.find(s => s.server.id === selected)
    return (
      <section
        className="minecraft-servers"
        aria-labelledby="minecraft-servers-title"
      >
        <div className="file-converter-section-heading">
          <h3 id="minecraft-servers-title">Minecraft servers</h3>
          <span>Run on this computer with your own Java.</span>
        </div>
        {error !== null && (
          <p className="minecraft-servers-message" role="alert">
            {error}
          </p>
        )}
        <div
          className="minecraft-servers-list"
          role="group"
          aria-label="Servers"
        >
          {servers.map(({ server, status }) => (
            <button
              key={server.id}
              type="button"
              className="minecraft-servers-chip"
              data-server={server.id}
              aria-pressed={server.id === selected}
              onClick={this.onSelect}
            >
              {server.name}
              <span>{StatusLabels[status]}</span>
            </button>
          ))}
          {!adding && <Button onClick={this.onShowAdd}>Add a server</Button>}
        </div>
        {loading && <p>Loading servers…</p>}
        {!loading && servers.length === 0 && !adding && (
          <p className="minecraft-servers-empty">
            No servers yet. Add the folder that holds your server jar. Nothing
            is downloaded for you.
          </p>
        )}
        {adding && this.renderAddForm()}
        {current !== undefined && this.renderSelected(current)}
        {this.props.hideWebPanel !== true && <WebPanelCard />}
      </section>
    )
  }
}
