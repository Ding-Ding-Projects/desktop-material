import * as React from 'react'

import { PathLabel } from '../lib/path-label'
import { materialSymbolForStatus } from '../octicons'
import { MaterialSymbol } from '../lib/material-symbol'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { mapStatus } from '../../lib/status'
import { WorkingDirectoryFileChange } from '../../models/status'
import { TooltipDirection } from '../lib/tooltip'
import { TooltippedContent } from '../lib/tooltipped-content'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { IMatches } from '../../lib/fuzzy-find'

interface IChangedFileProps {
  readonly file: WorkingDirectoryFileChange
  readonly include: boolean | null
  readonly availableWidth: number
  readonly disableSelection: boolean
  readonly checkboxTooltip?: string
  readonly focused: boolean
  /** The characters in the file path to highlight */
  readonly matches?: IMatches
  readonly onIncludeChanged: (
    file: WorkingDirectoryFileChange,
    include: boolean
  ) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, {}> {
  private handleCheckboxChange = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onIncludeChanged(this.props.file, include)
  }

  private get checkboxValue(): CheckboxValue {
    if (this.props.include === true) {
      return CheckboxValue.On
    } else if (this.props.include === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  public render() {
    const {
      file,
      availableWidth,
      disableSelection,
      checkboxTooltip,
      focused,
      matches,
    } = this.props
    const { status, path } = file
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const checkboxWidth = 20
    // The status Material Symbol is a 16px glyph in a content-box chip with
    // 2px padding on all sides (see `#changes-list .file .status` in
    // _changes-list.scss), so it actually occupies 16 + 2*2 = 20px.
    const statusWidth = 20
    // Matches `.path-label-component`'s `margin-right` in _changes-list.scss.
    const filePadding = 6

    const availablePathWidth =
      availableWidth -
      listItemPadding -
      checkboxWidth -
      filePadding -
      statusWidth

    const includedText =
      this.props.include === true
        ? 'included'
        : this.props.include === undefined
        ? 'partially included'
        : 'not included'

    const pathScreenReaderMessage = `${path} ${mapStatus(
      status
    )} ${includedText}`

    return (
      <div className="file">
        <TooltippedContent
          tooltip={checkboxTooltip}
          direction={TooltipDirection.EAST}
          tagName="div"
        >
          <Checkbox
            // The checkbox doesn't need to be tab reachable since we emulate
            // checkbox behavior on the list item itself, ie hitting space bar
            // while focused on a row will toggle selection.
            tabIndex={-1}
            value={this.checkboxValue}
            onChange={this.handleCheckboxChange}
            disabled={disableSelection}
            ariaLabel={`Include ${path} in commit`}
          />
        </TooltippedContent>

        <PathLabel
          path={path}
          status={status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
          matches={matches}
        />

        <AriaLiveContainer
          message={pathScreenReaderMessage}
          preserveTechnicalMessage={true}
        />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.EAST}
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
