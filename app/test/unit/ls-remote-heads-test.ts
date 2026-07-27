import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  MaximumRemoteHeadBranches,
  parseLsRemoteHeads,
} from '../../src/lib/git/ls-remote-heads'

const sha = (fill: string) => fill.repeat(40)

describe('parseLsRemoteHeads', () => {
  it('parses branch heads and resolves the HEAD symref default', () => {
    const stdout = [
      `ref: refs/heads/main\tHEAD`,
      `${sha('a')}\tHEAD`,
      `${sha('a')}\trefs/heads/main`,
      `${sha('b')}\trefs/heads/release/v2`,
      `${sha('c')}\trefs/heads/feature/branch-picker`,
    ].join('\n')

    const listing = parseLsRemoteHeads(stdout)
    assert.equal(listing.defaultBranch, 'main')
    assert.equal(listing.truncated, false)
    assert.deepEqual(listing.branches, [
      { name: 'main', sha: sha('a') },
      { name: 'release/v2', sha: sha('b') },
      { name: 'feature/branch-picker', sha: sha('c') },
    ])
  })

  it('accepts CRLF output and SHA-256 object ids', () => {
    const sha256 = 'f'.repeat(64)
    const listing = parseLsRemoteHeads(
      `ref: refs/heads/trunk\tHEAD\r\n${sha256}\trefs/heads/trunk\r\n`
    )
    assert.equal(listing.defaultBranch, 'trunk')
    assert.deepEqual(listing.branches, [{ name: 'trunk', sha: sha256 }])
  })

  it('returns an empty listing for an empty repository', () => {
    for (const stdout of ['', '\n']) {
      const listing = parseLsRemoteHeads(stdout)
      assert.deepEqual(listing.branches, [])
      assert.equal(listing.defaultBranch, null)
      assert.equal(listing.truncated, false)
    }
  })

  it('skips malformed and out-of-scope lines without throwing', () => {
    const stdout = [
      // Tags, peeled entries, and non-head symrefs are out of scope.
      `${sha('a')}\trefs/tags/v1.0.0`,
      `${sha('a')}\trefs/tags/v1.0.0^{}`,
      `ref: refs/remotes/origin/main\trefs/remotes/origin/HEAD`,
      // Malformed: bad SHA, missing tab, trailing garbage, empty name.
      `not-a-sha\trefs/heads/broken`,
      `${sha('b')} refs/heads/spaces-not-tab`,
      'warning: something unexpected',
      `${sha('c')}\trefs/heads/`,
      // One valid head so the parse result is observable.
      `${sha('d')}\trefs/heads/valid`,
    ].join('\n')

    const listing = parseLsRemoteHeads(stdout)
    assert.equal(listing.defaultBranch, null)
    assert.deepEqual(listing.branches, [{ name: 'valid', sha: sha('d') }])
  })

  it('caps the branch list, reports truncation, and keeps a late symref', () => {
    const stdout = [
      `${sha('a')}\trefs/heads/one`,
      `${sha('b')}\trefs/heads/two`,
      `${sha('c')}\trefs/heads/three`,
      `ref: refs/heads/two\tHEAD`,
    ].join('\n')

    const listing = parseLsRemoteHeads(stdout, 2)
    assert.equal(listing.truncated, true)
    assert.deepEqual(
      listing.branches.map(branch => branch.name),
      ['one', 'two']
    )
    assert.equal(listing.defaultBranch, 'two')
  })

  it('bounds an adversarial listing at the default cap', () => {
    assert.equal(MaximumRemoteHeadBranches, 5000)
    const lines = new Array<string>()
    for (let i = 0; i < MaximumRemoteHeadBranches + 1; i++) {
      lines.push(`${sha('e')}\trefs/heads/branch-${i}`)
    }

    const listing = parseLsRemoteHeads(lines.join('\n'))
    assert.equal(listing.branches.length, MaximumRemoteHeadBranches)
    assert.equal(listing.truncated, true)
  })
})
