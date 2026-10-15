import assert from 'node:assert/strict'
import { it, TestContext } from 'node:test'
import { ipcRenderer } from 'electron'
import { AppStore } from '../../src/lib/stores/app-store'
import {
  ScheduledSettingsRuntime,
  ScheduledSettingsStorageKey,
} from '../../src/lib/scheduled-settings'
import {
  IScheduledSettingsValue,
  normalizeScheduledSettings,
  serializeScheduledSettings,
} from '../../src/models/scheduled-settings'
import {
  applySettingsSnapshot,
  captureSettingsSnapshot,
} from '../../src/lib/profiles/profile-settings-registry'
import { DefaultAppearanceCustomization } from '../../src/models/appearance-customization'

function harness(
  t: TestContext,
  fetchAPI = async (): Promise<IScheduledSettingsValue> => ({ theme: 'dark' })
) {
  const previousSettings = captureSettingsSnapshot()
  t.after(() => applySettingsSnapshot(previousSettings))
  t.mock.method(ipcRenderer, 'invoke', async () => false)
  const store = Object.create(AppStore.prototype) as AppStore
  for (const method of [
    'updateResizableConstraints',
    'updatePullRequestResizableConstraints',
    'recomputeAutoFit',
    'emitUpdate',
  ]) {
    Reflect.set(store, method, () => {})
  }
  Reflect.set(store, 'repositoryIndicatorsEnabled', true)
  Reflect.set(store, 'scheduledThemeApplyVersion', 0)
  Reflect.set(store, 'elementAppearanceCoordinator', {
    getState: () => ({
      initialized: true,
      appearance: DefaultAppearanceCustomization,
    }),
  })
  const runtime = new ScheduledSettingsRuntime({
    now: () => new Date(2026, 7, 3, 10),
    fetchAPI,
    fetchHomeAssistant: async () => 'off',
    onEffectiveValueChanged: value =>
      Reflect.get(store, 'applyScheduledSettingsValue').call(store, value),
  })
  Reflect.set(store, 'scheduledSettingsRuntime', runtime)
  Reflect.set(
    store,
    'scheduledBaseAppearanceCustomization',
    DefaultAppearanceCustomization
  )
  return { store, runtime }
}

function schedule(theme: 'light' | 'dark') {
  return normalizeScheduledSettings({
    rules: [
      {
        id: 'rule',
        allDays: true,
        startTime: '00:00',
        endTime: '00:00',
        source: {
          kind: 'local',
          value: { theme, appearance: { accentPalette: 'rose' } },
        },
      },
    ],
  })
}

it('reloads schedule config and effective theme without rewriting restored schedule storage', async t => {
  const { store, runtime } = harness(t)
  runtime.setConfig(schedule('dark'))
  await runtime.refresh()
  const restored = schedule('light')
  const serialized = ` ${serializeScheduledSettings(restored)} `
  applySettingsSnapshot({
    theme: 'dark',
    [ScheduledSettingsStorageKey]: serialized,
  })

  await store._reloadProfileBackedSettings()

  assert.deepEqual(runtime.getConfig(), restored)
  assert.equal(runtime.getEffectiveValue()?.theme, 'light')
  assert.equal(Reflect.get(store, 'currentTheme'), 'light')
  assert.equal(
    Reflect.get(store, 'appearanceCustomization').accentPalette,
    'rose'
  )
  assert.equal(localStorage.getItem(ScheduledSettingsStorageKey), serialized)
})

it('removes an old schedule overlay when the restored profile has no schedule key', async t => {
  const { store, runtime } = harness(t)
  runtime.setConfig(schedule('dark'))
  await runtime.refresh()
  applySettingsSnapshot({ theme: 'light' })

  await store._reloadProfileBackedSettings()

  assert.deepEqual(runtime.getConfig().rules, [])
  assert.equal(runtime.getEffectiveValue(), null)
  assert.equal(Reflect.get(store, 'currentTheme'), 'light')
  assert.deepEqual(
    Reflect.get(store, 'appearanceCustomization'),
    DefaultAppearanceCustomization
  )
  assert.equal(localStorage.getItem(ScheduledSettingsStorageKey), null)
})

it('ignores a pending old API response after restoring another schedule', async t => {
  let resolve!: (value: IScheduledSettingsValue) => void
  const pending = new Promise<IScheduledSettingsValue>(done => {
    resolve = done
  })
  const { store, runtime } = harness(t, () => pending)
  runtime.setConfig(
    normalizeScheduledSettings({
      rules: [
        {
          allDays: true,
          startTime: '00:00',
          endTime: '00:00',
          source: { kind: 'api', endpoint: 'https://example.test/settings' },
        },
      ],
    })
  )
  applySettingsSnapshot({
    theme: 'light',
    [ScheduledSettingsStorageKey]: serializeScheduledSettings(
      schedule('light')
    ),
  })

  await store._reloadProfileBackedSettings()
  resolve({ theme: 'dark' })
  await new Promise<void>(done => setTimeout(done, 0))

  assert.equal(runtime.getEffectiveValue()?.theme, 'light')
  assert.equal(Reflect.get(store, 'currentTheme'), 'light')
})
