import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { API, IAPIOrganization } from '../../../src/lib/api'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'
import { Account } from '../../../src/models/account'
import {
  PublishSettingsType,
  RepositoryPublicationSettings,
} from '../../../src/models/publish-settings'
import { PublishRepository } from '../../../src/ui/publish-repository/publish-repository'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function account(login: string, id: number): Account {
  return new Account(
    login,
    'https://api.github.com',
    `synthetic-${login}`,
    [],
    '',
    id,
    login,
    'free'
  )
}

function organization(login: string, id: number): IAPIOrganization {
  return {
    id,
    login,
    url: `https://api.github.test/orgs/${login}`,
    avatar_url: `http://127.0.0.1/avatars/${id}.svg`,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const initialSettings: RepositoryPublicationSettings = {
  kind: PublishSettingsType.dotcom,
  name: 'material-fixture',
  description: 'Synthetic publication fixture',
  private: true,
  org: null,
}

describe('PublishRepository organization integration', () => {
  it('sorts fetched organizations and keeps selection controlled by publication settings', async () => {
    const selectedAccount = account('material-verifier', 7)
    const alpha = organization('Alpha-Labs', 1)
    const zeta = organization('zeta-studio', 2)
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchOrgs: async () => [zeta, alpha],
      } as unknown as API
    })
    let latestSettings: RepositoryPublicationSettings = initialSettings

    function Harness() {
      const [settings, setSettings] =
        React.useState<RepositoryPublicationSettings>(initialSettings)
      latestSettings = settings
      return (
        <PublishRepository
          account={selectedAccount}
          accounts={[selectedAccount]}
          onSelectedAccountChanged={() => undefined}
          settings={settings}
          onSettingsChanged={setSettings}
        />
      )
    }

    try {
      render(<Harness />)
      await screen.findByRole('option', { name: 'Alpha-Labs' })
      assert.deepEqual(
        screen
          .getAllByRole('option')
          .map(option =>
            option.textContent?.replace(/\s*Selected\s*$/, '').trim()
          ),
        ['None — publish to my personal account', 'Alpha-Labs', 'zeta-studio']
      )

      fireEvent.click(screen.getByRole('option', { name: 'Alpha-Labs' }))
      await waitFor(() => assert.equal(latestSettings.org?.id, alpha.id))
      assert.equal(
        screen
          .getByTestId('publish-organization-option-1')
          .getAttribute('aria-selected'),
        'true'
      )

      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, { detail: 'bilingual' })
      )
      assert.ok(await screen.findByText('Organization · Organization／機構'))
    } finally {
      fromAccount.mock.restore()
    }
  })

  it('ignores a late organization response from the previously selected account', async () => {
    const firstAccount = account('first-account', 1)
    const secondAccount = account('second-account', 2)
    const first = deferred<ReadonlyArray<IAPIOrganization>>()
    const second = deferred<ReadonlyArray<IAPIOrganization>>()
    const fromAccount = mock.method(API, 'fromAccount', (selected: Account) => {
      return {
        fetchOrgs: () =>
          selected.id === firstAccount.id ? first.promise : second.promise,
      } as unknown as API
    })
    const common = {
      accounts: [firstAccount, secondAccount],
      onSelectedAccountChanged: () => undefined,
      settings: initialSettings,
      onSettingsChanged: () => undefined,
    }

    try {
      const view = render(
        <PublishRepository account={firstAccount} {...common} />
      )
      view.rerender(<PublishRepository account={secondAccount} {...common} />)

      second.resolve([organization('current-owner', 22)])
      assert.ok(await screen.findByRole('option', { name: 'current-owner' }))

      first.resolve([organization('stale-owner', 11)])
      await waitFor(() =>
        assert.equal(
          screen.queryByRole('option', { name: 'stale-owner' }),
          null
        )
      )
      assert.ok(screen.getByRole('option', { name: 'current-owner' }))
    } finally {
      fromAccount.mock.restore()
    }
  })
})
