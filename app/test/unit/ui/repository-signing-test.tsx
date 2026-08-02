import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
  ICLIWorkbenchOperationRequest,
} from '../../../src/lib/cli-workbench'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'
import { RepositorySigning } from '../../../src/ui/repository-tools'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

class FakeSigningClient {
  public readonly starts: ICLIWorkbenchOperationRequest[] = []
  public readonly cancels: string[] = []
  private readonly outputHandlers = new Set<
    (event: ICLICommandOutputEvent) => void
  >()
  private readonly stateHandlers = new Set<
    (event: ICLICommandStateEvent) => void
  >()

  public start = async (request: ICLIWorkbenchOperationRequest) => {
    this.starts.push(request)
  }
  public cancel = async (id: string) => {
    this.cancels.push(id)
    return true
  }
  public onOutput = (handler: (event: ICLICommandOutputEvent) => void) => {
    this.outputHandlers.add(handler)
    return () => this.outputHandlers.delete(handler)
  }
  public onState = (handler: (event: ICLICommandStateEvent) => void) => {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }
  public emitOutput(event: ICLICommandOutputEvent) {
    this.outputHandlers.forEach(handler => handler(event))
  }
  public emitState(event: ICLICommandStateEvent) {
    this.stateHandlers.forEach(handler => handler(event))
  }
}

function renderSigning(
  client: FakeSigningClient,
  repositoryPath = 'C:/repo',
  onRefreshRepository = async () => {},
  onBusyChanged: (busy: boolean) => void = () => {}
) {
  return render(
    <RepositorySigning
      repositoryPath={repositoryPath}
      disabled={false}
      client={client}
      onRefreshRepository={onRefreshRepository}
      onBusyChanged={onBusyChanged}
    />
  )
}

function setLanguageMode(languageMode: 'english' | 'cantonese' | 'bilingual') {
  act(() => {
    document.dispatchEvent(
      new CustomEvent(LanguageModeChangedEvent, { detail: languageMode })
    )
  })
}

function emitCompleted(client: FakeSigningClient, index: number, stdout = '') {
  const id = client.starts[index].id
  if (stdout.length > 0) {
    client.emitOutput({ id, stream: 'stdout', data: stdout })
  }
  client.emitState({
    id,
    state: 'completed',
    exitCode: 0,
    signal: null,
  })
}

function emitEmptyConfig(client: FakeSigningClient, index: number) {
  client.emitState({
    id: client.starts[index].id,
    state: 'failed',
    exitCode: 1,
    signal: null,
  })
}

interface IInspectSigningOptions {
  readonly localSettings?: string
  readonly localKeyPresent?: boolean
  readonly globalSettings?: string
  readonly globalKeyPresent?: boolean
}

async function inspectSigning(
  client: FakeSigningClient,
  options: IInspectSigningOptions = {}
) {
  const localSettings =
    options.localSettings ??
    'gpg.format\nssh\0commit.gpgsign\ntrue\0tag.gpgsign\nfalse\0'
  const localKeyPresent = options.localKeyPresent ?? true
  const globalSettings = options.globalSettings ?? ''
  const globalKeyPresent = options.globalKeyPresent ?? false

  fireEvent.click(
    screen.getByRole('button', { name: 'Inspect signing settings' })
  )
  await waitFor(() => assert.equal(client.starts.length, 1))
  assert.deepStrictEqual(client.starts[0].operation, {
    id: 'repository-signing-inspection',
    scope: 'local',
    inspection: 'settings',
  })
  assert.equal('recipe' in client.starts[0], false)
  if (localSettings.length === 0) {
    emitEmptyConfig(client, 0)
  } else {
    emitCompleted(client, 0, localSettings)
  }

  await waitFor(() => assert.equal(client.starts.length, 2))
  assert.deepStrictEqual(client.starts[1].operation, {
    id: 'repository-signing-inspection',
    scope: 'local',
    inspection: 'key-presence',
  })
  if (localKeyPresent) {
    emitCompleted(client, 1, 'user.signingkey\0')
  } else {
    emitEmptyConfig(client, 1)
  }

  await waitFor(() => assert.equal(client.starts.length, 3))
  assert.deepStrictEqual(client.starts[2].operation, {
    id: 'repository-signing-inspection',
    scope: 'global',
    inspection: 'settings',
  })
  if (globalSettings.length === 0) {
    emitEmptyConfig(client, 2)
  } else {
    emitCompleted(client, 2, globalSettings)
  }

  await waitFor(() => assert.equal(client.starts.length, 4))
  assert.deepStrictEqual(client.starts[3].operation, {
    id: 'repository-signing-inspection',
    scope: 'global',
    inspection: 'key-presence',
  })
  if (globalKeyPresent) {
    emitCompleted(client, 3, 'user.signingkey\0')
  } else {
    emitEmptyConfig(client, 3)
  }
  await screen.findByLabelText('Replacement public key')
}

describe('Repository signing administration', () => {
  it('updates visible copy and concise accessible names live in every language mode', async () => {
    const client = new FakeSigningClient()
    renderSigning(client)
    setLanguageMode('english')

    assert.ok(screen.getByRole('heading', { name: 'Commit and tag signing' }))
    assert.ok(
      screen.getByText('Inspect signing configuration before making changes.')
    )

    setLanguageMode('cantonese')
    assert.ok(
      await screen.findByRole('heading', { name: 'Commit 同 tag 簽署' })
    )
    assert.ok(screen.getByText('請先檢查簽署設定，再作更改。'))
    assert.ok(screen.getByRole('button', { name: '檢查簽署設定' }))

    setLanguageMode('bilingual')
    const inspect = screen.getByRole('button', {
      name: 'Inspect signing settings',
    })
    assert.match(inspect.textContent ?? '', /Inspect signing settings/)
    assert.match(inspect.textContent ?? '', /檢查簽署設定/)
    assert.equal(inspect.getAttribute('aria-label'), 'Inspect signing settings')
  })

  it('inspects only safe settings and name-only key presence', async () => {
    const client = new FakeSigningClient()
    const busy: boolean[] = []
    renderSigning(
      client,
      'C:/repo',
      async () => {},
      value => busy.push(value)
    )
    await inspectSigning(client)

    assert.ok(
      screen.getByText(
        'Configured public signing key (value hidden) (This repository)'
      )
    )
    assert.ok(screen.getByText('Signing configuration inspected safely.'))
    assert.deepStrictEqual(busy, [true, false])
    assert.equal(document.body.textContent?.includes('user.signingkey'), false)
    assert.equal(document.body.textContent?.includes('C:/private'), false)
  })

  it('freezes, focuses, rechecks, and applies exact reviewed settings', async () => {
    const client = new FakeSigningClient()
    let refreshes = 0
    renderSigning(client, 'C:/repo', async () => {
      refreshes++
    })
    await inspectSigning(client)

    const key = `key::ssh-ed25519 ${Buffer.alloc(32, 4).toString('base64')}`
    fireEvent.change(screen.getByLabelText('Replacement public key'), {
      target: { value: key },
    })
    fireEvent.click(screen.getByLabelText('Sign annotated tags by default'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Review signing settings' })
    )

    const confirm = await screen.findByRole('button', {
      name: 'Apply signing settings',
    })
    assert.equal(document.activeElement, confirm)
    fireEvent.click(confirm)

    await waitFor(() => assert.equal(client.starts.length, 5))
    assert.deepStrictEqual(client.starts[4].operation, {
      id: 'repository-signing-inspection',
      scope: 'local',
      inspection: 'settings',
    })
    emitCompleted(
      client,
      4,
      'gpg.format\nssh\0commit.gpgsign\ntrue\0tag.gpgsign\nfalse\0'
    )
    await waitFor(() => assert.equal(client.starts.length, 6))
    emitCompleted(client, 5, 'user.signingkey\0')

    const expected = [
      {
        id: 'repository-signing-update',
        scope: 'local',
        operation: 'set-format',
        format: 'ssh',
      },
      {
        id: 'repository-signing-update',
        scope: 'local',
        operation: 'set-key',
        format: 'ssh',
        key,
      },
      {
        id: 'repository-signing-update',
        scope: 'local',
        operation: 'set-commit-signing',
        enabled: true,
      },
      {
        id: 'repository-signing-update',
        scope: 'local',
        operation: 'set-tag-signing',
        enabled: true,
      },
    ]
    for (let index = 0; index < expected.length; index++) {
      await waitFor(() => assert.equal(client.starts.length, 7 + index))
      assert.deepStrictEqual(
        client.starts[6 + index].operation,
        expected[index]
      )
      assert.equal(client.starts[6 + index].confirmed, true)
      assert.equal('recipe' in client.starts[6 + index], false)
      emitCompleted(client, 6 + index)
    }
    await waitFor(() => assert.equal(refreshes, 1))
    await waitFor(() => assert.equal(client.starts.length, 11))
    assert.deepStrictEqual(client.starts[10].operation, {
      id: 'repository-signing-inspection',
      scope: 'local',
      inspection: 'settings',
    })
  })

  it('rehydrates global values instead of carrying repository overrides across scopes', async () => {
    const client = new FakeSigningClient()
    renderSigning(client)
    await inspectSigning(client, {
      localSettings:
        'gpg.format\nssh\0commit.gpgsign\ntrue\0tag.gpgsign\nfalse\0',
      localKeyPresent: true,
      globalSettings:
        'gpg.format\nopenpgp\0commit.gpgsign\nfalse\0tag.gpgsign\ntrue\0',
      globalKeyPresent: true,
    })

    fireEvent.change(screen.getByLabelText('Configuration scope'), {
      target: { value: 'global' },
    })
    assert.equal(
      (screen.getByLabelText('Signing format') as HTMLSelectElement).value,
      'openpgp'
    )
    assert.equal(
      (screen.getByLabelText('Sign commits by default') as HTMLInputElement)
        .checked,
      false
    )
    assert.equal(
      (
        screen.getByLabelText(
          'Sign annotated tags by default'
        ) as HTMLInputElement
      ).checked,
      true
    )

    const key = 'ABCDEF0123456789'
    fireEvent.change(screen.getByLabelText('Replacement public key'), {
      target: { value: key },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review signing settings' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apply signing settings' })
    )

    await waitFor(() => assert.equal(client.starts.length, 5))
    assert.deepStrictEqual(client.starts[4].operation, {
      id: 'repository-signing-inspection',
      scope: 'global',
      inspection: 'settings',
    })
    emitCompleted(
      client,
      4,
      'gpg.format\nopenpgp\0commit.gpgsign\nfalse\0tag.gpgsign\ntrue\0'
    )
    await waitFor(() => assert.equal(client.starts.length, 6))
    emitCompleted(client, 5, 'user.signingkey\0')

    const expected = [
      {
        id: 'repository-signing-update',
        scope: 'global',
        operation: 'set-format',
        format: 'openpgp',
      },
      {
        id: 'repository-signing-update',
        scope: 'global',
        operation: 'set-key',
        format: 'openpgp',
        key,
      },
      {
        id: 'repository-signing-update',
        scope: 'global',
        operation: 'set-commit-signing',
        enabled: false,
      },
      {
        id: 'repository-signing-update',
        scope: 'global',
        operation: 'set-tag-signing',
        enabled: true,
      },
    ]
    for (let index = 0; index < expected.length; index++) {
      await waitFor(() => assert.equal(client.starts.length, 7 + index))
      assert.deepStrictEqual(
        client.starts[6 + index].operation,
        expected[index]
      )
      emitCompleted(client, 6 + index)
    }
  })

  it('requires a compatible key when a configured scope changes format', async () => {
    const client = new FakeSigningClient()
    renderSigning(client)
    await inspectSigning(client)

    fireEvent.change(screen.getByLabelText('Signing format'), {
      target: { value: 'openpgp' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review signing settings' })
    )

    assert.match(
      (await screen.findByRole('alert')).textContent ?? '',
      /requires a compatible replacement/i
    )
    assert.equal(screen.queryByRole('alertdialog'), null)
    assert.equal(client.starts.length, 4)
  })

  it('fails closed if configuration changes after review', async () => {
    const client = new FakeSigningClient()
    renderSigning(client)
    await inspectSigning(client)
    fireEvent.click(
      screen.getByRole('button', { name: 'Review signing settings' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apply signing settings' })
    )
    await waitFor(() => assert.equal(client.starts.length, 5))
    emitCompleted(
      client,
      4,
      'gpg.format\nopenpgp\0commit.gpgsign\nfalse\0tag.gpgsign\nfalse\0'
    )
    await waitFor(() => assert.equal(client.starts.length, 6))
    emitCompleted(client, 5, 'user.signingkey\0')

    assert.ok(await screen.findByText(/changed after review/i))
    assert.equal(
      client.starts.some(
        start => start.operation.id === 'repository-signing-update'
      ),
      false
    )
  })

  it('warns that a sequential update may be partially applied on failure', async () => {
    const client = new FakeSigningClient()
    renderSigning(client)
    await inspectSigning(client)
    fireEvent.click(
      screen.getByRole('button', { name: 'Review signing settings' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apply signing settings' })
    )
    await waitFor(() => assert.equal(client.starts.length, 5))
    emitCompleted(
      client,
      4,
      'gpg.format\nssh\0commit.gpgsign\ntrue\0tag.gpgsign\nfalse\0'
    )
    await waitFor(() => assert.equal(client.starts.length, 6))
    emitCompleted(client, 5, 'user.signingkey\0')
    await waitFor(() => assert.equal(client.starts.length, 7))
    client.emitState({
      id: client.starts[6].id,
      state: 'failed',
      exitCode: 5,
      signal: null,
    })

    assert.ok(await screen.findByText(/may already be applied/i))
    assert.ok(screen.getByText('The signing update did not fully complete.'))
  })

  it('reports safe commit and annotated-tag verification states', async () => {
    const client = new FakeSigningClient()
    renderSigning(client)
    await inspectSigning(client)
    const oid = 'a'.repeat(40)

    fireEvent.click(screen.getByRole('button', { name: 'Verify HEAD commit' }))
    await waitFor(() => assert.equal(client.starts.length, 5))
    emitCompleted(client, 4, `${oid}\0N\0\0`)
    assert.ok(await screen.findByText('Unsigned'))

    fireEvent.click(screen.getByRole('button', { name: 'Load annotated tags' }))
    await waitFor(() => assert.equal(client.starts.length, 6))
    emitCompleted(client, 5, `v1.0.0\0tag\0${oid}\n`)
    await screen.findByLabelText('Annotated tag')
    fireEvent.click(screen.getByRole('button', { name: 'Verify selected tag' }))
    await waitFor(() => assert.equal(client.starts.length, 7))
    assert.deepStrictEqual(client.starts[6].operation, {
      id: 'repository-signing-verify',
      target: 'tag',
      tagName: 'v1.0.0',
      expectedObject: oid,
    })
    emitCompleted(client, 6, `${oid}\0G\0ABCDEF0123456789\0ABCDEF01`)
    assert.ok(await screen.findByText('Good signature'))
    assert.ok(screen.getByText('ABCDEF0123456789'))
  })

  it('cancels exact work and ignores stale completion after repository replacement', async () => {
    const client = new FakeSigningClient()
    const view = renderSigning(client, 'C:/first')
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect signing settings' })
    )
    await waitFor(() => assert.equal(client.starts.length, 1))
    const staleId = client.starts[0].id
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel signing operation' })
    )
    await waitFor(() => assert.deepStrictEqual(client.cancels, [staleId]))

    view.rerender(
      <RepositorySigning
        repositoryPath="C:/second"
        disabled={false}
        client={client}
        onRefreshRepository={async () => {}}
        onBusyChanged={() => {}}
      />
    )
    client.emitOutput({
      id: staleId,
      stream: 'stdout',
      data: 'gpg.format\nssh\0',
    })
    client.emitState({
      id: staleId,
      state: 'completed',
      exitCode: 0,
      signal: null,
    })
    assert.equal(client.starts.length, 1)
    assert.ok(
      screen.getByText('Inspect signing configuration before making changes.')
    )
  })
})
