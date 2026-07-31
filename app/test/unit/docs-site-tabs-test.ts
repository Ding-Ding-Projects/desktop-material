import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require_ = createRequire(import.meta.url)

interface IMatchSpec {
  readonly query?: string
  readonly regex?: unknown
  readonly flags?: string
  readonly caseSensitive?: boolean
}

interface IMatcher {
  readonly ok: boolean
  readonly mode: 'plain' | 'regex'
  readonly code: string
  readonly detail: string
  readonly flags: string
  test(value: string): boolean
}

interface IMatchResult {
  readonly ok: boolean
  readonly evaluated: boolean
  readonly mode: 'plain' | 'regex'
  readonly code: string
  readonly detail: string
  readonly hits: ReadonlyArray<number>
  readonly total: number
}

interface IEntry {
  readonly tabId: string
  readonly label: string
  readonly title: string
  readonly stripId: string
  readonly stripLabel: string
  readonly groupId: string | null
  readonly groupName: string
  readonly pinned: boolean
  readonly position: number
}

interface IGroupEntry {
  readonly groupId: string
  readonly name: string
  readonly label: string
  readonly collapsed: boolean
  readonly memberCount: number
  readonly stripId: string
}

interface IPlan {
  readonly mode: string
  readonly matchMode: string
  readonly includePinned: boolean
  readonly runnable: boolean
  readonly code: string
  readonly matched: ReadonlyArray<IEntry>
  readonly affected: ReadonlyArray<IEntry>
  readonly protectedPinned: ReadonlyArray<IEntry>
  readonly count: number
  readonly total: number
}

interface ISearchState {
  id: string
  query: string
  regex: boolean
  flags: string
  caseSensitive: boolean
  status: string
  code: string
  detail: string
  filtered: boolean
  results: ReadonlyArray<unknown>
  total: number
}

interface IGroup {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly collapsed: boolean
  readonly members: ReadonlyArray<string>
}

interface IState {
  readonly version: number
  readonly order: ReadonlyArray<string>
  readonly pinned: ReadonlyArray<string>
  readonly hidden: ReadonlyArray<string>
  readonly groups: ReadonlyArray<IGroup>
}

interface ILayout {
  readonly pinned: ReadonlyArray<string>
  readonly sections: ReadonlyArray<{
    readonly groupId: string | null
    readonly group: IGroup | null
    readonly tabs: ReadonlyArray<string>
  }>
  readonly hidden: ReadonlyArray<string>
}

interface ITab {
  readonly id: string
  readonly label: string
  readonly title?: string
}

interface IStripModel {
  readonly id: string
  readonly label: string
  readonly state: IState
  readonly tabs: ReadonlyArray<ITab>
}

interface ILogic {
  compileMatcher(spec: IMatchSpec): IMatcher
  visibleStrings(entry: unknown): ReadonlyArray<string>
  nameStrings(group: unknown): ReadonlyArray<string>
  matchList(
    list: ReadonlyArray<unknown>,
    spec: IMatchSpec,
    options?: {
      strings?: (entry: unknown) => ReadonlyArray<string>
      now?: () => number
      budgetMilliseconds?: number
    }
  ): IMatchResult
  planBulkClose(
    list: ReadonlyArray<IEntry>,
    result: IMatchResult,
    options: { mode: string; includePinned?: boolean }
  ): IPlan
  readonly containsMode: string
  readonly notContainsMode: string
  createSearchState(id: string): ISearchState
  createSearchStates(): {
    strip: ISearchState
    group: ISearchState
    groups: ISearchState
    master: ISearchState
  }
  applySearch(
    state: ISearchState,
    list: ReadonlyArray<unknown>,
    options?: { result?: IMatchResult }
  ): ISearchState
  defaultState(knownIds: ReadonlyArray<string>): IState
  sanitizeState(raw: unknown, knownIds: ReadonlyArray<string>): IState
  serializeState(state: IState): string
  parseState(source: unknown, knownIds: ReadonlyArray<string>): IState
  exportState(state: IState): unknown
  storageKey(stripId: string): string
  loadState(
    storage: unknown,
    stripId: string,
    knownIds: ReadonlyArray<string>
  ): IState
  saveState(storage: unknown, stripId: string, state: IState): boolean
  setPinned(state: IState, tabId: string, pinned: boolean): IState
  moveTab(state: IState, tabId: string, delta: number): IState
  createGroup(
    state: IState,
    options: {
      id?: string
      name?: string
      color?: string
      collapsed?: boolean
      members?: ReadonlyArray<string>
    }
  ): IState
  renameGroup(state: IState, groupId: string, name: string): IState
  setGroupColor(state: IState, groupId: string, color: string): IState
  setGroupCollapsed(state: IState, groupId: string, collapsed: boolean): IState
  moveGroup(state: IState, groupId: string, delta: number): IState
  removeGroup(state: IState, groupId: string): IState
  assignToGroup(state: IState, tabId: string, groupId: string | null): IState
  closeTabs(state: IState, tabIds: ReadonlyArray<string>): IState
  restoreTabs(state: IState, tabIds: ReadonlyArray<string>): IState
  groupOf(state: IState, tabId: string): IGroup | null
  normalizeColor(value: unknown): string | null
  layout(state: IState, tabIds: ReadonlyArray<string>): ILayout
  flatten(model: { strips: ReadonlyArray<IStripModel> }): ReadonlyArray<IEntry>
  flattenGroups(model: {
    strips: ReadonlyArray<IStripModel>
  }): ReadonlyArray<IGroupEntry>
  entriesForStrip(
    entries: ReadonlyArray<IEntry>,
    stripId: string
  ): ReadonlyArray<IEntry>
  entriesForGroup(
    entries: ReadonlyArray<IEntry>,
    stripId: string,
    groupId: string | null
  ): ReadonlyArray<IEntry>
  readonly maximumPatternLength: number
  readonly maximumGroupNameLength: number
  readonly stateVersion: number
}

interface IStripController {
  readonly id: string
  state(): IState
  setState(next: unknown): void
  render(): void
}

interface IUpgraded {
  readonly strips: ReadonlyArray<IStripController>
  refresh(): void
  labels(next: Record<string, string>): void
}

interface IJobRun {
  readonly pattern: string
  readonly flags: string
  readonly pages: ReadonlyArray<string>
  onSuccess(data: unknown): void
}

interface ITabsApi {
  readonly logic: ILogic
  storageKey(id: string): string
  upgrade(options: unknown): IUpgraded | null
}

const Tabs: ITabsApi = require_(
  join(process.cwd(), 'docs', 'assets', 'site', 'docs-tabs.js')
)

const Logic = Tabs.logic

/** The three-tab strip most cases start from, sanitized the way a load is. */
function baseState(ids: ReadonlyArray<string> = ['a', 'b', 'c']): IState {
  return Logic.defaultState(ids)
}

function entriesFrom(
  state: IState,
  tabs: ReadonlyArray<ITab>
): ReadonlyArray<IEntry> {
  return Logic.flatten({
    strips: [{ id: 'main', label: 'Sections', state, tabs }],
  })
}

const SampleTabs: ReadonlyArray<ITab> = [
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Install' },
  { id: 'features', label: 'Features' },
  { id: 'reference', label: 'Reference' },
]

function sampleEntries(mutate?: (state: IState) => IState) {
  const ids = SampleTabs.map(tab => tab.id)
  let state = Logic.defaultState(ids)
  if (mutate !== undefined) {
    state = mutate(state)
  }
  return { state, entries: entriesFrom(state, SampleTabs) }
}

function labelsOf(entries: ReadonlyArray<IEntry>): ReadonlyArray<string> {
  return entries.map(entry => entry.label)
}

describe('documentation-site tab match predicate', () => {
  it('defaults to plain text and treats a pattern as literal', () => {
    // `.` is a wildcard in a regex and a full stop in text. The default must be
    // the latter, or a reader's own punctuation silently changes meaning.
    const matcher = Logic.compileMatcher({ query: 'a.c' })
    assert.equal(matcher.ok, true)
    assert.equal(matcher.mode, 'plain')
    assert.equal(matcher.test('a.c'), true)
    assert.equal(matcher.test('abc'), false)
  })

  it('only accepts a literal true as the regex opt-in', () => {
    for (const value of ['true', 1, {}, [], 'yes']) {
      const matcher = Logic.compileMatcher({ query: 'a.c', regex: value })
      assert.equal(
        matcher.mode,
        'plain',
        `regex: ${JSON.stringify(value)} must stay plain text`
      )
      assert.equal(matcher.test('abc'), false)
    }
    const optedIn = Logic.compileMatcher({ query: 'a.c', regex: true })
    assert.equal(optedIn.mode, 'regex')
    assert.equal(optedIn.test('abc'), true)
  })

  it('is case-insensitive by default and exact on request', () => {
    assert.equal(Logic.compileMatcher({ query: 'over' }).test('Overview'), true)
    assert.equal(
      Logic.compileMatcher({ query: 'over', caseSensitive: true }).test(
        'Overview'
      ),
      false
    )
  })

  it('reports an empty query as unusable and matches nothing', () => {
    const matcher = Logic.compileMatcher({ query: '' })
    assert.equal(matcher.ok, false)
    assert.equal(matcher.code, 'empty')
    // An unusable predicate must be false for everything: a caller that ignored
    // the code would otherwise select every tab.
    assert.equal(matcher.test('anything'), false)
    assert.equal(matcher.test(''), false)
  })

  it('reports an invalid pattern without throwing', () => {
    const matcher = Logic.compileMatcher({ query: '([a-', regex: true })
    assert.equal(matcher.ok, false)
    assert.equal(matcher.code, 'invalid')
    assert.notEqual(matcher.detail, '')
    assert.equal(matcher.test('([a-'), false)
  })

  it('rejects unsupported and repeated flags', () => {
    for (const flags of ['x', 'gg', 'imx', 'gimsuyq']) {
      const matcher = Logic.compileMatcher({
        query: 'a',
        regex: true,
        flags: flags,
      })
      assert.equal(matcher.ok, false, `flags "${flags}" must be refused`)
      assert.equal(matcher.code, 'invalid-flags')
    }
    assert.equal(
      Logic.compileMatcher({ query: 'a', regex: true, flags: 'gimsuy' }).ok,
      true
    )
  })

  it('refuses an over-long pattern rather than compiling it', () => {
    const long = 'a'.repeat(Logic.maximumPatternLength + 1)
    const matcher = Logic.compileMatcher({ query: long, regex: true })
    assert.equal(matcher.ok, false)
    assert.equal(matcher.code, 'too-long-pattern')
  })

  it('answers the same for every label despite a global flag', () => {
    // `g` makes RegExp.test stateful. Left in place the second call would answer
    // from a stale lastIndex, so the same pattern would disagree with itself.
    const matcher = Logic.compileMatcher({
      query: 'a',
      regex: true,
      flags: 'g',
    })
    assert.equal(matcher.test('alpha'), true)
    assert.equal(matcher.test('alpha'), true)
    assert.equal(matcher.test('alpha'), true)
  })

  it('anchors to one visible string rather than a concatenation', () => {
    const entry = { label: 'Install', title: 'Install guide' }
    const strings = Logic.visibleStrings(entry)
    assert.deepEqual(strings, ['Install', 'Install guide'])
    // `$` must mean "end of the label", which a joined string would move.
    const result = Logic.matchList([entry], {
      query: 'Install$',
      regex: true,
    })
    assert.equal(result.ok, true)
    assert.deepEqual(result.hits, [0])
  })

  it('never exposes a hidden field to the predicate', () => {
    const entry = {
      label: 'Overview',
      title: '',
      tabId: 'secret-route',
      groupName: 'Hidden group',
    }
    assert.deepEqual(Logic.visibleStrings(entry), ['Overview'])
    const result = Logic.matchList([entry], { query: 'secret-route' })
    assert.deepEqual(result.hits, [])
  })
})

describe('documentation-site tab match evaluation', () => {
  it('fails closed with an error state when the budget expires', () => {
    let clock = 0
    const result = Logic.matchList(
      [{ label: 'Overview' }, { label: 'Install' }],
      { query: 'o' },
      {
        // A clock that has already passed the deadline on the first check.
        now: () => {
          clock += 1000
          return clock
        },
        budgetMilliseconds: 10,
      }
    )
    assert.equal(result.ok, false)
    assert.equal(result.code, 'timeout')
    assert.equal(result.evaluated, false)
    assert.deepEqual(result.hits, [])
  })

  it('refuses to evaluate more entries than it can bound', () => {
    const many = []
    for (let i = 0; i < 500; i++) {
      many.push({ label: `Tab ${i}` })
    }
    const result = Logic.matchList(many, { query: 'Tab' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'too-many-tabs')
    assert.deepEqual(result.hits, [])
  })

  it('keeps every entry and reports the failure when a search cannot run', () => {
    const { entries } = sampleEntries()
    const state = Logic.createSearchState('strip')
    state.query = '([a-'
    state.regex = true
    const next = Logic.applySearch(state, entries)
    // Unfiltered plus a visible error, never an empty list that reads as
    // "no matches" while the reader's tabs are all still there.
    assert.equal(next.status, 'error')
    assert.equal(next.code, 'invalid')
    assert.equal(next.filtered, false)
    assert.equal(next.results.length, entries.length)
  })

  it('reports an empty query as idle rather than as a failed search', () => {
    const { entries } = sampleEntries()
    const next = Logic.applySearch(Logic.createSearchState('strip'), entries)
    assert.equal(next.status, 'idle')
    assert.equal(next.filtered, false)
    assert.equal(next.results.length, entries.length)
  })
})

describe('documentation-site tab searches', () => {
  it('gives each of the four searches its own independent state', () => {
    const states = Logic.createSearchStates()
    const names = ['strip', 'group', 'groups', 'master'] as const
    for (const name of names) {
      assert.equal(states[name].id, name)
    }
    states.strip.query = 'install'
    states.strip.regex = true
    states.strip.flags = 'gimsuy'
    for (const name of names) {
      if (name === 'strip') {
        continue
      }
      assert.equal(states[name].query, '', `${name} must not share a query`)
      assert.equal(states[name].regex, false, `${name} must not share the mode`)
      assert.equal(states[name].flags, 'i', `${name} must not share flags`)
    }

    // Two calls must never hand back the same object either.
    const second = Logic.createSearchStates()
    assert.notEqual(states.strip, second.strip)
    assert.equal(second.strip.query, '')
  })

  it('identifies strip, group, pinned state and label for every result', () => {
    let state = Logic.defaultState(SampleTabs.map(t => t.id))
    state = Logic.setPinned(state, 'overview', true)
    state = Logic.createGroup(state, {
      id: 'g1',
      name: 'Guides',
      members: ['install', 'features'],
    })
    const entries = entriesFrom(state, SampleTabs)

    const pinned = entries.filter(e => e.tabId === 'overview')[0]
    assert.equal(pinned.pinned, true)
    assert.equal(pinned.groupId, null)
    assert.equal(pinned.stripId, 'main')
    assert.equal(pinned.stripLabel, 'Sections')
    assert.equal(pinned.label, 'Overview')

    const grouped = entries.filter(e => e.tabId === 'install')[0]
    assert.equal(grouped.groupId, 'g1')
    assert.equal(grouped.groupName, 'Guides')
    assert.equal(grouped.pinned, false)
  })

  it('scopes a strip search, a group search and the master search', () => {
    const first = Logic.createGroup(
      Logic.defaultState(['overview', 'install']),
      { id: 'g1', name: 'Guides', members: ['install'] }
    )
    const second = Logic.defaultState(['api', 'cli'])
    const model = {
      strips: [
        {
          id: 'main',
          label: 'Sections',
          state: first,
          tabs: [
            { id: 'overview', label: 'Overview' },
            { id: 'install', label: 'Install' },
          ],
        },
        {
          id: 'reference',
          label: 'Reference',
          state: second,
          tabs: [
            { id: 'api', label: 'API' },
            { id: 'cli', label: 'CLI' },
          ],
        },
      ],
    }
    const all = Logic.flatten(model)
    assert.equal(all.length, 4)
    assert.equal(Logic.entriesForStrip(all, 'main').length, 2)
    assert.equal(Logic.entriesForGroup(all, 'main', 'g1').length, 1)
    assert.equal(Logic.entriesForGroup(all, 'main', null).length, 1)

    const groups = Logic.flattenGroups(model)
    assert.equal(groups.length, 1)
    assert.equal(groups[0].name, 'Guides')
    assert.equal(groups[0].memberCount, 1)
    // The group search matches the visible group name only.
    assert.deepEqual(Logic.nameStrings(groups[0]), ['Guides'])
    const hit = Logic.matchList(
      groups,
      { query: 'guid' },
      {
        strings: Logic.nameStrings,
      }
    )
    assert.deepEqual(hit.hits, [0])
  })
})

describe('documentation-site bulk close', () => {
  it('negates the exact same hit set for the inverse action', () => {
    const { entries } = sampleEntries()
    const result = Logic.matchList(entries, { query: 'e' })

    const contains = Logic.planBulkClose(entries, result, {
      mode: Logic.containsMode,
    })
    const notContains = Logic.planBulkClose(entries, result, {
      mode: Logic.notContainsMode,
    })

    // One evaluation, two directions. The two affected sets must partition the
    // strip exactly, which is only true if neither re-derived the predicate.
    const union = labelsOf(contains.affected)
      .concat(labelsOf(notContains.affected))
      .sort()
    assert.deepEqual(union, labelsOf(entries).slice().sort())
    for (const label of labelsOf(contains.affected)) {
      assert.equal(
        labelsOf(notContains.affected).indexOf(label),
        -1,
        `${label} cannot be in both directions`
      )
    }
    assert.deepEqual(labelsOf(contains.matched), labelsOf(notContains.matched))
  })

  it('cannot drift in casing or flags between the two directions', () => {
    const { entries } = sampleEntries()
    const spec = { query: 'INSTALL', regex: true, flags: 'i' }
    const result = Logic.matchList(entries, spec)
    const contains = Logic.planBulkClose(entries, result, {
      mode: Logic.containsMode,
    })
    const inverse = Logic.planBulkClose(entries, result, {
      mode: Logic.notContainsMode,
    })
    assert.deepEqual(labelsOf(contains.affected), ['Install'])
    assert.equal(inverse.count, entries.length - 1)
    assert.equal(contains.matchMode, 'regex')
    assert.equal(inverse.matchMode, 'regex')
  })

  it('never runs on an empty query', () => {
    const { entries } = sampleEntries()
    const result = Logic.matchList(entries, { query: '' })
    for (const mode of [Logic.containsMode, Logic.notContainsMode]) {
      const plan = Logic.planBulkClose(entries, result, { mode: mode })
      assert.equal(plan.runnable, false)
      assert.equal(plan.code, 'empty')
      assert.equal(plan.count, 0)
      assert.deepEqual(plan.affected, [])
    }
  })

  it('never runs on an invalid pattern', () => {
    const { entries } = sampleEntries()
    const result = Logic.matchList(entries, { query: '(', regex: true })
    // Note the asymmetry with search: a failed search shows everything, a
    // failed close touches nothing. Both are "closed" for their own surface.
    const plan = Logic.planBulkClose(entries, result, {
      mode: Logic.notContainsMode,
    })
    assert.equal(plan.runnable, false)
    assert.equal(plan.code, 'invalid')
    assert.equal(plan.count, 0)
  })

  it('excludes pinned tabs by default and names the ones it kept', () => {
    const { entries } = sampleEntries(state =>
      Logic.setPinned(state, 'overview', true)
    )
    const result = Logic.matchList(entries, { query: 'e' })
    const plan = Logic.planBulkClose(entries, result, {
      mode: Logic.containsMode,
    })
    assert.equal(
      labelsOf(plan.matched).indexOf('Overview') !== -1,
      true,
      'the pinned tab still matches the predicate'
    )
    assert.equal(
      labelsOf(plan.affected).indexOf('Overview'),
      -1,
      'but a pinned tab does not close by default'
    )
    assert.deepEqual(labelsOf(plan.protectedPinned), ['Overview'])
  })

  it('closes a pinned tab only on an explicit opt-in, and previews it first', () => {
    const { entries } = sampleEntries(state =>
      Logic.setPinned(state, 'overview', true)
    )
    const result = Logic.matchList(entries, { query: 'e' })
    const plan = Logic.planBulkClose(entries, result, {
      mode: Logic.containsMode,
      includePinned: true,
    })
    assert.equal(labelsOf(plan.affected).indexOf('Overview') !== -1, true)
    // Even when included, the pinned tabs are listed so the preview can name
    // exactly which protected tabs are about to go.
    assert.deepEqual(labelsOf(plan.protectedPinned), ['Overview'])
  })

  it('excludes pinned tabs from the inverse direction too', () => {
    const { entries } = sampleEntries(state =>
      Logic.setPinned(state, 'overview', true)
    )
    const result = Logic.matchList(entries, { query: 'zzz' })
    const plan = Logic.planBulkClose(entries, result, {
      mode: Logic.notContainsMode,
    })
    assert.equal(plan.runnable, true)
    assert.equal(labelsOf(plan.affected).indexOf('Overview'), -1)
    assert.equal(plan.count, entries.length - 1)
  })

  it('reports the mode and the affected count for the preview', () => {
    const { entries } = sampleEntries()
    const result = Logic.matchList(entries, { query: 'in' })
    const plan = Logic.planBulkClose(entries, result, {
      mode: Logic.containsMode,
    })
    assert.equal(plan.mode, Logic.containsMode)
    assert.equal(plan.matchMode, 'plain')
    assert.equal(plan.total, entries.length)
    assert.equal(plan.count, plan.affected.length)
    assert.deepEqual(labelsOf(plan.affected), ['Install'])
  })
})

describe('documentation-site tab persistence', () => {
  it('round-trips order, pinning, groups, collapse and hidden tabs', () => {
    const ids = ['a', 'b', 'c', 'd']
    let state = Logic.defaultState(ids)
    state = Logic.setPinned(state, 'c', true)
    state = Logic.createGroup(state, {
      id: 'g1',
      name: 'Guides',
      color: '#336699',
      collapsed: true,
      members: ['b', 'd'],
    })
    state = Logic.moveTab(state, 'd', -1)
    state = Logic.closeTabs(state, ['a'])

    const restored = Logic.parseState(Logic.serializeState(state), ids)
    assert.deepEqual(restored.order, state.order)
    assert.deepEqual(restored.pinned, state.pinned)
    assert.deepEqual(restored.hidden, state.hidden)
    assert.equal(restored.groups.length, 1)
    assert.equal(restored.groups[0].id, 'g1')
    assert.equal(restored.groups[0].name, 'Guides')
    assert.equal(restored.groups[0].collapsed, true)
    assert.deepEqual(restored.groups[0].members, ['d', 'b'])
    assert.equal(restored.version, Logic.stateVersion)
  })

  it('falls safely back to defaults for corrupt or absent input', () => {
    const ids = ['a', 'b']
    const corrupt: ReadonlyArray<unknown> = [
      '{not json',
      '',
      '[]',
      'null',
      '"a string"',
      '42',
      null,
      undefined,
      [],
      123,
    ]
    for (const source of corrupt) {
      const state = Logic.parseState(source, ids)
      assert.deepEqual(
        state.order,
        ids,
        `${JSON.stringify(source)} must restore the defaults`
      )
      assert.deepEqual(state.pinned, [])
      assert.deepEqual(state.groups, [])
      assert.deepEqual(state.hidden, [])
    }
  })

  it('repairs a hand-edited state instead of throwing', () => {
    const state = Logic.parseState(
      JSON.stringify({
        version: 99,
        order: ['b', 'b', 'gone', 'a', 7, null],
        pinned: ['gone', 'a', 'a'],
        hidden: ['nope'],
        groups: [
          { id: 'g1', members: ['a', 'b', 'b', 'gone'], name: 'x'.repeat(200) },
          { members: ['b'], color: 'not a colour' },
          'not an object',
          null,
          { id: 'g1', members: [] },
        ],
      }),
      ['a', 'b', 'c']
    )

    // Unknown ids gone, duplicates collapsed, and a newly published tab joined.
    assert.deepEqual(state.order, ['b', 'a', 'c'])
    assert.deepEqual(state.pinned, ['a'])
    assert.deepEqual(state.hidden, [])
    assert.equal(state.version, Logic.stateVersion)
    assert.equal(state.groups[0].name.length, Logic.maximumGroupNameLength)
    // A pinned tab is not also a group member, and one tab belongs to one group.
    assert.deepEqual(state.groups[0].members, ['b'])
    assert.deepEqual(state.groups[1].members, [])
    assert.equal(state.groups[1].color, null)
    // Duplicate group ids are made unique rather than silently merged.
    const groupIds = state.groups.map(group => group.id)
    assert.equal(new Set(groupIds).size, groupIds.length)
  })

  it('appends tabs published since the last visit rather than dropping them', () => {
    const stored = Logic.serializeState(Logic.defaultState(['a', 'b']))
    const restored = Logic.parseState(stored, ['a', 'b', 'new'])
    assert.deepEqual(restored.order, ['a', 'b', 'new'])
  })

  it('validates a group colour and drops what it cannot represent', () => {
    assert.equal(Logic.normalizeColor('#abc'), '#abc')
    assert.equal(Logic.normalizeColor('#AABBCC'), '#aabbcc')
    assert.equal(Logic.normalizeColor('#aabbccdd'), '#aabbccdd')
    assert.equal(Logic.normalizeColor('rgb(1,2,3)'), null)
    assert.equal(Logic.normalizeColor('javascript:alert(1)'), null)
    assert.equal(Logic.normalizeColor(''), null)
    assert.equal(Logic.normalizeColor(null), null)
  })

  it('keys storage under the documented prefix', () => {
    assert.equal(Logic.storageKey('features'), 'dm-docs-tabs-features')
    assert.equal(Tabs.storageKey('features'), 'dm-docs-tabs-features')
  })

  it('survives storage that throws on read and on write', () => {
    const hostile = {
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const state = Logic.loadState(hostile, 'main', ['a', 'b'])
    assert.deepEqual(state.order, ['a', 'b'])
    assert.equal(Logic.saveState(hostile, 'main', state), false)
    assert.equal(Logic.saveState(null, 'main', state), false)

    const memory: Record<string, string> = {}
    const working = {
      getItem: (key: string) =>
        memory[key] === undefined ? null : memory[key],
      setItem: (key: string, value: string) => {
        memory[key] = value
      },
    }
    assert.equal(Logic.saveState(working, 'main', state), true)
    assert.deepEqual(Logic.loadState(working, 'main', ['a', 'b']).order, [
      'a',
      'b',
    ])
  })
})

describe('documentation-site tab groups', () => {
  it('creates, renames, colours, reorders and collapses a group', () => {
    let state = baseState()
    state = Logic.createGroup(state, { id: 'g1', name: 'One' })
    state = Logic.createGroup(state, { id: 'g2', name: 'Two' })
    assert.deepEqual(
      state.groups.map(g => g.id),
      ['g1', 'g2']
    )

    state = Logic.renameGroup(state, 'g1', 'Renamed')
    assert.equal(state.groups[0].name, 'Renamed')

    state = Logic.setGroupColor(state, 'g1', '#123456')
    assert.equal(state.groups[0].color, '#123456')

    state = Logic.setGroupCollapsed(state, 'g1', true)
    assert.equal(state.groups[0].collapsed, true)

    state = Logic.moveGroup(state, 'g1', 1)
    assert.deepEqual(
      state.groups.map(g => g.id),
      ['g2', 'g1']
    )

    // A move past the end is refused rather than wrapping around.
    state = Logic.moveGroup(state, 'g1', 5)
    assert.deepEqual(
      state.groups.map(g => g.id),
      ['g2', 'g1']
    )
  })

  it('clamps an over-long group name instead of refusing the rename', () => {
    let state = Logic.createGroup(baseState(), { id: 'g1', name: 'x' })
    state = Logic.renameGroup(state, 'g1', 'y'.repeat(500))
    assert.equal(state.groups[0].name.length, Logic.maximumGroupNameLength)
  })

  it('moves a tab into and out of a group', () => {
    let state = Logic.createGroup(baseState(), { id: 'g1', name: 'Guides' })
    state = Logic.assignToGroup(state, 'b', 'g1')
    assert.deepEqual(state.groups[0].members, ['b'])
    assert.equal(Logic.groupOf(state, 'b')!.id, 'g1')

    state = Logic.assignToGroup(state, 'b', null)
    assert.deepEqual(state.groups[0].members, [])
    assert.equal(Logic.groupOf(state, 'b'), null)
  })

  it('keeps a tab in at most one group', () => {
    let state = baseState()
    state = Logic.createGroup(state, { id: 'g1', name: 'One' })
    state = Logic.createGroup(state, { id: 'g2', name: 'Two' })
    state = Logic.assignToGroup(state, 'b', 'g1')
    state = Logic.assignToGroup(state, 'b', 'g2')
    assert.deepEqual(state.groups[0].members, [])
    assert.deepEqual(state.groups[1].members, ['b'])
  })

  it('never closes a tab when a group is removed', () => {
    let state = baseState()
    state = Logic.createGroup(state, {
      id: 'g1',
      name: 'Guides',
      members: ['a', 'b'],
    })
    const before = state.order.slice()

    state = Logic.removeGroup(state, 'g1')
    assert.deepEqual(state.groups, [])
    // The canonical order is untouched, so the members are merely ungrouped.
    assert.deepEqual(state.order, before)
    assert.deepEqual(state.hidden, [])

    const resolved = Logic.layout(state, ['a', 'b', 'c'])
    assert.equal(resolved.sections.length, 1)
    assert.equal(resolved.sections[0].groupId, null)
    assert.deepEqual(resolved.sections[0].tabs, ['a', 'b', 'c'])
  })

  it('exposes every member of a collapsed group to the layout', () => {
    let state = Logic.createGroup(baseState(), {
      id: 'g1',
      name: 'Guides',
      members: ['a', 'b'],
      collapsed: true,
    })
    const resolved = Logic.layout(state, ['a', 'b', 'c'])
    // Collapsing is a presentation flag; the members stay in the section so the
    // group's dropdown can list all of them.
    assert.deepEqual(resolved.sections[0].tabs, ['a', 'b'])
    assert.equal(resolved.sections[0].group!.collapsed, true)
  })

  it('takes a pinned tab out of its group and back out of the pinned region', () => {
    let state = Logic.createGroup(baseState(), {
      id: 'g1',
      name: 'Guides',
      members: ['a', 'b'],
    })
    state = Logic.setPinned(state, 'a', true)
    assert.deepEqual(state.pinned, ['a'])
    assert.deepEqual(state.groups[0].members, ['b'])

    state = Logic.setPinned(state, 'a', false)
    assert.deepEqual(state.pinned, [])
    assert.equal(Logic.groupOf(state, 'a'), null)
  })

  it('ignores group members that are unknown, pinned or already claimed', () => {
    let state = Logic.setPinned(baseState(), 'a', true)
    state = Logic.createGroup(state, { id: 'g1', members: ['b'] })
    state = Logic.createGroup(state, {
      id: 'g2',
      members: ['a', 'b', 'ghost', 'c', 'c'],
    })
    assert.deepEqual(state.groups[1].members, ['c'])
  })
})

describe('documentation-site tab ordering', () => {
  it('reorders inside the pinned region only', () => {
    let state = baseState()
    state = Logic.setPinned(state, 'a', true)
    state = Logic.setPinned(state, 'b', true)
    state = Logic.moveTab(state, 'a', 1)
    assert.deepEqual(state.pinned, ['b', 'a'])
    // A move past the region's edge stops rather than unpinning the tab.
    state = Logic.moveTab(state, 'a', 5)
    assert.deepEqual(state.pinned, ['b', 'a'])
    assert.deepEqual(state.order, ['a', 'b', 'c'])
  })

  it('reorders inside a group without leaving it', () => {
    let state = Logic.createGroup(baseState(), {
      id: 'g1',
      members: ['a', 'b'],
    })
    state = Logic.moveTab(state, 'a', 1)
    assert.deepEqual(state.groups[0].members, ['b', 'a'])
    state = Logic.moveTab(state, 'a', 3)
    assert.deepEqual(state.groups[0].members, ['b', 'a'])
    assert.equal(Logic.groupOf(state, 'a')!.id, 'g1')
  })

  it('reorders ungrouped tabs without disturbing grouped or pinned ones', () => {
    let state = Logic.defaultState(['a', 'b', 'c', 'd'])
    state = Logic.setPinned(state, 'a', true)
    state = Logic.createGroup(state, { id: 'g1', members: ['b'] })
    // `c` and `d` are the only loose tabs; swapping them must not move `a`
    // or `b` inside the canonical order.
    state = Logic.moveTab(state, 'c', 1)
    assert.deepEqual(state.order, ['a', 'b', 'd', 'c'])
    assert.deepEqual(state.pinned, ['a'])
    assert.deepEqual(state.groups[0].members, ['b'])
  })

  it('leaves the state untouched for an unknown tab or a zero move', () => {
    const state = baseState()
    assert.deepEqual(Logic.moveTab(state, 'ghost', 1).order, state.order)
    assert.deepEqual(Logic.moveTab(state, 'a', 0).order, state.order)
  })

  it('does not mutate the state it was handed', () => {
    const state = baseState()
    const snapshot = JSON.stringify(Logic.exportState(state))
    Logic.setPinned(state, 'a', true)
    Logic.moveTab(state, 'a', 1)
    Logic.createGroup(state, { id: 'g1', members: ['a'] })
    Logic.closeTabs(state, ['a'])
    assert.equal(JSON.stringify(Logic.exportState(state)), snapshot)
  })
})

describe('documentation-site tab layout', () => {
  it('renders pinned first, then groups in order, then the remainder', () => {
    let state = Logic.defaultState(['a', 'b', 'c', 'd', 'e'])
    state = Logic.setPinned(state, 'e', true)
    state = Logic.createGroup(state, { id: 'g1', name: 'One', members: ['c'] })
    state = Logic.createGroup(state, { id: 'g2', name: 'Two', members: ['a'] })

    const resolved = Logic.layout(state, ['a', 'b', 'c', 'd', 'e'])
    assert.deepEqual(resolved.pinned, ['e'])
    assert.deepEqual(
      resolved.sections.map(section => section.groupId),
      ['g1', 'g2', null]
    )
    assert.deepEqual(resolved.sections[0].tabs, ['c'])
    assert.deepEqual(resolved.sections[1].tabs, ['a'])
    assert.deepEqual(resolved.sections[2].tabs, ['b', 'd'])
  })

  it('hides a closed tab from the strip and restores it unchanged', () => {
    let state = Logic.createGroup(Logic.defaultState(['a', 'b', 'c']), {
      id: 'g1',
      members: ['b'],
    })
    state = Logic.closeTabs(state, ['b'])
    let resolved = Logic.layout(state, ['a', 'b', 'c'])
    assert.deepEqual(resolved.sections[0].tabs, [])
    assert.deepEqual(resolved.hidden, ['b'])
    // Group membership survives the close, so restoring puts it back where it
    // was rather than dropping it into the ungrouped remainder.
    assert.deepEqual(state.groups[0].members, ['b'])

    state = Logic.restoreTabs(state, ['b'])
    resolved = Logic.layout(state, ['a', 'b', 'c'])
    assert.deepEqual(resolved.sections[0].tabs, ['b'])
    assert.deepEqual(resolved.hidden, [])
  })

  it('closes a tab at most once and ignores an unknown id', () => {
    let state = baseState()
    state = Logic.closeTabs(state, ['a', 'a', 'ghost'])
    assert.deepEqual(state.hidden, ['a'])
    state = Logic.restoreTabs(state, ['ghost'])
    assert.deepEqual(state.hidden, ['a'])
  })

  it('drops a tab the site no longer publishes without losing the rest', () => {
    let state = Logic.defaultState(['a', 'b', 'c'])
    state = Logic.setPinned(state, 'b', true)
    // `b` has since been removed from the page; the layout is filtered by what
    // is actually present rather than by what was stored.
    const resolved = Logic.layout(state, ['a', 'c'])
    assert.deepEqual(resolved.pinned, [])
    assert.deepEqual(resolved.sections[0].tabs, ['a', 'c'])
  })

  it('moves an ungrouped tab the full distance rather than swapping ends', () => {
    // The pinned region and a group both insert, so the ungrouped bucket must
    // too. A swap of the two end slots is indistinguishable at ±1 — which is all
    // the keyboard and the drag issue today — and wrong for anything larger.
    const state = Logic.defaultState(['a', 'b', 'c', 'd'])
    assert.deepEqual(Logic.moveTab(state, 'a', 2).order, ['b', 'c', 'a', 'd'])
    assert.deepEqual(Logic.moveTab(state, 'd', -2).order, ['a', 'd', 'b', 'c'])
    // The adjacent case the surface actually issues is unchanged.
    assert.deepEqual(Logic.moveTab(state, 'c', -1).order, ['a', 'c', 'b', 'd'])
  })
})

// ============================================================== the DOM half

/** A memory store, so a test never depends on the jsdom origin's storage. */
function memoryStorage(): {
  read(key: string): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
} {
  const map = new Map<string, string>()
  return {
    read: key => (map.has(key) ? (map.get(key) as string) : null),
    getItem: key => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

/**
 * A regex job that holds its replies until released, which is the only way to
 * reproduce what a real worker does: answer *after* the reader has moved on.
 */
function deferredJob() {
  const queue: Array<IJobRun> = []
  return {
    pending: () => queue.length,
    run(
      _surface: string,
      payload: {
        pattern: string
        flags: string
        pages: ReadonlyArray<string>
      },
      onSuccess: (data: unknown) => void
    ) {
      queue.push({ ...payload, onSuccess })
    },
    release() {
      for (const job of queue.splice(0)) {
        const flags = job.flags.includes('g') ? job.flags : `${job.flags}g`
        const pattern = new RegExp(job.pattern, flags)
        const hits: Array<{ pageIndex: number }> = []
        job.pages.forEach((page, index) => {
          pattern.lastIndex = 0
          if (pattern.test(page)) {
            hits.push({ pageIndex: index })
          }
        })
        job.onSuccess({ ok: true, total: hits.length, hits, truncated: false })
      }
    },
  }
}

/** The published markup, before `docs-hub.js` adds its roles. */
function mountStrip(): HTMLElement {
  document.body.innerHTML = `
    <nav class="tabs" id="tabs" aria-label="Documentation sections">
      <a class="tab" id="tab-overview" href="#overview" data-tab="overview">Overview</a>
      <a class="tab" id="tab-install" href="#install" data-tab="install">Install</a>
      <a class="tab" id="tab-features" href="#features" data-tab="features">Features</a>
      <a class="tab" id="tab-reference" href="#reference" data-tab="reference">Reference</a>
    </nav>
    <div data-dm-tabs-master></div>`
  return document.body
}

function element<T extends Element>(selector: string): T {
  const found = document.querySelector(selector)
  assert.notEqual(found, null, `${selector} must exist`)
  return found as T
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

function press(node: Element, key: string): void {
  node.dispatchEvent(
    new (view().KeyboardEvent)('keydown', {
      key: key,
      altKey: true,
      bubbles: true,
    })
  )
}

describe('documentation-site tab surface', () => {
  it('never lets a late preview reply re-arm a close the reader has retyped', () => {
    mountStrip()
    const job = deferredJob()
    const api = Tabs.upgrade({
      document: document,
      storage: memoryStorage(),
      regexJob: job,
    })
    assert.notEqual(api, null)

    const query = element<HTMLInputElement>(
      '.dm-tabs-bulk .dm-tabs-search-input'
    )
    const regex = element<HTMLInputElement>(
      '.dm-tabs-bulk .dm-tabs-search-regex-input'
    )
    const close = element<HTMLButtonElement>(
      '.dm-tabs-bulk .dm-tabs-action--danger'
    )
    const previewButton = element<HTMLButtonElement>(
      '.dm-tabs-bulk .dm-tabs-bulk-actions .dm-tabs-action'
    )

    regex.checked = true
    fire(regex, 'change')
    query.value = 'Install'
    fire(query, 'input')
    previewButton.click()
    // Regex evaluation goes to the worker, so nothing has been answered yet.
    assert.equal(job.pending(), 1)

    // The reader replaces the query while that run is still outstanding.
    query.value = 'Reference'
    fire(query, 'input')
    assert.equal(close.disabled, true)

    job.release()
    // The stale reply must not re-enable Close, and must not leave a preview
    // describing a predicate the field no longer holds.
    assert.equal(close.disabled, true)
    assert.equal(document.querySelector('.dm-tabs-bulk-summary'), null)

    close.click()
    assert.deepEqual((api as IUpgraded).strips[0].state().hidden, [])
  })

  it('previews, closes and restores through the surface without losing an anchor', () => {
    mountStrip()
    const storage = memoryStorage()
    const api = Tabs.upgrade({ document: document, storage: storage })
    assert.notEqual(api, null)
    const strip = (api as IUpgraded).strips[0]

    const query = element<HTMLInputElement>(
      '.dm-tabs-bulk .dm-tabs-search-input'
    )
    const close = element<HTMLButtonElement>(
      '.dm-tabs-bulk .dm-tabs-action--danger'
    )
    const previewButton = element<HTMLButtonElement>(
      '.dm-tabs-bulk .dm-tabs-bulk-actions .dm-tabs-action'
    )

    // An empty query is refused outright, before any preview exists.
    previewButton.click()
    assert.equal(close.disabled, true)

    query.value = 'in'
    fire(query, 'input')
    previewButton.click()
    const summary = element<HTMLElement>('.dm-tabs-bulk-summary')
    assert.match(summary.textContent || '', /text · 1 \/ 4$/)
    assert.equal(close.disabled, false)

    close.click()
    assert.deepEqual(strip.state().hidden, ['install'])
    assert.equal(close.disabled, true, 'a used preview is spent')
    assert.match(storage.read(Tabs.storageKey('tabs')) || '', /install/)
    // The closed tab keeps its anchor: a close that deleted the node would be
    // permanent despite being described as reversible.
    assert.equal(document.querySelectorAll('#tabs [data-tab]').length, 4)

    const restore = element<HTMLButtonElement>(
      '.dm-tabs-closed-list .dm-tabs-action'
    )
    restore.click()
    assert.deepEqual(strip.state().hidden, [])
  })

  it('refuses a second upgrade instead of duplicating the master search', () => {
    mountStrip()
    const first = Tabs.upgrade({ document: document, storage: memoryStorage() })
    assert.notEqual(first, null)
    const fields = document.querySelectorAll('.dm-tabs-search').length

    const second = Tabs.upgrade({
      document: document,
      storage: memoryStorage(),
    })
    // A page that loads this script twice must not grow a second master search
    // beside the first, nor nest a wrapper inside its own wrapper.
    assert.equal(second, null)
    assert.equal(document.querySelectorAll('.dm-tabs-search').length, fields)
    assert.equal(document.querySelectorAll('.dm-tabs-master').length, 1)
    assert.equal(document.querySelectorAll('.dm-tabstrip').length, 1)
  })

  it('reports nothing to upgrade on a page with no tab strip', () => {
    document.body.innerHTML = '<div data-dm-tabs-master></div>'
    assert.equal(
      Tabs.upgrade({ document: document, storage: memoryStorage() }),
      null
    )
    assert.equal(document.querySelectorAll('.dm-tabs-search').length, 0)
  })

  it('retranslates every kept caption when the page changes language', () => {
    mountStrip()
    const api = Tabs.upgrade({
      document: document,
      storage: memoryStorage(),
      labels: { manage: 'Manage tabs', bulk: 'Close tabs by text' },
    })
    assert.notEqual(api, null)
    assert.equal(
      element<HTMLElement>('.dm-tabstrip-panel-button').textContent,
      'Manage tabs'
    )

    // A language switch hands the module a new label table. Captions built once
    // and then kept must move too, or the surface reads half in each language.
    ;(api as IUpgraded).labels({
      manage: '管理分頁',
      bulk: '關閉分頁',
      searchStrip: '搜尋分頁條',
      searchGroups: '搜尋分頁組',
      searchAll: '搜尋所有分頁',
      groups: '分頁組',
      newGroup: '新分頁組',
      closed: '已隱藏分頁',
      bulkPreview: '預覽',
      bulkClose: '關閉符合的分頁',
      bulkContains: '關閉含有文字的分頁',
      regex: '正則',
    })

    assert.equal(
      element<HTMLElement>('.dm-tabstrip-panel-button').textContent,
      '管理分頁'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabs-bulk .dm-tabs-heading').textContent,
      '關閉分頁'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabstrip-toolbar .dm-tabs-search-label')
        .textContent,
      '搜尋分頁條'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabs-groups .dm-tabs-heading').textContent,
      '分頁組'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabs-closed .dm-tabs-heading').textContent,
      '已隱藏分頁'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabs-master .dm-tabs-heading').textContent,
      '搜尋所有分頁'
    )
    assert.equal(
      element<HTMLButtonElement>('.dm-tabs-bulk .dm-tabs-action--danger')
        .textContent,
      '關閉符合的分頁'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabs-bulk-radio span').textContent,
      '關閉含有文字的分頁'
    )
    assert.equal(
      element<HTMLElement>('.dm-tabstrip-toolbar .dm-tabs-search-regex span')
        .textContent,
      '正則'
    )
    // Repeated refreshes must not multiply the surface they retranslate.
    const fields = document.querySelectorAll('.dm-tabs-search').length
    for (let i = 0; i < 20; i++) {
      ;(api as IUpgraded).refresh()
    }
    assert.equal(document.querySelectorAll('.dm-tabs-search').length, fields)
    assert.equal(document.querySelectorAll('#tabs [data-tab]').length, 4)
  })

  it('keeps every tab a descendant of the tablist through pin and group', () => {
    mountStrip()
    const api = Tabs.upgrade({ document: document, storage: memoryStorage() })
    assert.notEqual(api, null)
    const strip = (api as IUpgraded).strips[0]

    press(element<HTMLElement>('#tab-overview'), 'p')
    assert.deepEqual(strip.state().pinned, ['overview'])
    // A pinned tab may render icon-only, so its full name stays on the element.
    assert.equal(
      element<HTMLElement>('#tab-overview').getAttribute('aria-label'),
      'Overview'
    )
    assert.notEqual(
      document.querySelector('#tabs .dm-tabstrip-pinned #tab-overview'),
      null
    )

    press(element<HTMLElement>('#tab-features'), 'ArrowLeft')
    assert.deepEqual(strip.state().order, [
      'overview',
      'features',
      'install',
      'reference',
    ])

    strip.setState({
      ...strip.state(),
      groups: [
        {
          id: 'g1',
          name: 'Guides',
          color: null,
          collapsed: true,
          members: ['install', 'features'],
        },
      ],
    })
    // A collapsed group still exposes every member through its own menu, so
    // finding a tab never destroys the collapsed preference.
    assert.equal(
      document.querySelectorAll('.dm-tabstrip-group .dm-tabstrip-menu-item')
        .length,
      2
    )
    assert.equal(
      element<HTMLElement>('.dm-tabstrip-group-tabs').hidden,
      true,
      'collapsed hides the row rather than removing the tabs'
    )
    assert.equal(document.querySelectorAll('#tabs [data-tab]').length, 4)
  })

  it('shows every tab plus a visible error when a pattern cannot compile', () => {
    mountStrip()
    assert.notEqual(
      Tabs.upgrade({ document: document, storage: memoryStorage() }),
      null
    )
    const query = element<HTMLInputElement>(
      '.dm-tabstrip-toolbar .dm-tabs-search-input'
    )
    const regex = element<HTMLInputElement>(
      '.dm-tabstrip-toolbar .dm-tabs-search-regex-input'
    )

    query.value = 'in'
    fire(query, 'input')
    assert.equal(
      document.querySelectorAll('.dm-tabstrip-toolbar .dm-tabs-result-label')
        .length,
      1
    )

    regex.checked = true
    fire(regex, 'change')
    query.value = '([a-'
    fire(query, 'input')
    // A failed *search* is unfiltered plus an error — an empty list would read
    // as "no matches" while the reader's own tabs are all still there.
    assert.equal(
      document.querySelectorAll('.dm-tabstrip-toolbar .dm-tabs-result-label')
        .length,
      4
    )
    assert.equal(query.getAttribute('aria-invalid'), 'true')
  })
})
