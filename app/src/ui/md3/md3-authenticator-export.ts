/**
 * Export serializers for the Authenticator destination.
 *
 * There are two exports here and they are deliberately different things.
 *
 * The ordinary one writes what the list shows — issuer, account, group,
 * algorithm, digits, period, when it was registered — and **omits every
 * secret**. It does not omit it quietly: every format carries a `secret`
 * column reading `omitted`, and every format with somewhere to put a comment
 * also carries the sentence saying so in words. JSONL, CSV and TSV are the
 * three that do not, because a comment line in any of them breaks the parsers
 * that read them — there the column itself is the statement. An export that
 * silently dropped a field would be indistinguishable from a broken one.
 *
 * The secrets export writes usable `otpauth://` URIs in the clear. It is a
 * separately named action behind the two-key destructive-action gate, it says
 * exactly what the file will contain before it is written, and it never shares
 * a code path with the ordinary one — so no menu item, keyboard shortcut or
 * bulk action can reach it by accident.
 */

/** Every format the Authenticator can write. */
export type Md3AuthenticatorExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'

/** One entry, flattened for export. Never carries a secret. */
export interface IMd3AuthenticatorExportRecord {
  readonly id: string
  readonly issuer: string
  readonly account: string
  readonly group: string
  readonly algorithm: string
  readonly digits: number
  readonly period: number
  /** ISO-8601, so the file is still sortable after it leaves the app. */
  readonly addedAt: string
  /** Always the literal `omitted`. Present so the gap is visible in the file. */
  readonly secret: 'omitted'
}

/** A described format, for building the export picker. */
export interface IMd3AuthenticatorExportFormatDescriptor {
  readonly format: Md3AuthenticatorExportFormat
  /** The format's own name. Not translated: `CSV` is `CSV` in every locale. */
  readonly label: string
  /** Without the leading dot. */
  readonly extension: string
  readonly mimeType: string
}

/** The formats offered, in the order the picker lists them. */
export const Md3AuthenticatorExportFormats: ReadonlyArray<IMd3AuthenticatorExportFormatDescriptor> =
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
export interface IMd3AuthenticatorExport {
  readonly format: Md3AuthenticatorExportFormat
  /** A suggested filename including its extension. */
  readonly filename: string
  readonly mimeType: string
  /** UTF-8 text with LF line endings. */
  readonly content: string
  readonly count: number
  /** A one-line description of what was exported — the selection or the filter. */
  readonly scope: string
  /** Whether this payload contains usable secrets. */
  readonly containsSecrets: boolean
  /**
   * The sentence naming what the file leaves out, written into the file itself
   * wherever the format has somewhere to put it. Empty for a secrets export,
   * which leaves nothing out.
   */
  readonly omissionNotice: string
}

export interface IMd3AuthenticatorExportOptions {
  /** Describes the exported set, e.g. "12 selected factors". */
  readonly scope: string
  /**
   * The sentence stating that secrets are omitted, localized by the caller.
   * Required rather than defaulted: this app renders in three language modes,
   * and an English-only notice inside a Cantonese session is a notice nobody
   * reads.
   */
  readonly omissionNotice: string
  /** Defaults to `authenticator`. */
  readonly baseName?: string
}

const Columns: ReadonlyArray<keyof IMd3AuthenticatorExportRecord> = [
  'id',
  'issuer',
  'account',
  'group',
  'algorithm',
  'digits',
  'period',
  'addedAt',
  'secret',
]

function cell(
  record: IMd3AuthenticatorExportRecord,
  column: keyof IMd3AuthenticatorExportRecord
): string {
  return String(record[column])
}

function quoteDelimited(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function delimited(
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
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

function scalarFor(
  record: IMd3AuthenticatorExportRecord,
  column: keyof IMd3AuthenticatorExportRecord
): string {
  const value = record[column]
  return typeof value === 'number' ? String(value) : quoteScalar(String(value))
}

function yaml(
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
  scope: string,
  notice: string
): string {
  const lines = [`# ${scope}`, `# ${notice}`, 'factors:']
  for (const record of records) {
    let first = true
    for (const column of Columns) {
      lines.push(
        `${first ? '  - ' : '    '}${column}: ${scalarFor(record, column)}`
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
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
  scope: string,
  notice: string
): string {
  const lines = [`# ${scope}`, `# ${notice}`]
  for (const record of records) {
    lines.push('', '[[factors]]')
    for (const column of Columns) {
      lines.push(`${column} = ${scalarFor(record, column)}`)
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
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
  scope: string,
  notice: string
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<factors scope="${escapeXml(scope)}">`,
    `  <notice>${escapeXml(notice)}</notice>`,
  ]
  for (const record of records) {
    lines.push('  <factor>')
    for (const column of Columns) {
      lines.push(
        `    <${column}>${escapeXml(cell(record, column))}</${column}>`
      )
    }
    lines.push('  </factor>')
  }
  lines.push('</factors>')
  return lines.join('\n') + '\n'
}

/** Pipes and backslashes are the only characters that break a GFM table cell. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function markdown(
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
  scope: string,
  notice: string
): string {
  const lines = [
    '# Authenticator',
    '',
    scope,
    '',
    notice,
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
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
  scope: string,
  notice: string
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
    '<title>Authenticator</title>',
    '</head>',
    '<body>',
    '<h1>Authenticator</h1>',
    `<p>${escapeXml(scope)}</p>`,
    `<p>${escapeXml(notice)}</p>`,
    '<table>',
    `<thead><tr>${head}</tr></thead>`,
    `<tbody>\n${body}\n</tbody>`,
    '</table>',
    '</body>',
    '</html>',
  ].join('\n')
}

function describedBy(
  format: Md3AuthenticatorExportFormat
): IMd3AuthenticatorExportFormatDescriptor {
  const descriptor = Md3AuthenticatorExportFormats.find(
    entry => entry.format === format
  )
  if (descriptor === undefined) {
    throw new Error(`Unknown authenticator export format: ${format}`)
  }
  return descriptor
}

/**
 * Serialize entries into one of {@link Md3AuthenticatorExportFormats}.
 *
 * The result never contains a secret, and every format states that it does
 * not.
 */
export function serializeMd3AuthenticatorExport(
  records: ReadonlyArray<IMd3AuthenticatorExportRecord>,
  format: Md3AuthenticatorExportFormat,
  options: IMd3AuthenticatorExportOptions
): IMd3AuthenticatorExport {
  const descriptor = describedBy(format)
  const scope = options.scope
  const notice = options.omissionNotice
  const baseName = options.baseName ?? 'authenticator'

  let content: string
  switch (format) {
    case 'json':
      content =
        JSON.stringify({ scope, notice, factors: records }, null, 2) + '\n'
      break
    case 'jsonl':
      content = records.map(record => JSON.stringify(record)).join('\n') + '\n'
      break
    case 'yaml':
      content = yaml(records, scope, notice)
      break
    case 'toml':
      content = toml(records, scope, notice)
      break
    case 'xml':
      content = xml(records, scope, notice)
      break
    case 'csv':
      content = delimited(records, ',')
      break
    case 'tsv':
      content = delimited(records, '\t')
      break
    case 'markdown':
      content = markdown(records, scope, notice)
      break
    case 'html':
      content = html(records, scope, notice)
      break
  }

  return {
    format,
    filename: `${baseName}.${descriptor.extension}`,
    mimeType: descriptor.mimeType,
    content,
    count: records.length,
    scope,
    containsSecrets: false,
    omissionNotice: notice,
  }
}

/**
 * Serialize usable `otpauth://` URIs, one per line.
 *
 * Reachable only from the separately named secrets action, and only after the
 * destructive-action gate has been satisfied. The header states in plain words
 * that the file holds working second factors, because a file that looks like
 * an export and is really a set of keys is the one file nobody should
 * mis-handle.
 */
export function serializeMd3AuthenticatorSecrets(
  uris: ReadonlyArray<string>,
  options: {
    readonly scope: string
    /** The localized "this file contains working secrets" warning. */
    readonly warning: string
    readonly baseName?: string
  }
): IMd3AuthenticatorExport {
  const baseName = options.baseName ?? 'authenticator-secrets'
  const content =
    [`# ${options.scope}`, `# ${options.warning}`, ...uris].join('\n') + '\n'

  return {
    format: 'markdown',
    filename: `${baseName}.txt`,
    mimeType: 'text/plain',
    content,
    count: uris.length,
    scope: options.scope,
    containsSecrets: true,
    omissionNotice: '',
  }
}
