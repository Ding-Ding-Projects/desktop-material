#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- bounded audit paths are validated before use */

/**
 * Fail-closed verifier for auto-updater-current-source-ready.png.
 *
 * The verifier prepares, but never launches, a unique Squirrel topology below
 * an exact Windows Temp run root. Its base app is the exact freshly packaged
 * RELEASE_CHANNEL=development production build. That channel is important:
 * Webpack removes the automatic public-feed check, so no uncontrolled package
 * can race the fixture before the verifier invokes the real production
 * check-for-updates IPC against its bounded loopback feed.
 *
 * The target full nupkg contains a nuspec and inert marker only. Squirrel still
 * performs its real CheckForUpdate, DownloadReleases, ApplyReleases, and
 * update-downloaded path, but it finds no executable to invoke and no shortcut
 * to create. The root basename is verifier-unique, which contains Squirrel's
 * unavoidable pre-ready uninstaller entry to one pre-attested absent HKCU key.
 * The verifier removes and re-proves that exact key before completion, while
 * fingerprinting the protected installation and same-user external state.
 *
 * This is current-source UI/event-path evidence, not a claim that the inert
 * target is a published product payload. The separately retained 2026-07-22
 * record is the historical evidence for a real published legacy-to-newer
 * migration. The verifier never invokes Setup.exe, never fabricates updater
 * events or UI state, never clicks Quit and Install, never terminates a process,
 * and never mutates a provider or release.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const semver = require('semver')
const yauzl = require('yauzl')
const {
  CDPClient,
  evaluate,
  getJSON,
} = require('./verify_actions_pagination_cdp')

const CaptureWidth = 960
const CaptureHeight = 660
const CaptureBasename = 'auto-updater-current-source-ready.png'
const ReceiptBasename = 'auto-updater-current-source-ready-receipt.json'
const ReadyBasename = 'auto-updater-current-source-ready-verifier-ready.json'
const VerifierId = 'gallery-auto-updater-current-source-ready'
const RunRootPattern =
  /^desktop-material-updater-ready-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/

const SourceRoot = path.resolve(__dirname, '..', '..')
const GitNullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
const PackagedAppRoot = path.join(SourceRoot, 'dist', 'GitHubDesktop-win32-x64')
const BuildOutputRoot = path.join(SourceRoot, 'out')
const VendorSquirrelPath = path.join(
  SourceRoot,
  'node_modules',
  'electron-winstaller',
  'vendor',
  'Squirrel.exe'
)
const ProductExecutable = 'GitHubDesktop.exe'
const BaseVersion = '9000.0.0'
const TargetVersion = '9000.0.1'
const FixturePackagePrefix = 'DesktopMaterialUpdaterReadyVerifier'
const FixtureMarker = 'desktop-material-updater-ready-fixture.txt'
const SquirrelBytes = 1_899_520
const SquirrelSha256 =
  '76359cd4b0349a83337b941332ad042c90351c2bb0a4628307740324c97984cc'
const SquirrelFileVersion = '2.0.1.1'
const SquirrelProductVersion = '2.0.1+eef37460ae'

// Historical published-migration evidence retained as an explicit boundary.
const HistoricalCaptureBasename = 'auto-updater-update-ready.png'
const LegacyVersion = '3.6.3-beta3-s000000000201'
const LegacyTag = `v${LegacyVersion}`
const LegacyTargetCommit = 'fa4806971c5515766fee5a0ab03a76adfdd11d79'
const LegacyPackage = 'GitHubDesktop-3.6.3-beta3-s000000000201-full.nupkg'
const LegacyPackageBytes = 311_014_524
const LegacyPackageSha256 =
  'e73548bcae9c51c8f7540c9ef49f32f83bbcc3cfecc08bec5b095d60109bb238'
const LegacyReleasesBytes = 104
const LegacyReleasesSha256 =
  'ee62b22f48822dfbf9324d0507a91a8e7dff8419d6a87fe5bda099a7a365ef42'
const LegacyReleaseEntry =
  '473A90BF18EFF25A1E680A68470E77675480CA65 ' +
  `${LegacyPackage} ${LegacyPackageBytes}`
const HistoricalCaptureSha256 =
  'a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d'
const HistoricalEvidenceDocument =
  'docs/verification/auto-updater-version-order-2026-07-22.md'

if (CaptureBasename === HistoricalCaptureBasename) {
  fail('Current-source and historical updater captures must remain distinct.')
}

const ProfileDirectory = 'profile'
const OwnedTempDirectory = 'temp'
const VerificationTimeoutMilliseconds = 20 * 60 * 1000
const LaunchTimeoutMilliseconds = 5 * 60 * 1000
const MaximumLogBytes = 8 * 1024 * 1024
const MaximumTreeFiles = 100_000
const MaximumTreeBytes = 5 * 1024 * 1024 * 1024
const MaximumRegistryBytes = 2 * 1024 * 1024
const MaximumFixtureRequests = 24

function fail(message) {
  throw new Error(message)
}

function normalizedPath(value) {
  return path.resolve(value).toLowerCase()
}

function isContainedPath(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertSafeSid(value, label) {
  if (!/^S-1-5-21-(?:\d+-){2,}\d+$/.test(value ?? '')) {
    fail(`${label} must be an explicit local Windows user SID.`)
  }
  return value
}

function fixtureIdentityForRunRoot(runRoot) {
  const suffix = sha256Text(normalizedPath(runRoot)).slice(0, 16)
  return `${FixturePackagePrefix}-${suffix}`
}

function parseArguments(argv) {
  const supported = new Set([
    'port',
    'run-root',
    'protected-install-root',
    'protected-user-sid',
    'execution-user-sid',
    'desktop-name',
    'capture',
    'receipt',
    'ready',
  ])
  if (argv.length === 0 || argv.length % 2 !== 0) {
    fail('Arguments must be complete --name value pairs.')
  }
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (!option?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${option ?? '<end>'}.`)
    }
    const name = option.slice(2)
    if (!supported.has(name)) {
      fail(`Unsupported argument ${option}.`)
    }
    if (values.has(name)) {
      fail(`Duplicate argument ${option}.`)
    }
    values.set(name, value)
  }

  const required = name => {
    const value = values.get(name)
    if (value === undefined || value.trim() === '') {
      fail(`--${name} is required.`)
    }
    return value
  }
  const port = Number(required('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
  }
  const desktopName = required('desktop-name')
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{3,63}$/.test(desktopName) ||
    /^(default|winlogon)$/i.test(desktopName)
  ) {
    fail('The off-screen desktop name is invalid or names a visible desktop.')
  }
  const protectedUserSid = assertSafeSid(
    required('protected-user-sid'),
    'Protected user SID'
  )
  const executionUserSid = assertSafeSid(
    required('execution-user-sid'),
    'Execution user SID'
  )

  return {
    port,
    runRoot: path.resolve(required('run-root')),
    protectedInstallRoot: path.resolve(required('protected-install-root')),
    protectedUserSid,
    executionUserSid,
    desktopName,
    capturePath: path.resolve(required('capture')),
    receiptPath: path.resolve(required('receipt')),
    readyPath: path.resolve(required('ready')),
  }
}

function assertRealDirectory(candidate, label) {
  let status
  let real
  let realStatus
  try {
    status = fs.lstatSync(candidate)
    real = fs.realpathSync.native(candidate)
    realStatus = fs.lstatSync(real)
  } catch {
    fail(`${label} is missing.`)
  }
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    !realStatus.isDirectory() ||
    status.dev !== realStatus.dev ||
    status.ino !== realStatus.ino
  ) {
    fail(`${label} must be a real directory, not a link or junction.`)
  }
  return real
}

function assertRealFile(candidate, label, expectedBytes = null) {
  let status
  let real
  let realStatus
  try {
    status = fs.lstatSync(candidate)
    real = fs.realpathSync.native(candidate)
    realStatus = fs.lstatSync(real)
  } catch {
    fail(`${label} is missing.`)
  }
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    !realStatus.isFile() ||
    status.dev !== realStatus.dev ||
    status.ino !== realStatus.ino ||
    (expectedBytes !== null && status.size !== expectedBytes)
  ) {
    fail(`${label} is not the expected real file.`)
  }
  return real
}

function ensureNewOwnedFile(runRoot, candidate, basename, label) {
  if (
    path.basename(candidate) !== basename ||
    !isContainedPath(runRoot, candidate)
  ) {
    fail(`${label} must be ${basename} inside the owned run root.`)
  }
  if (fs.existsSync(candidate)) {
    fail(`${label} must be a new file.`)
  }
  fs.mkdirSync(path.dirname(candidate), { recursive: true })
  const parent = assertRealDirectory(path.dirname(candidate), `${label} parent`)
  if (!isContainedPath(runRoot, parent)) {
    fail(`${label} parent escaped the owned run root.`)
  }
}

function validateOwnedPaths(options) {
  const tempRoot = assertRealDirectory(os.tmpdir(), 'Operating-system Temp')
  const runRoot = assertRealDirectory(options.runRoot, 'Run root')
  if (
    normalizedPath(path.dirname(runRoot)) !== normalizedPath(tempRoot) ||
    !RunRootPattern.test(path.basename(runRoot))
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-updater-ready-*.'
    )
  }

  const fixtureId = fixtureIdentityForRunRoot(runRoot)
  const installRoot = path.join(runRoot, fixtureId)
  if (fs.existsSync(installRoot)) {
    fail('Owned Squirrel install must be absent before fixture preparation.')
  }
  const profileRoot = path.join(runRoot, ProfileDirectory)
  const tempDirectory = path.join(runRoot, OwnedTempDirectory)
  fs.mkdirSync(profileRoot, { recursive: false })
  fs.mkdirSync(tempDirectory, { recursive: false })
  for (const [candidate, label] of [
    [profileRoot, 'Owned profile'],
    [tempDirectory, 'Owned process Temp'],
  ]) {
    const real = assertRealDirectory(candidate, label)
    if (!isContainedPath(runRoot, real)) {
      fail(`${label} escaped the owned run root.`)
    }
  }

  const protectedInstallRoot = assertRealDirectory(
    options.protectedInstallRoot,
    'Protected user installation'
  )
  if (
    isContainedPath(runRoot, protectedInstallRoot) ||
    isContainedPath(protectedInstallRoot, runRoot) ||
    normalizedPath(runRoot) === normalizedPath(protectedInstallRoot)
  ) {
    fail('Protected and owned installation roots must be disjoint.')
  }

  ensureNewOwnedFile(runRoot, options.capturePath, CaptureBasename, 'Capture')
  ensureNewOwnedFile(runRoot, options.receiptPath, ReceiptBasename, 'Receipt')
  ensureNewOwnedFile(runRoot, options.readyPath, ReadyBasename, 'Ready file')

  const distinct = new Set(
    [options.capturePath, options.receiptPath, options.readyPath].map(
      normalizedPath
    )
  )
  if (distinct.size !== 3) {
    fail('Capture, receipt, and ready paths must be distinct.')
  }

  const environment = {
    APPDATA: path.join(profileRoot, 'roaming'),
    LOCALAPPDATA: path.join(profileRoot, 'local'),
    USERPROFILE: path.join(profileRoot, 'home'),
    HOME: path.join(profileRoot, 'home'),
    XDG_CONFIG_HOME: path.join(profileRoot, 'xdg'),
    GIT_CONFIG_GLOBAL: path.join(profileRoot, 'gitconfig'),
    TEMP: tempDirectory,
    TMP: tempDirectory,
    SQUIRREL_TEMP: tempDirectory,
  }
  for (const [name, candidate] of Object.entries(environment)) {
    if (name === 'GIT_CONFIG_GLOBAL') continue
    fs.mkdirSync(candidate, { recursive: true })
    const real = assertRealDirectory(candidate, 'Owned environment directory')
    if (!isContainedPath(runRoot, real)) {
      fail('Owned environment directory escaped the run root.')
    }
  }
  fs.writeFileSync(environment.GIT_CONFIG_GLOBAL, '', {
    encoding: 'utf8',
    flag: 'wx',
  })
  assertRealFile(environment.GIT_CONFIG_GLOBAL, 'Owned global Git config', 0)
  const userDataDirectory = path.join(profileRoot, 'user-data')
  fs.mkdirSync(userDataDirectory, { recursive: true })
  assertRealDirectory(userDataDirectory, 'Owned Chromium user data')

  return {
    ...options,
    runRoot,
    installRoot,
    profileRoot,
    tempDirectory,
    protectedInstallRoot,
    environment,
    userDataDirectory,
    fixtureId,
    registryKey:
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\` +
      fixtureId,
    baseAppDirectory: path.join(installRoot, `app-${BaseVersion}`),
    ownedExecutable: path.join(
      installRoot,
      `app-${BaseVersion}`,
      ProductExecutable
    ),
  }
}

async function hashFile(filePath) {
  const digest = crypto.createHash('sha256')
  let bytes = 0
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath)
    input.on('data', chunk => {
      bytes += chunk.length
      digest.update(chunk)
    })
    input.on('error', reject)
    input.on('end', resolve)
  })
  return { bytes, sha256: digest.digest('hex') }
}

async function inspectZip(zipPath) {
  const entries = []
  const fileContents = {}
  await new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, autoClose: true },
      (openError, archive) => {
        if (openError || archive === undefined) {
          reject(openError ?? new Error('Could not open fixture package.'))
          return
        }
        archive.on('error', reject)
        archive.on('end', resolve)
        archive.on('entry', entry => {
          const normalized = entry.fileName.replaceAll('\\', '/')
          if (
            normalized.startsWith('/') ||
            /^[A-Za-z]:/.test(normalized) ||
            normalized.split('/').includes('..')
          ) {
            reject(new Error('Fixture package contains an unsafe entry path.'))
            return
          }
          entries.push(normalized)
          if (entry.fileName.endsWith('/')) {
            archive.readEntry()
            return
          }
          archive.openReadStream(entry, (streamError, stream) => {
            if (streamError || stream === undefined) {
              reject(
                streamError ??
                  new Error('Could not read fixture package entry.')
              )
              return
            }
            const chunks = []
            let bytes = 0
            stream.on('data', chunk => {
              bytes += chunk.length
              if (bytes > 256 * 1024) {
                reject(new Error('Fixture package entry exceeded its bound.'))
                return
              }
              chunks.push(chunk)
            })
            stream.on('error', reject)
            stream.on('end', () => {
              fileContents[normalized] = Buffer.concat(chunks).toString('utf8')
              archive.readEntry()
            })
          })
        })
        archive.readEntry()
      }
    )
  })
  return { entries, fileContents }
}

function assertTreeHasNoLinks(root, label) {
  const realRoot = assertRealDirectory(root, label)
  const pending = [realRoot]
  let entriesSeen = 0
  while (pending.length > 0) {
    const current = pending.pop()
    for (const name of fs.readdirSync(current).sort()) {
      const candidate = path.join(current, name)
      const status = fs.lstatSync(candidate)
      entriesSeen++
      if (entriesSeen > MaximumTreeFiles) {
        fail(`${label} exceeded the bounded entry count.`)
      }
      if (status.isSymbolicLink()) {
        fail(`${label} contains a link or junction.`)
      }
      if (status.isDirectory()) {
        const real = fs.realpathSync.native(candidate)
        if (!isContainedPath(realRoot, real)) {
          fail(`${label} contains a directory escape.`)
        }
        pending.push(real)
      } else if (!status.isFile()) {
        fail(`${label} contains an unsupported filesystem entry.`)
      }
    }
  }
}

function hermeticReadOnlyGitEnvironment(inheritedEnvironment = process.env) {
  const environment = { ...inheritedEnvironment }
  for (const name of Object.keys(environment)) {
    if (
      /^GIT_/i.test(name) ||
      /^GCM_/i.test(name) ||
      /^SSH_ASKPASS$/i.test(name)
    ) {
      delete environment[name]
    }
  }
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: GitNullDevice,
    GIT_CONFIG_SYSTEM: GitNullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_EXTERNAL_DIFF: '',
    GIT_PAGER: 'cat',
  }
}

function runReadOnlySourceGit(arguments_, label) {
  try {
    return execFileSync(
      'git',
      [
        '--no-optional-locks',
        '-c',
        `core.hooksPath=${GitNullDevice}`,
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.untrackedCache=false',
        '-c',
        'commit.gpgSign=false',
        '-c',
        'tag.gpgSign=false',
        ...arguments_,
      ],
      {
        cwd: SourceRoot,
        encoding: 'utf8',
        env: hermeticReadOnlyGitEnvironment(),
        maxBuffer: 2 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        windowsHide: true,
      }
    ).trim()
  } catch {
    fail(`${label} read-only Git provenance check failed.`)
  }
}

function currentGitCommit() {
  const topLevel = runReadOnlySourceGit(
    ['rev-parse', '--show-toplevel'],
    'Source repository'
  )
  if (
    normalizedPath(fs.realpathSync.native(topLevel)) !==
    normalizedPath(fs.realpathSync.native(SourceRoot))
  ) {
    fail('Git did not resolve the exact verifier source root.')
  }
  const value = runReadOnlySourceGit(
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    'Source commit'
  )
  if (!/^[a-f0-9]{40}$/.test(value)) {
    fail('Could not attest the exact source commit.')
  }
  return value
}

function assertCleanSourceCheckout() {
  const status = runReadOnlySourceGit(
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    'Source cleanliness'
  )
  if (status !== '') {
    fail(
      'Source checkout must have no staged, unstaged, or non-ignored untracked files before exact bundle attestation.'
    )
  }
  return true
}

function assertX64PE(filePath, label) {
  const handle = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(4096)
    const bytes = fs.readSync(handle, header, 0, header.length, 0)
    if (bytes < 256 || header.toString('ascii', 0, 2) !== 'MZ') {
      fail(`${label} is not a PE executable.`)
    }
    const peOffset = header.readUInt32LE(0x3c)
    if (
      peOffset + 6 > bytes ||
      header.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000' ||
      header.readUInt16LE(peOffset + 4) !== 0x8664
    ) {
      fail(`${label} is not a Windows x64 PE executable.`)
    }
  } finally {
    fs.closeSync(handle)
  }
}

function assertDevelopmentRendererBundle(rendererPath, sourceCommit) {
  const source = fs.readFileSync(rendererPath, 'utf8')
  if (!source.includes(sourceCommit)) {
    fail('Packaged renderer does not identify the current source commit.')
  }
  const start = source.indexOf('async performDeferredLaunchActions(){')
  const end = source.indexOf('scheduleDeferredLaunchActions(){', start + 1)
  if (start < 0 || end <= start || end - start > 8_000) {
    fail('Could not bound the packaged deferred-launch implementation.')
  }
  const deferredLaunch = source.slice(start, end)
  const assertions = {
    developmentShowcaseBranch:
      deferredLaunch.includes('.isUpdateShowcase()') ||
      deferredLaunch.includes('isUpdateShowcase()'),
    automaticCheckEliminated:
      !deferredLaunch.includes('.checkForUpdates(') &&
      !deferredLaunch.includes('updateCheckIntervalHandle=window.setInterval'),
    productionMinified: !source.includes(
      'private async performDeferredLaunchActions'
    ),
  }
  assertBooleanAssertions(assertions, 'development bundle')
  return assertions
}

async function validatePackagedDevelopmentBuild() {
  assertCleanSourceCheckout()
  const packagedRoot = assertRealDirectory(
    PackagedAppRoot,
    'Packaged Windows x64 app'
  )
  const outputRoot = assertRealDirectory(
    BuildOutputRoot,
    'Production build output'
  )
  assertTreeHasNoLinks(packagedRoot, 'Packaged Windows x64 app')
  assertTreeHasNoLinks(outputRoot, 'Production build output')
  const executable = assertRealFile(
    path.join(packagedRoot, ProductExecutable),
    'Packaged application executable'
  )
  assertX64PE(executable, 'Packaged application executable')
  if (fs.existsSync(path.join(packagedRoot, 'Squirrel.exe'))) {
    fail('Packaged app root was modified by an installer-packaging step.')
  }
  const resources = path.join(packagedRoot, 'resources', 'app')
  const packageJSONPath = assertRealFile(
    path.join(resources, 'package.json'),
    'Packaged application identity'
  )
  const rendererPath = assertRealFile(
    path.join(resources, 'renderer.js'),
    'Packaged renderer bundle'
  )
  const sourceIdentity = JSON.parse(
    fs.readFileSync(path.join(SourceRoot, 'app', 'package.json'), 'utf8')
  )
  const packageIdentity = JSON.parse(fs.readFileSync(packageJSONPath, 'utf8'))
  if (
    packageIdentity?.name !== 'desktop' ||
    packageIdentity.productName !== 'GitHub Desktop' ||
    packageIdentity.version !== sourceIdentity.version ||
    packageIdentity.main !== './main.js'
  ) {
    fail('Packaged application identity drifted from the source tree.')
  }
  for (const relative of [
    'main.js',
    'renderer.js',
    'renderer.css',
    'index.html',
    'package.json',
  ]) {
    const packaged = await hashFile(
      assertRealFile(path.join(resources, relative), `Packaged ${relative}`)
    )
    const output = await hashFile(
      assertRealFile(
        path.join(outputRoot, relative),
        `Build output ${relative}`
      )
    )
    if (packaged.bytes !== output.bytes || packaged.sha256 !== output.sha256) {
      fail(`Packaged ${relative} does not match the exact build output.`)
    }
  }
  const sourceCommit = currentGitCommit()
  const channelAssertions = assertDevelopmentRendererBundle(
    rendererPath,
    sourceCommit
  )
  const squirrel = await hashFile(
    assertRealFile(
      VendorSquirrelPath,
      'Pinned Squirrel 2.0.1 executable',
      SquirrelBytes
    )
  )
  if (squirrel.sha256 !== SquirrelSha256) {
    fail('Pinned Squirrel executable digest drifted.')
  }
  const fingerprint = await fingerprintTree(
    packagedRoot,
    'Packaged Windows x64 app'
  )
  return {
    packagedRoot,
    executable,
    sourceCommit,
    productVersion: sourceIdentity.version,
    channel: 'development',
    architecture: 'x64',
    channelAssertions,
    fingerprint,
    squirrel,
  }
}

function fixtureNuspec(packageId, version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${packageId}</id>
    <version>${version}</version>
    <title>Desktop Material updater-ready verifier</title>
    <authors>Desktop Material verification</authors>
    <owners>Desktop Material verification</owners>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>Inert local package for real Electron and Squirrel updater UI verification.</description>
    <releaseNotes>Verifier-owned inert update with no executable payload.</releaseNotes>
    <copyright>Verification fixture</copyright>
  </metadata>
</package>
`
}

async function buildFixturePackageBuffer(packageId, version, marker) {
  if (
    !/^[A-Za-z][A-Za-z0-9-]{15,80}$/.test(packageId) ||
    semver.valid(version) === null ||
    !/^[a-z0-9][a-z0-9._-]{3,80}$/i.test(marker)
  ) {
    fail('Fixture package identity is invalid.')
  }
  const JSZip = require(path.join(SourceRoot, 'app', 'node_modules', 'jszip'))
  const zip = new JSZip()
  const fixedDate = new Date('2000-01-01T00:00:00.000Z')
  const options = { date: fixedDate, createFolders: false }
  const coreName = `${sha256Text(`${packageId}:${version}`).slice(
    0,
    32
  )}.psmdcp`
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="psmdcp" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Default Extension="txt" ContentType="text/plain" />
  <Override PartName="/${packageId}.nuspec" ContentType="application/octet" />
</Types>
`,
    options
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/${packageId}.nuspec" Id="R1" />
  <Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="/package/services/metadata/core-properties/${coreName}" Id="R2" />
</Relationships>
`,
    options
  )
  zip.file(`${packageId}.nuspec`, fixtureNuspec(packageId, version), options)
  zip.file(
    `package/services/metadata/core-properties/${coreName}`,
    `<?xml version="1.0" encoding="utf-8"?>
<coreProperties xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Desktop Material verification</dc:creator>
  <dc:description>Inert updater-ready fixture</dc:description>
  <version>${version}</version>
</coreProperties>
`,
    options
  )
  zip.file(
    `lib/net45/${FixtureMarker}`,
    `${marker}\npackage=${packageId}\nversion=${version}\n`,
    options
  )
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'DOS',
  })
}

function releaseEntryForBuffer(fileName, buffer) {
  const sha1 = crypto
    .createHash('sha1')
    .update(buffer)
    .digest('hex')
    .toUpperCase()
  return `${sha1} ${fileName} ${buffer.byteLength}`
}

async function validateInertFixturePackage(packagePath, packageId, version) {
  const inspection = await inspectZip(packagePath)
  const nuspecName = `${packageId}.nuspec`
  const assertions = {
    boundedEntries:
      inspection.entries.length >= 5 && inspection.entries.length <= 8,
    exactNuspec: inspection.entries.includes(nuspecName),
    inertMarker: inspection.entries.includes(`lib/net45/${FixtureMarker}`),
    noExecutablePayload: inspection.entries.every(
      name => !/\.(?:exe|dll|com|cmd|bat|ps1|msi|msix|scr|cpl)$/i.test(name)
    ),
    identityMatches:
      inspection.fileContents[nuspecName]?.includes(`<id>${packageId}</id>`) ===
        true &&
      inspection.fileContents[nuspecName]?.includes(
        `<version>${version}</version>`
      ) === true,
  }
  assertBooleanAssertions(assertions, 'inert fixture package')
  return { entries: inspection.entries.sort(), assertions }
}

async function prepareOwnedTopology(options) {
  const build = await validatePackagedDevelopmentBuild()
  fs.mkdirSync(options.installRoot, { recursive: false })
  fs.mkdirSync(path.join(options.installRoot, 'packages'), { recursive: false })
  fs.cpSync(build.packagedRoot, options.baseAppDirectory, {
    recursive: true,
    force: false,
    errorOnExist: true,
    dereference: false,
    verbatimSymlinks: true,
  })
  assertTreeHasNoLinks(options.installRoot, 'Owned Squirrel install')
  const copiedFingerprint = await fingerprintTree(
    options.baseAppDirectory,
    'Owned base application'
  )
  if (!sameFingerprint(build.fingerprint, copiedFingerprint)) {
    fail('Owned base application is not an exact packaged-build copy.')
  }
  assertRealFile(options.ownedExecutable, 'Owned application executable')
  fs.copyFileSync(
    VendorSquirrelPath,
    path.join(options.installRoot, 'Update.exe'),
    fs.constants.COPYFILE_EXCL
  )
  const rootUpdate = await hashFile(
    assertRealFile(
      path.join(options.installRoot, 'Update.exe'),
      'Owned Update.exe',
      SquirrelBytes
    )
  )
  if (rootUpdate.sha256 !== SquirrelSha256) {
    fail('Owned Update.exe does not match pinned Squirrel 2.0.1.')
  }

  const basePackageName = `${options.fixtureId}-${BaseVersion}-full.nupkg`
  const targetPackageName = `${options.fixtureId}-${TargetVersion}-full.nupkg`
  const [baseBuffer, targetBuffer] = await Promise.all([
    buildFixturePackageBuffer(options.fixtureId, BaseVersion, 'base'),
    buildFixturePackageBuffer(options.fixtureId, TargetVersion, 'ready'),
  ])
  const basePackagePath = path.join(
    options.installRoot,
    'packages',
    basePackageName
  )
  fs.writeFileSync(basePackagePath, baseBuffer, { flag: 'wx' })
  const localReleaseEntry = releaseEntryForBuffer(basePackageName, baseBuffer)
  fs.writeFileSync(
    path.join(options.installRoot, 'packages', 'RELEASES'),
    `${localReleaseEntry}\n`,
    { encoding: 'utf8', flag: 'wx' }
  )
  const targetPackagePath = path.join(options.tempDirectory, targetPackageName)
  fs.writeFileSync(targetPackagePath, targetBuffer, { flag: 'wx' })
  const [baseInspection, targetInspection] = await Promise.all([
    validateInertFixturePackage(
      basePackagePath,
      options.fixtureId,
      BaseVersion
    ),
    validateInertFixturePackage(
      targetPackagePath,
      options.fixtureId,
      TargetVersion
    ),
  ])
  fs.unlinkSync(targetPackagePath)
  if (fs.existsSync(targetPackagePath)) {
    fail('Temporary target-package validation copy was not removed.')
  }
  return {
    build,
    copiedFingerprint,
    basePackage: {
      name: basePackageName,
      bytes: baseBuffer.byteLength,
      sha256: crypto.createHash('sha256').update(baseBuffer).digest('hex'),
      releaseEntry: localReleaseEntry,
      inspection: baseInspection,
    },
    targetPackage: {
      name: targetPackageName,
      bytes: targetBuffer.byteLength,
      sha256: crypto.createHash('sha256').update(targetBuffer).digest('hex'),
      releaseEntry: releaseEntryForBuffer(targetPackageName, targetBuffer),
      buffer: targetBuffer,
      inspection: targetInspection,
    },
  }
}

async function fingerprintTree(root, label) {
  const realRoot = assertRealDirectory(root, label)
  const digest = crypto.createHash('sha256')
  let fileCount = 0
  let directoryCount = 0
  let totalBytes = 0

  async function walk(directory, relativeDirectory) {
    directoryCount++
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name)
      const relative = path
        .join(relativeDirectory, entry.name)
        .replaceAll('\\', '/')
      const before = fs.lstatSync(candidate)
      if (before.isSymbolicLink()) {
        fail(`${label} contains a link or junction.`)
      }
      if (before.isDirectory()) {
        const real = fs.realpathSync.native(candidate)
        if (!isContainedPath(realRoot, real)) {
          fail(`${label} contains a directory escape.`)
        }
        digest.update(`D\0${relative}\0`)
        await walk(real, relative)
        continue
      }
      if (!before.isFile()) {
        fail(`${label} contains an unsupported filesystem entry.`)
      }
      fileCount++
      totalBytes += before.size
      if (fileCount > MaximumTreeFiles || totalBytes > MaximumTreeBytes) {
        fail(`${label} exceeded the bounded fingerprint size.`)
      }
      digest.update(`F\0${relative}\0${before.size}\0`)
      await new Promise((resolve, reject) => {
        const input = fs.createReadStream(candidate)
        input.on('data', chunk => digest.update(chunk))
        input.on('error', reject)
        input.on('end', resolve)
      })
      const after = fs.lstatSync(candidate)
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.isSymbolicLink()
      ) {
        fail(`${label} changed while it was being fingerprinted.`)
      }
      digest.update('\0')
    }
  }

  await walk(realRoot, '')
  return {
    sha256: digest.digest('hex'),
    files: fileCount,
    directories: directoryCount,
    bytes: totalBytes,
  }
}

function sameFingerprint(left, right) {
  return (
    left?.sha256 === right?.sha256 &&
    left?.files === right?.files &&
    left?.directories === right?.directories &&
    left?.bytes === right?.bytes
  )
}

function runPowerShell(source, maximumBytes = 16 * 1024 * 1024) {
  const encodedSource = Buffer.from(source, 'utf16le').toString('base64')
  try {
    return execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-OutputFormat',
        'Text',
        '-EncodedCommand',
        encodedSource,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        maxBuffer: maximumBytes,
      }
    ).trim()
  } catch {
    fail('A bounded read-only Windows identity/process query failed.')
  }
}

function parsePowerShellJSON(
  source,
  label,
  sanitizeForbiddenControlCharacters = false
) {
  const output = runPowerShell(source)
  if (output === '') {
    return null
  }
  const json = sanitizeForbiddenControlCharacters
    ? output.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '\uFFFD')
    : output
  try {
    return JSON.parse(json)
  } catch (error) {
    const firstCodePoint = json.codePointAt(0)?.toString(16) ?? 'none'
    const lastCodePoint =
      json.codePointAt(json.length - 1)?.toString(16) ?? 'none'
    const nullCharacters = json.split('\u0000').length - 1
    const positionMatch = /\bposition\s+(\d+)\b/i.exec(safeError(error))
    const invalidPosition =
      positionMatch === null ? null : Number.parseInt(positionMatch[1], 10)
    const invalidCodePoint =
      invalidPosition === null
        ? 'unknown'
        : json.codePointAt(invalidPosition)?.toString(16) ?? 'none'
    fail(
      `${label} returned invalid JSON (characters=${
        json.length
      }, first=U+${firstCodePoint}, last=U+${lastCodePoint}, nulls=${nullCharacters}, position=${
        invalidPosition ?? 'unknown'
      }, code=U+${invalidCodePoint}).`
    )
  }
}

function queryUserAccount(sid) {
  const escaped = sid.replaceAll("'", "''")
  return parsePowerShellJSON(
    `$account = Get-CimInstance Win32_UserAccount -Filter "SID='${escaped}'"
if ($null -ne $account) {
  [pscustomobject]@{
    SID = $account.SID
    LocalAccount = [bool]$account.LocalAccount
    Disabled = [bool]$account.Disabled
  } | ConvertTo-Json -Compress
}`,
    'Windows account query'
  )
}

function queryCurrentUserSid() {
  const value = runPowerShell(
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'
  )
  return assertSafeSid(value, 'Verifier process SID')
}

function validateExecutionAccounts(options) {
  const protectedAccount = queryUserAccount(options.protectedUserSid)
  const executionAccount = queryUserAccount(options.executionUserSid)
  const verifierSid = queryCurrentUserSid()
  const checks = {
    protectedSidMatches:
      protectedAccount?.SID?.toLowerCase() ===
      options.protectedUserSid.toLowerCase(),
    protectedAccountIsLocal: protectedAccount?.LocalAccount === true,
    protectedAccountIsEnabled: protectedAccount?.Disabled === false,
    executionSidMatches:
      executionAccount?.SID?.toLowerCase() ===
      options.executionUserSid.toLowerCase(),
    executionAccountIsLocal: executionAccount?.LocalAccount === true,
    executionAccountIsEnabled: executionAccount?.Disabled === false,
    verifierRunsAsExecutionIdentity:
      verifierSid.toLowerCase() === options.executionUserSid.toLowerCase(),
  }
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  if (failedChecks.length > 0) {
    fail(
      `Protected/execution Windows account attestation failed: ${failedChecks.join(
        ', '
      )}.`
    )
  }
  return {
    protectedIdentityHash: sha256Text(options.protectedUserSid),
    executionIdentityHash: sha256Text(options.executionUserSid),
    verifierRunsAsExecutionIdentity: true,
    protectedAccountEnabled: true,
    executionAccountEnabled: true,
    identitiesDistinct:
      options.protectedUserSid.toLowerCase() !==
      options.executionUserSid.toLowerCase(),
  }
}

function registryQuery(key, valueName = null) {
  const systemRoot = process.env.SystemRoot
  if (
    typeof systemRoot !== 'string' ||
    !/^[A-Za-z]:\\Windows$/i.test(systemRoot)
  ) {
    fail('SystemRoot is unavailable for the bounded registry ledger.')
  }
  const executable = assertRealFile(
    path.join(systemRoot, 'System32', 'reg.exe'),
    'Windows registry utility'
  )
  const args = ['query', key]
  if (valueName !== null) args.push('/v', valueName)
  else args.push('/s')
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: MaximumRegistryBytes,
  })
  if (result.error !== undefined || result.signal !== null) {
    fail('Bounded registry query failed.')
  }
  if (result.status === 1) {
    return { exists: false, sha256: null, bytes: 0, text: '' }
  }
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    fail('Registry query returned an unexpected status.')
  }
  const text = result.stdout.replaceAll('\r\n', '\n').trim()
  return {
    exists: true,
    sha256: sha256Text(text),
    bytes: Buffer.byteLength(text),
    text,
  }
}

function registryFingerprint(key, valueName = null) {
  const result = registryQuery(key, valueName)
  return {
    exists: result.exists,
    sha256: result.sha256,
    bytes: result.bytes,
  }
}

function deleteOwnedRegistryKey(options) {
  const expected =
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\` +
    options.fixtureId
  if (options.registryKey !== expected || !registryQuery(expected).exists) {
    fail('Owned Squirrel uninstaller key is absent or drifted before cleanup.')
  }
  const systemRoot = process.env.SystemRoot
  const executable = assertRealFile(
    path.join(systemRoot, 'System32', 'reg.exe'),
    'Windows registry utility'
  )
  const result = spawnSync(executable, ['delete', expected, '/f'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: MaximumRegistryBytes,
  })
  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status !== 0 ||
    registryQuery(expected).exists
  ) {
    fail('Exact owned Squirrel uninstaller-key cleanup failed.')
  }
  return { removed: true, absentAfter: true }
}

function knownUserFolders() {
  const value = parsePowerShellJSON(
    `[pscustomobject]@{
  Desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
  StartMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::StartMenu)
  ApplicationData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
} | ConvertTo-Json -Compress`,
    'Known-folder query'
  )
  if (
    typeof value?.Desktop !== 'string' ||
    typeof value.StartMenu !== 'string' ||
    typeof value.ApplicationData !== 'string' ||
    !path.isAbsolute(value.Desktop) ||
    !path.isAbsolute(value.StartMenu) ||
    !path.isAbsolute(value.ApplicationData)
  ) {
    fail('Known-folder query was incomplete.')
  }
  return value
}

async function fingerprintOptionalEntry(candidate, label) {
  if (!fs.existsSync(candidate)) return { exists: false }
  const status = fs.lstatSync(candidate)
  if (status.isSymbolicLink()) {
    fail(`${label} is unexpectedly a link or junction.`)
  }
  if (status.isFile()) {
    return { exists: true, kind: 'file', ...(await hashFile(candidate)) }
  }
  if (status.isDirectory()) {
    return {
      exists: true,
      kind: 'directory',
      ...(await fingerprintTree(candidate, label)),
    }
  }
  fail(`${label} has an unsupported filesystem type.`)
}

async function snapshotExternalState(options) {
  const folders = knownUserFolders()
  const registry = {
    environment: registryFingerprint('HKCU\\Environment'),
    legacyTopLevelUninstall: registryFingerprint('HKCU\\Uninstall'),
    protectedProductUninstall: registryFingerprint(
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GitHubDesktop'
    ),
    trayIconStreams: registryFingerprint(
      'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\TrayNotify',
      'IconStreams'
    ),
    appCompatLayers: registryFingerprint(
      'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
    ),
  }
  if (!registry.legacyTopLevelUninstall.exists) {
    fail(
      'HKCU\\Uninstall must pre-exist so Squirrel cannot create a generic key.'
    )
  }
  if (registryQuery(options.registryKey).exists) {
    fail('Verifier-unique uninstaller key must be absent before launch.')
  }
  const filesystem = {
    protectedStartMenu: await fingerprintOptionalEntry(
      path.join(folders.StartMenu, 'Programs', 'GitHub, Inc'),
      'Protected Start Menu shortcuts'
    ),
    protectedDesktopShortcut: await fingerprintOptionalEntry(
      path.join(folders.Desktop, 'GitHub Desktop.lnk'),
      'Protected desktop shortcut'
    ),
    pinnedTaskbar: await fingerprintOptionalEntry(
      path.join(
        folders.ApplicationData,
        'Microsoft',
        'Internet Explorer',
        'Quick Launch',
        'User Pinned',
        'TaskBar'
      ),
      'Pinned taskbar shortcuts'
    ),
  }
  return { registry, filesystem }
}

function sameExternalState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertOwnedRegistryEntry(options) {
  const entry = registryQuery(options.registryKey)
  const normalized = entry.text.replaceAll('/', '\\').toLowerCase()
  const assertions = {
    exists: entry.exists,
    targetVersion: normalized.includes(TargetVersion.toLowerCase()),
    ownedInstallLocation: normalized.includes(
      normalizedPath(options.installRoot)
    ),
    ownedUninstaller: normalized.includes(
      normalizedPath(path.join(options.installRoot, 'Update.exe'))
    ),
  }
  assertBooleanAssertions(assertions, 'owned uninstaller registry entry')
  return {
    sha256: entry.sha256,
    bytes: entry.bytes,
    assertions,
  }
}

function queryProcesses() {
  const parsed = parsePowerShellJSON(
    `@(Get-CimInstance Win32_Process | ForEach-Object {
  $executablePath = if ($null -eq $_.ExecutablePath) {
    $null
  } else {
    $_.ExecutablePath -replace '[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', [char]0xFFFD
  }
  $commandLine = if ($null -eq $_.CommandLine) {
    $null
  } else {
    $_.CommandLine -replace '[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', [char]0xFFFD
  }
  [pscustomobject]@{
    ProcessId = [int]$_.ProcessId
    ParentProcessId = [int]$_.ParentProcessId
    ExecutablePath = $executablePath
    CommandLine = $commandLine
  }
}) | ConvertTo-Json -Compress`,
    'Windows process query',
    true
  )
  return parsed === null ? [] : Array.isArray(parsed) ? parsed : [parsed]
}

function processUsesRoot(process, root) {
  return (
    typeof process.ExecutablePath === 'string' &&
    (normalizedPath(process.ExecutablePath) === normalizedPath(root) ||
      isContainedPath(root, process.ExecutablePath))
  )
}

function assertNoProcessesInRoot(root, label) {
  const matches = queryProcesses().filter(process =>
    processUsesRoot(process, root)
  )
  if (matches.length > 0) {
    fail(`${label} has a running process and cannot be audited safely.`)
  }
}

function queryProcessOwnerSid(processId) {
  if (!Number.isSafeInteger(processId) || processId < 1) {
    fail('Process identity is invalid.')
  }
  const parsed = parsePowerShellJSON(
    `$process = Get-CimInstance Win32_Process -Filter "ProcessId=${processId}"
if ($null -ne $process) {
  $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
  [pscustomobject]@{
    ProcessId = [int]$process.ProcessId
    SID = $owner.Sid
    ReturnValue = [int]$owner.ReturnValue
  } | ConvertTo-Json -Compress
}`,
    'Process owner query'
  )
  if (
    parsed?.ProcessId !== processId ||
    parsed.ReturnValue !== 0 ||
    typeof parsed.SID !== 'string'
  ) {
    fail('Could not attest the app process owner SID.')
  }
  return parsed.SID
}

function queryProcessDesktopNames(processId) {
  if (!Number.isSafeInteger(processId) || processId < 1) {
    fail('Process desktop identity is invalid.')
  }
  const parsed = parsePowerShellJSON(
    `$source = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class DesktopMaterialDesktopProbe {
  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr GetThreadDesktop(uint threadId);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  private static extern bool GetUserObjectInformation(
    IntPtr handle, int index, StringBuilder value, uint length,
    out uint required);
  public static string Name(uint threadId) {
    var handle = GetThreadDesktop(threadId);
    if (handle == IntPtr.Zero) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    uint required;
    GetUserObjectInformation(handle, 2, null, 0, out required);
    var value = new StringBuilder((int)(required / 2) + 1);
    if (!GetUserObjectInformation(handle, 2, value, required, out required)) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    return value.ToString();
  }
}
'@
Add-Type -TypeDefinition $source
$names = [System.Diagnostics.Process]::GetProcessById(${processId}).Threads |
  ForEach-Object {
    try {
      [DesktopMaterialDesktopProbe]::Name([uint32]$_.Id)
    } catch {
      $null
    }
  } | Where-Object { $_ -ne '' } | Sort-Object -Unique
@($names) | ConvertTo-Json -Compress`,
    'Process desktop query'
  )
  if (parsed === null) {
    fail('App process did not expose a Win32 desktop.')
  }
  return Array.isArray(parsed) ? parsed : [parsed]
}

function findOwnedMainProcess(options) {
  const expectedExecutable = normalizedPath(options.ownedExecutable)
  const expectedUserData = normalizedPath(options.userDataDirectory)
  const portArgument = `--remote-debugging-port=${options.port}`.toLowerCase()
  const addressArgument = '--remote-debugging-address=127.0.0.1'
  const candidates = queryProcesses().filter(process => {
    if (
      typeof process.ExecutablePath !== 'string' ||
      normalizedPath(process.ExecutablePath) !== expectedExecutable ||
      typeof process.CommandLine !== 'string'
    ) {
      return false
    }
    const commandLine = process.CommandLine.toLowerCase()
    return (
      !commandLine.includes('--type=') &&
      commandLine.includes(portArgument) &&
      commandLine.includes(addressArgument) &&
      commandLine.includes('--user-data-dir=') &&
      commandLine.includes(expectedUserData)
    )
  })
  if (candidates.length !== 1) {
    fail('Expected exactly one externally launched owned main process.')
  }
  return {
    processId: candidates[0].ProcessId,
    parentProcessId: candidates[0].ParentProcessId,
  }
}

async function waitForOwnedProcessesToExit(
  options,
  processId,
  timeout = 45_000
) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const processes = queryProcesses()
    const mainStillExists = processes.some(
      process =>
        process.ProcessId === processId &&
        processUsesRoot(process, options.installRoot)
    )
    const ownedProcesses = processes.filter(process =>
      processUsesRoot(process, options.installRoot)
    )
    if (!mainStillExists && ownedProcesses.length === 0) {
      return true
    }
    await sleep(500)
  }
  return false
}

function parseReleasesManifest(manifest) {
  const entries = []
  for (const rawLine of String(manifest).split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim()
    if (line === '') continue
    const match = /^([A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})\s+(\S+)\s+(\d+)$/.exec(
      line
    )
    if (match === null) continue
    const packageMatch =
      /^(.+)-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)-(full|delta)\.nupkg$/i.exec(
        match[2]
      )
    if (packageMatch === null || semver.valid(packageMatch[2]) === null) {
      continue
    }
    const bytes = Number(match[3])
    if (!Number.isSafeInteger(bytes) || bytes < 1) continue
    entries.push({
      releaseHash: match[1].toUpperCase(),
      package: match[2],
      packageId: packageMatch[1],
      version: packageMatch[2],
      kind: packageMatch[3].toLowerCase(),
      bytes,
    })
  }
  return entries
}

function selectPublishedUpgrade(manifest, currentVersion = LegacyVersion) {
  const fullEntries = parseReleasesManifest(manifest).filter(
    entry => entry.kind === 'full'
  )
  fullEntries.sort((left, right) =>
    semver.rcompare(left.version, right.version)
  )
  const selected = fullEntries[0]
  if (selected === undefined || !semver.gt(selected.version, currentVersion)) {
    fail('Published RELEASES does not advertise a strict full-package upgrade.')
  }
  return selected
}

async function startFixtureServer(topology) {
  const requests = []
  const manifest = Buffer.from(
    `${topology.targetPackage.releaseEntry}\n`,
    'utf8'
  )
  const server = http.createServer((request, response) => {
    try {
      const remote = request.socket.remoteAddress
      if (
        remote !== '127.0.0.1' &&
        remote !== '::1' &&
        remote !== '::ffff:127.0.0.1'
      ) {
        response.writeHead(403).end()
        return
      }
      if (
        request.method !== 'GET' ||
        requests.length >= MaximumFixtureRequests
      ) {
        response.writeHead(405).end()
        return
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const queryKeys = [...url.searchParams.keys()].sort()
      if (
        queryKeys.some(
          key => !['arch', 'guid', 'id', 'localVersion'].includes(key)
        )
      ) {
        response.writeHead(400).end()
        return
      }
      requests.push({
        method: 'GET',
        pathname: url.pathname,
        queryKeys,
      })
      if (url.pathname === '/feed/RELEASES') {
        response.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': manifest.byteLength,
          'cache-control': 'no-store',
        })
        response.end(manifest)
        return
      }
      if (url.pathname === `/feed/${topology.targetPackage.name}`) {
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': topology.targetPackage.buffer.byteLength,
          'cache-control': 'no-store',
        })
        response.end(topology.targetPackage.buffer)
        return
      }
      response.writeHead(404).end()
    } catch {
      response.writeHead(500).end()
    }
  })
  server.on('clientError', (_error, socket) => socket.destroy())
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (
    address === null ||
    typeof address === 'string' ||
    address.address !== '127.0.0.1'
  ) {
    server.close()
    fail('Fixture feed did not bind to IPv4 loopback.')
  }
  return {
    url: `http://127.0.0.1:${address.port}/feed/`,
    requests,
    async close() {
      await new Promise((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      )
    },
  }
}

function fixtureServerReceipt(server, topology) {
  const releaseRequests = server.requests.filter(
    request => request.pathname === '/feed/RELEASES'
  )
  const packageRequests = server.requests.filter(
    request => request.pathname === `/feed/${topology.targetPackage.name}`
  )
  const assertions = {
    loopbackOnly: server.url.startsWith('http://127.0.0.1:'),
    boundedRequests:
      server.requests.length >= 3 &&
      server.requests.length <= MaximumFixtureRequests,
    releasesRead: releaseRequests.length >= 2,
    targetDownloaded: packageRequests.length >= 1,
    readOnlyMethods: server.requests.every(request => request.method === 'GET'),
    exactRoutes: server.requests.every(
      request =>
        request.pathname === '/feed/RELEASES' ||
        request.pathname === `/feed/${topology.targetPackage.name}`
    ),
  }
  assertBooleanAssertions(assertions, 'loopback fixture server')
  return {
    requestCount: server.requests.length,
    releasesRequestCount: releaseRequests.length,
    packageRequestCount: packageRequests.length,
    assertions,
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseSquirrelEvidence(logText, installRoot, feedURL, packageName) {
  if (
    typeof logText !== 'string' ||
    Buffer.byteLength(logText, 'utf8') > MaximumLogBytes
  ) {
    fail('Owned Squirrel update log is absent or oversized.')
  }
  const expectedDownload = `${feedURL}${packageName}`
  const packagePattern = new RegExp(
    `Downloading file:\\s+${escapeRegExp(expectedDownload)}`,
    'i'
  )
  const normalizedLog = logText.replaceAll('/', '\\').toLowerCase()
  const normalizedRoot = path.resolve(installRoot).toLowerCase()
  const assertions = {
    exactLoopbackFeed: new RegExp(
      `Starting update, downloading from ${escapeRegExp(feedURL)}`,
      'i'
    ).test(logText),
    fullPackageDownloaded: packagePattern.test(logText),
    wroteOwnedAppDirectory: normalizedLog.includes(
      `${normalizedRoot}\\app-${TargetVersion}`.toLowerCase()
    ),
    ownedRootOnly: normalizedLog.includes(
      `about to update to: ${normalizedRoot}`.toLowerCase()
    ),
    emptySquirrelAwareApps: /Squirrel Enabled Apps:\s*\[\s*\]/i.test(logText),
    inertFallbackReached:
      /No apps are marked as Squirrel-aware! Going to run them all/i.test(
        logText
      ),
    pinnedRepairReached: /Starting fixPinnedExecutables/i.test(logText),
    trayCleanupReached: /Fixing up tray icons/i.test(logText),
    updaterFinished: /Finished Squirrel Updater/i.test(logText),
    noPublishedFeed:
      !/github\.com\/Ding-Ding-Projects\/desktop-material\/releases/i.test(
        logText
      ),
    noPostInstallProcessFailure:
      !/Couldn't run Squirrel hook|--squirrel-updated/i.test(logText),
  }
  if (Object.values(assertions).some(value => value !== true)) {
    fail(
      'Squirrel apply log did not satisfy the genuine owned-update contract.'
    )
  }
  return { version: TargetVersion, package: packageName, assertions }
}

async function sleep(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForRendererTarget(port) {
  const deadline = Date.now() + LaunchTimeoutMilliseconds
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const targets = await getJSON(port, '/json/list')
      const matching = targets.filter(
        target =>
          target.type === 'page' &&
          typeof target.url === 'string' &&
          /[\\/]resources[\\/]app[\\/]index\.html(?:[?#]|$)/i.test(
            decodeURIComponent(target.url)
          ) &&
          typeof target.webSocketDebuggerUrl === 'string' &&
          target.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:')
      )
      if (matching.length === 1) {
        return matching[0]
      }
      if (matching.length > 1) {
        fail(
          'More than one production renderer target used the owned CDP port.'
        )
      }
    } catch (error) {
      lastError = error
    }
    await sleep(200)
  }
  throw (
    lastError ??
    new Error('Timed out waiting for the externally launched renderer.')
  )
}

async function waitForExpression(client, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) return
    } catch (error) {
      if (!/context|reload|destroyed/i.test(String(error))) {
        throw error
      }
    }
    await sleep(150)
  }
  fail(`Timed out waiting for ${label}.`)
}

async function inspectRendererIdentity(client) {
  return evaluate(
    client,
    `(async () => ({
      rendererPid: process.pid,
      rendererParentPid: process.ppid,
      execPath: require('path').resolve(process.execPath),
      mainExecPath: require('path').resolve(
        await require('electron').ipcRenderer.invoke('get-exec-path')
      ),
      resourcesPath: require('path').resolve(process.resourcesPath),
      environment: {
        APPDATA: process.env.APPDATA ?? null,
        LOCALAPPDATA: process.env.LOCALAPPDATA ?? null,
        USERPROFILE: process.env.USERPROFILE ?? null,
        HOME: process.env.HOME ?? null,
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? null,
        GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL ?? null,
        TEMP: process.env.TEMP ?? null,
        TMP: process.env.TMP ?? null,
        SQUIRREL_TEMP: process.env.SQUIRREL_TEMP ?? null,
      },
      protocol: location.protocol,
      pathname: decodeURIComponent(location.pathname),
    }))()`
  )
}

function validateRendererIdentity(identity, options, mainProcess) {
  const expectedEnvironment = options.environment
  const environmentMatches = Object.entries(expectedEnvironment).every(
    ([name, expected]) =>
      typeof identity?.environment?.[name] === 'string' &&
      normalizedPath(identity.environment[name]) === normalizedPath(expected)
  )
  const assertions = {
    productionFileRenderer:
      identity?.protocol === 'file:' &&
      /[\\/]resources[\\/]app[\\/]index\.html$/i.test(identity.pathname ?? ''),
    exactPackagedExecutable:
      normalizedPath(identity?.execPath ?? '') ===
        normalizedPath(options.ownedExecutable) &&
      normalizedPath(identity?.mainExecPath ?? '') ===
        normalizedPath(options.ownedExecutable),
    exactResourcesRoot:
      normalizedPath(identity?.resourcesPath ?? '') ===
      normalizedPath(path.join(options.baseAppDirectory, 'resources')),
    isolatedEnvironment: environmentMatches,
    rendererProcessDistinct:
      Number.isSafeInteger(identity?.rendererPid) &&
      identity.rendererPid !== mainProcess.processId,
  }
  if (Object.values(assertions).some(value => value !== true)) {
    fail('Attached renderer identity failed its owned packaged-build contract.')
  }
  return assertions
}

async function configureCaptureViewport(client) {
  await evaluate(client, `require('electron').webFrame.setZoomFactor(1), true`)
  await client.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: CaptureWidth,
    height: CaptureHeight,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: CaptureWidth,
    screenHeight: CaptureHeight,
  })
  await waitForExpression(
    client,
    `innerWidth === ${CaptureWidth} &&
      innerHeight === ${CaptureHeight} &&
      devicePixelRatio === 1`,
    'exact 960x660 Chromium viewport'
  )
}

/**
 * The updater run owns a brand-new disposable Chromium profile. Persist the
 * production first-run completion flag inside that profile before asking the
 * real menu to open About. This avoids an account or Git-configuration flow
 * that is unrelated to updater acceptance; it does not fabricate updater
 * state, dispatch a UI event, or touch the user's normal profile.
 */
async function prepareIsolatedUpdaterWorkspace(client) {
  const welcomeWasVisible = await evaluate(
    client,
    `document.querySelector('#welcome') instanceof HTMLElement`
  )

  await evaluate(
    client,
    `localStorage.setItem('has-shown-welcome-flow', '1'), true`
  )

  // The renderer target can become inspectable before React mounts #welcome.
  // Always reload after persisting the owned first-run preference so a
  // blank-to-welcome race cannot leave the in-memory store on its old value.
  const reloadMarker = crypto.randomBytes(16).toString('hex')
  await evaluate(
    client,
    `window.__desktopMaterialUpdaterVerifierReloadMarker =
      ${JSON.stringify(reloadMarker)}, true`
  )
  await client.send('Page.reload', { ignoreCache: false })
  await waitForExpression(
    client,
    `window.__desktopMaterialUpdaterVerifierReloadMarker !==
      ${JSON.stringify(reloadMarker)} &&
      document.readyState !== 'loading'`,
    'isolated updater renderer reload'
  )

  await waitForExpression(
    client,
    `document.querySelector('#desktop-app-container') !== null &&
      document.querySelector('#welcome') === null &&
      localStorage.getItem('has-shown-welcome-flow') === '1'`,
    'isolated updater workspace'
  )

  return {
    welcomeWasVisible,
    assertions: {
      ownedFirstRunPreferencePersisted: true,
      welcomeSurfaceAbsent: true,
      accountAndProviderFlowsNotInvoked: true,
    },
  }
}

async function openRealAbout(client) {
  await evaluate(
    client,
    `require('electron').ipcRenderer.send(
      'execute-menu-item-by-id', 'about'
    ), true`
  )
  await waitForExpression(
    client,
    `(() => {
      const dialog = document.querySelector('#about')
      return dialog instanceof HTMLElement &&
        dialog.getClientRects().length === 1
    })()`,
    'real About dialog'
  )
}

async function invokeRealCheckForUpdates(client, feedURL) {
  const result = await evaluate(
    client,
    `(async () => {
      const result = await require('electron').ipcRenderer.invoke(
        'check-for-updates',
        ${JSON.stringify(feedURL)}
      )
      if (result === undefined || result === null) return { ok: true }
      return {
        ok: false,
        name: result?.name ?? null,
        message: result?.message ?? String(result),
      }
    })()`
  )
  if (result?.ok !== true) {
    fail('Production check-for-updates IPC rejected the owned loopback feed.')
  }
  return true
}

async function waitForRealUpdateReady(client) {
  const observed = new Set()
  const deadline = Date.now() + VerificationTimeoutMilliseconds
  while (Date.now() < deadline) {
    const state = await evaluate(
      client,
      `(() => {
        const dialog = document.querySelector('#about')
        const statusElement = dialog?.querySelector('.update-status')
        const status = (() => {
          if (!(statusElement instanceof HTMLElement)) return ''
          const clone = statusElement.cloneNode(true)
          clone.querySelectorAll('.sr-only').forEach(node => node.remove())
          return clone.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
        })()
        const buttons = [...(dialog?.querySelectorAll('button') ?? [])]
          .map(value => ({
            text: value.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
            disabled: value.disabled,
          }))
        return { status, buttons }
      })()`
    )
    if (/Checking for updates/i.test(state.status)) observed.add('checking')
    if (/Downloading update/i.test(state.status)) observed.add('downloading')
    const ready =
      state.status ===
        'An update has been downloaded and is ready to be installed.' &&
      state.buttons.some(
        button =>
          button.text === 'Quit and Install Update' && button.disabled === false
      )
    if (ready) {
      observed.add('ready')
      return [...observed]
    }
    await sleep(250)
  }
  fail('Timed out waiting for the genuine update-ready About state.')
}

async function inspectReadySurface(client, productVersion, sourceCommit) {
  return evaluate(
    client,
    `(() => {
      const dialog = document.querySelector('#about')
      const title = dialog?.querySelector('h1')
      const status = dialog?.querySelector('.update-status')
      const visibleStatus = (() => {
        if (!(status instanceof HTMLElement)) return ''
        const clone = status.cloneNode(true)
        clone.querySelectorAll('.sr-only').forEach(node => node.remove())
        return clone.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
      })()
      const buttons = [...(dialog?.querySelectorAll('button') ?? [])]
      const install = buttons.find(value =>
        value.textContent?.replace(/\\s+/g, ' ').trim() ===
          'Quit and Install Update'
      )
      const close = buttons.find(value =>
        value.textContent?.replace(/\\s+/g, ' ').trim() === 'Close'
      )
      if (install instanceof HTMLButtonElement) {
        install.focus({ preventScroll: true })
      }
      const root = document.querySelector('#desktop-app-container')
      const nodes = root ? [root, ...root.querySelectorAll('*')] : []
      let updateStatus = null
      for (const node of nodes) {
        const fiberKey = Object.keys(node).find(key =>
          key.startsWith('__reactFiber$') ||
          key.startsWith('__reactInternalInstance$')
        )
        let fiber = fiberKey ? node[fiberKey] : null
        for (
          let depth = 0;
          fiber && depth < 180;
          depth += 1, fiber = fiber.return
        ) {
          if (typeof fiber.stateNode?.state?.updateState?.status === 'number') {
            updateStatus = fiber.stateNode.state.updateState.status
            break
          }
        }
        if (updateStatus !== null) break
      }
      const visible = element => {
        if (!(element instanceof HTMLElement)) return false
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 &&
          style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity) > 0
      }
      const rect = element => {
        const value = element?.getBoundingClientRect()
        return value === undefined ? null : {
          x: value.x,
          y: value.y,
          width: value.width,
          height: value.height,
          right: value.right,
          bottom: value.bottom,
        }
      }
      const insideViewport = value =>
        value !== null && value.x >= -0.5 && value.y >= -0.5 &&
        value.right <= innerWidth + 0.5 &&
        value.bottom <= innerHeight + 0.5
      const dialogRect = rect(dialog)
      const installRect = rect(install)
      const closeRect = rect(close)
      const corpus = [
        document.body.innerText,
        ...[...document.querySelectorAll(
          '[aria-label], [title], input, textarea'
        )].flatMap(element => [
          element.getAttribute('aria-label') ?? '',
          element.getAttribute('title') ?? '',
          element.value ?? '',
        ]),
      ].join('\\n')
      const forbidden =
        /(authorization\\s*[:=]|bearer\\s|github_pat_|ghp_|glpat-|[?&](?:guid|token|access_token)=|[A-Z]:[\\\\/]Users[\\\\/])/i
      const dialogStyle =
        dialog instanceof HTMLElement ? getComputedStyle(dialog) : null
      const assertions = {
        exactViewport:
          innerWidth === ${CaptureWidth} &&
          innerHeight === ${CaptureHeight} &&
          devicePixelRatio === 1,
        lightEnglishPresentation:
          !document.body.classList.contains('theme-dark') &&
          (
            document.body.getAttribute('data-dm-language-mode') === null ||
            document.body.getAttribute('data-dm-language-mode') === 'english'
          ),
        realAboutDialog:
          visible(dialog) &&
          title?.textContent?.replace(/\\s+/g, ' ').trim() ===
            'About Desktop Material',
        exactCurrentSourceVersion:
          dialog?.textContent?.includes(
            'Build ${sourceCommit.slice(0, 10)} (x64)'
          ) === true,
        genuineUpdateStoreReady: updateStatus === 3,
        exactReadyMessage:
          visibleStatus ===
            'An update has been downloaded and is ready to be installed.',
        installDecisionUntouched:
          visible(install) &&
          install instanceof HTMLButtonElement &&
          install.disabled === false &&
          document.activeElement === install,
        closeControlPresent:
          visible(close) && close instanceof HTMLButtonElement,
        materialDialog:
          dialogStyle !== null &&
          Number.parseFloat(dialogStyle.borderRadius) >= 20 &&
          dialog.querySelector('.material-symbol') !== null,
        containedGeometry:
          insideViewport(dialogRect) &&
          insideViewport(installRect) &&
          insideViewport(closeRect),
        noClipping:
          dialog instanceof HTMLElement &&
          dialog.scrollWidth <= dialog.clientWidth + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.body.scrollWidth <= innerWidth + 1,
        reducedMotion:
          matchMedia('(prefers-reduced-motion: reduce)').matches,
        noPrivatePathOrCredential: !forbidden.test(corpus),
      }
      return {
        title:
          title?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
        productVersion: '${productVersion}',
        buildLabel: 'Build ${sourceCommit.slice(0, 10)}',
        status: visibleStatus,
        installLabel:
          install?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
        updateStatus,
        geometry: {
          dialog: dialogRect,
          install: installRect,
          close: closeRect,
        },
        assertions,
      }
    })()`
  )
}

function assertBooleanAssertions(assertions, label) {
  if (
    assertions === null ||
    typeof assertions !== 'object' ||
    Array.isArray(assertions)
  ) {
    fail(`${label} assertions are missing.`)
  }
  const failures = Object.entries(assertions)
    .filter(([, value]) => value !== true)
    .map(([name]) => name)
  if (failures.length > 0) {
    fail(`${label} assertions failed: ${failures.join(', ')}.`)
  }
}

function pngDimensions(buffer) {
  if (
    buffer.byteLength < 24 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    fail('CDP capture was not a valid PNG.')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function captureOriginalPixels(client, outputPath) {
  await evaluate(
    client,
    `(async () => {
      await document.fonts.ready
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      return true
    })()`
  )
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  const buffer = Buffer.from(result.data, 'base64')
  const dimensions = pngDimensions(buffer)
  if (
    dimensions.width !== CaptureWidth ||
    dimensions.height !== CaptureHeight ||
    buffer.byteLength < 20_000
  ) {
    fail('Original Chromium capture failed its geometry/nonblank contract.')
  }
  fs.writeFileSync(outputPath, buffer, { flag: 'wx' })
  return {
    file: CaptureBasename,
    width: dimensions.width,
    height: dimensions.height,
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    source: 'chromium-page-capture-original-pixels',
  }
}

async function requestNormalExit(client) {
  try {
    await client.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    })
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    })
    await sleep(250)
    const dispatched = await evaluate(
      client,
      `require('electron').ipcRenderer.send(
        'execute-menu-item-by-id', '@.&File.quit'
      ), true`
    )
    if (dispatched !== true) {
      fail('Real File -> Exit dispatch was not attested.')
    }
    return true
  } catch (error) {
    throw new Error('Real File -> Exit dispatch failed.', { cause: error })
  }
}

async function requestCleanupExit(client) {
  try {
    await evaluate(
      client,
      `(() => {
        const root = document.querySelector('#desktop-app-container')
        const nodes = root ? [root, ...root.querySelectorAll('*')] : []
        for (const node of nodes) {
          const fiberKey = Object.keys(node).find(key =>
            key.startsWith('__reactFiber$') ||
            key.startsWith('__reactInternalInstance$')
          )
          let fiber = fiberKey ? node[fiberKey] : null
          for (
            let depth = 0;
            fiber && depth < 180;
            depth += 1, fiber = fiber.return
          ) {
            const dispatcher = fiber.stateNode?.props?.dispatcher
            if (typeof dispatcher?.quitApp === 'function') {
              setTimeout(() => void dispatcher.quitApp(true), 0)
              return true
            }
          }
        }
        return false
      })()`
    )
  } catch {}
}

function removeOwnedInstall(options) {
  if (!fs.existsSync(options.installRoot)) {
    return { removed: true, alreadyAbsent: true }
  }
  const real = assertRealDirectory(
    options.installRoot,
    'Owned Squirrel install'
  )
  if (
    normalizedPath(path.dirname(real)) !== normalizedPath(options.runRoot) ||
    path.basename(real) !== options.fixtureId ||
    options.fixtureId !== fixtureIdentityForRunRoot(options.runRoot)
  ) {
    fail('Refusing cleanup because the owned install target drifted.')
  }
  assertNoProcessesInRoot(real, 'Owned Squirrel install')
  assertTreeHasNoLinks(real, 'Owned Squirrel install')
  fs.rmSync(real, { recursive: true, force: false })
  if (fs.existsSync(real)) {
    fail('Owned Squirrel install cleanup did not complete.')
  }
  return { removed: true, alreadyAbsent: false }
}

async function assertAppliedInertDirectory(options) {
  const targetDirectory = assertRealDirectory(
    path.join(options.installRoot, `app-${TargetVersion}`),
    'Applied inert target directory'
  )
  if (
    normalizedPath(path.dirname(targetDirectory)) !==
    normalizedPath(options.installRoot)
  ) {
    fail('Applied inert target directory escaped the owned install.')
  }
  assertTreeHasNoLinks(targetDirectory, 'Applied inert target directory')
  const names = fs.readdirSync(targetDirectory).sort()
  if (
    names.length !== 1 ||
    names[0] !== FixtureMarker ||
    fs.readFileSync(path.join(targetDirectory, FixtureMarker), 'utf8') !==
      `ready\npackage=${options.fixtureId}\nversion=${TargetVersion}\n`
  ) {
    fail('Applied target directory contains more than the inert marker.')
  }
  const marker = await hashFile(path.join(targetDirectory, FixtureMarker))
  return {
    files: 1,
    executableFiles: 0,
    markerBytes: marker.bytes,
    markerSha256: marker.sha256,
    assertions: {
      exactOwnedTargetDirectory: true,
      inertMarkerOnly: true,
      noExecutablePayload: true,
    },
  }
}

function removeOwnedAuxiliaryState(options) {
  for (const [candidate, expectedName, label] of [
    [options.profileRoot, ProfileDirectory, 'Owned profile'],
    [options.tempDirectory, OwnedTempDirectory, 'Owned process Temp'],
  ]) {
    if (!fs.existsSync(candidate)) continue
    const real = assertRealDirectory(candidate, label)
    if (
      normalizedPath(path.dirname(real)) !== normalizedPath(options.runRoot) ||
      path.basename(real) !== expectedName
    ) {
      fail(`${label} cleanup target drifted.`)
    }
    assertTreeHasNoLinks(real, label)
    fs.rmSync(real, { recursive: true, force: false })
    if (fs.existsSync(real)) fail(`${label} cleanup did not complete.`)
  }
  if (fs.existsSync(options.readyPath)) {
    const ready = assertRealFile(options.readyPath, 'Ready handshake')
    if (
      normalizedPath(path.dirname(ready)) === normalizedPath(options.runRoot) ||
      isContainedPath(options.runRoot, ready)
    ) {
      fs.unlinkSync(ready)
    } else {
      fail('Ready-handshake cleanup target escaped the run root.')
    }
  }
  return {
    profileRemoved: !fs.existsSync(options.profileRoot),
    tempRemoved: !fs.existsSync(options.tempDirectory),
    readyRemoved: !fs.existsSync(options.readyPath),
  }
}

function validateFinalReceipt(receipt) {
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.verifier !== VerifierId ||
    receipt.viewport?.width !== CaptureWidth ||
    receipt.viewport?.height !== CaptureHeight ||
    receipt.currentSource?.channel !== 'development' ||
    !/^[a-f0-9]{40}$/.test(receipt.currentSource?.commit ?? '') ||
    receipt.fixture?.baseVersion !== BaseVersion ||
    receipt.fixture?.targetVersion !== TargetVersion ||
    !semver.gt(TargetVersion, BaseVersion) ||
    receipt.evidenceBoundary?.publishedPayload !== false ||
    receipt.evidenceBoundary?.realElectronSquirrelEventPath !== true ||
    receipt.evidenceBoundary?.historicalPublishedMigration?.capture !==
      HistoricalCaptureBasename ||
    receipt.evidenceBoundary?.historicalPublishedMigration?.captureSha256 !==
      HistoricalCaptureSha256 ||
    receipt.evidenceBoundary?.historicalPublishedMigration?.document !==
      HistoricalEvidenceDocument
  ) {
    fail('Final updater receipt header or version ordering drifted.')
  }
  for (const [label, assertions] of [
    ['isolation', receipt.isolation?.assertions],
    ['updater', receipt.updater?.assertions],
    ['ui', receipt.ui?.assertions],
    ['evidenceBoundary', receipt.evidenceBoundary?.assertions],
    ['privacy', receipt.privacy?.assertions],
    ['cleanup', receipt.cleanup?.assertions],
  ]) {
    assertBooleanAssertions(assertions, label)
  }
  if (
    receipt.capture?.file !== CaptureBasename ||
    receipt.capture.width !== CaptureWidth ||
    receipt.capture.height !== CaptureHeight ||
    receipt.capture.bytes < 20_000 ||
    !/^[a-f0-9]{64}$/.test(receipt.capture.sha256 ?? '') ||
    receipt.protectedInstall?.unchanged !== true ||
    !sameFingerprint(
      receipt.protectedInstall.before,
      receipt.protectedInstall.after
    ) ||
    receipt.externalState?.unchanged !== true ||
    !sameExternalState(
      receipt.externalState.before,
      receipt.externalState.after
    )
  ) {
    fail('Final updater capture or protected-state evidence drifted.')
  }

  const pending = [receipt]
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value === 'string') {
      if (
        /[A-Z]:[\\/]Users[\\/]/i.test(value) ||
        /(?:github_pat_|ghp_|glpat-|authorization|bearer\s)/i.test(value) ||
        /[?&](?:guid|token|access_token)=/i.test(value) ||
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
          value
        ) ||
        /^S-1-5-/i.test(value)
      ) {
        fail(
          'Final updater receipt contains private path or credential material.'
        )
      }
      continue
    }
    if (Array.isArray(value)) pending.push(...value)
    else if (value !== null && typeof value === 'object') {
      pending.push(...Object.values(value))
    }
  }
  return receipt
}

function safeError(error, options = null) {
  let message =
    error instanceof Error
      ? error.stack ?? error.message
      : String(error ?? 'Unknown updater verifier error.')
  if (options !== null) {
    for (const value of [
      options.runRoot,
      options.protectedInstallRoot,
      options.installRoot,
      PackagedAppRoot,
      BuildOutputRoot,
    ]) {
      if (typeof value === 'string' && value !== '') {
        message = message.replaceAll(value, '<redacted-audit-path>')
      }
    }
  }
  return message
    .replace(/[A-Z]:[\\/]Users[\\/][^\\/\r\n]+/gi, '<redacted-user-root>')
    .replace(/[?&]guid=[^&\s]+/gi, '?guid=<redacted>')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '<redacted-guid>'
    )
}

async function main() {
  let options = null
  let client = null
  let mainProcess = null
  let topology = null
  let fixtureServer = null
  let protectedBefore = null
  let protectedAfter = null
  let externalBefore = null
  let externalAfter = null
  let registryCleanup = null
  let pendingReceipt = null
  let primaryError = null
  let normalExitRequested = false
  let processesExited = false
  let cleanup = null

  try {
    options = validateOwnedPaths(parseArguments(process.argv.slice(2)))
    const accounts = validateExecutionAccounts(options)
    assertNoProcessesInRoot(
      options.protectedInstallRoot,
      'Protected user installation'
    )
    topology = await prepareOwnedTopology(options)
    assertNoProcessesInRoot(options.installRoot, 'Owned Squirrel install')
    protectedBefore = await fingerprintTree(
      options.protectedInstallRoot,
      'Protected user installation'
    )
    externalBefore = await snapshotExternalState(options)
    fixtureServer = await startFixtureServer(topology)

    fs.writeFileSync(
      options.readyPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          verifier: VerifierId,
          status: 'safe-to-launch-exact-owned-development-build',
          launch: {
            executable: options.ownedExecutable,
            workingDirectory: options.baseAppDirectory,
            environment: options.environment,
            desktop: options.desktopName,
          },
          arguments: [
            '--remote-debugging-address=127.0.0.1',
            `--remote-debugging-port=${options.port}`,
            `--user-data-dir=${options.userDataDirectory}`,
          ],
          expectedIdentityHash: accounts.executionIdentityHash,
          sourceCommit: topology.build.sourceCommit,
          safetyBoundary:
            'No automatic public-feed check; explicit real IPC uses bounded loopback.',
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', flag: 'wx' }
    )

    const target = await waitForRendererTarget(options.port)
    mainProcess = findOwnedMainProcess(options)
    const ownerSid = queryProcessOwnerSid(mainProcess.processId)
    const desktopNames = queryProcessDesktopNames(mainProcess.processId)
    const isolationAssertions = {
      exactExecutionIdentity:
        ownerSid.toLowerCase() === options.executionUserSid.toLowerCase(),
      verifierCanCleanExecutionHive:
        accounts.verifierRunsAsExecutionIdentity === true,
      nonDefaultHeadlessDesktop:
        desktopNames.includes(options.desktopName) &&
        desktopNames.every(name => !/^(default|winlogon)$/i.test(name)),
      exactOwnedMainProcess:
        Number.isSafeInteger(mainProcess.processId) &&
        mainProcess.processId > 0,
      protectedInstallQuiescent: true,
      uniqueOwnedSquirrelRoot:
        options.fixtureId === fixtureIdentityForRunRoot(options.runRoot),
      automaticPublicFeedEliminated:
        topology.build.channelAssertions.automaticCheckEliminated === true,
    }
    assertBooleanAssertions(isolationAssertions, 'isolation')

    client = new CDPClient(target.webSocketDebuggerUrl)
    await client.open()
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await waitForExpression(
      client,
      `document.querySelector('#desktop-app-container') !== null`,
      'production Desktop Material container'
    )
    const rendererIdentity = await inspectRendererIdentity(client)
    const rendererAssertions = validateRendererIdentity(
      rendererIdentity,
      options,
      mainProcess
    )

    const workspace = await prepareIsolatedUpdaterWorkspace(client)
    await configureCaptureViewport(client)
    await openRealAbout(client)
    const productionIPCInvoked = await invokeRealCheckForUpdates(
      client,
      fixtureServer.url
    )
    const observedStates = await waitForRealUpdateReady(client)
    // The production renderer can finish applying its persisted zoom after the
    // first capture setup. Reassert the attested 960x660, DPR-1 viewport only
    // after the genuine ready event has settled, immediately before inspection.
    await configureCaptureViewport(client)

    const updateLogPath = assertRealFile(
      path.join(options.installRoot, 'Squirrel-Update.log'),
      'Owned Squirrel update log'
    )
    if (fs.statSync(updateLogPath).size > MaximumLogBytes) {
      fail('Owned Squirrel update log exceeded its bound.')
    }
    const squirrel = parseSquirrelEvidence(
      fs.readFileSync(updateLogPath, 'utf8'),
      options.installRoot,
      fixtureServer.url,
      topology.targetPackage.name
    )
    const downloadedPackagePath = assertRealFile(
      path.join(options.installRoot, 'packages', squirrel.package),
      'Downloaded inert full package',
      topology.targetPackage.bytes
    )
    const downloadedPackage = await hashFile(downloadedPackagePath)
    if (
      downloadedPackage.bytes !== topology.targetPackage.bytes ||
      downloadedPackage.sha256 !== topology.targetPackage.sha256 ||
      squirrel.version !== TargetVersion ||
      !semver.gt(squirrel.version, BaseVersion)
    ) {
      fail('Downloaded Squirrel package does not match the inert fixture.')
    }
    const appliedTarget = await assertAppliedInertDirectory(options)
    assertBooleanAssertions(appliedTarget.assertions, 'applied inert target')
    for (const forbiddenLog of [
      'Squirrel-Shortcut.log',
      'Squirrel-ProcessStart.log',
    ]) {
      if (fs.existsSync(path.join(options.installRoot, forbiddenLog))) {
        fail('Squirrel invoked a forbidden shortcut or process-start command.')
      }
    }
    const registryEntry = assertOwnedRegistryEntry(options)
    const serverEvidence = fixtureServerReceipt(fixtureServer, topology)

    const surface = await inspectReadySurface(
      client,
      topology.build.productVersion,
      topology.build.sourceCommit
    )
    assertBooleanAssertions(surface.assertions, 'ui')
    const capture = await captureOriginalPixels(client, options.capturePath)
    pendingReceipt = {
      schemaVersion: 1,
      verifier: VerifierId,
      viewport: { width: CaptureWidth, height: CaptureHeight },
      isolation: {
        mode: 'unique-owned-squirrel-root-and-cleanup-ledger',
        protectedIdentityHash: accounts.protectedIdentityHash,
        executionIdentityHash: accounts.executionIdentityHash,
        identitiesDistinct: accounts.identitiesDistinct,
        desktop: 'owned-non-default-win32-desktop',
        assertions: {
          ...isolationAssertions,
          ...rendererAssertions,
          ...workspace.assertions,
        },
        firstRun: {
          welcomeWasVisible: workspace.welcomeWasVisible,
          completionPreference: 'owned-disposable-profile-only',
        },
      },
      currentSource: {
        commit: topology.build.sourceCommit,
        productVersion: topology.build.productVersion,
        channel: topology.build.channel,
        architecture: topology.build.architecture,
        packagedFingerprint: topology.build.fingerprint,
        copiedFingerprint: topology.copiedFingerprint,
        squirrel: {
          bytes: topology.build.squirrel.bytes,
          sha256: topology.build.squirrel.sha256,
          fileVersion: SquirrelFileVersion,
          productVersion: SquirrelProductVersion,
        },
      },
      fixture: {
        packageIdentityHash: sha256Text(options.fixtureId),
        baseVersion: BaseVersion,
        targetVersion: TargetVersion,
        package: topology.targetPackage.name,
        packageBytes: downloadedPackage.bytes,
        packageSha256: downloadedPackage.sha256,
        appliedTarget,
      },
      updater: {
        source: 'electron-autoUpdater-squirrel-windows',
        productionIPCInvoked,
        observedStates,
        loopback: serverEvidence,
        ownedRegistryEntry: registryEntry,
        assertions: {
          ...squirrel.assertions,
          strictlyNewerFixture: semver.gt(squirrel.version, BaseVersion),
          exactInertPackage:
            downloadedPackage.sha256 === topology.targetPackage.sha256 &&
            downloadedPackage.bytes === topology.targetPackage.bytes,
          noExecutablePayload:
            appliedTarget.assertions.noExecutablePayload === true,
          productionEventsOnly: true,
          quitAndInstallNotInvoked: true,
          providerOrReleaseMutationAbsent: true,
        },
      },
      evidenceBoundary: {
        currentSourceUI: true,
        realElectronSquirrelEventPath: true,
        publishedPayload: false,
        targetPayload: 'verifier-owned-inert-no-executable-full-nupkg',
        historicalPublishedMigration: {
          capture: HistoricalCaptureBasename,
          document: HistoricalEvidenceDocument,
          legacyVersion: LegacyVersion,
          legacyTag: LegacyTag,
          legacyTargetCommit: LegacyTargetCommit,
          legacyPackage: LegacyPackage,
          legacyPackageBytes: LegacyPackageBytes,
          legacyPackageSha256: LegacyPackageSha256,
          legacyReleasesBytes: LegacyReleasesBytes,
          legacyReleasesSha256: LegacyReleasesSha256,
          legacyReleaseEntry: LegacyReleaseEntry,
          captureSha256: HistoricalCaptureSha256,
        },
        assertions: {
          currentBundleCaptured: true,
          realUpdaterEventsObserved: true,
          inertPayloadDisclosed: true,
          publishedPayloadNotClaimed: true,
          historicalEvidenceSeparated: true,
        },
      },
      ui: surface,
      capture,
    }

    normalExitRequested = await requestNormalExit(client)
  } catch (error) {
    primaryError = error
  } finally {
    if (client !== null && !normalExitRequested) {
      await requestCleanupExit(client)
    }
    if (mainProcess !== null && options !== null) {
      try {
        processesExited = await waitForOwnedProcessesToExit(
          options,
          mainProcess.processId
        )
        if (!processesExited) {
          fail('Owned app processes did not exit after the bounded wait.')
        }
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    } else if (options !== null) {
      try {
        assertNoProcessesInRoot(options.installRoot, 'Owned Squirrel install')
        processesExited = true
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    }
    client?.close()

    if (fixtureServer !== null) {
      try {
        await fixtureServer.close()
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    }

    if (options !== null) {
      try {
        if (registryQuery(options.registryKey).exists) {
          registryCleanup = deleteOwnedRegistryKey(options)
        } else {
          registryCleanup = { removed: true, alreadyAbsent: true }
        }
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    }

    if (options !== null && protectedBefore !== null) {
      try {
        assertNoProcessesInRoot(
          options.protectedInstallRoot,
          'Protected user installation'
        )
        protectedAfter = await fingerprintTree(
          options.protectedInstallRoot,
          'Protected user installation'
        )
        if (!sameFingerprint(protectedBefore, protectedAfter)) {
          fail('Protected user installation changed during the updater run.')
        }
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    }

    if (
      options !== null &&
      externalBefore !== null &&
      processesExited &&
      registryCleanup?.removed === true
    ) {
      try {
        externalAfter = await snapshotExternalState(options)
        if (!sameExternalState(externalBefore, externalAfter)) {
          fail('Protected same-user external state changed during the run.')
        }
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    }

    if (options !== null && processesExited) {
      try {
        const install = removeOwnedInstall(options)
        const auxiliary = removeOwnedAuxiliaryState(options)
        cleanup = { ...install, ...auxiliary }
      } catch (error) {
        if (primaryError === null) primaryError = error
      }
    }
  }

  if (primaryError !== null) {
    throw primaryError
  }
  if (
    options === null ||
    pendingReceipt === null ||
    protectedBefore === null ||
    protectedAfter === null ||
    externalBefore === null ||
    externalAfter === null ||
    registryCleanup?.removed !== true ||
    cleanup?.removed !== true ||
    cleanup.profileRemoved !== true ||
    cleanup.tempRemoved !== true ||
    cleanup.readyRemoved !== true
  ) {
    fail('Updater verifier did not reach its complete receipt boundary.')
  }

  const receipt = validateFinalReceipt({
    ...pendingReceipt,
    protectedInstall: {
      before: protectedBefore,
      after: protectedAfter,
      unchanged: sameFingerprint(protectedBefore, protectedAfter),
    },
    externalState: {
      before: externalBefore,
      after: externalAfter,
      unchanged: sameExternalState(externalBefore, externalAfter),
    },
    privacy: {
      assertions: {
        receiptContainsNoAbsoluteUserPath: true,
        receiptContainsNoCredential: true,
        updaterGuidNotPersisted: true,
        squirrelLogNotPersisted: true,
        readyHandshakeWithAbsolutePathsRemoved: cleanup.readyRemoved,
      },
    },
    cleanup: {
      normalFileExitRequested: normalExitRequested,
      ownedProcessesExited: processesExited,
      ownedInstallRemoved: cleanup.removed,
      ownedProfileRemoved: cleanup.profileRemoved,
      ownedTempRemoved: cleanup.tempRemoved,
      ownedRegistryKeyRemoved: registryCleanup.removed,
      readyHandshakeRemoved: cleanup.readyRemoved,
      quitAndInstallNotInvoked: true,
      assertions: {
        normalFileExitRequested: normalExitRequested,
        ownedProcessesExited: processesExited,
        ownedInstallRemoved: cleanup.removed,
        ownedProfileRemoved: cleanup.profileRemoved,
        ownedTempRemoved: cleanup.tempRemoved,
        ownedRegistryKeyRemoved: registryCleanup.removed,
        readyHandshakeRemoved: cleanup.readyRemoved,
        externalStateUnchanged: true,
        protectedInstallUnchanged: true,
        quitAndInstallNotInvoked: true,
      },
    },
  })
  fs.writeFileSync(
    options.receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' }
  )
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      capture: CaptureBasename,
      receipt: ReceiptBasename,
      updateVersion: receipt.fixture.targetVersion,
      protectedInstallUnchanged: true,
      externalStateUnchanged: true,
      ownedRegistryKeyRemoved: true,
      ownedInstallRemoved: true,
    })}\n`
  )
}

if (require.main === module) {
  let parsedOptions = null
  try {
    parsedOptions = parseArguments(process.argv.slice(2))
  } catch {}
  main().catch(error => {
    process.stderr.write(`${safeError(error, parsedOptions)}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  BaseVersion,
  BuildOutputRoot,
  CaptureBasename,
  CaptureHeight,
  CaptureWidth,
  FixtureMarker,
  FixturePackagePrefix,
  HistoricalCaptureBasename,
  HistoricalCaptureSha256,
  HistoricalEvidenceDocument,
  LegacyPackage,
  LegacyPackageBytes,
  LegacyPackageSha256,
  LegacyReleaseEntry,
  LegacyReleasesBytes,
  LegacyReleasesSha256,
  LegacyTag,
  LegacyTargetCommit,
  LegacyVersion,
  PackagedAppRoot,
  ReadyBasename,
  ReceiptBasename,
  RunRootPattern,
  SquirrelBytes,
  SquirrelFileVersion,
  SquirrelProductVersion,
  SquirrelSha256,
  TargetVersion,
  VerifierId,
  assertBooleanAssertions,
  assertDevelopmentRendererBundle,
  buildFixturePackageBuffer,
  fixtureIdentityForRunRoot,
  hermeticReadOnlyGitEnvironment,
  isContainedPath,
  parseArguments,
  parseReleasesManifest,
  parseSquirrelEvidence,
  pngDimensions,
  releaseEntryForBuffer,
  safeError,
  sameExternalState,
  sameFingerprint,
  selectPublishedUpgrade,
  validateInertFixturePackage,
  validateFinalReceipt,
  validateOwnedPaths,
}
