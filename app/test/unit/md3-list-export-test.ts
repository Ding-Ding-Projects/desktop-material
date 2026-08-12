import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  IMd3ListExportColumn,
  Md3ListExportFormat,
  Md3ListExportFormats,
  md3ListExportDescriptor,
  md3ListExportLoss,
  md3ListExportSchema,
  serializeMd3ListExport,
} from '../../src/ui/md3/md3-list-export'

/**
 * The one export serializer every MD3 list uses.
 *
 * Two properties matter more than the exact bytes and are asserted first: no
 * format silently drops a declared field, and the one thing a row-oriented
 * format genuinely cannot carry — a line break — is declared before the
 * export runs rather than discovered later in the file.
 */

const columns: ReadonlyArray<IMd3ListExportColumn> = [
  { name: 'id' },
  { name: 'title' },
  { name: 'body', multiline: true },
  { name: 'count' },
  { name: 'done' },
]

const spec = {
  columns,
  collectionName: 'rows',
  recordName: 'row',
  title: 'Rows',
  baseName: 'rows',
}

const records = [
  {
    id: 'r1',
    title: 'A "quoted", comma, thing',
    body: 'first line\nsecond line',
    count: 12,
    done: true,
  },
  {
    id: 'r2',
    title: "it's <b>markup</b> & a pipe |",
    body: 'one line',
    count: 0,
    done: false,
  },
]

const run = (format: Md3ListExportFormat) =>
  serializeMd3ListExport(records, spec, format, { scope: '2 selected rows' })

describe('md3 list export', () => {
  it('offers every format a list can faithfully write', () => {
    assert.deepEqual(
      Md3ListExportFormats.map(entry => entry.format),
      [
        'json',
        'jsonl',
        'yaml',
        'toml',
        'xml',
        'csv',
        'tsv',
        'markdown',
        'html',
        'sql',
      ]
    )
    for (const descriptor of Md3ListExportFormats) {
      assert.ok(descriptor.label.length > 0, `${descriptor.format} needs a name`)
      assert.ok(
        !descriptor.extension.startsWith('.'),
        `${descriptor.format}'s extension must not carry its own dot`
      )
      assert.match(descriptor.mimeType, /\//)
    }
  })

  it('refuses a format nobody declared', () => {
    assert.throws(
      () => md3ListExportDescriptor('parquet' as Md3ListExportFormat),
      /parquet/
    )
  })

  it('names exactly the fields a row format would flatten', () => {
    assert.equal(md3ListExportLoss(columns, 'json'), null)
    assert.equal(md3ListExportLoss(columns, 'xml'), null)
    assert.equal(md3ListExportLoss(columns, 'sql'), null)

    for (const format of ['csv', 'tsv', 'markdown'] as const) {
      const loss = md3ListExportLoss(columns, format)
      assert.ok(loss !== null, `${format} flattens line breaks and must say so`)
      assert.match(loss, /body/)
      assert.ok(
        !loss.includes('title'),
        'only the multiline columns are at risk; naming an unaffected column ' +
          'trains the reader to ignore the warning'
      )
    }
  })

  it('warns about nothing when no column can hold a line break', () => {
    const flat: ReadonlyArray<IMd3ListExportColumn> = [
      { name: 'id' },
      { name: 'name' },
    ]
    for (const descriptor of Md3ListExportFormats) {
      assert.equal(md3ListExportLoss(flat, descriptor.format), null)
    }
  })

  it('states the encoding and every field of the schema', () => {
    const schema = md3ListExportSchema(columns)
    assert.match(schema, /UTF-8/)
    for (const column of columns) {
      assert.match(
        schema,
        new RegExp(column.name),
        `the schema line must name ${column.name}`
      )
    }
  })

  it('writes every declared field in every format', () => {
    for (const descriptor of Md3ListExportFormats) {
      const payload = run(descriptor.format)
      assert.equal(payload.count, 2)
      assert.equal(payload.filename, `rows.${descriptor.extension}`)
      assert.equal(payload.mimeType, descriptor.mimeType)
      for (const column of columns) {
        assert.ok(
          payload.content.includes(column.name),
          `${descriptor.format} dropped the "${column.name}" field entirely`
        )
      }
      assert.ok(
        payload.content.includes('r1') && payload.content.includes('r2'),
        `${descriptor.format} dropped a record`
      )
      assert.ok(
        !payload.content.includes('\r'),
        `${descriptor.format} must write LF line endings`
      )
    }
  })

  it('carries the loss on the result so a toast can repeat it', () => {
    assert.equal(run('json').loss, null)
    const csv = run('csv')
    assert.ok(csv.loss !== null)
    assert.match(csv.loss, /body/)
  })

  it('round-trips through JSON with every value intact', () => {
    const parsed = JSON.parse(run('json').content)
    assert.deepEqual(parsed.rows, records)
    assert.deepEqual(parsed.schema, [
      'id',
      'title',
      'body',
      'count',
      'done',
    ])
    assert.equal(parsed.scope, '2 selected rows')
  })

  it('writes one record per line in JSONL, after a schema line', () => {
    const lines = run('jsonl').content.trimEnd().split('\n')
    assert.equal(lines.length, 3)
    assert.deepEqual(JSON.parse(lines[0]).schema, [
      'id',
      'title',
      'body',
      'count',
      'done',
    ])
    assert.deepEqual(JSON.parse(lines[1]), records[0])
    assert.deepEqual(JSON.parse(lines[2]), records[1])
  })

  it('quotes a delimited cell and flattens its line breaks', () => {
    const lines = run('csv').content.trimEnd().split('\n')
    assert.equal(
      lines.length,
      3,
      'a raw newline inside a value would end the record early and produce ' +
        'more lines than there are records'
    )
    assert.equal(lines[0], '"id","title","body","count","done"')
    assert.ok(lines[1].includes('"A ""quoted"", comma, thing"'))
    assert.ok(lines[1].includes('"first line second line"'))

    const tsv = run('tsv').content.trimEnd().split('\n')
    assert.equal(tsv.length, 3)
    assert.ok(tsv[0].includes('\t'))
  })

  it('escapes markup rather than emitting it', () => {
    const xml = run('xml').content
    assert.ok(xml.includes('&lt;b&gt;markup&lt;/b&gt;'))
    assert.ok(!xml.includes('<b>markup</b>'))

    const html = run('html').content
    assert.ok(html.includes('&lt;b&gt;markup&lt;/b&gt;'))
    assert.ok(html.startsWith('<!doctype html>'))
  })

  it('escapes a pipe so a Markdown table keeps its columns', () => {
    const rows = run('markdown')
      .content.split('\n')
      .filter(line => line.startsWith('| r'))
    assert.equal(rows.length, 2)
    assert.ok(rows[1].includes('\\|'))
    // The header, the divider and two records — five cells each, no more.
    assert.equal(rows[1].split(/(?<!\\)\|/).length - 2, 5)
  })

  it('doubles a quote in SQL rather than ending the literal', () => {
    const sql = run('sql').content
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "rows"'))
    assert.ok(sql.includes("'it''s <b>markup</b> & a pipe |'"))
    assert.ok(sql.includes('TRUE'))
    assert.ok(sql.includes('FALSE'))
    // A number stays a number rather than becoming a quoted string.
    assert.ok(sql.includes(', 12, '))
  })

  it('keeps YAML and TOML values quoted so a colon cannot restructure them', () => {
    const yaml = run('yaml').content
    assert.ok(yaml.includes('rows:'))
    assert.ok(yaml.includes('body: "first line\\nsecond line"'))
    assert.ok(yaml.includes('count: 12'))

    const toml = run('toml').content
    assert.ok(toml.includes('[[rows]]'))
    assert.ok(toml.includes('done = false'))
  })

  it('writes the scope and the schema into the file itself', () => {
    for (const format of ['yaml', 'toml', 'xml', 'markdown', 'html', 'sql'] as const) {
      const content = run(format).content
      assert.ok(
        content.includes('2 selected rows'),
        `${format} must state what was exported`
      )
      assert.ok(
        content.includes('UTF-8'),
        `${format} must state its encoding`
      )
    }
  })

  it('writes an empty collection without inventing a record', () => {
    for (const descriptor of Md3ListExportFormats) {
      const payload = serializeMd3ListExport([], spec, descriptor.format, {
        scope: 'no rows',
      })
      assert.equal(payload.count, 0)
      assert.ok(!payload.content.includes('r1'))
    }
    assert.deepEqual(
      JSON.parse(
        serializeMd3ListExport([], spec, 'json', { scope: 'no rows' }).content
      ).rows,
      []
    )
  })

  it('leaves an absent value empty rather than writing the word undefined', () => {
    const payload = serializeMd3ListExport(
      [{ id: 'r3' }],
      spec,
      'csv',
      { scope: 'one row' }
    )
    assert.ok(!payload.content.includes('undefined'))
    assert.ok(payload.content.includes('"r3","","","",""'))

    const sql = serializeMd3ListExport([{ id: 'r3' }], spec, 'sql', {
      scope: 'one row',
    })
    assert.ok(
      sql.content.includes('NULL'),
      'SQL distinguishes an absent value from an empty string, and must'
    )
  })
})
