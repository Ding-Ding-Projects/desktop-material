import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'
import { PathLabel } from '../lib/path-label'
import { materialSymbolForStatus } from '../octicons'
import { MaterialSymbol } from '../lib/material-symbol'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface ICommittedFileItemProps {
  readonly availableWidth: number
  readonly file: CommittedFileChange
  readonly focused: boolean
}

export class CommittedFileItem extends React.Component<ICommittedFileItemProps> {
  public render() {
    const { file, focused } = this.props
    const { status } = file
    const fileStatus = mapStatus(status)

    // `#history .file-list .file` pads 4px on the left and 10px on the
    // right (see history/_file-list.scss), not the 10px/10px the base
    // `.file-list .file` rule uses elsewhere.
    const listItemPadding = 4 + 10
    // The status Material Symbol is a 16px glyph in a content-box chip with
    // 2px padding on all sides, so it actually occupies 16 + 2*2 = 20px.
    const statusWidth = 20
    // Matches `.path-label-component`'s `margin-right` in history/_file-list.scss.
    const filePathPadding = 6
    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      filePathPadding -
      statusWidth

    return (
      <div className="file">
        <PathLabel
          path={file.path}
          status={file.status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
        />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.NORTH}
        >
          <MaterialSymbol
            name={materialSymbolForStatus(status)}
            size={16}
            className={'status status-' + fileStatus.toLowerCase()}
          />
        </TooltippedContent>
      </div>
    )
  }
}
