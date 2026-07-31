/**
 * Exporting and copying what the changelog viewer is currently showing.
 *
 * The export is the filtered view, not the whole history — copying something
 * other than what is on screen is the one behaviour that would make the button
 * untrustworthy. Whatever narrowed it is stated in the header, so a file that
 * outlives the window it came from still says what it is a slice of.
 */

import { FilterMode } from '../fuzzy-find'
import { IChangelogRelease } from './changelog-catalog'
import { IChangelogFilter } from './changelog-filter'

export type ChangelogExportFormat = 'markdown' | 'text'

export interface IChangelogExportContext {
  /** The filter the shown releases were produced by. */
  readonly filter: IChangelogFilter
  /** Total releases before filtering, so the slice is placed in context. */
  readonly totalReleaseCount: number
  /** Releases a date range removed only because their date is unrecorded. */
  readonly hiddenUndatedCount: number
  /** The app version doing the export. */
  readonly appVersion: string
  /**
   * When the export was taken, as `YYYY-MM-DD HH:MM` in 24-hour local time.
   * Passed in rather than read from a clock here so the output is testable.
   */
  readonly exportedAt: string
}

function describeMode(mode: FilterMode): string {
  switch (mode) {
    case FilterMode.Regex:
      return 'regular expression'
    case FilterMode.Substring:
      return 'substring'
    case FilterMode.Fuzzy:
    default:
      return 'fuzzy'
  }
}

/**
 * The human-readable statement of what this export covers.
 *
 * Every active filter gets a line. An export with no filters says so out loud
 * rather than staying silent, because "no filter line" and "I forgot to record
 * the filter" look identical to a reader.
 */
export function describeChangelogExport(
  releases: ReadonlyArray<IChangelogRelease>,
  context: IChangelogExportContext
): ReadonlyArray<string> {
  const { filter } = context
  const lines = new Array<string>()

  lines.push(
    `Desktop Material ${context.appVersion} — exported ${context.exportedAt}`
  )
  lines.push(
    `${releases.length} of ${context.totalReleaseCount} releases shown.`
  )

  const query = filter.query.trim()
  if (query.length > 0) {
    lines.push(
      `Search: "${query}" (${describeMode(filter.mode)}, ${
        filter.caseSensitive ? 'case sensitive' : 'case insensitive'
      })`
    )
  }

  if (filter.categories.length > 0) {
    lines.push(
      `Categories: ${filter.categories
        .map(category => category ?? '(uncategorized)')
        .join(', ')}`
    )
  }

  if (filter.from !== null || filter.to !== null) {
    const from = filter.from ?? 'the first release'
    const to = filter.to ?? 'the latest release'
    lines.push(`Dates: ${from} to ${to}`)
    if (context.hiddenUndatedCount > 0 && !filter.includeUndated) {
      lines.push(
        `${context.hiddenUndatedCount} release(s) omitted: no release tag records their date.`
      )
    }
  }

  if (
    query.length === 0 &&
    filter.categories.length === 0 &&
    filter.from === null &&
    filter.to === null
  ) {
    lines.push('No filters applied: this is the complete recorded history.')
  }

  return lines
}

/** `2026-07-31 14:22`, or an honest note when the release has no tag. */
function describeStamp(release: IChangelogRelease): string {
  if (release.date === null) {
    return 'date unrecorded'
  }
  return release.time === null
    ? release.date
    : `${release.date} ${release.time}`
}

/** Renders the shown releases as Markdown. */
export function exportChangelogAsMarkdown(
  releases: ReadonlyArray<IChangelogRelease>,
  context: IChangelogExportContext
): string {
  const lines = new Array<string>()
  lines.push('# Desktop Material release history')
  lines.push('')
  for (const line of describeChangelogExport(releases, context)) {
    lines.push(`> ${line}`)
  }
  lines.push('')

  if (releases.length === 0) {
    lines.push('_Nothing matched the current filters._')
    lines.push('')
    return lines.join('\n')
  }

  for (const release of releases) {
    lines.push(`## ${release.version} — ${describeStamp(release)}`)
    lines.push('')
    if (release.entries.length === 0) {
      lines.push('_No changes recorded for this release._')
      lines.push('')
      continue
    }
    for (const entry of release.entries) {
      const category = entry.category === null ? '' : `**${entry.category}** — `
      lines.push(`- ${category}${entry.text}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Renders the shown releases as plain text. */
export function exportChangelogAsText(
  releases: ReadonlyArray<IChangelogRelease>,
  context: IChangelogExportContext
): string {
  const lines = new Array<string>()
  lines.push('Desktop Material release history')
  lines.push('===============================')
  for (const line of describeChangelogExport(releases, context)) {
    lines.push(line)
  }
  lines.push('')

  if (releases.length === 0) {
    lines.push('Nothing matched the current filters.')
    lines.push('')
    return lines.join('\n')
  }

  for (const release of releases) {
    const heading = `${release.version} — ${describeStamp(release)}`
    lines.push(heading)
    lines.push('-'.repeat(heading.length))
    if (release.entries.length === 0) {
      lines.push('No changes recorded for this release.')
      lines.push('')
      continue
    }
    for (const entry of release.entries) {
      const category = entry.category === null ? '' : `[${entry.category}] `
      lines.push(`  * ${category}${entry.text}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Renders in the requested format. */
export function exportChangelog(
  releases: ReadonlyArray<IChangelogRelease>,
  context: IChangelogExportContext,
  format: ChangelogExportFormat
): string {
  return format === 'markdown'
    ? exportChangelogAsMarkdown(releases, context)
    : exportChangelogAsText(releases, context)
}

/** The suggested file name, carrying the range so downloads stay distinct. */
export function getChangelogExportFileName(
  context: IChangelogExportContext,
  format: ChangelogExportFormat
): string {
  const extension = format === 'markdown' ? 'md' : 'txt'
  const stamp = context.exportedAt.replace(/[: ]/g, '-')
  return `desktop-material-changelog-${stamp}.${extension}`
}

/** `YYYY-MM-DD HH:MM`, 24-hour, local time — the app's one stamp format. */
export function formatExportStamp(when: Date): string {
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value))
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    ` ${pad(when.getHours())}:${pad(when.getMinutes())}`
  )
}
