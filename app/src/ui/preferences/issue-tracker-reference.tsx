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
                label={this.scopeLabel}
                value={this.state.scopeId}
                disabled={this.state.opening}
                onValueChanged={this.onScopeChanged}
              />
              <TextBox
                label={this.itemLabel}
                value={this.state.itemId}
                disabled={this.state.opening}
                onValueChanged={this.onItemChanged}
              />
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
