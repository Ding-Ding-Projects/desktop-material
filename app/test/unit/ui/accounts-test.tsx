import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../helpers/ui/setup'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { Account } from '../../../src/models/account'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { APIError } from '../../../src/lib/http'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

type Provider = 'gitlab' | 'bitbucket'

function renderAccounts(
  onProviderSignIn: (
    provider: Provider,
    endpoint: string,
    token: string
  ) => Promise<Account>
) {
  return render(
    <Accounts
      accounts={[]}
      onDotComSignIn={() => {}}
      onEnterpriseSignIn={() => {}}
      onProviderSignIn={onProviderSignIn}
      onLogout={() => {}}
      onMakeActive={() => {}}
      onOpenInBrowser={async () => true}
    />
  )
}

function createHostileAPIError(status: number, marker: string): APIError {
  const response = new Response(null, {
    status,
    statusText: `Hostile status ${marker}`,
  })
  Object.defineProperty(response, 'url', {
    value: `https://user:${marker}@provider.invalid/private`,
  })

  return new APIError(response, {
    message: `Hostile body ${marker}; token=${marker}; app_password=${marker}`,
  })
}

function createHostileResponseAPIError(
  status: number,
  marker: string
): APIError {
  const response = new Response(null, {
    status,
    statusText: `Hostile status ${marker}`,
  })
  Object.defineProperty(response, 'url', {
    value: `https://user:${marker}@provider.invalid/private?token=${marker}`,
  })

  return new APIError(response, null)
}

function submitProvider(provider: Provider) {
  if (provider === 'gitlab') {
    fireEvent.change(screen.getByLabelText('Personal access token'), {
      target: { value: 'gitlab-form-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add GitLab account' }))
  } else {
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'bitbucket-user' },
    })
    fireEvent.change(screen.getByLabelText('App password'), {
      target: { value: 'bitbucket-form-password' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Bitbucket account' })
    )
  }
}

describe('Accounts preferences', () => {
  it('renders every GitHub.com account and the add-account action', () => {
    const accounts = [
      new Account(
        'octocat',
        getDotComAPIEndpoint(),
        'token-one',
        [],
        '',
        1,
        'The Octocat',
        'free'
      ),
      new Account(
        'mona',
        getDotComAPIEndpoint(),
        'token-two',
        [],
        '',
        2,
        'Mona Lisa Octocat',
        'free'
      ),
    ]

    const markup = renderToStaticMarkup(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onProviderSignIn={async () => accounts[0]}
        onLogout={() => {}}
        onMakeActive={() => {}}
        onOpenInBrowser={async () => true}
      />
    )

    assert.match(markup, /@octocat/)
    assert.match(markup, /@mona/)
    assert.match(markup, /Add GitHub\.com account/)
  })

  it('renders GitLab and Bitbucket account forms without exposing token values', () => {
    const accounts = [
      new Account(
        'fox',
        'https://gitlab.example.com/api/v4',
        'secret-gitlab-token',
        [],
        '',
        10,
        'Fox',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'gitlab'
      ),
      new Account(
        'bucket',
        'https://api.bitbucket.org/2.0',
        'bucket:secret-app-password',
        [],
        '',
        11,
        'Bucket',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'bitbucket'
      ),
    ]

    const markup = renderToStaticMarkup(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onProviderSignIn={async () => accounts[0]}
        onLogout={() => {}}
        onMakeActive={() => {}}
        onOpenInBrowser={async () => true}
      />
    )

    assert.match(markup, /GitLab accounts/)
    assert.match(markup, /GitLab · gitlab\.example\.com/)
    assert.match(markup, /Bitbucket Cloud accounts/)
    assert.match(markup, /Bitbucket · bitbucket\.org/)
    assert.doesNotMatch(markup, /secret-gitlab-token/)
    assert.doesNotMatch(markup, /secret-app-password/)
  })

  it('renders bounded status guidance without provider-controlled error text', async () => {
    const cases: ReadonlyArray<{
      readonly provider: Provider
      readonly error: unknown
      readonly expected: string
      readonly marker: string
    }> = [
      {
        provider: 'gitlab',
        marker: 'GITLAB_401_SECRET',
        error: createHostileAPIError(401, 'GITLAB_401_SECRET'),
        expected:
          'GitLab rejected the credentials (HTTP 401). Check the personal access token and try again.',
      },
      {
        provider: 'bitbucket',
        marker: 'BITBUCKET_401_SECRET',
        error: createHostileAPIError(401, 'BITBUCKET_401_SECRET'),
        expected:
          'Bitbucket rejected the credentials (HTTP 401). Check the username and app password and try again.',
      },
      {
        provider: 'gitlab',
        marker: 'GITLAB_403_SECRET',
        error: createHostileAPIError(403, 'GITLAB_403_SECRET'),
        expected:
          'GitLab denied access (HTTP 403). Check that the personal access token has the required permissions.',
      },
      {
        provider: 'bitbucket',
        marker: 'BITBUCKET_403_SECRET',
        error: createHostileAPIError(403, 'BITBUCKET_403_SECRET'),
        expected:
          'Bitbucket denied access (HTTP 403). Check that the app password has the required permissions.',
      },
      {
        provider: 'gitlab',
        marker: 'GITLAB_404_SECRET',
        error: createHostileAPIError(404, 'GITLAB_404_SECRET'),
        expected:
          'GitLab did not find its API at that server (HTTP 404). Check the GitLab server address and try again.',
      },
      {
        provider: 'gitlab',
        marker: 'GITLAB_429_SECRET',
        error: createHostileAPIError(429, 'GITLAB_429_SECRET'),
        expected:
          'GitLab is temporarily rate limiting sign-in (HTTP 429). Wait a moment and try again.',
      },
      {
        provider: 'bitbucket',
        marker: 'BITBUCKET_429_SECRET',
        error: createHostileAPIError(429, 'BITBUCKET_429_SECRET'),
        expected:
          'Bitbucket is temporarily rate limiting sign-in (HTTP 429). Wait a moment and try again.',
      },
      {
        provider: 'gitlab',
        marker: 'GITLAB_500_SECRET',
        error: createHostileAPIError(500, 'GITLAB_500_SECRET'),
        expected: 'GitLab sign-in failed (HTTP 500). Try again later.',
      },
      {
        provider: 'bitbucket',
        marker: 'BITBUCKET_500_SECRET',
        error: createHostileAPIError(500, 'BITBUCKET_500_SECRET'),
        expected: 'Bitbucket sign-in failed (HTTP 500). Try again later.',
      },
      {
        provider: 'gitlab',
        marker: 'GITLAB_URL_CREDENTIAL_SECRET',
        error: createHostileResponseAPIError(
          502,
          'GITLAB_URL_CREDENTIAL_SECRET'
        ),
        expected: 'GitLab sign-in failed (HTTP 502). Try again later.',
      },
      {
        provider: 'gitlab',
        marker: 'GITLAB_NETWORK_SECRET',
        error: new Error(
          'Network failure GITLAB_NETWORK_SECRET; token=GITLAB_NETWORK_SECRET'
        ),
        expected:
          'Unable to connect to GitLab. Check your network connection and try again.',
      },
      {
        provider: 'bitbucket',
        marker: 'BITBUCKET_NETWORK_SECRET',
        error: new Error(
          'Network failure BITBUCKET_NETWORK_SECRET; app_password=BITBUCKET_NETWORK_SECRET'
        ),
        expected:
          'Unable to connect to Bitbucket. Check your network connection and try again.',
      },
      {
        provider: 'bitbucket',
        marker: 'BITBUCKET_UNKNOWN_SECRET',
        error: {
          toString: () => 'Unknown failure BITBUCKET_UNKNOWN_SECRET',
        },
        expected:
          'Unable to connect to Bitbucket. Check your network connection and try again.',
      },
    ]

    for (const testCase of cases) {
      const view = renderAccounts(async provider => {
        assert.equal(provider, testCase.provider)
        throw testCase.error
      })

      submitProvider(testCase.provider)

      const alert = await screen.findByRole('alert')
      assert.equal(alert.textContent, testCase.expected)
      assert.doesNotMatch(
        document.body.textContent ?? '',
        new RegExp(testCase.marker)
      )
      view.unmount()
    }
  })

  it('preserves successful provider sign-in arguments and clears secrets', async () => {
    const calls: Array<{
      readonly provider: Provider
      readonly endpoint: string
      readonly token: string
    }> = []
    const account = new Account(
      'provider-user',
      'https://gitlab.example.com/api/v4',
      'stored-token',
      [],
      '',
      12,
      'Provider User',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'gitlab'
    )

    renderAccounts(async (provider, endpoint, token) => {
      calls.push({ provider, endpoint, token })
      return account
    })

    fireEvent.change(screen.getByLabelText('GitLab server'), {
      target: { value: '  https://gitlab.example.com  ' },
    })
    fireEvent.change(screen.getByLabelText('Personal access token'), {
      target: { value: 'gitlab-success-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add GitLab account' }))

    await waitFor(() => assert.equal(calls.length, 1))
    assert.deepEqual(calls[0], {
      provider: 'gitlab',
      endpoint: 'https://gitlab.example.com',
      token: 'gitlab-success-token',
    })
    assert.equal(
      (screen.getByLabelText('Personal access token') as HTMLInputElement)
        .value,
      ''
    )

    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: '  bucket-user  ' },
    })
    fireEvent.change(screen.getByLabelText('App password'), {
      target: { value: 'bitbucket-success-password' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Bitbucket account' })
    )

    await waitFor(() => assert.equal(calls.length, 2))
    assert.deepEqual(calls[1], {
      provider: 'bitbucket',
      endpoint: 'https://api.bitbucket.org/2.0',
      token: 'bucket-user:bitbucket-success-password',
    })
    assert.equal(
      (screen.getByLabelText('App password') as HTMLInputElement).value,
      ''
    )
    assert.equal(screen.queryByRole('alert'), null)
  })
})
