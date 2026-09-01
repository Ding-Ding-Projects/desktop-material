import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as React from 'react'
import { describe, it } from 'node:test'

import { Button } from '../../../src/ui/lib/button'
import { Form } from '../../../src/ui/lib/form'
import { LinkButton } from '../../../src/ui/lib/link-button'
import {
  AuthenticationForm,
  BrowserSignInActionKey,
} from '../../../src/ui/lib/authentication-form'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

describe('single-flight activation controls', () => {
  it('resets native action-button chrome while keeping both target types', async () => {
    const stylesheet = await readFile(
      join(process.cwd(), 'app', 'styles', '_material-shell.scss'),
      'utf8'
    )
    assert.match(
      stylesheet,
      /button\.link-button-component\s*\{[\s\S]*appearance:\s*none;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*font:\s*inherit;/
    )

    render(
      <>
        <LinkButton onClick={() => {}}>Action</LinkButton>
        <LinkButton uri="https://example.com/docs">URI</LinkButton>
      </>
    )
    assert.equal(
      screen.getByRole('button', { name: 'Action' }).tagName,
      'BUTTON'
    )
    assert.equal(screen.getByRole('link', { name: 'URI' }).tagName, 'A')
  })

  it('allows one mixed pointer and keyboard activation until settle', async () => {
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    render(
      <Button
        activationKey="save:current"
        onClick={() => {
          calls++
          return pending
        }}
      >
        Save
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Save' })

    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Enter' })

    assert.equal(calls, 1)
    assert.equal(button.getAttribute('aria-busy'), 'true')
    assert.equal(button.getAttribute('aria-disabled'), 'true')

    finish()
    await pending
    await waitFor(() => assert.equal(button.getAttribute('aria-busy'), null))

    fireEvent.click(button)
    assert.equal(calls, 2)
  })

  it('keeps synchronous controls repeatable', async () => {
    let calls = 0
    render(<Button onClick={() => calls++}>Next match</Button>)
    const button = screen.getByRole('button', { name: 'Next match' })

    fireEvent.click(button)
    fireEvent.click(button)

    assert.equal(calls, 2)
    assert.equal(button.getAttribute('aria-busy'), null)
  })

  it('uses a native button for non-URI LinkButton and keeps URI links as links', () => {
    const onClick = () => {}
    render(
      <>
        <LinkButton onClick={onClick}>Retry</LinkButton>
        <LinkButton uri="https://example.com/docs">Docs</LinkButton>
      </>
    )

    assert.equal(
      screen.getByRole('button', { name: 'Retry' }).tagName,
      'BUTTON'
    )
    assert.equal(screen.getByRole('link', { name: 'Docs' }).tagName, 'A')
  })

  it('uses native disabled semantics and blocks every action-only key route', () => {
    let calls = 0
    render(
      <LinkButton disabled={true} onClick={() => calls++}>
        Retry
      </LinkButton>
    )
    const button = screen.getByRole('button', { name: 'Retry' })

    assert.equal((button as HTMLButtonElement).disabled, true)
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: ' ' })
    fireEvent.keyDown(button, { key: 'Enter' })
    assert.equal(calls, 0)
  })

  it('shares the authentication key between submit and browser button', async () => {
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    render(
      <AuthenticationForm
        onBrowserSignInRequested={() => {
          calls++
          return pending
        }}
      />
    )
    const button = screen.getByRole('link', {
      name: /Sign in using your browser/i,
    })

    fireEvent.click(button)
    fireEvent.submit(button.closest('form') as HTMLFormElement)
    assert.equal(calls, 1)
    assert.equal(button.getAttribute('aria-busy'), 'true')
    assert.equal(BrowserSignInActionKey, 'authentication:browser-sign-in')

    finish()
    await pending
    await waitFor(() => assert.equal(button.getAttribute('aria-busy'), null))
  })

  it('guards a Form submit even when no button owns the action', async () => {
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    render(
      <Form
        activationKey="import:current"
        onSubmit={() => {
          calls++
          return pending
        }}
      >
        <input aria-label="File" />
      </Form>
    )
    const form = screen.getByRole('textbox').closest('form') as HTMLFormElement

    fireEvent.submit(form)
    fireEvent.submit(form)
    assert.equal(calls, 1)

    finish()
    await pending
  })
})
