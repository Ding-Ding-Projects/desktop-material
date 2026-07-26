import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  releaseSortTime,
  ReleaseSortOrder,
  sortReleases,
} from '../../src/lib/github-release-sort'
import { IGitHubRelease } from '../../src/lib/github-releases'
import { FilterMode, matchWithMode } from '../../src/lib/fuzzy-find'

function release(
  id: number,
  name: string,
  published: string | null,
  created: string = '2020-01-01T00:00:00Z'
): IGitHubRelease {
  return {
    id,
    tagName: `v0.${id}.0`,
    targetCommitish: 'main',
    name,
    body: 'Notes',
    draft: published === null,
    prerelease: false,
    createdAt: new Date(created),
    publishedAt: published === null ? null : new Date(published),
    authorLogin: 'fixture-bot',
    assets: [],
  }
}

const oldest = release(1, 'Alpha', '2024-01-01T00:00:00Z')
const middle = release(2, 'Bravo', '2025-01-01T00:00:00Z')
const newest = release(3, 'Zephyr', '2026-01-01T00:00:00Z')
const catalog = [middle, newest, oldest]

describe('release sort order', () => {
  it('defaults to newest first, matching the historical order', () => {
    assert.deepEqual(
      sortReleases(catalog, ReleaseSortOrder.Newest).map(entry => entry.id),
      [3, 2, 1]
    )
  })

  it('reverses to oldest first without mutating the caller list', () => {
    const source = [...catalog]
    assert.deepEqual(
      sortReleases(source, ReleaseSortOrder.Oldest).map(entry => entry.id),
      [1, 2, 3]
    )
    assert.deepEqual(
      source.map(entry => entry.id),
      catalog.map(entry => entry.id)
    )
  })

  it('orders an unpublished draft by when it was created', () => {
    // A draft has no published date; without the fallback every draft would
    // drift to one end of the list regardless of the chosen order.
    const draft = release(4, 'Draft', null, '2025-06-01T00:00:00Z')
    assert.equal(releaseSortTime(draft), new Date('2025-06-01').getTime())
    assert.deepEqual(
      sortReleases([...catalog, draft], ReleaseSortOrder.Newest).map(
        entry => entry.id
      ),
      [3, 4, 2, 1]
    )
  })

  it('breaks ties on id so the order never flickers between renders', () => {
    const first = release(7, 'Same', '2025-05-05T00:00:00Z')
    const second = release(8, 'Same', '2025-05-05T00:00:00Z')
    assert.deepEqual(
      sortReleases([first, second], ReleaseSortOrder.Newest).map(
        entry => entry.id
      ),
      [8, 7]
    )
    assert.deepEqual(
      sortReleases([second, first], ReleaseSortOrder.Newest).map(
        entry => entry.id
      ),
      [8, 7]
    )
    assert.deepEqual(
      sortReleases([second, first], ReleaseSortOrder.Oldest).map(
        entry => entry.id
      ),
      [7, 8]
    )
  })

  it('composes with the search filter instead of replacing it', () => {
    // The filter decides which releases are shown; the sort only decides the
    // order of what survived. Ordering the unfiltered catalog would silently
    // reintroduce releases the operator filtered out.
    const filtered = matchWithMode(
      'a',
      catalog,
      entry => [`${entry.name} ${entry.tagName}`, entry.body],
      { mode: FilterMode.Substring, caseSensitive: true }
    )
    const matched = filtered.results.map(match => match.item)
    assert.deepEqual(matched.map(entry => entry.id).sort(), [1, 2])

    assert.deepEqual(
      sortReleases(matched, ReleaseSortOrder.Newest).map(entry => entry.id),
      [2, 1]
    )
    assert.deepEqual(
      sortReleases(matched, ReleaseSortOrder.Oldest).map(entry => entry.id),
      [1, 2]
    )
  })
})
