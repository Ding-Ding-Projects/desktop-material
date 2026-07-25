import assert from 'node:assert'
import { describe, it } from 'node:test'
import { SemVer } from 'semver'
import {
  compareReleaseVersions,
  createReleaseVersion,
  filterReleasesManifest,
  selectHighestReleaseTag,
} from './release-version'

const sha = (digit: string) => digit.repeat(40)

const entry = (name: string, digit: string, size = 326312175) =>
  `${sha(digit)} ${name} ${size}`

describe('release version ordering', () => {
  it('moves every legacy release lane onto one newer Squirrel namespace', () => {
    const candidate = createReleaseVersion('3.6.3-beta3', '29976419466')

    assert.equal(candidate, '3.6.3-beta3-zadtazjjug')
    assert.match(candidate, /-z[a-z]{9}$/)
    for (const legacy of [
      '3.6.3-beta3-b0000000270',
      '3.6.3-beta3-b0000040887',
      '3.6.3-beta3-s000000000201',
      '3.6.3-beta3-s000000000301',
    ]) {
      assert.equal(compareReleaseVersions(candidate, legacy), 1)
      assert.ok(new SemVer(candidate).compare(new SemVer(legacy)) > 0)
    }
  })

  it('encodes a fixed-width run ID without changing rerun identity', () => {
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '1'),
      '3.6.3-beta3-zaaaaaaaab'
    )
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '29976419466'),
      createReleaseVersion('3.6.3-beta3', '29976419466')
    )
    assert.equal(
      compareReleaseVersions(
        createReleaseVersion('3.6.3-beta3', '29976419467'),
        createReleaseVersion('3.6.3-beta3', '29976419466')
      ),
      1
    )
    assert.equal(
      compareReleaseVersions(
        createReleaseVersion('3.6.3-beta3', '26'),
        createReleaseVersion('3.6.3-beta3', '25')
      ),
      1
    )
    assert.equal(
      compareReleaseVersions(
        createReleaseVersion('3.6.3-beta3', '8031810176'),
        createReleaseVersion('3.6.3-beta3', '8031810175')
      ),
      1
    )
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '999999999999'),
      '3.6.3-beta3-zeundisyvn'
    )
  })

  it('fails closed on unsafe IDs and package bases', () => {
    for (const runId of ['', '0', '01', '-1', '1.5', 'abc', '1000000000000']) {
      assert.throws(() => createReleaseVersion('3.6.3-beta3', runId))
    }

    assert.throws(() => createReleaseVersion('3.6.3', '1'))
    assert.throws(() => createReleaseVersion('3.6.3-extra-long-channel', '1'))
  })

  it('selects the greatest valid same-source release regardless of finish order', () => {
    assert.equal(
      selectHighestReleaseTag([
        'v3.6.3-beta3-zadtazjjuh',
        'v3.6.3-beta3-s000000000301',
        'v3.6.3-beta3-zadtazjjuf',
        'v3.6.3-beta3-zadtazjjug',
      ]),
      'v3.6.3-beta3-zadtazjjuh'
    )
    assert.throws(() => selectHighestReleaseTag([]))
    assert.throws(() => selectHighestReleaseTag(['not-a-release']))
  })
})

describe('published RELEASES manifest', () => {
  it('publishes only this package at exactly this release version', () => {
    const current = entry(
      'GitHubDesktop-3.6.3-beta3-zadtorqoxa-full.nupkg',
      'a'
    )

    assert.equal(
      filterReleasesManifest(
        [
          entry('GitHubDesktop-3.6.2-full.nupkg', 'b', 294717903),
          current,
          entry('GitHubDesktop-3.6.3-beta3-zadtjbevjx-full.nupkg', 'c'),
          entry('GitHubDesktop-3.6.3-beta3-b0000040888-full.nupkg', 'd'),
          entry('GitHubDesktop-3.6.3-beta3-s000000000401-full.nupkg', 'e'),
          entry('SomeOtherApp-9.9.9-full.nupkg', 'f'),
          '',
        ].join('\n'),
        '3.6.3-beta3-zadtorqoxa'
      ),
      `${current}\n`
    )
  })

  it('keeps the delta package that belongs to the same release', () => {
    const full = entry('GitHubDesktop-3.6.3-beta3-zadtofsepy-full.nupkg', 'a')
    const delta = entry(
      'GitHubDesktop-3.6.3-beta3-zadtofsepy-delta.nupkg',
      'b',
      1024
    )

    assert.equal(
      filterReleasesManifest(`${full}\n${delta}\n`, '3.6.3-beta3-zadtofsepy'),
      `${full}\n${delta}\n`
    )
  })

  it('ignores Squirrel staging comments without losing the entry', () => {
    const current = entry(
      'GitHubDesktop-3.6.3-beta3-zadtorqoxa-full.nupkg',
      'a'
    )

    assert.equal(
      filterReleasesManifest(`${current} # 0.25\r\n`, '3.6.3-beta3-zadtorqoxa'),
      `${current}\n`
    )
  })

  it('fails the release rather than publishing an unvetted manifest', () => {
    // A manifest that names only an older lane would tell every install to
    // move backwards onto it.
    assert.throws(
      () =>
        filterReleasesManifest(
          entry('GitHubDesktop-3.6.2-full.nupkg', 'b', 294717903),
          '3.6.3-beta3-zadtorqoxa'
        ),
      /advertises no GitHubDesktop 3\.6\.3-beta3-zadtorqoxa package/
    )

    assert.throws(
      () => filterReleasesManifest('', '3.6.3-beta3-zadtorqoxa'),
      /advertises no GitHubDesktop/
    )

    assert.throws(
      () =>
        filterReleasesManifest('not-a-manifest-line', '3.6.3-beta3-zadtorqoxa'),
      /Unreadable Squirrel RELEASES entry/
    )

    assert.throws(() =>
      filterReleasesManifest(
        entry('GitHubDesktop-3.6.3-beta3-zadtorqoxa-full.nupkg', 'a'),
        'not-a-version'
      )
    )
  })
})
