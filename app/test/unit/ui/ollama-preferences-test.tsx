import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import {
  DefaultOllamaEndpoint,
  OllamaPreferences,
} from '../../../src/ui/preferences/ollama'
import type { IBYOKProvider } from '../../../src/lib/copilot/byok'
import type {
  IOllamaModelManagerClient,
  IOllamaModelRecord,
  IOllamaRunningModelRecord,
  IOllamaVersion,
} from '../../../src/ui/copilot/ollama-model-manager'

function ollamaProvider(overrides: Partial<IBYOKProvider> = {}): IBYOKProvider {
  return {
    id: 'provider-1',
    name: 'Ollama',
    type: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    authKind: 'none',
    wireApi: 'completions',
    integration: 'ollama',
    models: [{ id: 'llama3', name: 'llama3' }],
    ...overrides,
  }
}

/** A non-Ollama provider must never make the tab look configured. */
function openAIProvider(): IBYOKProvider {
  return {
    id: 'openai-1',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    authKind: 'apiKey',
    models: [],
  }
}

class TestClient implements IOllamaModelManagerClient {
  public readonly endpoints: string[] = []
  public healthError: Error | null = null
  public healthCalls = 0

  public constructor(private readonly models: ReadonlyArray<string> = []) {}

  public health = async (): Promise<IOllamaVersion> => {
    this.healthCalls++
    if (this.healthError !== null) {
      throw this.healthError
    }
    return { version: '0.5.0' }
  }

  public list = async (): Promise<ReadonlyArray<IOllamaModelRecord>> =>
    this.models.map(name => ({ name, size: 1024, digest: `sha256:${name}` }))

  public listRunning = async (): Promise<
    ReadonlyArray<IOllamaRunningModelRecord>
  > => []

  public show = async () => ({})
  public pull = async () => undefined
  public copy = async () => undefined
  public delete = async () => undefined
  public load = async () => undefined
  public unload = async () => undefined
}

function renderPane(
  props: Partial<React.ComponentProps<typeof OllamaPreferences>> = {},
  client: TestClient = new TestClient()
) {
  const factory = (endpoint: string) => {
    client.endpoints.push(endpoint)
    return client
  }

  const view = render(
    <OllamaPreferences
      byokProviders={[]}
      onUpdateBYOKProvider={() => undefined}
      ollamaClientFactory={factory}
      createProviderId={() => 'created-provider'}
      {...props}
    />
  )

  return { view, client }
}

describe('Ollama preferences tab', () => {
  describe('unconfigured state', () => {
    it('shows the setup state, never Copilot sign-in content', () => {
      renderPane()

      assert.ok(screen.getByText('Connect to Ollama'))
      assert.ok(
        screen.getByText(
          'No Ollama endpoint is configured yet. Start Ollama on this machine, then connect to the loopback address it listens on.'
        )
      )
      assert.equal(screen.queryByText(/Copilot/i), null)
      assert.equal(screen.queryByRole('button', { name: /sign in/i }), null)
      assert.equal(document.querySelector('.ollama-model-manager'), null)
    })

    it('labels the endpoint field and describes it with the loopback hint', () => {
      renderPane()

      const input = screen.getByLabelText('Ollama endpoint')
      assert.equal(input.getAttribute('value'), DefaultOllamaEndpoint)

      const describedBy = input.getAttribute('aria-describedby')
      assert.ok(describedBy)
      const hint = document.getElementById(describedBy.split(' ')[0])
      assert.match(hint?.textContent ?? '', /Only loopback addresses/)
    })

    it('treats a non-Ollama provider as unconfigured', () => {
      renderPane({ byokProviders: [openAIProvider()] })

      assert.ok(screen.getByText('Connect to Ollama'))
      assert.equal(document.querySelector('.ollama-model-manager'), null)
    })

    it('explains a non-loopback endpoint instead of probing it', async () => {
      const client = new TestClient()
      const saved: IBYOKProvider[] = []

      renderPane(
        { onUpdateBYOKProvider: provider => void saved.push(provider) },
        client
      )

      fireEvent.change(screen.getByLabelText('Ollama endpoint'), {
        target: { value: 'https://example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

      const alert = await screen.findByRole('alert')
      assert.match(alert.textContent ?? '', /loopback Ollama endpoint/)
      // A remote host is never contacted, and nothing is persisted.
      assert.deepEqual(client.endpoints, [])
      assert.equal(client.healthCalls, 0)
      assert.equal(saved.length, 0)
    })

    it('points the endpoint field at the error once one is shown', async () => {
      renderPane()

      fireEvent.change(screen.getByLabelText('Ollama endpoint'), {
        target: { value: 'not-a-url' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

      const alert = await screen.findByRole('alert')
      const input = screen.getByLabelText('Ollama endpoint')
      assert.ok(
        (input.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .includes(alert.id)
      )
    })

    it('reports an unreachable endpoint in an alert and saves nothing', async () => {
      const client = new TestClient()
      client.healthError = new Error('offline')
      const saved: IBYOKProvider[] = []

      renderPane(
        { onUpdateBYOKProvider: provider => void saved.push(provider) },
        client
      )

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

      const alert = await screen.findByRole('alert')
      assert.match(alert.textContent ?? '', /Could not reach Ollama/)
      assert.equal(saved.length, 0)
      assert.equal(client.healthCalls, 1)
    })

    it('probes the loopback origin and persists a managed provider', async () => {
      const client = new TestClient()
      const saved: IBYOKProvider[] = []

      renderPane(
        { onUpdateBYOKProvider: provider => void saved.push(provider) },
        client
      )

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

      await waitFor(() => assert.equal(saved.length, 1))

      // The health probe targets the canonical native origin.
      assert.deepEqual(client.endpoints, ['http://127.0.0.1:11434'])
      assert.deepEqual(saved[0], {
        id: 'created-provider',
        name: 'Ollama',
        type: 'openai',
        baseUrl: 'http://127.0.0.1:11434/v1',
        authKind: 'none',
        wireApi: 'completions',
        integration: 'ollama',
        models: [],
      })
    })

    it('normalizes a /v1 endpoint before probing and persisting', async () => {
      const client = new TestClient()
      const saved: IBYOKProvider[] = []

      renderPane(
        { onUpdateBYOKProvider: provider => void saved.push(provider) },
        client
      )

      fireEvent.change(screen.getByLabelText('Ollama endpoint'), {
        target: { value: 'http://localhost:11434/v1' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

      await waitFor(() => assert.equal(saved.length, 1))
      assert.deepEqual(client.endpoints, ['http://localhost:11434'])
      assert.equal(saved[0].baseUrl, 'http://localhost:11434/v1')
    })

    it('surfaces a persistence failure instead of looking connected', async () => {
      renderPane({
        onUpdateBYOKProvider: () => {
          throw new Error('keychain unavailable')
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

      const alert = await screen.findByRole('alert')
      assert.match(alert.textContent ?? '', /could not be saved/)
    })
  })

  describe('configured state', () => {
    it('renders the model manager directly without Copilot access', async () => {
      renderPane(
        { byokProviders: [ollamaProvider()] },
        new TestClient(['llama3'])
      )

      await waitFor(() =>
        assert.ok(document.querySelector('.ollama-model-manager'))
      )
      assert.equal(screen.queryByText('Connect to Ollama'), null)
      assert.equal(screen.queryByRole('button', { name: /sign in/i }), null)
    })

    it('reaches the manager through the provider base URL', async () => {
      const { client } = renderPane(
        { byokProviders: [ollamaProvider()] },
        new TestClient(['llama3'])
      )

      await waitFor(() => assert.ok(client.endpoints.length > 0))
      assert.ok(
        client.endpoints.every(
          endpoint => endpoint === 'http://127.0.0.1:11434/v1'
        )
      )
    })

    it('hides the provider picker for a single provider', async () => {
      renderPane({ byokProviders: [ollamaProvider()] }, new TestClient())

      await waitFor(() =>
        assert.ok(document.querySelector('.ollama-model-manager'))
      )
      assert.equal(screen.queryByLabelText('Ollama provider'), null)
    })

    it('offers a labelled picker when several providers exist', async () => {
      renderPane(
        {
          byokProviders: [
            ollamaProvider(),
            ollamaProvider({
              id: 'provider-2',
              name: 'Ollama dev',
              baseUrl: 'http://127.0.0.1:22434/v1',
            }),
          ],
        },
        new TestClient()
      )

      const picker = screen.getByLabelText('Ollama provider')
      assert.equal(picker.tagName, 'SELECT')
      assert.equal((picker as HTMLSelectElement).value, 'provider-1')

      fireEvent.change(picker, { target: { value: 'provider-2' } })
      assert.equal((picker as HTMLSelectElement).value, 'provider-2')
    })
  })
})
