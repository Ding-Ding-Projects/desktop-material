import * as React from 'react'

import { type CopilotFeature } from '../../lib/stores/copilot-store'
import { Button } from '../lib/button'
import { type ICopilotModelPickerSelectionInfo } from '../lib/copilot-model-picker'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ICopilotModelSelectionInfoProps {
  readonly feature: CopilotFeature
  readonly selectionInfo: ICopilotModelPickerSelectionInfo
}

interface ICopilotModelSelectionInfoState {
  readonly showCostDetails: boolean
}

export class CopilotModelSelectionInfo extends React.Component<
  ICopilotModelSelectionInfoProps,
  ICopilotModelSelectionInfoState
> {
  private costDetailsButton: HTMLButtonElement | null = null

  public constructor(props: ICopilotModelSelectionInfoProps) {
    super(props)
    this.state = { showCostDetails: false }
  }

  private get costDetailsContentId() {
    return `copilot-model-cost-details-${this.props.feature}`
  }

  private get costDetailsHeaderId() {
    return `copilot-model-cost-details-header-${this.props.feature}`
  }

  private onCostDetailsButtonRef = (button: HTMLButtonElement | null) => {
    this.costDetailsButton = button
  }

  private onCostDetailsButtonClick = () => {
    this.setState(state => ({ showCostDetails: !state.showCostDetails }))
  }

  private onCostDetailsButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key !== 'Escape' || !this.state.showCostDetails) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.closeCostDetails()
  }

  private closeCostDetails = () => {
    this.setState({ showCostDetails: false })
  }

  private renderCostDetailsRow(label: string, value: string) {
    return (
      <div className="copilot-model-picker-cost-details-row">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    )
  }

  private renderCostDetailsPopover() {
    const { selectionInfo } = this.props
    const { tokenPriceDetails } = selectionInfo
    const hasModelDetails =
      selectionInfo.contextWindow !== null ||
      selectionInfo.reasoningEffortLevels !== null

    return (
      <Popover
        ariaLabelledby={this.costDetailsHeaderId}
        anchor={this.costDetailsButton}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        className="copilot-model-picker-cost-details-popover"
        decoration={PopoverDecoration.Balloon}
        isDialog={false}
        onMousedownOutside={this.closeCostDetails}
        onClickOutside={this.closeCostDetails}
        trapFocus={false}
      >
        <div
          id={this.costDetailsContentId}
          className="copilot-model-picker-cost-details"
        >
          <div className="copilot-model-picker-cost-details-header">
            <h3 id={this.costDetailsHeaderId}>{selectionInfo.name}</h3>
            {selectionInfo.modelPickerCategory === null ? null : (
              <span>{selectionInfo.modelPickerCategory}</span>
            )}
          </div>

          {hasModelDetails ? (
            <dl className="copilot-model-picker-cost-details-section">
              {selectionInfo.contextWindow === null
                ? null
                : this.renderCostDetailsRow(
                    'Context',
                    selectionInfo.contextWindow
                  )}
              {selectionInfo.reasoningEffortLevels === null
                ? null
                : this.renderCostDetailsRow(
                    'Reasoning',
                    selectionInfo.reasoningEffortLevels
                  )}
            </dl>
          ) : null}

          <div className="copilot-model-picker-cost-details-section">
            <h4>AI credits per {tokenPriceDetails.batchSize} tokens</h4>
            <dl>
              {this.renderCostDetailsRow('Input', tokenPriceDetails.inputPrice)}
              {this.renderCostDetailsRow(
                'Cached input',
                tokenPriceDetails.cachePrice
              )}
              {this.renderCostDetailsRow(
                'Output',
                tokenPriceDetails.outputPrice
              )}
            </dl>
          </div>
        </div>
      </Popover>
    )
  }

  public render() {
    return (
      <div className="copilot-model-picker-selection-info">
        <Button
          ariaControls={this.costDetailsContentId}
          ariaExpanded={this.state.showCostDetails}
          ariaLabel="Show Copilot model credit costs"
          className="copilot-model-picker-selection-info-button"
          onButtonRef={this.onCostDetailsButtonRef}
          onClick={this.onCostDetailsButtonClick}
          onKeyDown={this.onCostDetailsButtonKeyDown}
          size="small"
          tooltip="Show credit costs"
        >
          <Octicon symbol={octicons.info} />
        </Button>
        <span>{this.props.selectionInfo.summary}</span>
        {this.state.showCostDetails ? this.renderCostDetailsPopover() : null}
      </div>
    )
  }
}
