import assert from 'node:assert/strict'
import { it } from 'node:test'
import * as React from 'react'
import {
  IScheduledSettingsConfig,
  MaxScheduledSettingsLength,
  normalizeScheduledSettings,
  parseScheduledSettings,
  serializeScheduledSettings,
} from '../../src/models/scheduled-settings'
import { ScheduledSettings } from '../../src/ui/preferences/scheduled-settings'
import { fireEvent, render, screen } from '../helpers/ui/render'

function boundaryConfig(): IScheduledSettingsConfig {
  const makeConfig = (padding: string) =>
    normalizeScheduledSettings({
      version: 1,
      rules: [
        {
          label: 'aa',
          source: {
            kind: 'local',
            value: {
              appearance: { toolbarTextStyle: { padding } },
            },
          },
        },
      ],
    })
  return makeConfig(
    'x'.repeat(
      MaxScheduledSettingsLength -
        serializeScheduledSettings(makeConfig('')).length
    )
  )
}

it('rejects an oversized edit before saving and clears the error after a valid edit', () => {
  const initial = boundaryConfig()
  assert.equal(
    serializeScheduledSettings(initial).length,
    MaxScheduledSettingsLength
  )
  assert.deepEqual(
    parseScheduledSettings(serializeScheduledSettings(initial)),
    initial
  )
  const changes: IScheduledSettingsConfig[] = []
  render(
    <ScheduledSettings
      languageMode="english"
      scheduledSettings={initial}
      onScheduledSettingsChanged={value => changes.push(value)}
      onHomeAssistantTokenChanged={async () => undefined}
      onHomeAssistantStateRequested={async () => 'off'}
    />
  )
  const label = screen.getByDisplayValue('aa') as HTMLInputElement
  fireEvent.change(label, { target: { value: 'aaa' } })
  assert.equal(changes.length, 0)
  assert.equal(label.value, 'aa')
  assert.match(screen.getByRole('status').textContent ?? '', /too large/i)
  fireEvent.change(label, { target: { value: 'a' } })
  assert.equal(changes.length, 1)
  assert.equal(label.value, 'a')
  assert.equal(screen.queryByRole('status'), null)
})

it('keeps the previous editor value when the save callback fails', () => {
  render(
    <ScheduledSettings
      languageMode="english"
      scheduledSettings={normalizeScheduledSettings({
        rules: [{ label: 'Before' }],
      })}
      onScheduledSettingsChanged={() => {
        throw new Error('Save failed')
      }}
      onHomeAssistantTokenChanged={async () => undefined}
      onHomeAssistantStateRequested={async () => 'off'}
    />
  )
  const label = screen.getByDisplayValue('Before') as HTMLInputElement
  fireEvent.change(label, { target: { value: 'After' } })
  assert.equal(label.value, 'Before')
  assert.match(
    screen.getByRole('status').textContent ?? '',
    /could not be saved/i
  )
})
