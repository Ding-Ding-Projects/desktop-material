import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  CodingAgents,
  UnknownAgentRunnerAvailability,
  getCodingAgent,
  getCodingAgentOptionLabel,
  getSelectableCodingAgentIds,
  resolveCodingAgentOptions,
  toAgentRunnerAvailability,
} from '../../src/lib/agent-sessions'
import { ICodingAgent } from '../../src/models/agent-session'

const everythingInstalled = {
  codexInstalled: true,
  codexAuthenticated: true,
  opencodeInstalled: true,
  opencodeAuthenticated: true,
}

describe('coding agent catalog', () => {
  it('preserves authentication separately from CLI installation', () => {
    assert.deepStrictEqual(
      toAgentRunnerAvailability(
        { installed: true, authConfigured: false },
        { installed: true, authConfigured: true }
      ),
      {
        codexInstalled: true,
        codexAuthenticated: false,
        opencodeInstalled: true,
        opencodeAuthenticated: true,
      }
    )
    assert.deepStrictEqual(toAgentRunnerAvailability(null, null), {
      codexInstalled: false,
      codexAuthenticated: false,
      opencodeInstalled: false,
      opencodeAuthenticated: false,
    })
  })

  it('offers exactly the three agents that can be launched, in picker order', () => {
    assert.deepStrictEqual(
      CodingAgents.map(agent => agent.id),
      ['none', 'codex', 'opencode']
    )
    assert.deepStrictEqual(
      CodingAgents.map(agent => agent.name),
      ['<None>', 'Codex CLI', 'OpenCode']
    )
  })

  it('backs every runnable agent with a real runner and lists no placeholders', () => {
    assert.strictEqual(getCodingAgent('codex')?.runner, 'codex')
    assert.strictEqual(getCodingAgent('opencode')?.runner, 'opencode')
    // <None> deliberately runs nothing, so it is the one entry without a runner.
    assert.strictEqual(getCodingAgent('none')?.runner, null)
    assert.ok(
      CodingAgents.every(agent => agent.unsupportedReason === null),
      'a shipped entry must never be permanently unavailable'
    )
  })

  it('offers every agent once both CLIs are detected', () => {
    const options = resolveCodingAgentOptions(everythingInstalled)

    assert.strictEqual(options.length, 3)
    assert.ok(options.every(option => !option.disabled))
    assert.deepStrictEqual(options.map(getCodingAgentOptionLabel), [
      '<None>',
      'Codex CLI',
      'OpenCode',
    ])
  })

  it('disables an undetected CLI and says so in the visible label', () => {
    const options = resolveCodingAgentOptions({
      codexInstalled: false,
      codexAuthenticated: false,
      opencodeInstalled: true,
      opencodeAuthenticated: true,
    })

    const codex = options.find(option => option.agent.id === 'codex')!
    assert.strictEqual(codex.disabled, true)
    assert.strictEqual(codex.unavailableReason, 'not detected')
    assert.strictEqual(
      getCodingAgentOptionLabel(codex),
      'Codex CLI — not detected'
    )

    const opencode = options.find(option => option.agent.id === 'opencode')!
    assert.strictEqual(opencode.disabled, false)
    assert.strictEqual(getCodingAgentOptionLabel(opencode), 'OpenCode')
  })

  it('disables an installed CLI until its authentication probe succeeds', () => {
    const options = resolveCodingAgentOptions({
      codexInstalled: true,
      codexAuthenticated: false,
      opencodeInstalled: true,
      opencodeAuthenticated: true,
    })

    const codex = options.find(option => option.agent.id === 'codex')!
    assert.strictEqual(codex.disabled, true)
    assert.strictEqual(codex.unavailableReason, 'not authenticated')
    assert.strictEqual(
      getCodingAgentOptionLabel(codex),
      'Codex CLI — not authenticated'
    )
    assert.deepStrictEqual(
      getSelectableCodingAgentIds({
        codexInstalled: true,
        codexAuthenticated: false,
        opencodeInstalled: true,
        opencodeAuthenticated: true,
      }),
      ['none', 'opencode']
    )
  })

  it('leaves <None> selectable before detection has run at all', () => {
    assert.deepStrictEqual(
      getSelectableCodingAgentIds(UnknownAgentRunnerAvailability),
      ['none']
    )
  })

  it('keeps room for a future agent whose runner is still being built', () => {
    // The catalog ships only launchable agents, but the row shape must still be
    // able to state that an agent cannot run here — otherwise the day one is
    // added mid-build the only options are lying or omitting it.
    const pending: ICodingAgent = {
      id: 'codex',
      name: 'Some Future CLI',
      runner: null,
      unsupportedReason: 'not supported yet',
    }
    const [option] = resolveCodingAgentOptions(everythingInstalled, [pending])

    assert.strictEqual(option.disabled, true)
    assert.strictEqual(option.unavailableReason, 'not supported yet')
    assert.strictEqual(
      getCodingAgentOptionLabel(option),
      'Some Future CLI — not supported yet'
    )
    assert.deepStrictEqual(
      getSelectableCodingAgentIds(everythingInstalled, [pending]),
      []
    )
  })
})
