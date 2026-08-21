/** Bounded, local-only controls forwarded to the documented chat endpoint. */
export interface IOllamaChatParameters {
  readonly temperature: number
  readonly topP: number
  readonly numPredict: number
}

export const DefaultOllamaChatParameters: IOllamaChatParameters = {
  temperature: 0.7,
  topP: 0.9,
  numPredict: 512,
}

export const MaxOllamaSystemPromptLength = 16 * 1024

function finiteInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null
}

/** Rejects instead of silently coercing parameter values from an imported session. */
export function normalizeOllamaChatParameters(value: unknown): IOllamaChatParameters {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    temperature: finiteInRange(source.temperature, 0, 2) ?? DefaultOllamaChatParameters.temperature,
    topP: finiteInRange(source.topP, 0, 1) ?? DefaultOllamaChatParameters.topP,
    numPredict: finiteInRange(source.numPredict, 1, 8_192) ?? DefaultOllamaChatParameters.numPredict,
  }
}

export function normalizeOllamaSystemPrompt(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MaxOllamaSystemPromptLength) : ''
}

/** Vision is opt-in: absent or ambiguous model metadata never enables attachments. */
export function supportsOllamaVision(capabilities: ReadonlyArray<string> | undefined): boolean {
  return capabilities?.some(capability => /^(vision|image|multimodal)$/i.test(capability.trim())) === true
}
