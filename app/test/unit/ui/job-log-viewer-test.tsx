import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { shell } from '../../../src/lib/app-shell'
import { IActionsJob } from '../../../src/lib/actions-jobs'
import {
  actionsTransferFailureMessage,
  ActionsTransferError,
} from '../../../src/lib/actions-transfer'
import { JobLogViewer } from '../../../src/ui/actions/job-log-viewer'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const mutableShell = shell as {
  openExternal: (path: string) => Promise<boolean>
}
const originalOpenExternal = mutableShell.openExternal

afterEach(() => {
  mutableShell.openExternal = originalOpenExternal
})

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
    const openedUrls: Array<string> = []
    mutableShell.openExternal = async url => {
      openedUrls.push(url)
      return true
    }
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
    const openOnGitHub = screen.getByRole('link', {
      name: 'Open build on GitHub',
    })
    assert.equal(openOnGitHub.getAttribute('href'), job.htmlUrl)
    fireEvent.click(openOnGitHub)
    assert.deepEqual(openedUrls, [job.htmlUrl])
  })
})
