import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  StatusHubConfigurationStore,
  StatusHubCredentialAccount,
  StatusHubCredentialService,
} from '../../src/main-process/status-hub-configuration-store'

class TestVault {
  private readonly values = new Map<string, string>()

  public async setItem(service: string, account: string, value: string) {
    this.values.set(`${service}:${account}`, value)
  }

  public async getItem(service: string, account: string) {
    return this.values.get(`${service}:${account}`) ?? null
  }

  public async deleteItem(service: string, account: string) {
    return this.values.delete(`${service}:${account}`)
  }

  public storedAuthorization() {
    return this.values.get(
      `${StatusHubCredentialService}:${StatusHubCredentialAccount}`
    )
  }
}

async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'status-hub-configuration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const vault = new TestVault()
  const path = join(root, 'configuration.json')
  return {
    path,
    vault,
    store: new StatusHubConfigurationStore(path, vault),
  }
}

describe('Status Hub owner configuration', () => {
  it('persists only the normalized endpoint and keeps authorization in the vault', async t => {
    const { path, store, vault } = await fixture(t)
    assert.deepEqual(await store.get(), {
      endpoint: null,
      authorizationPresent: false,
    })

    const saved = await store.set({
      endpoint: 'https://status.example.test/base',
      authorization: 'owner-value',
    })
    assert.deepEqual(saved, {
      endpoint: 'https://status.example.test/base',
      authorizationPresent: true,
    })
    assert.equal(vault.storedAuthorization(), 'Bearer owner-value')

    const bytes = await readFile(path, 'utf8')
    assert.doesNotMatch(bytes, /owner-value|Bearer/i)

    const restarted = new StatusHubConfigurationStore(path, vault)
    assert.deepEqual(await restarted.get(), saved)
    assert.equal(await restarted.getAuthorization(), 'Bearer owner-value')
  })

  it('keeps the existing vault value when an endpoint-only update is saved', async t => {
    const { store, vault } = await fixture(t)
    await store.set({
      endpoint: 'https://one.example.test',
      authorization: 'first-value',
    })
    await store.set({ endpoint: 'https://two.example.test' })

    assert.equal(vault.storedAuthorization(), 'Bearer first-value')
    assert.deepEqual(await store.get(), {
      endpoint: 'https://two.example.test/',
      authorizationPresent: true,
    })
  })

  it('clears authorization without removing the endpoint', async t => {
    const { store } = await fixture(t)
    await store.set({
      endpoint: 'http://127.0.0.1:8099',
      authorization: 'local-value',
    })

    assert.deepEqual(await store.clearAuthorization(), {
      endpoint: 'http://127.0.0.1:8099/',
      authorizationPresent: false,
    })
    assert.equal(await store.getAuthorization(), null)
  })

  it('restores the previous vault value when endpoint persistence fails', async t => {
    const { path, vault } = await fixture(t)
    const working = new StatusHubConfigurationStore(`${path}.working`, vault)
    await working.set({
      endpoint: 'https://status.example.test',
      authorization: 'previous-value',
    })

    await mkdir(path)
    const blocked = new StatusHubConfigurationStore(path, vault)
    await assert.rejects(
      blocked.set({
        endpoint: 'https://new.example.test',
        authorization: 'replacement-value',
      })
    )
    assert.equal(vault.storedAuthorization(), 'Bearer previous-value')
  })

  it('rejects unsafe endpoints, header injection, and malformed files', async t => {
    const { path, store } = await fixture(t)
    await assert.rejects(
      store.set({ endpoint: 'http://status.example.test' }),
      /must use HTTPS/
    )
    await assert.rejects(
      store.set({
        endpoint: 'https://status.example.test',
        authorization: 'value\r\ninjected: yes',
      }),
      /authorization is invalid/
    )

    await writeFile(path, '{"schemaVersion":1,"endpoint":42}')
    await assert.rejects(store.get(), /configuration is invalid/)
  })
})
