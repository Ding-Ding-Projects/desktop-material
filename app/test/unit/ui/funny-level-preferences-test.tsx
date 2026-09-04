import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { AudioCueStore } from '../../../src/lib/audio/audio-cue-store'
import {
  AudioSettingsStorageKey,
  DefaultAudioSystemSettings,
  IAudioSystemSettings,
  parseAudioSettings,
  serializeAudioSettings,
} from '../../../src/lib/audio/audio-settings'
import { translate } from '../../../src/lib/i18n'
import {
  DefaultAppearanceCustomization,
  IAppearanceCustomization,
} from '../../../src/models/appearance-customization'
import { BranchSortOrder } from '../../../src/models/branch-sort-order'
import {
  dateFormats,
  numberFormats,
  timeFormats,
} from '../../../src/models/formatting-preferences'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { ApplicationTheme } from '../../../src/ui/lib/application-theme'
import { Appearance } from '../../../src/ui/preferences/appearance'
import { SoundPreferences } from '../../../src/ui/preferences/sound'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function appearanceProps(
  settingsStore: {
    getSettings(): IAudioSystemSettings
    setSettings(settings: IAudioSystemSettings): void
  },
  appearanceCustomization: IAppearanceCustomization = DefaultAppearanceCustomization
) {
  return {
    selectedTheme: ApplicationTheme.Light,
    onSelectedThemeChanged: () => undefined,
    appearanceCustomization,
    onAppearanceCustomizationChanged: () => undefined,
    zoomBaseFactor: 1,
    onZoomBaseFactorChanged: () => undefined,
    autoFitZoomEnabled: false,
    onAutoFitZoomEnabledChanged: () => undefined,
    windowZoomFactor: 1,
    selectedTabSize: 4,
    onSelectedTabSizeChanged: () => undefined,
    selectedDateFormat: dateFormats[0].pattern,
    onSelectedDateFormatChanged: () => undefined,
    selectedTimeFormat: timeFormats[0].pattern,
    onSelectedTimeFormatChanged: () => undefined,
    selectedNumberFormat: numberFormats[0],
    onSelectedNumberFormatChanged: () => undefined,
    preferAbsoluteDates: false,
    onPreferAbsoluteDatesChanged: () => undefined,
    showRecentRepositories: true,
    onShowRecentRepositoriesChanged: () => undefined,
    showBranchNameInRepoList: ShowBranchNameInRepoListSetting.Never,
    onShowBranchNameInRepoListChanged: () => undefined,
    branchSortOrder: BranchSortOrder.LastModified,
    onBranchSortOrderChanged: () => undefined,
    funnyLevelSettingsStore: settingsStore,
  }
}

afterEach(() => {
  localStorage.removeItem(AudioSettingsStorageKey)
  localStorage.removeItem('language-mode-v1')
})

describe('Appearance funny-level controls', () => {
  it('keeps both native 1..5 sliders accessible beside language mode and persists them independently', () => {
    let settings: IAudioSystemSettings = {
      ...DefaultAudioSystemSettings,
      funnyLevelEnglish: 2,
      funnyLevelCantonese: 5,
    }
    const settingsStore = {
      getSettings: () => settings,
      setSettings: (next: IAudioSystemSettings) => {
        settings = next
        localStorage.setItem(
          AudioSettingsStorageKey,
          serializeAudioSettings(next)
        )
      },
    }

    render(<Appearance {...appearanceProps(settingsStore)} />)

    const languageMode = screen.getByLabelText('Language')
    const section = languageMode.closest('.appearance-language-navigation')
    const english = screen.getByRole<HTMLInputElement>('slider', {
      name: 'English playfulness',
    })
    const cantonese = screen.getByRole<HTMLInputElement>('slider', {
      name: 'Cantonese playfulness',
    })
    assert.ok(section?.contains(english))
    assert.ok(section?.contains(cantonese))

    for (const slider of [english, cantonese]) {
      assert.equal(slider.type, 'range')
      assert.equal(slider.min, '1')
      assert.equal(slider.max, '5')
      assert.equal(slider.step, '1')
      assert.match(slider.getAttribute('aria-describedby') ?? '', /description/)
      assert.match(slider.getAttribute('aria-valuetext') ?? '', /of 5/)
    }

    fireEvent.change(english, { target: { value: '4' } })
    let persisted = parseAudioSettings(
      localStorage.getItem(AudioSettingsStorageKey)
    )
    assert.equal(persisted.funnyLevelEnglish, 4)
    assert.equal(persisted.funnyLevelCantonese, 5)

    fireEvent.change(cantonese, { target: { value: '1' } })
    persisted = parseAudioSettings(
      localStorage.getItem(AudioSettingsStorageKey)
    )
    assert.equal(persisted.funnyLevelEnglish, 4)
    assert.equal(persisted.funnyLevelCantonese, 1)
    assert.equal(english.getAttribute('aria-valuetext'), 'Level 4 of 5')
    assert.equal(cantonese.getAttribute('aria-valuetext'), 'Level 1 of 5')
  })

  it('keeps both accessible names intact in bilingual mode', () => {
    const settingsStore = {
      getSettings: () => DefaultAudioSystemSettings,
      setSettings: () => undefined,
    }
    render(
      <Appearance
        {...appearanceProps(settingsStore, {
          ...DefaultAppearanceCustomization,
          languageMode: 'bilingual',
        })}
      />
    )

    assert.ok(
      screen.getByRole('slider', {
        name: translate('appearance.englishPlayfulness', 'bilingual'),
      })
    )
    assert.ok(
      screen.getByRole('slider', {
        name: translate('appearance.cantonesePlayfulness', 'bilingual'),
      })
    )
  })
})

describe('Sound funny-level pointer', () => {
  it('points to Appearance in both catalogs instead of duplicating either slider', () => {
    const audioCueStore = {
      getSettings: () => DefaultAudioSystemSettings,
      getRepositoryOverride: () => null,
    } as unknown as AudioCueStore

    const english = render(
      <SoundPreferences audioCueStore={audioCueStore} repository={null} />
    )
    assert.ok(screen.getByText(translate('settings.soundFunnyHint', 'english')))
    assert.equal(
      screen.queryByRole('slider', { name: 'English playfulness' }),
      null
    )
    assert.equal(
      screen.queryByRole('slider', { name: 'Cantonese playfulness' }),
      null
    )
    for (const id of [
      'sound-master',
      'sound-sfx',
      'sound-sfx-volume',
      'sound-tts',
      'sound-recorded-narration',
      'sound-narrator-voice-english',
      'sound-narrator-voice-cantonese',
      'sound-tts-rate',
      'sound-tts-pitch',
      'sound-tts-volume',
      'sound-tts-cooldown',
      'sound-music',
      'sound-music-volume',
      'sound-quiet',
      'sound-quiet-hours-start',
      'sound-quiet-hours-end',
      'sound-reduced-motion',
    ]) {
      assert.ok(
        english.container.querySelector(
          `[data-setting-explanation-id="${id}"]`
        ),
        `missing setting explanation ${id}`
      )
    }
    english.unmount()

    localStorage.setItem('language-mode-v1', 'cantonese')
    render(<SoundPreferences audioCueStore={audioCueStore} repository={null} />)
    assert.ok(
      screen.getByText(translate('settings.soundFunnyHint', 'cantonese'))
    )
  })
})
