/**
 * Export serializers for the support-ticket desk.
 *
 * A ticket is a flat record of scalars plus a response count, so every format
 * below carries the whole record without dropping a field — which is why none
 * of them warns about loss. A future field some format genuinely cannot
 * represent must add that warning rather than being written out truncated.
 *
 * Nothing here touches the filesystem or the network. The serializer returns
 * the bytes and a suggested filename; the host decides where they land.
 */

import { ISupportTicket } from './support-tickets'

/** Every format the desk can write. */
export type SupportTicketExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'

/** One ticket, flattened for export. */
export interface ISupportTicketExportRecord {
  readonly number: string
  readonly category: string
  readonly severity: string
  readonly status: string
  readonly description: string
  readonly entryPoint: string
  /** ISO-8601. */
  readonly createdAt: string
  /** ISO-8601. */
  readonly updatedAt: string
  /** How many desk responses the ticket carries. */
  readonly responseCount: number
}

/** A described format, for building the export picker. */
export interface ISupportTicketExportFormatDescriptor {
  readonly format: SupportTicketExportFormat
  /** The format's own name. Not translated: `CSV` is `CSV` in every locale. */
  readonly label: string
  /** Without the leading dot. */
  readonly extension: string
  readonly mimeType: string
}

/** The formats offered, in the order the picker lists them. */
export const SupportTicketExportFormats: ReadonlyArray<ISupportTicketExportFormatDescriptor> =
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
    {
      format: 'html',
      label: 'HTML',
      extension: 'html',
      mimeType: 'text/html',
    },
  ]

/** The finished export, ready to be written or copied. */
export interface ISupportTicketExport {
  readonly format: SupportTicketExportFormat
  /** A suggested filename including its extension. */
  readonly filename: string
  readonly mimeType: string
  /** UTF-8 text with LF line endings. */
  readonly content: string
  readonly count: number
  /** A one-line description of what was exported — the selection or filter. */
  readonly scope: string
}

export interface ISupportTicketExportOptions {
  /** Describes the exported set, e.g. "3 selected tickets". */
  readonly scope: string
  /** Defaults to `support-tickets`. */
  readonly baseName?: string
}

const Columns: ReadonlyArray<keyof ISupportTicketExportRecord> = [
  'number',
  'category',
  'severity',
  'status',
  'entryPoint',
  'createdAt',
  'updatedAt',
  'responseCount',
  'description',
]

/** Flatten a ticket, taking already-localized labels from the caller. */
export function toSupportTicketExportRecord(
  ticket: ISupportTicket,
  labels: {
    readonly category: string
    readonly severity: string
    readonly status: string
    readonly entryPoint: string
  }
): ISupportTicketExportRecord {
  return {
    number: ticket.number,
    category: labels.category,
    severity: labels.severity,
    status: labels.status,
    entryPoint: labels.entryPoint,
    description: ticket.description,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    responseCount: ticket.responses.length,
  }
}

function cell(
  record: ISupportTicketExportRecord,
  column: keyof ISupportTicketExportRecord
): string {
  const value = record[column]
  return typeof value === 'number' ? String(value) : value
}

function quoteDelimited(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function delimited(
  records: ReadonlyArray<ISupportTicketExportRecord>,
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
  records: ReadonlyArray<ISupportTicketExportRecord>,
  scope: string
): string {
  const lines = [`# ${scope}`, 'tickets:']
  for (const record of records) {
    let first = true
    for (const column of Columns) {
      const value = record[column]
      const rendered =
        typeof value === 'number' ? String(value) : quoteScalar(value)
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
  records: ReadonlyArray<ISupportTicketExportRecord>,
  scope: string
): string {
  const lines = [`# ${scope}`]
  for (const record of records) {
    lines.push('', '[[tickets]]')
    for (const column of Columns) {
      const value = record[column]
      const rendered =
        typeof value === 'number' ? String(value) : quoteScalar(value)
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
  records: ReadonlyArray<ISupportTicketExportRecord>,
  scope: string
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<tickets scope="${escapeXml(scope)}">`,
  ]
  for (const record of records) {
    lines.push('  <ticket>')
    for (const column of Columns) {
      const value = record[column]
      const rendered =
        typeof value === 'number' ? String(value) : escapeXml(value)
      lines.push(`    <${column}>${rendered}</${column}>`)
    }
    lines.push('  </ticket>')
  }
  lines.push('</tickets>')
  return lines.join('\n') + '\n'
}

/** Pipes, backslashes and newlines are what break a GFM table cell. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function markdown(
  records: ReadonlyArray<ISupportTicketExportRecord>,
  scope: string
): string {
  const lines = [
    '# Support tickets',
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
  records: ReadonlyArray<ISupportTicketExportRecord>,
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
    '<title>Support tickets</title>',
    '</head>',
    '<body>',
    '<h1>Support tickets</h1>',
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
  format: SupportTicketExportFormat
): ISupportTicketExportFormatDescriptor {
  const descriptor = SupportTicketExportFormats.find(
    entry => entry.format === format
  )
  if (descriptor === undefined) {
    throw new Error(`Unknown support ticket export format: ${format}`)
  }
  return descriptor
}

/**
 * Serialize tickets into one of {@link SupportTicketExportFormats}.
 *
 * The content is always UTF-8 with LF line endings, and every format writes the
 * same nine fields, so a round trip through any of them preserves the record.
 */
export function serializeSupportTicketExport(
  records: ReadonlyArray<ISupportTicketExportRecord>,
  format: SupportTicketExportFormat,
  options: ISupportTicketExportOptions
): ISupportTicketExport {
  const descriptor = describedBy(format)
  const scope = options.scope
  const baseName = options.baseName ?? 'support-tickets'

  let content: string
  switch (format) {
    case 'json':
      content = JSON.stringify({ scope, tickets: records }, null, 2) + '\n'
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
