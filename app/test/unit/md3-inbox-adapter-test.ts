import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3InboxNotifications,
  md3NotificationKindLabel,
  md3NotificationSourceName,
  md3NotificationThreadKey,
} from '../../src/ui/md3/md3-destination-adapters'
import {
  applyNotificationThreadMute,
  MutedNotificationThreadCap,
} from '../../src/ui/md3/md3-inbox-controller'
import { md3InboxDetailLine } from '../../src/ui/md3/md3-inbox-view'
import {
  INotificationEntry,
  NotificationCentreKind,
} from '../../src/models/notification-centre'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { Owner } from '../../src/models/owner'

/**
 * The Inbox destination's ADAPTER — the seam between the real notification
 * centre and `Md3InboxView`.
 *
 * `md3-inbox-view-test.ts` asserts the view's derivations against
 * `md3-inbox-fixtures.ts`, and those fixtures are already the shape the
 * contract specifies: `source: 'material/desktop-material'`, `kindLabel:
 * 'Failed checks'`. That makes them structurally incapable of catching an
 * adapter that hands the view a bare folder name or a raw `pr-checks-failed`
 * slug — every value is the right type, and the view renders it without
 * complaint. So the mapping from real `INotificationEntry` objects is asserted
 * here instead, against the contract's own literals.
 */

const endpoint = 'https://api.github.com'

const gitHubRepository = new Repository(
  '/code/desktop-material',
  1,
  new GitHubRepository(
    'desktop-material',
    new Owner('material', endpoint, 42),
    7
  ),
  false
)

const localOnlyRepository = new Repository('/code/notes', 2, null, false)

const entry = (
  overrides: Partial<INotificationEntry> = {}
): INotificationEntry => ({
  id: 'n1',
  kind: 'build-run',
  title: 'CI passed on development',
  body: 'Build and test · run 1481',
  createdAt: '2026-08-11T09:58:00.000Z',
  read: false,
  repositoryId: 1,
  ...overrides,
})

const names = new Map<number, string>([
  [1, md3NotificationSourceName(gitHubRepository)],
  [2, md3NotificationSourceName(localOnlyRepository)],
])

const map = (
  entries: ReadonlyArray<INotificationEntry>,
  extra: {
    readonly mutedThreads?: ReadonlySet<string>
    readonly now?: number
  } = {}
) =>
  md3InboxNotifications({
    notifications: entries,
    repositoryNames: names,
    ...extra,
  })

/** Every kind the notification centre can produce, so none is left unmapped. */
const AllKinds: ReadonlyArray<NotificationCentreKind> = [
  'pr-review-submit',
  'pr-comment',
  'pr-checks-failed',
  'app-error',
  'clone-batch',
  'auto-commit',
  'merge-all',
  'auto-pull',
  'cheap-lfs',
  'build-run',
  'info',
]

describe('md3 inbox adapter', () => {
  describe('source', () => {
    it('names a GitHub repository owner/repo, as the contract detail line does', () => {
      assert.equal(
        md3NotificationSourceName(gitHubRepository),
        'material/desktop-material'
      )
    })

    it('renders the contract detail line from a real notification entry', () => {
      // The contract's own first row: a successful run on a GitHub repository.
      const [row] = map([entry({ kind: 'auto-commit' })])
      assert.equal(
        md3InboxDetailLine(row),
        'material/desktop-material · unread · success'
      )
      assert.equal(row.tone, 'ok')
    })

    it('carries the source through every tone', () => {
      const [row] = map([entry({ kind: 'pr-checks-failed' })])
      assert.equal(
        md3InboxDetailLine(row),
        'material/desktop-material · unread · failure'
      )
    })

    it('falls back to the folder name when there is no GitHub repository', () => {
      assert.equal(md3NotificationSourceName(localOnlyRepository), 'notes')
      const [row] = map([entry({ repositoryId: 2 })])
      assert.equal(row.source, 'notes')
    })

    it('names a cloning repository by its own name', () => {
      const cloning = new CloningRepository(
        '/code/incoming',
        'https://github.com/material/incoming.git'
      )
      assert.equal(md3NotificationSourceName(cloning), cloning.name)
    })

    it('omits the source entirely when the entry is about no repository', () => {
      const [row] = map([entry({ repositoryId: undefined })])
      assert.equal(row.source, undefined)
      assert.equal(md3InboxDetailLine(row), 'unread · info')
    })
  })

  describe('kind label', () => {
    it('never hands the view the machine slug', () => {
      for (const kind of AllKinds) {
        const label = md3NotificationKindLabel(kind)
        assert.notEqual(label, kind, `${kind} is still rendering its own slug`)
        assert.ok(label.length > 0, `${kind} has no label`)
        assert.ok(
          !label.includes('-'),
          `${kind} label "${label}" still looks like an identifier`
        )
      }
    })

    it('puts the label on the row rather than the kind', () => {
      const [row] = map([entry({ kind: 'pr-checks-failed' })])
      assert.equal(row.kindLabel, 'Failed checks')
    })
  })

  describe('time', () => {
    it('renders a relative time for a real instant', () => {
      const now = Date.parse('2026-08-11T10:00:00.000Z')
      const [row] = map([entry()], { now })
      assert.equal(row.time, '2 minutes ago')
    })

    it('says the time is unknown rather than printing the raw timestamp', () => {
      const [row] = map([entry({ createdAt: 'not-a-timestamp' })])
      assert.equal(row.time, 'unknown time')
      assert.notEqual(row.time, 'not-a-timestamp')
      // The cell the contract sizes for "2m" must never receive a full
      // ISO-8601 string, which is what the old fallback put there.
      assert.ok(row.time.length < 20)
    })

    it('keeps the exact timestamp for assistive technology and exports', () => {
      const [row] = map([entry({ createdAt: 'not-a-timestamp' })])
      assert.equal(row.createdAt, 'not-a-timestamp')
    })
  })

  describe('muting', () => {
    it('keys a thread by its URL when it has one', () => {
      const key = md3NotificationThreadKey(
        entry({
          action: {
            kind: 'open-pull-request',
            url: 'https://x.invalid/pull/1',
          },
        })
      )
      assert.equal(key, 'url:https://x.invalid/pull/1')
    })

    it('gives two events about one subject the same key', () => {
      const first = entry({ id: 'a' })
      const second = entry({ id: 'b', createdAt: '2026-08-11T11:00:00.000Z' })
      assert.equal(
        md3NotificationThreadKey(first),
        md3NotificationThreadKey(second)
      )
    })

    it('separates threads by repository', () => {
      assert.notEqual(
        md3NotificationThreadKey(entry({ repositoryId: 1 })),
        md3NotificationThreadKey(entry({ repositoryId: 2 }))
      )
    })

    it('marks a row muted when its thread is muted', () => {
      const rows = map(
        [entry({ id: 'a' }), entry({ id: 'b', title: 'Other' })],
        {
          mutedThreads: new Set([md3NotificationThreadKey(entry({ id: 'a' }))]),
        }
      )
      assert.equal(rows[0].muted, true)
      assert.equal(rows[1].muted, false)
    })

    it('leaves every row unmuted when nothing is muted', () => {
      const [row] = map([entry()])
      assert.equal(row.muted, false)
    })

    it('adds, removes and caps muted threads', () => {
      assert.deepEqual(applyNotificationThreadMute([], 'a', true), ['a'])
      assert.deepEqual(applyNotificationThreadMute(['a'], 'a', true), ['a'])
      assert.deepEqual(applyNotificationThreadMute(['a', 'b'], 'a', false), [
        'b',
      ])
      const full = Array.from({ length: 3 }, (_, index) => `k${index}`)
      assert.deepEqual(applyNotificationThreadMute(full, 'k3', true, 3), [
        'k1',
        'k2',
        'k3',
      ])
      assert.ok(MutedNotificationThreadCap > 0)
    })
  })

  describe('carried-over row fields', () => {
    it('maps the body onto the meta line and keeps read state', () => {
      const [row] = map([entry({ read: true })])
      assert.equal(row.meta, 'Build and test · run 1481')
      assert.equal(row.read, true)
      assert.equal(
        md3InboxDetailLine(row),
        'material/desktop-material · read · info'
      )
    })

    it('offers an external URL only for a link action', () => {
      const [linked] = map([
        entry({ action: { kind: 'open-url', url: 'https://x.invalid/run' } }),
      ])
      assert.equal(linked.externalUrl, 'https://x.invalid/run')

      const [repositoryAction] = map([
        entry({ action: { kind: 'open-repository', repositoryId: 1 } }),
      ])
      assert.equal(repositoryAction.externalUrl, undefined)
    })

    it('treats a pull-request comment as a mention', () => {
      const [row] = map([entry({ kind: 'pr-comment' })])
      assert.equal(row.mention, true)
      assert.equal(row.icon, 'alternate_email')
    })
  })
})
