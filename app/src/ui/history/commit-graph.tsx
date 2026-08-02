import * as React from 'react'
import {
  ICommitGraph,
  ICommitGraphPath,
  ICommitGraphRow,
} from './commit-graph-model'

export const CommitGraphColumnWidth = 16
export const CommitGraphNodeRadius = 4
export const CommitGraphStrokeWidth = 2

/**
 * A half-stroke of overlap keeps adjacent row segments joined after browser
 * zoom and display scaling. The viewport SVG clips the excess at its own top
 * and bottom rather than clipping every virtual row independently.
 */
export const CommitGraphBoundaryOverlap = CommitGraphStrokeWidth / 2
const DefaultRowHeight = 50

const xForColumn = (column: number) =>
  column * CommitGraphColumnWidth + CommitGraphColumnWidth / 2

function renderPath(
  path: ICommitGraphPath,
  startY: number,
  endY: number,
  key: string
) {
  const fromX = xForColumn(path.fromColumn)
  const toX = xForColumn(path.toColumn)
  const middleY = (startY + endY) / 2
  return (
    <path
      key={key}
      d={`M ${fromX} ${startY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${endY}`}
      stroke={path.color}
    />
  )
}

interface ICommitGraphProps {
  readonly row: ICommitGraphRow

  /**
   * The drawing height, which has to equal the list's row pitch. Anything else
   * and a lane stops where its neighbour above ended, leaving the column full
   * of gaps instead of continuous branch lines.
   */
  readonly rowHeight?: number

  /**
   * The lane count to size the drawing to. Sizing to the row's own widest lane
   * clips whichever lanes only open further down the history, so a column that
   * has to line up across rows passes the graph-wide count here.
   */
  readonly columnCount?: number
}

export function CommitGraph({
  row,
  rowHeight,
  columnCount,
}: ICommitGraphProps) {
  const height = rowHeight ?? DefaultRowHeight
  const nodeY = height / 2
  const width = (columnCount ?? row.maxColumn + 1) * CommitGraphColumnWidth
  const nodeX = xForColumn(row.column)

  return (
    <svg
      className="commit-graph"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {row.continuations.map((path, index) =>
        renderPath(path, 0, height, `continuation-${index}`)
      )}
      {row.hasTopLine ? (
        <path d={`M ${nodeX} 0 L ${nodeX} ${nodeY}`} stroke={row.color} />
      ) : null}
      {row.connections.map((path, index) =>
        renderPath(path, nodeY, height, `connection-${index}`)
      )}
      <circle
        cx={nodeX}
        cy={nodeY}
        r={CommitGraphNodeRadius}
        fill={row.color}
      />
    </svg>
  )
}

interface ICommitGraphViewportProps {
  readonly graph: ICommitGraph
  readonly rowHeight: number
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly firstRow: number
  readonly lastRow: number
}

function renderViewportPath(
  path: ICommitGraphPath,
  startY: number,
  endY: number,
  row: number,
  segment: 'continuation' | 'connection',
  index: number
) {
  const fromX = xForColumn(path.fromColumn)
  const toX = xForColumn(path.toColumn)
  const middleY = (startY + endY) / 2

  return (
    <path
      key={`${row}-${segment}-${index}`}
      d={`M ${fromX} ${startY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${endY}`}
      stroke={path.color}
      data-row={row}
      data-segment={segment}
      data-start-y={startY}
      data-end-y={endY}
    />
  )
}

/**
 * Draws the virtual history window in one SVG coordinate space. Rows remain
 * virtualized DOM options, but their lane segments meet in this shared layer
 * instead of being clipped into one SVG per row.
 */
export function CommitGraphViewport({
  graph,
  rowHeight,
  scrollTop,
  viewportHeight,
  firstRow,
  lastRow,
}: ICommitGraphViewportProps) {
  const width = (graph.maxColumn + 1) * CommitGraphColumnWidth
  const drawings = new Array<JSX.Element>()

  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex++) {
    const row = graph.rows[rowIndex]
    if (row === undefined) {
      continue
    }

    const rowTop = rowIndex * rowHeight - scrollTop
    const nodeY = rowTop + rowHeight / 2
    const rowBottom = rowTop + rowHeight
    const nodeX = xForColumn(row.column)

    row.continuations.forEach((path, index) => {
      drawings.push(
        renderViewportPath(
          path,
          rowTop - CommitGraphBoundaryOverlap,
          rowBottom + CommitGraphBoundaryOverlap,
          rowIndex,
          'continuation',
          index
        )
      )
    })

    if (row.hasTopLine) {
      drawings.push(
        <path
          key={`${rowIndex}-top`}
          d={`M ${nodeX} ${
            rowTop - CommitGraphBoundaryOverlap
          } L ${nodeX} ${nodeY}`}
          stroke={row.color}
          data-row={rowIndex}
          data-segment="top"
          data-start-y={rowTop - CommitGraphBoundaryOverlap}
          data-end-y={nodeY}
        />
      )
    }

    row.connections.forEach((path, index) => {
      drawings.push(
        renderViewportPath(
          path,
          nodeY,
          rowBottom + CommitGraphBoundaryOverlap,
          rowIndex,
          'connection',
          index
        )
      )
    })

    drawings.push(
      <circle
        key={`${rowIndex}-node`}
        cx={nodeX}
        cy={nodeY}
        r={CommitGraphNodeRadius}
        fill={row.color}
        data-row={rowIndex}
        data-segment="node"
      />
    )
  }

  return (
    <svg
      className="history-graph-viewport-svg"
      width={width}
      height={viewportHeight}
      viewBox={`0 0 ${width} ${viewportHeight}`}
      aria-hidden="true"
    >
      {drawings}
    </svg>
  )
}
