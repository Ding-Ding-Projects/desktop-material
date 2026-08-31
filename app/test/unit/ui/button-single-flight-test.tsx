import assert from 'node:assert'
import * as React from 'react'
import { describe, it } from 'node:test'

import { Button } from '../../../src/ui/lib/button'
import { LinkButton } from '../../../src/ui/lib/link-button'
import { Md3IconButton } from '../../../src/ui/md3/md3-primitives'
import { ToolbarButton } from '../../../src/ui/toolbar/button'
import { shell } from '../../../src/lib/app-shell'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('shared button single-flight behavior', () => {
  it('blocks repeated pointer and keyboard activation until work settles', async () => {
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    render(
      <Button
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
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(button.getAttribute('aria-busy'), null)

    fireEvent.click(button)
    assert.equal(calls, 2)
  })

  it('keeps synchronous controls repeatable', () => {
    let calls = 0
    render(
      <Button
        onClick={() => {
          calls++
        }}
      >
        Next match
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Next match' })

    fireEvent.click(button)
    fireEvent.click(button)

    assert.equal(calls, 2)
    assert.equal(button.getAttribute('aria-busy'), null)
  })

  it('shares a semantic action key across separate controls', async () => {
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    const run = () => {
      calls++
      return pending
    }
    render(
      <>
        <Button activationKey="publish:current" onClick={run}>
          Publish
        </Button>
        <LinkButton activationKey="publish:current" onClick={run}>
          Publish here
        </LinkButton>
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish here' }))

    assert.equal(calls, 1)
    assert.equal(
      screen
        .getByRole('button', { name: 'Publish here' })
        .getAttribute('aria-busy'),
      'true'
    )

    finish()
    await pending
  })

  it('guards Lang gui and toolbar action primitives', async () => {
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    const run = () => {
      calls++
      return pending
    }
    render(
      <>
        <Md3IconButton
          icon="refresh"
          label="Refresh workflows"
          activationKey="refresh:workflows"
          onClick={run}
        />
        <ToolbarButton
          title="Refresh toolbar"
          ariaLabel="Refresh toolbar"
          activationKey="refresh:workflows"
          onClick={run}
        />
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh toolbar' }))

    assert.equal(calls, 1)
    assert.equal(
      screen
        .getByRole('button', { name: 'Refresh workflows' })
        .getAttribute('aria-busy'),
      'true'
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Refresh toolbar' })
        .getAttribute('aria-busy'),
      'true'
    )

    finish()
    await pending
  })

  it('guards an external URI for the real launch promise', async () => {
    const original = shell.openExternal
    let calls = 0
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    Object.assign(shell, {
      openExternal: () => {
        calls++
        return pending
      },
    })

    try {
      render(<LinkButton uri="https://example.com/docs">Open docs</LinkButton>)
      const link = screen.getByRole('link', { name: 'Open docs' })

      fireEvent.click(link)
      fireEvent.click(link)

      assert.equal(calls, 1)
      assert.equal(link.getAttribute('aria-busy'), 'true')

      finish()
      await pending
    } finally {
      Object.assign(shell, { openExternal: original })
    }
  })
})
