import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { GitConfigUserForm } from '../../../src/ui/lib/git-config-user-form'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const account = new Account(
  'material-verifier',
  'https://api.github.com',
  '',
  [
    {
      email: 'material-verifier@example.invalid',
      verified: true,
      primary: true,
      visibility: 'public',
    },
  ],
  '',
  1,
  'Material Verification',
  'free'
)

function renderForm(accounts: ReadonlyArray<Account>, email: string) {
  return render(
    <GitConfigUserForm
      name="Material Verification"
      email={email}
      accounts={accounts}
      disabled={false}
      isLoadingGitConfig={false}
      onNameChanged={() => {}}
      onEmailChanged={() => {}}
    />
  )
}

function getVisibleLabels(container: HTMLElement) {
  return Array.from(container.querySelectorAll('label')).map(element =>
    (element.textContent ?? '').trim()
  )
}

describe('GitConfigUserForm email labelling', () => {
  it('shows a visible Email label when there is no account to suggest emails from', () => {
    const { container } = renderForm([], 'someone@example.invalid')

    assert.equal(screen.queryByRole('combobox'), null)
    assert.equal(
      getVisibleLabels(container).filter(x => x === 'Email').length,
      1
    )
  })

  it('drops the visible label only when Other was chosen in the dropdown', () => {
    const { container } = renderForm(
      [account],
      'material-verifier@example.invalid'
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Email' }), {
      target: { value: 'Other' },
    })

    assert.equal(
      getVisibleLabels(container).filter(x => x === 'Email').length,
      1
    )
    assert.equal(screen.getAllByLabelText('Email').length, 2)
  })
})
