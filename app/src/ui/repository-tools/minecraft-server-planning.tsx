import * as React from 'react'

import {
  IMinecraftNewWorld,
  MinecraftWorldTypes,
} from '../../lib/minecraft/properties'
import {
  IMinecraftSchedule,
  MinecraftScheduleAction,
  MinecraftScheduleActionLabels,
  MinecraftScheduleActions,
  MinecraftScheduleDraft,
  describeMinecraftSchedule,
} from '../../lib/minecraft/schedules'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import {
  addMinecraftSchedule,
  createMinecraftWorld,
  listMinecraftSchedules,
  readMinecraftCurrentWorld,
  removeMinecraftSchedule,
} from '../main-process-proxy'

/** The calls this section makes. Injectable for tests. */
export interface IMinecraftPlanningClient {
  readonly schedules: (id: string) => Promise<ReadonlyArray<IMinecraftSchedule>>
  readonly addSchedule: (
    draft: MinecraftScheduleDraft
  ) => Promise<ReadonlyArray<string>>
  readonly removeSchedule: (scheduleId: string) => Promise<void>
  readonly currentWorld: (id: string) => Promise<string | null>
  readonly newWorld: (
    id: string,
    world: IMinecraftNewWorld
  ) => Promise<ReadonlyArray<string>>
}

const defaultClient: IMinecraftPlanningClient = {
  schedules: listMinecraftSchedules,
  addSchedule: addMinecraftSchedule,
  removeSchedule: removeMinecraftSchedule,
  currentWorld: readMinecraftCurrentWorld,
  newWorld: createMinecraftWorld,
}

interface IMinecraftServerPlanningProps {
  readonly serverId: string
  /** Whether the server process exists; a new world needs it stopped. */
  readonly active: boolean
  readonly client?: IMinecraftPlanningClient
}

interface IMinecraftServerPlanningState {
  readonly schedules: ReadonlyArray<IMinecraftSchedule>
  readonly currentWorld: string | null
  readonly time: string
  readonly action: MinecraftScheduleAction
  readonly command: string
  readonly worldName: string
  readonly worldSeed: string
  readonly worldType: string
  readonly worldStructures: boolean
  readonly error: string | null
  readonly notice: string | null
}

interface IRemoveScheduleButtonProps {
  readonly schedule: IMinecraftSchedule
  readonly onRemove: (id: string) => void
}

class RemoveScheduleButton extends React.Component<IRemoveScheduleButtonProps> {
  private onClick = () => this.props.onRemove(this.props.schedule.id)

  public render() {
    return (
      <Button
        ariaLabel={`Remove: ${describeMinecraftSchedule(this.props.schedule)}`}
        onClick={this.onClick}
      >
        Remove
      </Button>
    )
  }
}

/**
 * Daily schedules and the new-world form of one Minecraft server. The same
 * rules as the web panel apply, because both go through the server host.
 */
export class MinecraftServerPlanning extends React.Component<
  IMinecraftServerPlanningProps,
  IMinecraftServerPlanningState
> {
  private mounted = false

  public constructor(props: IMinecraftServerPlanningProps) {
    super(props)
    this.state = {
      schedules: [],
      currentWorld: null,
      time: '',
      action: 'restart',
      command: '',
      worldName: '',
      worldSeed: '',
      worldType: MinecraftWorldTypes[0].id,
      worldStructures: true,
      error: null,
      notice: null,
    }
  }

  private get client() {
    return this.props.client ?? defaultClient
  }

  public componentDidMount() {
    this.mounted = true
    void this.load()
  }

  public componentDidUpdate(prevProps: IMinecraftServerPlanningProps) {
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
      const [schedules, currentWorld] = await Promise.all([
        this.client.schedules(id),
        this.client.currentWorld(id),
      ])
      if (this.mounted && id === this.props.serverId) {
        this.setState({ schedules, currentWorld })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: (error as Error).message })
      }
    }
  }

  private onTimeChanged = (time: string) => this.setState({ time })
  private onCommandChanged = (command: string) => this.setState({ command })
  private onActionChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({
      action: event.currentTarget.value as MinecraftScheduleAction,
    })
  private onWorldNameChanged = (worldName: string) =>
    this.setState({ worldName })
  private onWorldSeedChanged = (worldSeed: string) =>
    this.setState({ worldSeed })
  private onWorldTypeChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ worldType: event.currentTarget.value })
  private onWorldStructuresChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => this.setState({ worldStructures: event.currentTarget.checked })

  private onAddSchedule = async () => {
    const { time, action, command } = this.state
    this.setState({ error: null, notice: null })
    const errors = await this.client.addSchedule({
      serverId: this.props.serverId,
      time: time.trim(),
      action,
      command: action === 'command' ? command : null,
    })
    if (!this.mounted) {
      return
    }
    if (errors.length > 0) {
      this.setState({ error: errors.join(' ') })
      return
    }
    this.setState({ time: '', command: '', notice: 'Schedule added.' })
    await this.load()
  }

  private onRemoveSchedule = async (id: string) => {
    await this.client.removeSchedule(id)
    await this.load()
  }

  private onNewWorld = async () => {
    this.setState({ error: null, notice: null })
    const errors = await this.client.newWorld(this.props.serverId, {
      name: this.state.worldName.trim(),
      seed: this.state.worldSeed,
      type: this.state.worldType,
      structures: this.state.worldStructures,
    })
    if (!this.mounted) {
      return
    }
    if (errors.length > 0) {
      this.setState({ error: errors.join(' ') })
      return
    }
    this.setState({
      worldName: '',
      worldSeed: '',
      notice:
        'The new world will be generated the next time the server starts.',
    })
    await this.load()
  }

  public render() {
    const { schedules, currentWorld, action, error, notice } = this.state
    return (
      <div className="minecraft-servers-extras">
        {error !== null && (
          <p className="minecraft-servers-message" role="alert">
            {error}
          </p>
        )}
        {notice !== null && <p role="status">{notice}</p>}
        <details>
          <summary>Schedules ({schedules.length})</summary>
          <p className="minecraft-servers-meta">
            Daily, in this computer&apos;s local time. They run only while
            Desktop Material is open, and a time that passed while the computer
            slept is skipped.
          </p>
          <ul className="web-panel-list">
            {schedules.map(schedule => (
              <li key={schedule.id}>
                <span>{describeMinecraftSchedule(schedule)}</span>
                <RemoveScheduleButton
                  schedule={schedule}
                  onRemove={this.onRemoveSchedule}
                />
              </li>
            ))}
          </ul>
          <div className="minecraft-servers-settings">
            <TextBox
              label="Time (24 hour, HH:MM)"
              placeholder="04:30"
              value={this.state.time}
              onValueChanged={this.onTimeChanged}
            />
            <Select
              label="What it does"
              value={action}
              onChange={this.onActionChanged}
            >
              {MinecraftScheduleActions.map(value => (
                <option key={value} value={value}>
                  {MinecraftScheduleActionLabels[value]}
                </option>
              ))}
            </Select>
            {action === 'command' && (
              <TextBox
                label="Scheduled console command"
                value={this.state.command}
                onValueChanged={this.onCommandChanged}
              />
            )}
          </div>
          <div className="minecraft-servers-actions">
            <Button onClick={this.onAddSchedule}>Add schedule</Button>
          </div>
        </details>
        <details>
          <summary>New world</summary>
          <p className="minecraft-servers-meta">
            Current world folder: {currentWorld ?? '(not a plain folder name)'}.
            A new world is generated the next time the server starts. The
            current one stays in the server folder untouched.
          </p>
          <div className="minecraft-servers-settings">
            <TextBox
              label="Name of the new world"
              value={this.state.worldName}
              onValueChanged={this.onWorldNameChanged}
            />
            <TextBox
              label="Seed (empty for a random one)"
              value={this.state.worldSeed}
              onValueChanged={this.onWorldSeedChanged}
            />
            <Select
              label="World type"
              value={this.state.worldType}
              onChange={this.onWorldTypeChanged}
            >
              {MinecraftWorldTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>
          <Checkbox
            label="Generate villages and other structures"
            value={
              this.state.worldStructures ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onWorldStructuresChanged}
          />
          <div className="minecraft-servers-actions">
            <Button disabled={this.props.active} onClick={this.onNewWorld}>
              Use a new world
            </Button>
          </div>
        </details>
      </div>
    )
  }
}
