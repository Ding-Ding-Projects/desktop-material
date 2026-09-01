import * as React from 'react'
import type { AccountQuotaSnapshot } from '@github/copilot-sdk/dist/generated/rpc'
import type { Account } from '../../models/account'
import { Button } from '../lib/button'
import type {
  CopilotQuotaSnapshots,
  ICopilotQuotaSnapshotState,
} from '../../lib/stores/copilot-store'

export interface ISnapshotCardProps {
  readonly account: Account
  readonly snapshots: CopilotQuotaSnapshots | null
  readonly quotaState?: ICopilotQuotaSnapshotState
  readonly onConfigureModels?: (account: Account) => void
}

function formatPercent(snapshot: AccountQuotaSnapshot): string {
  if (snapshot.isUnlimitedEntitlement) return 'No usage limit'
  const used = Math.max(0, Math.min(100, 100 - snapshot.remainingPercentage))
  return `${Math.round(used)}% used`
}

function formatReset(resetDate: string | undefined): string {
  if (resetDate === undefined) return 'Reset date unavailable'
  const parsed = new Date(resetDate)
  return Number.isNaN(parsed.getTime())
    ? 'Reset date unavailable'
    : `Resets ${parsed.toLocaleString()}`
}

export function SnapshotCard({
  account,
  snapshots,
  quotaState,
  onConfigureModels,
}: ISnapshotCardProps): JSX.Element {
  const state = quotaState?.status
  return (
    <section
      className="copilot-snapshot-card"
      aria-label={`Copilot usage for ${account.login}`}
    >
      <header className="copilot-snapshot-account">
        <div>
          <strong>@{account.login}</strong>
          <div>{account.friendlyEndpoint}</div>
        </div>
        {onConfigureModels !== undefined && (
          <Button
            onClick={() => onConfigureModels(account)}
            ariaLabel={`Configure models for ${account.login}`}
          >
            Configure models…
          </Button>
        )}
      </header>
      {state === 'loading' && <p role="status">Loading Copilot usage…</p>}
      {state === 'unavailable' && (
        <p role="status">Copilot usage unavailable for this account.</p>
      )}
      {state === 'error' && (
        <p role="alert">Copilot usage could not be loaded.</p>
      )}
      {state === 'stale' && (
        <p role="status">Showing stale Copilot usage data.</p>
      )}
      {snapshots === null && state === undefined && (
        <p role="status">Loading Copilot usage…</p>
      )}
      {snapshots !== null && snapshots.size === 0 && (
        <p role="status">No Copilot usage data available yet.</p>
      )}
      {snapshots !== null && snapshots.size > 0 && (
        <ul>
          {[...snapshots.entries()].map(([key, snapshot]) => (
            <li key={key}>
              <span>{key}</span>
              <strong>{formatPercent(snapshot)}</strong>
              <span>
                {snapshot.usedRequests} used of {snapshot.entitlementRequests}{' '}
                available
              </span>
              <span>{formatReset(snapshot.resetDate)}</span>
            </li>
          ))}
        </ul>
      )}
      {quotaState?.fetchedAt !== null &&
        quotaState?.fetchedAt !== undefined && (
          <small>
            Updated {new Date(quotaState.fetchedAt).toLocaleString()}
          </small>
        )}
    </section>
  )
}
