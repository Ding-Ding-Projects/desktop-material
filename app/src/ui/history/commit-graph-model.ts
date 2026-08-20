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
  /** Internal identity carried while this lane travels through its ancestry. */
  readonly token: number
  readonly color: string
}

export interface ICommitGraphPath {
  readonly fromColumn: number
  readonly toColumn: number
  readonly fromLaneId: string
  readonly toLaneId: string
  readonly color: string
}

/** The kind of ref a graph chip stands for. */
export type CommitGraphRefKind = 'branch' | 'tag'

/** A branch head or tag pointing at a commit, as handed to the builder. */
export interface ICommitGraphRef {
  /** Canonical identity when the caller has one, independent of the tip SHA. */
  readonly refId?: string
  readonly name: string
  readonly sha: string
  readonly kind: CommitGraphRefKind
  /** Whether this is the branch that is currently checked out. */
  readonly isCurrent: boolean
}

/** A ref resolved onto the lane colour of the commit it points at. */
export interface ICommitGraphRefLabel extends ICommitGraphRef {
  readonly refId: string
  readonly laneId: string
  readonly color: string
}

export type CommitGraphLaneControlKind = CommitGraphRefKind | 'commit'

/** A stable, keyboard-addressable identity for one visible graph lane. */
export interface ICommitGraphLaneControl {
  readonly id: string
  readonly laneId: string
  readonly name: string
  readonly kind: CommitGraphLaneControlKind
  readonly color: string
  readonly isCurrent: boolean
  readonly isHead: boolean
}

export interface ICommitGraphRow {
  readonly sha: string
  readonly laneId: string
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
  /** Every unique lane identity, including lanes without a named ref. */
  readonly laneIds: ReadonlyArray<string>
  /** Named ref controls plus a commit-labelled fallback for unnamed lanes. */
  readonly laneControls: ReadonlyArray<ICommitGraphLaneControl>
  /**
   * The widest lane index reached anywhere in the graph. A column drawn to a
   * per-row width clips the lanes that only exist further down, so the whole
   * graph has to be sized to this.
   */
  readonly maxColumn: number
}

export interface ICommitGraphLaneVisibility {
  readonly visibleLaneIds: ReadonlySet<string>
  readonly hiddenLaneIds: ReadonlySet<string>
  readonly protectedLaneIds: ReadonlySet<string>
  readonly soloLaneId: string | null
}

/** A ref identity stays stable when its branch or tag moves to another SHA. */
export function commitGraphRefIdentity(ref: ICommitGraphRef): string {
  if (ref.refId !== undefined) {
    return ref.refId
  }

  return ref.kind === 'tag' ? `tag:refs/tags/${ref.name}` : `branch:${ref.name}`
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

function compareLaneControls(
  a: ICommitGraphLaneControl,
  b: ICommitGraphLaneControl
): number {
  if (a.isCurrent !== b.isCurrent) {
    return a.isCurrent ? -1 : 1
  }

  if (a.isHead !== b.isHead) {
    return a.isHead ? -1 : 1
  }

  const kindOrder: ReadonlyArray<CommitGraphLaneControlKind> = [
    'branch',
    'tag',
    'commit',
  ]
  const kindDifference = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
  return kindDifference !== 0 ? kindDifference : a.name.localeCompare(b.name)
}

function laneAnchor(laneId: string): string {
  return laneId.replace(/^lane:/, '')
}

function shortestUniqueLaneAnchor(
  laneId: string,
  laneIds: ReadonlyArray<string>
): string {
  const anchor = laneAnchor(laneId)
  let length = Math.min(7, anchor.length)

  while (
    length < anchor.length &&
    laneIds.some(
      candidate =>
        candidate !== laneId &&
        laneAnchor(candidate).startsWith(anchor.slice(0, length))
    )
  ) {
    length++
  }

  return anchor.slice(0, length)
}

function disambiguateLaneControlNames(
  controls: ReadonlyArray<ICommitGraphLaneControl>
): Array<ICommitGraphLaneControl> {
  const counts = new Map<string, number>()
  for (const control of controls) {
    const key = `${control.kind}:${control.name}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return controls.map(control => {
    const key = `${control.kind}:${control.name}`
    if ((counts.get(key) ?? 0) < 2) {
      return control
    }

    const prefix = `${control.kind}:`
    const canonicalName = control.id.startsWith(prefix)
      ? control.id.slice(prefix.length)
      : control.id
    return { ...control, name: `${control.name} (${canonicalName})` }
  })
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
  let nextLaneToken = 0
  const laneOrigins = new Map<number, string>()
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
        other => commitGraphRefIdentity(other) === commitGraphRefIdentity(ref)
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

  const createLane = (sha: string, color: string): IActiveLane => {
    const token = nextLaneToken++
    laneOrigins.set(token, sha)
    return { sha, token, color }
  }

  const internalRows = commits.map(commit => {
    let column = lanes.findIndex(lane => lane.sha === commit.sha)
    const hasTopLine = column >= 0

    if (column < 0) {
      column = lanes.length
      lanes.push(createLane(commit.sha, colorForSHA(commit.sha)))
    }

    const currentLane = lanes[column]
    const parents = commit.parentSHAs.filter(sha => visibleSHAs.has(sha))
    let nextLanes = lanes.slice()

    if (parents.length === 0) {
      nextLanes.splice(column, 1)
    } else {
      nextLanes[column] = {
        sha: parents[0],
        token: currentLane.token,
        color: currentLane.color,
      }
      colors.set(parents[0], currentLane.color)
    }

    for (const parent of parents.slice(1)) {
      if (!nextLanes.some(lane => lane.sha === parent)) {
        nextLanes.splice(
          Math.min(column + 1, nextLanes.length),
          0,
          createLane(parent, colorForSHA(parent))
        )
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

    // One index for the row instead of a linear scan per lane and per parent.
    // `continuations` scanned nextLanes for every surviving lane and
    // `connections` scanned it again for every parent, so a row cost
    // O(lanes * lanes) where O(lanes) was available. The whole graph is already
    // rebuilt from scratch each time history loads another batch — see the note
    // on the memo in history-graph-view — so the constant here is paid on every
    // one of those rebuilds, over every commit loaded so far.
    const nextColumnBySha = new Map<string, number>()
    for (let index = 0; index < nextLanes.length; index += 1) {
      const sha = nextLanes[index].sha
      // First wins, matching findIndex, which matters because de-duplication
      // above can leave two lanes naming the same sha only transiently.
      if (!nextColumnBySha.has(sha)) {
        nextColumnBySha.set(sha, index)
      }
    }

    const continuations = lanes.flatMap((lane, fromColumn) => {
      if (fromColumn === column) {
        return []
      }
      const toColumn = nextColumnBySha.get(lane.sha) ?? -1
      const targetLane = toColumn < 0 ? undefined : nextLanes[toColumn]
      return toColumn < 0
        ? []
        : [
            {
              fromColumn,
              toColumn,
              fromLaneToken: lane.token,
              // A sibling can converge into this lane and win de-duplication.
              // Name the surviving endpoint instead of leaving a path that
              // appears to enter a hidden lane after visibility filtering.
              toLaneToken: targetLane?.token ?? lane.token,
              color: lane.color,
            },
          ]
    })

    const connections = parents.map(parent => {
      const toColumn = nextColumnBySha.get(parent) ?? -1
      const targetLane = toColumn < 0 ? undefined : nextLanes[toColumn]
      return {
        fromColumn: column,
        toColumn: toColumn < 0 ? column : toColumn,
        fromLaneToken: currentLane.token,
        toLaneToken: targetLane?.token ?? currentLane.token,
        color: targetLane?.color ?? colors.get(parent) ?? currentLane.color,
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
      refId: `tag:refs/tags/${name}`,
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
          !passedRefs.some(
            ref => commitGraphRefIdentity(ref) === commitGraphRefIdentity(tag)
          )
      ),
    ]
      .sort(compareRefs)
      .map(ref => ({
        ...ref,
        refId: commitGraphRefIdentity(ref),
        laneToken: currentLane.token,
        color: currentLane.color,
      }))

    return {
      sha: commit.sha,
      laneToken: currentLane.token,
      column,
      color: currentLane.color,
      hasTopLine,
      continuations,
      connections,
      maxColumn: Math.max(...touchedColumns),
      refs: rowRefs,
    }
  })

  // Resolve temporary tokens only after the full graph is known. The oldest
  // commit node owned by a token is stable when newer descendants are loaded,
  // unlike its column, colour, or newest tip.
  const laneAnchors = new Map<number, string>()
  for (const row of internalRows) {
    laneAnchors.set(row.laneToken, row.sha)
  }
  const laneIdForToken = (token: number) =>
    `lane:${laneAnchors.get(token) ?? laneOrigins.get(token) ?? token}`

  const rows: ReadonlyArray<ICommitGraphRow> = internalRows.map(row => ({
    sha: row.sha,
    laneId: laneIdForToken(row.laneToken),
    column: row.column,
    color: row.color,
    hasTopLine: row.hasTopLine,
    continuations: row.continuations.map(path => ({
      fromColumn: path.fromColumn,
      toColumn: path.toColumn,
      fromLaneId: laneIdForToken(path.fromLaneToken),
      toLaneId: laneIdForToken(path.toLaneToken),
      color: path.color,
    })),
    connections: row.connections.map(path => ({
      fromColumn: path.fromColumn,
      toColumn: path.toColumn,
      fromLaneId: laneIdForToken(path.fromLaneToken),
      toLaneId: laneIdForToken(path.toLaneToken),
      color: path.color,
    })),
    maxColumn: row.maxColumn,
    refs: row.refs.map(ref => ({
      refId: ref.refId,
      name: ref.name,
      sha: ref.sha,
      kind: ref.kind,
      isCurrent: ref.isCurrent,
      laneId: laneIdForToken(ref.laneToken),
      color: ref.color,
    })),
  }))

  const laneIds = new Array<string>()
  const laneColors = new Map<string, string>()
  const addLane = (id: string, color: string) => {
    if (!laneColors.has(id)) {
      laneIds.push(id)
      laneColors.set(id, color)
    }
  }

  for (const row of rows) {
    addLane(row.laneId, row.color)
    for (const path of [...row.continuations, ...row.connections]) {
      addLane(path.fromLaneId, path.color)
      addLane(path.toLaneId, path.color)
    }
  }

  // The current caller supplies the checked-out branch ref when HEAD is
  // attached. With a detached HEAD it cannot provide a canonical ref yet, so
  // the newest displayed row remains the conservative non-blanking fallback.
  const headLaneId =
    rows.flatMap(row => row.refs).find(ref => ref.isCurrent)?.laneId ??
    rows[0]?.laneId
  const controlsById = new Map<string, ICommitGraphLaneControl>()
  for (const row of rows) {
    for (const ref of row.refs) {
      const id = ref.refId
      if (!controlsById.has(id)) {
        controlsById.set(id, {
          id,
          laneId: ref.laneId,
          name: ref.name,
          kind: ref.kind,
          color: ref.color,
          isCurrent: ref.isCurrent,
          isHead: ref.laneId === headLaneId,
        })
      }
    }
  }

  const controlledLaneIds = new Set(
    [...controlsById.values()].map(control => control.laneId)
  )
  for (const laneId of laneIds) {
    if (controlledLaneIds.has(laneId)) {
      continue
    }

    controlsById.set(`commit:${laneId}`, {
      id: `commit:${laneId}`,
      laneId,
      name: shortestUniqueLaneAnchor(laneId, laneIds),
      kind: 'commit',
      color: laneColors.get(laneId) ?? GraphColors[0],
      isCurrent: false,
      isHead: laneId === headLaneId,
    })
  }

  return {
    rows,
    laneIds,
    laneControls: disambiguateLaneControlNames([...controlsById.values()]).sort(
      compareLaneControls
    ),
    maxColumn: rows.reduce((widest, row) => Math.max(widest, row.maxColumn), 0),
  }
}

/**
 * Resolves visibility without changing rows or columns. HEAD and the checked
 * out branch are always protected; soloing another lane keeps those anchors
 * visible as an explicit safety boundary.
 */
export function resolveCommitGraphLaneVisibility(
  graph: ICommitGraph,
  hiddenControlIds: ReadonlySet<string>,
  soloControlId: string | null
): ICommitGraphLaneVisibility {
  const controlsById = new Map(
    graph.laneControls.map(control => [control.id, control] as const)
  )
  const protectedLaneIds = new Set<string>()
  const headLaneId =
    graph.laneControls.find(control => control.isHead)?.laneId ??
    graph.rows[0]?.laneId
  if (headLaneId !== undefined) {
    protectedLaneIds.add(headLaneId)
  }
  for (const control of graph.laneControls) {
    if (control.isCurrent) {
      protectedLaneIds.add(control.laneId)
    }
  }

  const soloLaneId =
    soloControlId === null
      ? null
      : controlsById.get(soloControlId)?.laneId ?? null
  const hiddenLaneIds = new Set<string>()

  if (soloLaneId !== null) {
    for (const laneId of graph.laneIds) {
      if (laneId !== soloLaneId && !protectedLaneIds.has(laneId)) {
        hiddenLaneIds.add(laneId)
      }
    }
  } else {
    for (const controlId of hiddenControlIds) {
      const laneId = controlsById.get(controlId)?.laneId
      if (laneId !== undefined && !protectedLaneIds.has(laneId)) {
        hiddenLaneIds.add(laneId)
      }
    }
  }

  return {
    visibleLaneIds: new Set(
      graph.laneIds.filter(laneId => !hiddenLaneIds.has(laneId))
    ),
    hiddenLaneIds,
    protectedLaneIds,
    soloLaneId,
  }
}
