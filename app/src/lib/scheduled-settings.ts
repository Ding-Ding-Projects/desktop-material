import {
  DefaultScheduledSettingsConfig,
  HomeAssistantBooleanState,
  IHomeAssistantSettingsRequest,
  IScheduledSettingsConfig,
  IScheduledSettingsRule,
  IScheduledSettingsValue,
  isScheduledSettingsRuleActive,
  mergeScheduledSettingsValues,
  normalizeScheduledSettings,
  parseScheduledSettings,
  serializeScheduledSettings,
} from '../models/scheduled-settings'

export const ScheduledSettingsStorageKey = 'scheduled-settings-v1'
export const ScheduledSettingsRefreshIntervalMs = 60_000

export type ScheduledSettingsAPIGetter = (
  endpoint: string
) => Promise<IScheduledSettingsValue>

export type HomeAssistantStateGetter = (
  request: IHomeAssistantSettingsRequest
) => Promise<HomeAssistantBooleanState>

export interface IScheduledSettingsRuntimeOptions {
  readonly fetchAPI: ScheduledSettingsAPIGetter
  readonly fetchHomeAssistant: HomeAssistantStateGetter
  readonly now?: () => Date
  readonly refreshIntervalMs?: number
  readonly onEffectiveValueChanged?: (
    value: IScheduledSettingsValue | null
  ) => void
  readonly onError?: (error: unknown, rule: IScheduledSettingsRule) => void
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function getScheduledSettings(): IScheduledSettingsConfig {
  const storage = getStorage()
  if (storage === null) {
    return DefaultScheduledSettingsConfig
  }
  try {
    return parseScheduledSettings(storage.getItem(ScheduledSettingsStorageKey))
  } catch {
    return DefaultScheduledSettingsConfig
  }
}

export function setScheduledSettings(
  value: IScheduledSettingsConfig
): IScheduledSettingsConfig {
  const normalized = normalizeScheduledSettings(value)
  const storage = getStorage()
  if (storage !== null) {
    try {
      storage.setItem(
        ScheduledSettingsStorageKey,
        serializeScheduledSettings(normalized)
      )
    } catch {
      // A read-only storage profile must not prevent the in-memory setting from applying.
    }
  }
  return normalized
}

/**
 * Resolves all active rules without letting a failed external source disable
 * local rules or prevent the rest of the settings surface from rendering.
 */
export class ScheduledSettingsRuntime {
  private readonly fetchAPI: ScheduledSettingsAPIGetter
  private readonly fetchHomeAssistant: HomeAssistantStateGetter
  private readonly now: () => Date
  private readonly refreshIntervalMs: number
  private readonly onEffectiveValueChanged?: (
    value: IScheduledSettingsValue | null
  ) => void
  private readonly onError?: (
    error: unknown,
    rule: IScheduledSettingsRule
  ) => void
  private config: IScheduledSettingsConfig
  private effectiveValue: IScheduledSettingsValue | null = null
  private refreshGeneration = 0
  private timer: ReturnType<typeof setInterval> | null = null

  public constructor(options: IScheduledSettingsRuntimeOptions) {
    this.fetchAPI = options.fetchAPI
    this.fetchHomeAssistant = options.fetchHomeAssistant
    this.now = options.now ?? (() => new Date())
    this.refreshIntervalMs = Math.max(
      10_000,
      options.refreshIntervalMs ?? ScheduledSettingsRefreshIntervalMs
    )
    this.onEffectiveValueChanged = options.onEffectiveValueChanged
    this.onError = options.onError
    this.config = getScheduledSettings()
  }

  public getConfig(): IScheduledSettingsConfig {
    return this.config
  }

  public getEffectiveValue(): IScheduledSettingsValue | null {
    return this.effectiveValue
  }

  public start() {
    if (this.timer !== null) {
      return
    }
    this.timer = setInterval(() => {
      void this.refresh()
    }, this.refreshIntervalMs)
    void this.refresh()
  }

  public stop() {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.refreshGeneration += 1
  }

  public setConfig(value: IScheduledSettingsConfig) {
    this.config = setScheduledSettings(value)
    void this.refresh()
  }

  public async refresh(now: Date = this.now()): Promise<void> {
    const generation = ++this.refreshGeneration
    const activeRules = this.config.rules.filter(rule =>
      isScheduledSettingsRuleActive(rule, now)
    )
    const errors: Array<{
      readonly error: unknown
      readonly rule: IScheduledSettingsRule
    }> = []
    const values = await Promise.all(
      activeRules.map(async rule => {
        try {
          switch (rule.source.kind) {
            case 'local':
              return rule.source.value
            case 'api':
              return await this.fetchAPI(rule.source.endpoint)
            case 'home-assistant': {
              const state = await this.fetchHomeAssistant({
                baseUrl: rule.source.baseUrl,
                entityId: rule.source.entityId,
              })
              return state === 'on' ? rule.source.value : null
            }
          }
        } catch (error) {
          // Hold errors until the generation guard below. A slow request from
          // an obsolete refresh must not report a failure for the current
          // configuration or overwrite the user's latest diagnosis.
          errors.push({ error, rule })
          return null
        }
      })
    )

    if (generation !== this.refreshGeneration) {
      return
    }

    for (const { error, rule } of errors) {
      this.onError?.(error, rule)
    }

    const nextValue = mergeScheduledSettingsValues(
      values.filter((value): value is IScheduledSettingsValue => value !== null)
    )
    const hasValue = Object.keys(nextValue).length > 0
    this.effectiveValue = hasValue ? nextValue : null
    this.onEffectiveValueChanged?.(this.effectiveValue)
  }
}
