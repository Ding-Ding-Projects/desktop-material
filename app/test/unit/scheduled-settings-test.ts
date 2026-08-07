import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  IScheduledSettingsConfig,
  IScheduledSettingsRule,
  IScheduledSettingsValue,
  isScheduledSettingsRuleActive,
  mergeScheduledSettingsValues,
  normalizeHomeAssistantBaseURL,
  normalizeHomeAssistantEntityId,
  normalizeScheduledSettings,
  normalizeScheduledSettingsAPIEndpoint,
  parseScheduledSettingsAPIResponse,
} from '../../src/models/scheduled-settings'
import { ScheduledSettingsRuntime } from '../../src/lib/scheduled-settings'

function rule(
  source: IScheduledSettingsRule['source'],
  overrides: Partial<IScheduledSettingsRule> = {}
): IScheduledSettingsRule {
  return {
    id: 'schedule-1',
    label: 'Test schedule',
    enabled: true,
    allDays: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    startDate: null,
    endDate: null,
    startTime: '09:00',
    endTime: '17:00',
    source,
    ...overrides,
  }
}

function config(
  ...rules: ReadonlyArray<IScheduledSettingsRule>
): IScheduledSettingsConfig {
  return { version: 1, rules }
}

describe('scheduled settings model', () => {
  it('supports every day with a bounded local time window', () => {
    const normalized = normalizeScheduledSettings({
      version: 1,
      rules: [
        {
          ...rule({ kind: 'local', value: { languageMode: 'cantonese' } }),
          allDays: true,
          daysOfWeek: [],
          startTime: '08:30',
          endTime: '18:00',
        },
      ],
    })
    const scheduledRule = normalized.rules[0]

    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 8, 12, 0)),
      true
    )
    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 8, 18, 0)),
      false
    )
  })

  it('handles a cross-midnight window on the selected start day', () => {
    const scheduledRule = rule(
      { kind: 'local', value: { theme: 'dark' } },
      { daysOfWeek: [5], startTime: '23:00', endTime: '02:00' }
    )

    assert.equal(
      isScheduledSettingsRuleActive(
        scheduledRule,
        new Date(2026, 7, 7, 23, 30)
      ),
      true
    )
    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 8, 1, 30)),
      true
    )
    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 8, 3, 0)),
      false
    )
  })

  it('uses the selected start day for cross-midnight date bounds', () => {
    const scheduledRule = rule(
      { kind: 'local', value: { theme: 'dark' } },
      {
        daysOfWeek: [5],
        startDate: '2026-08-07',
        endDate: '2026-08-07',
        startTime: '23:00',
        endTime: '02:00',
      }
    )

    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 8, 1, 30)),
      true
    )
    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 9, 1, 30)),
      false
    )
  })

  it('keeps reversed date ranges visible and fails them closed', () => {
    const normalized = normalizeScheduledSettings({
      version: 1,
      rules: [
        {
          ...rule({ kind: 'local', value: { theme: 'dark' } }),
          startDate: '2026-08-10',
          endDate: '2026-08-09',
        },
      ],
    })
    const scheduledRule = normalized.rules[0]

    assert.equal(scheduledRule.endDate, '2026-08-09')
    assert.equal(
      isScheduledSettingsRuleActive(scheduledRule, new Date(2026, 7, 10, 10)),
      false
    )
  })

  it('validates external sources and keeps no Home Assistant token in the schedule', () => {
    assert.equal(
      normalizeScheduledSettingsAPIEndpoint('https://example.test/settings'),
      'https://example.test/settings'
    )
    assert.equal(
      normalizeScheduledSettingsAPIEndpoint(
        'https://example.test/settings?token=secret'
      ),
      null
    )
    assert.equal(
      normalizeScheduledSettingsAPIEndpoint('http://example.test/settings'),
      null
    )
    assert.equal(
      normalizeHomeAssistantBaseURL('http://127.0.0.1:8123/'),
      'http://127.0.0.1:8123'
    )
    assert.equal(
      normalizeHomeAssistantBaseURL('https://ha.example.test/?token=secret'),
      null
    )
    assert.equal(
      normalizeHomeAssistantEntityId('binary_sensor.office'),
      'binary_sensor.office'
    )
    assert.equal(normalizeHomeAssistantEntityId('light.office'), null)

    const normalized = normalizeScheduledSettings({
      version: 1,
      rules: [
        {
          ...rule({
            kind: 'home-assistant',
            baseUrl: 'https://ha.example.test',
            entityId: 'input_boolean.focus',
            value: { theme: 'dark' },
          }),
        },
      ],
    })
    assert.deepEqual(normalized.rules[0].source, {
      kind: 'home-assistant',
      baseUrl: 'https://ha.example.test',
      entityId: 'input_boolean.focus',
      value: { theme: 'dark' },
    })
  })

  it('parses the versioned API response and rejects arbitrary settings', () => {
    assert.deepEqual(
      parseScheduledSettingsAPIResponse({
        version: 1,
        settings: {
          languageMode: 'bilingual',
          theme: 'light',
          unexpected: 'discarded',
        },
      }),
      { languageMode: 'bilingual', theme: 'light' }
    )
    assert.equal(
      parseScheduledSettingsAPIResponse({
        version: 2,
        settings: { theme: 'dark' },
      }),
      null
    )

    const remoteIdentity = parseScheduledSettingsAPIResponse({
      version: 1,
      settings: {
        appearance: {
          appIdentity: {
            displayName: 'API title',
            logo: 'custom',
            customLogoPath: 'C:\\private\\secret.png',
            unexpectedPathLikeField: 'C:\\private\\other.png',
          },
        },
      },
    })
    const identity = remoteIdentity?.appearance?.appIdentity as
      | Record<string, unknown>
      | undefined
    assert.equal(identity?.displayName, 'API title')
    assert.equal(identity?.customLogoPath, null)
    assert.equal(identity?.unexpectedPathLikeField, undefined)
  })

  it('fails closed for an unknown source kind', () => {
    const normalized = normalizeScheduledSettings({
      version: 1,
      rules: [
        {
          ...rule({ kind: 'local', value: { theme: 'dark' } }),
          source: { kind: 'future-source', value: { theme: 'light' } },
        },
      ],
    })

    assert.equal(normalized.rules[0].enabled, false)
    assert.deepEqual(normalized.rules[0].source, {
      kind: 'local',
      value: {},
    })
  })

  it('merges active values in document order', () => {
    assert.deepEqual(
      mergeScheduledSettingsValues([
        { languageMode: 'english', theme: 'light' },
        { languageMode: 'cantonese', appearance: { accentPalette: 'rose' } },
      ]),
      {
        languageMode: 'cantonese',
        theme: 'light',
        appearance: { accentPalette: 'rose' },
      }
    )
  })
})

describe('scheduled settings runtime', () => {
  it('applies local and API values, gates Home Assistant values by on/off, and isolates failures', async () => {
    const errors: Array<string> = []
    const applied: Array<unknown> = []
    const runtime = new ScheduledSettingsRuntime({
      now: () => new Date(2026, 7, 3, 10, 0),
      fetchAPI: async endpoint => {
        if (endpoint === 'https://broken.test/settings') {
          throw new Error('network unavailable')
        }
        return { theme: 'dark' }
      },
      fetchHomeAssistant: async request =>
        request.entityId === 'binary_sensor.off' ? 'off' : 'on',
      onEffectiveValueChanged: value => applied.push(value),
      onError: error =>
        errors.push(error instanceof Error ? error.message : String(error)),
    })

    runtime.setConfig(
      config(
        rule({ kind: 'local', value: { languageMode: 'bilingual' } }),
        rule(
          { kind: 'api', endpoint: 'https://good.test/settings' },
          { id: 'schedule-2' }
        ),
        rule(
          {
            kind: 'home-assistant',
            baseUrl: 'https://ha.test',
            entityId: 'binary_sensor.on',
            value: { appearance: { accentPalette: 'teal' } },
          },
          { id: 'schedule-3' }
        ),
        rule(
          {
            kind: 'home-assistant',
            baseUrl: 'https://ha.test',
            entityId: 'binary_sensor.off',
            value: { theme: 'light' },
          },
          { id: 'schedule-4' }
        ),
        rule(
          { kind: 'api', endpoint: 'https://broken.test/settings' },
          { id: 'schedule-5' }
        )
      )
    )
    await runtime.refresh()

    assert.deepEqual(runtime.getEffectiveValue(), {
      languageMode: 'bilingual',
      theme: 'dark',
      appearance: { accentPalette: 'teal' },
    })
    assert.ok(errors.length >= 1)
    assert.deepEqual([...new Set(errors)], ['network unavailable'])
    assert.equal(applied.at(-1) !== null, true)
  })

  it('does not report an error from a stale refresh generation', async () => {
    let rejectSlow: (error: Error) => void = () => undefined
    const slowRequest = new Promise<IScheduledSettingsValue>((_, reject) => {
      rejectSlow = error => reject(error)
    })
    const errors: string[] = []
    const runtime = new ScheduledSettingsRuntime({
      now: () => new Date(2026, 7, 3, 10, 0),
      fetchAPI: async endpoint =>
        endpoint === 'https://slow.test/settings'
          ? slowRequest
          : { theme: 'light' },
      fetchHomeAssistant: async () => 'off',
      onError: error => errors.push(String(error)),
    })

    runtime.setConfig(
      config(rule({ kind: 'api', endpoint: 'https://slow.test/settings' }))
    )
    runtime.setConfig(
      config(rule({ kind: 'api', endpoint: 'https://current.test/settings' }))
    )
    await runtime.refresh()
    rejectSlow(new Error('obsolete network failure'))
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    assert.deepEqual(runtime.getEffectiveValue(), { theme: 'light' })
    assert.deepEqual(errors, [])
  })
})
