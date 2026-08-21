import * as React from 'react'
import classNames from 'classnames'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RelativeTime } from '../relative-time'
import {
  INotificationEntry,
  NotificationCentreKind,
} from '../../models/notification-centre'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { personalizeText } from '../../lib/i18n'
import { PersonalVocabularyChangedEvent } from '../../lib/personal-vocabulary'

interface INotificationListItemProps {
  readonly entry: INotificationEntry
  readonly selected: boolean
  readonly selectionDisabled?: boolean
  readonly onToggleSelected: (
    entry: INotificationEntry,
    selected: boolean
  ) => void
  /** Activate the row: run its action (if any) and mark it read. */
  readonly onActivate: (entry: INotificationEntry) => void
  /** Toggle the read/unread state without activating the action. */
  readonly onToggleRead: (entry: INotificationEntry) => void
  readonly onDelete: (entry: INotificationEntry) => void
  /**
   * Open the notification-automation builder scoped to this entry. When
   * omitted the row exposes no context menu — this is the sole, deliberately
   * hidden entry point into the automation feature.
   */
  readonly onOpenAutomations?: (entry: INotificationEntry) => void
}

/**
 * The items surfaced by right-clicking a notification row. The automation
 * builder is intentionally reachable only from here (there is no command
 * palette or app-menu entry), so an armed rule can never fire behind a user
 * who never opened this menu.
 */
export function buildNotificationRowContextMenuItems(
  entry: INotificationEntry,
  onOpenAutomations: (entry: INotificationEntry) => void
): ReadonlyArray<IMenuItem> {
  return [
    {
      label: __DARWIN__ ? 'Automations…' : 'Automations…',
      action: () => onOpenAutomations(entry),
    },
  ]
}

/** The octicon shown in each notification's kind chip. */
const kindIcons: Record<NotificationCentreKind, OcticonSymbol> = {
  'pr-review-submit': octicons.eye,
  'pr-comment': octicons.comment,
  'pr-checks-failed': octicons.xCircle,
  'app-error': octicons.alert,
  'clone-batch': octicons.desktopDownload,
  'auto-commit': octicons.gitCommit,
  'merge-all': octicons.gitMerge,
  'auto-pull': octicons.arrowDown,
  'cheap-lfs': octicons.fileBinary,
  'build-run': octicons.play,
  info: octicons.info,
}

/**
 * A single row in the notification centre list. A PureComponent so that
 * keystrokes, selection changes, and bulk progress updates in the panel only
 * re-render the rows whose props actually changed. The row is hosted in a
 * virtualized list whose positioned wrapper carries the listitem role.
 */
export class NotificationListItem extends React.PureComponent<INotificationListItemProps> {
  public componentDidMount() {
    window.addEventListener(
      PersonalVocabularyChangedEvent,
      this.onPersonalVocabularyChanged
    )
  }

  public componentWillUnmount() {
    window.removeEventListener(
      PersonalVocabularyChangedEvent,
      this.onPersonalVocabularyChanged
    )
  }

  private onPersonalVocabularyChanged = () => this.forceUpdate()

  private onActivate = () => this.props.onActivate(this.props.entry)

  private onToggleRead = (event: React.MouseEvent) => {
    event.stopPropagation()
    this.props.onToggleRead(this.props.entry)
  }

  private onDelete = (event: React.MouseEvent) => {
    event.stopPropagation()
    this.props.onDelete(this.props.entry)
  }

  private onToggleSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation()
    this.props.onToggleSelected(this.props.entry, event.currentTarget.checked)
  }

  private onContextMenu = (event: React.MouseEvent) => {
    const { onOpenAutomations, entry } = this.props
    if (onOpenAutomations === undefined) {
      return
    }
    event.preventDefault()
    showContextualMenu(
      buildNotificationRowContextMenuItems(entry, onOpenAutomations)
    )
  }

  public render() {
    const { entry, selected, selectionDisabled } = this.props
    const title = personalizeText(entry.title)
    const body = personalizeText(entry.body)
    const className = classNames('notification-item', `kind-${entry.kind}`, {
      unread: !entry.read,
      selected,
    })

    return (
      <li className={className} onContextMenu={this.onContextMenu}>
        <label className="notification-item-selection">
          <input
            type="checkbox"
            checked={selected}
            disabled={selectionDisabled}
            aria-label={`${personalizeText('Select notification:')} ${title}`}
            onChange={this.onToggleSelected}
          />
        </label>
        <button
          type="button"
          className="notification-item-activate"
          onClick={this.onActivate}
        >
          <span className="notification-item-icon" aria-hidden="true">
            <Octicon symbol={kindIcons[entry.kind] ?? octicons.info} />
          </span>
          <span className="notification-item-body">
            <span className="notification-item-title">
              {title}
              {!entry.read ? <span className="sr-only"> (unread)</span> : null}
            </span>
            <span className="notification-item-text">{body}</span>
            <span className="notification-item-time">
              <RelativeTime date={new Date(entry.createdAt)} />
            </span>
          </span>
        </button>
        {!entry.read ? (
          <span className="notification-item-unread-dot" aria-hidden="true" />
        ) : null}
        <button
          type="button"
          className="notification-item-read-toggle"
          aria-label={personalizeText(
            entry.read ? 'Mark as unread' : 'Mark as read'
          )}
          onClick={this.onToggleRead}
        >
          <Octicon symbol={entry.read ? octicons.dotFill : octicons.check} />
        </button>
        <button
          type="button"
          className="notification-item-delete"
          aria-label={personalizeText('Delete notification')}
          onClick={this.onDelete}
        >
          <Octicon symbol={octicons.trash} />
        </button>
      </li>
    )
  }
}
