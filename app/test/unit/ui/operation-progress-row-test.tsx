import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { OperationProgressRow } from '../../../src/ui/lib/operation-progress-row'
import { render, screen } from '../../helpers/ui/render'

describe('OperationProgressRow', () => {
  it('exposes a determinate progressbar with real counts', () => {
    render(
      <OperationProgressRow
        label="Deleting branches"
        description="Deleted 3 of 12 branches…"
        value={3}
        max={12}
      />
    )

    const bar = screen.getByRole('progressbar', { name: 'Deleting branches' })
    assert.equal(bar.getAttribute('aria-valuenow'), '3')
    assert.equal(bar.getAttribute('aria-valuemax'), '12')
    assert.equal(bar.getAttribute('aria-valuemin'), '0')
    assert.equal(bar.getAttribute('aria-valuetext'), '3 of 12')
    assert.equal(bar.getAttribute('aria-busy'), 'true')
    assert.ok(!bar.classList.contains('indeterminate'))
  })

  it('omits aria-valuenow when the operation is indeterminate', () => {
    render(
      <OperationProgressRow
        label="Loading llama3.2 into memory"
        description="Loading llama3.2 into memory…"
      />
    )

    const bar = screen.getByRole('progressbar', {
      name: 'Loading llama3.2 into memory',
    })
    assert.equal(bar.getAttribute('aria-valuenow'), null)
    assert.equal(bar.getAttribute('aria-valuemax'), null)
    assert.equal(bar.getAttribute('aria-busy'), 'true')
    assert.ok(bar.classList.contains('indeterminate'))
  })

  it('falls back to indeterminate when the total is unusable', () => {
    render(<OperationProgressRow label="Repacking" value={5} max={0} />)

    const bar = screen.getByRole('progressbar', { name: 'Repacking' })
    assert.equal(bar.getAttribute('aria-valuenow'), null)
    assert.ok(bar.classList.contains('indeterminate'))
  })

  it('announces the description through a polite status region', () => {
    render(
      <OperationProgressRow
        label="Fetching older history"
        description="Receiving objects…"
        value={40}
        max={100}
      />
    )

    const status = screen.getByRole('status')
    assert.equal(status.textContent, 'Receiving objects…')
    assert.equal(status.getAttribute('aria-live'), 'polite')
  })

  it('prefers a caller-supplied spoken value over the plain x of y', () => {
    render(
      <OperationProgressRow
        label="Restoring large files"
        value={512}
        max={1024}
        valueText="512 of 1024 bytes restored"
      />
    )

    const bar = screen.getByRole('progressbar', {
      name: 'Restoring large files',
    })
    assert.equal(
      bar.getAttribute('aria-valuetext'),
      '512 of 1024 bytes restored'
    )
  })

  it('clamps an overrun value rather than rendering past 100%', () => {
    render(
      <OperationProgressRow label="Adding repositories" value={9} max={4} />
    )

    const bar = screen.getByRole('progressbar', {
      name: 'Adding repositories',
    })
    assert.equal(bar.getAttribute('aria-valuenow'), '4')
    const fill = bar.querySelector('span')
    assert.ok(fill !== null)
    assert.equal(fill.style.width, '100%')
  })
})
