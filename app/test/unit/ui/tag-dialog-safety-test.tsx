import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DeleteTag } from '../../../src/ui/delete-tag/delete-tag-dialog'
import { CreateTag } from '../../../src/ui/create-tag/create-tag-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const repository = {} as never

describe('tag dialogs safety', () => {
  it('requires both keys and the full range before deleting the exact tag', () => {
    let deletes = 0
    const dispatcher = {
      deleteTag: async () => {
        deletes++
      },
    } as never

    render(
      <DeleteTag
        dispatcher={dispatcher}
        repository={repository}
        tagName="release-1"
        onDismissed={() => undefined}
      />
    )

    const dialog = screen.getByRole('alertdialog')
    const checks = screen.getAllByRole('checkbox')
    const slider = screen.getByRole('slider') as HTMLInputElement
    const submit = screen.getByRole('button', { name: 'Delete tag' })
    assert.equal(checks.length, 2)
    assert.equal(slider.disabled, true)
    assert.equal(submit.getAttribute('aria-disabled'), 'true')

    fireEvent.submit(dialog)
    assert.equal(deletes, 0)
    fireEvent.click(checks[0])
    fireEvent.click(checks[1])
    fireEvent.change(slider, { target: { value: '99' } })
    assert.equal(deletes, 0)
    fireEvent.change(slider, { target: { value: '100' } })
    fireEvent.submit(dialog)
    assert.equal(deletes, 1)
  })

  it('recovers from create rejection and permits a deliberate retry', async () => {
    let attempts = 0
    const dispatcher = {
      createTag: async () => {
        attempts++
        if (attempts === 1) {
          throw new Error('tag service unavailable')
        }
      },
    } as never

    render(
      <CreateTag
        dispatcher={dispatcher}
        repository={repository}
        targetCommitSha="abc"
        localTags={new Map()}
        onDismissed={() => undefined}
      />
    )

    const input = screen.getByLabelText('Name')
    fireEvent.change(input, { target: { value: 'release-1' } })
    const form = screen.getByRole('dialog').querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => assert.equal(attempts, 1))
    assert.match(screen.getByRole('alert').textContent ?? '', /unavailable/)
    fireEvent.submit(form)
    await waitFor(() => assert.equal(attempts, 2))
  })
})
