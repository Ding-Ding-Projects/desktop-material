import { createIssueTrackerItemIdentity } from './issue-tracker-model'
import type { IssueTrackerWireVariant } from './issue-tracker-model'

export type LinkedIssueTrackerProvider =
  | 'jira-cloud'
  | 'jira-data-center'
  | 'git-integration-for-jira'
  | 'trello'

export interface IIssueTrackerItemLinkInput {
  readonly provider: LinkedIssueTrackerProvider
  readonly endpoint: string
  readonly accountId: string
  readonly scopeId: string
  readonly itemId: string
}

function wireVariantFor(
  provider: LinkedIssueTrackerProvider
): IssueTrackerWireVariant {
  switch (provider) {
    case 'jira-cloud':
      return 'jira-rest-v3'
    case 'jira-data-center':
      return 'jira-rest-v2'
    case 'git-integration-for-jira':
      return 'git-integration-for-jira-v1'
    case 'trello':
      return 'trello-rest-v1'
  }
}

function itemKindFor(provider: LinkedIssueTrackerProvider): 'issue' | 'card' {
  return provider === 'trello' ? 'card' : 'issue'
}

function scopeKindFor(
  provider: LinkedIssueTrackerProvider
): 'project' | 'board' {
  return provider === 'trello' ? 'board' : 'project'
}

/**
 * Build the user-facing URL for a verified issue-tracker item.
 *
 * The identity is validated through the provider-neutral contract first. No
 * credential material is accepted here or included in the resulting URL.
 * Trello's REST endpoint is intentionally mapped to its public card URL;
 * Jira deployments keep their configured canonical origin.
 */
export function createIssueTrackerItemLink(
  input: IIssueTrackerItemLinkInput
): string {
  const identity = createIssueTrackerItemIdentity({
    provider: input.provider,
    endpoint: input.endpoint,
    accountId: input.accountId,
    wireVariant: wireVariantFor(input.provider),
    scope: { kind: scopeKindFor(input.provider), id: input.scopeId },
    itemKind: itemKindFor(input.provider),
    itemId: input.itemId,
  })

  if (identity.provider === 'trello') {
    return `https://trello.com/c/${encodeURIComponent(identity.itemId)}`
  }

  return new URL(
    `browse/${encodeURIComponent(identity.itemId)}`,
    `${identity.endpoint}/`
  ).toString()
}

export function issueTrackerProviderLabel(
  provider: LinkedIssueTrackerProvider
): string {
  return provider === 'trello' ? 'Trello' : 'Jira'
}
