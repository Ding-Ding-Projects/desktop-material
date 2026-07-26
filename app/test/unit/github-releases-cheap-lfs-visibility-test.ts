import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'github-releases',
    'github-releases-view.tsx'
  ),
  'utf8'
)

describe('GitHub Releases Cheap LFS visibility', () => {
  it('hides proven storage buckets by default without filtering the store', () => {
    assert.match(source, /showCheapLfsReleases: false/)
    assert.match(source, /isCheapLfsReleaseBucket/)
    assert.match(source, /this\.getReleaseVisibility\(\)\.releases/)
    assert.doesNotMatch(
      source,
      /releasesStore\.list\([^)]*isCheapLfsReleaseBucket/
    )
  })

  it('clears hidden detail and bulk selections when storage releases hide', () => {
    assert.match(source, /selectedReleaseHidden/)
    assert.match(source, /filter\(id => !hiddenIds\.has\(id\)\)/)
    assert.match(source, /Cheap LFS storage releases are hidden/)
  })
})
