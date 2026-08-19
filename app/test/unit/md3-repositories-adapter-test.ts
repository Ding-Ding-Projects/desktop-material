import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'

import { md3RepositoryRows } from '../../src/ui/md3/md3-destination-adapters'
import {
  IMd3RepositoriesControllerHost,
  Md3RepositoriesController,
} from '../../src/ui/md3/md3-repositories-controller'
import {
  md3RepositoryDetail,
  md3RepositoryMeta,
} from '../../src/ui/md3/md3-repositories-view'
import { ILocalRepositoryState, Repository } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import {
  hideRepository,
  unhideRepository,
} from '../../src/lib/stores/repository-list-visibility'

/**
 * The adapter that turns the real repository inventory into Repositories rows.
 *
 * It had no test, and the view's own tests could never have caught what it was
 * getting wrong: the contract fixtures are already correct by construction, so
 * every assertion over them passed while the running application rendered
 * something else. Four defects lived in exactly that blind spot —
 *
 *  - the row dropped `Repository.alias`, so a repository the user had renamed
 *    went back to its folder name here while every other surface in the app
 *    showed the chosen name;
 *  - `remoteCount` was guessed from whether the repository had a GitHub
 *    association — `1` if it did and `0` if it did not — so a local checkout
 *    with an `origin` rendered "0 remotes", a confident zero the user has no
 *    way to tell apart from a repository that genuinely has none;
 *  - the fetch time collapsed "nobody has read this repository's state" into
 *    "never fetched", and the string it used for the former said `Never
 *    fetched`, so the meta line rendered the sentence "· fetched Never
 *    fetched";
 *  - hidden repositories were never marked, because the caller handed the
 *    adapter an empty set instead of the persisted one.
 *
 * Every one of those is a value that is present and correctly typed. Only an
 * assertion over the real mapping from real model objects can see them.
 */

const owner = new Owner('material', getDotComAPIEndpoint(), 4_100)

const forge = new GitHubRepository(
  'desktop-material',
  owner,
  9_100,
  false,
  'https://github.com/material/desktop-material'
)

function repositoryAt(
  options: {
    readonly id?: number
    readonly path?: string
    readonly alias?: string | null
    readonly missing?: boolean
    readonly forge?: GitHubRepository | null
    readonly groupName?: string | null
  } = {}
): Repository {
  return new Repository(
    options.path ?? 'C:\\Users\\dev\\code\\desktop-material',
    options.id ?? 1,
    options.forge ?? null,
    options.missing ?? false,
    options.alias ?? null,
    {},
    false,
    undefined,
    null,
    undefined,
    options.groupName ?? null
  )
}

function localState(
  overrides: Partial<ILocalRepositoryState> = {}
): ILocalRepositoryState {
  return {
    aheadBehind: null,
    upstreamState: 'unknown',
    changedFilesCount: 0,
    branchName: 'main',
    defaultBranchName: 'main',
    ...overrides,
  }
}

const Now = new Date('2026-08-10T09:53:00Z').getTime()

function rowsFor(
  repositories: ReadonlyArray<Repository | CloningRepository>,
  source: {
    readonly localState?: ReadonlyMap<number, ILocalRepositoryState>
    readonly selectedRepositoryId?: number | null
    readonly pinnedRepositoryIds?: ReadonlySet<number>
    readonly hiddenRepositoryIds?: ReadonlySet<number>
    readonly lastFetchedById?: ReadonlyMap<number, Date | null>
    readonly remoteCountById?: ReadonlyMap<number, number>
  } = {}
) {
  return md3RepositoryRows({
    repositories,
    localState: source.localState ?? new Map<number, ILocalRepositoryState>(),
    selectedRepositoryId: source.selectedRepositoryId ?? null,
    pinnedRepositoryIds: source.pinnedRepositoryIds ?? new Set<number>(),
    hiddenRepositoryIds: source.hiddenRepositoryIds ?? new Set<number>(),
    lastFetchedById:
      source.lastFetchedById ?? new Map<number, Date | null>([[1, null]]),
    remoteCountById: source.remoteCountById ?? new Map<number, number>(),
    now: Now,
  })
}

describe('md3RepositoryRows', () => {
  it('renders the alias the user chose, not the folder name', () => {
    const [row] = rowsFor([repositoryAt({ alias: 'Desktop (MD3 rewrite)' })])

    assert.equal(row.name, 'Desktop (MD3 rewrite)')
  })

  it('falls back to the repository name when no alias was set', () => {
    const [row] = rowsFor([repositoryAt({ alias: null })])

    assert.equal(row.name, 'desktop-material')
  })

  it('keeps the alias out of the cloning row, which has no alias to keep', () => {
    const cloning = new CloningRepository(
      'C:\\Users\\dev\\code\\proto-sandbox',
      'https://github.com/material/proto-sandbox'
    )

    const [row] = rowsFor([cloning], {
      lastFetchedById: new Map<number, Date | null>(),
    })

    assert.equal(row.name, 'proto-sandbox')
    assert.equal(row.groupLabel, 'Cloning')
  })

  it('reports remotes it was given rather than guessing from the forge', () => {
    // A fork: `origin` and `upstream`. The old mapping saw one GitHub
    // association and said "1 remote".
    const [row] = rowsFor([repositoryAt({ forge })], {
      remoteCountById: new Map([[1, 2]]),
    })

    assert.equal(row.remoteCount, 2)
    assert.match(md3RepositoryDetail(row), /2 remotes/)
  })

  it('never reports zero remotes for a repository nobody counted', () => {
    // The defect in its purest form: a local checkout with a real `origin`,
    // which the old mapping rendered as "0 remotes" because it had no GitHub
    // association to look at.
    const [row] = rowsFor([repositoryAt({ forge: null })], {
      remoteCountById: new Map<number, number>(),
    })

    assert.equal(row.remoteCount, null)
    assert.match(md3RepositoryDetail(row), /remotes not counted/)
    assert.doesNotMatch(md3RepositoryDetail(row), /0 remotes/)
  })

  it('reports a counted zero as a zero, which is a different claim', () => {
    const [row] = rowsFor([repositoryAt({ forge: null })], {
      remoteCountById: new Map([[1, 0]]),
    })

    assert.equal(row.remoteCount, 0)
    assert.match(md3RepositoryDetail(row), /0 remotes/)
  })

  it('says the fetch time is not checked when nothing read the state', () => {
    const [row] = rowsFor([repositoryAt()], {
      lastFetchedById: new Map<number, Date | null>(),
    })

    assert.equal(
      md3RepositoryMeta(row),
      'C:\\Users\\dev\\code\\desktop-material · fetched not checked yet'
    )
  })

  it('says never only once the state has been read and holds no fetch', () => {
    const [row] = rowsFor([repositoryAt()], {
      lastFetchedById: new Map<number, Date | null>([[1, null]]),
    })

    assert.equal(row.lastFetched, '')
    assert.equal(
      md3RepositoryMeta(row),
      'C:\\Users\\dev\\code\\desktop-material · fetched never'
    )
  })

  it('humanises a real fetch time against the adapter clock', () => {
    const [row] = rowsFor([repositoryAt()], {
      lastFetchedById: new Map<number, Date | null>([
        [1, new Date('2026-08-10T09:41:00Z')],
      ]),
    })

    assert.equal(row.lastFetched, '12 minutes ago')
    assert.match(md3RepositoryMeta(row), /· fetched 12 minutes ago$/)
  })

  it('marks the repositories the user hid', () => {
    const [visible, hidden] = rowsFor(
      [repositoryAt({ id: 1 }), repositoryAt({ id: 2, path: '~/notes' })],
      { hiddenRepositoryIds: new Set([2]) }
    )

    assert.equal(visible.isHidden, false)
    assert.equal(hidden.isHidden, true)
  })

  it('marks the pinned, current and missing repositories', () => {
    const [row] = rowsFor([repositoryAt({ missing: true })], {
      pinnedRepositoryIds: new Set([1]),
      selectedRepositoryId: 1,
    })

    assert.equal(row.isPinned, true)
    assert.equal(row.isCurrent, true)
    assert.equal(row.isMissing, true)
  })

  it('groups by the user group, then the forge owner, then Local', () => {
    const [grouped, owned, local] = rowsFor(
      [
        repositoryAt({ id: 1, groupName: 'Work', forge }),
        repositoryAt({ id: 2, forge }),
        repositoryAt({ id: 3 }),
      ],
      { lastFetchedById: new Map<number, Date | null>() }
    )

    assert.equal(grouped.groupLabel, 'Work')
    assert.equal(owned.groupLabel, 'material')
    assert.equal(local.groupLabel, 'Local')
  })

  it('leaves the change count unknown until a status has been read', () => {
    const [uninspected, inspected] = rowsFor(
      [repositoryAt({ id: 1 }), repositoryAt({ id: 2 })],
      {
        localState: new Map([[2, localState({ changedFilesCount: 12 })]]),
      }
    )

    assert.equal(uninspected.changedFilesCount, null)
    assert.equal(inspected.changedFilesCount, 12)
  })

  it('carries the branch and its ahead/behind counts onto the row', () => {
    const [row] = rowsFor([repositoryAt()], {
      localState: new Map([
        [
          1,
          localState({
            branchName: 'development',
            upstreamState: 'tracking',
            aheadBehind: { ahead: 3, behind: 0 },
          }),
        ],
      ]),
    })

    assert.equal(row.branchName, 'development')
    assert.equal(row.sync.kind, 'ahead')
    assert.equal(row.sync.ahead, 3)
    assert.match(md3RepositoryDetail(row), /development ↑3 ↓0/)
  })

  it('groups contiguously whatever order the inventory arrives in', () => {
    // The inventory arrives in the order the user added repositories, and the
    // list starts a new group whenever a row's group key differs from the row
    // above it. Interleaved like this, the unsorted mapping rendered the
    // `material` header twice with `Local` wedged between them, and handed
    // React two sibling headers carrying the same key.
    const rows = rowsFor(
      [
        repositoryAt({ id: 1, forge, path: '~/code/zebra' }),
        repositoryAt({ id: 2, path: '~/code/dotfiles' }),
        repositoryAt({ id: 3, forge, path: '~/code/alpha' }),
      ],
      { lastFetchedById: new Map<number, Date | null>() }
    )

    const keys = rows.map(row => row.groupKey)
    const headers = keys.filter(
      (key, index) => index === 0 || keys[index - 1] !== key
    )

    // One header per distinct group, which only holds if every group's rows
    // are adjacent.
    assert.deepEqual(headers, Array.from(new Set(keys)))
  })

  it('orders custom groups, then owners, then Local', () => {
    const rows = rowsFor(
      [
        repositoryAt({ id: 1 }),
        repositoryAt({ id: 2, forge }),
        repositoryAt({ id: 3, groupName: 'Work' }),
      ],
      { lastFetchedById: new Map<number, Date | null>() }
    )

    assert.deepEqual(
      rows.map(row => row.groupLabel),
      ['Work', 'material', 'Local']
    )
  })

  it('sorts within a group by the displayed name, case-insensitively', () => {
    const rows = rowsFor(
      [
        repositoryAt({ id: 1, path: '~/code/zebra' }),
        repositoryAt({ id: 2, path: '~/code/Alpha' }),
        repositoryAt({ id: 3, path: '~/code/mango', alias: 'beta' }),
      ],
      { lastFetchedById: new Map<number, Date | null>() }
    )

    assert.deepEqual(
      rows.map(row => row.name),
      ['Alpha', 'beta', 'zebra']
    )
  })

  it('never invents a language or a size it has not measured', () => {
    const [row] = rowsFor([repositoryAt()])

    assert.equal(row.language, '')
    assert.equal(row.sizeInMegabytes, null)
    const detail = md3RepositoryDetail(row)
    assert.match(detail, /Language not detected/)
    assert.match(detail, /size not measured/)
    assert.doesNotMatch(detail, /0 MB/)
  })
})

/**
 * The other half of the hidden-repository defect.
 *
 * The adapter honoured `hiddenRepositoryIds` all along; what was wrong was the
 * set handed to it — `app.tsx` built an empty one, so the Hidden flag could
 * never appear no matter how many repositories the user had hidden. The
 * sourcing now lives beside the pinned ids on the controller, and it is read on
 * demand: hiding happens from the classic picker's menu, which writes local
 * storage without telling this controller anything.
 */
describe('Md3RepositoriesController hidden ids', () => {
  const host = {
    getRepositories: () => [],
  } as unknown as IMd3RepositoriesControllerHost

  beforeEach(() => localStorage.clear())

  it('reads the repositories the user actually hid', () => {
    const controller = new Md3RepositoriesController(host)
    hideRepository(repositoryAt({ id: 2 }))
    hideRepository(repositoryAt({ id: 7 }))

    const hidden = controller.getHiddenIds()

    assert.equal(hidden.has(2), true)
    assert.equal(hidden.has(7), true)
    assert.equal(hidden.has(1), false)
  })

  it('sees a repository hidden after the controller was built', () => {
    const controller = new Md3RepositoriesController(host)
    assert.equal(controller.getHiddenIds().size, 0)

    hideRepository(repositoryAt({ id: 4 }))

    assert.equal(controller.getHiddenIds().has(4), true)
  })

  it('drops a repository the user unhid again', () => {
    const controller = new Md3RepositoriesController(host)
    const repository = repositoryAt({ id: 5 })
    hideRepository(repository)
    assert.equal(controller.getHiddenIds().has(5), true)

    unhideRepository(repository)

    assert.equal(controller.getHiddenIds().has(5), false)
  })

  it('is empty when nothing is hidden, rather than throwing', () => {
    const controller = new Md3RepositoriesController(host)

    assert.equal(controller.getHiddenIds().size, 0)
  })
})
