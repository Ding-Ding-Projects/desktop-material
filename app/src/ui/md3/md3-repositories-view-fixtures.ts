import { IMd3RepositoryRow } from './md3-repositories-view'

/**
 * PREVIEW AND TEST DATA ONLY — never rendered by the shipping application.
 *
 * `design/History MD3.dc.html` illustrates the Repositories destination with
 * nine invented repositories under three invented orgs. They are a drawing of
 * the shape a row takes, not content: the real view receives its rows from the
 * host, which builds them from the repositories the user actually added.
 *
 * They live here so a unit test and a visual harness can render the view
 * without a store, and so nothing in `md3-repositories-view.tsx` is tempted to
 * hard-code a fallback row.
 */

function row(
  overrides: Partial<IMd3RepositoryRow> & Pick<IMd3RepositoryRow, 'id' | 'name'>
): IMd3RepositoryRow {
  return {
    groupKey: 'other',
    groupLabel: 'Other',
    path: `~/code/${overrides.name}`,
    lastFetched: '12m ago',
    language: 'TypeScript',
    sizeInMegabytes: 128,
    branchName: 'main',
    sync: { kind: 'in-sync', ahead: 0, behind: 0 },
    remoteCount: 2,
    changedFilesCount: 0,
    isCurrent: false,
    isPinned: false,
    isHidden: false,
    isMissing: false,
    ...overrides,
  }
}

/** The contract's nine sample rows, in its own order. */
export const md3RepositoryFixtureRows: ReadonlyArray<IMd3RepositoryRow> = [
  row({
    id: 1,
    name: 'desktop-material',
    groupKey: 'material',
    groupLabel: 'material',
    changedFilesCount: 12,
    branchName: 'development',
    sync: { kind: 'ahead', ahead: 3, behind: 0 },
    isCurrent: true,
  }),
  row({
    id: 2,
    name: 'remote-site',
    groupKey: 'material',
    groupLabel: 'material',
    lastFetched: '1h ago',
    sizeInMegabytes: 117,
  }),
  row({
    id: 3,
    name: 'linux-tui',
    groupKey: 'material',
    groupLabel: 'material',
    language: 'Rust',
    lastFetched: '4h ago',
    sizeInMegabytes: 106,
    changedFilesCount: 3,
  }),
  row({
    id: 4,
    name: 'diagnostic-log-server',
    groupKey: 'material',
    groupLabel: 'material',
    language: 'Go',
    lastFetched: 'yesterday',
    sizeInMegabytes: 95,
  }),
  row({
    id: 5,
    name: 'shell-extension',
    groupKey: 'material',
    groupLabel: 'material',
    language: 'C++',
    lastFetched: 'yesterday',
    sizeInMegabytes: 84,
  }),
  row({
    id: 6,
    name: 'design-tokens',
    groupKey: 'studio-nord',
    groupLabel: 'studio-nord',
    path: '~/work/design-tokens',
    language: 'JSON',
    lastFetched: '2d ago',
    sizeInMegabytes: 73,
  }),
  row({
    id: 7,
    name: 'proto-sandbox',
    groupKey: 'studio-nord',
    groupLabel: 'studio-nord',
    path: '~/work/proto-sandbox',
    lastFetched: '2d ago',
    sizeInMegabytes: 62,
    changedFilesCount: 1,
  }),
  row({
    id: 8,
    name: 'dotfiles',
    groupKey: 'personal',
    groupLabel: 'personal',
    path: '~/dotfiles',
    language: 'Shell',
    lastFetched: '5d ago',
    sizeInMegabytes: 51,
  }),
  row({
    id: 9,
    name: 'notes',
    groupKey: 'personal',
    groupLabel: 'personal',
    path: '~/notes',
    language: 'Markdown',
    lastFetched: '5d ago',
    sizeInMegabytes: 40,
    changedFilesCount: 6,
    // Nothing has read this checkout's upstream, so the row says so rather
    // than borrowing "in sync" from a count it never took.
    sync: { kind: 'unknown', ahead: null, behind: null },
  }),
]
