import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'
import { computeAccessibleName } from 'dom-accessibility-api'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DialogDecorations,
  dialogDecorationEmoji,
  dialogDecorationKinds,
  getShowDialogEmoji,
  getShowDialogEmojiProvenance,
  resolveDialogDecoration,
  setShowDialogEmoji,
  ShowDialogEmojiDefault,
  ShowDialogEmojiKey,
} from '../../src/lib/dialog-emoji'
import { Dialog, DialogContent, DialogFooter } from '../../src/ui/dialog'
import { OkCancelButtonGroup } from '../../src/ui/dialog/ok-cancel-button-group'
import { Md3ComposeDialog } from '../../src/ui/md3/md3-compose-dialog'
import { Md3RegexBuilderDialog } from '../../src/ui/md3/md3-regex-builder-dialog'
import { Md3DestructiveGate } from '../../src/ui/md3/md3-destructive-gate'
import { Appearance } from '../../src/ui/preferences/appearance'
import { ApplicationTheme } from '../../src/ui/lib/application-theme'
import { DefaultAppearanceCustomization } from '../../src/models/appearance-customization'
import { BranchSortOrder } from '../../src/models/branch-sort-order'
import { ShowBranchNameInRepoListSetting } from '../../src/models/show-branch-name-in-repo-list'
import {
  dateFormats,
  numberFormats,
  timeFormats,
} from '../../src/models/formatting-preferences'
import { DefaultAudioSystemSettings } from '../../src/lib/audio/audio-settings'
import { languageModes } from '../../src/models/language-mode'
import { translate } from '../../src/lib/i18n'
import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'
import { CommandPaletteCatalog } from '../../src/lib/command-palette-catalog'
import { SettingsSearchCatalog } from '../../src/lib/settings-search/settings-search-catalog'
import { TeleportTargetSelectors } from '../../src/lib/teleport-targets'
import { render, screen, fireEvent } from '../helpers/ui/render'

// The real Dialog reports its opening to the main process. Keep this focused
// suite independent of Electron's main process while mounting the production
// component rather than a stand-in.
ipcRenderer.send = () => undefined

// jsdom does not implement the native dialog opening methods, so mark the
// element open and let Testing Library query the same visible subtree the
// packaged app presents.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.show = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
}

/**
 * Everything a user reads to work out what a control does.
 *
 * The contract forbids the decoration from reaching any of these, so the
 * assertions below sweep them rather than spot-checking one button.
 */
function controlTexts(container: HTMLElement): ReadonlyArray<string> {
  const texts: string[] = []
  const controls = container.querySelectorAll<HTMLElement>(
    'button, [role="button"], a, label, legend, summary, input, textarea, select, option, [aria-label], [role="tab"], [role="menuitem"], [role="option"]'
  )
  for (const control of controls) {
    texts.push(control.textContent ?? '')
    for (const attribute of ['aria-label', 'placeholder', 'value', 'alt']) {
      const value = control.getAttribute(attribute)
      if (value !== null) {
        texts.push(value)
      }
    }
  }
  return texts
}

function assertNoDecorationInControls(container: HTMLElement) {
  for (const text of controlTexts(container)) {
    for (const emoji of dialogDecorationEmoji) {
      assert.ok(
        !text.includes(emoji),
        `control text ${JSON.stringify(text)} carries the decorative ${emoji}`
      )
    }
  }
}

/** Accessible names for every element that exposes one, in document order. */
function accessibleNames(container: HTMLElement): ReadonlyArray<string> {
  const names: string[] = []
  const elements = container.querySelectorAll<HTMLElement>('*')
  for (const element of elements) {
    const name = computeAccessibleName(element)
    if (name.length > 0) {
      names.push(`${element.tagName}:${name}`)
    }
  }
  return names
}

function withEmoji<T>(enabled: boolean, body: () => T): T {
  setShowDialogEmoji(enabled)
  return body()
}

/**
 * Render the same tree twice, once with decoration and once without, and
 * return both accessible-name lists plus both decoration counts.
 *
 * This is the assertion that actually catches the regression this feature is
 * most likely to grow: an emoji moved inside the element `aria-labelledby`
 * points at still renders correctly, still passes a visual check, and silently
 * changes what a screen reader announces.
 */
function comparePresentations(element: () => React.ReactElement) {
  // Scan the whole document rather than the render container: two of these
  // dialogs render through a React portal, so a container-only scan would find
  // no decoration and no accessible names, and the comparison would pass by
  // looking at nothing.
  const capture = (enabled: boolean) =>
    withEmoji(enabled, () => {
      const view = render(element())
      const root = document.body
      const result = {
        names: accessibleNames(root),
        decorations: root.querySelectorAll('.dialog-emoji').length,
      }
      assertNoDecorationInControls(root)
      view.unmount()
      view.container.remove()
      return result
    })

  return { decorated: capture(true), plain: capture(false) }
}

beforeEach(() => {
  localStorage.removeItem(ShowDialogEmojiKey)
})

describe('dialog emoji preference', () => {
  it('defaults to the shipped value and reports that provenance honestly', () => {
    assert.equal(getShowDialogEmoji(), ShowDialogEmojiDefault)
    assert.equal(getShowDialogEmojiProvenance(), 'default')
  })

  it('round-trips through the shared boolean store and records provenance', () => {
    assert.equal(setShowDialogEmoji(false), false)
    assert.equal(localStorage.getItem(ShowDialogEmojiKey), '0')
    assert.equal(getShowDialogEmoji(), false)
    assert.equal(getShowDialogEmojiProvenance(), 'stored')

    assert.equal(setShowDialogEmoji(true), true)
    assert.equal(localStorage.getItem(ShowDialogEmojiKey), '1')
    assert.equal(getShowDialogEmoji(), true)
    assert.equal(getShowDialogEmojiProvenance(), 'stored')
  })

  it('falls back to the shipped value for an unreadable stored value', () => {
    localStorage.setItem(ShowDialogEmojiKey, 'yes please')
    assert.equal(getShowDialogEmoji(), ShowDialogEmojiDefault)
  })

  it('resolves a decoration only when a kind is named and the setting is on', () => {
    assert.equal(resolveDialogDecoration('destructive', true), '🧨')
    assert.equal(resolveDialogDecoration('destructive', false), null)
    assert.equal(resolveDialogDecoration(undefined, true), null)
  })

  it('maps every kind to a single decorative glyph carrying no words', () => {
    assert.ok(dialogDecorationKinds.length > 0)
    for (const kind of dialogDecorationKinds) {
      const decoration = DialogDecorations[kind]
      assert.ok(decoration.length > 0, kind)
      // A glyph, not a sentence. Anything with letters or digits in it would
      // be copy, and copy belongs in the translation catalogs.
      assert.ok(!/[A-Za-z0-9]/.test(decoration), `${kind} is not a glyph`)
      assert.ok(
        Array.from(decoration).length <= 3,
        `${kind} should be one emoji, not a sequence`
      )
    }
  })

  it('never lets a decoration reach a translated string', () => {
    // A translated label that already contained an emoji would put one in a
    // button no matter how carefully the renderer behaves.
    for (const catalog of [englishTranslations, cantoneseTranslations]) {
      for (const [key, value] of Object.entries(catalog)) {
        for (const emoji of dialogDecorationEmoji) {
          assert.ok(
            !value.includes(emoji),
            `${key} carries the decorative ${emoji}`
          )
        }
      }
    }
  })
})

describe('dialog emoji rendering boundary', () => {
  const renderDialog = () => (
    <Dialog
      id="dialog-emoji-probe"
      title="Delete branch"
      type="warning"
      emojiDecoration="destructive"
      onDismissed={() => undefined}
      onSubmit={() => undefined}
    >
      <DialogContent>
        <p>This deletes the branch feature/x from this repository.</p>
      </DialogContent>
      <DialogFooter>
        <OkCancelButtonGroup destructive={true} okButtonText="Delete branch" />
      </DialogFooter>
    </Dialog>
  )

  it('keeps every accessible name byte-identical with and without decoration', () => {
    const { decorated, plain } = comparePresentations(renderDialog)

    assert.equal(decorated.decorations, 1)
    assert.equal(plain.decorations, 0)
    assert.deepEqual(decorated.names, plain.names)
  })

  it('hides the decoration from assistive technology', () => {
    setShowDialogEmoji(true)
    const view = render(renderDialog())
    const decoration = view.container.querySelector('.dialog-emoji')
    assert.ok(decoration !== null)
    assert.equal(decoration!.getAttribute('aria-hidden'), 'true')
    assert.equal(decoration!.textContent, DialogDecorations.destructive)
  })

  it('renders the decoration outside the element the dialog is labelled by', () => {
    setShowDialogEmoji(true)
    const view = render(renderDialog())
    const dialog = view.container.querySelector('dialog')
    assert.ok(dialog !== null)

    const labelledBy = dialog!.getAttribute('aria-labelledby')
    const describedBy = dialog!.getAttribute('aria-describedby')
    const ids = `${labelledBy ?? ''} ${describedBy ?? ''}`
      .split(/\s+/)
      .filter(id => id.length > 0)
    assert.ok(ids.length > 0, 'the dialog must be named by something')

    for (const id of ids) {
      // jsdom does not expose the global `CSS` object, so match the id
      // attribute directly rather than building a `#id` selector.
      const target = view.container.querySelector(`[id="${id}"]`)
      if (target === null) {
        continue
      }
      assert.equal(
        target.querySelector('.dialog-emoji'),
        null,
        `#${id} contains the decoration and would announce it`
      )
    }
  })

  it('keeps the factual copy identical in both states', () => {
    const readCopy = (enabled: boolean) =>
      withEmoji(enabled, () => {
        const view = render(renderDialog())
        const content = view.container.querySelector('.dialog-content')
        const text = content?.textContent ?? ''
        view.container.remove()
        return text
      })

    assert.equal(readCopy(true), readCopy(false))
  })

  it('derives a decoration from the dialog type when none is named', () => {
    setShowDialogEmoji(true)
    const view = render(
      <Dialog id="typed-probe" title="Something failed" type="error">
        <DialogContent>
          <p>The remote refused the connection.</p>
        </DialogContent>
      </Dialog>
    )
    assert.equal(
      view.container.querySelector('.dialog-emoji')?.textContent,
      DialogDecorations.error
    )
  })

  it('adds and removes decoration on a dialog that is already open', () => {
    setShowDialogEmoji(false)
    const view = render(renderDialog())
    assert.equal(view.container.querySelector('.dialog-emoji'), null)

    setShowDialogEmoji(true)
    assert.ok(view.container.querySelector('.dialog-emoji') !== null)

    setShowDialogEmoji(false)
    assert.equal(view.container.querySelector('.dialog-emoji'), null)
  })
})

describe('MD3 dialog decoration', () => {
  it('keeps the compose dialog accessible names identical in both states', () => {
    const { decorated, plain } = comparePresentations(() => (
      <Md3ComposeDialog
        summary="Fix the header"
        description=""
        includedFileCount={2}
        totalFileCount={3}
        addedLineCount={10}
        deletedLineCount={4}
        branchName="main"
        onSummaryChanged={() => undefined}
        onDescriptionChanged={() => undefined}
        onDismissed={() => undefined}
        onCommit={() => undefined}
        onCommitAndPush={() => undefined}
        onDraftWithCopilot={() => undefined}
        onAddCoAuthors={() => undefined}
      />
    ))

    assert.equal(decorated.decorations, 1)
    assert.equal(plain.decorations, 0)
    assert.deepEqual(decorated.names, plain.names)
  })

  it('keeps the regex builder accessible names identical in both states', () => {
    const { decorated, plain } = comparePresentations(() => (
      <Md3RegexBuilderDialog
        targetLabel="commits"
        initialPattern="^fix"
        initialTestString="fix the header"
        onApply={() => undefined}
        onDismissed={() => undefined}
      />
    ))

    assert.equal(decorated.decorations, 1)
    assert.equal(plain.decorations, 0)
    assert.deepEqual(decorated.names, plain.names)
  })

  it('keeps the destructive gate accessible names identical in both states', () => {
    const { decorated, plain } = comparePresentations(() => (
      <Md3DestructiveGate
        actionId="delete-branch"
        title="Delete this branch?"
        summary="This deletes the branch feature/x from this repository."
        irreversible="A deleted local branch cannot be restored from here."
        targetKeyLabel="the branch feature/x"
        effectKeyLabel="it leaves this repository"
        confirmLabel="Delete branch"
        onConfirm={() => undefined}
        onDismissed={() => undefined}
      />
    ))

    assert.equal(decorated.decorations, 1)
    assert.equal(plain.decorations, 0)
    assert.deepEqual(decorated.names, plain.names)
  })
})

describe('dialog emoji settings entry', () => {
  const renderAppearance = (
    languageMode: 'english' | 'cantonese' | 'bilingual'
  ) =>
    render(
      <Appearance
        selectedTheme={ApplicationTheme.Light}
        onSelectedThemeChanged={() => undefined}
        appearanceCustomization={{
          ...DefaultAppearanceCustomization,
          languageMode,
        }}
        onAppearanceCustomizationChanged={() => undefined}
        zoomBaseFactor={1}
        onZoomBaseFactorChanged={() => undefined}
        autoFitZoomEnabled={false}
        onAutoFitZoomEnabledChanged={() => undefined}
        windowZoomFactor={1}
        selectedTabSize={2}
        onSelectedTabSizeChanged={() => undefined}
        selectedDateFormat={dateFormats[0].pattern}
        onSelectedDateFormatChanged={() => undefined}
        selectedTimeFormat={timeFormats[0].pattern}
        onSelectedTimeFormatChanged={() => undefined}
        selectedNumberFormat={numberFormats[0]}
        onSelectedNumberFormatChanged={() => undefined}
        preferAbsoluteDates={false}
        onPreferAbsoluteDatesChanged={() => undefined}
        showRecentRepositories={true}
        onShowRecentRepositoriesChanged={() => undefined}
        showBranchNameInRepoList={ShowBranchNameInRepoListSetting.Never}
        onShowBranchNameInRepoListChanged={() => undefined}
        branchSortOrder={BranchSortOrder.LastModified}
        onBranchSortOrderChanged={() => undefined}
        funnyLevelSettingsStore={{
          getSettings: () => DefaultAudioSystemSettings,
          setSettings: () => undefined,
        }}
      />
    )

  it('offers a keyboard-reachable toggle that persists the choice', () => {
    const view = renderAppearance('english')
    const toggle = screen.getByRole('checkbox', {
      name: translate('dialogEmoji.toggleLabel', 'english'),
    })
    assert.equal((toggle as HTMLInputElement).checked, ShowDialogEmojiDefault)
    assert.ok(!(toggle as HTMLInputElement).disabled)

    fireEvent.click(toggle)
    assert.equal(getShowDialogEmoji(), !ShowDialogEmojiDefault)
    assert.equal(getShowDialogEmojiProvenance(), 'stored')

    fireEvent.click(toggle)
    assert.equal(getShowDialogEmoji(), ShowDialogEmojiDefault)

    view.container.remove()
  })

  it('states the default provenance before a choice is recorded', () => {
    const view = renderAppearance('english')
    const provenance = view.container.querySelector(
      '#appearance-dialog-emoji-setting-provenance'
    )
    assert.ok(provenance !== null)
    assert.equal(
      provenance!.textContent,
      'No choice is recorded on this computer. Current and shipped value: on.'
    )
    // "default" is never the word shown; the real value is.
    assert.ok(provenance!.textContent!.includes('on'))
  })

  it('states the recorded provenance once a choice exists', () => {
    setShowDialogEmoji(false)
    const view = renderAppearance('english')
    const provenance = view.container.querySelector(
      '#appearance-dialog-emoji-setting-provenance'
    )
    assert.ok(provenance !== null)
    assert.equal(
      provenance!.textContent,
      'A choice is recorded on this computer. Current value: off. Shipped value: on.'
    )
  })

  it('keeps the explanation behind progressive disclosure', () => {
    const view = renderAppearance('english')
    const details = view.container.querySelector(
      '[data-setting-explanation-id="appearance-dialog-emoji"] details.setting-explanation__details'
    )
    assert.ok(details !== null)
    assert.equal(details!.hasAttribute('open'), false)
    assert.equal(
      details!.querySelector('summary')?.textContent,
      translate('dialogEmoji.explanationSummary', 'english')
    )
  })

  it('renders its copy in every language mode without clipping-prone gaps', () => {
    for (const mode of languageModes) {
      const view = renderAppearance(mode)
      const section = view.container.querySelector('.appearance-dialog-emoji')
      assert.ok(section !== null, mode)
      assert.ok(
        section!.textContent!.includes(translate('dialogEmoji.heading', mode)),
        mode
      )
      view.container.remove()
    }
  })
})

describe('dialog emoji localization and catalog registration', () => {
  const keys: ReadonlyArray<TranslationKey> = [
    'dialogEmoji.heading',
    'dialogEmoji.toggleLabel',
    'dialogEmoji.explanationSummary',
    'dialogEmoji.explanation.plain',
    'dialogEmoji.explanation.light',
    'dialogEmoji.explanation.playful',
    'dialogEmoji.explanation.maximum',
    'dialogEmoji.boundaryNote',
    'dialogEmoji.stateOn',
    'dialogEmoji.stateOff',
    'palette.showDialogEmoji',
    'palette.showDialogEmojiDescription',
    'settingsSearch.entry.appearanceDialogEmoji.title',
    'settingsSearch.entry.appearanceDialogEmoji.desc',
  ]

  it('carries real copy in both catalogs for every key', () => {
    for (const key of keys) {
      const english = translate(key, 'english')
      const cantonese = translate(key, 'cantonese')
      assert.ok(english.trim().length > 0, key)
      assert.ok(cantonese.trim().length > 0, key)
      // English sitting in a Cantonese slot is the failure this catches.
      assert.notEqual(english, cantonese, `${key} is untranslated`)
      assert.ok(/[一-鿿]/.test(cantonese), `${key} has no Cantonese`)

      const bilingual = translate(key, 'bilingual')
      assert.ok(bilingual.includes(english), key)
      assert.ok(bilingual.includes(cantonese), key)
    }
  })

  it('gives each funny band its own voice while stating the same facts', () => {
    const bands = [
      'dialogEmoji.explanation.plain',
      'dialogEmoji.explanation.light',
      'dialogEmoji.explanation.playful',
      'dialogEmoji.explanation.maximum',
    ] as const

    const rendered = bands.map(key => translate(key, 'english'))
    assert.equal(new Set(rendered).size, bands.length)

    for (const text of rendered) {
      // The facts every band must still state: where emoji are forbidden and
      // that the wording does not change.
      assert.ok(/button/i.test(text), text)
      assert.ok(/label/i.test(text), text)
      assert.ok(/screen reader/i.test(text), text)
    }

    for (const key of bands) {
      const cantonese = translate(key, 'cantonese')
      assert.ok(cantonese.includes('按鈕'), key)
      assert.ok(cantonese.includes('螢幕閱讀器'), key)
    }
  })

  it('is reachable from the command palette and from settings search', () => {
    const command = CommandPaletteCatalog.find(
      entry => entry.event === 'palette:set-dialog-emoji'
    )
    assert.ok(command !== undefined)
    assert.equal(command!.control?.kind, 'toggle')
    assert.equal(command!.home?.targetId, 'settingsDialogEmoji')
    assert.ok(
      TeleportTargetSelectors.settingsDialogEmoji.includes(
        'settings-dialog-emoji'
      )
    )

    const entry = SettingsSearchCatalog.find(
      setting => setting.id === 'appearance-dialog-emoji'
    )
    assert.ok(entry !== undefined)
    assert.equal(
      entry!.titleKey,
      'settingsSearch.entry.appearanceDialogEmoji.title'
    )
  })
})

describe('dialog emoji layout contract', () => {
  const stylesheet = readFileSync(
    join(process.cwd(), 'app', 'styles', 'ui', '_dialog-emoji.scss'),
    'utf8'
  )

  it('is registered in the stylesheet index', () => {
    const index = readFileSync(
      join(process.cwd(), 'app', 'styles', '_ui.scss'),
      'utf8'
    )
    assert.match(index, /@import 'ui\/dialog-emoji';/)
  })

  it('never shrinks, never steals the title, and never takes a pointer', () => {
    // A decoration that could shrink would collide with the title it decorates
    // at narrow widths; one that could be clicked would be a control.
    assert.match(
      stylesheet,
      /\.dialog-emoji\s*\{[\s\S]*?flex: 0 0 auto;[\s\S]*?user-select: none;[\s\S]*?pointer-events: none;/
    )
  })

  it('lets the settings row shrink and keeps its disclosure focusable', () => {
    // Bilingual mode gives every string here its longest form, so a minimum
    // width anywhere in this row would clip the pane rather than wrap.
    assert.match(
      stylesheet,
      /\.appearance-dialog-emoji\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/
    )
    assert.match(
      stylesheet,
      /\.appearance-dialog-emoji-explanation,[\s\S]*?\.appearance-dialog-emoji-provenance\s*\{[\s\S]*?overflow-wrap: anywhere;/
    )
    assert.match(
      stylesheet,
      /summary\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline: 2px solid/
    )
  })

  it('sizes itself from the surrounding text so display scaling tracks it', () => {
    // A pixel height clips at 200% display scale; an em height does not.
    assert.match(stylesheet, /\.dialog-emoji\s*\{[\s\S]*?font-size: 1\.15em;/)
    assert.ok(
      !/\.dialog-emoji\s*\{[^}]*font-size:\s*\d+px/.test(stylesheet),
      'the decoration must not be pinned to a pixel font size'
    )
  })
})
