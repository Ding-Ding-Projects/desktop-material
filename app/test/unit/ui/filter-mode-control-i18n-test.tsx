import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilterMode } from '../../../src/lib/fuzzy-find'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'
import {
  LanguageModeStorageKey,
  setLanguageModePreference,
} from '../../../src/lib/language-preference'
import { LanguageMode } from '../../../src/models/language-mode'
import { FilterModeControl } from '../../../src/ui/lib/filter-mode-control'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

function changeLanguageMode(mode: LanguageMode) {
  setLanguageModePreference(mode)
  fireEvent(
    document,
    new CustomEvent(LanguageModeChangedEvent, { detail: mode })
  )
}

describe('shared filter and Regex Builder localization', () => {
  it('updates visible and accessible chrome live in every language mode', () => {
    const previousMode = localStorage.getItem(LanguageModeStorageKey)

    try {
      changeLanguageMode('english')
      render(
        <FilterModeControl
          searchSurfaceId="test-filter"
          mode={FilterMode.Fuzzy}
          caseSensitive={false}
          onModeChange={() => undefined}
          onCaseSensitiveChange={() => undefined}
          regexBuilderTarget="Changes"
          getSampleItems={() => ['app/src/index.ts']}
          filterText=""
          onRegexPatternApply={() => undefined}
        />
      )

      assert.ok(
        screen.getByRole('button', {
          name: 'Filter mode: Fuzzy (click to change)',
        })
      )
      assert.ok(screen.getByRole('button', { name: 'Match case' }))
      const openBuilder = screen.getByRole('button', {
        name: 'Open regex builder',
      })
      assert.equal(openBuilder.textContent, '.*Regex builder')
      fireEvent.click(openBuilder)

      const englishDialog = screen.getByRole('dialog', {
        name: 'Regex builder',
      })
      assert.ok(
        within(englishDialog).getByRole('tablist', {
          name: 'Regex builder views',
        })
      )
      assert.ok(
        within(englishDialog).getByRole('tablist', {
          name: 'Regular expression building-block categories',
        })
      )
      assert.ok(
        within(englishDialog).getByRole('textbox', {
          name: 'Sample text for testing the regular expression',
        })
      )

      changeLanguageMode('cantonese')

      assert.ok(
        screen.getByRole('button', {
          name: '配對模式：模糊配對（撳一下轉模式）',
        })
      )
      assert.ok(screen.getByRole('button', { name: '分大小寫' }))
      assert.ok(screen.getByRole('button', { name: '打開正則表達式砌法器' }))
      const cantoneseDialog = screen.getByRole('dialog', {
        name: '正則表達式砌法器',
      })
      assert.ok(
        within(cantoneseDialog).getByRole('tablist', {
          name: '正則表達式砌法器檢視',
        })
      )
      assert.ok(within(cantoneseDialog).getByRole('tab', { name: '定位符' }))
      assert.ok(
        within(cantoneseDialog).getByRole('button', {
          name: '搜尋項目開頭',
        })
      )
      assert.ok(
        within(cantoneseDialog).getByRole('textbox', {
          name: '用嚟測試正則表達式嘅範例文字',
        })
      )
      fireEvent.click(
        within(cantoneseDialog).getByRole('tab', {
          name: '正則表達式點運作',
        })
      )
      assert.ok(within(cantoneseDialog).getByText('配對點運作'))

      changeLanguageMode('bilingual')

      const bilingualOpen = screen.getByRole('button', {
        name: 'Open regex builder',
      })
      assert.equal(
        bilingualOpen.textContent,
        '.*Regex builder · 正則表達式砌法器'
      )
      const bilingualDialog = screen.getByRole('dialog', {
        name: 'Regex builder',
      })
      assert.ok(
        within(bilingualDialog).getByRole('heading', {
          name: 'Regex builder · 正則表達式砌法器',
        })
      )
      const guideTab = within(bilingualDialog).getByRole('tab', {
        name: 'How regex works',
      })
      assert.equal(guideTab.textContent, 'How regex works · 正則表達式點運作')
      const cancel = within(bilingualDialog).getByRole('button', {
        name: 'Cancel',
      })
      assert.equal(cancel.textContent, 'Cancel · 取消')
      assert.ok(
        within(bilingualDialog).getByText('TEST · 測試', { exact: true })
      )
    } finally {
      if (previousMode === null) {
        localStorage.removeItem(LanguageModeStorageKey)
      } else {
        localStorage.setItem(LanguageModeStorageKey, previousMode)
      }
    }
  })
})
