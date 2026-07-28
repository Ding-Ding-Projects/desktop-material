import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { FunnyLevelControls } from '../../../src/ui/preferences/funny-level-controls'
import { SoundPreferences } from '../../../src/ui/preferences/sound'
import { Appearance } from '../../../src/ui/preferences/appearance'
import { ApplicationTheme } from '../../../src/ui/lib/application-theme'
import { BranchSortOrder } from '../../../src/models/branch-sort-order'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'
import { DefaultAppearanceCustomization } from '../../../src/models/appearance-customization'
import {
  dateFormats,
  numberFormats,
  timeFormats,
} from '../../../src/models/formatting-preferences'
import { LanguageMode } from '../../../src/models/language-mode'
import { PreferencesTab } from '../../../src/models/preferences'
import { FilterMode } from '../../../src/lib/fuzzy-find'
import {
  filterSettingsEntries,
  fuzzyFilterSettings,
  groupSettingsResultsByTab,
  settingsTabNameKey,
} from '../../../src/lib/settings-search/settings-search-catalog'
import {
  DefaultFunnyLevels,
  funnyBand,
  funnyLevelNameKey,
  funnyLevelValueText,
  IFunnyLevels,
  readFunnyLevels,
} from '../../../src/lib/funny-level-text'
import {
  AudioSettingsStorageKey,
  DefaultAudioSystemSettings,
  serializeAudioSettings,
} from '../../../src/lib/audio/audio-settings'
import type { AudioCueStore } from '../../../src/lib/audio/audio-cue-store'
import { englishTranslations } from '../../../src/lib/i18n-resources'
import { translate } from '../../../src/lib/i18n'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const AllLevels = [1, 2, 3, 4, 5] as const

/** The band each level is expected to select, spelled out rather than derived. */
const ExpectedBand: Readonly<Record<number, 'plain' | 'light' | 'playful'>> = {
  1: 'plain',
  2: 'plain',
  3: 'light',
  4: 'playful',
  5: 'playful',
}

interface IToneHarnessProps {
  readonly languageMode: LanguageMode
  readonly initial: IFunnyLevels
}

interface IToneHarnessState {
  readonly levels: IFunnyLevels
}

/**
 * A controlled host for the sliders, standing in for the Preferences dialog so
 * a slider drag actually flows back into the rendered copy the way it does in
 * the app.
 */
class ToneHarness extends React.Component<
  IToneHarnessProps,
  IToneHarnessState
> {
  public constructor(props: IToneHarnessProps) {
    super(props)
    this.state = { levels: props.initial }
  }

  private onLevelsChanged = (levels: IFunnyLevels) => this.setState({ levels })

  public render() {
    return (
      <FunnyLevelControls
        languageMode={this.props.languageMode}
        levels={this.state.levels}
        onLevelsChanged={this.onLevelsChanged}
      />
    )
  }
}

function sample(
  container: HTMLElement,
  language: 'english' | 'cantonese',
  kind: 'status' | 'warning'
): string {
  const node = container.querySelector(
    `[data-tone-preview="${language}"] [data-tone-sample="${kind}"]`
  )
  assert.ok(node, `expected a ${language} ${kind} preview`)
  return (node.textContent ?? '').trim()
}

function setLevel(name: string, level: number) {
  fireEvent.change(screen.getByRole('slider', { name }), {
    target: { value: String(level) },
  })
}

const appearanceProps = {
  selectedTheme: ApplicationTheme.Light,
  onSelectedThemeChanged: () => {},
  onAppearanceCustomizationChanged: () => {},
  appearanceCustomization: DefaultAppearanceCustomization,
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
  funnyLevels: DefaultFunnyLevels,
  onFunnyLevelsChanged: () => {},
}

/** A stub standing in for the singleton audio store the Sound pane reads. */
function stubAudioCueStore(): AudioCueStore {
  return {
    getSettings: () => DefaultAudioSystemSettings,
    getRepositoryOverride: () => null,
  } as unknown as AudioCueStore
}

beforeEach(() => {
  localStorage.removeItem('language-mode-v1')
  localStorage.removeItem('appearance-customization-v1')
  localStorage.removeItem(AudioSettingsStorageKey)
})

describe('Appearance tone controls', () => {
  it('puts both sliders in the same section as the language-mode selector', () => {
    const view = render(<Appearance {...appearanceProps} />)

    const languageSelect = screen.getByLabelText('Language')
    const english = screen.getByRole('slider', { name: 'English funny level' })
    const cantonese = screen.getByRole('slider', {
      name: 'Cantonese funny level',
    })

    const section = languageSelect.closest('.appearance-language-navigation')
    assert.ok(section, 'expected the language section to exist')
    assert.ok(
      section.contains(english),
      'the English slider must sit beside the language-mode selector'
    )
    assert.ok(
      section.contains(cantonese),
      'the Cantonese slider must sit beside the language-mode selector'
    )

    // Two independent controls, not one shared slider.
    assert.notStrictEqual(english, cantonese)
    assert.equal(
      view.container.querySelectorAll('.appearance-tone-slider').length,
      2
    )
  })

  it('bounds every slider to 1..5 and announces what the level means', () => {
    render(
      <ToneHarness
        languageMode="english"
        initial={{ english: 3, cantonese: 3 }}
      />
    )

    for (const name of ['English funny level', 'Cantonese funny level']) {
      const slider = screen.getByRole('slider', { name })
      assert.equal(slider.getAttribute('min'), '1')
      assert.equal(slider.getAttribute('max'), '5')
      assert.equal(slider.getAttribute('step'), '1')
    }

    for (const level of AllLevels) {
      setLevel('English funny level', level)
      const valueText = screen
        .getByRole('slider', { name: 'English funny level' })
        .getAttribute('aria-valuetext')
      // Not just the number: the announcement names the level too.
      assert.equal(valueText, funnyLevelValueText(level, 'english'))
      assert.ok(valueText?.includes(String(level)), `level ${level}`)
      assert.ok(
        valueText?.includes(englishTranslations[funnyLevelNameKey(level)]),
        `level ${level} names its band`
      )
    }
  })

  it('changes the English copy at every level without touching Cantonese', () => {
    const view = render(
      <ToneHarness
        languageMode="english"
        initial={{ english: 3, cantonese: 3 }}
      />
    )

    const cantoneseBefore = sample(view.container, 'cantonese', 'status')
    const seen = new Set<string>()

    for (const level of AllLevels) {
      setLevel('English funny level', level)
      const band = ExpectedBand[level]
      assert.equal(funnyBand(level), band)
      assert.equal(
        sample(view.container, 'english', 'status'),
        englishTranslations[`appearance.tonePreview.${band}`]
      )
      seen.add(sample(view.container, 'english', 'status'))
      // The other language's slider is untouched, so its copy must not move.
      assert.equal(
        sample(view.container, 'cantonese', 'status'),
        cantoneseBefore
      )
    }

    // Three distinct voices across the five levels.
    assert.equal(seen.size, 3)
  })

  it('changes the Cantonese copy at every level without touching English', () => {
    const view = render(
      <ToneHarness
        languageMode="cantonese"
        initial={{ english: 3, cantonese: 3 }}
      />
    )

    const englishName = translate('appearance.toneEnglishLabel', 'cantonese')
    const cantoneseName = translate(
      'appearance.toneCantoneseLabel',
      'cantonese'
    )
    const englishBefore = sample(view.container, 'english', 'status')
    const seen = new Set<string>()

    for (const level of AllLevels) {
      setLevel(cantoneseName, level)
      const band = ExpectedBand[level]
      assert.equal(
        sample(view.container, 'cantonese', 'status'),
        translate(`appearance.tonePreview.${band}`, 'cantonese')
      )
      seen.add(sample(view.container, 'cantonese', 'status'))
      assert.equal(sample(view.container, 'english', 'status'), englishBefore)
    }

    assert.equal(seen.size, 3)
    // Both sliders are reachable and labelled in the active display language.
    assert.ok(screen.getByRole('slider', { name: englishName }))
  })

  it('lets the two languages sit at opposite ends at the same time', () => {
    const view = render(
      <ToneHarness
        languageMode="english"
        initial={{ english: 3, cantonese: 3 }}
      />
    )

    setLevel('English funny level', 1)
    setLevel('Cantonese funny level', 5)

    assert.equal(
      sample(view.container, 'english', 'status'),
      englishTranslations['appearance.tonePreview.plain']
    )
    assert.equal(
      sample(view.container, 'cantonese', 'status'),
      translate('appearance.tonePreview.playful', 'cantonese')
    )
  })

  it('moves the voice of a destructive warning but never its facts', () => {
    const view = render(
      <ToneHarness
        languageMode="english"
        initial={{ english: 3, cantonese: 3 }}
      />
    )

    const englishVoices = new Set<string>()
    const cantoneseVoices = new Set<string>()

    for (const level of AllLevels) {
      setLevel('English funny level', level)
      setLevel('Cantonese funny level', level)

      const english = sample(view.container, 'english', 'warning')
      const cantonese = sample(view.container, 'cantonese', 'warning')
      englishVoices.add(english)
      cantoneseVoices.add(cantonese)

      for (const [text, fixed] of [
        [english, englishTranslations['appearance.toneWarningFixed']],
        [cantonese, translate('appearance.toneWarningFixed', 'cantonese')],
      ] as const) {
        // The count, the affected repository, and the irreversibility sentence
        // survive verbatim at every level in both languages.
        assert.ok(text.includes('3'), `level ${level} states the count`)
        assert.ok(
          text.includes('desktop-material'),
          `level ${level} names what is affected`
        )
        assert.ok(
          text.includes(fixed),
          `level ${level} keeps the fixed warning`
        )
      }
    }

    assert.equal(englishVoices.size, 3)
    assert.equal(cantoneseVoices.size, 3)
  })

  it('renders both sliders in bilingual mode with both labels intact', () => {
    render(
      <ToneHarness
        languageMode="bilingual"
        initial={{ english: 2, cantonese: 4 }}
      />
    )

    const englishName = translate('appearance.toneEnglishLabel', 'bilingual')
    const cantoneseName = translate(
      'appearance.toneCantoneseLabel',
      'bilingual'
    )

    assert.ok(
      englishName.includes(' · '),
      'bilingual labels show both languages'
    )
    const english = screen.getByRole('slider', { name: englishName })
    const cantonese = screen.getByRole('slider', { name: cantoneseName })
    assert.equal((english as HTMLInputElement).value, '2')
    assert.equal((cantonese as HTMLInputElement).value, '4')
    assert.equal(
      english.getAttribute('aria-valuetext'),
      funnyLevelValueText(2, 'bilingual')
    )
  })
})

describe('funny-level persistence', () => {
  it('round-trips both levels through the persisted audio settings', () => {
    localStorage.setItem(
      AudioSettingsStorageKey,
      serializeAudioSettings({
        ...DefaultAudioSystemSettings,
        funnyLevelEnglish: 1,
        funnyLevelCantonese: 5,
      })
    )

    assert.deepEqual(readFunnyLevels(), { english: 1, cantonese: 5 })
  })

  it('clamps and falls back rather than losing the setting', () => {
    localStorage.setItem(
      AudioSettingsStorageKey,
      JSON.stringify({ funnyLevelEnglish: 99, funnyLevelCantonese: -4 })
    )
    assert.deepEqual(readFunnyLevels(), { english: 5, cantonese: 1 })

    localStorage.setItem(AudioSettingsStorageKey, 'not json at all')
    assert.deepEqual(readFunnyLevels(), DefaultFunnyLevels)
  })
})

describe('Sound preferences narrator tone', () => {
  it('points at the tone controls instead of duplicating the sliders', () => {
    render(
      <SoundPreferences audioCueStore={stubAudioCueStore()} repository={null} />
    )

    assert.equal(
      screen.queryByRole('slider', { name: 'English funny level' }),
      null,
      'the Sound tab must not carry a second copy of the English slider'
    )
    assert.equal(
      screen.queryByRole('slider', { name: 'Cantonese funny level' }),
      null,
      'the Sound tab must not carry a second copy of the Cantonese slider'
    )
    assert.ok(
      screen.getByText(englishTranslations['settings.soundFunnyRelocated'])
    )
  })
})

describe('settings search for the tone controls', () => {
  it('finds the sliders by label, description, and current value', () => {
    for (const query of [
      'funny',
      'tone',
      'maximum playfulness',
      '搞笑',
      '玩到盡',
    ]) {
      const ids = fuzzyFilterSettings(query).map(entry => entry.id)
      assert.ok(ids.includes('appearance-tone'), `query "${query}"`)
    }
  })

  it('reports the match as living on the Appearance tab', () => {
    const results = filterSettingsEntries('funny level', {
      mode: FilterMode.Substring,
      caseSensitive: false,
    }).results

    const groups = groupSettingsResultsByTab(results)
    const group = groups.find(g =>
      g.matches.some(m => m.item.id === 'appearance-tone')
    )
    assert.ok(group, 'expected an Appearance group')
    assert.equal(group.tab, PreferencesTab.Appearance)
    assert.equal(
      translate('settingsSearch.inTab', 'english', {
        tab: translate(settingsTabNameKey(group.tab), 'english'),
      }),
      'in Appearance'
    )
  })

  it('matches the tone entry with a regex pattern from the builder', () => {
    const results = filterSettingsEntries('funn(y|ie)', {
      mode: FilterMode.Regex,
      caseSensitive: false,
    })
    assert.equal(results.regexError, null)
    assert.ok(results.results.some(m => m.item.id === 'appearance-tone'))
  })

  it('keeps language mode findable alongside the tone sliders', () => {
    const ids = fuzzyFilterSettings('bilingual').map(entry => entry.id)
    assert.ok(ids.includes('appearance-language-mode'))
  })
})
