import * as React from 'react'
import assert from 'node:assert'
import { describe, it, mock, before, after } from 'node:test'
import { render, fireEvent } from '@testing-library/react'
import '../helpers/ui/setup'
import {
  ErrorWithMetadata,
  RetainedDirectCloneRecoveryError,
} from '../../src/lib/error-with-metadata'
import { RetryAction, RetryActionType } from '../../src/models/retry-actions'
import { translate } from '../../src/lib/i18n'

mock.module('../../src/ui/app', {
  namedExports: { dialogTransitionTimeout: { enter: 0, exit: 0 } },
})
mock.module('../../src/ui/terminal', { namedExports: { Terminal: () => null } })
const {
  AppError,
}: typeof import('../../src/ui/app-error') = require('../../src/ui/app-error')

describe('retained direct clone recovery dialog', () => {
  const prototype = window.HTMLDialogElement.prototype
  const previousShow = prototype.show
  const previousShowModal = prototype.showModal
  before(() => {
    prototype.show = function () {
      this.setAttribute('open', '')
    }
    prototype.showModal = function () {
      this.setAttribute('open', '')
    }
  })
  after(() => {
    prototype.show = previousShow
    prototype.showModal = previousShowModal
  })
  it('rechecks retained clone A while retrying requested clone B', () => {
    const retryAction: RetryAction = {
      type: RetryActionType.Clone,
      name: 'Requested B',
      url: 'https://github.com/example/b.git',
      path: 'C:\\repositories\\b',
      options: {},
      retainedDirectRecovery: {
        name: 'Retained A',
        path: 'C:\\repositories\\a',
      },
    }
    let retried: RetryAction | undefined
    const { getByRole, getByText } = render(
      <AppError
        error={
          new ErrorWithMetadata(
            new RetainedDirectCloneRecoveryError('Recovery is pending.'),
            { retryAction }
          )
        }
        onDismissed={() => {}}
        onShowPopup={() => {}}
        onRetryAction={action => {
          retried = action
        }}
      />
    )
    assert(getByText('Clone recovery needs review'))
    assert.match(
      getByText(/The requested clone of/).textContent ?? '',
      /Requested B.*not started.*Retained A.*C:\\repositories\\a/
    )
    fireEvent.click(getByRole('button', { name: 'Check recovery and retry' }))
    assert.equal(retried, retryAction)
  })

  it('preserves the ordinary retry label for an actual clone failure', () => {
    const { getByRole, queryByRole } = render(
      <AppError
        error={
          new ErrorWithMetadata(new Error('Network unavailable.'), {
            retryAction: {
              type: RetryActionType.Clone,
              name: 'Requested B',
              url: 'https://github.com/example/b.git',
              path: 'C:\\repositories\\b',
              options: {},
            },
          })
        }
        onDismissed={() => {}}
        onShowPopup={() => {}}
        onRetryAction={() => {}}
      />
    )
    assert(getByRole('button', { name: 'Retry clone' }))
    assert.equal(
      queryByRole('button', { name: 'Check recovery and retry' }),
      null
    )
  })

  for (const mode of ['english', 'cantonese', 'bilingual']) {
    it(`keeps both recovery identities and exact paths in ${mode}`, () => {
      const message = translate('cloneRecovery.beforeClone', mode, {
        requestedName: 'Requested B',
        retainedName: 'Retained A',
        retainedPath: 'C:\\repositories\\a',
      })
      assert.match(message, /Requested B/)
      assert.match(message, /Retained A/)
      assert.match(message, /C:\\repositories\\a/)
      assert(!message.includes('{retained'))
      assert(translate('cloneRecovery.retry', mode).length > 0)
    })
  }
})
