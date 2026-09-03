import * as React from 'react'
import type { AccountQuotaSnapshot } from '@github/copilot-sdk/dist/generated/rpc'
import type { Account } from '../../models/account'
import { t } from '../../lib/i18n'
import { tFunny } from '../../lib/funny-level-text'
import { formatNumber } from '../../lib/format-number'
import { getNumberFormatPreference } from '../../models/formatting-preferences'
import { copilotAccountTeleportTarget } from '../../lib/teleport-targets'
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
  readonly isDefaultAccount?: boolean
}

export function getCopilotAccountTargetSuffix(account: Account): string {
  return `${account.id}-${account.endpoint}`.replace(/[^a-zA-Z0-9-]/g, '_')
}

function formatPercent(snapshot: AccountQuotaSnapshot): string {
  if (snapshot.isUnlimitedEntitlement) return '∞'
  const used = Math.max(0, Math.min(100, 100 - snapshot.remainingPercentage))
  return t('copilot.quotaPercentUsed', {
    percent: formatNumber(Math.round(used), getNumberFormatPreference()),
  })
}

function QuotaProgress({
  snapshot,
}: {
  readonly snapshot: AccountQuotaSnapshot
}) {
  const used = snapshot.isUnlimitedEntitlement
    ? 0
    : Math.max(0, Math.min(100, 100 - snapshot.remainingPercentage))
  return (
    <div
      role="progressbar"
      aria-valuemin={snapshot.isUnlimitedEntitlement ? undefined : 0}
      aria-valuemax={snapshot.isUnlimitedEntitlement ? undefined : 100}
      aria-valuenow={snapshot.isUnlimitedEntitlement ? undefined : used}
      aria-valuetext={
        snapshot.isUnlimitedEntitlement
          ? t('copilot.quotaNoUsageLimit')
          : t('copilot.quotaPercentUsed', {
              percent: formatNumber(
                Math.round(used),
                getNumberFormatPreference()
              ),
            })
      }
      aria-label={
        snapshot.isUnlimitedEntitlement
          ? t('copilot.quotaNoUsageLimit')
          : t('copilot.quotaPercentUsed', {
              percent: formatNumber(
                Math.round(used),
                getNumberFormatPreference()
              ),
            })
      }
    />
  )
}

function formatReset(resetDate: string | undefined): string {
  if (resetDate === undefined) return t('copilot.quotaResetUnavailable')
  const parsed = new Date(resetDate)
  return Number.isNaN(parsed.getTime())
    ? t('copilot.quotaResetUnavailable')
    : parsed.toLocaleString()
}

export function SnapshotCard({
  account,
  snapshots,
  quotaState,
  onConfigureModels,
  isDefaultAccount = false,
}: ISnapshotCardProps): JSX.Element {
  const state = quotaState?.status
  const overviewTarget = copilotAccountTeleportTarget(
    'account-overview',
    account.id,
    account.endpoint
  )
  const quotaTarget = copilotAccountTeleportTarget(
    'quota',
    account.id,
    account.endpoint
  )
  const configureTarget = copilotAccountTeleportTarget(
    'configure-models',
    account.id,
    account.endpoint
  )
  return (
    <section
      className="copilot-snapshot-card"
      data-teleport-target={overviewTarget}
      aria-label={t('copilot.accountUsage', { account: account.login })}
    >
      <div
        {...(isDefaultAccount
          ? { 'data-teleport-target': 'settings-copilot-account-overview' }
          : {})}
      >
      <header className="copilot-snapshot-account">
        <div>
          <strong>@{account.login}</strong>
          <div>{account.friendlyEndpoint}</div>
        </div>
        {onConfigureModels !== undefined && (
          <span
            {...(isDefaultAccount
              ? {
                  'data-teleport-target':
                    'settings-copilot-configure-models',
                }
              : {})}
          >
            <Button
              data-teleport-target={configureTarget}
              onClick={() => onConfigureModels(account)}
              ariaLabel={t('copilot.configureModels', {
                account: account.login,
              })}
            >
              {t('copilot.configureModels', { account: account.login })}
            </Button>
          </span>
        )}
      </header>
      </div>
      <p
        className="copilot-quota-lead"
        {...(isDefaultAccount
          ? { 'data-teleport-target': 'settings-copilot-quota' }
          : {})}
      >
        {tFunny('copilot.quotaLead')}
      </p>
      {state === 'loading' && <p role="status">{t('copilot.quotaLoading')}</p>}
      {state === 'unavailable' && (
        <p role="status">{t('copilot.quotaUnavailable')}</p>
      )}
      {state === 'error' && <p role="alert">{t('copilot.quotaError')}</p>}
      {state === 'stale' && <p role="status">{t('copilot.quotaStale')}</p>}
      {snapshots === null && state === undefined && (
        <p role="status">{t('copilot.quotaLoading')}</p>
      )}
      {snapshots !== null && snapshots.size === 0 && (
        <p role="status">{t('copilot.quotaEmpty')}</p>
      )}
      {snapshots !== null && snapshots.size > 0 && (
        <ul data-teleport-target={quotaTarget}>
          {[...snapshots.entries()].map(([key, snapshot]) => (
            <li key={key}>
              <span>{key}</span>
              <strong>
                {snapshot.isUnlimitedEntitlement
                  ? t('copilot.quotaUnlimited')
                  : formatPercent(snapshot)}
              </strong>
              <QuotaProgress snapshot={snapshot} />
              {!snapshot.isUnlimitedEntitlement && (
                <>
                  <span>
                    {t('copilot.quotaUsedOfAvailable', {
                      used: formatNumber(
                        snapshot.usedRequests,
                        getNumberFormatPreference()
                      ),
                      available: formatNumber(
                        snapshot.entitlementRequests,
                        getNumberFormatPreference()
                      ),
                      reset: formatReset(snapshot.resetDate),
                    })}
                  </span>
                  <span>
                    {t('copilot.quotaPercentRemaining', {
                      percent: formatNumber(
                        snapshot.remainingPercentage,
                        getNumberFormatPreference()
                      ),
                    })}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {quotaState?.fetchedAt !== null && quotaState?.fetchedAt !== undefined && (
        <small>
          {t('copilot.quotaUpdated', {
            timestamp: new Date(quotaState.fetchedAt).toLocaleString(),
          })}
        </small>
      )}
    </section>
  )
}
