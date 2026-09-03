import * as React from 'react'
import { Button } from '../lib/button'
import { encodePathAsUrl } from '../../lib/path'
import { MaterialSymbol } from '../lib/material-symbol'

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

interface ICICheckRunNoStepProps {
  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckExternally: () => void
}

/** The CI check no step view. */
export class CICheckRunNoStepItem extends React.PureComponent<ICICheckRunNoStepProps> {
  public render() {
    return (
      <div className="ci-check-run-no-steps">
        <p>
          There are no steps to display for this check.
          <Button
            className="button-with-icon"
            onClick={this.props.onViewCheckExternally}
            role="link"
          >
            View check details
            <MaterialSymbol name="open_in_new" />
          </Button>
        </p>

        <img src={PaperStackImage} alt="" />
      </div>
    )
  }
}
