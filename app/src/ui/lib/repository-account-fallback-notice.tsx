import * as React from 'react'
import { Disposable } from 'event-kit'
import { getAccountKey } from '../../models/account'
import { getRepositoryAccountAskNotice } from '../../lib/repository-account-fallback-copy'
import { IRepositoryAccountTarget } from '../../lib/repository-account-fallback'
import {
  approveRepositoryAccountFallback,
  getRepositoryAccountFallbackOffer,
  IRepositoryAccountFallbackOffer,
  onRepositoryAccountFallbackOffersChanged,
} from '../../lib/repository-account-fallback-ask'
import { Button } from './button'

interface IRepositoryAccountFallbackNoticeProps {
  /** The repository whose standing offer, if any, should be shown. */
  readonly target: IRepositoryAccountTarget | null
  /**
   * Called after the user approves the identity. The surface re-runs whatever
   * failed; the approval makes that run pick the approved identity.
   */
  readonly onAccepted: () => void
  readonly disabled?: boolean
}

interface IRepositoryAccountFallbackNoticeState {
  readonly offer: IRepositoryAccountFallbackOffer | undefined
}

/**
 * The non-blocking "another account can see this repository" notice.
 *
 * Shown next to a surface's own not-found error while
 * `autoSwitchAccountToRepositoryOwner` is off. It never switches anything by
 * itself: the single action records a per-repository approval and asks the
 * surface to retry, so the user's decision — not the app's guess — is what
 * changes which identity is used.
 *
 * Rendered as `role="status"` rather than `role="alert"`: the surface's own
 * error already announced the failure, and this is the remedy offered
 * alongside it.
 */
export class RepositoryAccountFallbackNotice extends React.Component<
  IRepositoryAccountFallbackNoticeProps,
  IRepositoryAccountFallbackNoticeState
> {
  private subscription: Disposable | null = null

  public constructor(props: IRepositoryAccountFallbackNoticeProps) {
    super(props)
    this.state = { offer: this.currentOffer(props) }
  }

  public componentDidMount() {
    this.subscription = onRepositoryAccountFallbackOffersChanged(this.refresh)
    this.refresh()
  }

  public componentDidUpdate(prevProps: IRepositoryAccountFallbackNoticeProps) {
    if (prevProps.target !== this.props.target) {
      this.refresh()
    }
  }

  public componentWillUnmount() {
    this.subscription?.dispose()
    this.subscription = null
  }

  private currentOffer(props: IRepositoryAccountFallbackNoticeProps) {
    return props.target === null
      ? undefined
      : getRepositoryAccountFallbackOffer(props.target)
  }

  private readonly refresh = () => {
    const offer = this.currentOffer(this.props)
    if (offer !== this.state.offer) {
      this.setState({ offer })
    }
  }

  private readonly onUseAccount = () => {
    const { offer } = this.state
    if (offer === undefined) {
      return
    }

    approveRepositoryAccountFallback(offer.target, getAccountKey(offer.account))
    this.props.onAccepted()
  }

  public render() {
    const { offer } = this.state
    if (offer === undefined) {
      return null
    }

    const notice = getRepositoryAccountAskNotice(offer.target, offer.account)

    return (
      <div className="repository-account-fallback-notice" role="status">
        <div className="repository-account-fallback-notice-text">
          <strong>{notice.title}</strong>
          <span>{notice.body}</span>
        </div>
        <Button
          disabled={this.props.disabled === true}
          onClick={this.onUseAccount}
        >
          {notice.actionLabel}
        </Button>
      </div>
    )
  }
}
