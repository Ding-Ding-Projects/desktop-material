import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  getGitHubReleaseFingerprint,
  parseGitHubReleaseList,
} from '../../src/lib/github-releases'

const rawRelease = {
  id: 7,
  tag_name: 'assets',
  target_commitish: 'main',
  name: 'assets',
  body: '',
  draft: true,
  prerelease: false,
  created_at: '2026-07-13T09:00:00Z',
  published_at: null,
  html_url: 'https://github.com/desktop/material/releases/tag/untagged-fixture',
  author: { login: 'fixture-bot' },
  assets: [],
}

describe('GitHub Release web URL', () => {
  it('normalizes and fingerprints the provider-supplied release page', () => {
    const parsed = parseGitHubReleaseList([rawRelease], 1).releases[0]

    assert.equal(parsed.htmlURL, rawRelease.html_url)
    assert.notEqual(
      getGitHubReleaseFingerprint(parsed),
      getGitHubReleaseFingerprint({
        ...parsed,
        htmlURL:
          'https://github.com/desktop/material/releases/tag/untagged-changed',
      })
    )
  })
})
