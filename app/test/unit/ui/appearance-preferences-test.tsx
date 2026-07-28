import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { translate } from '../../../src/lib/i18n'
import {
  DefaultAudioSystemSettings,
  IAudioSystemSettings,
} from '../../../src/lib/audio/audio-settings'
import { BranchSortOrder } from '../../../src/models/branch-sort-order'
import {
  DefaultAppearanceCustomization,
  IAppearanceCustomization,
} from '../../../src/models/appearance-customization'
import {
  dateFormats,
  numberFormats,
  timeFormats,
} from '../../../src/models/formatting-preferences'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { Appearance } from '../../../src/ui/preferences/appearance'
import { ApplicationTheme } from '../../../src/ui/lib/application-theme'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Appearance preferences', () => {
  it('keeps ordinary preferences and routes visual customization to elements', () => {
    const changes = new Array<IAppearanceCustomization>()
    let funnySettings: IAudioSystemSettings = {
      ...DefaultAudioSystemSettings,
      funnyLevelEnglish: 2,
      funnyLevelCantonese: 5,
    }
    const funnyLevelSettingsStore = {
      getSettings: () => funnySettings,
      setSettings: (settings: IAudioSystemSettings) => {
        funnySettings = settings
      },
    }
    const commonProps = {
      selectedTheme: ApplicationTheme.Light,
      onSelectedThemeChanged: () => {},
      onAppearanceCustomizationChanged: (value: IAppearanceCustomization) =>
        changes.push(value),
      zoomBaseFactor: 1,
      onZoomBaseFactorChanged: () => {},
      autoFitZoomEnabled: false,
      onAutoFitZoomEnabledChanged: () => {},
      windowZoomFactor: 1,
      selectedTabSize: 4,
      onSelectedTabSizeChanged: () => {},
      selectedDateFormat: dateFormats[0].pattern,
      onSelectedDateFormatChanged: () => {},
      selectedTimeFormat: timeFormats[0].pattern,
      onSelectedTimeFormatChanged: () => {},
      selectedNumberFormat: numberFormats[0],
      onSelectedNumberFormatChanged: () => {},
      preferAbsoluteDates: false,
      onPreferAbsoluteDatesChanged: () => {},
      showRecentRepositories: true,
      onShowRecentRepositoriesChanged: () => {},
      showBranchNameInRepoList: ShowBranchNameInRepoListSetting.Never,
      onShowBranchNameInRepoListChanged: () => {},
      branchSortOrder: BranchSortOrder.LastModified,
      onBranchSortOrderChanged: () => {},
      funnyLevelSettingsStore,
    }

    const view = render(
      <Appearance
        {...commonProps}
        appearanceCustomization={DefaultAppearanceCustomization}
      />
    )

    assert.ok(screen.getByText(/right-click that element/i))
    assert.ok(screen.getByLabelText('Language'))
    const englishFunnySlider = screen.getByRole('slider', {
      name: 'English playfulness',
    })
    const cantoneseFunnySlider = screen.getByRole('slider', {
      name: 'Cantonese playfulness',
    })
    assert.equal(englishFunnySlider.getAttribute('min'), '1')
    assert.equal(englishFunnySlider.getAttribute('max'), '5')
    assert.equal(englishFunnySlider.getAttribute('value'), '2')
    assert.equal(
      englishFunnySlider.getAttribute('aria-valuetext'),
      'Level 2 of 5'
    )
    assert.equal(cantoneseFunnySlider.getAttribute('value'), '5')
    assert.equal(
      cantoneseFunnySlider.getAttribute('aria-valuetext'),
      'Level 5 of 5'
    )
    assert.ok(screen.getByRole('slider', { name: 'Scale' }))
    assert.ok(screen.getByRole('radio', { name: /Light/i }))
    assert.ok(
      screen.getByRole('checkbox', { name: 'Show recent repositories' })
    )
    assert.ok(screen.getByLabelText('Show branch name'))
    assert.ok(screen.getByRole('heading', { name: 'Sort branches' }))
    assert.ok(screen.getByLabelText('Tab size'))

    const visualLabels = [
      'Highlight Desktop Material features',
      'Accent color',
      'Update progress color',
      'Surface color',
      'Surface depth',
      'Interface font',
      'Code and diff font',
      'Animation',
      'Toolbar labels',
      'Toolbar density',
      'Repository list density',
      'Tab density',
      'Tab width',
      'Tab close buttons',
      'App name',
      'Submodule Back button style',
      'Submodule Back button label',
    ]
    for (const label of visualLabels) {
      assert.equal(screen.queryByLabelText(label), null, label)
    }
    assert.equal(
      screen.queryByRole('heading', { name: 'Custom repository logo' }),
      null
    )

    fireEvent.change(englishFunnySlider, { target: { value: '4' } })
    assert.equal(funnySettings.funnyLevelEnglish, 4)
    assert.equal(funnySettings.funnyLevelCantonese, 5)
    fireEvent.change(cantoneseFunnySlider, { target: { value: '1' } })
    assert.equal(funnySettings.funnyLevelEnglish, 4)
    assert.equal(funnySettings.funnyLevelCantonese, 1)

    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'bilingual' },
    })
    assert.equal(changes[0].languageMode, 'bilingual')
    assert.equal(changes[0].accentPalette, 'blue')
    assert.equal(changes[0].submoduleBackButtonStyle, 'tonal')

    view.rerender(
      <Appearance
        {...commonProps}
        appearanceCustomization={{
          ...DefaultAppearanceCustomization,
          languageMode: 'cantonese',
        }}
      />
    )
    assert.ok(
      screen.getByRole('heading', {
        name: translate('appearance.languageAndNavigation', 'cantonese'),
      })
    )
    assert.ok(
      screen.getByLabelText(translate('appearance.languageMode', 'cantonese'))
    )
    assert.ok(
      screen.getByRole('slider', {
        name: translate('appearance.englishPlayfulness', 'cantonese'),
      })
    )
    assert.equal(
      screen
        .getByRole('slider', {
          name: translate('appearance.cantonesePlayfulness', 'cantonese'),
        })
        .getAttribute('aria-valuetext'),
      translate('appearance.playfulnessValue', 'cantonese', { value: '1' })
    )
    assert.equal(
      screen.queryByLabelText(
        translate('appearance.submoduleBackStyle', 'cantonese')
      ),
      null
    )
    assert.equal(
      screen.queryByLabelText(
        translate('appearance.submoduleBackLabel', 'cantonese')
      ),
      null
    )
    assert.ok(
      screen.getByRole('option', {
        name: translate('language.cantonese', 'cantonese'),
      })
    )

    view.rerender(
      <Appearance
        {...commonProps}
        appearanceCustomization={{
          ...DefaultAppearanceCustomization,
          languageMode: 'bilingual',
        }}
      />
    )
    assert.ok(
      screen.getByRole('heading', {
        name: translate('appearance.languageAndNavigation', 'bilingual'),
      })
    )
    assert.ok(
      screen.getByLabelText(translate('appearance.languageMode', 'bilingual'))
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
    assert.equal(
      screen.queryByLabelText(
        translate('appearance.submoduleBackStyle', 'bilingual')
      ),
      null
    )
    assert.equal(
      screen.queryByLabelText(
        translate('appearance.submoduleBackLabel', 'bilingual')
      ),
      null
    )
  })
})
