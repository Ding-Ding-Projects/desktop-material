import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { IActionsJob } from '../../../src/lib/actions-jobs'
import {
  actionsTransferFailureMessage,
  ActionsTransferError,
} from '../../../src/lib/actions-transfer'
import { JobLogViewer } from '../../../src/ui/actions/job-log-viewer'
import { render, screen } from '../../helpers/ui/render'

const job = {
  name: 'build',
  htmlUrl: 'https://github.example/actions/jobs/1',
} as IActionsJob

describe('JobLogViewer', () => {
  it('labels search and announces its result count', () => {
    render(
      <JobLogViewer
        job={job}
        log={'first line\nsecond line'}
        loading={false}
        error={null}
        onClose={() => {}}
        onRetry={() => {}}
      />
    )

    assert.ok(screen.getByRole('searchbox', { name: 'Search logs' }))
    const status = screen.getByRole('status')
    assert.equal(status.getAttribute('aria-live'), 'polite')
    assert.equal(status.getAttribute('aria-atomic'), 'true')
    assert.equal(status.textContent, 'No matches')
  })

  it('offers recovery actions when GitHub cannot provide the log', () => {
    let retries = 0
    const errorMessage = actionsTransferFailureMessage(
      { ok: false, reason: 'http', status: 404 },
      'job logs'
    )
    render(
      <JobLogViewer
        job={job}
        log=""
        loading={false}
        error={new ActionsTransferError('http', 404, errorMessage)}
        onClose={() => {}}
        onRetry={() => {
          retries += 1
        }}
      />
    )

    assert.equal(screen.getByRole('alert').textContent, errorMessage)
    screen.getByRole('button', { name: 'Retry' }).click()
    assert.equal(retries, 1)
    assert.ok(screen.getByRole('link', { name: 'Open build on GitHub' }))
  })
})
