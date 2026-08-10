import assert from 'node:assert'
import { describe, it } from 'node:test'
import { SemVer } from 'semver'
import {
  compareReleaseVersions,
  createReleaseVersion,
  filterReleasesManifest,
  selectHighestReleaseTag,
  validateReleaseVersion,
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

  it('encodes a fixed-width run ID and separates rerun attempts', () => {
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '1'),
      '3.6.3-beta3-zaaaaaaaab'
    )
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '29976419466'),
      createReleaseVersion('3.6.3-beta3', '29976419466')
    )
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '29976419466', '1'),
      '3.6.3-beta3-zadtazjjug'
    )
    const rerun = createReleaseVersion('3.6.3-beta3', '29976419466', '2')
    assert.notEqual(rerun, createReleaseVersion('3.6.3-beta3', '29976419466'))
    assert.match(rerun, /-r[a-z]{2}$/)
    assert.equal(
      compareReleaseVersions(
        rerun,
        createReleaseVersion('3.6.3-beta3', '29976419466')
      ),
      1
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
    for (const runAttempt of ['', '0', '01', '-1', '1.5', 'abc', '676']) {
      assert.throws(() => createReleaseVersion('3.6.3-beta3', '1', runAttempt))
    }

    assert.throws(() => createReleaseVersion('3.6.3', '1'))
    assert.throws(() => createReleaseVersion('3.6.3-extra-long-channel', '1'))
  })

  it('validates manual overrides against the generated namespace', () => {
    const generated = createReleaseVersion('3.6.3-beta3', '29976419466')
    assert.equal(validateReleaseVersion(generated, '3.6.3-beta3'), generated)
    assert.throws(() => validateReleaseVersion('3.6.3', '3.6.3-beta3'))
    assert.throws(() =>
      validateReleaseVersion('3.6.3-beta3-s000000000201', '3.6.3-beta3')
    )
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

describe('numbered release versions', () => {
  it('builds a numbered base in the patch component, ordered by run then attempt', () => {
    assert.equal(
      createReleaseVersion('4.0.0', '31373153382', '1', '407'),
      '4.0.40701'
    )
    assert.equal(
      createReleaseVersion('4.0.0', '31373153382', '2', '407'),
      '4.0.40702'
    )

    // Every published version stays plain semver, because the packaging job
    // writes it into app/package.json and npm-side tooling has to read it.
    for (const version of ['4.0.40701', '4.0.40702', '4.1.40701']) {
      assert.doesNotThrow(() => new SemVer(version))
    }

    for (const comparer of [
      compareReleaseVersions,
      (l: string, r: string) => new SemVer(l).compare(new SemVer(r)),
    ]) {
      assert.equal(comparer('4.0.40702', '4.0.40701'), 1)
      assert.equal(comparer('4.0.40801', '4.0.40702'), 1)
      assert.equal(comparer('4.1.40701', '4.0.40801'), 1)
    }

    // Leaving beta must not strand the beta install base.
    assert.equal(
      compareReleaseVersions('4.0.40701', '3.6.3-beta3-zadtorqoxa'),
      1
    )
    assert.ok(
      new SemVer('4.0.40701').compare(new SemVer('3.6.3-beta3-zadtorqoxa')) > 0
    )
  })

  it('refuses a numbered base it cannot safely number', () => {
    assert.throws(
      () => createReleaseVersion('4.0.0', '31373153382'),
      /carries no prerelease channel, so a GitHub run number is required/
    )
    assert.throws(
      () => createReleaseVersion('4.0.0', '31373153382', '1', '0'),
      /run number must be a positive decimal/
    )
    assert.throws(
      () => createReleaseVersion('4.0.0', '31373153382', '100', '407'),
      /run attempt must be between 1 and 99/
    )
    // The patch component is the lane, so a base may not also claim one.
    assert.throws(
      () => createReleaseVersion('4.0.5', '31373153382', '1', '407'),
      /must be <major>\.<minor>\.0/
    )
  })

  it('validates a numbered build against its own line only', () => {
    assert.equal(validateReleaseVersion('4.0.40701', '4.0.0'), '4.0.40701')
    assert.throws(
      () => validateReleaseVersion('4.1.40701', '4.0.0'),
      /is not a numbered build of 4\.0\.0/
    )
    assert.throws(
      () => validateReleaseVersion('4.0.0-zadtazjjug', '4.0.0'),
      /is not a numbered build of 4\.0\.0/
    )
  })

  it('keeps the prerelease lane working for a prerelease base', () => {
    assert.equal(
      createReleaseVersion('3.6.3-beta3', '29976419466', '1', '407'),
      '3.6.3-beta3-zadtazjjug'
    )
  })
})
