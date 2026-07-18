import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { promises as Fs } from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'
import { describe, it } from 'node:test'
import {
  AgentDeviceCredentialService,
  IAgentDeviceCredentialStore,
  PairedDeviceStore,
} from '../../src/main-process/agent-server/paired-device-store'

function device(id = randomUUID(), name = 'Test phone') {
  return { id, name, createdAt: '2026-07-17T12:00:00.000Z' }
}

async function withStore(
  callback: (
    store: PairedDeviceStore,
    metadataPath: string,
    credentials: Map<string, string>,
    credentialStore: IAgentDeviceCredentialStore
  ) => Promise<void>,
  override: Partial<IAgentDeviceCredentialStore> = {}
) {
  const directory = await Fs.mkdtemp(
    Path.join(Os.tmpdir(), 'desktop-agent-devices-')
  )
  const metadataPath = Path.join(directory, 'devices.json')
  const credentials = new Map<string, string>()
  const credentialStore: IAgentDeviceCredentialStore = {
    setItem: async (_service, account, value) => {
      credentials.set(account, value)
    },
    getItem: async (_service, account) => credentials.get(account) ?? null,
    deleteItem: async (_service, account) => credentials.delete(account),
    ...override,
  }
  const store = new PairedDeviceStore(metadataPath, credentialStore)
  try {
    await callback(store, metadataPath, credentials, credentialStore)
  } finally {
    await Fs.rm(directory, { recursive: true, force: true })
  }
}

describe('paired device store', () => {
  it('keeps bearer credentials in the vault and only metadata on disk', async () => {
    await withStore(
      async (store, metadataPath, credentials, credentialStore) => {
        const record = device()
        const token = `${record.id}.device-secret`
        await store.add(record, token)

        assert.equal(
          credentials.get(record.id),
          token,
          'the device-scoped token is stored under its opaque id'
        )
        const metadata = await Fs.readFile(metadataPath, 'utf8')
        assert.match(metadata, /Test phone/)
        assert.doesNotMatch(metadata, /device-secret|token|stayLoggedIn/i)
        assert.deepEqual(await store.authenticate(token), record)
        assert.equal(
          await store.authenticate(`${record.id}.wrong-secret`),
          null
        )

        const afterProcessRestart = new PairedDeviceStore(
          metadataPath,
          credentialStore
        )
        await afterProcessRestart.load()
        assert.deepEqual(afterProcessRestart.list(), [record])
        assert.deepEqual(await afterProcessRestart.authenticate(token), record)
      }
    )
  })

  it('does not authorize an in-flight vault read after revocation', async () => {
    let releaseRead!: () => void
    let readStarted!: () => void
    const readGate = new Promise<void>(resolve => {
      releaseRead = resolve
    })
    const started = new Promise<void>(resolve => {
      readStarted = resolve
    })

    await withStore(
      async (store, _metadataPath, credentials) => {
        const record = device()
        const token = `${record.id}.device-secret`
        await store.add(record, token)

        const authentication = store.authenticate(token)
        await started
        assert.equal(await store.revoke(record.id), true)
        releaseRead()
        assert.equal(await authentication, null)
        assert.equal(credentials.has(record.id), false)
      },
      {
        getItem: async (service, account) => {
          assert.equal(service, AgentDeviceCredentialService)
          readStarted()
          const value = `${account}.device-secret`
          await readGate
          return value
        },
      }
    )
  })

  it('rejects duplicate, excessive, or non-printable metadata', async () => {
    for (const devices of [
      [device('11111111-1111-4111-8111-111111111111', ' trimmed ')],
      [
        device('22222222-2222-4222-8222-222222222222'),
        device('22222222-2222-4222-8222-222222222222'),
      ],
      Array.from({ length: 257 }, (_, index) =>
        device(`00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`)
      ),
    ]) {
      await withStore(async (store, metadataPath) => {
        await Fs.writeFile(
          metadataPath,
          JSON.stringify({ version: 1, devices }),
          'utf8'
        )
        await assert.rejects(store.load(), /metadata is invalid/)
      })
    }
  })
})
