import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  filterMd3InboxNotifications,
  md3InboxDetailLine,
  md3InboxExportRecord,
  md3InboxIsMention,
  md3InboxToneWord,
  IMd3InboxNotification,
  Md3InboxFilter,
} from '../../src/ui/md3/md3-inbox-view'
import { md3InboxFixtureNotifications } from '../../src/ui/md3/md3-inbox-fixtures'
import { serializeMd3InboxExport } from '../../src/ui/md3/md3-inbox-export'

/**
 * The Inbox destination's pure derivations.
 *
 * Every assertion starts from the design contract's own literals — the
 * `isInbox` branch of `design/History MD3.dc.html` and its `inboxRows`
 * mapping — so a row that stops rendering the shape the contract specified
 * fails rather than merely looking different.
 */

const find = (id: string): IMd3InboxNotification => {
  const row = md3InboxFixtureNotifications.find(entry => entry.id === id)
  assert.ok(row !== undefined, `fixture ${id} is missing`)
  return row
}

const noFilters = new Set<Md3InboxFilter>()

const filterWith = (
  filters: ReadonlyArray<Md3InboxFilter>,
  query = '',
  regexEnabled = false
) =>
  filterMd3InboxNotifications(md3InboxFixtureNotifications, {
    query,
    regexEnabled,
    caseSensitive: false,
    filters: new Set(filters),
  })

describe('md3 inbox view', () => {
  it('renders the contract detail line', () => {
    assert.equal(
      md3InboxDetailLine(find('n1')),
      'material/desktop-material · unread · success'
    )
    assert.equal(
      md3InboxDetailLine(find('n4')),
      'material/desktop-material · read · info'
    )
    assert.equal(
      md3InboxDetailLine(find('n3')),
      'material/linux-tui · unread · failure'
    )
  })

  it('drops the source segment when a notification has no repository', () => {
    const orphan: IMd3InboxNotification = { ...find('n1'), source: undefined }
    assert.equal(md3InboxDetailLine(orphan), 'unread · success')
  })

  it('maps every tone the way the contract renames it', () => {
    assert.equal(md3InboxToneWord('ok'), 'success')
    assert.equal(md3InboxToneWord('bad'), 'failure')
    assert.equal(md3InboxToneWord('info'), 'info')
  })

  it('treats the alternate_email glyph as a mention by default', () => {
    assert.equal(md3InboxIsMention(find('n5')), true)
    assert.equal(md3InboxIsMention(find('n1')), false)
  })

  it('lets a caller override the mention rule', () => {
    const explicit: IMd3InboxNotification = { ...find('n1'), mention: true }
    assert.equal(md3InboxIsMention(explicit), true)
  })

  it('shows everything when nothing is filtered', () => {
    assert.equal(filterWith([]).visible.length, 6)
  })

  it('filters to unread, failures and mentions', () => {
    assert.deepEqual(
      filterWith(['unread']).visible.map(entry => entry.id),
      ['n1', 'n2', 'n3', 'n5']
    )
    assert.deepEqual(
      filterWith(['failures']).visible.map(entry => entry.id),
      ['n3']
    )
    assert.deepEqual(
      filterWith(['mentions']).visible.map(entry => entry.id),
      ['n5']
    )
  })

  it('composes chips rather than letting one override another', () => {
    assert.deepEqual(
      filterWith(['unread', 'failures']).visible.map(entry => entry.id),
      ['n3']
    )
    assert.deepEqual(
      filterWith(['failures', 'mentions']).visible.map(entry => entry.id),
      []
    )
  })

  it('matches the title, the meta, the repository and the kind', () => {
    assert.deepEqual(
      filterWith([], 'linux-tui').visible.map(entry => entry.id),
      ['n3']
    )
    assert.deepEqual(
      filterWith([], 'Priya').visible.map(entry => entry.id),
      ['n2']
    )
    assert.deepEqual(
      filterWith([], 'Failed checks').visible.map(entry => entry.id),
      ['n3']
    )
  })

  it('reads the query as a regular expression only in regex mode', () => {
    assert.deepEqual(
      filterWith([], '^Tag v2', true).visible.map(entry => entry.id),
      ['n6']
    )
    assert.deepEqual(
      filterWith([], '^Tag v2', false).visible.map(entry => entry.id),
      []
    )
  })

  it('leaves the list unfiltered and reports an unfinished pattern', () => {
    const result = filterWith([], '(unclosed', true)
    assert.equal(result.patternInvalid, true)
    assert.equal(result.visible.length, md3InboxFixtureNotifications.length)
  })

  it('never reports an invalid pattern in plain-text mode', () => {
    const result = filterWith([], '(unclosed', false)
    assert.equal(result.patternInvalid, false)
  })

  it('does not filter on an empty query', () => {
    assert.equal(
      filterMd3InboxNotifications(md3InboxFixtureNotifications, {
        query: '   ',
        regexEnabled: true,
        caseSensitive: false,
        filters: noFilters,
      }).visible.length,
      6
    )
  })

  it('flattens a row into an export record without dropping a field', () => {
    const record = md3InboxExportRecord(find('n5'))
    assert.deepEqual(record, {
      id: 'n5',
      title: 'Mention in discussion: token naming',
      meta: 'Jonas Weber mentioned you',
      source: 'material/desktop-material',
      tone: 'info',
      state: 'unread',
      kind: 'Information',
      time: 'Yesterday',
      createdAt: '2026-08-10T14:12:00.000Z',
      read: false,
      muted: true,
    })
  })

  it('serializes every offered format with the same rows', () => {
    const records = md3InboxFixtureNotifications.map(md3InboxExportRecord)
    const json = serializeMd3InboxExport(records, 'json', { scope: '6 rows' })
    assert.equal(json.filename, 'notifications.json')
    assert.equal(json.count, 6)
    assert.deepEqual(JSON.parse(json.content).notifications, records)

    const csv = serializeMd3InboxExport(records, 'csv', { scope: '6 rows' })
    // One header row plus one row per notification, plus the trailing newline.
    assert.equal(csv.content.trimEnd().split('\n').length, 7)
    assert.ok(csv.content.startsWith('"id","title"'))

    const jsonl = serializeMd3InboxExport(records, 'jsonl', { scope: '6 rows' })
    assert.equal(jsonl.content.trimEnd().split('\n').length, 6)

    const xml = serializeMd3InboxExport(records, 'xml', { scope: '6 rows' })
    assert.ok(xml.content.includes('<title>Tag v2.14.0 pushed</title>'))
  })

  it('escapes a delimiter-bearing value rather than splitting the row', () => {
    const record = md3InboxExportRecord({
      ...find('n1'),
      title: 'A "quoted", comma-bearing title',
    })
    const csv = serializeMd3InboxExport([record], 'csv', { scope: '1 row' })
    assert.ok(csv.content.includes('"A ""quoted"", comma-bearing title"'))
    assert.equal(csv.content.trimEnd().split('\n').length, 2)
  })
})
