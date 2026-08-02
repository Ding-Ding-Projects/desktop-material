import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'

import {
  collapsibleRepositoryKey,
  readCollapsibleState,
  writeCollapsibleState,
} from '../../src/lib/collapsed-state'

describe('per-repository collapsed state', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps one repository from redeciding another', () => {
    writeCollapsibleState('releases-stats', '/work/alpha', false)

    // The whole point: collapsing a panel for the repository with two
    // workflows must not collapse it for the one with sixty.
    assert.equal(readCollapsibleState('releases-stats', '/work/alpha'), false)
    assert.equal(
      readCollapsibleState('releases-stats', '/work/beta'),
      undefined
    )
  })

  it('keeps one element from redeciding another', () => {
    writeCollapsibleState('releases-stats', '/work/alpha', false)

    // Collapsing the release stats says nothing about whether the Actions
    // filters should also be closed.
    assert.equal(
      readCollapsibleState('actions-filters', '/work/alpha'),
      undefined
    )
  })

  it('falls back to a pre-existing global choice exactly once', () => {
    window.localStorage.setItem('github-releases-tools-expanded', '0')

    // A user who collapsed this before it became per-repository should not
    // have that silently discarded the first time they open a repository.
    assert.equal(
      readCollapsibleState('releases-tools', '/work/alpha', {
        legacyKey: 'github-releases-tools-expanded',
      }),
      false
    )

    // …but the moment they choose for this repository, that wins, and the old
    // key stops mattering rather than being written back over.
    writeCollapsibleState('releases-tools', '/work/alpha', true)
    assert.equal(
      readCollapsibleState('releases-tools', '/work/alpha', {
        legacyKey: 'github-releases-tools-expanded',
      }),
      true
    )
    assert.equal(
      window.localStorage.getItem('github-releases-tools-expanded'),
      '0',
      'the legacy key is read, never rewritten'
    )
  })

  it('reports the default when nothing has been chosen', () => {
    assert.equal(readCollapsibleState('anything', '/work/alpha'), undefined)
    assert.equal(
      readCollapsibleState('anything', '/work/alpha', {
        defaultExpanded: false,
      }),
      false
    )
  })

  it('still persists for a surface outside any repository', () => {
    // A shared bucket beats not persisting at all: a dialog that is not
    // repository-scoped should still remember what you did to it.
    writeCollapsibleState('clone-shallow', undefined, false)
    assert.equal(readCollapsibleState('clone-shallow', undefined), false)
    assert.equal(readCollapsibleState('clone-shallow', ''), false)
  })

  it('files state under the path, not the database id', () => {
    // The numeric id changes when a repository is removed and re-added, which
    // would quietly lose every disclosure the user had set for it.
    assert.equal(
      collapsibleRepositoryKey({ path: '/work/alpha' }),
      '/work/alpha'
    )
    assert.equal(collapsibleRepositoryKey(null), undefined)
    assert.equal(collapsibleRepositoryKey(undefined), undefined)
    assert.equal(collapsibleRepositoryKey({ path: '' }), undefined)
  })
})
