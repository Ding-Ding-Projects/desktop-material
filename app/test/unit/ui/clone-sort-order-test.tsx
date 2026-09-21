import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import { IAPIIdentity, IAPIRepository } from '../../../src/lib/api'
import { match } from '../../../src/lib/fuzzy-find'
import {
  CloneRepositorySortOrder,
  groupRepositories,
} from '../../../src/ui/clone-repository/group-repositories'
import { shouldPreserveCloneRepositoryFilterOrder } from '../../../src/ui/clone-repository/cloneable-repository-filter-list'
import {
  persistCloneRepositorySortOrder,
  readPersistedCloneRepositorySortOrder,
} from '../../../src/ui/clone-repository/clone-repository-sort'
import { preserveMatchOrder } from '../../../src/ui/lib/section-filter-list'

const SortStorageKey = 'clone-repository-sort-order'

const owner: IAPIIdentity = {
  id: 1,
  login: 'octocat',
  avatar_url: '',
  html_url: '',
  type: 'User',
}

const anotherOwner: IAPIIdentity = { ...owner, id: 2, login: 'acme' }

function repository(
  name: string,
  overrides: Partial<IAPIRepository> = {}
): IAPIRepository {
  return {
    clone_url: `https://github.com/${owner.login}/${name}.git`,
    ssh_url: '',
    html_url: `https://github.com/${owner.login}/${name}`,
    name,
    owner,
    private: false,
    fork: false,
    default_branch: 'main',
    pushed_at: '2020-01-01T00:00:00Z',
    has_issues: true,
    archived: false,
    ...overrides,
  }
}

function names(
  repositories: ReadonlyArray<IAPIRepository>,
  order: CloneRepositorySortOrder
) {
  return groupRepositories(repositories, 'octocat', order).map(group => ({
    identifier: group.identifier,
    names: group.items.map(item => item.name),
  }))
}

afterEach(() => localStorage.removeItem(SortStorageKey))

describe('clone repository sorting edge cases', () => {
  it('keeps invalid and null timestamps last and does not mutate the API array', () => {
    const repositories = [
      repository('null', { updated_at: null as unknown as string }),
      repository('invalid', { updated_at: 'not-a-date' }),
      repository('newest', { updated_at: '2026-09-20T00:00:00Z' }),
    ]
    const originalNames = repositories.map(repository => repository.name)

    assert.deepStrictEqual(
      names(repositories, CloneRepositorySortOrder.ModifiedNewest)[0].names,
      ['newest', 'invalid', 'null']
    )
    assert.deepStrictEqual(
      repositories.map(repository => repository.name),
      originalNames
    )
  })

  it('groups equivalent offset timestamps by their UTC day', () => {
    const repositories = [
      repository('alpha', { updated_at: '2026-09-20T00:30:00+02:00' }),
      repository('bravo', { updated_at: '2026-09-19T23:00:00Z' }),
      repository('charlie', { updated_at: '2026-09-20T00:01:00Z' }),
    ]

    assert.deepStrictEqual(
      names(repositories, CloneRepositorySortOrder.ModifiedDay)[0].names,
      ['charlie', 'alpha', 'bravo']
    )
  })

  it('preserves owner groups and resolves name ties with clone URLs', () => {
    const duplicateUpper = repository('ALPHA')
    const duplicateLower = repository('alpha', {
      clone_url: 'https://github.com/octocat/0-alpha.git',
    })
    const organizationRepository = repository('zebra', { owner: anotherOwner })

    assert.deepStrictEqual(
      names(
        [duplicateUpper, organizationRepository, duplicateLower],
        CloneRepositorySortOrder.AlphabeticalAscending
      ),
      [
        { identifier: 'your-repositories', names: ['alpha', 'ALPHA'] },
        { identifier: 'acme', names: ['zebra'] },
      ]
    )
  })
})

describe('clone repository sort persistence', () => {
  it('round-trips a valid persisted choice and repairs an invalid value', () => {
    persistCloneRepositorySortOrder(CloneRepositorySortOrder.CreatedOldest)
    assert.equal(
      readPersistedCloneRepositorySortOrder(),
      CloneRepositorySortOrder.CreatedOldest
    )

    localStorage.setItem(SortStorageKey, 'invalid')
    assert.equal(
      readPersistedCloneRepositorySortOrder(),
      CloneRepositorySortOrder.AlphabeticalAscending
    )
  })
})

describe('preserveMatchOrder', () => {
  it('keeps an explicit A to Z choice while fuzzy filtering', () => {
    assert.equal(
      shouldPreserveCloneRepositoryFilterOrder(
        CloneRepositorySortOrder.AlphabeticalAscending
      ),
      true
    )
    assert.equal(shouldPreserveCloneRepositoryFilterOrder(undefined), false)
  })

  it('retains the caller order while keeping real fuzzy match metadata', () => {
    const items = [
      { id: '1', text: ['zebra'] },
      { id: '2', text: ['alphabet'] },
      { id: '3', text: ['alpine'] },
    ]
    const fuzzyMatches = match('alp', items, item => item.text)
    const ordered = preserveMatchOrder(items, fuzzyMatches)

    assert.deepStrictEqual(
      ordered.map(match => match.item.id),
      ['2', '3']
    )
    assert.ok(ordered.every(match => match.matches.title.length > 0))
  })
})
