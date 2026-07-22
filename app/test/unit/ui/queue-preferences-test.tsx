import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { Account, getAccountKey } from '../../../src/models/account'
import { BatchCloneMode } from '../../../src/models/batch-clone'
import { AutoClonePoliciesStorageKey } from '../../../src/lib/stores/auto-clone-store'
import { LanguageModeStorageKey } from '../../../src/lib/language-preference'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let openDialogBehavior: () => Promise<string | null> = async () => null

mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    showOpenDialog: () => openDialogBehavior(),
  },
})

const account = new Account(
  'octocat',
  'https://api.github.com',
  'token-not-rendered',
  [],
  '',
  7,
  'Octo Cat',
  'free'
)

interface IConfigureCall {
  readonly account: Account
  readonly baseDirectory: string
  readonly mode: BatchCloneMode
  readonly enabled: boolean
}

async function getQueuePreferences() {
  return (await import('../../../src/ui/preferences/queue')).QueuePreferences
}

afterEach(() => {
  openDialogBehavior = async () => null
  localStorage.removeItem(AutoClonePoliciesStorageKey)
  localStorage.removeItem(LanguageModeStorageKey)
})

describe('Clone queue preferences', () => {
  it('requires a folder, then applies enabled mode changes immediately', async () => {
    const QueuePreferences = await getQueuePreferences()
    const calls: IConfigureCall[] = []
    const dispatcher = {
      configureAutoClone: (
        selectedAccount: Account,
        baseDirectory: string,
        mode: BatchCloneMode,
        enabled: boolean
      ) =>
        calls.push({ account: selectedAccount, baseDirectory, mode, enabled }),
    }
    openDialogBehavior = async () => 'C:\\Repositories'

    render(
      <QueuePreferences accounts={[account]} dispatcher={dispatcher as never} />
    )

    const queueSwitch = screen.getByRole('switch', {
      name: 'Automatically clone new repositories',
    })
    fireEvent.click(queueSwitch)
    assert.ok(
      screen.getByText('Choose a base directory before turning on this queue.')
    )
    assert.equal(calls.length, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText('Base directory') as HTMLInputElement).value,
        'C:\\Repositories'
      )
    )

    fireEvent.click(queueSwitch)
    assert.deepEqual(calls[0], {
      account,
      baseDirectory: 'C:\\Repositories',
      mode: BatchCloneMode.Parallel,
      enabled: true,
    })

    fireEvent.change(screen.getByLabelText('Clone mode'), {
      target: { value: BatchCloneMode.Sequential },
    })
    await waitFor(() => assert.equal(calls.length, 2))
    assert.equal(calls[1].mode, BatchCloneMode.Sequential)
    assert.equal(calls[1].enabled, true)

    fireEvent.click(queueSwitch)
    assert.equal(calls.length, 3)
    assert.equal(calls[2].enabled, false)
  })

  it('hydrates a persisted account policy without exposing its token', async () => {
    localStorage.setItem(
      AutoClonePoliciesStorageKey,
      JSON.stringify({
        version: 1,
        policies: [
          {
            accountKey: getAccountKey(account),
            baseDirectory: 'C:\\Queue',
            mode: BatchCloneMode.Sequential,
            baselineEstablished: true,
            seenUrls: [],
          },
        ],
      })
    )
    const QueuePreferences = await getQueuePreferences()
    const markup = render(
      <QueuePreferences
        accounts={[account]}
        dispatcher={{ configureAutoClone: () => undefined } as never}
      />
    ).container.textContent

    assert.equal(
      screen
        .getByRole('switch', {
          name: 'Automatically clone new repositories',
        })
        .getAttribute('aria-checked'),
      'true'
    )
    assert.equal(
      (screen.getByLabelText('Base directory') as HTMLInputElement).value,
      'C:\\Queue'
    )
    assert.equal(
      (screen.getByLabelText('Clone mode') as HTMLSelectElement).value,
      BatchCloneMode.Sequential
    )
    assert.doesNotMatch(markup ?? '', /token-not-rendered/)
  })

  it('renders bilingual queue copy and a signed-out empty state', async () => {
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    const QueuePreferences = await getQueuePreferences()
    render(
      <QueuePreferences
        accounts={[]}
        dispatcher={{ configureAutoClone: () => undefined } as never}
      />
    )

    assert.ok(screen.getByText('Clone queue'))
    assert.ok(screen.getByText('Clone 隊列'))
    assert.ok(
      screen.getByText(
        'Sign in to a hosted account to configure its clone queue.'
      )
    )
    assert.ok(
      screen.getByText('登入託管帳戶之後，就可以喺度設定佢嘅 clone 隊列。')
    )
  })
})
