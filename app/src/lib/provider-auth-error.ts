import { APIError } from './http'

export type ProviderAuthErrorProvider = 'gitlab' | 'bitbucket'

const providerNames: Record<ProviderAuthErrorProvider, string> = {
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
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
 * Returns bounded sign-in guidance without rendering provider-controlled error
 * bodies, request URLs, credentials, or arbitrary exception messages.
 */
export function getProviderAuthErrorMessage(
  provider: ProviderAuthErrorProvider,
  error: unknown
): string {
  const providerName = providerNames[provider]
  const status = getSafeResponseStatus(error)

  switch (status) {
    case 401:
      return provider === 'gitlab'
        ? 'GitLab rejected the credentials (HTTP 401). Check the personal access token and try again.'
        : 'Bitbucket rejected the credentials (HTTP 401). Check the username and app password and try again.'
    case 403:
      return provider === 'gitlab'
        ? 'GitLab denied access (HTTP 403). Check that the personal access token has the required permissions.'
        : 'Bitbucket denied access (HTTP 403). Check that the app password has the required permissions.'
    case 404:
      return provider === 'gitlab'
        ? 'GitLab did not find its API at that server (HTTP 404). Check the GitLab server address and try again.'
        : 'Bitbucket could not find the account (HTTP 404). Check the username and try again.'
    case 429:
      return `${providerName} is temporarily rate limiting sign-in (HTTP 429). Wait a moment and try again.`
    case null:
      return `Unable to connect to ${providerName}. Check your network connection and try again.`
    default:
      return `${providerName} sign-in failed (HTTP ${status}). Try again later.`
  }
}
