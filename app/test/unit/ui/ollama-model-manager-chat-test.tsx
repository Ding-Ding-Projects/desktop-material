import assert from 'node:assert'
import { describe, it } from 'node:test'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import {
  OllamaModelManager,
  type IOllamaChatMessage,
  type IOllamaChatOptions,
  type IOllamaManagerProvider,
  type IOllamaManagerProviderModel,
  type IOllamaModelInformation,
  type IOllamaModelManagerClient,
  type IOllamaModelRecord,
  type IOllamaPullOptions,
  type IOllamaRequestOptions,
  type IOllamaRunningModelRecord,
} from '../../../src/ui/copilot/ollama-model-manager'

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function provider(
  id: string,
  models: ReadonlyArray<IOllamaManagerProviderModel> = []
): IOllamaManagerProvider {
  return {
    id,
    name: `Ollama ${id}`,
    baseUrl: `http://127.0.0.1:11434/${id}`,
    models,
  }
}

class ChatTestClient implements IOllamaModelManagerClient {
  public models: IOllamaModelRecord[]
  public runningModels: IOllamaRunningModelRecord[] = []
  public readonly calls: string[] = []
  public chatDeltas: ReadonlyArray<string> = ['Hello']
  public chatGate: IDeferred<void> | null = null
  public lastChatSignal: AbortSignal | undefined
  public lastChatMessages: ReadonlyArray<IOllamaChatMessage> = []

  public constructor(models: ReadonlyArray<string>) {
    this.models = models.map(name => ({
      name,
      size: 3 * 1024 * 1024 * 1024,
      details: { family: 'llama', parameterSize: '3B' },
      capabilities: ['completion'],
    }))
  }

  public async health(_options?: IOllamaRequestOptions) {
    this.calls.push('health')
    return { version: '0.9.6' }
  }

  public async list(_options?: IOllamaRequestOptions) {
    this.calls.push('list')
    return [...this.models]
  }

  public async listRunning(_options?: IOllamaRequestOptions) {
    this.calls.push('listRunning')
    return [...this.runningModels]
  }

  public async show(
    model: string,
    _options?: IOllamaRequestOptions
  ): Promise<IOllamaModelInformation> {
    this.calls.push(`show:${model}`)
    return { license: 'MIT', capabilities: ['completion'] }
  }

  public async pull(model: string, _options?: IOllamaPullOptions) {
    this.calls.push(`pull:${model}`)
    this.models.push({ name: model })
  }

  public async copy() {}

  public async delete(model: string, _options?: IOllamaRequestOptions) {
    this.calls.push(`delete:${model}`)
    this.models = this.models.filter(item => item.name !== model)
  }

  public async load(model: string, _options?: IOllamaRequestOptions) {
    this.calls.push(`load:${model}`)
    this.runningModels = [{ name: model }]
  }

  public async unload(model: string, _options?: IOllamaRequestOptions) {
    this.calls.push(`unload:${model}`)
    this.runningModels = []
  }

  public async chat(
    model: string,
    messages: ReadonlyArray<IOllamaChatMessage>,
    options?: IOllamaChatOptions
  ): Promise<string> {
    this.calls.push(`chat:${model}`)
    this.lastChatSignal = options?.signal
    this.lastChatMessages = messages
    for (const delta of this.chatDeltas) {
      options?.onChunk?.({ content: delta, done: false })
    }
    if (this.chatGate !== null) {
      await this.chatGate.promise
    }
    options?.onChunk?.({ content: '', done: true })
    return this.chatDeltas.join('')
  }
}

function renderManager(
  configuredProvider: IOllamaManagerProvider,
  client: IOllamaModelManagerClient
) {
  return render(
    <OllamaModelManager
      provider={configuredProvider}
      client={client}
      chatSessionsRootPath={join(
        tmpdir(),
        `desktop-material-chat-ui-${randomUUID()}`
      )}
      onProviderModelsChanged={() => {}}
    />
  )
}

function verification(
  container: HTMLElement,
  value: string
): HTMLElement | null {
  return container.querySelector(`[data-verification="${value}"]`)
}

function sessionButton(
  container: HTMLElement,
  title: string
): HTMLButtonElement | null {
  return (
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.ollama-chat-session-select'
      )
    ).find(button => button.textContent?.includes(title)) ?? null
  )
}

async function expandChat() {
  await waitFor(() =>
    assert.ok(screen.getByRole('button', { name: 'Select alpha' }))
  )
  fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
  await waitFor(
    () =>
      assert.ok(
        document.querySelector('[data-verification="ollama-chat-model"]')
      ),
    { timeout: 5_000 }
  )
}

async function waitForAssistant(container: HTMLElement, text: RegExp) {
  await waitFor(
    () =>
      assert.match(
        verification(container, 'ollama-chat-assistant')?.textContent ?? '',
        text
      ),
    { timeout: 5_000 }
  )
}

describe('OllamaModelManager chat panel', () => {
  it('streams assistant deltas into the transcript with the default model', async () => {
    const client = new ChatTestClient(['alpha'])
    const view = renderManager(provider('chat', []), client)
    await expandChat()

    const modelPicker = verification(
      view.container,
      'ollama-chat-model'
    ) as HTMLSelectElement | null
    assert.ok(modelPicker)
    assert.strictEqual(modelPicker.value, 'alpha')

    const input = verification(
      view.container,
      'ollama-chat-input'
    ) as HTMLTextAreaElement | null
    assert.ok(input)
    fireEvent.change(input, { target: { value: 'Hi model' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitForAssistant(view.container, /Hello/)
    assert.match(
      verification(view.container, 'ollama-chat-user')?.textContent ?? '',
      /Hi model/
    )
    assert.deepStrictEqual(client.lastChatMessages, [
      { role: 'user', content: 'Hi model' },
    ])
    assert.strictEqual((input as HTMLTextAreaElement).value, '')
  })

  it('disables Send without input and enables it once a prompt is typed', async () => {
    const client = new ChatTestClient(['alpha'])
    const view = renderManager(provider('gate', []), client)
    await expandChat()

    const send = screen.getByRole('button', { name: 'Send' })
    assert.strictEqual(send.getAttribute('aria-disabled'), 'true')

    fireEvent.change(
      verification(view.container, 'ollama-chat-input') as HTMLTextAreaElement,
      { target: { value: 'now enabled' } }
    )
    assert.strictEqual(
      screen
        .getByRole('button', { name: 'Send' })
        .getAttribute('aria-disabled'),
      null
    )
  })

  it('aborts an in-flight chat when Stop is pressed', async () => {
    const client = new ChatTestClient(['alpha'])
    client.chatGate = deferred<void>()
    const view = renderManager(provider('stop', []), client)
    await expandChat()

    fireEvent.change(
      verification(view.container, 'ollama-chat-input') as HTMLTextAreaElement,
      { target: { value: 'keep going' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const stop = await screen.findByRole('button', { name: 'Stop' })
    assert.ok(verification(view.container, 'ollama-chat-streaming'))
    // The partial assistant delta streamed before the gate is retained.
    await waitForAssistant(view.container, /Hello/)

    fireEvent.click(stop)
    assert.strictEqual(client.lastChatSignal?.aborted, true)
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Send' })))
    assert.strictEqual(
      verification(view.container, 'ollama-chat-streaming'),
      null
    )
  })

  it('aborts and clears an in-flight reply when another chat is opened', async () => {
    const client = new ChatTestClient(['alpha'])
    client.chatGate = deferred<void>()
    const view = renderManager(provider('switch-during-stream', []), client)
    await expandChat()

    fireEvent.change(
      verification(view.container, 'ollama-chat-input') as HTMLTextAreaElement,
      { target: { value: 'old chat' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitForAssistant(view.container, /Hello/)

    fireEvent.click(verification(view.container, 'ollama-chat-new')!)
    await waitFor(
      () => {
        assert.equal(client.lastChatSignal?.aborted, true)
        assert.equal(
          verification(view.container, 'ollama-chat-streaming'),
          null
        )
        assert.equal(
          verification(view.container, 'ollama-chat-assistant'),
          null
        )
      },
      { timeout: 5_000 }
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Send' })
        .getAttribute('aria-disabled'),
      'true'
    )
    client.chatGate.resolve()
  })

  it('persists the transcript when the chat model changes', async () => {
    const client = new ChatTestClient(['alpha', 'beta'])
    const view = renderManager(provider('switch', []), client)
    await expandChat()

    fireEvent.change(
      verification(view.container, 'ollama-chat-input') as HTMLTextAreaElement,
      { target: { value: 'first message' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitForAssistant(view.container, /Hello/)

    fireEvent.change(verification(view.container, 'ollama-chat-model')!, {
      target: { value: 'beta' },
    })
    await waitFor(() =>
      assert.strictEqual(
        (verification(view.container, 'ollama-chat-model') as HTMLSelectElement)
          .value,
        'beta'
      )
    )
    assert.match(
      verification(view.container, 'ollama-chat-user')?.textContent ?? '',
      /first message/
    )
    assert.match(
      verification(view.container, 'ollama-chat-assistant')?.textContent ?? '',
      /Hello/
    )
  })

  it('creates and switches between independent persistent chats', async () => {
    const client = new ChatTestClient(['alpha'])
    const view = renderManager(provider('multiple', []), client)
    await expandChat()

    fireEvent.change(
      verification(view.container, 'ollama-chat-input') as HTMLTextAreaElement,
      { target: { value: 'first conversation' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitForAssistant(view.container, /Hello/)
    await waitFor(
      () => assert.ok(sessionButton(view.container, 'first conversation')),
      { timeout: 5_000 }
    )

    fireEvent.click(verification(view.container, 'ollama-chat-new')!)
    await waitFor(
      () =>
        assert.equal(
          view.container.querySelectorAll('.ollama-chat-session-select').length,
          2
        ),
      { timeout: 5_000 }
    )
    assert.equal(verification(view.container, 'ollama-chat-user'), null)

    fireEvent.change(
      verification(view.container, 'ollama-chat-input') as HTMLTextAreaElement,
      { target: { value: 'second conversation' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitForAssistant(view.container, /Hello/)

    const first = sessionButton(view.container, 'first conversation')
    assert.ok(first)
    fireEvent.click(first)
    await waitFor(
      () =>
        assert.match(
          verification(view.container, 'ollama-chat-user')?.textContent ?? '',
          /first conversation/
        ),
      { timeout: 5_000 }
    )
    assert.doesNotMatch(
      verification(view.container, 'ollama-chat-user')?.textContent ?? '',
      /second conversation/
    )

    const second = sessionButton(view.container, 'second conversation')
    assert.ok(second)
    const secondRow = second.closest('li')
    const deleteButton = Array.from(
      secondRow?.querySelectorAll('button') ?? []
    ).find(button => button.textContent === 'Delete')
    assert.ok(deleteButton)
    fireEvent.click(deleteButton)
    fireEvent.click(verification(view.container, 'ollama-chat-delete-confirm')!)
    await waitFor(
      () =>
        assert.equal(
          sessionButton(view.container, 'second conversation'),
          null
        ),
      { timeout: 5_000 }
    )
    assert.match(
      verification(view.container, 'ollama-chat-user')?.textContent ?? '',
      /first conversation/
    )
  })

  it('prompts to install a model when the endpoint has none', async () => {
    const client = new ChatTestClient([])
    const view = renderManager(provider('empty-chat', []), client)
    await waitFor(() =>
      assert.ok(screen.getByText('No models are installed on this endpoint.'))
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))

    await waitFor(() =>
      assert.ok(screen.getByText('Install a model to start chatting.'))
    )
    assert.strictEqual(screen.queryByRole('button', { name: 'Send' }), null)
    assert.strictEqual(verification(view.container, 'ollama-chat-input'), null)
  })
})
