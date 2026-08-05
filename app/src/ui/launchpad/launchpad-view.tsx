import * as React from 'react'

import {
  ILaunchpadSection,
  ILaunchpadSectionBuildResult,
  LaunchpadBucket,
  LaunchpadBucketOrder,
  LaunchpadField,
  LaunchpadItem,
  LaunchpadProviderItemKey,
  LaunchpadRelevantField,
  createLaunchpadProviderItemKey,
  isLaunchpadProviderItemKey,
} from '../../lib/launchpad/launchpad-model'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { ITeamMember } from '../../lib/self-hosted-server/team-client'

export type LaunchpadSectionId = LaunchpadBucket
export type ILaunchpadViewItem = LaunchpadItem

/** The view normalizes all input against this issue-defined order. */
export const LaunchpadSectionOrder: ReadonlyArray<LaunchpadSectionId> =
  LaunchpadBucketOrder

export type LaunchpadAction = 'pin' | 'snooze'

export type ILaunchpadActionAvailability =
  | { readonly availability: 'available' }
  | {
      readonly availability: 'unavailable' | 'not-applicable'
      readonly reason: string
    }

export const LaunchpadSnoozeDurations = Object.freeze({
  OneHour: 60 * 60 * 1_000,
  FourHours: 4 * 60 * 60 * 1_000,
  OneDay: 24 * 60 * 60 * 1_000,
  OneWeek: 7 * 24 * 60 * 60 * 1_000,
} as const)

export type LaunchpadSnoozeDurationMs =
  typeof LaunchpadSnoozeDurations[keyof typeof LaunchpadSnoozeDurations]

export interface ILaunchpadSnoozeOption {
  readonly durationMs: LaunchpadSnoozeDurationMs
  readonly label: string
}

/** The only durations the view can send to its callback. */
export const LaunchpadSnoozeOptions: ReadonlyArray<ILaunchpadSnoozeOption> =
  Object.freeze([
    Object.freeze({
      durationMs: LaunchpadSnoozeDurations.OneHour,
      label: '1 hour',
    }),
    Object.freeze({
      durationMs: LaunchpadSnoozeDurations.FourHours,
      label: '4 hours',
    }),
    Object.freeze({
      durationMs: LaunchpadSnoozeDurations.OneDay,
      label: '1 day',
    }),
    Object.freeze({
      durationMs: LaunchpadSnoozeDurations.OneWeek,
      label: '1 week',
    }),
  ])

export interface ILaunchpadViewProps {
  readonly result: ILaunchpadSectionBuildResult
  /** Epoch milliseconds, injectable for stable age rendering. */
  readonly now?: number
  /** Supplying this set makes section collapse state controlled. */
  readonly collapsedSections?: ReadonlySet<LaunchpadSectionId>
  readonly defaultCollapsedSections?: ReadonlySet<LaunchpadSectionId>
  readonly onCollapsedSectionsChange?: (
    collapsedSections: ReadonlySet<LaunchpadSectionId>
  ) => void
  readonly resolveActionAvailability?: (
    itemKey: LaunchpadProviderItemKey,
    action: LaunchpadAction,
    item: LaunchpadItem
  ) => ILaunchpadActionAvailability
  readonly onPinChange?: (
    itemKey: LaunchpadProviderItemKey,
    shouldPin: boolean
  ) => void
  readonly onSnooze?: (
    itemKey: LaunchpadProviderItemKey,
    durationMs: LaunchpadSnoozeDurationMs
  ) => void
  /**
   * Team View is an honest degrade: omit this prop (or pass `null`) when no
   * self-hosted server is configured and reachable, and the toggle will not
   * render at all. Passing a non-null value means a real server responded to
   * `GET /v1/team/members`; the view never fabricates members.
   */
  readonly team?: {
    readonly members: ReadonlyArray<ITeamMember> | null
    readonly selected: boolean
    readonly onSelect: (selected: boolean) => void
  }
}

interface ILaunchpadViewState {
  readonly collapsedSections: ReadonlySet<LaunchpadSectionId>
}

interface ISectionPresentation {
  readonly id: string
  readonly icon: MaterialSymbolName
}

const SectionPresentation: Readonly<
  Record<LaunchpadSectionId, ISectionPresentation>
> = Object.freeze({
  Pinned: Object.freeze({ id: 'pinned', icon: 'star' }),
  'Ready to merge': Object.freeze({ id: 'ready-to-merge', icon: 'merge' }),
  Unassigned: Object.freeze({ id: 'unassigned', icon: 'person_add' }),
  'CI failing': Object.freeze({ id: 'ci-failing', icon: 'error' }),
  'Merge conflicts': Object.freeze({
    id: 'merge-conflicts',
    icon: 'call_split',
  }),
})

const AvailableAction: ILaunchpadActionAvailability = Object.freeze({
  availability: 'available',
})

let launchpadViewInstanceCount = 0

function normalizeCollapsedSections(
  sections: ReadonlySet<LaunchpadSectionId> | undefined
): ReadonlySet<LaunchpadSectionId> {
  if (sections === undefined) {
    return new Set()
  }

  return new Set(LaunchpadSectionOrder.filter(section => sections.has(section)))
}

function isLaunchpadSectionId(
  value: string | undefined
): value is LaunchpadSectionId {
  return (
    value !== undefined &&
    (LaunchpadSectionOrder as ReadonlyArray<string>).includes(value)
  )
}

function normalizeSections(
  sections: ReadonlyArray<ILaunchpadSection>
): ReadonlyArray<ILaunchpadSection> {
  const itemsBySection = new Map<LaunchpadSectionId, LaunchpadItem[]>()
  for (const section of LaunchpadSectionOrder) {
    itemsBySection.set(section, [])
  }

  for (const section of sections) {
    const items = itemsBySection.get(section.bucket)
    if (items !== undefined) {
      items.push(...section.items)
    }
  }

  return LaunchpadSectionOrder.map(bucket => ({
    bucket,
    items: itemsBySection.get(bucket)!,
  }))
}

function pluralizedItems(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'item' : 'items'}`
}

function formatField<T>(
  field: LaunchpadField<T>,
  label: string,
  formatValue: (value: T) => string
): string {
  switch (field.availability) {
    case 'value':
      return formatValue(field.value)
    case 'unavailable':
      return `${label} unavailable`
    case 'not-applicable':
      return `${label} not applicable`
  }
}

function formatReference(item: LaunchpadItem): string {
  switch (item.referenceNumber.availability) {
    case 'value':
      return `#${item.referenceNumber.value.toLocaleString('en-US')}`
    case 'unavailable':
      return 'Reference number unavailable'
    case 'not-applicable':
      return 'Reference number not applicable'
  }
}

function formatDiff(item: LaunchpadItem): string {
  return formatField(
    item.diffStat,
    'Diff',
    stat =>
      `+${stat.additions.toLocaleString(
        'en-US'
      )} / \u2212${stat.deletions.toLocaleString('en-US')}`
  )
}

function formatCI(item: LaunchpadItem): string {
  switch (item.ciStatus.availability) {
    case 'unavailable':
      return 'CI status unavailable'
    case 'not-applicable':
      return 'CI status N/A'
    case 'value':
      switch (item.ciStatus.value) {
        case 'queued':
          return 'CI queued'
        case 'in-progress':
          return 'CI in progress'
        case 'succeeded':
          return 'CI succeeded'
        case 'failed':
          return 'CI failed'
        case 'cancelled':
          return 'CI cancelled'
        case 'action-required':
          return 'CI action required'
      }
  }
}

function formatAssignment(item: LaunchpadItem): string {
  return formatField(item.attention.assignment, 'Assignment', assignment =>
    assignment === 'assigned' ? 'Assigned' : 'Unassigned'
  )
}

function formatMergeReadiness(item: LaunchpadItem): string {
  return formatField(item.attention.readyToMerge, 'Merge readiness', ready =>
    ready ? 'Ready to merge' : 'Not ready to merge'
  )
}

function formatMergeConflicts(item: LaunchpadItem): string {
  return formatField(
    item.attention.mergeConflict,
    'Merge conflict status',
    state => (state === 'conflicted' ? 'Merge conflicts' : 'Conflict-free')
  )
}

interface IFormattedAge {
  readonly label: string
  readonly dateTime?: string
  readonly title?: string
}

function formatAge(
  updatedAt: LaunchpadRelevantField<string>,
  now: number
): IFormattedAge {
  if (updatedAt.availability === 'unavailable') {
    return { label: 'Age unavailable' }
  }

  const timestamp = Date.parse(updatedAt.value)
  if (!Number.isFinite(timestamp)) {
    return { label: 'Age unavailable' }
  }

  const absolute = new Date(timestamp).toISOString()
  const difference = now - timestamp
  const future = difference < 0
  const elapsed = Math.abs(difference)
  let amount: number
  let unit: 'minute' | 'hour' | 'day'

  if (elapsed < 60_000) {
    return {
      label: future ? 'in less than 1 minute' : 'less than 1 minute ago',
      dateTime: absolute,
      title: absolute,
    }
  }
  if (elapsed < 60 * 60_000) {
    amount = future ? Math.ceil(elapsed / 60_000) : Math.floor(elapsed / 60_000)
    unit = 'minute'
  } else if (elapsed < 24 * 60 * 60_000) {
    amount = future
      ? Math.ceil(elapsed / (60 * 60_000))
      : Math.floor(elapsed / (60 * 60_000))
    unit = 'hour'
  } else {
    amount = future
      ? Math.ceil(elapsed / (24 * 60 * 60_000))
      : Math.floor(elapsed / (24 * 60 * 60_000))
    unit = 'day'
  }

  return {
    label: future
      ? `in ${amount} ${unit}${amount === 1 ? '' : 's'}`
      : `${amount} ${unit}${amount === 1 ? '' : 's'} ago`,
    dateTime: absolute,
    title: absolute,
  }
}

function normalizedNow(now: number | undefined): number {
  return now !== undefined && Number.isFinite(now) ? now : Date.now()
}

function actionReason(
  action: LaunchpadAction,
  availability: Exclude<
    ILaunchpadActionAvailability,
    { readonly availability: 'available' }
  >
): string {
  const actionLabel = action === 'pin' ? 'Pin action' : 'Snooze action'
  const stateLabel =
    availability.availability === 'not-applicable'
      ? 'not applicable'
      : 'unavailable'
  const reason = availability.reason.trim()
  return `${actionLabel} ${stateLabel}: ${
    reason.length > 0 ? reason : 'No reason was provided.'
  }`
}

export class LaunchpadView extends React.Component<
  ILaunchpadViewProps,
  ILaunchpadViewState
> {
  private readonly instanceId: string

  public constructor(props: ILaunchpadViewProps) {
    super(props)
    launchpadViewInstanceCount++
    this.instanceId = `launchpad-view-${launchpadViewInstanceCount}`
    this.state = {
      collapsedSections: normalizeCollapsedSections(
        props.defaultCollapsedSections
      ),
    }
  }

  private isCollapsed(section: LaunchpadSectionId): boolean {
    const collapsed =
      this.props.collapsedSections ?? this.state.collapsedSections
    return collapsed.has(section)
  }

  private onToggleSection = (section: LaunchpadSectionId) => {
    const current = normalizeCollapsedSections(
      this.props.collapsedSections ?? this.state.collapsedSections
    )
    const next = new Set(current)
    if (next.has(section)) {
      next.delete(section)
    } else {
      next.add(section)
    }

    if (this.props.collapsedSections === undefined) {
      this.setState({ collapsedSections: next })
    }
    this.props.onCollapsedSectionsChange?.(next)
  }

  private onSectionToggleClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const section = event.currentTarget.dataset.launchpadSection
    if (isLaunchpadSectionId(section)) {
      this.onToggleSection(section)
    }
  }

  private onPinActionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const itemKey = event.currentTarget.dataset.launchpadItemKey
    if (
      event.currentTarget.getAttribute('aria-disabled') === 'true' ||
      !isLaunchpadProviderItemKey(itemKey)
    ) {
      return
    }

    const shouldPin = event.currentTarget.dataset.launchpadShouldPin === 'true'
    this.props.onPinChange?.(itemKey, shouldPin)
  }

  private onSnoozeActionClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
      return
    }

    const itemKey = event.currentTarget.dataset.launchpadItemKey
    const duration = Number(event.currentTarget.dataset.launchpadSnoozeDuration)
    const option = LaunchpadSnoozeOptions.find(
      candidate => candidate.durationMs === duration
    )
    if (!isLaunchpadProviderItemKey(itemKey) || option === undefined) {
      return
    }

    this.props.onSnooze?.(itemKey, option.durationMs)
  }

  private resolveActionAvailability(
    itemKey: LaunchpadProviderItemKey,
    action: LaunchpadAction,
    item: LaunchpadItem
  ): ILaunchpadActionAvailability {
    const callback =
      action === 'pin' ? this.props.onPinChange : this.props.onSnooze
    if (callback === undefined) {
      return {
        availability: 'unavailable',
        reason: `No ${action} action handler is connected.`,
      }
    }

    return (
      this.props.resolveActionAvailability?.(itemKey, action, item) ??
      AvailableAction
    )
  }

  private renderAge(item: LaunchpadItem) {
    const age = formatAge(item.updatedAt, normalizedNow(this.props.now))
    return age.dateTime === undefined ? (
      <span className="launchpad-view__age">{age.label}</span>
    ) : (
      <time
        className="launchpad-view__age"
        dateTime={age.dateTime}
        title={age.title}
      >
        {age.label}
      </time>
    )
  }

  private renderActions(
    item: LaunchpadItem,
    section: LaunchpadSectionId,
    itemIndex: number
  ) {
    const itemKey = createLaunchpadProviderItemKey(item.identity)
    const isPinned = section === 'Pinned'
    const pinAvailability = this.resolveActionAvailability(itemKey, 'pin', item)
    const snoozeAvailability = this.resolveActionAvailability(
      itemKey,
      'snooze',
      item
    )
    const pinDescriptionId = `${this.instanceId}-${SectionPresentation[section].id}-${itemIndex}-pin-description`
    const snoozeDescriptionId = `${this.instanceId}-${SectionPresentation[section].id}-${itemIndex}-snooze-description`
    const pinDisabled = pinAvailability.availability !== 'available'
    const snoozeDisabled = snoozeAvailability.availability !== 'available'
    const pinReason =
      pinAvailability.availability === 'available'
        ? undefined
        : actionReason('pin', pinAvailability)
    const snoozeReason =
      snoozeAvailability.availability === 'available'
        ? undefined
        : actionReason('snooze', snoozeAvailability)

    return (
      <div
        className="launchpad-view__actions"
        role="group"
        aria-label={`Actions for ${item.title}`}
      >
        <button
          type="button"
          className="launchpad-view__action"
          aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${item.title}`}
          aria-describedby={pinDisabled ? pinDescriptionId : undefined}
          aria-disabled={pinDisabled}
          data-launchpad-item-key={itemKey}
          data-launchpad-should-pin={String(!isPinned)}
          onClick={this.onPinActionClick}
        >
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
        <span className="launchpad-view__snooze-label">Snooze</span>
        {LaunchpadSnoozeOptions.map(option => (
          <button
            key={option.durationMs}
            type="button"
            className="launchpad-view__action"
            aria-label={`Snooze ${item.title} for ${option.label}`}
            aria-describedby={snoozeDisabled ? snoozeDescriptionId : undefined}
            aria-disabled={snoozeDisabled}
            data-launchpad-item-key={itemKey}
            data-launchpad-snooze-duration={option.durationMs}
            onClick={this.onSnoozeActionClick}
          >
            {option.label}
          </button>
        ))}
        {pinAvailability.availability !== 'available' && (
          <span id={pinDescriptionId} className="launchpad-view__metadata">
            {pinReason}
          </span>
        )}
        {snoozeAvailability.availability !== 'available' && (
          <span id={snoozeDescriptionId} className="launchpad-view__metadata">
            {snoozeReason}
          </span>
        )}
      </div>
    )
  }

  private renderItem(
    item: LaunchpadItem,
    section: LaunchpadSectionId,
    itemIndex: number
  ) {
    const itemKey = createLaunchpadProviderItemKey(item.identity)
    const titleId = `${this.instanceId}-${SectionPresentation[section].id}-${itemIndex}-title`
    const reference = formatReference(item)

    return (
      <li
        key={itemKey}
        className="launchpad-view__row"
        aria-labelledby={titleId}
      >
        <div className="launchpad-view__status">
          <MaterialSymbol
            className="launchpad-view__status-icon"
            name={SectionPresentation[section].icon}
            size={20}
          />
          <span>{section}</span>
        </div>
        <div className="launchpad-view__body">
          <h3 id={titleId} className="launchpad-view__title">
            <span>{item.title}</span>
            <span className="launchpad-view__reference">{reference}</span>
          </h3>
          <div className="launchpad-view__metadata">
            {this.renderAge(item)}
            <span>{formatCI(item)}</span>
            <span>{formatAssignment(item)}</span>
            <span>{formatMergeReadiness(item)}</span>
            <span>{formatMergeConflicts(item)}</span>
          </div>
          <span className="launchpad-view__diff">{formatDiff(item)}</span>
        </div>
        {this.renderActions(item, section, itemIndex)}
      </li>
    )
  }

  private renderSection(section: ILaunchpadSection) {
    const presentation = SectionPresentation[section.bucket]
    const headingId = `${this.instanceId}-${presentation.id}-heading`
    const rowsId = `${this.instanceId}-${presentation.id}-rows`
    const collapsed = this.isCollapsed(section.bucket)
    const count = section.items.length

    return (
      <section
        key={section.bucket}
        className="launchpad-view__section"
        aria-label={`${section.bucket}, ${pluralizedItems(count)}`}
      >
        <h2 id={headingId} className="launchpad-view__section-heading">
          <button
            type="button"
            className="launchpad-view__section-toggle"
            aria-expanded={!collapsed}
            aria-controls={rowsId}
            aria-label={`${section.bucket}, ${pluralizedItems(count)}, ${
              collapsed ? 'collapsed' : 'expanded'
            }`}
            data-launchpad-section={section.bucket}
            onClick={this.onSectionToggleClick}
          >
            <span className="launchpad-view__section-title">
              {section.bucket}
            </span>
            <span className="launchpad-view__section-count">{count}</span>
          </button>
        </h2>
        <div id={rowsId} hidden={collapsed}>
          {count === 0 ? (
            <p className="launchpad-view__metadata" role="status">
              No items in {section.bucket}.
            </p>
          ) : (
            <ul className="launchpad-view__rows">
              {section.items.map((item, index) =>
                this.renderItem(item, section.bucket, index)
              )}
            </ul>
          )}
        </div>
      </section>
    )
  }

  private renderAccountingStatus() {
    const status = new Array<string>()
    if (this.props.result.omittedItemCount > 0) {
      const count = this.props.result.omittedItemCount
      status.push(
        `${pluralizedItems(count)} omitted because ${
          count === 1 ? 'it does' : 'they do'
        } not match a Launchpad section.`
      )
    }
    if (this.props.result.snoozedItemCount > 0) {
      const count = this.props.result.snoozedItemCount
      status.push(
        `${pluralizedItems(count)} snoozed and hidden until ${
          count === 1 ? 'its' : 'their'
        } snooze expires.`
      )
    }

    return status.length === 0 ? null : (
      <p className="launchpad-view__metadata" role="status" aria-live="polite">
        {status.join(' ')}
      </p>
    )
  }

  private onTeamViewToggleClick = () => {
    const team = this.props.team
    if (team !== undefined) {
      team.onSelect(!team.selected)
    }
  }

  private renderTeamViewToggle() {
    const team = this.props.team
    if (team === undefined) {
      return null
    }

    return (
      <button
        type="button"
        className="launchpad-view__team-toggle"
        aria-pressed={team.selected}
        onClick={this.onTeamViewToggleClick}
      >
        <MaterialSymbol name="group_add" />
        Team View
      </button>
    )
  }

  private renderPresenceDot(status: ITeamMember['status']) {
    return (
      <span
        className={`launchpad-view__presence-dot launchpad-view__presence-dot--${status}`}
        aria-hidden="true"
      />
    )
  }

  private describePresence(member: ITeamMember): string {
    if (member.status === 'offline') {
      return `${member.deviceName}, offline`
    }
    const activity = member.activity ? `, ${member.activity}` : ''
    return `${member.deviceName}, ${member.status}${activity}`
  }

  private renderTeamView() {
    const team = this.props.team
    if (team === undefined || !team.selected) {
      return null
    }

    if (team.members === null) {
      return (
        <div className="launchpad-view__team-status" role="status">
          Loading team activity from your self-hosted server…
        </div>
      )
    }

    if (team.members.length === 0) {
      return (
        <div className="launchpad-view__team-status" role="status">
          No teammates have joined this server yet.
        </div>
      )
    }

    return (
      <ul className="launchpad-view__team-members" aria-label="Team activity">
        {team.members.map(member => (
          <li
            key={member.deviceId}
            className="launchpad-view__team-member"
            aria-label={this.describePresence(member)}
          >
            {this.renderPresenceDot(member.status)}
            <span className="launchpad-view__team-member-name">
              {member.deviceName}
            </span>
            {member.activity && (
              <span className="launchpad-view__team-member-activity">
                {member.activity}
              </span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  public render() {
    const sections = normalizeSections(this.props.result.sections)
    const showingTeamView = this.props.team?.selected === true
    return (
      <div className="launchpad-view">
        {this.renderTeamViewToggle()}
        {showingTeamView ? (
          this.renderTeamView()
        ) : (
          <>
            {this.renderAccountingStatus()}
            {sections.map(section => this.renderSection(section))}
          </>
        )}
      </div>
    )
  }
}
