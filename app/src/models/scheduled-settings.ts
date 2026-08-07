import {
  DefaultAppearanceCustomization,
  IAppearanceCustomization,
  normalizeAppearanceCustomization,
} from './appearance-customization'
import {
  LanguageMode,
  languageModes,
  normalizeLanguageMode,
} from './language-mode'

/** The persisted schedule schema. */
export const ScheduledSettingsVersion = 1 as const

export type ScheduledTheme = 'system' | 'light' | 'dark'
export const scheduledThemes: ReadonlyArray<ScheduledTheme> = [
  'system',
  'light',
  'dark',
]

export const scheduledWeekdays = [0, 1, 2, 3, 4, 5, 6] as const
export type ScheduledWeekday = typeof scheduledWeekdays[number]

export const DefaultScheduledStartTime = '09:00'
export const DefaultScheduledEndTime = '17:00'
export const MaxScheduledSettingsLength = 64 * 1024
export const MaxScheduledRules = 32
export const MaxScheduledRuleLabelLength = 80
export const MaxScheduledAPIEndpointLength = 2048
export const MaxHomeAssistantEntityIdLength = 255
export const MaxHomeAssistantTokenLength = 4096

export type ScheduledAppearanceKey = Exclude<
  keyof IAppearanceCustomization,
  'version' | 'languageMode'
>

/** A partial, allowlisted value that a schedule may apply. */
export interface IScheduledSettingsValue {
  readonly languageMode?: LanguageMode
  readonly theme?: ScheduledTheme
  readonly appearance?: Partial<IAppearanceCustomization>
}

export type HomeAssistantBooleanState = 'on' | 'off'

export interface IHomeAssistantSettingsRequest {
  readonly baseUrl: string
  readonly entityId: string
}

export interface ISetHomeAssistantTokenRequest
  extends IHomeAssistantSettingsRequest {
  /** The token is accepted only by the main process and is never persisted here. */
  readonly token: string | null
}

export type ScheduledSettingsSource =
  | {
      readonly kind: 'local'
      readonly value: IScheduledSettingsValue
    }
  | {
      readonly kind: 'api'
      /** HTTPS, or HTTP on loopback only. No credentials are accepted. */
      readonly endpoint: string
    }
  | {
      readonly kind: 'home-assistant'
      /** HTTPS, or HTTP on loopback only. No credentials are accepted. */
      readonly baseUrl: string
      /** A boolean-like Home Assistant entity whose state must be `on`. */
      readonly entityId: string
      readonly value: IScheduledSettingsValue
    }

/** One local-time window that may control language and appearance together. */
export interface IScheduledSettingsRule {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
  /** When true, the rule ignores `daysOfWeek` and runs every day. */
  readonly allDays: boolean
  readonly daysOfWeek: ReadonlyArray<ScheduledWeekday>
  /** Inclusive ISO local dates. Null means unbounded. */
  readonly startDate: string | null
  readonly endDate: string | null
  /** Local 24-hour times in HH:mm form. End is exclusive. */
  readonly startTime: string
  readonly endTime: string
  readonly source: ScheduledSettingsSource
}

export interface IScheduledSettingsConfig {
  readonly version: typeof ScheduledSettingsVersion
  readonly rules: ReadonlyArray<IScheduledSettingsRule>
}

export const DefaultScheduledSettingsConfig: IScheduledSettingsConfig = {
  version: ScheduledSettingsVersion,
  rules: [],
}

const ScheduledAppearanceKeys: ReadonlyArray<ScheduledAppearanceKey> = [
  'accentPalette',
  'updateProgressPalette',
  'surfacePalette',
  'elevation',
  'uiFont',
  'monospaceFont',
  'motion',
  'toolbarLabels',
  'toolbarDensity',
  'toolbarTextStyle',
  'repositoryListDensity',
  'tabDensity',
  'tabWidth',
  'tabCloseButtons',
  'submoduleBackButtonStyle',
  'submoduleBackButtonLabel',
  'highlightDesktopMaterialFeatures',
  'appIdentity',
  'repositoryLogo',
]

const ScheduledAppIdentityKeys = [
  'displayName',
  'logo',
  'logoColor',
  'logoShape',
  'showLogo',
  'logoSize',
  'logoInset',
  'logoRotation',
  'logoBorder',
  'logoBorderColor',
  'logoShadow',
  'brandGap',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontWidth',
  'fontColor',
  'fontOpacity',
  'highlightStyle',
  'highlightColor',
  'bold',
  'italic',
  'underline',
  'strikeThrough',
  'smallCaps',
  'textCase',
  'characterSpacing',
  'textEffect',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(
  value: unknown,
  choices: ReadonlyArray<T>
): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const label = value.trim().slice(0, MaxScheduledRuleLabelLength)
  return label.length === 0 ? fallback : label
}

function normalizeId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const id = value.trim().slice(0, 64)
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : fallback
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return parsed.toISOString().slice(0, 10) === value ? value : null
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    return fallback
  }
  const [hour, minute] = value.split(':').map(Number)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? value
    : fallback
}

function normalizeDays(value: unknown): ReadonlyArray<ScheduledWeekday> {
  if (!Array.isArray(value)) {
    return [1, 2, 3, 4, 5]
  }
  const days = value.filter(
    (day): day is ScheduledWeekday =>
      typeof day === 'number' &&
      scheduledWeekdays.includes(day as ScheduledWeekday)
  )
  return [...new Set(days)].sort((left, right) => left - right)
}

/** Keep harmless in-progress URL edits visible without retaining URL credentials. */
function preserveURLDraft(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  const draft = value.trim().slice(0, MaxScheduledAPIEndpointLength)
  try {
    const url = new URL(draft)
    if (url.username !== '' || url.password !== '') {
      return ''
    }
  } catch {
    // Partial edits such as `https://` are retained so typing is not destructive.
  }
  return draft
}

/** Normalize only the appearance fields supported by schedules. */
export function normalizeScheduledAppearancePatch(
  value: unknown
): Partial<IAppearanceCustomization> {
  if (!isRecord(value)) {
    return {}
  }

  const normalized = normalizeAppearanceCustomization({
    ...DefaultAppearanceCustomization,
    ...value,
  })
  const patch: Partial<IAppearanceCustomization> = {}
  for (const key of ScheduledAppearanceKeys) {
    if (key in value) {
      ;(patch as Record<string, unknown>)[key] = normalized[key]
    }
  }
  return patch
}

/** Normalize a local or API-provided value without accepting arbitrary keys. */
export function normalizeScheduledSettingsValue(
  value: unknown
): IScheduledSettingsValue {
  if (!isRecord(value)) {
    return {}
  }

  const normalized: {
    languageMode?: LanguageMode
    theme?: ScheduledTheme
    appearance?: Partial<IAppearanceCustomization>
  } = {}

  if (isOneOf(value.languageMode, languageModes)) {
    normalized.languageMode = normalizeLanguageMode(value.languageMode)
  }
  if (isOneOf(value.theme, scheduledThemes)) {
    normalized.theme = value.theme
  }
  const appearance = normalizeScheduledAppearancePatch(value.appearance)
  if (Object.keys(appearance).length > 0) {
    normalized.appearance = appearance
  }
  return normalized
}

/** Validate and normalize a schedule API endpoint before it reaches fetch. */
export function normalizeScheduledSettingsAPIEndpoint(
  value: unknown
): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  if (text.length === 0 || text.length > MaxScheduledAPIEndpointLength) {
    return null
  }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const loopback =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    return null
  }
  if (
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return null
  }

  return url.toString()
}

/** Normalize a Home Assistant server URL without accepting query or fragment data. */
export function normalizeHomeAssistantBaseURL(value: unknown): string | null {
  const endpoint = normalizeScheduledSettingsAPIEndpoint(value)
  if (endpoint === null) {
    return null
  }

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return null
  }
  if (url.search !== '' || url.hash !== '') {
    return null
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

/** Only boolean-like Home Assistant entities may gate a schedule. */
export function normalizeHomeAssistantEntityId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const entityId = value.trim().slice(0, MaxHomeAssistantEntityIdLength)
  return /^(binary_sensor|input_boolean|sensor|switch)\.[a-z0-9_]+$/.test(
    entityId
  )
    ? entityId
    : null
}

/** Parse the exact response shape returned by the scheduled-settings API. */
export function parseScheduledSettingsAPIResponse(
  value: unknown
): IScheduledSettingsValue | null {
  if (!isRecord(value) || value.version !== ScheduledSettingsVersion) {
    return null
  }
  const settings = normalizeScheduledSettingsValue(value.settings)
  const appearance = settings.appearance
  let safeSettings = settings
  const identity = appearance?.appIdentity
  if (isRecord(identity)) {
    // The API may choose safe identity styling, but it must not be able to
    // make the renderer load an arbitrary local or UNC image path.
    const safeIdentity: Record<string, unknown> = {
      customLogoPath: null,
    }
    for (const key of ScheduledAppIdentityKeys) {
      safeIdentity[key] = identity[key]
    }
    safeSettings = {
      ...settings,
      appearance: {
        ...appearance,
        appIdentity: safeIdentity as typeof identity,
      },
    }
  }
  return Object.keys(safeSettings).length === 0 ? null : safeSettings
}

/** Normalize an individual rule, failing closed for an unusable API source. */
export function normalizeScheduledSettingsRule(
  value: unknown,
  index: number = 0
): IScheduledSettingsRule {
  const source = isRecord(value) ? value : {}
  const allDays = source.allDays === true
  const daysOfWeek = normalizeDays(source.daysOfWeek)
  const startDate = normalizeIsoDate(source.startDate)
  const candidateEndDate = normalizeIsoDate(source.endDate)
  // Keep a reversed range visible so the editor can explain it. The runtime
  // fails closed instead of quietly converting it into an unbounded rule.
  const endDate = candidateEndDate

  const rawSource = isRecord(source.source) ? source.source : {}
  let normalizedSource: ScheduledSettingsSource
  let sourceEnabled = true
  if (rawSource.kind === 'api') {
    const endpoint = normalizeScheduledSettingsAPIEndpoint(rawSource.endpoint)
    normalizedSource = {
      kind: 'api',
      endpoint: endpoint ?? preserveURLDraft(rawSource.endpoint),
    }
    sourceEnabled = endpoint !== null
  } else if (rawSource.kind === 'home-assistant') {
    const baseUrl = normalizeHomeAssistantBaseURL(rawSource.baseUrl)
    const entityId = normalizeHomeAssistantEntityId(rawSource.entityId)
    normalizedSource = {
      kind: 'home-assistant',
      baseUrl: baseUrl ?? preserveURLDraft(rawSource.baseUrl),
      entityId:
        entityId ??
        (typeof rawSource.entityId === 'string'
          ? rawSource.entityId.trim().slice(0, MaxHomeAssistantEntityIdLength)
          : ''),
      value: normalizeScheduledSettingsValue(rawSource.value),
    }
    sourceEnabled = baseUrl !== null && entityId !== null
  } else if (rawSource.kind === undefined || rawSource.kind === 'local') {
    normalizedSource = {
      kind: 'local',
      value: normalizeScheduledSettingsValue(rawSource.value),
    }
  } else {
    // A future or corrupted source must never silently become a local rule.
    normalizedSource = {
      kind: 'local',
      value: {},
    }
    sourceEnabled = false
  }

  return {
    id: normalizeId(source.id, `scheduled-${index + 1}`),
    label: normalizeLabel(source.label, `Schedule ${index + 1}`),
    enabled: source.enabled !== false && sourceEnabled,
    allDays,
    daysOfWeek,
    startDate,
    endDate,
    startTime: normalizeTime(source.startTime, DefaultScheduledStartTime),
    endTime: normalizeTime(source.endTime, DefaultScheduledEndTime),
    source: normalizedSource,
  }
}

/** Parse and bound the persisted schedule document. */
export function normalizeScheduledSettings(
  value: unknown
): IScheduledSettingsConfig {
  const source = isRecord(value) ? value : {}
  const rawRules = Array.isArray(source.rules) ? source.rules : []
  const seenIds = new Set<string>()
  const rules: Array<IScheduledSettingsRule> = []
  for (
    let index = 0;
    index < Math.min(rawRules.length, MaxScheduledRules);
    index++
  ) {
    const rule = normalizeScheduledSettingsRule(rawRules[index], index)
    let id = rule.id
    let suffix = 2
    while (seenIds.has(id)) {
      id = `${rule.id}-${suffix++}`
    }
    seenIds.add(id)
    rules.push({ ...rule, id })
  }
  return { version: ScheduledSettingsVersion, rules }
}

export function serializeScheduledSettings(
  value: IScheduledSettingsConfig
): string {
  return JSON.stringify(normalizeScheduledSettings(value))
}

export function parseScheduledSettings(
  serialized: string | null
): IScheduledSettingsConfig {
  if (
    serialized === null ||
    serialized.length === 0 ||
    serialized.length > MaxScheduledSettingsLength
  ) {
    return DefaultScheduledSettingsConfig
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!isRecord(parsed) || parsed.version !== ScheduledSettingsVersion) {
      return DefaultScheduledSettingsConfig
    }
    return normalizeScheduledSettings(parsed)
  } catch {
    return DefaultScheduledSettingsConfig
  }
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function localDateString(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDaySelected(rule: IScheduledSettingsRule, day: number): boolean {
  return rule.allDays || rule.daysOfWeek.includes(day as ScheduledWeekday)
}

/** Determine whether a rule is active at a local wall-clock instant. */
export function isScheduledSettingsRuleActive(
  rule: IScheduledSettingsRule,
  now: Date
): boolean {
  if (!rule.enabled) {
    return false
  }

  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = timeToMinutes(rule.startTime)
  const end = timeToMinutes(rule.endTime)
  if (
    rule.startDate !== null &&
    rule.endDate !== null &&
    rule.endDate < rule.startDate
  ) {
    return false
  }

  const scheduleDate = new Date(now)
  const crossesMidnight = start > end
  const afterMidnightContinuation = crossesMidnight && minutes < end
  if (afterMidnightContinuation) {
    // The continuation belongs to the previous local calendar day, including
    // its date bounds and selected weekday. Date arithmetic stays local so a
    // daylight-saving transition cannot shift the schedule by an hour.
    scheduleDate.setDate(scheduleDate.getDate() - 1)
  }
  const date = localDateString(scheduleDate)
  if (rule.startDate !== null && date < rule.startDate) {
    return false
  }
  if (rule.endDate !== null && date > rule.endDate) {
    return false
  }

  const day = scheduleDate.getDay()

  if (start === end) {
    return isDaySelected(rule, day)
  }
  if (start < end) {
    return isDaySelected(rule, day) && minutes >= start && minutes < end
  }

  // A window such as 23:00–02:00 belongs to the selected start day and its
  // after-midnight continuation belongs to the preceding selected day.
  return (
    isDaySelected(rule, day) && (minutes >= start || afterMidnightContinuation)
  )
}

/** Merge active values in document order; later rules intentionally win. */
export function mergeScheduledSettingsValues(
  values: ReadonlyArray<IScheduledSettingsValue>
): IScheduledSettingsValue {
  let languageMode: LanguageMode | undefined
  let theme: ScheduledTheme | undefined
  let appearance: Partial<IAppearanceCustomization> = {}
  for (const value of values) {
    if (value.languageMode !== undefined) {
      languageMode = value.languageMode
    }
    if (value.theme !== undefined) {
      theme = value.theme
    }
    if (value.appearance !== undefined) {
      appearance = { ...appearance, ...value.appearance }
    }
  }

  const result: {
    languageMode?: LanguageMode
    theme?: ScheduledTheme
    appearance?: Partial<IAppearanceCustomization>
  } = {}
  if (languageMode !== undefined) {
    result.languageMode = languageMode
  }
  if (theme !== undefined) {
    result.theme = theme
  }
  if (Object.keys(appearance).length > 0) {
    result.appearance = normalizeScheduledAppearancePatch(appearance)
  }
  return result
}
