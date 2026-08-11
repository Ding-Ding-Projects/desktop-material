import { IMd3Lock } from './lock-model'

/**
 * Export serializers for the surface-lock list.
 *
 * A lock record is a flat set of scalars — what it covers, which factor answers
 * it, when it was made, how long an unlock lasts, whether it re-locks on launch
 * — so every format below carries the whole record without dropping a field.
 *
 * What is deliberately NOT in the record is the credential: no password, no
 * digest, no salt, no OTP secret, no length and no composition hint. An export
 * of this list is therefore safe to hand to somebody, and
 * {@link Md3LockExportOmissionNotice} states in the file itself that the
 * credentials were left out — because an export that silently omits a field is
 * exactly what the export contract forbids.
 *
 * Nothing here touches the filesystem: the caller gets bytes and a suggested
 * filename and decides where they land.
 */

/** Every format the lock list can be written to. */
export type Md3LockExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'

export interface IMd3LockExportFormatDescriptor {
  readonly format: Md3LockExportFormat
  /** The format's own name. Not translated: `CSV` is `CSV` in every locale. */
  readonly label: string
  /** Without the leading dot. */
  readonly extension: string
  readonly mimeType: string
}

/** The formats offered, in the order the picker lists them. */
export const Md3LockExportFormats: ReadonlyArray<IMd3LockExportFormatDescriptor> =
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

/**
 * The sentence every export carries, wherever the format has room for it.
 *
 * It is intentionally plain English in the file rather than translated copy: an
 * exported file leaves the application and is read by tools and by people who
 * never saw the interface's language setting.
 */
export const Md3LockExportOmissionNotice =
  'Credentials are not included in this export. Passwords are stored only as ' +
  'salted hashes in the operating-system credential vault, and one-time-password ' +
  'secrets belong to the authenticator; neither is readable here.'

/** One lock, flattened for export. */
export interface IMd3LockExportRecord {
  readonly id: string
  /** `tab`, `tabGroup`, `appearanceProperty`, … */
  readonly surface: string
  /** The locked thing's own identifier. */
  readonly targetId: string
  /** The locked thing's visible label. */
  readonly targetLabel: string
  /** `password` or `otp`. */
  readonly factor: string
  /**
   * The authenticator account key for an OTP lock, or an empty string. A name,
   * never a secret.
   */
  readonly otpAccountKey: string
  /** `surface`, `minutes` or `session`. */
  readonly unlockDurationKind: string
  /** Only meaningful for a `minutes` duration. */
  readonly unlockDurationMinutes: number
  readonly lockOnLaunch: boolean
  /** ISO-8601, so an export is still sortable after it leaves the app. */
  readonly createdAt: string
}

/** Flatten a lock. This is the only place a lock becomes an export record. */
export function toMd3LockExportRecord(lock: IMd3Lock): IMd3LockExportRecord {
  return {
    id: lock.id,
    surface: lock.target.kind,
    targetId: lock.target.id,
    targetLabel: lock.target.label,
    factor: lock.factor,
    otpAccountKey: lock.otpAccountKey ?? '',
    unlockDurationKind: lock.unlockDuration.kind,
    unlockDurationMinutes: lock.unlockDuration.minutes,
    lockOnLaunch: lock.lockOnLaunch,
    createdAt: lock.createdAt,
  }
}

const Columns: ReadonlyArray<keyof IMd3LockExportRecord> = [
  'id',
  'surface',
  'targetId',
  'targetLabel',
  'factor',
  'otpAccountKey',
  'unlockDurationKind',
  'unlockDurationMinutes',
  'lockOnLaunch',
  'createdAt',
]

function cell(
  record: IMd3LockExportRecord,
  column: keyof IMd3LockExportRecord
): string {
  const value = record[column]
  return typeof value === 'string' ? value : String(value)
}

function quoteDelimited(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function delimited(
  records: ReadonlyArray<IMd3LockExportRecord>,
  delimiter: string,
  scope: string
): string {
  const header = Columns.map(quoteDelimited).join(delimiter)
  const rows = records.map(record =>
    Columns.map(column => quoteDelimited(cell(record, column))).join(delimiter)
  )
  // A leading `#` comment is what every spreadsheet and CSV reader that
  // supports comments looks for, and every one that does not simply shows it
  // as a first row rather than losing it.
  return (
    [`# ${scope}`, `# ${Md3LockExportOmissionNotice}`, header, ...rows].join(
      '\n'
    ) + '\n'
  )
}

/** Double-quoted with JSON's own escapes, which YAML and TOML both accept. */
function quoteScalar(value: string): string {
  return JSON.stringify(value)
}

function renderScalar(
  record: IMd3LockExportRecord,
  column: keyof IMd3LockExportRecord
): string {
  const value = record[column]
  return typeof value === 'string' ? quoteScalar(value) : String(value)
}

function yaml(
  records: ReadonlyArray<IMd3LockExportRecord>,
  scope: string
): string {
  const lines = [
    `# ${scope}`,
    `# ${Md3LockExportOmissionNotice}`,
    'credentialsIncluded: false',
    'locks:',
  ]
  for (const record of records) {
    let first = true
    for (const column of Columns) {
      lines.push(
        `${first ? '  - ' : '    '}${column}: ${renderScalar(record, column)}`
      )
      first = false
    }
  }
  if (records.length === 0) {
    lines.push('  []')
  }
  return lines.join('\n') + '\n'
}

function toml(
  records: ReadonlyArray<IMd3LockExportRecord>,
  scope: string
): string {
  const lines = [
    `# ${scope}`,
    `# ${Md3LockExportOmissionNotice}`,
    'credentialsIncluded = false',
  ]
  for (const record of records) {
    lines.push('', '[[locks]]')
    for (const column of Columns) {
      lines.push(`${column} = ${renderScalar(record, column)}`)
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
  records: ReadonlyArray<IMd3LockExportRecord>,
  scope: string
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<locks scope="${escapeXml(scope)}" credentialsIncluded="false">`,
    `  <notice>${escapeXml(Md3LockExportOmissionNotice)}</notice>`,
  ]
  for (const record of records) {
    lines.push('  <lock>')
    for (const column of Columns) {
      lines.push(
        `    <${column}>${escapeXml(cell(record, column))}</${column}>`
      )
    }
    lines.push('  </lock>')
  }
  lines.push('</locks>')
  return lines.join('\n') + '\n'
}

/** Pipes and backslashes are the only characters that break a GFM table cell. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function markdown(
  records: ReadonlyArray<IMd3LockExportRecord>,
  scope: string
): string {
  const lines = [
    '# Surface locks',
    '',
    scope,
    '',
    Md3LockExportOmissionNotice,
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
  records: ReadonlyArray<IMd3LockExportRecord>,
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
    '<title>Surface locks</title>',
    '</head>',
    '<body>',
    '<h1>Surface locks</h1>',
    `<p>${escapeXml(scope)}</p>`,
    `<p>${escapeXml(Md3LockExportOmissionNotice)}</p>`,
    '<table>',
    `<thead><tr>${head}</tr></thead>`,
    `<tbody>\n${body}\n</tbody>`,
    '</table>',
    '</body>',
    '</html>',
  ].join('\n')
}

/** The finished export, ready to be written or copied. */
export interface IMd3LockExport {
  readonly format: Md3LockExportFormat
  /** A suggested filename including its extension. */
  readonly filename: string
  readonly mimeType: string
  /** UTF-8 text with LF line endings. */
  readonly content: string
  readonly count: number
  /** A one-line description of what was exported — the selection or the filter. */
  readonly scope: string
}

export interface IMd3LockExportOptions {
  /** Describes the exported set, e.g. "3 selected locks". */
  readonly scope: string
  /** Defaults to `surface-locks`. */
  readonly baseName?: string
}

function describedBy(
  format: Md3LockExportFormat
): IMd3LockExportFormatDescriptor {
  const descriptor = Md3LockExportFormats.find(entry => entry.format === format)
  if (descriptor === undefined) {
    throw new Error(`Unknown lock export format: ${format}`)
  }
  return descriptor
}

/**
 * Serialize locks into one of {@link Md3LockExportFormats}.
 *
 * The content is always UTF-8 with LF line endings, and every format writes the
 * same ten fields plus the credential-omission notice, so a round trip through
 * any of them preserves the exported record.
 */
export function serializeMd3LockExport(
  locks: ReadonlyArray<IMd3Lock>,
  format: Md3LockExportFormat,
  options: IMd3LockExportOptions
): IMd3LockExport {
  const descriptor = describedBy(format)
  const records = locks.map(toMd3LockExportRecord)
  const scope = options.scope
  const baseName = options.baseName ?? 'surface-locks'

  let content: string
  switch (format) {
    case 'json':
      content =
        JSON.stringify(
          {
            scope,
            credentialsIncluded: false,
            notice: Md3LockExportOmissionNotice,
            locks: records,
          },
          null,
          2
        ) + '\n'
      break
    case 'jsonl':
      content =
        [
          JSON.stringify({
            scope,
            credentialsIncluded: false,
            notice: Md3LockExportOmissionNotice,
          }),
          ...records.map(record => JSON.stringify(record)),
        ].join('\n') + '\n'
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
      content = delimited(records, ',', scope)
      break
    case 'tsv':
      content = delimited(records, '\t', scope)
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
