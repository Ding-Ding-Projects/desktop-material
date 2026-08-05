/**
 * Credential storage for issue tracker integrations (Jira Cloud, Jira Data
 * Center, the Git Integration for Jira app, and Trello).
 *
 * Follows the same pattern as `generic-git-auth.ts` and the SSH credential
 * helpers: secret material always goes through the keytar-backed
 * `TokenStore`, is addressed by a non-secret key derived from the endpoint,
 * and is never logged or echoed back in plaintext. Non-secret identity
 * fields (e.g. a Jira account email, or a Trello API key which is public by
 * design) are stored in `localStorage` alongside the secret reference, the
 * same way `setGenericUsername` stores the username next to the
 * `TokenStore`-held password.
 */

import { TokenStore } from '../stores/token-store'

const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'

function storeKey(name: string): string {
  return `${appName} - ${name}`
}

const JiraCredentialStoreKey = storeKey('Jira credentials')
const TrelloCredentialStoreKey = storeKey('Trello credentials')

function jiraEmailStorageKey(endpoint: string): string {
  return `issueTracker/jira/email/${endpoint}`
}

function trelloKeyStorageKey(endpoint: string): string {
  return `issueTracker/trello/key/${endpoint}`
}

/**
 * Jira credential as entered by the user. Cloud sign-in uses an account
 * email paired with an API token (Atlassian's supported Basic-auth scheme
 * for `/rest/api/3`); Data Center and the Git Integration for Jira app
 * instead accept a personal access token used as a Bearer credential, in
 * which case `email` is unused.
 */
export interface IJiraCredential {
  readonly email: string
  readonly apiToken: string
}

/** Persist a Jira credential for the given endpoint. Never logged. */
export async function setJiraCredential(
  endpoint: string,
  email: string,
  apiToken: string
): Promise<void> {
  localStorage.setItem(jiraEmailStorageKey(endpoint), email)
  await TokenStore.setItem(JiraCredentialStoreKey, endpoint, apiToken)
}

/** Retrieve the stored Jira credential for the given endpoint, if any. */
export async function getJiraCredential(
  endpoint: string
): Promise<IJiraCredential | null> {
  const apiToken = await TokenStore.getItem(JiraCredentialStoreKey, endpoint)
  if (apiToken === null) {
    return null
  }
  const email = localStorage.getItem(jiraEmailStorageKey(endpoint)) ?? ''
  return { email, apiToken }
}

/** Whether a Jira credential has been stored for the given endpoint. */
export async function hasJiraCredential(endpoint: string): Promise<boolean> {
  return (await getJiraCredential(endpoint)) !== null
}

/** Remove the stored Jira credential for the given endpoint. */
export async function deleteJiraCredential(endpoint: string): Promise<void> {
  localStorage.removeItem(jiraEmailStorageKey(endpoint))
  await TokenStore.deleteItem(JiraCredentialStoreKey, endpoint)
}

/**
 * Trello credential as entered by the user. Trello's API is authenticated
 * with an application key (public, tied to the app registration) and a
 * per-member token (secret, scoped to the signed-in member).
 */
export interface ITrelloCredential {
  readonly key: string
  readonly token: string
}

/** Persist a Trello credential for the given endpoint. Never logged. */
export async function setTrelloCredential(
  endpoint: string,
  key: string,
  token: string
): Promise<void> {
  localStorage.setItem(trelloKeyStorageKey(endpoint), key)
  await TokenStore.setItem(TrelloCredentialStoreKey, endpoint, token)
}

/** Retrieve the stored Trello credential for the given endpoint, if any. */
export async function getTrelloCredential(
  endpoint: string
): Promise<ITrelloCredential | null> {
  const token = await TokenStore.getItem(TrelloCredentialStoreKey, endpoint)
  if (token === null) {
    return null
  }
  const key = localStorage.getItem(trelloKeyStorageKey(endpoint)) ?? ''
  return { key, token }
}

/** Whether a Trello credential has been stored for the given endpoint. */
export async function hasTrelloCredential(endpoint: string): Promise<boolean> {
  return (await getTrelloCredential(endpoint)) !== null
}

/** Remove the stored Trello credential for the given endpoint. */
export async function deleteTrelloCredential(endpoint: string): Promise<void> {
  localStorage.removeItem(trelloKeyStorageKey(endpoint))
  await TokenStore.deleteItem(TrelloCredentialStoreKey, endpoint)
}
