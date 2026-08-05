import { largeRepositoryPathKey } from './large-repository/large-repository-mode'
import type { AIProviderKind } from './ai-security-policy'

/**
 * Administrator-controlled settings for whether AI features may run at all,
 * which repositories are AI-eligible, and which AI provider is permitted.
 *
 * A self-contained localStorage blob (mirroring the large-repository
 * settings pattern) keeps this off the app-store hot path. Every AI feature
 * must resolve its request through `evaluateAIAdminGate` in
 * `ai-security-policy.ts` before it may build a prompt or send anything to a
 * model — this module only stores the administrator's decision.
 */
export interface IAIAdminPolicySettings {
  /**
   * Master kill switch. When `false`, no diff, file content, or path may
   * leave the machine for any AI feature, regardless of any other setting.
   */
  readonly aiFeaturesEnabled: boolean
  /**
   * Allow-list of AI provider kinds an administrator has permitted. An empty
   * list means no provider is permitted (AI features are effectively off
   * even if `aiFeaturesEnabled` is true). Order is not significant.
   */
  readonly allowedProviderKinds: ReadonlyArray<AIProviderKind>
  /**
   * Default AI eligibility applied to a repository with no explicit
   * per-repository override.
   */
  readonly defaultRepositoryEligibility: 'allow' | 'deny'
  /** Per-repository overrides keyed by the normalized working-tree path. */
  readonly repositoryOverrides: Readonly<Record<string, 'allow' | 'deny'>>
}

export const DefaultAIAdminPolicySettings: IAIAdminPolicySettings = {
  aiFeaturesEnabled: true,
  allowedProviderKinds: ['github-copilot', 'byok'],
  defaultRepositoryEligibility: 'allow',
  repositoryOverrides: {},
}

/** localStorage key holding the JSON settings blob. */
export const AIAdminPolicySettingsStorageKey = 'ai-admin-policy-settings-v1'

/** Event dispatched on `document` after settings change, for live UI updates. */
export const AIAdminPolicySettingsChangedEvent =
  'ai-admin-policy-settings-changed'

const validProviderKinds: ReadonlySet<AIProviderKind> = new Set([
  'github-copilot',
  'byok',
])

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function coerceProviderKinds(value: unknown): ReadonlyArray<AIProviderKind> {
  if (!Array.isArray(value)) {
    return DefaultAIAdminPolicySettings.allowedProviderKinds
  }
  const result: Array<AIProviderKind> = []
  for (const entry of value) {
    if (
      typeof entry === 'string' &&
      validProviderKinds.has(entry as AIProviderKind) &&
      !result.includes(entry as AIProviderKind)
    ) {
      result.push(entry as AIProviderKind)
    }
  }
  return result
}

function coerceEligibility(
  value: unknown,
  fallback: 'allow' | 'deny'
): 'allow' | 'deny' {
  return value === 'allow' || value === 'deny' ? value : fallback
}

function coerceRepositoryOverrides(
  value: unknown
): Record<string, 'allow' | 'deny'> {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const result: Record<string, 'allow' | 'deny'> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === 'allow' || raw === 'deny') {
      result[largeRepositoryPathKey(key)] = raw
    }
  }
  return result
}

/**
 * Normalize an arbitrary parsed value into fully-populated, valid settings.
 * Never throws; unknown or corrupt fields fall back to the (safe) defaults.
 */
export function normalizeAIAdminPolicySettings(
  value: unknown
): IAIAdminPolicySettings {
  const d = DefaultAIAdminPolicySettings
  if (typeof value !== 'object' || value === null) {
    return d
  }
  const raw = value as Record<string, unknown>
  return {
    aiFeaturesEnabled: coerceBoolean(
      raw.aiFeaturesEnabled,
      d.aiFeaturesEnabled
    ),
    allowedProviderKinds: coerceProviderKinds(raw.allowedProviderKinds),
    defaultRepositoryEligibility: coerceEligibility(
      raw.defaultRepositoryEligibility,
      d.defaultRepositoryEligibility
    ),
    repositoryOverrides: coerceRepositoryOverrides(raw.repositoryOverrides),
  }
}

export function serializeAIAdminPolicySettings(
  settings: IAIAdminPolicySettings
): string {
  return JSON.stringify(settings)
}

export function parseAIAdminPolicySettings(
  raw: string | null
): IAIAdminPolicySettings {
  if (raw === null) {
    return DefaultAIAdminPolicySettings
  }
  try {
    return normalizeAIAdminPolicySettings(JSON.parse(raw))
  } catch {
    return DefaultAIAdminPolicySettings
  }
}

/**
 * Resolve the effective AI eligibility for one repository path, honouring
 * any explicit per-repository override before falling back to the
 * administrator's default.
 */
export function resolveRepositoryAIEligibility(
  settings: IAIAdminPolicySettings,
  path: string
): 'allow' | 'deny' {
  const explicit = settings.repositoryOverrides[largeRepositoryPathKey(path)]
  return explicit ?? settings.defaultRepositoryEligibility
}

/**
 * The explicit per-repository override for `path`, or `undefined` when the
 * repository has none and falls back to {@link IAIAdminPolicySettings.defaultRepositoryEligibility}.
 */
export function getExplicitRepositoryOverride(
  settings: IAIAdminPolicySettings,
  path: string
): 'allow' | 'deny' | undefined {
  return settings.repositoryOverrides[largeRepositoryPathKey(path)]
}

/** Return a copy of `settings` with the override for `path` set (or cleared). */
export function withRepositoryOverride(
  settings: IAIAdminPolicySettings,
  path: string,
  override: 'allow' | 'deny' | null
): IAIAdminPolicySettings {
  const key = largeRepositoryPathKey(path)
  const repositoryOverrides: Record<string, 'allow' | 'deny'> = {
    ...settings.repositoryOverrides,
  }
  if (override === null) {
    delete repositoryOverrides[key]
  } else {
    repositoryOverrides[key] = override
  }
  return { ...settings, repositoryOverrides }
}

let cachedSettings: IAIAdminPolicySettings | null = null

/** Read settings from localStorage, caching the normalized result. */
export function getAIAdminPolicySettings(): IAIAdminPolicySettings {
  if (cachedSettings !== null) {
    return cachedSettings
  }
  let raw: string | null = null
  try {
    raw = localStorage.getItem(AIAdminPolicySettingsStorageKey)
  } catch {
    raw = null
  }
  cachedSettings = parseAIAdminPolicySettings(raw)
  return cachedSettings
}

/** Persist settings and notify listeners so open UI can update live. */
export function setAIAdminPolicySettings(
  settings: IAIAdminPolicySettings
): void {
  const normalized = normalizeAIAdminPolicySettings(settings)
  cachedSettings = normalized
  try {
    localStorage.setItem(
      AIAdminPolicySettingsStorageKey,
      serializeAIAdminPolicySettings(normalized)
    )
  } catch {
    // Persisting is best-effort; the cached value still drives this session.
  }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent(AIAdminPolicySettingsChangedEvent, {
        detail: normalized,
      })
    )
  }
}

/** Drop the in-memory cache so the next read reloads from storage (tests). */
export function resetAIAdminPolicySettingsCache(): void {
  cachedSettings = null
}
