import { APIError } from '../http'

export type IssueTrackerAuthErrorProvider = 'jira' | 'trello'

const providerNames: Record<IssueTrackerAuthErrorProvider, string> = {
  jira: 'Jira',
  trello: 'Trello',
}

function getSafeResponseStatus(error: unknown): number | null {
  if (!(error instanceof APIError)) {
    return null
  }

  const { responseStatus } = error
  return Number.isInteger(responseStatus) &&
    responseStatus >= 400 &&
    responseStatus <= 599
    ? responseStatus
    : null
}

/**
 * Returns bounded connection-verification guidance without rendering
 * provider-controlled error bodies, request URLs, credentials, or arbitrary
 * exception messages.
 */
export function getIssueTrackerAuthErrorMessage(
  provider: IssueTrackerAuthErrorProvider,
  error: unknown
): string {
  const providerName = providerNames[provider]
  const status = getSafeResponseStatus(error)

  switch (status) {
    case 401:
      return provider === 'jira'
        ? 'Jira rejected the credentials (HTTP 401). Check the account email and API token (or personal access token) and try again.'
        : 'Trello rejected the credentials (HTTP 401). Check the API key and token and try again.'
    case 403:
      return `${providerName} denied access (HTTP 403). Check that the credential has the required permissions.`
    case 404:
      return provider === 'jira'
        ? 'Jira did not find its API at that server (HTTP 404). Check the Jira server address and try again.'
        : 'Trello could not find the member (HTTP 404). Check the API key and token and try again.'
    case 429:
      return `${providerName} is temporarily rate limiting sign-in (HTTP 429). Wait a moment and try again.`
    case null:
      return `Unable to connect to ${providerName}. Check your network connection and try again.`
    default:
      return `${providerName} connection check failed (HTTP ${status}). Try again later.`
  }
}
