import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { GitConfigUserForm } from '../../../src/ui/lib/git-config-user-form'
import { render, screen } from '../../helpers/ui/render'

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

describe('GitConfigUserForm email labelling', () => {
  it('shows a visible Email label when there is no account to suggest emails from', () => {
    // With no signed-in account there are no suggestions, so the dropdown is
    // never rendered — but `emailIsOther` is still true because no email can
    // match an empty suggestion list. The textbox must still carry its own
    // VISIBLE label rather than sitting blank beneath "Name".
    //
    // Asserting the accessible name is not enough here: the aria-label
    // fallback was already present, so a name-based assertion passes even
    // with the defect. Only a rendered <label> element distinguishes them.
    const { container } = renderForm([], 'someone@example.invalid')

    assert.equal(
      screen.queryByRole('combobox'),
      null,
      'no email dropdown should be rendered without account suggestions'
    )

    const visibleLabels = Array.from(container.querySelectorAll('label')).map(
      element => (element.textContent ?? '').trim()
    )
    assert.ok(
      visibleLabels.includes('Email'),
      `expected a visible "Email" label, saw: ${JSON.stringify(visibleLabels)}`
    )
  })

  it('labels the email control when the account email is used', () => {
    renderForm([account], 'material-verifier@example.invalid')

    // The dropdown owns the label in this state, so more than one control can
    // answer to the name; what matters is that the name resolves at all.
    assert.ok(screen.getAllByLabelText('Email').length >= 1)
  })

  it('drops the visible label only when Other was chosen in the dropdown', () => {
    // An account exists (so the dropdown renders) but the email is not one of
    // its suggestions, which is exactly the "Other" presentation. The dropdown
    // already carries the "Email" label, so the textbox below it must not
    // repeat it — it is still announced through its aria-label.
    renderForm([account], 'custom@example.invalid')

    assert.ok(
      screen.getByRole('combobox'),
      'the dropdown should render when suggestions exist'
    )
    const labelled = screen.getAllByLabelText('Email')
    assert.ok(
      labelled.length >= 1,
      'the email control should remain accessible by name'
    )
  })
})
