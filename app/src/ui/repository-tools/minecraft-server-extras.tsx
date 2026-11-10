import * as React from 'react'

import { IMinecraftPropertySpec } from '../../lib/minecraft/properties'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import {
  backUpMinecraftWorld,
  listMinecraftAddOns,
  listMinecraftBackups,
  restoreMinecraftBackup,
  readMinecraftSettings,
  setMinecraftSetting,
} from '../main-process-proxy'

interface ISetting {
  readonly spec: IMinecraftPropertySpec
  readonly value: string
}

/** The calls this section makes. Injectable for tests. */
export interface IMinecraftExtrasClient {
  readonly settings: (id: string) => Promise<ReadonlyArray<ISetting>>
  readonly setSetting: (
    id: string,
    key: string,
    value: string
  ) => Promise<string | null>
  readonly backups: (
    id: string
  ) => Promise<
    ReadonlyArray<{ readonly name: string; readonly createdAt: number }>
  >
  readonly backup: (id: string) => Promise<string | null>
  readonly restore: (id: string, name: string) => Promise<string | null>
  readonly addOns: (id: string) => Promise<
    ReadonlyArray<{
      readonly name: string
      readonly kind: 'plugin' | 'mod'
      readonly bytes: number
    }>
  >
}

const defaultClient: IMinecraftExtrasClient = {
  settings: readMinecraftSettings,
  setSetting: setMinecraftSetting,
  backups: listMinecraftBackups,
  backup: backUpMinecraftWorld,
  restore: restoreMinecraftBackup,
  addOns: listMinecraftAddOns,
}

interface IMinecraftServerExtrasProps {
  readonly serverId: string
  /** Whether the server process exists; backups need it stopped. */
  readonly active: boolean
  readonly client?: IMinecraftExtrasClient
}

interface IMinecraftServerExtrasState {
  readonly settings: ReadonlyArray<ISetting>
  readonly drafts: Readonly<Record<string, string>>
  readonly backups: ReadonlyArray<{
    readonly name: string
    readonly createdAt: number
  }>
  readonly addOns: ReadonlyArray<{
    readonly name: string
    readonly kind: 'plugin' | 'mod'
    readonly bytes: number
  }>
  readonly error: string | null
  readonly notice: string | null
  readonly backingUp: boolean
  /** The backup whose Restore was pressed once and awaits a second press. */
  readonly armedRestore: string | null
}

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

interface ISettingFieldProps {
  readonly setting: ISetting
  readonly draft: string
  readonly onDraft: (key: string, value: string) => void
  readonly onCommit: (key: string, value: string) => void
}

/** One setting: a select for switches and choices, a text field otherwise. */
class SettingField extends React.Component<ISettingFieldProps> {
  private onSelect = (event: React.FormEvent<HTMLSelectElement>) =>
    this.props.onCommit(this.props.setting.spec.key, event.currentTarget.value)

  private onText = (value: string) =>
    this.props.onDraft(this.props.setting.spec.key, value)

  private onBlur = () => {
    if (this.props.draft !== this.props.setting.value) {
      this.props.onCommit(this.props.setting.spec.key, this.props.draft)
    }
  }

  public render() {
    const { spec } = this.props.setting
    if (spec.type.kind === 'boolean' || spec.type.kind === 'choice') {
      const choices =
        spec.type.kind === 'boolean' ? ['true', 'false'] : spec.type.choices
      return (
        <Select
          label={spec.label}
          value={this.props.setting.value}
          onChange={this.onSelect}
        >
          {choices.map(choice => (
            <option key={choice} value={choice}>
              {spec.type.kind === 'boolean'
                ? choice === 'true'
                  ? 'On'
                  : 'Off'
                : choice}
            </option>
          ))}
        </Select>
      )
    }
    return (
      <TextBox
        label={spec.label}
        value={this.props.draft}
        onValueChanged={this.onText}
        onBlur={this.onBlur}
      />
    )
  }
}

interface IRestoreButtonProps {
  readonly name: string
  readonly armed: boolean
  readonly disabled: boolean
  readonly onPress: (name: string) => void
}

/** Restore needs two presses, so one stray click changes nothing. */
class RestoreButton extends React.Component<IRestoreButtonProps> {
  private onClick = () => this.props.onPress(this.props.name)

  public render() {
    return (
      <Button
        ariaLabel={
          this.props.armed
            ? `Press again to restore ${this.props.name}`
            : `Restore ${this.props.name}`
        }
        disabled={this.props.disabled}
        onClick={this.onClick}
      >
        {this.props.armed ? 'Press again to restore' : 'Restore'}
      </Button>
    )
  }
}

/**
 * Settings, backups and the plugin list of one Minecraft server. The same
 * rules as the web panel apply, because both go through the server host.
 */
export class MinecraftServerExtras extends React.Component<
  IMinecraftServerExtrasProps,
  IMinecraftServerExtrasState
> {
  private mounted = false

  public constructor(props: IMinecraftServerExtrasProps) {
    super(props)
    this.state = {
      settings: [],
      drafts: {},
      backups: [],
      addOns: [],
      error: null,
      notice: null,
      backingUp: false,
      armedRestore: null,
    }
  }

  private get client() {
    return this.props.client ?? defaultClient
  }

  public componentDidMount() {
    this.mounted = true
    void this.load()
  }

  public componentDidUpdate(prevProps: IMinecraftServerExtrasProps) {
    if (prevProps.serverId !== this.props.serverId) {
      this.setState({ error: null, notice: null })
      void this.load()
    }
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private load = async () => {
    const id = this.props.serverId
    try {
      const [settings, backups, addOns] = await Promise.all([
        this.client.settings(id),
        this.client.backups(id),
        this.client.addOns(id),
      ])
      if (this.mounted && id === this.props.serverId) {
        const drafts: Record<string, string> = {}
        for (const setting of settings) {
          drafts[setting.spec.key] = setting.value
        }
        this.setState({ settings, drafts, backups, addOns })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: (error as Error).message })
      }
    }
  }

  private onDraft = (key: string, value: string) =>
    this.setState(state => ({ drafts: { ...state.drafts, [key]: value } }))

  private onCommit = async (key: string, value: string) => {
    this.setState({ error: null, notice: null })
    const problem = await this.client.setSetting(
      this.props.serverId,
      key,
      value
    )
    if (!this.mounted) {
      return
    }
    this.setState({
      error: problem,
      notice:
        problem !== null
          ? null
          : this.props.active
            ? 'Saved. The server reads it the next time it starts.'
            : 'Saved.',
    })
    await this.load()
  }

  private onBackup = async () => {
    this.setState({ error: null, notice: null, backingUp: true })
    const problem = await this.client.backup(this.props.serverId)
    if (!this.mounted) {
      return
    }
    this.setState({
      error: problem,
      notice: problem === null ? 'The world was backed up.' : null,
      backingUp: false,
    })
    await this.load()
  }

  private onRestore = async (name: string) => {
    if (this.state.armedRestore !== name) {
      this.setState({ armedRestore: name })
      return
    }
    this.setState({ error: null, notice: null, armedRestore: null })
    const problem = await this.client.restore(this.props.serverId, name)
    if (!this.mounted) {
      return
    }
    this.setState({
      error: problem,
      notice:
        problem === null
          ? 'Restored. The world it replaced was kept as a before-restore backup.'
          : null,
    })
    await this.load()
  }

  public render() {
    const { settings, drafts, backups, addOns, error, notice } = this.state
    return (
      <div className="minecraft-servers-extras">
        {error !== null && (
          <p className="minecraft-servers-message" role="alert">
            {error}
          </p>
        )}
        {notice !== null && <p role="status">{notice}</p>}
        <details>
          <summary>Settings</summary>
          <p className="minecraft-servers-meta">
            Written to server.properties. Only these ten values can be changed
            here.
          </p>
          <div className="minecraft-servers-settings">
            {settings.map(setting => (
              <SettingField
                key={setting.spec.key}
                setting={setting}
                draft={drafts[setting.spec.key] ?? setting.value}
                onDraft={this.onDraft}
                onCommit={this.onCommit}
              />
            ))}
          </div>
        </details>
        <details>
          <summary>Backups ({backups.length})</summary>
          <p className="minecraft-servers-meta">
            Copies the world into the server&apos;s backups folder. Stop the
            server first.
          </p>
          <div className="minecraft-servers-actions">
            <Button
              disabled={this.props.active || this.state.backingUp}
              onClick={this.onBackup}
            >
              Back up world
            </Button>
          </div>
          <ul className="web-panel-list">
            {backups.map(backup => (
              <li key={backup.name}>
                <span>{backup.name}</span>
                <small>{new Date(backup.createdAt).toLocaleString()}</small>
                <RestoreButton
                  name={backup.name}
                  armed={this.state.armedRestore === backup.name}
                  disabled={this.props.active}
                  onPress={this.onRestore}
                />
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Plugins and mods ({addOns.length})</summary>
          {addOns.length === 0 ? (
            <p className="minecraft-servers-meta">
              No plugin or mod files were found.
            </p>
          ) : (
            <ul className="web-panel-list">
              {addOns.map(addOn => (
                <li key={`${addOn.kind}/${addOn.name}`}>
                  <span>{addOn.name}</span>
                  <small>
                    {addOn.kind === 'mod' ? 'Mod' : 'Plugin'} ·{' '}
                    {formatBytes(addOn.bytes)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    )
  }
}
