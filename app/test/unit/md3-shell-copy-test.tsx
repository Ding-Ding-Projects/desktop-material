import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'

import { TranslationKey, translate } from '../../src/lib/i18n'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../src/lib/i18n-resources'
import { FunnyLevelTextBase } from '../../src/lib/funny-level-text'
import {
  Md3ActionsChips,
  Md3BranchChips,
  md3ActionsChipLabel,
  md3BranchChipLabel,
  md3DestinationAnnouncement,
} from '../../src/ui/md3'
import { Md3Chip } from '../../src/ui/md3/md3-primitives'
import { fireEvent, render, screen } from '../helpers/ui/render'

/**
 * The MD3 rewrite's own copy contract.
 *
 * Two failures this exists to catch, both of which compile, lint and render
 * without complaint:
 *
 *  - a filter chip that renders its own identifier. The contract writes the
 *    chip ids in English, and rendering the id is indistinguishable from
 *    rendering a label until somebody switches to Cantonese and finds four
 *    English chips — or, worse, switches and finds the filter no longer
 *    recognises its own chips because the label round-trips as the id;
 *  - a dialog that never got its emoji decoration. A rule shaped "every
 *    decoration present is well-formed" passes cleanly on a dialog that has
 *    none, because it never looked for the missing one. The list below is
 *    therefore hand-written, and adding a dialog means adding it here.
 */

// ---------------------------------------------------------------------------
// Banded copy
// ---------------------------------------------------------------------------

const ShellFunnyBases: ReadonlyArray<FunnyLevelTextBase> = [
  'md3.shell.destinationAnnouncement',
]

const Bands: ReadonlyArray<string> = ['plain', 'light', 'playful', 'maximum']

describe('md3 shell copy', () => {
  it('ships every band of every banded family in both catalogues', () => {
    for (const base of ShellFunnyBases) {
      for (const band of Bands) {
        const key = `${base}.${band}` as TranslationKey
        assert.ok(
          englishTranslations[key] !== undefined,
          `English is missing ${key}`
        )
        assert.ok(
          cantoneseTranslations[key] !== undefined,
          `Cantonese is missing ${key}`
        )
        assert.notEqual(
          englishTranslations[key],
          cantoneseTranslations[key],
          `${key} is the same string in both catalogues, which means one of ` +
            'them is untranslated'
        )
      }
    }
  })

  it('says something different at each band rather than four copies', () => {
    for (const base of ShellFunnyBases) {
      for (const catalogue of [englishTranslations, cantoneseTranslations]) {
        const rendered = Bands.map(
          band => catalogue[`${base}.${band}` as TranslationKey]
        )
        assert.equal(
          new Set(rendered).size,
          Bands.length,
          `${base} repeats a band, so the slider does not change the voice`
        )
      }
    }
  })

  it('keeps the destination name in every band of both languages', () => {
    // The funny level styles the framing; which surface the user landed on is
    // the fact the announcement exists to state, and no band may drop it.
    for (const band of Bands) {
      const key = `md3.shell.destinationAnnouncement.${band}` as TranslationKey
      assert.match(englishTranslations[key], /\{name\}/)
      assert.match(cantoneseTranslations[key] ?? '', /\{name\}/)
    }
  })

  it('announces the destination through the funny-level helper', () => {
    // Which band the shipped default lands on is a preference and may move;
    // that the announcement is one of the bands with the destination's real
    // name in it is the contract.
    const announced = md3DestinationAnnouncement('History')
    const candidates = Bands.map(band =>
      englishTranslations[
        `md3.shell.destinationAnnouncement.${band}` as TranslationKey
      ].replace('{name}', 'History')
    )
    assert.ok(
      candidates.includes(announced),
      `"${announced}" is not any band of the announcement`
    )
    assert.match(announced, /History/)

    // Each language reads its own band, so Cantonese is checked directly
    // rather than through whichever level English happens to sit at.
    assert.equal(
      translate('md3.shell.destinationAnnouncement.plain', 'cantonese', {
        name: 'History',
      }),
      '而家睇緊History'
    )
  })
})

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

describe('md3 filter chip labels', () => {
  it('labels every Actions chip from the catalogues', () => {
    assert.deepEqual(Md3ActionsChips.map(md3ActionsChipLabel), [
      'Running',
      'Failed',
      'Success',
      'This branch',
    ])
    for (const chip of Md3ActionsChips) {
      assert.notEqual(
        md3ActionsChipLabel(chip),
        undefined,
        `${chip} has no label`
      )
    }
  })

  it('labels every branch chip from the catalogues', () => {
    assert.deepEqual(Md3BranchChips.map(md3BranchChipLabel), [
      'Local',
      'Remote',
    ])
  })

  it('translates the chip labels without translating the chip ids', () => {
    // The id is what a filter matches on. If a Cantonese label ever became the
    // id, the filter would stop recognising its own chips.
    assert.deepEqual(Md3ActionsChips, [
      'Running',
      'Failed',
      'Success',
      'This branch',
    ])
    assert.deepEqual(Md3BranchChips, ['Local', 'Remote'])

    for (const key of [
      'md3.actions.chip.running',
      'md3.actions.chip.failed',
      'md3.actions.chip.success',
      'md3.actions.chip.thisBranch',
      'md3.branches.chip.local',
      'md3.branches.chip.remote',
    ] as ReadonlyArray<TranslationKey>) {
      assert.ok(englishTranslations[key] !== undefined, `missing ${key}`)
      assert.ok(cantoneseTranslations[key] !== undefined, `missing ${key}`)
    }
  })

  it('reports the chip id, not the rendered label, when a value is given', () => {
    const toggled = new Array<string>()
    render(
      <Md3Chip
        label="呢條分支"
        value="This branch"
        active={false}
        onToggle={value => toggled.push(value)}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    assert.deepEqual(toggled, ['This branch'])
  })

  it('reports the label when the label is itself the thing filtered on', () => {
    // Repository group chips are named after real groups, so the label is the
    // datum and there is no separate id to report.
    const toggled = new Array<string>()
    render(
      <Md3Chip
        label="desktop-material"
        active={true}
        onToggle={value => toggled.push(value)}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    assert.deepEqual(toggled, ['desktop-material'])
  })
})

// ---------------------------------------------------------------------------
// Dialog decoration
// ---------------------------------------------------------------------------

/**
 * Every MD3 dialog surface that must render the shared emoji decoration.
 *
 * Hand-written on purpose. A guard derived from the files that already import
 * `DialogEmoji` would validate exactly the dialogs that are already correct.
 */
const DecoratedDialogs: ReadonlyArray<string> = [
  'app/src/ui/md3/md3-compose-dialog.tsx',
  'app/src/ui/md3/md3-regex-builder-dialog.tsx',
  'app/src/ui/md3/md3-destructive-gate.tsx',
  'app/src/ui/md3/md3-authenticator-registration.tsx',
  'app/src/ui/md3/md3-lock-setup-dialog.tsx',
  'app/src/ui/md3/md3-lock-unlock-prompt.tsx',
  'app/src/ui/md3/md3-lock-removal-gate.tsx',
  'app/src/ui/md3/md3-support-ticket-delete-gate.tsx',
]

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('md3 dialog decoration', () => {
  it('renders the shared decoration in every dialog that must carry one', () => {
    for (const path of DecoratedDialogs) {
      const text = source(path)
      assert.ok(
        text.includes('<DialogEmoji '),
        `${path} renders no <DialogEmoji>, so the "show emojis in dialogs" ` +
          'setting cannot reach it'
      )
    }
  })

  it('never puts a decoration inside a control label or accessible name', () => {
    for (const path of DecoratedDialogs) {
      const text = source(path)
      // `DialogEmoji` renders its own `aria-hidden` span, so the only way a
      // glyph reaches a label is a literal one written into the source.
      assert.ok(
        !/(label|aria-label|placeholder)=\{?['"][^'"]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(
          text
        ),
        `${path} writes an emoji into a control label`
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Nothing user-visible is left hard-coded
// ---------------------------------------------------------------------------

describe('md3 shell localization', () => {
  it('sends the support-ticket save dialog title through the catalogues', () => {
    // The operating system's own save dialog reads this title, which is easy
    // to leave in English because no React test renders it.
    const text = source('app/src/ui/md3/md3-support-tickets-view.tsx')
    assert.ok(text.includes("t('supportTickets.export.saveDialogTitle')"))
    assert.ok(!text.includes("title: 'Export support tickets'"))
    assert.ok(
      englishTranslations['supportTickets.export.saveDialogTitle'] !== undefined
    )
    assert.ok(
      cantoneseTranslations['supportTickets.export.saveDialogTitle'] !==
        undefined
    )
  })

  it('renders the chips through their label helpers, not their ids', () => {
    const actions = source('app/src/ui/md3/md3-actions-view.tsx')
    assert.ok(actions.includes('label={md3ActionsChipLabel(chip)}'))
    assert.ok(actions.includes('value={chip}'))

    const branches = source('app/src/ui/md3/md3-branches-view.tsx')
    assert.ok(branches.includes('label={md3BranchChipLabel(chip)}'))
    assert.ok(branches.includes('value={chip}'))
  })

  it('lets a bilingual chip wrap rather than clipping it', () => {
    // "This branch · 呢條分支" does not fit one 26px line in a narrow pane, and
    // a fixed height would take the second line away with nothing to say so.
    const styles = source('app/styles/ui/_md3-shell.scss')
    const chip = /\.md3-chip \{[\s\S]*?\n\}/.exec(styles)
    assert.ok(chip !== null, 'the chip has no rule at all')
    assert.match(chip[0], /min-height: 26px;/)
    assert.ok(
      !/\n {2}height: 26px;/.test(chip[0]),
      'a fixed chip height clips the second line of a bilingual label'
    )
    assert.match(chip[0], /overflow-wrap: anywhere;/)
    assert.match(chip[0], /max-width: 100%;/)
  })
})
