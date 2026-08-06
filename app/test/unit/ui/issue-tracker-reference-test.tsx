import * as React from 'react'
import '../../helpers/ui/setup'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { IssueTrackerReference } from '../../../src/ui/preferences/issue-tracker-reference'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function renderReference(
  connected: boolean,
  onOpenInBrowser: (url: string) => Promise<boolean> = async () => true
) {
  return render(
    <IssueTrackerReference
      provider="jira-cloud"
      endpoint="https://team.atlassian.net"
      accountId={connected ? 'jira-account' : null}
      connected={connected}
      onOpenInBrowser={onOpenInBrowser}
    />
  )
}

describe('issue tracker reference surface', () => {
  it('renders truthful disconnected guidance and does not offer a fake action', () => {
    renderReference(false)

    assert.match(
      screen.getByRole('status').textContent ?? '',
      /Connect Jira above before opening a reference/
    )
    assert.equal(screen.queryByRole('button', { name: /Open Jira/ }), null)
  })

  it('renders empty fields disabled until a real verified connection exists', () => {
    renderReference(true)

    assert.equal(
      screen
        .getByRole('button', { name: /Open Jira/ })
        .getAttribute('aria-disabled'),
      'true'
    )
  })

  it('shows loading and failure state when the browser cannot open the link', async () => {
    let resolveOpen: ((opened: boolean) => void) | undefined
    const opening = new Promise<boolean>(resolve => {
      resolveOpen = resolve
    })
    renderReference(true, () => opening)

    fireEvent.change(screen.getByLabelText('Project key'), {
      target: { value: 'DESK' },
    })
    fireEvent.change(screen.getByLabelText('Issue key'), {
      target: { value: 'DESK-42' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open Jira reference' }))

    assert.match(
      screen.getByRole('status').textContent ?? '',
      /Opening the Jira reference/
    )
    resolveOpen?.(false)
    await waitFor(() => assert.ok(screen.getByRole('alert')))
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /could not open this Jira reference/
    )
  })
})
