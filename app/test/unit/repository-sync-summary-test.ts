import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { upstreamStateFromStatus } from '../../src/lib/git/status'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../src/lib/i18n-resources'
import { TranslationKey } from '../../src/lib/i18n'
import { CloningRepository } from '../../src/models/cloning-repository'
import { Repository } from '../../src/models/repository'
import { WorkingDirectoryStatus } from '../../src/models/status'
import {
  getRepositorySyncSummary,
  getRepositorySyncSummaryText,
} from '../../src/ui/repositories-list/repository-sync-summary'

const repository = new Repository('/work/desktop', 1, null, false)
const missingRepository = new Repository('/work/gone', 2, null, true)
const cloningRepository = new CloningRepository(
  '/work/cloning',
  'https://example.test/cloning.git'
)

const Plain = { english: 1, cantonese: 1 }
const Light = { english: 3, cantonese: 3 }
const Playful = { english: 5, cantonese: 5 }

const status = (
  overrides: {
    currentBranch?: string
    currentUpstreamBranch?: string
    currentTip?: string
  } = {}
) => ({
  exists: true,
  mergeHeadFound: false,
  squashMsgFound: false,
  rebaseInternalState: null,
  isCherryPickingHeadFound: false,
  workingDirectory: WorkingDirectoryStatus.fromFiles([]),
  doConflictedFilesExist: false,
  ...overrides,
})

const englishText = (
  ...args: Parameters<typeof getRepositorySyncSummary>
): string =>
  getRepositorySyncSummaryText(
    getRepositorySyncSummary(...args),
    'english',
    Plain
  ).segments[0].text

describe('repository list sync summary', () => {
  it('reports the exact ahead, behind, diverged, and in-sync counts', () => {
    assert.deepEqual(
      getRepositorySyncSummary(repository, 'tracking', { ahead: 2, behind: 0 }),
      { kind: 'ahead', ahead: 2, behind: 0 }
    )
    assert.deepEqual(
      getRepositorySyncSummary(repository, 'tracking', { ahead: 0, behind: 3 }),
      { kind: 'behind', ahead: 0, behind: 3 }
    )
    assert.deepEqual(
      getRepositorySyncSummary(repository, 'tracking', { ahead: 2, behind: 3 }),
      { kind: 'diverged', ahead: 2, behind: 3 }
    )
    assert.deepEqual(
      getRepositorySyncSummary(repository, 'tracking', { ahead: 0, behind: 0 }),
      { kind: 'in-sync', ahead: 0, behind: 0 }
    )

    assert.equal(
      englishText(repository, 'tracking', { ahead: 2, behind: 0 }),
      '2 commits to push, nothing to pull'
    )
    assert.equal(
      englishText(repository, 'tracking', { ahead: 0, behind: 3 }),
      '3 commits to pull, nothing to push'
    )
    assert.equal(
      englishText(repository, 'tracking', { ahead: 2, behind: 3 }),
      '2 commits to push, 3 commits to pull'
    )
    assert.equal(
      englishText(repository, 'tracking', { ahead: 0, behind: 0 }),
      'In sync as of the last check'
    )
  })

  it('uses singular commit grammar for a count of one', () => {
    assert.equal(
      englishText(repository, 'tracking', { ahead: 1, behind: 0 }),
      '1 commit to push, nothing to pull'
    )
    assert.equal(
      getRepositorySyncSummaryText(
        getRepositorySyncSummary(repository, 'tracking', {
          ahead: 0,
          behind: 1,
        }),
        'cantonese',
        Plain
      ).segments[0].text,
      '1 個 commit 要 pull，冇嘢要 push'
    )
  })

  // The whole point of the feature. A repository nobody has inspected must not
  // borrow the vocabulary of a repository we checked and found clean.
  it('reports an unknown state, never zero and never in sync, when nothing has been checked', () => {
    const neverChecked = getRepositorySyncSummary(repository, 'unknown', null)

    assert.equal(neverChecked.kind, 'unknown')
    assert.equal(neverChecked.ahead, null)
    assert.equal(neverChecked.behind, null)

    // A tracking branch whose counts were never recorded is equally unknown.
    assert.deepEqual(getRepositorySyncSummary(repository, 'tracking', null), {
      kind: 'unknown',
      ahead: null,
      behind: null,
    })

    const inSync = englishText(repository, 'tracking', { ahead: 0, behind: 0 })

    for (const funnyLevels of [Plain, Light, Playful]) {
      const { segments, accessibleName } = getRepositorySyncSummaryText(
        getRepositorySyncSummary(repository, 'unknown', null),
        'bilingual',
        funnyLevels
      )

      for (const segment of segments) {
        assert.doesNotMatch(segment.text, /\d/, segment.text)
        assert.notEqual(segment.text, inSync)
        assert.doesNotMatch(segment.text, /in sync/i, segment.text)
      }
      assert.match(accessibleName, /unknown|No idea/i)
    }
  })

  it('gives no upstream, detached HEAD, empty, cloning, and missing rows their own states', () => {
    assert.equal(
      getRepositorySyncSummary(repository, 'no-upstream', null).kind,
      'no-upstream'
    )
    assert.equal(
      getRepositorySyncSummary(repository, 'detached', null).kind,
      'detached'
    )
    assert.equal(
      getRepositorySyncSummary(repository, 'unborn', null).kind,
      'empty'
    )
    assert.equal(
      getRepositorySyncSummary(cloningRepository, 'unknown', null).kind,
      'cloning'
    )
    // A missing repository outranks whatever stale counts survive in the cache.
    assert.deepEqual(
      getRepositorySyncSummary(missingRepository, 'tracking', {
        ahead: 4,
        behind: 5,
      }),
      { kind: 'missing', ahead: null, behind: null }
    )

    assert.equal(
      englishText(repository, 'no-upstream', null),
      'No upstream branch'
    )
    assert.equal(
      englishText(repository, 'detached', null),
      'Detached HEAD, no branch to compare'
    )
    assert.equal(englishText(repository, 'unborn', null), 'No commits yet')
    assert.equal(
      englishText(cloningRepository, 'unknown', null),
      'Cloning, sync state not known yet'
    )
    assert.equal(
      englishText(missingRepository, 'tracking', null),
      'Missing from disk, sync state unknown'
    )
  })

  it('maps a parsed status onto the upstream state the row reports', () => {
    assert.equal(upstreamStateFromStatus(status()), 'unborn')
    assert.equal(
      upstreamStateFromStatus(status({ currentTip: 'abc123' })),
      'detached'
    )
    assert.equal(
      upstreamStateFromStatus(
        status({ currentTip: 'abc123', currentBranch: 'main' })
      ),
      'no-upstream'
    )
    assert.equal(
      upstreamStateFromStatus(
        status({
          currentTip: 'abc123',
          currentBranch: 'main',
          currentUpstreamBranch: 'origin/main',
        })
      ),
      'tracking'
    )
  })

  it('honours the per-language funny level without moving the numbers', () => {
    const diverged = getRepositorySyncSummary(repository, 'tracking', {
      ahead: 2,
      behind: 3,
    })

    const plain = getRepositorySyncSummaryText(diverged, 'english', Plain)
      .segments[0].text
    const light = getRepositorySyncSummaryText(diverged, 'english', Light)
      .segments[0].text
    const playful = getRepositorySyncSummaryText(diverged, 'english', Playful)
      .segments[0].text

    assert.equal(new Set([plain, light, playful]).size, 3)
    for (const text of [plain, light, playful]) {
      assert.match(text, /2 commits to push/)
      assert.match(text, /3 commits to pull/)
    }

    // Each language reads its own slider: serious English beside playful
    // Cantonese must not smear one band across both.
    const mixed = getRepositorySyncSummaryText(diverged, 'bilingual', {
      english: 1,
      cantonese: 5,
    })
    assert.equal(mixed.segments.length, 2)
    assert.equal(mixed.segments[0].locale, 'en')
    assert.equal(mixed.segments[1].locale, 'zh-HK')
    assert.equal(mixed.segments[0].text, plain)
    assert.equal(
      mixed.segments[1].text,
      '分咗岔喇，2 個 commit 要 push、3 個 commit 要 pull，快啲揀邊條路'
    )
  })

  it('produces an accessible name that reads as a sentence, not bare digits', () => {
    const diverged = getRepositorySyncSummary(repository, 'tracking', {
      ahead: 3,
      behind: 1,
    })

    const english = getRepositorySyncSummaryText(diverged, 'english', Plain)
    assert.equal(english.accessibleName, '3 commits to push, 1 commit to pull')
    assert.doesNotMatch(english.accessibleName, /·/)

    // Bilingual rows still get one language's sentence as the spoken name, so a
    // screen reader never reads a separator-joined pair of clauses.
    const bilingual = getRepositorySyncSummaryText(diverged, 'bilingual', Plain)
    assert.equal(bilingual.accessibleName, english.accessibleName)
    assert.equal(
      getRepositorySyncSummaryText(diverged, 'cantonese', Plain).accessibleName,
      '3 個 commit 要 push，1 個 commit 要 pull'
    )
  })

  it('keeps every sync string complete and distinct in both catalogs', () => {
    const keys = Object.keys(englishTranslations)
      .filter(key => key.startsWith('repositorySync.'))
      .sort()

    assert.deepEqual(
      keys,
      Object.keys(cantoneseTranslations)
        .filter(key => key.startsWith('repositorySync.'))
        .sort()
    )
    // 10 states × 3 funny bands + the two commit-count phrases.
    assert.equal(keys.length, 32)

    for (const key of keys) {
      const typed = key as TranslationKey
      assert.equal(typeof englishTranslations[typed], 'string', key)
      assert.equal(typeof cantoneseTranslations[typed], 'string', key)
      assert.notEqual(englishTranslations[typed], '', key)
      assert.notEqual(cantoneseTranslations[typed], '', key)
      assert.notEqual(
        englishTranslations[typed],
        cantoneseTranslations[typed],
        key
      )
    }
  })

  it('derives the line without any Git, network, or dispatcher access', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'ui',
        'repositories-list',
        'repository-sync-summary.ts'
      ),
      'utf8'
    )

    assert.doesNotMatch(source, /from '.*\/lib\/git/)
    assert.doesNotMatch(source, /\bfetch\s*\(/)
    assert.doesNotMatch(source, /\bDispatcher\b/)
    assert.doesNotMatch(source, /\bapi\b/i)
  })
})

describe('repository list sync summary styles', () => {
  const style = readFileSync(
    join(process.cwd(), 'app', 'styles', 'ui', '_repository-list.scss'),
    'utf8'
  )

  it('renders low-emphasis secondary text that ellipsizes instead of clipping', () => {
    assert.match(
      style,
      /\.repository-sync-summary \{[\s\S]*?@include ellipsis;[\s\S]*?color: var\(--md-sys-color-on-surface-variant\);[\s\S]*?font-size: var\(--font-size-sm\);/
    )
    assert.match(
      style,
      /\.repository-list-item-text \{[\s\S]*?flex-direction: column;[\s\S]*?flex: 0 1 auto;[\s\S]*?min-width: 0;/
    )
  })

  it('keeps the two-line stack inside the virtualized row heights', () => {
    // Comfortable rows are 54px = 2×10px padding + a 34px icon chip, and the
    // stack (1.3em name + 1.2em summary) must stay inside that chip. Compact
    // rows are 38px, which is why their padding tightened to 3px.
    assert.match(style, /\.name \{[\s\S]*?line-height: 1\.3;/)
    assert.match(
      style,
      /density='compact'\][\s\S]*?\.repository-list-item \{[\s\S]*?padding-block: 3px;[\s\S]*?\.repository-sync-summary \{[\s\S]*?font-size: 11px;/
    )
  })
})
