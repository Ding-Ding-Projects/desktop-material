import { Commit } from '../../models/commit'

const GraphColors = [
  'var(--md-sys-color-primary)',
  'var(--md-sys-color-tertiary)',
  'var(--md-sys-color-secondary)',
  'var(--md-sys-color-error)',
  'var(--md-sys-color-inverse-primary)',
  'var(--md-sys-color-on-surface-variant)',
]

interface IActiveLane {
  readonly sha: string
  readonly color: string
}

export interface ICommitGraphPath {
  readonly fromColumn: number
  readonly toColumn: number
  readonly color: string
}

/** The kind of ref a graph chip stands for. */
export type CommitGraphRefKind = 'branch' | 'tag'

/** A branch head or tag pointing at a commit, as handed to the builder. */
export interface ICommitGraphRef {
  readonly name: string
  readonly sha: string
  readonly kind: CommitGraphRefKind
  /** Whether this is the branch that is currently checked out. */
  readonly isCurrent: boolean
}

/** A ref resolved onto the lane colour of the commit it points at. */
export interface ICommitGraphRefLabel extends ICommitGraphRef {
  readonly color: string
}

export interface ICommitGraphRow {
  readonly sha: string
  readonly column: number
  readonly color: string
  readonly hasTopLine: boolean
  readonly continuations: ReadonlyArray<ICommitGraphPath>
  readonly connections: ReadonlyArray<ICommitGraphPath>
  readonly maxColumn: number
  /** Branch heads and tags pointing at this commit, in display order. */
  readonly refs: ReadonlyArray<ICommitGraphRefLabel>
}

export interface ICommitGraph {
  readonly rows: ReadonlyArray<ICommitGraphRow>
  /**
   * The widest lane index reached anywhere in the graph. A column drawn to a
   * per-row width clips the lanes that only exist further down, so the whole
   * graph has to be sized to this.
   */
  readonly maxColumn: number
}

/**
 * Order refs so a row reads the same way every time it is rendered: the
 * checked-out branch first (it is what the reader is looking for), then the
 * remaining branches, then tags, each alphabetically.
 */
function compareRefs(a: ICommitGraphRef, b: ICommitGraphRef): number {
  if (a.isCurrent !== b.isCurrent) {
    return a.isCurrent ? -1 : 1
  }

  if (a.kind !== b.kind) {
    return a.kind === 'branch' ? -1 : 1
  }

  return a.name.localeCompare(b.name)
}

/**
 * Builds the lane geometry for commits ordered newest first. This is adapted
 * from desktop-plus' MIT-licensed graph model, with a smaller row-oriented
 * representation tailored to Desktop Material's virtualized history list.
 */
export function buildCommitGraphRows(
  commits: ReadonlyArray<Commit>
): ReadonlyArray<ICommitGraphRow> {
  return buildCommitGraph(commits).rows
}

/**
 * Builds the lane geometry along with the ref chips each row carries and the
 * width the whole graph needs.
 */
export function buildCommitGraph(
  commits: ReadonlyArray<Commit>,
  refs: ReadonlyArray<ICommitGraphRef> = []
): ICommitGraph {
  const visibleSHAs = new Set(commits.map(commit => commit.sha))
  const colors = new Map<string, string>()
  let nextColor = 0
  let lanes = new Array<IActiveLane>()

  const refsBySHA = new Map<string, Array<ICommitGraphRef>>()
  for (const ref of refs) {
    if (!visibleSHAs.has(ref.sha)) {
      continue
    }
    const existing = refsBySHA.get(ref.sha)
    if (existing === undefined) {
      refsBySHA.set(ref.sha, [ref])
    } else if (
      !existing.some(
        other => other.kind === ref.kind && other.name === ref.name
      )
    ) {
      existing.push(ref)
    }
  }

  const colorForSHA = (sha: string) => {
    const existing = colors.get(sha)
    if (existing !== undefined) {
      return existing
    }

    const color = GraphColors[nextColor % GraphColors.length]
    nextColor++
    colors.set(sha, color)
    return color
  }

  const rows = commits.map(commit => {
    let column = lanes.findIndex(lane => lane.sha === commit.sha)
    const hasTopLine = column >= 0

    if (column < 0) {
      column = lanes.length
      lanes.push({ sha: commit.sha, color: colorForSHA(commit.sha) })
    }

    const currentLane = lanes[column]
    const parents = commit.parentSHAs.filter(sha => visibleSHAs.has(sha))
    let nextLanes = lanes.slice()

    if (parents.length === 0) {
      nextLanes.splice(column, 1)
    } else {
      nextLanes[column] = { sha: parents[0], color: currentLane.color }
      colors.set(parents[0], currentLane.color)
    }

    for (const parent of parents.slice(1)) {
      if (!nextLanes.some(lane => lane.sha === parent)) {
        nextLanes.splice(Math.min(column + 1, nextLanes.length), 0, {
          sha: parent,
          color: colorForSHA(parent),
        })
      }
    }

    const seen = new Set<string>()
    nextLanes = nextLanes.filter(lane => {
      if (seen.has(lane.sha)) {
        return false
      }
      seen.add(lane.sha)
      return true
    })

    const continuations = lanes.flatMap((lane, fromColumn) => {
      if (fromColumn === column) {
        return []
      }
      const toColumn = nextLanes.findIndex(next => next.sha === lane.sha)
      return toColumn < 0 ? [] : [{ fromColumn, toColumn, color: lane.color }]
    })

    const connections = parents.map(parent => {
      const toColumn = nextLanes.findIndex(lane => lane.sha === parent)
      return {
        fromColumn: column,
        toColumn: toColumn < 0 ? column : toColumn,
        color: colors.get(parent) ?? currentLane.color,
      }
    })

    const touchedColumns = [
      column,
      ...continuations.flatMap(path => [path.fromColumn, path.toColumn]),
      ...connections.flatMap(path => [path.fromColumn, path.toColumn]),
    ]
    lanes = nextLanes

    // Tags live on the commit itself rather than in the caller's ref list, so
    // they are folded in here and every consumer gets them for free.
    const tagRefs = commit.tags.map(name => ({
      name,
      sha: commit.sha,
      kind: 'tag' as const,
      isCurrent: false,
    }))
    const passedRefs = refsBySHA.get(commit.sha) ?? []
    const rowRefs = [
      ...passedRefs,
      ...tagRefs.filter(
        tag =>
          !passedRefs.some(ref => ref.kind === 'tag' && ref.name === tag.name)
      ),
    ]
      .sort(compareRefs)
      .map(ref => ({ ...ref, color: currentLane.color }))

    return {
      sha: commit.sha,
      column,
      color: currentLane.color,
      hasTopLine,
      continuations,
      connections,
      maxColumn: Math.max(...touchedColumns),
      refs: rowRefs,
    }
  })

  return {
    rows,
    maxColumn: rows.reduce((widest, row) => Math.max(widest, row.maxColumn), 0),
  }
}
