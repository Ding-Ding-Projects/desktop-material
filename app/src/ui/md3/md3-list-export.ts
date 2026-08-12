/**
 * The one export serializer every MD3 list uses.
 *
 * The project's contract asks that exports "offer every format that can
 * faithfully represent the data, state the encoding and the schema, and say
 * before running what a format would drop". Nine surfaces were each about to
 * grow their own answer to that, which is nine chances for one of them to
 * quietly omit a field, invent a different escaping rule, or forget to warn.
 * So the rule lives here once, over a declared column schema, and each list
 * supplies its records and its columns.
 *
 * Two things this module insists on that a hand-rolled writer forgets:
 *
 *  - **The loss is declared before the export runs.** A column marked
 *    `multiline` genuinely cannot survive a CSV, TSV or Markdown-table cell —
 *    the line breaks become spaces, because a raw newline ends the record. The
 *    picker says which columns that will happen to, in the row the user is
 *    about to click, rather than writing a silently flattened file.
 *  - **The encoding and the schema are stated**, in the picker and again in
 *    the file's own header wherever the format has somewhere to put one. A
 *    file that leaves the application with no statement of what its fields
 *    mean is a file only the application that wrote it can read.
 *
 * Nothing here touches the filesystem. `serializeMd3ListExport` returns bytes
 * and a suggested filename; the host decides where they land.
 */

import { t } from '../../lib/i18n'

/**
 * Every format an MD3 list can write.
 *
 * `sql` writes `INSERT` statements against a declared table, which is the
 * shape a reader loads into a database without writing an importer first.
 */
export type Md3ListExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'
  | 'sql'

/** A value a column may hold. Anything else must be flattened by the caller. */
export type Md3ListExportValue = string | number | boolean

/** One exported record: a flat map from column name to scalar. */
export type Md3ListExportRecord = Readonly<
  Record<string, Md3ListExportValue | undefined>
>

/** One declared column of a list's export schema. */
export interface IMd3ListExportColumn {
  /** The field name, written verbatim into every format's header. */
  readonly name: string

  /**
   * Set when the value may contain line breaks — a commit body, a log
   * excerpt, an article's Markdown. It is the flag that makes the picker warn
   * about the row-oriented formats rather than flattening in silence.
   */
  readonly multiline?: boolean
}

/** A described format, for building an export picker. */
export interface IMd3ListExportFormatDescriptor {
  readonly format: Md3ListExportFormat

  /** The format's own name. Not translated: `CSV` is `CSV` in every locale. */
  readonly label: string

  /** Without the leading dot. */
  readonly extension: string

  readonly mimeType: string

  /**
   * Whether a line break inside a value survives this format.
   *
   * JSON escapes it, XML and HTML carry it, YAML and TOML quote it, SQL
   * escapes it. CSV, TSV and a Markdown table cannot: the first two end the
   * record at a newline and the third ends the row, so a multiline value has
   * to be flattened to one line before it is written.
   */
  readonly flattensLineBreaks: boolean
}

/** The formats offered, in the order a picker lists them. */
export const Md3ListExportFormats: ReadonlyArray<IMd3ListExportFormatDescriptor> =
  [
    {
      format: 'json',
      label: 'JSON',
      extension: 'json',
      mimeType: 'application/json',
      flattensLineBreaks: false,
    },
    {
      format: 'jsonl',
      label: 'JSONL',
      extension: 'jsonl',
      mimeType: 'application/x-ndjson',
      flattensLineBreaks: false,
    },
    {
      format: 'yaml',
      label: 'YAML',
      extension: 'yaml',
      mimeType: 'text/yaml',
      flattensLineBreaks: false,
    },
    {
      format: 'toml',
      label: 'TOML',
      extension: 'toml',
      mimeType: 'text/plain',
      flattensLineBreaks: false,
    },
    {
      format: 'xml',
      label: 'XML',
      extension: 'xml',
      mimeType: 'application/xml',
      flattensLineBreaks: false,
    },
    {
      format: 'csv',
      label: 'CSV',
      extension: 'csv',
      mimeType: 'text/csv',
      flattensLineBreaks: true,
    },
    {
      format: 'tsv',
      label: 'TSV',
      extension: 'tsv',
      mimeType: 'text/tab-separated-values',
      flattensLineBreaks: true,
    },
    {
      format: 'markdown',
      label: 'Markdown',
      extension: 'md',
      mimeType: 'text/markdown',
      flattensLineBreaks: true,
    },
    {
      format: 'html',
      label: 'HTML',
      extension: 'html',
      mimeType: 'text/html',
      flattensLineBreaks: false,
    },
    {
      format: 'sql',
      label: 'SQL',
      extension: 'sql',
      mimeType: 'application/sql',
      flattensLineBreaks: false,
    },
  ]

/** Look a descriptor up, failing loudly on a format nobody declared. */
export function md3ListExportDescriptor(
  format: Md3ListExportFormat
): IMd3ListExportFormatDescriptor {
  const descriptor = Md3ListExportFormats.find(entry => entry.format === format)
  if (descriptor === undefined) {
    throw new Error(`Unknown MD3 list export format: ${format}`)
  }
  return descriptor
}

/**
 * What `format` would drop from a list declaring `columns`, or `null` when it
 * would drop nothing.
 *
 * This is what the picker renders beside each format, so the choice is made
 * with the cost visible rather than discovered afterwards in the file.
 */
export function md3ListExportLoss(
  columns: ReadonlyArray<IMd3ListExportColumn>,
  format: Md3ListExportFormat
): string | null {
  if (!md3ListExportDescriptor(format).flattensLineBreaks) {
    return null
  }
  const affected = columns
    .filter(column => column.multiline === true)
    .map(column => column.name)
  if (affected.length === 0) {
    return null
  }
  return t('md3.listExport.lossLineBreaks', { fields: affected.join(', ') })
}

/**
 * The schema line: the encoding, the line endings and every field name.
 *
 * It is shown in the picker and written into the file, because the two
 * readers who need it — the person choosing the format and the person opening
 * the file a month later — are rarely in the same place.
 */
export function md3ListExportSchema(
  columns: ReadonlyArray<IMd3ListExportColumn>
): string {
  return t('md3.listExport.schema', {
    count: String(columns.length),
    fields: columns.map(column => column.name).join(', '),
  })
}

/** The finished export, ready to be written or copied. */
export interface IMd3ListExport {
  readonly format: Md3ListExportFormat

  /** A suggested filename including its extension. */
  readonly filename: string

  readonly mimeType: string

  /** UTF-8 text with LF line endings. */
  readonly content: string

  readonly count: number

  /** The one-line description of what was exported. */
  readonly scope: string

  /**
   * What this particular format dropped, or `null` when it dropped nothing.
   * Carried on the result so a caller's confirmation toast can repeat it
   * rather than reconstructing it.
   */
  readonly loss: string | null
}

/** Everything a list has to declare to be exportable. */
export interface IMd3ListExportSpec {
  /** The declared schema, in the order every format writes the fields. */
  readonly columns: ReadonlyArray<IMd3ListExportColumn>

  /** The XML root / JSON key / SQL table name. ASCII, no spaces. */
  readonly collectionName: string

  /** The XML element name for one record. ASCII, no spaces. */
  readonly recordName: string

  /** The human title written into Markdown and HTML. */
  readonly title: string

  /** The filename stem, without an extension. */
  readonly baseName: string
}

export interface IMd3ListExportOptions {
  /** Describes the exported set, e.g. "12 selected branches". */
  readonly scope: string
}

function raw(value: Md3ListExportValue | undefined): string {
  if (value === undefined) {
    return ''
  }
  return typeof value === 'string' ? value : String(value)
}

/** One line, for the formats whose record separator *is* the line break. */
function flattened(value: Md3ListExportValue | undefined): string {
  return raw(value).replace(/\r\n|\r|\n/g, ' ').trim()
}

function quoteDelimited(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function delimited(
  records: ReadonlyArray<Md3ListExportRecord>,
  columns: ReadonlyArray<IMd3ListExportColumn>,
  delimiter: string
): string {
  const header = columns
    .map(column => quoteDelimited(column.name))
    .join(delimiter)
  const rows = records.map(record =>
    columns
      .map(column => quoteDelimited(flattened(record[column.name])))
      .join(delimiter)
  )
  return [header, ...rows].join('\n') + '\n'
}

/** Double-quoted with JSON's own escapes, which YAML and TOML both accept. */
function quoteScalar(value: string): string {
  return JSON.stringify(value)
}

function scalar(value: Md3ListExportValue | undefined): string {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  return quoteScalar(raw(value))
}

function yaml(
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  header: ReadonlyArray<string>
): string {
  const lines = [...header.map(line => `# ${line}`), `${spec.collectionName}:`]
  if (records.length === 0) {
    lines.push('  []')
  }
  for (const record of records) {
    let first = true
    for (const column of spec.columns) {
      lines.push(
        `${first ? '  - ' : '    '}${column.name}: ${scalar(
          record[column.name]
        )}`
      )
      first = false
    }
  }
  return lines.join('\n') + '\n'
}

function toml(
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  header: ReadonlyArray<string>
): string {
  const lines = header.map(line => `# ${line}`)
  for (const record of records) {
    lines.push('', `[[${spec.collectionName}]]`)
    for (const column of spec.columns) {
      lines.push(`${column.name} = ${scalar(record[column.name])}`)
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
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  header: ReadonlyArray<string>
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    ...header.map(line => `<!-- ${escapeXml(line.replace(/--/g, '- -'))} -->`),
    `<${spec.collectionName}>`,
  ]
  for (const record of records) {
    lines.push(`  <${spec.recordName}>`)
    for (const column of spec.columns) {
      lines.push(
        `    <${column.name}>${escapeXml(raw(record[column.name]))}</${
          column.name
        }>`
      )
    }
    lines.push(`  </${spec.recordName}>`)
  }
  lines.push(`</${spec.collectionName}>`)
  return lines.join('\n') + '\n'
}

/** Pipes and backslashes are the only characters that break a GFM table cell. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

function markdown(
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  header: ReadonlyArray<string>
): string {
  const names = spec.columns.map(column => column.name)
  const lines = [
    `# ${spec.title}`,
    '',
    ...header,
    '',
    `| ${names.join(' | ')} |`,
    `| ${names.map(() => '---').join(' | ')} |`,
  ]
  for (const record of records) {
    lines.push(
      `| ${spec.columns
        .map(column => escapeMarkdownCell(flattened(record[column.name])))
        .join(' | ')} |`
    )
  }
  return lines.join('\n') + '\n'
}

function html(
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  header: ReadonlyArray<string>
): string {
  const head = spec.columns
    .map(column => `<th scope="col">${escapeXml(column.name)}</th>`)
    .join('')
  const body = records
    .map(
      record =>
        `<tr>${spec.columns
          .map(column => `<td>${escapeXml(raw(record[column.name]))}</td>`)
          .join('')}</tr>`
    )
    .join('\n')
  return (
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${escapeXml(spec.title)}</title>`,
      '</head>',
      '<body>',
      `<h1>${escapeXml(spec.title)}</h1>`,
      ...header.map(line => `<p>${escapeXml(line)}</p>`),
      '<table>',
      `<thead><tr>${head}</tr></thead>`,
      `<tbody>\n${body}\n</tbody>`,
      '</table>',
      '</body>',
      '</html>',
    ].join('\n') + '\n'
  )
}

/** Single-quoted with SQL's doubled-quote escape; NULL for an absent value. */
function sqlLiteral(value: Md3ListExportValue | undefined): string {
  if (value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }
  return `'${value.replace(/'/g, "''")}'`
}

function sqlIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function sql(
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  header: ReadonlyArray<string>
): string {
  const table = sqlIdentifier(spec.collectionName)
  const names = spec.columns.map(column => sqlIdentifier(column.name))
  const lines = [
    ...header.map(line => `-- ${line}`),
    '',
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    spec.columns
      .map(column => `  ${sqlIdentifier(column.name)} TEXT`)
      .join(',\n'),
    ');',
    '',
  ]
  for (const record of records) {
    lines.push(
      `INSERT INTO ${table} (${names.join(', ')}) VALUES (${spec.columns
        .map(column => sqlLiteral(record[column.name]))
        .join(', ')});`
    )
  }
  return lines.join('\n') + '\n'
}

/**
 * Serialize `records` into `format`.
 *
 * The content is always UTF-8 with LF line endings, and every format writes
 * every declared column, so the only thing a format can lose is the line
 * breaks inside a `multiline` value — which {@link md3ListExportLoss} names
 * before the export runs and {@link IMd3ListExport.loss} repeats afterwards.
 */
export function serializeMd3ListExport(
  records: ReadonlyArray<Md3ListExportRecord>,
  spec: IMd3ListExportSpec,
  format: Md3ListExportFormat,
  options: IMd3ListExportOptions
): IMd3ListExport {
  const descriptor = md3ListExportDescriptor(format)
  const loss = md3ListExportLoss(spec.columns, format)
  const header = [
    options.scope,
    md3ListExportSchema(spec.columns),
    ...(loss === null ? [] : [loss]),
  ]

  let content: string
  switch (format) {
    case 'json':
      content =
        JSON.stringify(
          {
            scope: options.scope,
            schema: spec.columns.map(column => column.name),
            [spec.collectionName]: records,
          },
          null,
          2
        ) + '\n'
      break
    case 'jsonl':
      content =
        [
          JSON.stringify({
            scope: options.scope,
            schema: spec.columns.map(column => column.name),
          }),
          ...records.map(record => JSON.stringify(record)),
        ].join('\n') + '\n'
      break
    case 'yaml':
      content = yaml(records, spec, header)
      break
    case 'toml':
      content = toml(records, spec, header)
      break
    case 'xml':
      content = xml(records, spec, header)
      break
    case 'csv':
      content = delimited(records, spec.columns, ',')
      break
    case 'tsv':
      content = delimited(records, spec.columns, '\t')
      break
    case 'markdown':
      content = markdown(records, spec, header)
      break
    case 'html':
      content = html(records, spec, header)
      break
    case 'sql':
      content = sql(records, spec, header)
      break
  }

  return {
    format,
    filename: `${spec.baseName}.${descriptor.extension}`,
    mimeType: descriptor.mimeType,
    content,
    count: records.length,
    scope: options.scope,
    loss,
  }
}
