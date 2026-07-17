import assert from 'node:assert'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  GitHubAPIWorkbenchRequest,
  IGitHubAPIWorkbenchResponse,
} from '../../../src/lib/github-api-workbench'
import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import {
  GitHubAPIExplorer,
  GitHubAPIExplorerResponseCharacterCap,
  GitHubAPIExplorerVisibleOperationCap,
  IGitHubAPIExplorerClient,
} from '../../../src/ui/github-api-explorer'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../helpers/ui/render'

interface IExplorerCall {
  readonly account: Account
  readonly request: GitHubAPIWorkbenchRequest
  readonly confirmed: boolean
  readonly signal: AbortSignal
}

const successfulResponse: IGitHubAPIWorkbenchResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    authorization: 'Bearer fixture-secret',
    'set-cookie': 'session=fixture-secret',
    'x-github-request-id': 'fixture-request',
    'x-ratelimit-remaining': '4999',
  },
  body: {
    token: 'fixture-secret',
    payload: 'x'.repeat(GitHubAPIExplorerResponseCharacterCap + 32),
  },
  contentType: 'application/json',
  displayedBytes: GitHubAPIExplorerResponseCharacterCap + 64,
  truncated: false,
}

class FakeExplorerClient implements IGitHubAPIExplorerClient {
  public readonly calls = new Array<IExplorerCall>()

  public constructor(
    private readonly run: (
      call: IExplorerCall
    ) => Promise<IGitHubAPIWorkbenchResponse> = async () => successfulResponse
  ) {}

  public readonly execute = (
    account: Account,
    request: GitHubAPIWorkbenchRequest,
    confirmed: boolean,
    signal: AbortSignal
  ) => {
    const call = { account, request, confirmed, signal }
    this.calls.push(call)
    return this.run(call)
  }
}

function account(
  login: string,
  id: number,
  provider: Account['provider'] = 'github'
) {
  return new Account(
    login,
    'https://api.github.com',
    `${login}-token`,
    [],
    '',
    id,
    login,
    'free',
    undefined,
    undefined,
    undefined,
    undefined,
    provider
  )
}

function repository(
  selectedAccount: Account,
  owner: string = 'desktop',
  name: string = 'material',
  id: number = 1
) {
  return new Repository(
    resolve('api-explorer-fixtures', `${owner}-${name}`),
    id,
    new GitHubRepository(
      name,
      new Owner(owner, selectedAccount.endpoint, id),
      id
    ),
    false,
    null,
    {},
    false,
    undefined,
    getAccountKey(selectedAccount)
  )
}

const selectedAccount = account('fixture-bot', 42)
const selectedRepository = repository(selectedAccount)

describe('GitHub API Explorer', () => {
  it('starts on the exact ten new operations and prefills repository coordinates', () => {
    render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[selectedAccount]}
        client={new FakeExplorerClient()}
      />
    )

    assert.ok(screen.getByRole('main', { name: 'GitHub API Explorer' }))
    assert.equal(
      (screen.getByLabelText('Catalog scope') as HTMLSelectElement).value,
      'new'
    )
    const list = screen.getByRole('list', {
      name: 'GitHub API operations',
    })
    assert.equal(within(list).getAllByRole('listitem').length, 10)
    assert.equal(
      screen
        .getByRole('button', {
          name: /GET List repository custom patterns/,
        })
        .getAttribute('aria-pressed'),
      'true'
    )
    assert.equal(
      (screen.getByLabelText('REST method') as HTMLSelectElement).value,
      'GET'
    )
    assert.equal(
      (screen.getByLabelText('REST API path') as HTMLInputElement).value,
      'repos/desktop/material/secret-scanning/custom-patterns'
    )
  })

  it('searches and categorizes the bounded all-operation catalog', () => {
    render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[selectedAccount]}
        client={new FakeExplorerClient()}
      />
    )

    fireEvent.change(screen.getByLabelText('Catalog scope'), {
      target: { value: 'all' },
    })
    let list = screen.getByRole('list', { name: 'GitHub API operations' })
    assert.equal(
      within(list).getAllByRole('listitem').length,
      GitHubAPIExplorerVisibleOperationCap
    )
    assert.ok(screen.getByText(/Refine the filters to inspect/))

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'secret-scanning' },
    })
    fireEvent.change(screen.getByLabelText('Search operations'), {
      target: { value: 'custom patterns' },
    })
    list = screen.getByRole('list', { name: 'GitHub API operations' })
    assert.ok(within(list).getAllByRole('listitem').length > 0)

    fireEvent.change(screen.getByLabelText('Search operations'), {
      target: { value: 'no-such-operation-fixture' },
    })
    assert.ok(screen.getByText('No operations match these filters.'))
    assert.equal(
      screen.queryByRole('list', { name: 'GitHub API operations' }),
      null
    )
  })

  it('uses only the repository-bound GitHub account', () => {
    const sameHostAccount = account('other-user', 99)
    const client = new FakeExplorerClient()
    render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[sameHostAccount]}
        client={client}
      />
    )

    assert.ok(screen.getByRole('heading', { name: 'Sign in required' }))
    assert.ok(screen.getByText(/never falls back to another account/))
    assert.equal(screen.queryByRole('button', { name: 'Run request' }), null)
    assert.equal(client.calls.length, 0)
  })

  it('executes GET and HEAD directly but reviews REST mutations', async () => {
    const client = new FakeExplorerClient()
    render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[selectedAccount]}
        client={client}
      />
    )

    fireEvent.change(screen.getByLabelText('REST method'), {
      target: { value: 'HEAD' },
    })
    fireEvent.change(screen.getByLabelText('REST API path'), {
      target: { value: 'repos/desktop/material' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    await waitFor(() => assert.equal(client.calls.length, 1))
    assert.equal(client.calls[0].account, selectedAccount)
    assert.equal(client.calls[0].confirmed, false)
    assert.deepEqual(client.calls[0].request, {
      mode: 'rest',
      method: 'HEAD',
      path: 'repos/desktop/material',
      bodyText: '',
    })

    const responseBody = screen.getByLabelText('GitHub API response body')
    assert.ok(
      (responseBody.textContent ?? '').length <=
        GitHubAPIExplorerResponseCharacterCap
    )
    assert.match(responseBody.textContent ?? '', /\[redacted\]/)
    assert.doesNotMatch(responseBody.textContent ?? '', /fixture-secret/)
    const headers = screen.getByLabelText('GitHub API response headers')
    assert.match(headers.textContent ?? '', /x-ratelimit-remaining/)
    assert.doesNotMatch(headers.textContent ?? '', /authorization|set-cookie/)
    assert.ok(screen.getByText(/output truncated/))

    fireEvent.change(screen.getByLabelText('REST method'), {
      target: { value: 'DELETE' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    assert.equal(client.calls.length, 1)
    assert.ok(
      screen.getByRole('heading', { name: 'Review GitHub API mutation' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Run reviewed request' })
    )
    await waitFor(() => assert.equal(client.calls.length, 2))
    assert.equal(client.calls[1].confirmed, true)
    assert.equal(client.calls[1].request.mode, 'rest')
    assert.equal(
      client.calls[1].request.mode === 'rest'
        ? client.calls[1].request.method
        : null,
      'DELETE'
    )
  })

  it('runs GraphQL queries and reviews GraphQL mutations with variables and operation name', async () => {
    const client = new FakeExplorerClient()
    render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[selectedAccount]}
        client={client}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'GraphQL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    await waitFor(() => assert.equal(client.calls.length, 1))
    assert.equal(client.calls[0].confirmed, false)
    assert.deepEqual(client.calls[0].request, {
      mode: 'graphql',
      query:
        'query RepositoryOverview($owner: String!, $name: String!) {\n' +
        '  repository(owner: $owner, name: $name) {\n' +
        '    id\n' +
        '    nameWithOwner\n' +
        '  }\n' +
        '}',
      variablesText: '{\n  "owner": "desktop",\n  "name": "material"\n}',
      operationName: 'RepositoryOverview',
    })

    const mutation =
      'mutation RenameRepository($repositoryId: ID!, $name: String!) { updateRepository(input: { repositoryId: $repositoryId, name: $name }) { repository { name } } }'
    fireEvent.change(screen.getByLabelText('GraphQL query'), {
      target: { value: mutation },
    })
    fireEvent.change(screen.getByLabelText('GraphQL variables'), {
      target: { value: '{"repositoryId":"R_1","name":"renamed"}' },
    })
    fireEvent.change(
      screen.getByLabelText('GraphQL operation name (optional)'),
      { target: { value: 'RenameRepository' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    assert.equal(client.calls.length, 1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Run reviewed request' })
    )
    await waitFor(() => assert.equal(client.calls.length, 2))
    assert.equal(client.calls[1].confirmed, true)
    assert.deepEqual(client.calls[1].request, {
      mode: 'graphql',
      query: mutation,
      variablesText: '{"repositoryId":"R_1","name":"renamed"}',
      operationName: 'RenameRepository',
    })
  })

  it('aborts loading requests on repository changes and unmount', () => {
    const client = new FakeExplorerClient(
      call =>
        new Promise((_resolve, reject) => {
          call.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
    )
    const view = render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[selectedAccount]}
        client={client}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    assert.ok(screen.getByText('Running request…'))
    assert.equal(client.calls[0].signal.aborted, false)

    const nextAccount = account('next-bot', 84)
    const nextRepository = repository(nextAccount, 'octo', 'rocket', 2)
    view.rerender(
      <GitHubAPIExplorer
        repository={nextRepository}
        accounts={[nextAccount]}
        client={client}
      />
    )
    assert.equal(client.calls[0].signal.aborted, true)
    assert.equal(
      (screen.getByLabelText('REST API path') as HTMLInputElement).value,
      'repos/octo/rocket/secret-scanning/custom-patterns'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    assert.equal(client.calls.length, 2)
    view.unmount()
    assert.equal(client.calls[1].signal.aborted, true)
  })

  it('renders execution errors without exposing a stale response', async () => {
    const client = new FakeExplorerClient(async () => {
      throw new Error('Fixture API failure')
    })
    render(
      <GitHubAPIExplorer
        repository={selectedRepository}
        accounts={[selectedAccount]}
        client={client}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run request' }))
    await waitFor(() =>
      assert.ok(
        screen.getByRole('alert').textContent?.includes('Fixture API failure')
      )
    )
    assert.equal(screen.queryByRole('heading', { name: 'Response' }), null)
  })
})
