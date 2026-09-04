import * as React from 'react'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import {
  createIssueTrackerItemLink,
  issueTrackerProviderLabel,
} from '../../lib/issue-trackers/issue-tracker-links'
import type {
  IIssueTrackerItemLinkInput,
  LinkedIssueTrackerProvider,
} from '../../lib/issue-trackers/issue-tracker-links'
import { getPersistedLanguageMode } from '../../lib/i18n'
import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IIssueTrackerReferenceProps {
  readonly provider: LinkedIssueTrackerProvider
  readonly endpoint: string
  readonly accountId: string | null
  readonly connected: boolean
  readonly onOpenInBrowser: (url: string) => Promise<boolean>
}

interface IIssueTrackerReferenceState {
  readonly scopeId: string
  readonly itemId: string
  readonly opening: boolean
  readonly error: string | null
}

/** A small, real link surface for an already verified provider connection. */
export class IssueTrackerReference extends React.Component<
  IIssueTrackerReferenceProps,
  IIssueTrackerReferenceState
> {
  private localize(english: string, cantonese: string): string {
    switch (getPersistedLanguageMode()) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private referenceValue(value: string): {
    readonly english: string
    readonly cantonese: string
  } {
    return value.trim().length === 0
      ? { english: 'empty', cantonese: '空白' }
      : { english: 'entered for this link', cantonese: '今次連結已輸入' }
  }

  private renderReferenceExplanation(
    kind: 'scope' | 'item',
    value: string
  ): JSX.Element {
    const settingId = `issue-reference-${this.props.provider}-${kind}`
    const current = this.referenceValue(value)
    const label = kind === 'scope' ? this.scopeLabel : this.itemLabel
    return (
      <SettingExplanation
        settingId={settingId}
        summary={this.localize('What this setting changes', '呢個設定會改咩')}
        explanation={this.localize(
          `Provides the ${label.toLowerCase()} used to construct one ${
            this.providerName
          } link from the verified connection. It is not added to the provider credential.`,
          `提供由已驗證連線建立一條 ${this.providerName} 連結所用嘅 ${label}；唔會加入供應商憑證。`
        )}
        source="runtime-only"
        provenance={this.localize(
          `This value is temporary for the current reference form. Current value: ${current.english}. Shipped value: empty.`,
          `呢個值只喺目前 reference 表格暫時使用。目前值：${current.cantonese}。出廠值：空白。`
        )}
      />
    )
  }

  public state: IIssueTrackerReferenceState = {
    scopeId: '',
    itemId: '',
    opening: false,
    error: null,
  }

  private get providerName() {
    return issueTrackerProviderLabel(this.props.provider)
  }

  private get scopeLabel() {
    return this.props.provider === 'trello' ? 'Board ID' : 'Project key'
  }

  private get itemLabel() {
    return this.props.provider === 'trello' ? 'Card link ID' : 'Issue key'
  }

  private onScopeChanged = (scopeId: string) =>
    this.setState({ scopeId, error: null })

  private onItemChanged = (itemId: string) =>
    this.setState({ itemId, error: null })

  private openReference = async () => {
    if (!this.props.connected || this.props.accountId === null) {
      return
    }

    this.setState({ opening: true, error: null })
    const input: IIssueTrackerItemLinkInput = {
      provider: this.props.provider,
      endpoint: this.props.endpoint,
      accountId: this.props.accountId,
      scopeId: this.state.scopeId.trim(),
      itemId: this.state.itemId.trim(),
    }

    try {
      const url = createIssueTrackerItemLink(input)
      const opened = await this.props.onOpenInBrowser(url)
      if (!opened) {
        throw new Error('browser-open-failed')
      }
      this.setState({ opening: false })
    } catch {
      this.setState({
        opening: false,
        error: `Desktop could not open this ${
          this.providerName
        } reference. Check the ${this.scopeLabel.toLowerCase()} and ${this.itemLabel.toLowerCase()} and try again.`,
      })
    }
  }

  public render() {
    const idPrefix = `issue-tracker-reference-${this.props.provider}`
    const hasReference =
      this.state.scopeId.trim().length > 0 &&
      this.state.itemId.trim().length > 0
    const disabled =
      !this.props.connected ||
      this.props.accountId === null ||
      !hasReference ||
      this.state.opening

    return (
      <section
        className="issue-tracker-reference"
        aria-labelledby={`${idPrefix}-heading`}
      >
        <div className="issue-tracker-reference-header">
          <div>
            <h3 id={`${idPrefix}-heading`}>
              Open a {this.providerName} reference
            </h3>
            <p>
              Build a provider link from the verified connection above. No
              credential is placed in the URL.
            </p>
          </div>
        </div>
        {!this.props.connected || this.props.accountId === null ? (
          <p className="issue-tracker-reference-status" role="status">
            Connect {this.providerName} above before opening a reference.
          </p>
        ) : (
          <>
            <div className="issue-tracker-reference-fields">
              <TextBox
                label={this.localize(
                  this.scopeLabel,
                  this.props.provider === 'trello' ? 'Board ID' : 'Project key'
                )}
                value={this.state.scopeId}
                disabled={this.state.opening}
                onValueChanged={this.onScopeChanged}
                ariaDescribedBy={
                  settingExplanationDescriptionIds(
                    `issue-reference-${this.props.provider}-scope`
                  ).ariaDescribedBy
                }
              />
              {this.renderReferenceExplanation('scope', this.state.scopeId)}
              <TextBox
                label={this.localize(
                  this.itemLabel,
                  this.props.provider === 'trello'
                    ? 'Card link ID'
                    : 'Issue key'
                )}
                value={this.state.itemId}
                disabled={this.state.opening}
                onValueChanged={this.onItemChanged}
                ariaDescribedBy={
                  settingExplanationDescriptionIds(
                    `issue-reference-${this.props.provider}-item`
                  ).ariaDescribedBy
                }
              />
              {this.renderReferenceExplanation('item', this.state.itemId)}
              <Button disabled={disabled} onClick={this.openReference}>
                {this.state.opening
                  ? 'Opening…'
                  : `Open ${this.providerName} reference`}
              </Button>
            </div>
            {this.state.opening && (
              <p className="issue-tracker-reference-status" role="status">
                Opening the {this.providerName} reference…
              </p>
            )}
          </>
        )}
        {this.state.error !== null && (
          <p className="provider-sign-in-error" role="alert">
            {this.state.error}
          </p>
        )}
      </section>
    )
  }
}
