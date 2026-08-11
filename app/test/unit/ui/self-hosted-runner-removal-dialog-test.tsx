import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { ISelfHostedRunner } from '../../../src/lib/self-hosted-runner/types'
import { SelfHostedRunnerRemovalDialog } from '../../../src/ui/actions/self-hosted-runner-removal-dialog'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const runner: ISelfHostedRunner = {
  id: 'runner-1',
  accountKey: 'https://api.github.com/#1',
  owner: 'owner',
  repository: 'repository',
  name: 'windows-runner',
  labels: ['self-hosted', 'windows'],
  platform: 'windows',
  wslDistribution: null,
  dedicatedWsl: false,
  createdAt: '2026-08-06T12:00:00.000Z',
  status: 'running',
}

describe('self-hosted runner removal dialog', () => {
  it('requires both confirmations and the full slider before removal', () => {
    let confirmations = 0
    render(
      <SelfHostedRunnerRemovalDialog
        runner={runner}
        submitting={false}
        error={null}
        progressMessage={null}
        onConfirm={() => confirmations++}
        onDismissed={() => undefined}
      />
    )

    const remove = screen.getByRole('button', { name: 'Remove runner' })
    const checks = screen.getAllByRole('checkbox')
    const slider = screen.getByRole('slider') as HTMLInputElement
    assert.equal(checks.length, 2)
    assert.equal(remove.getAttribute('aria-disabled'), 'true')
    assert.equal(slider.disabled, true)

    fireEvent.click(checks[0])
    fireEvent.click(checks[1])
    assert.equal(slider.disabled, false)
    assert.equal(remove.getAttribute('aria-disabled'), 'true')

    fireEvent.change(slider, { target: { value: '99' } })
    assert.equal(remove.getAttribute('aria-disabled'), 'true')
    fireEvent.change(slider, { target: { value: '100' } })
    assert.equal(remove.getAttribute('aria-disabled'), null)
    fireEvent.submit(screen.getByRole('alertdialog'))
    assert.equal(confirmations, 1)
  })

  it('allows dismissal before removal begins', () => {
    let dismissals = 0
    render(
      <SelfHostedRunnerRemovalDialog
        runner={runner}
        submitting={false}
        error={null}
        progressMessage={null}
        onConfirm={() => undefined}
        onDismissed={() => dismissals++}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Emergency exit' }))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    assert.equal(dismissals, 2)
  })

  it('does not hide an irreversible removal while it is running', () => {
    let dismissals = 0
    render(
      <SelfHostedRunnerRemovalDialog
        runner={runner}
        submitting={true}
        error={null}
        progressMessage="Removing runner"
        onConfirm={() => undefined}
        onDismissed={() => dismissals++}
      />
    )

    const wait = screen.getByRole('button', { name: 'Wait for removal result' })
    assert.equal(wait.getAttribute('aria-disabled'), 'true')
    fireEvent.click(wait)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    assert.equal(dismissals, 0)
  })
})
