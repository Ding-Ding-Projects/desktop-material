import * as React from 'react'
import '../../helpers/ui/setup'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AccountSwitcher } from '../../../src/ui/account-switcher/account-switcher'
import { Account } from '../../../src/models/account'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('AccountSwitcher', () => {
  it('promotes the selected row through the real click handler', () => {
    const activeAccount = new Account(
      'dotcom-user',
      getDotComAPIEndpoint(),
      'token-a',
      [],
      '',
      1,
      'Dotcom User',
      'free'
    )
    const enterpriseAccount = new Account(
      'enterprise-user',
      'https://ghe.example.com/api/v3',
      'token-b',
      [],
      '',
      2,
      'Enterprise User',
      'free'
    )
    const selected: Account[] = []
    let closeCount = 0

    render(
      <AccountSwitcher
        accounts={[activeAccount, enterpriseAccount]}
        selectedAccount={activeAccount}
        anchorRef={React.createRef<HTMLElement>()}
        onClose={() => {
          closeCount += 1
        }}
        onSelectAccount={account => selected.push(account)}
        onAddAccount={() => {}}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Enterprise User.*@enterprise-user/ })
    )

    assert.equal(closeCount, 1)
    assert.deepStrictEqual(selected, [enterpriseAccount])
  })
})
