import * as React from 'react'
import { ICommitGraphPath, ICommitGraphRow } from './commit-graph-model'

export const CommitGraphColumnWidth = 16
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
      <circle cx={nodeX} cy={nodeY} r="4" fill={row.color} />
    </svg>
  )
}
