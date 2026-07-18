import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  AgentServerGatewayURLStorageKey,
  AgentServerLANPortStorageKey,
  AgentServerModeStorageKey,
  AgentServerSiteURLStorageKey,
} from '../../src/lib/agent-commands'
import { restoreAgentServerStartupConfiguration } from '../../src/lib/agent-server-startup'

function storage(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('agent server startup configuration', () => {
  it('restores authenticated paired LAN settings and its stable port', () => {
    const state = storage({
      'agent-server-enabled': '1',
      [AgentServerModeStorageKey]: 'paired-lan',
      [AgentServerSiteURLStorageKey]: 'http://127.0.0.1:3000/connect',
      [AgentServerGatewayURLStorageKey]: 'https://agent.example.test',
      [AgentServerLANPortStorageKey]: '43123',
    })

    assert.deepEqual(restoreAgentServerStartupConfiguration(state), {
      enabled: true,
      mode: 'paired-lan',
      siteURL: 'http://127.0.0.1:3000/connect',
      gatewayURL: 'https://agent.example.test',
      preferredLANPort: 43123,
    })
  })

  it('turns a paired-to-YOLO selection into local/off on restart', () => {
    const state = storage({
      'agent-server-enabled': '1',
      // The preferences UI writes this one-shot sentinel after the explicit
      // warning is accepted, even if paired LAN had previously been persisted.
      [AgentServerModeStorageKey]: 'yolo-lan',
      [AgentServerLANPortStorageKey]: '43123',
    })

    const restored = restoreAgentServerStartupConfiguration(state)

    assert.equal(restored.enabled, false)
    assert.equal(restored.mode, 'local')
    assert.equal(state.values.get(AgentServerModeStorageKey), 'local')
    assert.equal(state.values.get('agent-server-enabled'), '0')
  })
})
