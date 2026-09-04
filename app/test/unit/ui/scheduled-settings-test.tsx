import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { translate } from '../../../src/lib/i18n'
import {
  DefaultScheduledSettingsConfig,
  IScheduledSettingsConfig,
} from '../../../src/models/scheduled-settings'
import { ScheduledSettings } from '../../../src/ui/preferences/scheduled-settings'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Scheduled settings preferences', () => {
  it('offers local date/time rules plus API and Home Assistant sources', () => {
    const changes: IScheduledSettingsConfig[] = []
    const view = render(
      <ScheduledSettings
        languageMode="english"
        scheduledSettings={{
          ...DefaultScheduledSettingsConfig,
          rules: [
            {
              id: 'scheduled-1',
              label: 'Work hours',
              enabled: true,
              allDays: false,
              daysOfWeek: [1, 2, 3, 4, 5],
              startDate: null,
              endDate: null,
              startTime: '09:00',
              endTime: '17:00',
              source: {
                kind: 'local',
                value: { languageMode: 'english', theme: 'system' },
              },
            },
          ],
        }}
        onScheduledSettingsChanged={value => changes.push(value)}
        onHomeAssistantTokenChanged={async () => {}}
        onHomeAssistantStateRequested={async () => 'off'}
      />
    )

    assert.ok(screen.getByLabelText('Start date (optional)'))
    assert.ok(screen.getByText('How this schedule works'))
    assert.ok(screen.getByText('About the value source'))
    assert.ok(document.querySelector('.scheduled-settings-target-start-date'))
    assert.ok(document.querySelector('.scheduled-settings-target-weekdays'))
    const explanationRows = Array.from(
      view.container.querySelectorAll('[data-setting-explanation-id]')
    )
    assert.equal(explanationRows.length, 33)
    assert.equal(
      new Set(
        explanationRows.map(row =>
          row.getAttribute('data-setting-explanation-id')
        )
      ).size,
      27
    )
    assert.equal(
      screen
        .getByLabelText('Start date (optional)')
        .getAttribute('aria-describedby'),
      'scheduled-1-scheduled-start-date-setting-explanation scheduled-1-scheduled-start-date-setting-provenance'
    )
    assert.equal(
      screen.getByLabelText('Start date (optional)').getAttribute('type'),
      'date'
    )
    assert.equal(
      screen.getByLabelText('Start time').getAttribute('type'),
      'time'
    )
    assert.ok(
      screen.getByText(
        translate('appearance.scheduledSettingsTimeZone', 'english', {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      )
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Every day' }))
    assert.equal(changes.length, 1)
    assert.equal(changes[0].rules[0].allDays, true)

    fireEvent.change(screen.getByLabelText('Value source'), {
      target: { value: 'api' },
    })
    assert.ok(screen.getByLabelText('API endpoint'))
    assert.ok(document.querySelector('.scheduled-settings-target-api-endpoint'))
    assert.ok(
      screen.getByText(
        translate('appearance.scheduledSettingsAPIHelp', 'english')
      )
    )

    fireEvent.change(screen.getByLabelText('Value source'), {
      target: { value: 'home-assistant' },
    })
    assert.ok(screen.getByLabelText('Home Assistant URL'))
    assert.ok(screen.getByLabelText('Boolean entity ID'))
    assert.ok(screen.getByLabelText('Access token'))
    assert.ok(
      document.querySelector('.scheduled-settings-target-home-assistant-entity')
    )
    assert.ok(screen.getByRole('button', { name: 'Test sensor' }))

    view.unmount()
  })
})
