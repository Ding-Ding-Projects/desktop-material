'use strict'

const { readFileSync } = require('node:fs')

const maxNuGetSpecialVersionLength = 20
const maxRunIdDigits = 12
const runIdWidth = 9
const runIdRadix = 26n
const maxEncodedRunId = runIdRadix ** BigInt(runIdWidth) - 1n

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

function createReleaseVersion(baseVersion, runId) {
  const base = parseReleaseVersion(baseVersion)
  if (base.prerelease === undefined) {
    throw new Error(
      `Base version '${baseVersion}' must already contain a prerelease channel.`
    )
  }

  // Legacy Squirrel parses a trailing numeric prerelease token as Int32. Keep
  // the run sequence alphabetic so modern GitHub run IDs can never overflow
  // that parser, while fixed width preserves lexical ordering.
  const encodedRunId = encodeRunId(runId)
  const version = `${baseVersion}-z${encodedRunId}`
  parseReleaseVersion(version)
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
  if (command === 'create' && args.length === 2) {
    process.stdout.write(`${createReleaseVersion(args[0], args[1])}\n`)
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
    'Usage: release-version.js create <base> <run-id> | compare <left> <right> | max | filter <version> [package]'
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
}
