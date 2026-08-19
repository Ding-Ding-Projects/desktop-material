import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'
import { translate } from '../../src/lib/i18n'
import {
  FunnyBand,
  FunnyLevelTextBase,
  funnyBand,
  translateWithFunnyLevel,
} from '../../src/lib/funny-level-text'

/**
 * The three language modes and the two funny-level sliders, across every
 * surface the MD3 rewrite added.
 *
 * The existing catalogue guards in `i18n-test.ts` check that a key exists in
 * both catalogues and that both sides interpolate the same placeholders. Both
 * pass cleanly on a Cantonese catalogue that is a verbatim copy of the English
 * one — a key present with English words in it is present, and English words
 * interpolate exactly like the Cantonese they replaced. So a surface can ship
 * every key it needs, satisfy every existing guard, and still render English at
 * a reader who chose Cantonese. The first assertion below is the one that
 * looks.
 */

const Md3Prefix = 'md3.'

const Bands: ReadonlyArray<FunnyBand> = ['plain', 'light', 'playful', 'maximum']

/**
 * Why a particular `md3.*` key is allowed to read identically in both catalogs.
 *
 * A bare skip list would be a hole: anybody could quiet a real defect by adding
 * a key to it. Each reason below is *checked* against the key's own English
 * value, so an entry only survives while the thing it claims stays true.
 */
type IdenticalReason =
  /**
   * The value is a layout template and nothing else — placeholders, separators
   * and punctuation. There is no prose in it to translate, and rewriting the
   * separators per language would only make two orderings of the same facts.
   */
  | 'format'
  /**
   * The value is an identifier a reader has to see verbatim: a product name, a
   * unit symbol, an abbreviation, a URI scheme. Translating it would make the
   * Cantonese reader look for something that does not exist.
   */
  | 'identifier'

/**
 * The identifier fragments an `identifier` key is allowed to consist of, once
 * its placeholders and punctuation are removed. Hand-written, so a key cannot
 * claim to be an identifier and then quietly grow a sentence.
 */
const AllowedIdentifierFragments: ReadonlyArray<string> = [
  'Copilot',
  'MB',
  'PR',
  'otpauth',
  'totp',
  // The Git subcommands themselves, which the permission summary joins into
  // `read + commit + push`. A Cantonese reader types `git commit` too.
  'commit',
  'push',
]

const IdenticalByDesign: Readonly<Record<string, IdenticalReason>> = {
  'md3.menu.account.entry': 'format',
  'md3.menu.repoMenu.entry': 'format',
  'md3.repositories.detail': 'format',
  'md3.repositories.size': 'identifier',
  'md3.repositories.branchAheadBehind': 'format',
  'md3.actions.meta.number': 'format',
  'md3.compose.copilot': 'identifier',
  'md3.inbox.detail': 'format',
  'md3.inbox.detailNoSource': 'format',
  'md3.bulk.scopedAction': 'format',
  'md3.inbox.bulkMarkReadScoped': 'format',
  'md3.inbox.bulkMarkUnreadScoped': 'format',
  'md3.inbox.bulkDeleteScoped': 'format',
  'md3.inbox.bulkExportScoped': 'format',
  'md3.diffPane.fileTabNameWithoutStats': 'format',
  'md3.changes.summaryHint': 'format',
  'md3.terminal.sessionLabel': 'format',
  'md3.branches.detail.diverged': 'format',
  'md3.branches.detail.pullRequest': 'identifier',
  'md3.history.byline': 'format',
  'md3.history.detailWithoutStats': 'format',
  'md3.history.detailWithoutStatsOrBranch': 'format',
  'md3.history.sheet.fileEntryWithoutStats': 'format',
  'md3.auth.register.uriPlaceholder': 'identifier',
  'md3.actions.detailHeading': 'format',
  'md3.actions.runMeta': 'format',
  'md3.history.detailWithoutBranch': 'format',
  // `read + commit + push` is asserted verbatim by the permission summary, and
  // these three are the Git verbs themselves rather than words about them —
  // a Cantonese reader types `git commit` too.
  'md3.adapters.agent.permissions.commit': 'identifier',
  'md3.adapters.agent.permissions.push': 'identifier',
}

/** Strip every `{placeholder}`, leaving whatever prose the template carries. */
function withoutPlaceholders(template: string): string {
  return template.replace(/\{[a-zA-Z0-9_]+\}/g, ' ')
}

/** Whatever is left once placeholders, spaces and punctuation are gone. */
function prose(template: string): string {
  return withoutPlaceholders(template)
    .replace(/[\s0-9·—–\-:/.,#↑↓…()[\]|]/g, '')
    .trim()
}

const md3Keys = (Object.keys(englishTranslations) as Array<TranslationKey>)
  .filter(key => key.startsWith(Md3Prefix))
  .sort()

/**
 * The eight destinations the rewrite added, and the banded family each one
 * carries. Hand-written rather than derived from the catalogue: a test that
 * iterates the banded families it can find passes cleanly on a destination
 * whose bands were never written, because it never looks for one.
 */
const BandedDestinations: ReadonlyArray<{
  readonly destination: string
  readonly base: FunnyLevelTextBase
  readonly view: string
}> = [
  {
    destination: 'Repositories',
    base: 'md3.repositories.empty',
    view: 'md3-repositories-view.tsx',
  },
  {
    destination: 'Changes',
    base: 'md3.changes.empty',
    view: 'md3-changes-view.tsx',
  },
  {
    destination: 'History',
    base: 'md3.history.empty',
    view: 'md3-history-view.tsx',
  },
  {
    destination: 'Branches',
    base: 'md3.branches.empty',
    view: 'md3-branches-view.tsx',
  },
  {
    destination: 'Actions',
    base: 'md3.actions.logEmpty',
    view: 'md3-actions-view.tsx',
  },
  {
    destination: 'Agents',
    base: 'md3.agents.emptyNoSessions',
    view: 'md3-agents-view.tsx',
  },
  {
    destination: 'Inbox',
    base: 'md3.inbox.empty.caughtUp',
    view: 'md3-inbox-view.tsx',
  },
  {
    destination: 'Terminal',
    base: 'md3.terminal.noSessions',
    view: 'md3-terminal-view.tsx',
  },
]

/**
 * Read a catalog entry that must exist.
 *
 * The Cantonese catalog is typed `Partial`, so every lookup is
 * `string | undefined` and an absent band would otherwise flow into a
 * comparison as `undefined` and quietly compare equal to another absent band.
 */
function required(
  catalog: Readonly<Partial<Record<TranslationKey, string>>>,
  key: TranslationKey,
  what: string
): string {
  const value = catalog[key]
  assert.notEqual(value, undefined, `${what} has no entry for ${key}`)
  return value as string
}

function md3Source(fileName: string): string {
  return readFileSync(
    join(__dirname, '..', '..', 'src', 'ui', 'md3', fileName),
    'utf8'
  )
}

describe('MD3 language modes', () => {
  it('says something different in Cantonese than it says in English', () => {
    const identical = md3Keys.filter(
      key => cantoneseTranslations[key] === englishTranslations[key]
    )

    const undeclared = identical.filter(
      key => IdenticalByDesign[key] === undefined
    )

    assert.deepEqual(
      undeclared,
      [],
      `These md3 keys render English to a Cantonese reader: ${undeclared.join(
        ', '
      )}`
    )
  })

  it('holds every identical-by-design key to the reason it claims', () => {
    for (const [key, reason] of Object.entries(IdenticalByDesign)) {
      const typed = key as TranslationKey
      const english = englishTranslations[typed]

      assert.notEqual(
        english,
        undefined,
        `${key} is exempted but no longer exists`
      )
      assert.ok(key.startsWith(Md3Prefix), `${key} is not an md3 key`)

      const remainder = prose(english)

      if (reason === 'format') {
        assert.equal(
          remainder,
          '',
          `${key} claims to be format-only but carries the prose "${remainder}"`
        )
        continue
      }

      // An identifier key may carry nothing but the fragments named above.
      let residue = remainder
      for (const fragment of AllowedIdentifierFragments) {
        residue = residue.split(fragment).join('')
      }
      assert.equal(
        residue,
        '',
        `${key} claims to be an identifier but carries the prose "${residue}"`
      )
    }
  })

  it('renders every md3 key in all three modes without losing a language', () => {
    for (const key of md3Keys) {
      const english = translate(key, 'english')
      const cantonese = translate(key, 'cantonese')

      assert.notEqual(english, '', `${key} renders nothing in English`)
      assert.notEqual(cantonese, '', `${key} renders nothing in Cantonese`)
      assert.equal(
        translate(key, 'bilingual'),
        `${english} · ${cantonese}`,
        `${key} does not compose in bilingual mode`
      )
    }
  })
})

describe('MD3 destination funny levels', () => {
  it('carries all four bands, in both catalogs, for every destination', () => {
    for (const { destination, base } of BandedDestinations) {
      for (const band of Bands) {
        const key = `${base}.${band}` as TranslationKey

        assert.notEqual(
          englishTranslations[key],
          undefined,
          `${destination} has no English ${band} band`
        )
        assert.notEqual(
          cantoneseTranslations[key],
          undefined,
          `${destination} has no Cantonese ${band} band`
        )
        assert.notEqual(
          cantoneseTranslations[key],
          englishTranslations[key],
          `${destination}'s ${band} band is English in the Cantonese catalog`
        )
      }
    }
  })

  it('makes each band audibly different from the one below it', () => {
    // Four keys that all resolve to the same sentence is a slider with nothing
    // behind it: the control moves, the copy does not, and nobody finds out.
    for (const { destination, base } of BandedDestinations) {
      for (const catalog of [englishTranslations, cantoneseTranslations]) {
        const rendered = Bands.map(
          band => catalog[`${base}.${band}` as TranslationKey]
        )
        assert.equal(
          new Set(rendered).size,
          Bands.length,
          `${destination} repeats a band: ${rendered.join(' | ')}`
        )
      }
    }
  })

  it('keeps the facts still while the voice moves', () => {
    // Every band of a family must interpolate exactly the same placeholders as
    // its siblings, in both languages. A band that quietly dropped a `{count}`
    // would state a different fact at one slider position than at another,
    // which is the one thing a funny level may never do.
    const placeholders = (template: string) =>
      (template.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',')

    for (const { destination, base } of BandedDestinations) {
      for (const catalog of [englishTranslations, cantoneseTranslations]) {
        const expected = placeholders(
          required(catalog, `${base}.plain` as TranslationKey, destination)
        )
        for (const band of Bands) {
          assert.equal(
            placeholders(
              required(
                catalog,
                `${base}.${band}` as TranslationKey,
                destination
              )
            ),
            expected,
            `${destination}'s ${band} band changes which facts it states`
          )
        }
      }
    }
  })

  it('picks each language band from that language own level', () => {
    // The two sliders are independent, so the interesting case is the one where
    // they disagree: plain English beside maximally playful Cantonese, in one
    // bilingual string.
    for (const { destination, base } of BandedDestinations) {
      const rendered = translateWithFunnyLevel(base, 'bilingual', {
        english: 1,
        cantonese: 5,
      })

      const plainEnglish =
        englishTranslations[`${base}.plain` as TranslationKey]
      const maximumCantonese =
        cantoneseTranslations[`${base}.maximum` as TranslationKey]

      assert.equal(
        rendered,
        `${plainEnglish} · ${maximumCantonese}`,
        `${destination} does not read its two levels independently`
      )

      // And the other way round, so neither language can be the one that is
      // secretly driving both.
      assert.equal(
        translateWithFunnyLevel(base, 'bilingual', {
          english: 5,
          cantonese: 1,
        }),
        `${englishTranslations[`${base}.maximum` as TranslationKey]} · ${
          cantoneseTranslations[`${base}.plain` as TranslationKey]
        }`,
        `${destination} does not read its two levels independently`
      )
    }
  })

  it('reaches every slider position from a real level', () => {
    // The bands only mean anything if the 1..5 the slider offers actually
    // selects all four of them.
    assert.deepEqual([1, 2, 3, 4, 5].map(funnyBand), [
      'plain',
      'plain',
      'light',
      'playful',
      'maximum',
    ])
  })

  it('renders each destination empty state through the banded helper', () => {
    // A destination that regressed to `t('md3.x.empty')` would still compile,
    // still render a sentence, and silently stop carrying a funny level — the
    // exact failure this whole family exists to prevent.
    for (const { destination, base, view } of BandedDestinations) {
      const source = md3Source(view)

      assert.ok(
        source.includes(`tFunny('${base}')`),
        `${destination} does not render its empty state through tFunny`
      )
      assert.ok(
        !source.includes(`t('${base}')`),
        `${destination} still reaches its empty state through flat t()`
      )
      assert.ok(
        source.includes("from '../../lib/funny-level-text'"),
        `${destination} does not import the banded helper`
      )
    }
  })
})

describe('MD3 bilingual layout', () => {
  const paneHeader = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'styles',
      'ui',
      '_md3-pane-header.scss'
    ),
    'utf8'
  )

  function rule(selector: string): string {
    const start = paneHeader.indexOf(`${selector} {`)
    assert.notEqual(start, -1, `${selector} has no rule`)
    return paneHeader.slice(start, paneHeader.indexOf('}', start))
  }

  it('lets the pane title give up width instead of clipping the controls', () => {
    // The title is the localized destination name, so bilingual mode roughly
    // doubles it. The header is `overflow: hidden`, so a title that cannot
    // shrink does not widen the header — it pushes the fetch, push and overflow
    // controls off the end, where nothing says they are missing.
    const title = rule('.md3-pane-header__title')

    assert.ok(!/flex:\s*none/.test(title))
    assert.ok(/flex:\s*0 1 auto/.test(title))
    assert.ok(/min-width:\s*0/.test(title))
    assert.ok(/text-overflow:\s*ellipsis/.test(title))
  })

  it('lets a breadcrumb shrink below its 200px cap', () => {
    // Two crumbs at `flex: none` reserve 400px that a narrow pane can never
    // reclaim, and the ellipsis their label already carries never engages.
    const crumb = rule('.md3-pane-header__crumb')

    assert.ok(!/flex:\s*none/.test(crumb))
    assert.ok(/flex:\s*0 1 auto/.test(crumb))
    assert.ok(/min-width:\s*0/.test(crumb))
    assert.ok(/max-width:\s*200px/.test(crumb))
  })

  it('keeps the header controls at their designed size', () => {
    // Shrinking must land on the label, never on a control: a squashed icon
    // button is a smaller hit target, which is a worse outcome than a truncated
    // word.
    for (const selector of [
      '.md3-pane-header__icon',
      '.md3-pane-header__separator',
      '.md3-pane-header__push',
    ]) {
      assert.ok(
        /flex:\s*none/.test(rule(selector)),
        `${selector} may not shrink`
      )
    }
  })
})
