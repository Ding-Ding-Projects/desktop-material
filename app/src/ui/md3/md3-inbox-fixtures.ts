import { IMd3InboxNotification } from './md3-inbox-view'

/**
 * TEST AND PREVIEW DATA ONLY — never rendered by the shipping application.
 *
 * The MD3 design contract (`design/History MD3.dc.html`) illustrates the Inbox
 * with six invented notifications. They document the row shapes the view has to
 * handle — every tone, a mention, a read row, a muted row — so they live here
 * as a fixture for tests and previews rather than inside the component, where
 * they would become content the product ships.
 *
 * The real view takes its rows from the notification centre store through
 * `IMd3InboxViewProps.notifications`.
 */
export const md3InboxFixtureNotifications: ReadonlyArray<IMd3InboxNotification> =
  [
    {
      id: 'n1',
      title: 'CI passed on development',
      meta: 'Build and test · run 1481',
      source: 'material/desktop-material',
      icon: 'check_circle',
      tone: 'ok',
      time: '2m',
      createdAt: '2026-08-11T09:58:00.000Z',
      read: false,
      kindLabel: 'Build & run',
      externalUrl: 'https://example.invalid/runs/1481',
    },
    {
      id: 'n2',
      title: 'Review requested: MD3 shell',
      meta: 'Priya Raman on pull request #421',
      source: 'material/desktop-material',
      icon: 'rate_review',
      tone: 'info',
      time: '20m',
      createdAt: '2026-08-11T09:40:00.000Z',
      read: false,
      kindLabel: 'Pull request reviews',
      externalUrl: 'https://example.invalid/pull/421',
    },
    {
      id: 'n3',
      title: 'Workflow Package linux-tui failed',
      meta: 'feature/md3-shell · run 1480',
      source: 'material/linux-tui',
      icon: 'error',
      tone: 'bad',
      time: '1h',
      createdAt: '2026-08-11T09:00:00.000Z',
      read: false,
      kindLabel: 'Failed checks',
    },
    {
      id: 'n4',
      title: 'origin/development updated',
      meta: '4 new commits available to pull',
      source: 'material/desktop-material',
      icon: 'sync',
      tone: 'info',
      time: '3h',
      createdAt: '2026-08-11T07:00:00.000Z',
      read: true,
      kindLabel: 'Automatic pulls',
    },
    {
      id: 'n5',
      title: 'Mention in discussion: token naming',
      meta: 'Jonas Weber mentioned you',
      source: 'material/desktop-material',
      icon: 'alternate_email',
      tone: 'info',
      time: 'Yesterday',
      createdAt: '2026-08-10T14:12:00.000Z',
      read: false,
      mention: true,
      kindLabel: 'Information',
      muted: true,
    },
    {
      id: 'n6',
      title: 'Tag v2.14.0 pushed',
      meta: 'Marek Novak · main',
      source: 'material/desktop-material',
      icon: 'sell',
      tone: 'ok',
      time: 'Yesterday',
      createdAt: '2026-08-10T11:30:00.000Z',
      read: true,
      kindLabel: 'Information',
    },
  ]
