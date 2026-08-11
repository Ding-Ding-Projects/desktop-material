/**
 * Export serializers for the MD3 Inbox destination.
 *
 * A notification is a flat record of scalars — id, title, meta, source,
 * tone, state, kind, relative and absolute time, read and muted flags — so
 * every format below can carry the whole record without dropping a field.
 * That is why no format here warns about loss: there is none. A future field
 * that some format genuinely cannot represent must add that warning rather
 * than being written out silently truncated.
 *
 * Nothing in this module touches the filesystem. `serializeMd3InboxExport`
 * returns the bytes and a suggested filename, and the host decides where they
 * land — which is what keeps the view itself free of IO.
 */

/** Every format the Inbox can write. */
export type Md3InboxExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'

/** One notification, flattened for export. */
export interface IMd3InboxExportRecord {
  readonly id: string
  readonly title: string
  readonly meta: string
  /** `owner/repo`, or an empty string when the notification is not scoped. */
  readonly source: string
  /** `success`, `failure` or `info` — the detail line's third segment. */
  readonly tone: string
  /** `read` or `unread` — the detail line's second segment. */
  readonly state: string
  /** The notification's human-readable kind, or an empty string. */
  readonly kind: string
  /** The relative time exactly as the row renders it ("2m", "Yesterday"). */
  readonly time: string
  /** ISO-8601, so an export is still sortable after it leaves the app. */
  readonly createdAt: string
  readonly read: boolean
  readonly muted: boolean
}

/** A described format, for building the export picker. */
export interface IMd3InboxExportFormatDescriptor {
  readonly format: Md3InboxExportFormat
  /** The format's own name. Not translated: `CSV` is `CSV` in every locale. */
  readonly label: string
  /** Without the leading dot. */
  readonly extension: string
  readonly mimeType: string
}

/** The formats offered, in the order the picker lists them. */
export const Md3InboxExportFormats: ReadonlyArray<IMd3InboxExportFormatDescriptor> =
  [
    {
      format: 'json',
      label: 'JSON',
      extension: 'json',
      mimeType: 'application/json',
    },
    {
      format: 'jsonl',
      label: 'JSONL',
      extension: 'jsonl',
      mimeType: 'application/x-ndjson',
    },
    { format: 'yaml', label: 'YAML', extension: 'yaml', mimeType: 'text/yaml' },
    {
      format: 'toml',
      label: 'TOML',
      extension: 'toml',
      mimeType: 'text/plain',
    },
    {
      format: 'xml',
      label: 'XML',
      extension: 'xml',
      mimeType: 'application/xml',
    },
    { format: 'csv', label: 'CSV', extension: 'csv', mimeType: 'text/csv' },
    {
      format: 'tsv',
      label: 'TSV',
      extension: 'tsv',
      mimeType: 'text/tab-separated-values',
    },
    {
      format: 'markdown',
      label: 'Markdown',
      extension: 'md',
      mimeType: 'text/markdown',
    },
    { format: 'html', label: 'HTML', extension: 'html', mimeType: 'text/html' },
  ]

/** The finished export, ready to be written or copied. */
export interface IMd3InboxExport {
  readonly format: Md3InboxExportFormat
  /** A suggested filename including its extension. */
  readonly filename: string
  readonly mimeType: string
  /** UTF-8 text with LF line endings. */
  readonly content: string
  readonly count: number
  /**
   * A one-line, human-readable description of what was exported — the active
   * filter or the selection — written into the file's own header wherever the
   * format has somewhere to put a comment.
   */
  readonly scope: string
}

export interface IMd3InboxExportOptions {
  /** Describes the exported set, e.g. "12 selected notifications". */
  readonly scope: string
  /** Defaults to `notifications`. */
  readonly baseName?: string
}

const Columns: ReadonlyArray<keyof IMd3InboxExportRecord> = [
  'id',
  'title',
  'meta',
  'source',
  'kind',
  'state',
  'tone',
  'time',
  'createdAt',
  'read',
  'muted',
]

function cell(
  record: IMd3InboxExportRecord,
  column: keyof IMd3InboxExportRecord
): string {
  const value = record[column]
  return typeof value === 'boolean' ? String(value) : value
}

function quoteDelimited(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function delimited(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  delimiter: string
): string {
  const header = Columns.map(quoteDelimited).join(delimiter)
  const rows = records.map(record =>
    Columns.map(column => quoteDelimited(cell(record, column))).join(delimiter)
  )
  return [header, ...rows].join('\n') + '\n'
}

/** Double-quoted with JSON's own escapes, which YAML and TOML both accept. */
function quoteScalar(value: string): string {
  return JSON.stringify(value)
}

function yaml(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  scope: string
): string {
  const lines = [`# ${scope}`, 'notifications:']
  for (const record of records) {
    let first = true
    for (const column of Columns) {
      const value = record[column]
      const rendered =
        typeof value === 'boolean' ? String(value) : quoteScalar(value)
      lines.push(`${first ? '  - ' : '    '}${column}: ${rendered}`)
      first = false
    }
  }
  if (records.length === 0) {
    lines.push('  []')
  }
  return lines.join('\n') + '\n'
}

function toml(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  scope: string
): string {
  const lines = [`# ${scope}`]
  for (const record of records) {
    lines.push('', '[[notifications]]')
    for (const column of Columns) {
      const value = record[column]
      const rendered =
        typeof value === 'boolean' ? String(value) : quoteScalar(value)
      lines.push(`${column} = ${rendered}`)
    }
  }
  return lines.join('\n') + '\n'
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xml(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  scope: string
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<notifications scope="${escapeXml(scope)}">`,
  ]
  for (const record of records) {
    lines.push('  <notification>')
    for (const column of Columns) {
      const value = record[column]
      const rendered =
        typeof value === 'boolean' ? String(value) : escapeXml(value)
      lines.push(`    <${column}>${rendered}</${column}>`)
    }
    lines.push('  </notification>')
  }
  lines.push('</notifications>')
  return lines.join('\n') + '\n'
}

/** Pipes and backslashes are the only characters that break a GFM table cell. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function markdown(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  scope: string
): string {
  const lines = [
    '# Notifications',
    '',
    scope,
    '',
    `| ${Columns.join(' | ')} |`,
    `| ${Columns.map(() => '---').join(' | ')} |`,
  ]
  for (const record of records) {
    lines.push(
      `| ${Columns.map(column => escapeMarkdownCell(cell(record, column))).join(
        ' | '
      )} |`
    )
  }
  return lines.join('\n') + '\n'
}

function html(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  scope: string
): string {
  const head = Columns.map(column => `<th scope="col">${column}</th>`).join('')
  const body = records
    .map(
      record =>
        `<tr>${Columns.map(
          column => `<td>${escapeXml(cell(record, column))}</td>`
        ).join('')}</tr>`
    )
    .join('\n')
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Notifications</title>',
    '</head>',
    '<body>',
    '<h1>Notifications</h1>',
    `<p>${escapeXml(scope)}</p>`,
    '<table>',
    `<thead><tr>${head}</tr></thead>`,
    `<tbody>\n${body}\n</tbody>`,
    '</table>',
    '</body>',
    '</html>',
  ].join('\n')
}

function describedBy(
  format: Md3InboxExportFormat
): IMd3InboxExportFormatDescriptor {
  const descriptor = Md3InboxExportFormats.find(
    entry => entry.format === format
  )
  if (descriptor === undefined) {
    throw new Error(`Unknown notification export format: ${format}`)
  }
  return descriptor
}

/**
 * Serialize notifications into one of {@link Md3InboxExportFormats}.
 *
 * The content is always UTF-8 with LF line endings, and every format writes
 * the same eleven fields, so a round trip through any of them preserves the
 * exported record.
 */
export function serializeMd3InboxExport(
  records: ReadonlyArray<IMd3InboxExportRecord>,
  format: Md3InboxExportFormat,
  options: IMd3InboxExportOptions
): IMd3InboxExport {
  const descriptor = describedBy(format)
  const scope = options.scope
  const baseName = options.baseName ?? 'notifications'

  let content: string
  switch (format) {
    case 'json':
      content =
        JSON.stringify({ scope, notifications: records }, null, 2) + '\n'
      break
    case 'jsonl':
      content = records.map(record => JSON.stringify(record)).join('\n') + '\n'
      break
    case 'yaml':
      content = yaml(records, scope)
      break
    case 'toml':
      content = toml(records, scope)
      break
    case 'xml':
      content = xml(records, scope)
      break
    case 'csv':
      content = delimited(records, ',')
      break
    case 'tsv':
      content = delimited(records, '\t')
      break
    case 'markdown':
      content = markdown(records, scope)
      break
    case 'html':
      content = html(records, scope)
      break
  }

  return {
    format,
    filename: `${baseName}.${descriptor.extension}`,
    mimeType: descriptor.mimeType,
    content,
    count: records.length,
    scope,
  }
}
