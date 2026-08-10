'use strict'

const { readFileSync } = require('node:fs')

const maxNuGetSpecialVersionLength = 20
const maxRunIdDigits = 12
const runIdWidth = 9
const runIdRadix = 26n
const maxEncodedRunId = runIdRadix ** BigInt(runIdWidth) - 1n
const maxRunAttemptDigits = 3
const runAttemptWidth = 2
const maxEncodedRunAttempt = runIdRadix ** BigInt(runAttemptWidth) - 1n

// A numbered base version carries no prerelease to extend, and any prerelease
// added to it would sort *below* it, so a build of 4.0.0 has to live in the
// fourth version component: `4.0.0.<build>` outranks `4.0.0` and stays under
// `4.0.1`. That component is a plain number, which rules out the 12-digit
// GitHub run ID — legacy Squirrel reads it as Int32. The run *number* is the
// per-workflow counter, small and monotonic, so the build number is
// `runNumber * runAttemptScale + runAttempt`: ordered by run, then by attempt.
const runAttemptScale = 100
const maxNumericBuildComponent = 2_147_483_647
const maxRunNumber = Math.floor(
  (maxNumericBuildComponent - runAttemptScale) / runAttemptScale
)

const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-]+))?$/

const defaultPackageName = 'GitHubDesktop'
const packageNamePattern = /^[A-Za-z0-9_.]{1,100}$/
// Squirrel's own `RELEASES` grammar: SHA1, package file name, byte size. A `#`
// starts a staging comment and is not part of the entry.
const releaseEntryPattern = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)$/
const releaseEntryCommentPattern = /\s*#.*$/
const packageSuffixes = ['-full.nupkg', '-delta.nupkg']

function parseReleaseVersion(version) {
  if (typeof version !== 'string') {
    throw new Error('Release version must be a string.')
  }

  const match = versionPattern.exec(version)
  if (match === null) {
    throw new Error(`Invalid release version '${version}'.`)
  }

  const prerelease = match[5]
  if (
    prerelease !== undefined &&
    prerelease.length > maxNuGetSpecialVersionLength
  ) {
    throw new Error(
      `NuGet special version '${prerelease}' exceeds ${maxNuGetSpecialVersionLength} characters.`
    )
  }

  return {
    core: [match[1], match[2], match[3], match[4] ?? '0'].map(value =>
      BigInt(value)
    ),
    prerelease,
  }
}

function encodeRunId(runId) {
  if (
    typeof runId !== 'string' ||
    !new RegExp(`^[1-9]\\d{0,${maxRunIdDigits - 1}}$`).test(runId)
  ) {
    throw new Error(
      `GitHub run ID must be a positive decimal with at most ${maxRunIdDigits} digits.`
    )
  }

  let remaining = BigInt(runId)
  if (remaining > maxEncodedRunId) {
    throw new Error(`GitHub run ID exceeds the fixed-width release encoding.`)
  }

  let encoded = ''
  for (let index = 0; index < runIdWidth; index++) {
    const digit = Number(remaining % runIdRadix)
    encoded = String.fromCharCode('a'.charCodeAt(0) + digit) + encoded
    remaining /= runIdRadix
  }

  return encoded
}

function encodeRunAttempt(runAttempt) {
  if (
    typeof runAttempt !== 'string' ||
    !new RegExp(`^[1-9]\\d{0,${maxRunAttemptDigits - 1}}$`).test(runAttempt)
  ) {
    throw new Error(
      `GitHub run attempt must be a positive decimal with at most ${maxRunAttemptDigits} digits.`
    )
  }

  let remaining = BigInt(runAttempt)
  if (remaining > maxEncodedRunAttempt) {
    throw new Error(
      `GitHub run attempt exceeds the fixed-width release encoding.`
    )
  }

  let encoded = ''
  for (let index = 0; index < runAttemptWidth; index++) {
    const digit = Number(remaining % runIdRadix)
    encoded = String.fromCharCode('a'.charCodeAt(0) + digit) + encoded
    remaining /= runIdRadix
  }

  return encoded
}

/**
 * The fourth-component build number for a numbered (non-prerelease) base.
 *
 * Ordered by run and then by attempt, so a rerun publishes a distinct release
 * that outranks the original attempt without renaming it.
 */
function encodeNumericBuild(runNumber, runAttempt) {
  if (
    typeof runNumber !== 'string' ||
    !/^[1-9]\d{0,11}$/.test(runNumber) ||
    Number(runNumber) > maxRunNumber
  ) {
    throw new Error(
      `GitHub run number must be a positive decimal no greater than ${maxRunNumber}.`
    )
  }
  const attempt = Number(runAttempt)
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= runAttemptScale) {
    throw new Error(
      `GitHub run attempt must be between 1 and ${
        runAttemptScale - 1
      } for a numbered release.`
    )
  }

  return String(Number(runNumber) * runAttemptScale + attempt)
}

function createReleaseVersion(
  baseVersion,
  runId,
  runAttempt = '1',
  runNumber = undefined
) {
  const base = parseReleaseVersion(baseVersion)
  if (base.prerelease === undefined) {
    // A numbered release line: extend the version rather than prefix-suffixing
    // a channel back onto it.
    if (baseVersion.split('.').length !== 3) {
      throw new Error(
        `Numbered base version '${baseVersion}' must have exactly three components.`
      )
    }
    if (runNumber === undefined) {
      throw new Error(
        `Base version '${baseVersion}' carries no prerelease channel, so a GitHub run number is required to build its release version.`
      )
    }

    const version = `${baseVersion}.${encodeNumericBuild(
      runNumber,
      runAttempt
    )}`
    parseReleaseVersion(version)
    return version
  }

  // Legacy Squirrel parses a trailing numeric prerelease token as Int32. Keep
  // the run sequence alphabetic so modern GitHub run IDs can never overflow
  // that parser, while fixed width preserves lexical ordering. Reruns keep
  // the original tag for attempt one and add a lexically ordered suffix only
  // from attempt two onward, so every GitHub execution attempt can publish a
  // distinct immutable release without renaming existing releases.
  const encodedRunId = encodeRunId(runId)
  const encodedRunAttempt = encodeRunAttempt(runAttempt)
  const attemptSuffix = runAttempt === '1' ? '' : `-r${encodedRunAttempt}`
  const version = `${baseVersion}-z${encodedRunId}${attemptSuffix}`
  parseReleaseVersion(version)
  return version
}

function validateReleaseVersion(version, baseVersion) {
  parseReleaseVersion(version)
  if (typeof baseVersion !== 'string') {
    return version
  }

  const base = parseReleaseVersion(baseVersion)
  if (base.prerelease === undefined) {
    if (
      !new RegExp(`^${baseVersion.replace(/\./g, '\\.')}\\.\\d+$`).test(version)
    ) {
      throw new Error(
        `Release version '${version}' is not a numbered build of ${baseVersion}.`
      )
    }

    return version
  }
  const prefix = `${baseVersion}-z`
  const suffix = version.startsWith(prefix) ? version.slice(prefix.length) : ''
  if (!/^[a-z]{9}(?:-r[a-z]{2})?$/.test(suffix)) {
    throw new Error(
      `Release version '${version}' is not in the generated ${baseVersion}-z namespace.`
    )
  }

  return version
}

function compareReleaseVersions(leftVersion, rightVersion) {
  const left = parseReleaseVersion(leftVersion)
  const right = parseReleaseVersion(rightVersion)

  for (let index = 0; index < left.core.length; index++) {
    if (left.core[index] < right.core[index]) {
      return -1
    }
    if (left.core[index] > right.core[index]) {
      return 1
    }
  }

  if (left.prerelease === undefined && right.prerelease === undefined) {
    return 0
  }
  if (left.prerelease === undefined) {
    return 1
  }
  if (right.prerelease === undefined) {
    return -1
  }

  const leftPrerelease = left.prerelease.toLowerCase()
  const rightPrerelease = right.prerelease.toLowerCase()
  if (leftPrerelease < rightPrerelease) {
    return -1
  }
  if (leftPrerelease > rightPrerelease) {
    return 1
  }
  return 0
}

function selectHighestReleaseTag(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('At least one release tag is required.')
  }

  let highestTag
  let highestVersion
  for (const tag of tags) {
    if (typeof tag !== 'string' || !tag.startsWith('v')) {
      throw new Error(`Invalid release tag '${String(tag)}'.`)
    }

    const version = tag.slice(1)
    parseReleaseVersion(version)
    if (
      highestVersion === undefined ||
      compareReleaseVersions(version, highestVersion) > 0
    ) {
      highestTag = tag
      highestVersion = version
    }
  }

  return highestTag
}

/**
 * Read the version out of a Squirrel package file name, or null when the file
 * belongs to a different package. Squirrel package names are
 * `<PackageName>-<Version>-(full|delta).nupkg`.
 */
function parsePackageFileVersion(fileName, packageName) {
  if (!packageNamePattern.test(packageName)) {
    throw new Error(`Invalid Squirrel package name '${packageName}'.`)
  }

  const suffix = packageSuffixes.find(candidate => fileName.endsWith(candidate))
  if (suffix === undefined) {
    return null
  }

  const prefix = `${packageName}-`
  const stem = fileName.slice(0, fileName.length - suffix.length)
  if (!stem.startsWith(prefix)) {
    return null
  }

  const version = stem.slice(prefix.length)
  return versionPattern.test(version) ? version : null
}

/**
 * Keep only the entries a release may legitimately advertise: this package, at
 * exactly this version.
 *
 * Squirrel picks the highest version in `RELEASES` and installs it, so any
 * foreign package or leftover lower-lane entry that reaches the published
 * manifest becomes an update the whole install base will act on. The packaging
 * job copies whatever `dist/RELEASES` names, so the filter has to run before
 * that copy rather than after. Unreadable input fails the release instead of
 * silently publishing a manifest nobody vetted.
 */
function filterReleasesManifest(
  manifest,
  version,
  packageName = defaultPackageName
) {
  if (typeof manifest !== 'string') {
    throw new Error('Squirrel RELEASES manifest must be a string.')
  }
  parseReleaseVersion(version)

  const kept = []
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.replace(releaseEntryCommentPattern, '').trim()
    if (line.length === 0) {
      continue
    }

    const entry = releaseEntryPattern.exec(line)
    if (entry === null) {
      throw new Error(`Unreadable Squirrel RELEASES entry '${line}'.`)
    }

    if (parsePackageFileVersion(entry[2], packageName) === version) {
      kept.push(line)
    }
  }

  if (kept.length === 0) {
    throw new Error(
      `Squirrel RELEASES manifest advertises no ${packageName} ${version} package.`
    )
  }

  return `${kept.join('\n')}\n`
}

function runCli(argv) {
  const [command, ...args] = argv
  if (command === 'create' && args.length >= 2 && args.length <= 4) {
    process.stdout.write(
      `${createReleaseVersion(args[0], args[1], args[2], args[3])}\n`
    )
    return
  }
  if (command === 'validate' && (args.length === 1 || args.length === 2)) {
    process.stdout.write(`${validateReleaseVersion(args[0], args[1])}\n`)
    return
  }
  if (command === 'compare' && args.length === 2) {
    process.stdout.write(`${compareReleaseVersions(args[0], args[1])}\n`)
    return
  }
  if (command === 'max' && args.length === 0) {
    const tags = readFileSync(0, 'utf8')
      .split(/\r?\n/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
    process.stdout.write(`${selectHighestReleaseTag(tags)}\n`)
    return
  }
  if (command === 'filter' && args.length >= 1 && args.length <= 2) {
    process.stdout.write(
      filterReleasesManifest(readFileSync(0, 'utf8'), args[0], args[1])
    )
    return
  }

  throw new Error(
    'Usage: release-version.js create <base> <run-id> [run-attempt] [run-number] | validate <version> [base] | compare <left> <right> | max | filter <version> [package]'
  )
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  compareReleaseVersions,
  createReleaseVersion,
  filterReleasesManifest,
  selectHighestReleaseTag,
  validateReleaseVersion,
}
