import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { DeleteTag } from '../../../src/ui/delete-tag/delete-tag-dialog'
import { CreateTag } from '../../../src/ui/create-tag/create-tag-dialog'
import { DialogStackContext } from '../../../src/ui/dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const repository = {
  gitHubRepository: null,
  name: 'tag-test',
  path: 'C:/tag-test',
  id: 7,
} as never
const dialogPrototype = HTMLDialogElement.prototype
const originalShow = dialogPrototype.show
const originalShowModal = dialogPrototype.showModal
const originalClose = dialogPrototype.close

beforeEach(() => {
  dialogPrototype.show = function () {
    this.setAttribute('open', '')
  }
  dialogPrototype.showModal = function () {
    this.setAttribute('open', '')
  }
  dialogPrototype.close = function () {
    this.removeAttribute('open')
  }
})

afterEach(() => {
  dialogPrototype.show = originalShow
  dialogPrototype.showModal = originalShowModal
  dialogPrototype.close = originalClose
})

async function allowDialogToAppear() {
  await new Promise(resolve => setTimeout(resolve, 300))
}

function renderDialog(element: React.ReactElement) {
  return render(
    <DialogStackContext.Provider value={{ isTopMost: true }}>
      {element}
    </DialogStackContext.Provider>
  )
}

function getDialogForm(): HTMLFormElement {
  const form = screen.getByRole('alertdialog').querySelector('form')
  assert.ok(form)
  return form
}

describe('tag dialogs safety', () => {
  it('requires both keys and the full range before deleting the exact tag', async () => {
    let deletes = 0
    const dispatcher = {
      deleteTag: async () => {
        deletes++
      },
    } as never

    renderDialog(
      <DeleteTag
        dispatcher={dispatcher}
        repository={repository}
        tagName="release-1"
        onDismissed={() => undefined}
      />
    )
    await allowDialogToAppear()

    const dialog = screen.getByRole('alertdialog')
    const dialogForm = dialog.querySelector('form')
    assert.ok(dialogForm)
    const checks = screen.getAllByRole('checkbox')
    const slider = screen.getByRole('slider') as HTMLInputElement
    const submit = screen.getByRole('button', { name: 'Delete tag' })
    assert.equal(checks.length, 2)
    assert.equal(slider.disabled, true)
    assert.equal(submit.getAttribute('aria-disabled'), 'true')

    fireEvent.submit(dialogForm)
    assert.equal(deletes, 0)
    fireEvent.click(checks[0])
    fireEvent.click(checks[1])
    fireEvent.change(slider, { target: { value: '99' } })
    assert.equal(deletes, 0)
    fireEvent.change(slider, { target: { value: '100' } })
    fireEvent.submit(dialogForm)
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

    renderDialog(
      <CreateTag
        dispatcher={dispatcher}
        repository={repository}
        targetCommitSha="abc"
        localTags={new Map()}
        onDismissed={() => undefined}
      />
    )
    await allowDialogToAppear()

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

  it('blocks delete rejection without losing authorization and supports retry', async () => {
    let attempts = 0
    const dispatcher = {
      deleteTag: async () => {
        attempts++
        if (attempts === 1) {
          throw new Error('delete service unavailable')
        }
      },
    } as never
    let dismissed = 0

    renderDialog(
      <DeleteTag
        dispatcher={dispatcher}
        repository={repository}
        tagName="release-1"
        onDismissed={() => dismissed++}
      />
    )
    await allowDialogToAppear()
    const checks = screen.getAllByRole('checkbox')
    const slider = screen.getByRole('slider')
    fireEvent.click(checks[0])
    fireEvent.click(checks[1])
    fireEvent.change(slider, { target: { value: '100' } })
    fireEvent.submit(getDialogForm())
    await waitFor(() => assert.equal(attempts, 1))
    assert.equal(dismissed, 0)
    assert.match(screen.getByRole('alert').textContent ?? '', /unavailable/)
    fireEvent.submit(getDialogForm())
    await waitFor(() => assert.equal(attempts, 2))
    await waitFor(() => assert.equal(dismissed, 1))
  })

  it('uses Emergency exit and Escape without deleting or leaving stale authorization', async () => {
    let deletes = 0
    let dismissed = 0
    const dispatcher = { deleteTag: async () => deletes++ } as never
    renderDialog(
      <DeleteTag
        dispatcher={dispatcher}
        repository={repository}
        tagName="release-1"
        onDismissed={() => dismissed++}
      />
    )
    await allowDialogToAppear()
    const checks = screen.getAllByRole('checkbox')
    fireEvent.click(checks[0])
    fireEvent.click(checks[1])
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    assert.equal(deletes, 0)
    assert.equal(dismissed, 1)
  })

  it('rejects Escape and close while create is pending, then dismisses after resolve', async () => {
    let dismissed = 0
    const dispatcher = {
      createTag: () =>
        new Promise<void>(resolve => {
          setTimeout(resolve, 100)
        }),
    } as never
    renderDialog(
      <CreateTag
        dispatcher={dispatcher}
        repository={repository}
        targetCommitSha="abc"
        localTags={new Map()}
        onDismissed={() => dismissed++}
      />
    )
    await allowDialogToAppear()
    const input = screen.getByLabelText('Name')
    fireEvent.change(input, { target: { value: 'release-1' } })
    const dialog = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: 'Close' })
    const form = dialog.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() => assert.equal(dialog.getAttribute('data-busy'), 'true'))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(close)
    assert.equal(dismissed, 0)
    await waitFor(() => assert.equal(dismissed, 1))
  })

  it('rejects Escape while delete is pending and prevents stale target authorization', async () => {
    let dismissed = 0
    let deletes = 0
    const dispatcher = {
      deleteTag: () =>
        new Promise<void>(resolve => {
          deletes++
          setTimeout(resolve, 100)
        }),
    } as never
    const view = renderDialog(
      <DeleteTag
        dispatcher={dispatcher}
        repository={repository}
        tagName="release-a"
        onDismissed={() => dismissed++}
      />
    )
    await allowDialogToAppear()
    const checks = screen.getAllByRole('checkbox')
    fireEvent.click(checks[0])
    fireEvent.click(checks[1])
    fireEvent.change(screen.getByRole('slider'), { target: { value: '100' } })
    view.rerender(
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <DeleteTag
          dispatcher={dispatcher}
          repository={repository}
          tagName="release-b"
          onDismissed={() => dismissed++}
        />
      </DialogStackContext.Provider>
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Delete tag' })
        .getAttribute('aria-disabled'),
      'true'
    )
    fireEvent.submit(getDialogForm())
    assert.equal(deletes, 0)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    assert.equal(dismissed, 1)
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(dismissed, 1)
  })
})
