import assert from 'node:assert'
import { describe, it } from 'node:test'

import { CloningRepository } from '../../src/models/cloning-repository'
import { Repository } from '../../src/models/repository'
import { getGroupKey } from '../../src/ui/repositories-list/group-repositories'
import {
  customRepositoryGroupKeyName,
  customRepositoryGroupNames,
  isCustomRepositoryGroupKey,
  MaxRepositoryGroupNameLength,
  normalizeRepositoryGroupName,
  planRepositoryGroupAssignments,
  planRepositoryGroupRemoval,
  repositoriesInCustomGroup,
} from '../../src/ui/repositories-list/repository-group-actions'

/** A local repository carrying an optional custom group label. */
function repo(path: string, id: number, groupName: string | null): Repository {
  return new Repository(
    path,
    id,
    null,
    false,
    null,
    undefined,
    false,
    undefined,
    null,
    undefined,
    groupName
  )
}

const alpha = repo('/work/alpha', 1, 'Work')
const beta = repo('/work/beta', 2, 'work')
const gamma = repo('/work/gamma', 3, 'Later')
const delta = repo('/work/delta', 4, null)
const cloning = new CloningRepository(
  '/work/cloning',
  'https://example.test/cloning.git'
)
const repositories = [alpha, beta, gamma, delta, cloning]

describe('repository group keys', () => {
  it('recognizes only the custom group key produced by getGroupKey', () => {
    const customKey = getGroupKey({ kind: 'custom', name: 'Work' })
    assert.equal(isCustomRepositoryGroupKey(customKey), true)
    assert.equal(customRepositoryGroupKeyName(customKey), 'work')

    for (const key of [
      getGroupKey({ kind: 'pinned' }),
      getGroupKey({ kind: 'recent' }),
      getGroupKey({ kind: 'other' }),
      getGroupKey({ kind: 'enterprise', host: 'git.example.test' }),
    ]) {
      assert.equal(isCustomRepositoryGroupKey(key), false)
      assert.equal(customRepositoryGroupKeyName(key), null)
    }
  })

  it('collapses whitespace and bounds a requested group name', () => {
    assert.equal(
      normalizeRepositoryGroupName('  Client   work '),
      'Client work'
    )
    assert.equal(
      normalizeRepositoryGroupName(
        'x'.repeat(MaxRepositoryGroupNameLength + 20)
      )?.length,
      MaxRepositoryGroupNameLength
    )
    for (const value of ['', '   ', '\t\n', null, undefined, 7, []]) {
      assert.equal(normalizeRepositoryGroupName(value), null)
    }
  })
})

describe('repository group membership', () => {
  it('folds case the same way the group key does', () => {
    assert.deepEqual(
      repositoriesInCustomGroup(repositories, 'WORK').map(r => r.name),
      ['alpha', 'beta']
    )
  })

  it('lists every custom group name once, ignoring cloning rows', () => {
    assert.deepEqual(customRepositoryGroupNames(repositories), [
      'Later',
      'Work',
    ])
  })
})

describe('planRepositoryGroupAssignments', () => {
  it('creates a group by labelling exactly the chosen repositories', () => {
    const assignments = planRepositoryGroupAssignments(
      repositories,
      null,
      'Client',
      new Set([3, 4])
    )
    assert.deepEqual(
      assignments.map(a => [a.repository.name, a.groupName]),
      [
        ['gamma', 'Client'],
        ['delta', 'Client'],
      ]
    )
  })

  it('renames a group without disturbing its membership', () => {
    const assignments = planRepositoryGroupAssignments(
      repositories,
      'Work',
      'Client work',
      new Set([1, 2])
    )
    assert.deepEqual(
      assignments.map(a => [a.repository.name, a.groupName]),
      [
        ['alpha', 'Client work'],
        ['beta', 'Client work'],
      ]
    )
  })

  it('clears only the members it drops, and never touches another group', () => {
    const assignments = planRepositoryGroupAssignments(
      repositories,
      'Work',
      'Work',
      new Set([1])
    )
    assert.deepEqual(
      assignments.map(a => [a.repository.name, a.groupName]),
      [['beta', null]]
    )
    // gamma belongs to a different custom group and is left completely alone.
    assert.equal(
      assignments.some(a => a.repository.name === 'gamma'),
      false
    )
  })

  it('writes nothing when the membership is already what was asked for', () => {
    assert.deepEqual(
      planRepositoryGroupAssignments(
        [alpha, beta],
        'Work',
        'Work',
        new Set([1, 2])
      ).map(a => [a.repository.name, a.groupName]),
      // alpha already reads "Work"; beta reads "work" and is re-cased to match.
      [['beta', 'Work']]
    )
  })
})

describe('planRepositoryGroupRemoval', () => {
  it('clears every member label and can produce no other value', () => {
    const assignments = planRepositoryGroupRemoval(repositories, 'Work')
    assert.deepEqual(
      assignments.map(a => a.repository.name),
      ['alpha', 'beta']
    )
    assert.equal(
      assignments.every(a => a.groupName === null),
      true
    )
  })

  it('keeps every repository in the list', () => {
    const assignments = planRepositoryGroupRemoval(repositories, 'Work')
    const touched = new Set(assignments.map(a => a.repository.id))
    // Removal is a label edit: the planner names repositories to re-label and
    // has no way to express "remove this repository from the list" at all.
    assert.equal(touched.size, 2)
    assert.deepEqual(
      repositories.filter(r => r instanceof Repository).map(r => r.id),
      [1, 2, 3, 4]
    )
  })

  it('plans nothing for a group nobody is in', () => {
    assert.deepEqual(planRepositoryGroupRemoval(repositories, 'Ghost'), [])
  })
})
