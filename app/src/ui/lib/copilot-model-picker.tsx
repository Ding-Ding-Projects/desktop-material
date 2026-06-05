import * as React from 'react'
import memoizeOne from 'memoize-one'

import { DefaultCopilotModel } from '../../lib/stores/copilot-store'
import { type IBYOKProvider, encodeModelKey } from '../../lib/copilot/byok'
import { IFilterListGroup, IFilterListItem } from './filter-list'
import { PopoverDropdown } from './popover-dropdown'
import { SectionFilterList } from './section-filter-list'
// HACK(copilot-sdk): this `ModelBilling` imports should be removed when we
// update to the fixed @github/copilot-sdk version that includes the new billing
// fields in the ModelInfo type
import {
  ModelBilling,
  ModelBillingTokenPricesLongContext,
} from '@github/copilot-sdk/dist/generated/rpc'
import { ModelInfo } from '@github/copilot-sdk'

interface ICopilotModelPickerProps {
  readonly label: string
  readonly copilotModels: ReadonlyArray<ModelInfo>
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly value: string
  readonly onChange: (value: string) => void
}

interface ICopilotModelPickerState {
  readonly filterText: string
  readonly selectedItemId: string | undefined
}

interface ICopilotModelListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly value: string
  readonly name: string
  readonly billing: ModelBilling | undefined
  readonly isDefault: boolean
}

const ModelPickerCompactRowHeight = 36
const ModelPickerUsageBillingRowHeight = 104

const getPremiumRequestsBillingLabel = (billing: ModelBilling | undefined) => {
  const multiplier = billing?.multiplier
  return multiplier === undefined ? '' : ` (${multiplier}x)`
}

const getCopilotModelLabel = (item: ICopilotModelListItem) => {
  const billingLabel = getPremiumRequestsBillingLabel(item.billing)
  return item.isDefault
    ? `${item.name}${billingLabel} (default)`
    : `${item.name}${billingLabel}`
}

const formatCompactNumber = (value: number) => {
  if (Number.isInteger(value)) {
    return value.toString()
  }

  return value.toFixed(1).replace(/\.0$/, '')
}

const formatTokenBatchSize = (tokenCount: number) => {
  if (tokenCount >= 1_000_000) {
    return `${formatCompactNumber(tokenCount / 1_000_000)}M`
  }

  if (tokenCount >= 1_000) {
    return `${formatCompactNumber(tokenCount / 1_000)}K`
  }

  return tokenCount.toString()
}

const getCopilotModelGroups = (
  copilotModels: ReadonlyArray<ModelInfo>,
  byokProviders: ReadonlyArray<IBYOKProvider>
): ReadonlyArray<IFilterListGroup<ICopilotModelListItem>> => {
  const groups = new Array<IFilterListGroup<ICopilotModelListItem>>()

  if (copilotModels.length > 0) {
    const providerName = 'GitHub Copilot'

    groups.push({
      identifier: providerName,
      items: copilotModels.map(model => {
        const value = encodeModelKey({
          kind: 'copilot',
          modelId: model.id,
        })

        return {
          id: value,
          text: [model.name, model.id, providerName],
          value,
          name: model.name,
          // HACK(copilot-sdk): this `as ModelBilling` should be removed when we update to the
          // fixed @github/copilot-sdk version that includes the new billing fields in
          // the ModelInfo type
          billing: model.billing as ModelBilling | undefined,
          isDefault: model.id === DefaultCopilotModel,
        }
      }),
    })
  }

  for (const provider of byokProviders) {
    if (provider.models.length === 0) {
      continue
    }

    groups.push({
      identifier: provider.name,
      items: provider.models.map(model => {
        const value = encodeModelKey({
          kind: 'byok',
          providerId: provider.id,
          modelId: model.id,
        })

        return {
          id: value,
          text: [model.name, model.id, provider.name],
          value,
          name: model.name,
          billing: undefined,
          isDefault: false,
        }
      }),
    })
  }

  return groups
}

export const hasCopilotModelPickerItems = (
  copilotModels: ReadonlyArray<ModelInfo>,
  byokProviders: ReadonlyArray<IBYOKProvider>
) =>
  copilotModels.length > 0 ||
  byokProviders.some(provider => provider.models.length > 0)

export class CopilotModelPicker extends React.Component<
  ICopilotModelPickerProps,
  ICopilotModelPickerState
> {
  private readonly popoverRef = React.createRef<PopoverDropdown>()
  private readonly getGroups = memoizeOne(getCopilotModelGroups)
  private readonly getSelectedItem = memoizeOne(
    (
      groups: ReadonlyArray<IFilterListGroup<ICopilotModelListItem>>,
      selectedItemId: string | undefined,
      value: string
    ) => {
      const items = groups.flatMap(group => group.items)
      const selectedItem =
        selectedItemId === undefined
          ? undefined
          : items.find(item => item.id === selectedItemId)

      return selectedItem ?? items.find(item => item.value === value) ?? null
    }
  )
  private readonly getItemByValue = memoizeOne(
    (
      groups: ReadonlyArray<IFilterListGroup<ICopilotModelListItem>>,
      value: string
    ) => groups.flatMap(group => group.items).find(item => item.value === value)
  )

  public constructor(props: ICopilotModelPickerProps) {
    super(props)

    this.state = {
      filterText: '',
      selectedItemId: undefined,
    }
  }

  public componentDidUpdate(prevProps: ICopilotModelPickerProps) {
    if (
      prevProps.value !== this.props.value ||
      prevProps.copilotModels !== this.props.copilotModels ||
      prevProps.byokProviders !== this.props.byokProviders
    ) {
      this.setState({ selectedItemId: undefined })
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (item: ICopilotModelListItem) => {
    this.popoverRef.current?.closePopover()
    this.setState({ selectedItemId: item.id })
    this.props.onChange(item.value)
  }

  private onSelectionChanged = (selectedItem: ICopilotModelListItem | null) => {
    this.setState({ selectedItemId: selectedItem?.id })
  }

  private getRowHeight = ({
    item,
  }: {
    readonly item: ICopilotModelListItem | null
  }) =>
    item?.billing?.tokenPrices === undefined
      ? ModelPickerCompactRowHeight
      : ModelPickerUsageBillingRowHeight

  private renderUsageBillingRow = (label: string, value: number) => {
    return (
      <div className="copilot-model-billing-row">
        <span className="copilot-model-billing-label">{label}</span>
        <span className="copilot-model-billing-value">{value}</span>
      </div>
    )
  }

  private renderUsageBilling = (
    billing: ModelBilling | undefined,
    className?: string
  ) => {
    if (billing?.tokenPrices === undefined) {
      return null
    }

    const tokenPrices: ModelBillingTokenPricesLongContext = billing.tokenPrices
    const billingClassName =
      className === undefined
        ? 'copilot-model-billing'
        : `copilot-model-billing ${className}`

    return (
      <div className={billingClassName}>
        <div className="copilot-model-billing-heading">
          AI credits per{' '}
          {formatTokenBatchSize(billing.tokenPrices.batchSize ?? 0)} tokens
        </div>
        {this.renderUsageBillingRow('Input', tokenPrices.inputPrice ?? 0)}
        {this.renderUsageBillingRow(
          'Cached input',
          tokenPrices.cachePrice ?? 0
        )}
        {this.renderUsageBillingRow('Output', tokenPrices.outputPrice ?? 0)}
      </div>
    )
  }

  private renderModel = (item: ICopilotModelListItem) => {
    return (
      <div className="copilot-model-list-item">
        <div className="info">
          <div className="title">{getCopilotModelLabel(item)}</div>
          {this.renderUsageBilling(item.billing)}
        </div>
      </div>
    )
  }

  private renderGroupHeader = (identifier: string) => {
    return (
      <div className="copilot-model-list-group filter-list-group-header">
        {identifier}
      </div>
    )
  }

  private renderNoItems = () => {
    return <div className="copilot-model-list-empty">No models found.</div>
  }

  private getItemAriaLabel = (item: ICopilotModelListItem) => {
    const label = getCopilotModelLabel(item)
    const billing = item.billing

    if (billing?.tokenPrices === undefined) {
      return label
    }

    const tokenPrices: ModelBillingTokenPricesLongContext = billing.tokenPrices

    return `${label}, AI credits per ${formatTokenBatchSize(
      billing.tokenPrices.batchSize ?? 0
    )} tokens, Input ${tokenPrices.inputPrice ?? 0}, Cached input ${
      tokenPrices.cachePrice ?? 0
    }, Output ${tokenPrices.outputPrice ?? 0}`
  }

  private getGroupAriaLabel = (group: number) => {
    const groups = this.getGroups(
      this.props.copilotModels,
      this.props.byokProviders
    )
    const modelGroup = groups[group]

    return modelGroup === undefined ? undefined : modelGroup.identifier
  }

  public render() {
    const groups = this.getGroups(
      this.props.copilotModels,
      this.props.byokProviders
    )
    const selectedItem = this.getSelectedItem(
      groups,
      this.state.selectedItemId,
      this.props.value
    )
    const buttonItem = this.getItemByValue(groups, this.props.value)

    return (
      <div className="copilot-model-picker-container">
        <PopoverDropdown
          className="copilot-model-picker"
          contentTitle="Choose a model"
          buttonContent={
            <div className="copilot-model-picker-button-content">
              <span className="name">
                {buttonItem ? getCopilotModelLabel(buttonItem) : ''}
              </span>
            </div>
          }
          label={this.props.label}
          ref={this.popoverRef}
        >
          <SectionFilterList<ICopilotModelListItem>
            className="copilot-model-list"
            rowHeight={this.getRowHeight}
            groups={groups}
            selectedItem={selectedItem}
            renderItem={this.renderModel}
            renderGroupHeader={this.renderGroupHeader}
            filterText={this.state.filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            invalidationProps={groups}
            onItemClick={this.onItemClick}
            onSelectionChanged={this.onSelectionChanged}
            getItemAriaLabel={this.getItemAriaLabel}
            getGroupAriaLabel={this.getGroupAriaLabel}
            placeholderText="Filter models"
            renderNoItems={this.renderNoItems}
          />
        </PopoverDropdown>
        {this.renderUsageBilling(
          buttonItem?.billing,
          'copilot-model-picker-selected-billing'
        )}
      </div>
    )
  }
}
