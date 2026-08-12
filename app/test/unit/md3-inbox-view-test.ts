import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  filterMd3InboxNotifications,
  md3InboxBulkPartitions,
  md3InboxDetailLine,
  md3InboxExportRecord,
  md3InboxFiltersActive,
  md3InboxIsMention,
  md3InboxToneWord,
  IMd3InboxNotification,
  Md3InboxExportColumns,
  Md3InboxExportSpec,
  Md3InboxFilter,
} from '../../src/ui/md3/md3-inbox-view'
import { md3InboxFixtureNotifications } from '../../src/ui/md3/md3-inbox-fixtures'
import {
  Md3ListExportFormat,
  Md3ListExportRecord,
  serializeMd3ListExport,
} from '../../src/ui/md3/md3-list-export'
import { md3BulkPartitionSummary } from '../../src/ui/md3/md3-list-selection'

const ViewSource = join(
  __dirname,
  '..',
  '..',
  'src',
  'ui',
  'md3',
  'md3-inbox-view.tsx'
)

/** Serialize through the shared writer with the Inbox's own declared spec. */
const serialize = (
  records: ReadonlyArray<Md3ListExportRecord>,
  format: Md3ListExportFormat
) =>
  serializeMd3ListExport(records, Md3InboxExportSpec, format, {
    scope: `${records.length} rows`,
  })

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
    const json = serialize(records, 'json')
    assert.equal(json.filename, 'notifications.json')
    assert.equal(json.count, 6)
    assert.deepEqual(JSON.parse(json.content).notifications, records)

    const csv = serialize(records, 'csv')
    // One header row plus one row per notification, plus the trailing newline.
    assert.equal(csv.content.trimEnd().split('\n').length, 7)
    assert.ok(csv.content.startsWith('"id","title"'))

    const jsonl = serialize(records, 'jsonl')
    // The header line naming the scope and schema, then one line per row.
    assert.equal(jsonl.content.trimEnd().split('\n').length, 7)

    const xml = serialize(records, 'xml')
    assert.ok(xml.content.includes('<title>Tag v2.14.0 pushed</title>'))
  })

  it('escapes a delimiter-bearing value rather than splitting the row', () => {
    const record = md3InboxExportRecord({
      ...find('n1'),
      title: 'A "quoted", comma-bearing title',
    })
    const csv = serialize([record], 'csv')
    assert.ok(csv.content.includes('"A ""quoted"", comma-bearing title"'))
    assert.equal(csv.content.trimEnd().split('\n').length, 2)
  })
})

/**
 * The bulk wiring.
 *
 * The selection algebra, the serializer and the bar are shared and already
 * tested; what is asserted here is this view's own use of them — the ids the
 * bar is handed, the flag that decides what its select-all claims, the
 * eligibility splits behind each verb, and the schema the export declares.
 */
describe('Md3InboxView bulk wiring', () => {
  it('offers the bar only the ids the query and the chips left', () => {
    const failures = filterWith(['failures'])
    const ids = failures.visible.map(entry => entry.id)
    assert.ok(
      ids.length > 0 && ids.length < md3InboxFixtureNotifications.length
    )
    assert.ok(
      failures.visible.every(entry => entry.tone === 'bad'),
      'a chip-filtered id list must not carry a row the chip hides'
    )

    const queried = filterWith([], 'Tag')
    assert.deepEqual(
      queried.visible.map(entry => entry.id),
      md3InboxFixtureNotifications
        .filter(entry => entry.title.includes('Tag'))
        .map(entry => entry.id)
    )
  })

  it('reports the list as filtered exactly when something narrows it', () => {
    assert.equal(
      md3InboxFiltersActive({ query: '', filters: noFilters }),
      false
    )
    assert.equal(
      md3InboxFiltersActive({ query: '   ', filters: noFilters }),
      false,
      'whitespace alone narrows nothing, so the select-all must not claim it does'
    )
    assert.equal(
      md3InboxFiltersActive({ query: 'tag', filters: noFilters }),
      true
    )
    assert.equal(
      md3InboxFiltersActive({ query: '', filters: new Set(['unread']) }),
      true,
      'a chip narrows the list even with an empty query'
    )
  })

  it('excludes from each verb exactly the rows it cannot change', () => {
    const rows = md3InboxFixtureNotifications
    const { markable, unmarkable, mutable, unmutable } =
      md3InboxBulkPartitions(rows)

    assert.ok(markable.applied.every(entry => !entry.read))
    assert.ok(markable.excluded.every(entry => entry.read))
    assert.equal(
      markable.applied.length + markable.excluded.length,
      rows.length
    )

    assert.ok(unmarkable.applied.every(entry => entry.read))
    assert.ok(mutable.applied.every(entry => entry.muted !== true))
    assert.ok(unmutable.applied.every(entry => entry.muted === true))

    // The reason travels with the exclusion, so the toast and the count
    // describe the same set rather than the preview promising more.
    assert.ok(markable.excluded.length === 0 || markable.reason !== null)
    assert.equal(
      md3BulkPartitionSummary(md3InboxBulkPartitions(rows).markable) === null,
      markable.excluded.length === 0
    )
  })

  it('declares every column its export record carries, and no other', () => {
    const record = md3InboxExportRecord(find('n5'))
    assert.deepEqual(
      Md3InboxExportColumns.map(column => column.name),
      Object.keys(record),
      'a field written without a declared column is a field no reader of the file can name'
    )
    for (const column of Md3InboxExportColumns) {
      assert.ok(
        record[column.name] !== undefined,
        `the export record is missing the declared column ${column.name}`
      )
    }
  })

  it('writes every declared column into the file itself', () => {
    const csv = serialize([md3InboxExportRecord(find('n5'))], 'csv')
    for (const column of Md3InboxExportColumns) {
      assert.ok(
        csv.content.includes(`"${column.name}"`),
        `${column.name} is declared but never written`
      )
    }
    // Nothing in this schema is multiline, so no format drops anything.
    assert.equal(csv.loss, null)
  })

  it('routes the bulk delete through the destructive gate and nothing else', () => {
    const source = readFileSync(ViewSource, 'utf8')

    // Anchored on the bulk verb's own label rather than on `id: 'delete'`,
    // which the row menu also carries — a slice that silently started at the
    // wrong action would pass or fail for reasons unrelated to the bar.
    const labelAt = source.indexOf("label: t('md3.inbox.bulkDelete')")
    assert.ok(labelAt > 0, 'the bar must still offer a bulk delete')
    const deleteAction = source.slice(labelAt, labelAt + 400)
    assert.ok(
      deleteAction.includes('onClick: onRequestBulkDelete'),
      'the bulk delete must request the gate rather than deleting directly'
    )
    assert.ok(
      deleteAction.includes('destructive: true'),
      'the bulk delete must paint the error role'
    )
    assert.ok(
      deleteAction.includes("hasPopup: 'dialog'"),
      'the bulk delete opens the gate, and must say so to assistive technology'
    )
    assert.ok(
      source.includes('<Md3DestructiveGate'),
      'the gate itself must be rendered'
    )
    // The only route to the store's bulk delete is the gate's confirmation:
    // `onRequestBulkDelete` opens it and `onConfirmBulkDelete` acts.
    assert.ok(
      source.includes('const onRequestBulkDelete') &&
        source.includes('setGateOpen(true)')
    )
    assert.ok(
      source.includes('onConfirm={onConfirmBulkDelete}'),
      'the gate must call the confirming handler, not the requesting one'
    )
  })
})
