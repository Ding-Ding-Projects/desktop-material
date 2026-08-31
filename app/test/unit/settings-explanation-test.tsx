import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from '../../src/ui/preferences/settings-explanation'
import {
  assertImplementedSettingExplanationIds,
  ImplementedSettingExplanationIds,
} from '../../src/ui/preferences/settings-explanation-inventory'
import { render, screen } from '../helpers/ui/render'
import { Accessibility } from '../../src/ui/preferences/accessibility'
import {
  showDiffCheckMarksKey,
  underlineLinksKey,
} from '../../src/lib/stores/app-store'
import { LanguageModeStorageKey } from '../../src/lib/language-preference'
import { Prompts } from '../../src/ui/preferences/prompts'
import {
  confirmCheckoutCommitKey,
  confirmCommitFilteredChangesKey,
  confirmCommitMessageOverrideKey,
  confirmDiscardChangesKey,
  confirmDiscardChangesPermanentlyKey,
  confirmDiscardStashKey,
  confirmForcePushKey,
  confirmRepoRemovalKey,
  confirmUndoCommitKey,
  confirmWorktreeRemovalKey,
  showCommitLengthWarningKey,
  uncommittedChangesStrategyKey,
} from '../../src/lib/stores/app-store'
import { defaultUncommittedChangesStrategy } from '../../src/models/uncommitted-changes-strategy'
import { AIPreferences } from '../../src/ui/preferences/ai'
import {
  AIAdminPolicySettingsStorageKey,
  DefaultAIAdminPolicySettings,
  resetAIAdminPolicySettingsCache,
} from '../../src/lib/ai-admin-policy'
import { Accounts } from '../../src/ui/preferences/accounts'
import { IssueTrackerReference } from '../../src/ui/preferences/issue-tracker-reference'

const PromptStorageKeys = [
  confirmCheckoutCommitKey,
  confirmCommitFilteredChangesKey,
  confirmCommitMessageOverrideKey,
  confirmDiscardChangesKey,
  confirmDiscardChangesPermanentlyKey,
  confirmDiscardStashKey,
  confirmForcePushKey,
  confirmRepoRemovalKey,
  confirmUndoCommitKey,
  confirmWorktreeRemovalKey,
  showCommitLengthWarningKey,
  uncommittedChangesStrategyKey,
]

afterEach(() => {
  localStorage.removeItem(underlineLinksKey)
  localStorage.removeItem(showDiffCheckMarksKey)
  localStorage.removeItem(LanguageModeStorageKey)
  for (const key of PromptStorageKeys) {
    localStorage.removeItem(key)
  }
  localStorage.removeItem(AIAdminPolicySettingsStorageKey)
  resetAIAdminPolicySettingsCache()
})

describe('setting explanation', () => {
  it('keeps an exact hand-written inventory and turns red when one row disappears', () => {
    assertImplementedSettingExplanationIds(ImplementedSettingExplanationIds)
    assert.throws(() =>
      assertImplementedSettingExplanationIds(
        ImplementedSettingExplanationIds.filter(
          id => id !== 'status-hub-endpoint'
        )
      )
    )
  })

  it('keeps the explanation collapsed while exposing both descriptions', () => {
    const ids = settingExplanationDescriptionIds('example-setting')
    assert.deepEqual(ids, {
      explanationId: 'example-setting-setting-explanation',
      provenanceId: 'example-setting-setting-provenance',
      ariaDescribedBy:
        'example-setting-setting-explanation example-setting-setting-provenance',
    })

    const view = render(
      <SettingExplanation
        settingId="example-setting"
        summary="What this setting changes"
        explanation="Changes the example behavior without changing saved documents."
        provenance="No choice is recorded. Current and shipped value: off."
        source="compiled-default"
      />
    )

    const details = screen
      .getByText('What this setting changes')
      .closest('details') as HTMLDetailsElement
    assert.ok(details)
    assert.equal(details.open, false)
    assert.equal(
      view.container
        .querySelector('[data-setting-explanation-id="example-setting"]')
        ?.getAttribute('data-setting-provenance'),
      'compiled-default'
    )
    assert.equal(
      view.container.querySelector(`#${ids.explanationId}`)?.textContent,
      'Changes the example behavior without changing saved documents.'
    )
    assert.equal(
      view.container.querySelector(`#${ids.provenanceId}`)?.textContent,
      'No choice is recorded. Current and shipped value: off.'
    )
  })

  it('changes the machine-readable source with the rendered provenance', () => {
    const view = render(
      <SettingExplanation
        settingId="stored-setting"
        summary="What this setting changes"
        explanation="Controls the stored behavior."
        provenance="A choice is recorded. Current value: on. Shipped value: off."
        source="stored-choice"
      />
    )

    assert.equal(
      view.container
        .querySelector('[data-setting-explanation-id="stored-setting"]')
        ?.getAttribute('data-setting-provenance'),
      'stored-choice'
    )
  })

  it('distinguishes accessibility defaults from stored choices in every language mode', () => {
    const props = {
      underlineLinks: true,
      showDiffCheckMarks: true,
      onUnderlineLinksChanged: () => undefined,
      onShowDiffCheckMarksChanged: () => undefined,
    }
    const initial = render(<Accessibility {...props} />)

    assert.equal(
      initial.container
        .querySelector(
          '[data-setting-explanation-id="accessibility-underline-links"]'
        )
        ?.getAttribute('data-setting-provenance'),
      'compiled-default'
    )
    assert.equal(
      screen.getAllByText(
        'No choice is recorded on this computer. Current and shipped value: on.'
      ).length,
      2
    )
    initial.unmount()

    localStorage.setItem(underlineLinksKey, '0')
    localStorage.setItem(showDiffCheckMarksKey, '0')
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    const stored = render(
      <Accessibility
        {...props}
        underlineLinks={false}
        showDiffCheckMarks={false}
      />
    )

    assert.ok(
      screen.getByRole('checkbox', { name: 'Underline links · 連結加底線' })
    )
    assert.equal(
      screen.getAllByText(
        'A choice is recorded on this computer. Current value: off. Shipped value: on. · 呢部電腦記錄咗選擇。目前值：關。出廠值：開。'
      ).length,
      2
    )
    assert.equal(
      stored.container
        .querySelector(
          '[data-setting-explanation-id="accessibility-diff-check-marks"]'
        )
        ?.getAttribute('data-setting-provenance'),
      'stored-choice'
    )
  })

  it('covers every prompt control with localized behavior and exact provenance', () => {
    const props = {
      confirmRepositoryRemoval: true,
      confirmDiscardChanges: true,
      confirmDiscardChangesPermanently: true,
      confirmDiscardStash: true,
      confirmCheckoutCommit: true,
      confirmForcePush: true,
      confirmUndoCommit: true,
      askForConfirmationOnCommitFilteredChanges: true,
      confirmCommitMessageOverride: true,
      confirmWorktreeRemoval: true,
      showCommitLengthWarning: true,
      uncommittedChangesStrategy: defaultUncommittedChangesStrategy,
      onConfirmDiscardChangesChanged: () => undefined,
      onConfirmDiscardChangesPermanentlyChanged: () => undefined,
      onConfirmDiscardStashChanged: () => undefined,
      onConfirmCheckoutCommitChanged: () => undefined,
      onConfirmRepositoryRemovalChanged: () => undefined,
      onConfirmForcePushChanged: () => undefined,
      onConfirmUndoCommitChanged: () => undefined,
      onShowCommitLengthWarningChanged: () => undefined,
      onUncommittedChangesStrategyChanged: () => undefined,
      onAskForConfirmationOnCommitFilteredChanges: () => undefined,
      onConfirmCommitMessageOverrideChanged: () => undefined,
      onConfirmWorktreeRemovalChanged: () => undefined,
    }
    const initial = render(<Prompts {...props} />)
    assert.equal(
      initial.container.querySelectorAll(
        '[data-setting-explanation-id^="prompts-"]'
      ).length,
      12
    )
    assert.equal(
      screen
        .getByRole('checkbox', { name: 'Removing repositories' })
        .getAttribute('aria-describedby'),
      'prompts-confirm-repository-removal-setting-explanation prompts-confirm-repository-removal-setting-provenance'
    )
    assert.equal(
      screen
        .getByRole('radiogroup', {
          name: 'If I have changes and I switch branches...',
        })
        .getAttribute('aria-describedby'),
      'prompts-uncommitted-changes-strategy-setting-explanation prompts-uncommitted-changes-strategy-setting-provenance'
    )
    initial.unmount()

    localStorage.setItem(confirmRepoRemovalKey, '0')
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    render(<Prompts {...props} confirmRepositoryRemoval={false} />)
    assert.ok(
      screen.getByRole('checkbox', {
        name: 'Removing repositories · 移除儲存庫',
      })
    )
    assert.ok(
      screen.getByText(
        'A choice is recorded on this computer. Current value: off. Shipped value: on. · 呢部電腦記錄咗選擇。目前值：關。出廠值：開。'
      )
    )
  })

  it('covers the AI master, provider, and repository-default controls', () => {
    const initial = render(<AIPreferences />)
    assert.equal(
      initial.container.querySelectorAll('[data-setting-explanation-id^="ai-"]')
        .length,
      4
    )
    assert.ok(
      screen.getByRole('checkbox', {
        name: 'Allow AI features to send diffs and file contents',
      })
    )
    assert.equal(
      initial.container
        .querySelector('[data-setting-explanation-id="ai-master-switch"]')
        ?.getAttribute('data-setting-provenance'),
      'compiled-default'
    )
    initial.unmount()

    localStorage.setItem(
      AIAdminPolicySettingsStorageKey,
      JSON.stringify({
        ...DefaultAIAdminPolicySettings,
        aiFeaturesEnabled: false,
        defaultRepositoryEligibility: 'deny',
      })
    )
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    resetAIAdminPolicySettingsCache()
    const stored = render(<AIPreferences />)
    assert.ok(
      screen.getByRole('checkbox', {
        name: 'Allow AI features to send diffs and file contents · 允許 AI 功能傳送 diff 同檔案內容',
      })
    )
    assert.equal(
      stored.container
        .querySelector(
          '[data-setting-explanation-id="ai-default-repository-eligibility"]'
        )
        ?.getAttribute('data-setting-provenance'),
      'stored-choice'
    )
    assert.ok(
      screen.getByText(
        'A choice is recorded on this computer. Current value: deny. Shipped value: allow. · 呢部電腦記錄咗選擇。目前值：拒絕。出廠值：允許。'
      )
    )
  })

  it('covers account sign-in fields without characterizing secret values', () => {
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    const view = render(
      <Accounts
        accounts={[]}
        onDotComSignIn={() => undefined}
        onEnterpriseSignIn={() => undefined}
        onProviderSignIn={async () => {
          throw new Error('not used by this rendering test')
        }}
        onLogout={() => undefined}
        onMakeActive={() => undefined}
        onOpenInBrowser={async () => true}
      />
    )

    assert.equal(
      view.container.querySelectorAll(
        '[data-setting-explanation-id^="accounts-"]'
      ).length,
      11
    )
    assert.ok(screen.getByLabelText('Jira deployment · Jira 部署'))
    assert.ok(screen.getByLabelText('Username · 用戶名'))
    for (const provenance of Array.from(
      view.container.querySelectorAll('.setting-explanation__provenance')
    )) {
      assert.doesNotMatch(
        provenance.textContent ?? '',
        /glpat-|personal access|member token|app password/i
      )
    }
  })

  it('covers every issue-reference field with provider-specific transient provenance', () => {
    localStorage.setItem(LanguageModeStorageKey, 'bilingual')
    const view = render(
      <>
        <IssueTrackerReference
          provider="jira-cloud"
          endpoint="https://jira.example.test"
          accountId="account-1"
          connected={true}
          onOpenInBrowser={async () => true}
        />
        <IssueTrackerReference
          provider="jira-data-center"
          endpoint="https://jira-dc.example.test"
          accountId="account-2"
          connected={true}
          onOpenInBrowser={async () => true}
        />
        <IssueTrackerReference
          provider="trello"
          endpoint="https://api.trello.com"
          accountId="account-3"
          connected={true}
          onOpenInBrowser={async () => true}
        />
      </>
    )

    assert.equal(
      view.container.querySelectorAll(
        '[data-setting-explanation-id^="issue-reference-"]'
      ).length,
      6
    )
    assert.equal(
      screen
        .getByLabelText('Board ID · Board ID')
        .getAttribute('aria-describedby'),
      'issue-reference-trello-scope-setting-explanation issue-reference-trello-scope-setting-provenance'
    )
    for (const row of Array.from(
      view.container.querySelectorAll(
        '[data-setting-explanation-id^="issue-reference-"]'
      )
    )) {
      assert.equal(row.getAttribute('data-setting-provenance'), 'runtime-only')
    }
  })
})
