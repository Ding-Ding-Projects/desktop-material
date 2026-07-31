import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require_ = createRequire(import.meta.url)

interface IGalleryItem {
  readonly file: string
  readonly output: string | null
  readonly caption: string | null
  readonly altText: string | null
  readonly scene: string | null
  readonly batch: string | null
  readonly platform: string | null
  readonly section: string | null
  readonly interaction: string | null
  readonly width: number | null
  readonly height: number | null
  readonly bytes: number | null
  readonly sha256: string | null
  readonly commands: ReadonlyArray<string>
  readonly receipts: ReadonlyArray<string>
}

interface IQueryError {
  readonly code: string
  readonly detail: string
}

interface ICompiledQuery {
  readonly mode: 'text' | 'regex'
  readonly query: string
  readonly pattern: string
  readonly flags: string
  readonly active: boolean
  readonly error: IQueryError | null
  readonly limit: number
}

interface IFilters {
  readonly batch: string
  readonly platform: string
  readonly receipt: 'any' | 'with' | 'without'
}

interface ISearchState {
  readonly query?: string
  readonly mode?: string
  readonly regex?: boolean
  readonly flags?: string
  readonly caseSensitive?: boolean
  readonly filters?: Partial<IFilters>
  readonly outcome?: {
    readonly status: 'pending' | 'ready' | 'error'
    readonly matched?: Record<number, boolean>
    readonly code?: string
    readonly detail?: string
  } | null
}

interface IFilterResult {
  readonly items: ReadonlyArray<IGalleryItem>
  readonly visible: number
  readonly total: number
  readonly passedFilters: number
  readonly mode: 'text' | 'regex'
  readonly query: string
  readonly flags: string
  readonly active: boolean
  readonly limit: number
  readonly error: IQueryError | null
  readonly failedOpen: boolean
  readonly pending: boolean
  readonly timedOut: boolean
  readonly evaluatedBy: string
  readonly filters: IFilters
  readonly filtersActive: boolean
}

interface INeighbours {
  readonly index: number
  readonly count: number
  readonly current: IGalleryItem | null
  readonly previous: IGalleryItem | null
  readonly next: IGalleryItem | null
  readonly first: IGalleryItem | null
  readonly last: IGalleryItem | null
}

interface IGalleryApi {
  stringKeys: ReadonlyArray<string>
  limits: {
    readonly pattern: number
    readonly query: number
    readonly field: number
    readonly budgetMilliseconds: number
    readonly workerHits: number
  }
  create: unknown
  createSingle: unknown
  openLightbox: unknown
  copyText: unknown
  normalizeItem(raw: unknown): IGalleryItem
  normalizeItems(list: unknown): ReadonlyArray<IGalleryItem>
  coverage(item: unknown): {
    readonly hasCaption: boolean
    readonly hasAltText: boolean
    readonly hasDimensions: boolean
    readonly hasBytes: boolean
    readonly hasCommands: boolean
    readonly hasReceipts: boolean
    readonly receiptCount: number
    readonly gaps: ReadonlyArray<string>
  }
  searchFields(item: unknown): {
    readonly name: string
    readonly provenance: string
    readonly description: string
  }
  searchCatalog(items: unknown): ReadonlyArray<ReadonlyArray<string>>
  searchText(item: unknown): string
  compileQuery(state: ISearchState): ICompiledQuery
  matchesQuery(item: unknown, compiled: ICompiledQuery): boolean
  matchesText(item: unknown, needle: string): boolean
  matchesFilters(item: unknown, filters: unknown): boolean
  normalizeFilters(raw: unknown): IFilters
  facets(items: unknown): {
    readonly batches: ReadonlyArray<{
      readonly id: string
      readonly count: number
    }>
    readonly platforms: ReadonlyArray<{
      readonly id: string
      readonly count: number
    }>
    readonly receipts: { readonly with: number; readonly without: number }
    readonly unrecorded: { readonly batch: number; readonly platform: number }
    readonly total: number
  }
  filterItems(
    items: unknown,
    state: ISearchState,
    options?: { clock?: () => number; budgetMilliseconds?: number }
  ): IFilterResult
  neighbours(items: unknown, file: string): INeighbours
  resolveGridMove(
    count: number,
    index: number,
    direction: string,
    columns: number
  ): number
  missingStrings(strings: unknown): ReadonlyArray<string>
  labelFor(
    strings: unknown
  ): (key: string, values?: Record<string, unknown>) => string
}

const Gallery: IGalleryApi = require_(
  join(process.cwd(), 'docs', 'assets', 'site', 'docs-screenshot-gallery.js')
)

/**
 * A miniature stand-in for the real inventory, using the same field names the
 * survey produced. Values are shaped like the real ones (batch ids, scene ids,
 * receipt paths) so the predicates are exercised against realistic text.
 */
const Fixture = Gallery.normalizeItems([
  {
    file: 'material-welcome.png',
    caption: 'Material welcome surface with the sign-in choices',
    altText: 'Welcome pane offering sign in and skip',
    scene: 'welcome',
    batch: 'windows-canonical-cdp',
    platform: 'windows-headless',
    width: 1440,
    height: 960,
    bytes: 120842,
    commands: [
      'node .codex/verification/capture_gallery_cdp.js --scene welcome',
    ],
    receipts: [],
  },
  {
    file: 'cheap-lfs-commit-progress.png',
    caption: 'Large-file commit progress with a per-file breakdown',
    altText: 'Commit progress list for prepared large files',
    scene: 'wide-commit-progress',
    batch: 'windows-cheap-lfs-commit',
    platform: 'windows-headless',
    width: 1440,
    height: 960,
    bytes: 113869,
    commands: ['yarn capture:cheap-lfs-commit'],
    receipts: ['docs/verification/2026-07-24-cheap-lfs-commit.txt'],
  },
  {
    file: 'auto-updater-current-source-ready.png',
    caption: 'Updater reporting a downloaded build ready to install',
    altText: 'Update-ready banner naming the installed source',
    scene: 'current-source-installed-update-ready',
    batch: 'windows-updater-lowlevel',
    platform: 'windows-headless',
    width: 960,
    height: 660,
    bytes: 47086,
    commands: [],
    receipts: [
      'docs/verification/2026-07-22-updater.txt',
      'docs/verification/2026-07-26-updater.txt',
    ],
  },
  {
    file: 'linux-tui-overview.png',
    // Deliberately no caption and no dimensions: the module must be able to
    // report an absence rather than have one invented for it.
    scene: null,
    batch: null,
    platform: 'linux-xvfb',
    commands: [],
    receipts: [],
  },
])

function files(items: ReadonlyArray<IGalleryItem>): ReadonlyArray<string> {
  return items.map(item => item.file)
}

describe('documentation-site screenshot gallery — pure logic', () => {
  it('keeps only records it can render and never invents a missing fact', () => {
    assert.equal(Fixture.length, 4)
    // A record with no file name cannot be an image or a link.
    assert.equal(Gallery.normalizeItems([{ caption: 'orphan' }]).length, 0)

    const bare = Fixture[3]
    assert.equal(bare.caption, null)
    assert.equal(bare.width, null)
    assert.equal(bare.height, null)
    assert.deepEqual(bare.commands, [])
    assert.deepEqual(bare.receipts, [])
    // The output id is derived from the file name, not guessed at.
    assert.equal(bare.output, 'linux-tui-overview')

    const gaps = Gallery.coverage(bare).gaps
    assert.ok(gaps.indexOf('caption') !== -1, 'caption gap must be reported')
    assert.ok(
      gaps.indexOf('dimensions') !== -1,
      'dimension gap must be reported'
    )
    assert.ok(gaps.indexOf('receipts') !== -1, 'receipt gap must be reported')
    assert.equal(Gallery.coverage(Fixture[1]).hasReceipts, true)
    assert.equal(Gallery.coverage(Fixture[2]).receiptCount, 2)
  })

  it('defaults to plain text and matches substrings case-insensitively', () => {
    const compiled = Gallery.compileQuery({ query: 'WELCOME' })
    assert.equal(compiled.mode, 'text', 'text must be the default mode')

    const upper = Gallery.filterItems(Fixture, { query: 'WELCOME' })
    assert.deepEqual(files(upper.items), ['material-welcome.png'])
    const lower = Gallery.filterItems(Fixture, { query: 'welcome' })
    assert.deepEqual(files(lower.items), ['material-welcome.png'])
    const mixed = Gallery.filterItems(Fixture, { query: 'WeLcOmE' })
    assert.deepEqual(files(mixed.items), ['material-welcome.png'])

    // Captions, scenes and batches are all searched, not only file names.
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, { query: 'per-file breakdown' }).items
      ),
      ['cheap-lfs-commit-progress.png']
    )
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, { query: 'wide-commit-progress' }).items
      ),
      ['cheap-lfs-commit-progress.png']
    )
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, { query: 'windows-updater-lowlevel' })
          .items
      ),
      ['auto-updater-current-source-ready.png']
    )

    // An empty query is not a filter: everything stays reachable.
    const empty = Gallery.filterItems(Fixture, { query: '   ' })
    assert.equal(empty.visible, Fixture.length)
    assert.equal(empty.active, false)
  })

  it('treats regex metacharacters literally until regex is enabled', () => {
    // `.` as a literal matches the ".png" in every file name...
    const literalDot = Gallery.filterItems(Fixture, { query: 'welcome.png' })
    assert.deepEqual(files(literalDot.items), ['material-welcome.png'])

    // ...and an anchored pattern is just text nobody wrote, so it matches none.
    const anchored = '^material-welcome$'
    const asText = Gallery.filterItems(Fixture, { query: anchored })
    assert.equal(asText.mode, 'text')
    assert.equal(asText.visible, 0)
    assert.equal(asText.error, null)

    // Only an explicit opt-in makes it a pattern. Both spellings work.
    const asRegex = Gallery.filterItems(Fixture, {
      query: 'material-welcome',
      mode: 'regex',
    })
    assert.deepEqual(files(asRegex.items), ['material-welcome.png'])
    assert.equal(asRegex.mode, 'regex')

    const viaFlag = Gallery.filterItems(Fixture, {
      query: 'cheap.lfs.commit',
      regex: true,
    })
    assert.deepEqual(files(viaFlag.items), ['cheap-lfs-commit-progress.png'])

    // The same pattern read as text finds nothing, proving the opt-in gates it.
    const sameAsText = Gallery.filterItems(Fixture, {
      query: 'cheap.lfs.commit',
    })
    assert.equal(sameAsText.visible, 0)

    // Regex mode is case-insensitive by default and honours explicit flags.
    assert.equal(
      Gallery.filterItems(Fixture, { query: 'WELCOME', mode: 'regex' }).visible,
      1
    )
    assert.equal(
      Gallery.filterItems(Fixture, {
        query: 'WELCOME',
        mode: 'regex',
        flags: '',
      }).visible,
      0
    )
  })

  it('fails open on an invalid pattern: every screenshot plus an error', () => {
    for (const pattern of ['(', '[a-', 'a{2,1}', '\\', '(?<']) {
      const result = Gallery.filterItems(Fixture, {
        query: pattern,
        mode: 'regex',
      })
      assert.equal(
        result.visible,
        Fixture.length,
        `${pattern} must keep every screenshot reachable`
      )
      assert.equal(result.total, Fixture.length)
      assert.notEqual(result.error, null, `${pattern} must report an error`)
      assert.equal(result.error?.code, 'invalid')
      assert.equal(result.failedOpen, true)
    }

    // An unsupported or repeated flag is refused the same way.
    const badFlags = Gallery.filterItems(Fixture, {
      query: 'welcome',
      mode: 'regex',
      flags: 'ii',
    })
    assert.equal(badFlags.error?.code, 'bad-flags')
    assert.equal(badFlags.visible, Fixture.length)

    // Fail-open never means "ignore the filters" — only "ignore the query".
    const withFilter = Gallery.filterItems(Fixture, {
      query: '(',
      mode: 'regex',
      filters: { platform: 'linux-xvfb' },
    })
    assert.equal(withFilter.error?.code, 'invalid')
    assert.deepEqual(files(withFilter.items), ['linux-tui-overview.png'])
  })

  it('refuses an over-long pattern by the bound instead of compiling it', () => {
    const limit = Gallery.limits.pattern
    assert.ok(limit > 0 && limit <= 512, `bound should be sane, got ${limit}`)

    const atLimit = 'a'.repeat(limit)
    const overLimit = 'a'.repeat(limit + 1)

    const accepted = Gallery.compileQuery({ query: atLimit, mode: 'regex' })
    assert.equal(accepted.error, null, 'a pattern at the bound is accepted')

    const refused = Gallery.filterItems(Fixture, {
      query: overLimit,
      mode: 'regex',
    })
    assert.equal(refused.error?.code, 'too-long-pattern')
    assert.equal(refused.limit, limit)
    // Refused, and still fail-open: the gallery is never blanked.
    assert.equal(refused.visible, Fixture.length)

    // Plain text has its own, looser bound and its own code.
    const longText = Gallery.filterItems(Fixture, {
      query: 'b'.repeat(Gallery.limits.query + 1),
    })
    assert.equal(longText.error?.code, 'too-long-query')
    assert.equal(longText.visible, Fixture.length)
  })

  it('abandons a runaway evaluation on the clock and still fails open', () => {
    // A clock that jumps past the budget on its second reading stands in for a
    // pattern that is chewing through the list.
    let reading = 0
    const clock = () => {
      reading++
      return reading === 1 ? 0 : 10000
    }
    const result = Gallery.filterItems(
      Fixture,
      { query: 'material', mode: 'regex' },
      { clock, budgetMilliseconds: 5 }
    )
    assert.equal(result.timedOut, true)
    assert.equal(result.error?.code, 'timeout')
    assert.equal(result.failedOpen, true)
    assert.equal(
      result.visible,
      Fixture.length,
      'an abandoned evaluation keeps every screenshot reachable'
    )
  })

  it('composes filters with the search rather than overriding it', () => {
    // The batch filter alone.
    const batchOnly = Gallery.filterItems(Fixture, {
      filters: { batch: 'windows-canonical-cdp' },
    })
    assert.deepEqual(files(batchOnly.items), ['material-welcome.png'])
    assert.equal(batchOnly.filtersActive, true)

    // The search alone finds two windows-headless captures.
    const searchOnly = Gallery.filterItems(Fixture, { query: 'progress' })
    assert.deepEqual(files(searchOnly.items), ['cheap-lfs-commit-progress.png'])

    // Together they intersect: a query that matches an item the filter excludes
    // yields nothing, and neither input is discarded.
    const conflicting = Gallery.filterItems(Fixture, {
      query: 'welcome',
      filters: { batch: 'windows-cheap-lfs-commit' },
    })
    assert.equal(conflicting.visible, 0)
    assert.equal(conflicting.passedFilters, 1, 'the filter still matched one')
    assert.equal(conflicting.error, null)

    const agreeing = Gallery.filterItems(Fixture, {
      query: 'welcome',
      filters: { batch: 'windows-canonical-cdp' },
    })
    assert.deepEqual(files(agreeing.items), ['material-welcome.png'])

    // Platform composes the same way, including for the non-Windows capture.
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, { filters: { platform: 'linux-xvfb' } })
          .items
      ),
      ['linux-tui-overview.png']
    )
    assert.equal(
      Gallery.filterItems(Fixture, {
        query: 'welcome',
        filters: { platform: 'linux-xvfb' },
      }).visible,
      0
    )

    // Receipt presence composes too, and it is about receipts, not captions.
    const withReceipts = Gallery.filterItems(Fixture, {
      filters: { receipt: 'with' },
    })
    assert.deepEqual(files(withReceipts.items), [
      'cheap-lfs-commit-progress.png',
      'auto-updater-current-source-ready.png',
    ])
    const withoutReceipts = Gallery.filterItems(Fixture, {
      filters: { receipt: 'without' },
    })
    assert.deepEqual(files(withoutReceipts.items), [
      'material-welcome.png',
      'linux-tui-overview.png',
    ])
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, {
          query: 'commit',
          filters: { receipt: 'with' },
        }).items
      ),
      ['cheap-lfs-commit-progress.png']
    )

    // Regex composes with filters exactly as plain text does.
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, {
          query: '^(material|cheap)',
          mode: 'regex',
          filters: { receipt: 'with' },
        }).items
      ),
      ['cheap-lfs-commit-progress.png']
    )

    // The reserved `unrecorded` value finds the captures whose batch is
    // genuinely absent — otherwise the retained historical frames would be
    // findable nowhere but "all".
    assert.deepEqual(
      files(
        Gallery.filterItems(Fixture, { filters: { batch: 'unrecorded' } }).items
      ),
      ['linux-tui-overview.png']
    )
    assert.equal(
      Gallery.filterItems(Fixture, {
        query: 'welcome',
        filters: { batch: 'unrecorded' },
      }).visible,
      0,
      'unrecorded still composes with the query'
    )

    // An unknown filter value narrows to nothing rather than being ignored,
    // and an absent one normalizes back to "all".
    assert.equal(
      Gallery.filterItems(Fixture, { filters: { batch: 'no-such-batch' } })
        .visible,
      0
    )
    const normalized = Gallery.normalizeFilters({ receipt: 'nonsense' })
    assert.deepEqual(normalized, {
      batch: 'all',
      platform: 'all',
      receipt: 'any',
    })
  })

  it('accepts a worker-computed membership answer and its failures', () => {
    const ready = Gallery.filterItems(Fixture, {
      query: 'anything',
      mode: 'regex',
      outcome: { status: 'ready', matched: { 0: true, 2: true } },
    })
    assert.deepEqual(files(ready.items), [
      'material-welcome.png',
      'auto-updater-current-source-ready.png',
    ])
    assert.equal(ready.evaluatedBy, 'worker')

    const pending = Gallery.filterItems(Fixture, {
      query: 'anything',
      mode: 'regex',
      outcome: { status: 'pending' },
    })
    assert.equal(pending.pending, true)
    assert.equal(pending.visible, Fixture.length)

    const failed = Gallery.filterItems(Fixture, {
      query: 'anything',
      mode: 'regex',
      outcome: { status: 'error', code: 'timeout', detail: '' },
    })
    assert.equal(failed.error?.code, 'timeout')
    assert.equal(failed.failedOpen, true)
    assert.equal(failed.visible, Fixture.length)

    // The catalog handed to that worker keeps the shared three-field shape.
    const catalog = Gallery.searchCatalog(Fixture)
    assert.equal(catalog.length, Fixture.length)
    for (const row of catalog) {
      assert.equal(row.length, 3)
      for (const field of row) {
        assert.equal(typeof field, 'string')
        assert.ok(
          field.length <= Gallery.limits.field,
          'every searched field is truncated to the bound'
        )
      }
    }
    assert.ok(catalog[0][0].indexOf('material-welcome.png') !== -1)
  })

  it('wraps prev/next at both ends of the list', () => {
    const first = Gallery.neighbours(Fixture, 'material-welcome.png')
    assert.equal(first.index, 0)
    assert.equal(first.count, 4)
    assert.equal(first.next?.file, 'cheap-lfs-commit-progress.png')
    // Previous from the first wraps to the last, so there is no dead stop.
    assert.equal(first.previous?.file, 'linux-tui-overview.png')

    const last = Gallery.neighbours(Fixture, 'linux-tui-overview.png')
    assert.equal(last.index, 3)
    assert.equal(last.previous?.file, 'auto-updater-current-source-ready.png')
    assert.equal(last.next?.file, 'material-welcome.png')

    const middle = Gallery.neighbours(Fixture, 'cheap-lfs-commit-progress.png')
    assert.equal(middle.previous?.file, 'material-welcome.png')
    assert.equal(middle.next?.file, 'auto-updater-current-source-ready.png')
    assert.equal(middle.first?.file, 'material-welcome.png')
    assert.equal(middle.last?.file, 'linux-tui-overview.png')

    // A single-item list reports itself in both directions; an unknown file and
    // an empty list report no neighbours instead of a bogus one.
    const alone = Gallery.neighbours([Fixture[0]], 'material-welcome.png')
    assert.equal(alone.previous?.file, 'material-welcome.png')
    assert.equal(alone.next?.file, 'material-welcome.png')

    const missing = Gallery.neighbours(Fixture, 'not-a-capture.png')
    assert.equal(missing.index, -1)
    assert.equal(missing.previous, null)
    assert.equal(missing.next, null)

    const none = Gallery.neighbours([], 'material-welcome.png')
    assert.equal(none.index, -1)
    assert.equal(none.count, 0)
    assert.equal(none.first, null)
  })

  it('moves around the grid in reading order without escaping it', () => {
    // 9 items, 3 columns.
    assert.equal(Gallery.resolveGridMove(9, 0, 'right', 3), 1)
    assert.equal(Gallery.resolveGridMove(9, 2, 'right', 3), 3)
    assert.equal(Gallery.resolveGridMove(9, 3, 'left', 3), 2)
    assert.equal(Gallery.resolveGridMove(9, 4, 'down', 3), 7)
    assert.equal(Gallery.resolveGridMove(9, 4, 'up', 3), 1)
    assert.equal(Gallery.resolveGridMove(9, 0, 'last', 3), 8)
    assert.equal(Gallery.resolveGridMove(9, 8, 'first', 3), 0)

    // Up from the top row keeps the column rather than jumping to item 0.
    assert.equal(Gallery.resolveGridMove(9, 1, 'up', 3), 1)
    // Down from a partial last row lands on the final item, not past the end.
    assert.equal(Gallery.resolveGridMove(8, 6, 'down', 3), 7)
    assert.equal(Gallery.resolveGridMove(9, 8, 'right', 3), 8)
    assert.equal(Gallery.resolveGridMove(9, 0, 'left', 3), 0)
    // An empty grid has nowhere to move to.
    assert.equal(Gallery.resolveGridMove(0, 0, 'right', 3), -1)
    // An unknown key is a no-op, not a jump.
    assert.equal(Gallery.resolveGridMove(9, 4, 'sideways', 3), 4)
  })

  it('reports every filter value present in the data, with counts', () => {
    const data = Gallery.facets(Fixture)
    assert.equal(data.total, 4)
    assert.deepEqual(
      data.batches.map(entry => entry.id),
      [
        'windows-canonical-cdp',
        'windows-cheap-lfs-commit',
        'windows-updater-lowlevel',
      ]
    )
    assert.deepEqual(
      data.platforms.map(entry => entry.id),
      ['linux-xvfb', 'windows-headless']
    )
    assert.equal(
      data.platforms.filter(entry => entry.id === 'windows-headless')[0].count,
      3
    )
    assert.deepEqual(data.receipts, { with: 2, without: 2 })
    // The record with no batch is counted as unrecorded, not silently dropped.
    assert.equal(data.unrecorded.batch, 1)
  })

  it('hardcodes no user-facing English and names any string it lacks', () => {
    // Every visible string arrives through the caller's table, so a missing key
    // must render as its bracketed name rather than as invented prose — nothing
    // this module renders may read as English the caller did not write.
    const empty = Gallery.labelFor({})
    for (const key of Gallery.stringKeys) {
      assert.equal(
        empty(key),
        '⟨' + key + '⟩',
        `${key} must render as its key when the caller supplies nothing`
      )
    }

    // Supplied copy is used verbatim, and `{token}` interpolation fills counts
    // without the module deciding any of the surrounding words.
    const supplied = Gallery.labelFor({
      count: '睇到 {visible} 張，總共 {total} 張',
      empty: 'Nothing matched',
    })
    assert.equal(
      supplied('count', { visible: 3, total: 92 }),
      '睇到 3 張，總共 92 張'
    )
    assert.equal(supplied('empty'), 'Nothing matched')
    // An unknown token is left alone rather than blanked, so a mistyped
    // placeholder is visible instead of silently swallowing the number.
    assert.equal(
      supplied('count', { visible: 1 }),
      '睇到 1 張，總共 {total} 張'
    )

    assert.ok(Gallery.stringKeys.length > 0)
    assert.equal(Gallery.missingStrings({}).length, Gallery.stringKeys.length)
    const complete: Record<string, string> = {}
    for (const key of Gallery.stringKeys) {
      complete[key] = key
    }
    assert.deepEqual(Gallery.missingStrings(complete), [])
    // A blank string is a gap, not a translation.
    assert.deepEqual(Gallery.missingStrings({ ...complete, empty: '  ' }), [
      'empty',
    ])
  })

  it('exposes the DOM layer without touching the DOM when required', () => {
    // Requiring this module in Node must not need a document; the DOM work is
    // all inside functions the browser calls.
    for (const name of ['create', 'createSingle', 'openLightbox', 'copyText']) {
      assert.equal(
        typeof (Gallery as unknown as Record<string, unknown>)[name],
        'function',
        `${name} must be exported`
      )
    }
  })
})

// ============================================================== the DOM half

/**
 * The DOM layer is the half a reader actually touches, so it is exercised
 * against the harness's global jsdom rather than trusted because the pure
 * predicates pass. Every string the surface renders is a stub of the form
 * `S-<key>`, which is also how these tests prove that no English of the
 * module's own reaches the page.
 */

interface IGridInstance {
  readonly element: HTMLElement
  state(): {
    readonly query: string
    readonly mode: string
    readonly visible: number
    readonly total: number
    readonly skipped: number
  }
  setStrings(next: Record<string, string>): void
  setItems(next: ReadonlyArray<unknown>): void
  destroy(): void
}

interface ISingleInstance {
  readonly element: HTMLElement
  setStrings(next: Record<string, string>): void
  destroy(): void
}

type CreateGrid = (options: Record<string, unknown>) => IGridInstance
type CreateSingle = (options: Record<string, unknown>) => ISingleInstance

const createGrid = Gallery.create as CreateGrid
const createSingle = Gallery.createSingle as CreateSingle

/** A complete, deliberately non-English table keyed by the real string keys. */
function stubStrings(prefix: string): Record<string, string> {
  const table: Record<string, string> = {}
  for (const key of Gallery.stringKeys) {
    table[key] = `${prefix}-${key}`
  }
  return table
}

/**
 * The events must come from jsdom's own window. Node's global `Event` is a
 * different class and jsdom refuses to dispatch it.
 */
function view(): Window & typeof globalThis {
  return document.defaultView as Window & typeof globalThis
}

function fire(node: Element, type: string): void {
  node.dispatchEvent(new (view().Event)(type, { bubbles: true }))
}

function mouseDown(node: Element): void {
  node.dispatchEvent(new (view().MouseEvent)('mousedown', { bubbles: true }))
}

function press(node: Element | Document, key: string): void {
  node.dispatchEvent(
    new (view().KeyboardEvent)('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
  )
}

function mount(): HTMLElement {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

function cardFiles(host: HTMLElement): ReadonlyArray<string> {
  return Array.from(host.querySelectorAll('.dm-shot-cell')).map(
    cell => cell.getAttribute('data-file') as string
  )
}

function focusedFile(): string | null {
  const active = document.activeElement
  const cell = active === null ? null : active.closest('.dm-shot-cell')
  return cell === null ? null : cell.getAttribute('data-file')
}

describe('documentation-site screenshot gallery — DOM layer', () => {
  it('renders one card per record and never invents a command', () => {
    const host = mount()
    const grid = createGrid({
      container: host,
      items: Fixture,
      strings: stubStrings('S'),
      imageBase: '../assets/screenshots/',
    })
    try {
      assert.deepEqual(cardFiles(host), files(Fixture))

      // The dimensionless record must not acquire a width and height it has no
      // record of, while a recorded one carries its real intrinsic size.
      const welcome = host.querySelector(
        '[data-file="material-welcome.png"] .dm-shot-thumb'
      ) as HTMLImageElement
      assert.equal(welcome.getAttribute('width'), '1440')
      assert.equal(welcome.getAttribute('height'), '960')
      const bare = host.querySelector(
        '[data-file="linux-tui-overview.png"] .dm-shot-thumb'
      ) as HTMLImageElement
      assert.equal(bare.getAttribute('width'), null)
      assert.equal(bare.getAttribute('height'), null)

      // No caption on record renders the caller's placeholder, not blank prose.
      const bareCaption = host.querySelector(
        '[data-file="linux-tui-overview.png"] .dm-shot-card-caption'
      ) as HTMLElement
      assert.equal(bareCaption.textContent, 'S-noCaption')
      assert.ok(bareCaption.classList.contains('is-unrecorded'))

      // A record with no command disables the copy button and says so; one with
      // a command keeps it live.
      const withoutCommand = host.querySelectorAll(
        '[data-file="auto-updater-current-source-ready.png"] .dm-shot-action'
      )
      assert.equal(
        (withoutCommand[1] as HTMLButtonElement).disabled,
        true,
        'a screenshot with no recorded command must not offer to copy one'
      )
      assert.equal(withoutCommand[1].textContent, 'S-noCommand')
      const withCommand = host.querySelectorAll(
        '[data-file="material-welcome.png"] .dm-shot-action'
      )
      assert.equal((withCommand[1] as HTMLButtonElement).disabled, false)

      assert.equal(grid.state().total, Fixture.length)
      assert.equal(grid.state().visible, Fixture.length)
    } finally {
      grid.destroy()
    }
  })

  it('fails open in the surface, not only in the predicate', () => {
    const host = mount()
    const grid = createGrid({
      container: host,
      items: Fixture,
      strings: stubStrings('S'),
    })
    try {
      const input = host.querySelector(
        '.dm-shots-search-input'
      ) as HTMLInputElement
      const mode = host.querySelector(
        '.dm-shots-mode-input'
      ) as HTMLInputElement
      const error = host.querySelector('.dm-shots-error') as HTMLElement

      mode.checked = true
      fire(mode, 'change')
      input.value = 'material-('
      fire(input, 'change')

      // Every screenshot stays reachable, the field is marked invalid, and the
      // notice says both what failed and that nothing was hidden.
      assert.deepEqual(cardFiles(host), files(Fixture))
      assert.equal(error.hidden, false)
      assert.equal(error.textContent, 'S-errorInvalid S-errorFailOpen')
      assert.equal(input.getAttribute('aria-invalid'), 'true')

      // A usable pattern narrows the grid and clears the notice.
      input.value = '^material-welcome'
      fire(input, 'change')
      assert.deepEqual(cardFiles(host), ['material-welcome.png'])
      assert.equal(error.hidden, true)
      assert.equal(input.getAttribute('aria-invalid'), null)

      // Turning regex off makes the same pattern plain text, which matches
      // nothing: the honest empty state, not a hidden error.
      mode.checked = false
      fire(mode, 'change')
      assert.deepEqual(cardFiles(host), [])
      const empty = host.querySelector('.dm-shots-empty') as HTMLElement
      assert.equal(empty.hidden, false)
      assert.equal(empty.textContent, 'S-empty')
    } finally {
      grid.destroy()
    }
  })

  it('composes the filter controls with the query in the surface', () => {
    const host = mount()
    const grid = createGrid({
      container: host,
      items: Fixture,
      strings: stubStrings('S'),
    })
    try {
      const input = host.querySelector(
        '.dm-shots-search-input'
      ) as HTMLInputElement
      const selects = host.querySelectorAll('.dm-shots-filter-select')
      const batch = selects[0] as HTMLSelectElement

      // The options are the data's own values, plus the unrecorded group only
      // because one record genuinely lacks a batch.
      assert.deepEqual(
        Array.from(batch.options).map(option => option.value),
        [
          'all',
          'windows-canonical-cdp',
          'windows-cheap-lfs-commit',
          'windows-updater-lowlevel',
          'unrecorded',
        ]
      )

      batch.value = 'windows-canonical-cdp'
      fire(batch, 'change')
      assert.deepEqual(cardFiles(host), ['material-welcome.png'])

      // A query matching an excluded record does not override the filter.
      input.value = 'per-file breakdown'
      fire(input, 'change')
      assert.deepEqual(cardFiles(host), [])

      fire(host.querySelector('.dm-shots-filters-reset') as Element, 'click')
      input.value = ''
      fire(input, 'change')
      assert.deepEqual(cardFiles(host), files(Fixture))
    } finally {
      grid.destroy()
    }
  })

  it('moves focus around the grid with the arrow keys', () => {
    const host = mount()
    const grid = createGrid({
      container: host,
      items: Fixture,
      strings: stubStrings('S'),
    })
    try {
      const first = host.querySelector('.dm-shot-card') as HTMLAnchorElement
      first.focus()
      assert.equal(focusedFile(), 'material-welcome.png')

      press(document.activeElement as Element, 'ArrowRight')
      assert.equal(focusedFile(), 'cheap-lfs-commit-progress.png')

      press(document.activeElement as Element, 'End')
      assert.equal(focusedFile(), 'linux-tui-overview.png')

      press(document.activeElement as Element, 'Home')
      assert.equal(focusedFile(), 'material-welcome.png')

      // Left from the first card has nowhere to go and must not escape.
      press(document.activeElement as Element, 'ArrowLeft')
      assert.equal(focusedFile(), 'material-welcome.png')
    } finally {
      grid.destroy()
    }
  })

  it('traps focus in the lightbox and returns it to the opener', () => {
    const host = mount()
    const grid = createGrid({
      container: host,
      items: Fixture,
      strings: stubStrings('S'),
    })
    try {
      const zoom = host.querySelector(
        '[data-file="material-welcome.png"] .dm-shot-action'
      ) as HTMLButtonElement
      zoom.focus()
      fire(zoom, 'click')

      const overlay = document.querySelector('.dm-shot-lightbox') as HTMLElement
      const dialog = overlay.querySelector(
        '.dm-shot-lightbox-dialog'
      ) as HTMLElement
      assert.equal(dialog.getAttribute('role'), 'dialog')
      assert.equal(dialog.getAttribute('aria-modal'), 'true')
      assert.ok(dialog.getAttribute('aria-labelledby'))
      assert.equal(
        document.activeElement,
        overlay.querySelector('.dm-shot-lightbox-close'),
        'the lightbox must take focus when it opens'
      )

      // Zoom is a two-state toggle that reports which state it is in.
      const zoomToggle = overlay.querySelector(
        '.dm-shot-lightbox-zoom'
      ) as HTMLButtonElement
      assert.equal(zoomToggle.getAttribute('aria-pressed'), 'false')
      fire(zoomToggle, 'click')
      assert.equal(zoomToggle.getAttribute('aria-pressed'), 'true')

      // Tab cannot leave the dialog, and a mousedown inside it is no dismissal.
      press(document.activeElement as Element, 'Tab')
      assert.ok(dialog.contains(document.activeElement))
      mouseDown(dialog)
      assert.notEqual(document.querySelector('.dm-shot-lightbox'), null)

      press(document.body, 'Escape')
      assert.equal(document.querySelector('.dm-shot-lightbox'), null)
      assert.equal(
        document.activeElement,
        zoom,
        'focus must return to the button that opened the lightbox'
      )

      // The backdrop itself does dismiss.
      fire(zoom, 'click')
      mouseDown(document.querySelector('.dm-shot-lightbox') as HTMLElement)
      assert.equal(document.querySelector('.dm-shot-lightbox'), null)
    } finally {
      grid.destroy()
    }
  })

  it('walks prev/next on a single page and stands down while typing', () => {
    const host = mount()
    const visited: Array<string> = []
    const single = createSingle({
      container: host,
      items: Fixture,
      item: Fixture[1],
      strings: stubStrings('S'),
      imageBase: '../assets/screenshots/',
      onNavigate: (target: IGalleryItem) => visited.push(target.file),
    })
    try {
      const hero = host.querySelector('.dm-shot-hero-image') as HTMLImageElement
      assert.equal(
        hero.getAttribute('src'),
        '../assets/screenshots/cheap-lfs-commit-progress.png'
      )
      assert.equal(hero.getAttribute('width'), '1440')

      press(document.body, 'ArrowRight')
      press(document.body, 'ArrowLeft')
      press(document.body, ']')
      assert.deepEqual(visited, [
        'auto-updater-current-source-ready.png',
        'material-welcome.png',
        'auto-updater-current-source-ready.png',
      ])

      // A reader typing a pattern keeps their arrow keys.
      const field = document.createElement('input')
      document.body.appendChild(field)
      field.focus()
      press(field, 'ArrowRight')
      assert.equal(visited.length, 3)
    } finally {
      single.destroy()
    }

    // Destroying unhooks the document listener rather than leaving it bound.
    press(document.body, 'ArrowRight')
    assert.equal(visited.length, 3)
  })

  it('repaints every caller-supplied word when the language changes', () => {
    const host = mount()
    const single = createSingle({
      container: host,
      items: Fixture,
      // The record with no caption, no scene and no receipts, so the
      // placeholders are on screen and have to move language too.
      item: Fixture[3],
      strings: stubStrings('S'),
    })
    try {
      const terms = () =>
        Array.from(host.querySelectorAll('.dm-shot-meta-term')).map(
          node => node.textContent as string
        )
      const placeholders = () =>
        Array.from(host.querySelectorAll('.dm-shot-meta-value.is-unrecorded'))
          .map(node => node.textContent as string)
          .join(' ')
      const gaps = host.querySelector('.dm-shot-gaps') as HTMLElement

      assert.ok(terms().indexOf('S-metaFile') !== -1)
      assert.ok(placeholders().indexOf('S-unrecorded') !== -1)
      assert.equal(gaps.hidden, false)
      assert.equal(gaps.textContent, 'S-metaGaps')

      single.setStrings(stubStrings('Y'))

      // A language change must not leave the facts table in the previous
      // language beside buttons in the current one.
      assert.equal(
        terms().filter(text => text.startsWith('S-')).length,
        0,
        'no facts-table term may keep the previous language'
      )
      assert.ok(terms().indexOf('Y-metaFile') !== -1)
      assert.equal(placeholders().indexOf('S-'), -1)
      assert.ok(placeholders().indexOf('Y-unrecorded') !== -1)
      assert.equal(gaps.textContent, 'Y-metaGaps')

      // The record's own values are never relabelled: a file name is data.
      const values = Array.from(
        host.querySelectorAll('.dm-shot-meta-value')
      ).map(node => node.textContent)
      assert.ok(
        values.indexOf('linux-tui-overview.png') !== -1,
        'a recorded value must survive a language change unchanged'
      )
    } finally {
      single.destroy()
    }
  })

  it('keeps the cards a reader is pressing alive across a repeat render', () => {
    // A browser fires `change` on a search field when it loses focus after
    // being edited — which is the very mousedown that puts the reader on a
    // card. Rebuilding the grid then detaches the button between mousedown and
    // mouseup and the click never arrives, so the gallery's primary gesture
    // (search, then open a result) silently does nothing.
    const host = mount()
    const grid = createGrid({
      container: host,
      items: Fixture,
      strings: stubStrings('S'),
    })
    try {
      const input = host.querySelector(
        '.dm-shots-search-input'
      ) as HTMLInputElement
      const firstCell = host.querySelector('.dm-shot-cell') as HTMLElement

      // An unchanged render is a no-op: reselecting the same filter value must
      // not swap the node under the reader's finger.
      const select = host.querySelector(
        '.dm-shots-filter-select'
      ) as HTMLSelectElement
      select.value = 'all'
      fire(select, 'change')
      assert.equal(host.querySelector('.dm-shot-cell'), firstCell)

      input.value = 'material'
      fire(input, 'input')
      const afterInput = host.querySelector('.dm-shot-cell') as HTMLElement
      fire(input, 'change')
      assert.equal(
        host.querySelector('.dm-shot-cell'),
        afterInput,
        'a change carrying the value `input` already recorded must not rebuild'
      )

      // The card still works after those renders, which is the whole point.
      const zoom = afterInput.querySelector(
        '.dm-shot-action'
      ) as HTMLButtonElement
      fire(zoom, 'click')
      const overlay = document.querySelector('.dm-shot-lightbox') as HTMLElement
      assert.notEqual(overlay, null, 'the card must still open its lightbox')

      // A backdrop dismissal must suppress the mousedown default, because that
      // default moves focus to the body and would undo the focus return.
      const backdrop = new (view().MouseEvent)('mousedown', {
        bubbles: true,
        cancelable: true,
      })
      overlay.dispatchEvent(backdrop)
      assert.equal(
        backdrop.defaultPrevented,
        true,
        'the backdrop mousedown must be prevented so focus can return'
      )
      assert.equal(document.querySelector('.dm-shot-lightbox'), null)
      assert.equal(
        document.activeElement,
        zoom,
        'a backdrop dismissal must return focus to the opening button'
      )

      // A genuine change the `input` handler never saw is still honoured.
      input.value = 'linux'
      fire(input, 'change')
      assert.deepEqual(cardFiles(host), ['linux-tui-overview.png'])

      // New records reusing the same file names still repaint their facts.
      const relabelled = Fixture.filter(
        item => item.file === 'linux-tui-overview.png'
      ).map(item => ({ ...item, caption: 'a freshly recorded caption' }))
      grid.setItems(relabelled)
      assert.equal(
        (host.querySelector('.dm-shot-card-caption') as HTMLElement)
          .textContent,
        'a freshly recorded caption',
        'the same file name with new facts must still rebuild its card'
      )
    } finally {
      grid.destroy()
    }
  })
})
