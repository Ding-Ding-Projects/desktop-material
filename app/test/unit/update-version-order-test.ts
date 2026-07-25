import assert from 'node:assert'
import { describe, it } from 'node:test'
import { SemVer } from 'semver'
import { compareReleaseVersions } from '../../../script/release-version'
import {
  compareUpdateVersionStrings,
  getReleasesManifestURL,
  judgeUpdateFeed,
  parseReleasesManifest,
  parseUpdateVersion,
  probeUpdateFeed,
  readBoundedManifest,
  ReleasesManifestMaximumBytes,
} from '../../src/lib/update-version-order'

// Versions this install base has actually run through, newest last.
const installedLanes = [
  '3.6.2',
  '3.6.3-beta3-b0000000270',
  '3.6.3-beta3-b0000040888',
  '3.6.3-beta3-s000000000401',
  '3.6.3-beta3-zadtjbevjx',
  '3.6.3-beta3-zadtofsepy',
  '3.6.3-beta3-zadtorqoxa',
]

const sha = (digit: string) => digit.repeat(40)

const entry = (name: string, digit = 'a', size = 326312175) =>
  `${sha(digit)} ${name} ${size}`

const nupkg = (version: string) => `GitHubDesktop-${version}-full.nupkg`

function manifestResponse(body: string, init: ResponseInit = {}) {
  return new Response(new TextEncoder().encode(body), init)
}

describe('Squirrel update version ordering', () => {
  it('ranks the fork release lanes the way the release pipeline does', () => {
    for (const version of installedLanes) {
      assert.notEqual(parseUpdateVersion(version), null)
    }

    for (let index = 1; index < installedLanes.length; index++) {
      const older = installedLanes[index - 1]
      const newer = installedLanes[index]
      assert.equal(
        compareUpdateVersionStrings(newer, older),
        1,
        `${newer} should outrank ${older}`
      )
      assert.equal(compareUpdateVersionStrings(older, newer), -1)
      assert.equal(
        compareUpdateVersionStrings(newer, older),
        compareReleaseVersions(newer, older),
        `${newer} vs ${older} must match script/release-version.js`
      )
    }
  })

  it('keeps a prerelease of a higher patch above the stable release below it', () => {
    // The 3.6.2 package still sitting in Squirrel's local package cache must
    // never outrank a 3.6.3 prerelease, in this comparer or in semver's.
    for (const beta of ['3.6.3-beta3-zadtjbevjx', '3.6.3-beta3-zadtofsepy']) {
      assert.equal(compareUpdateVersionStrings('3.6.2', beta), -1)
      assert.ok(new SemVer(beta).compare(new SemVer('3.6.2')) > 0)
    }

    // ...while a stable release still outranks its own prereleases.
    assert.equal(
      compareUpdateVersionStrings('3.6.3', '3.6.3-beta3-zadtorqoxa'),
      1
    )
    assert.equal(compareUpdateVersionStrings('3.6.3', '3.6.3.0'), 0)
  })

  it('reports unreadable versions instead of guessing an order', () => {
    assert.equal(parseUpdateVersion('latest'), null)
    assert.equal(parseUpdateVersion(''), null)
    assert.equal(compareUpdateVersionStrings('3.6.2', 'latest'), null)
    assert.equal(compareUpdateVersionStrings('latest', '3.6.2'), null)
  })
})

describe('Squirrel RELEASES manifest', () => {
  it('reads the live feed manifest shape', () => {
    // Byte-for-byte what the fork's releases/latest/download/RELEASES served.
    const live =
      '6C3349F0B42AD9F3466E80687B7DF6D30AFA984A GitHubDesktop-3.6.3-beta3-zadtorqoxa-full.nupkg 326312175'

    assert.deepEqual(parseReleasesManifest(live), [
      {
        fileName: 'GitHubDesktop-3.6.3-beta3-zadtorqoxa-full.nupkg',
        version: '3.6.3-beta3-zadtorqoxa',
        isDelta: false,
      },
    ])
  })

  it('ignores foreign packages, staging comments and junk lines', () => {
    const entries = parseReleasesManifest(
      [
        `${entry(nupkg('3.6.3-beta3-zadtorqoxa'))} # 0.5`,
        entry('SomeOtherApp-9.9.9-full.nupkg', 'b'),
        entry('GitHubDesktop-3.6.3-beta3-zadtofsepy-delta.nupkg', 'c', 4096),
        'not a manifest line at all',
        '',
      ].join('\r\n')
    )

    assert.deepEqual(
      entries.map(e => `${e.version}${e.isDelta ? ' (delta)' : ''}`),
      ['3.6.3-beta3-zadtorqoxa', '3.6.3-beta3-zadtofsepy (delta)']
    )
  })

  it('judges a feed by the highest entry, as Squirrel does', () => {
    const running = '3.6.3-beta3-zadtjbevjx'

    assert.deepEqual(
      judgeUpdateFeed(running, entry(nupkg('3.6.3-beta3-zadtorqoxa'))),
      { kind: 'upgrade', version: '3.6.3-beta3-zadtorqoxa' }
    )
    assert.deepEqual(judgeUpdateFeed(running, entry(nupkg(running))), {
      kind: 'current',
      version: running,
    })
    // The exact regression this guard exists for.
    assert.deepEqual(
      judgeUpdateFeed(running, entry(nupkg('3.6.2'), 'b', 294717903)),
      { kind: 'downgrade', version: '3.6.2' }
    )
    // A newer entry alongside an older one is still an upgrade, because that
    // is the entry Squirrel would install.
    assert.deepEqual(
      judgeUpdateFeed(
        running,
        [
          entry(nupkg('3.6.2'), 'b', 294717903),
          entry(nupkg('3.6.3-beta3-zadtorqoxa'), 'c'),
        ].join('\n')
      ),
      { kind: 'upgrade', version: '3.6.3-beta3-zadtorqoxa' }
    )
  })

  it('concludes nothing from a feed it cannot read', () => {
    assert.deepEqual(
      judgeUpdateFeed('3.6.3-beta3-zadtjbevjx', '<html>404</html>'),
      { kind: 'indeterminate' }
    )
    assert.deepEqual(judgeUpdateFeed('3.6.3-beta3-zadtjbevjx', ''), {
      kind: 'indeterminate',
    })
    assert.deepEqual(
      judgeUpdateFeed(
        '3.6.3-beta3-zadtjbevjx',
        entry('SomeOtherApp-9.9.9-full.nupkg')
      ),
      { kind: 'indeterminate' }
    )
    assert.deepEqual(judgeUpdateFeed('not-a-version', entry(nupkg('3.6.2'))), {
      kind: 'indeterminate',
    })
  })
})

describe('update feed manifest URL', () => {
  it('resolves RELEASES against the feed and keeps the query', () => {
    // Exactly the URL Squirrel logged fetching, trailing slash and all.
    assert.equal(
      getReleasesManifestURL(
        'https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/?guid=55be34c8'
      ),
      'https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/RELEASES?guid=55be34c8'
    )
    // No trailing slash means the last segment is replaced, which is Squirrel's
    // own relative-reference behaviour rather than a convenience of ours.
    assert.equal(
      getReleasesManifestURL('http://127.0.0.1:51789/update'),
      'http://127.0.0.1:51789/RELEASES'
    )
  })

  it('refuses anything that is not an http(s) feed', () => {
    assert.equal(getReleasesManifestURL('file:///tmp/RELEASES'), null)
    assert.equal(getReleasesManifestURL('not a url'), null)
  })
})

describe('bounded manifest read', () => {
  it('reads a manifest and refuses an oversized or failed response', async () => {
    const body = entry(nupkg('3.6.3-beta3-zadtorqoxa'))

    assert.equal(await readBoundedManifest(manifestResponse(body)), body)
    assert.equal(
      await readBoundedManifest(manifestResponse(body, { status: 404 })),
      null
    )
    assert.equal(await readBoundedManifest(manifestResponse(body), 4), null)
    assert.equal(
      await readBoundedManifest(
        manifestResponse(body, {
          headers: { 'content-length': `${ReleasesManifestMaximumBytes + 1}` },
        })
      ),
      null
    )
  })
})

describe('update feed downgrade guard', () => {
  const feedURL =
    'https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/'

  it('flags the regression and names the manifest it fetched', async () => {
    const requested = new Array<string>()
    const verdict = await probeUpdateFeed({
      feedURL,
      currentVersion: '3.6.3-beta3-zadtjbevjx',
      fetcher: async input => {
        requested.push(String(input))
        return manifestResponse(entry(nupkg('3.6.2'), 'b', 294717903))
      },
    })

    assert.deepEqual(verdict, { kind: 'downgrade', version: '3.6.2' })
    assert.deepEqual(requested, [`${feedURL}RELEASES`])
  })

  it('lets a genuine upgrade through', async () => {
    assert.deepEqual(
      await probeUpdateFeed({
        feedURL,
        currentVersion: '3.6.3-beta3-zadtjbevjx',
        fetcher: async () =>
          manifestResponse(entry(nupkg('3.6.3-beta3-zadtorqoxa'))),
      }),
      { kind: 'upgrade', version: '3.6.3-beta3-zadtorqoxa' }
    )
  })

  it('fails open so a broken feed never blocks an update check', async () => {
    for (const fetcher of [
      async () => {
        throw new Error('offline')
      },
      async () => manifestResponse('nope', { status: 500 }),
      async () => manifestResponse('<html>hello</html>'),
    ]) {
      assert.deepEqual(
        await probeUpdateFeed({
          feedURL,
          currentVersion: '3.6.3-beta3-zadtjbevjx',
          fetcher,
        }),
        { kind: 'indeterminate' }
      )
    }

    assert.deepEqual(
      await probeUpdateFeed({
        feedURL: 'file:///tmp/',
        currentVersion: '3.6.3-beta3-zadtjbevjx',
        fetcher: async () => {
          throw new Error('should not be fetched')
        },
      }),
      { kind: 'indeterminate' }
    )
  })
})
