import * as React from 'react'
import { MaterialSymbol } from '../lib/material-symbol'

/**
 * A component used for displaying short success messages inline
 * in a dialog. These success messages (there can be more than one)
 * should be rendered as the first child of the <Dialog> component
 * and support arbitrary content.
 *
 * The content (success message) is paired with a check icon and receive
 * special styling.
 *
 * Provide `children` to display content inside the error dialog.
 */
export class DialogSuccess extends React.Component {
  public render() {
    return (
      <div className="dialog-banner dialog-success" role="alert">
        <MaterialSymbol name="check" />
        <div>{this.props.children}</div>
      </div>
    )
  }
}
