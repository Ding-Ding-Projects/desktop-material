import { describe, it } from 'node:test'
import assert from 'node:assert'
import type { ModelInfo } from '@github/copilot-sdk'
import { getConflictResolutionModelDisplay } from '../../src/lib/copilot/conflict-resolution-model'
import { encodeModelKey, IBYOKProvider } from '../../src/lib/copilot/byok'

function makeModel(
  overrides: Partial<ModelInfo> & Pick<ModelInfo, 'id' | 'name'>
): ModelInfo {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

const defaultModel = makeModel({
  id: 'gpt-5-mini',
  name: 'GPT-5 mini',
  supportedReasoningEfforts: ['low', 'medium', 'high'],
})

const opus = makeModel({
  id: 'claude-opus',
  name: 'Claude Opus',
  supportedReasoningEfforts: ['high', 'xhigh'],
})

const noEffortModel = makeModel({ id: 'plain', name: 'Plain' })

const copilotModels = [defaultModel, opus, noEffortModel]

const byokProvider: IBYOKProvider = {
  id: 'provider-1',
  name: 'My Provider',
  type: 'openai',
  baseUrl: 'https://api.example.com/v1',
  authKind: 'apiKey',
  models: [
    { id: 'custom-a', name: 'Custom A', reasoningEffort: 'high' },
    { id: 'custom-b', name: 'Custom B' },
  ],
}

describe('getConflictResolutionModelDisplay', () => {
  it('falls back to the default model and effort when nothing is selected', () => {
    const result = getConflictResolutionModelDisplay(null, copilotModels, [])
    assert.deepStrictEqual(result, {
      modelName: 'GPT-5 mini',
      reasoningEffort: 'medium',
    })
  })

  it('uses a friendly fallback when the model list has not loaded', () => {
    const result = getConflictResolutionModelDisplay(null, null, [])
    assert.deepStrictEqual(result, {
      modelName: 'GPT-5 mini',
      reasoningEffort: 'medium',
    })
  })

  it('returns the selected built-in model with the default effort when supported', () => {
    const selection = encodeModelKey({
      kind: 'copilot',
      modelId: 'gpt-5-mini',
    })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'GPT-5 mini',
      reasoningEffort: 'medium',
    })
  })

  it('clamps the effort to one the selected model supports', () => {
    const selection = encodeModelKey({
      kind: 'copilot',
      modelId: 'claude-opus',
    })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    // Opus does not support 'medium' (the default), so falls back to its
    // lowest supported effort ('high').
    assert.deepStrictEqual(result, {
      modelName: 'Claude Opus',
      reasoningEffort: 'high',
    })
  })

  it('omits the effort when the selected model has no reasoning support', () => {
    const selection = encodeModelKey({ kind: 'copilot', modelId: 'plain' })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'Plain',
      reasoningEffort: undefined,
    })
  })

  it('shows the requested built-in model id when metadata is unavailable', () => {
    const selection = encodeModelKey({
      kind: 'copilot',
      modelId: 'claude-opus',
    })
    const result = getConflictResolutionModelDisplay(selection, null, [])
    assert.deepStrictEqual(result, {
      modelName: 'claude-opus',
      reasoningEffort: 'medium',
    })
  })

  it('returns the BYOK model name and its configured effort', () => {
    const selection = encodeModelKey({
      kind: 'byok',
      providerId: 'provider-1',
      modelId: 'custom-a',
    })
    const result = getConflictResolutionModelDisplay(selection, copilotModels, [
      byokProvider,
    ])
    assert.deepStrictEqual(result, {
      modelName: 'Custom A',
      reasoningEffort: 'high',
    })
  })

  it('omits the effort for a BYOK model without a configured effort', () => {
    const selection = encodeModelKey({
      kind: 'byok',
      providerId: 'provider-1',
      modelId: 'custom-b',
    })
    const result = getConflictResolutionModelDisplay(selection, copilotModels, [
      byokProvider,
    ])
    assert.deepStrictEqual(result, {
      modelName: 'Custom B',
      reasoningEffort: undefined,
    })
  })

  it('falls back to the default model when the BYOK selection is missing', () => {
    const selection = encodeModelKey({
      kind: 'byok',
      providerId: 'deleted',
      modelId: 'gone',
    })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'GPT-5 mini',
      reasoningEffort: 'medium',
    })
  })
})
