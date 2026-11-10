import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { IInstalledExtension } from '../../../src/lib/extensions/manifest'
import {
  ExtensionManager,
  IExtensionManagerClient,
} from '../../../src/ui/repository-tools/extension-manager'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const extension = (
  overrides: Partial<IInstalledExtension> = {}
): IInstalledExtension => ({
  folder: 'builtin/todo-finder',
  builtIn: true,
  manifest: {
    manifestVersion: 1,
    id: 'todo-finder',
    name: 'TODO finder',
    version: '1.0.0',
    description: 'Lists TODO and FIXME notes.',
    permissions: ['read-tracked-files'],
    command: '@app-node',
    args: ['main.js'],
  },
  errors: [],
  enabled: true,
  needsConsent: ['read-tracked-files'],
  canRun: false,
  ...overrides,
})

function fakeClient(initial: ReadonlyArray<IInstalledExtension>) {
  let extensions = initial
  const calls = new Array<string>()
  const client: IExtensionManagerClient = {
    list: async () => ({ folder: 'C:\\data\\extensions', extensions }),
    setEnabled: async (id, enabled) => {
      calls.push(`enable:${id}:${enabled}`)
    },
    grantConsent: async id => {
      calls.push(`grant:${id}`)
      extensions = extensions.map(e =>
        e.manifest?.id === id ? { ...e, needsConsent: [], canRun: true } : e
      )
    },
    revokeConsent: async id => {
      calls.push(`revoke:${id}`)
    },
    run: async (id, context) => {
      calls.push(`run:${id}:${context.repositoryPath}`)
      return { ok: true, title: '2 notes', text: 'a.ts:1  TODO one' }
    },
    openFolder: async () => {
      calls.push('open')
    },
  }
  return { client, calls }
}

describe('extension manager', () => {
  it('asks for consent before an extension can run, then shows its result', async () => {
    const { client, calls } = fakeClient([extension()])
    render(
      <ExtensionManager repositoryPath={'C:\\repos\\demo'} client={client} />
    )

    await waitFor(() => assert.ok(screen.getByText('TODO finder')))
    assert.ok(screen.getByText('Read the files Git tracks in the repository'))
    assert.ok(screen.getByText('Needs your consent'))
    assert.equal(
      screen.queryByRole('button', { name: 'Run on this repository' }),
      null
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Allow and enable running' })
    )
    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'Run on this repository' }))
    )
    assert.equal(screen.queryByText('Needs your consent'), null)

    fireEvent.click(
      screen.getByRole('button', { name: 'Run on this repository' })
    )
    await waitFor(() => assert.ok(screen.getByText('2 notes')))
    assert.ok(screen.getByText('a.ts:1 TODO one'))
    assert.deepEqual(calls, [
      'grant:todo-finder',
      'run:todo-finder:C:\\repos\\demo',
    ])
  })

  it('lists a broken extension with its reasons and filters by search', async () => {
    const { client } = fakeClient([
      extension({ needsConsent: [], canRun: true }),
      extension({
        folder: 'broken',
        builtIn: false,
        manifest: null,
        errors: ['version must look like 1.2.3.'],
        enabled: false,
        needsConsent: [],
      }),
    ])
    render(
      <ExtensionManager repositoryPath={'C:\\repos\\demo'} client={client} />
    )

    await waitFor(() => assert.ok(screen.getByText('Cannot be used')))
    assert.ok(screen.getByText('version must look like 1.2.3.'))
    assert.ok(screen.getByText('2 of 2 shown'))

    fireEvent.change(screen.getByLabelText('Search extensions'), {
      target: { value: 'todo' },
    })
    assert.ok(screen.getByText('1 of 2 shown'))
    assert.equal(screen.queryByText('Cannot be used'), null)
  })
})
