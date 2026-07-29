'use strict'

/* eslint-disable no-sync -- contract tests use bounded owned temp fixtures */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const verifierPath = path.join(
  __dirname,
  'verify_gallery_auto_updater_ready_cdp.js'
)
const verifier = require(verifierPath)
const source = fs.readFileSync(verifierPath, 'utf8')

const ProtectedSid = 'S-1-5-21-111111111-222222222-333333333-1001'
const ExecutionSid = 'S-1-5-21-111111111-222222222-333333333-1002'

function completeArguments(runRoot) {
  return [
    '--port',
    '9337',
    '--run-root',
    runRoot,
    '--protected-install-root',
    path.join(os.tmpdir(), 'protected-github-desktop-contract'),
    '--protected-user-sid',
    ProtectedSid,
    '--execution-user-sid',
    ExecutionSid,
    '--desktop-name',
    'DMUpdaterContract',
    '--capture',
    path.join(runRoot, 'captures', verifier.CaptureBasename),
    '--receipt',
    path.join(runRoot, 'receipts', verifier.ReceiptBasename),
    '--ready',
    path.join(runRoot, 'receipts', verifier.ReadyBasename),
  ]
}

function passingReceipt() {
  const fingerprint = {
    sha256: 'a'.repeat(64),
    files: 10,
    directories: 3,
    bytes: 12_345,
  }
  const external = {
    registry: {
      environment: { exists: true, sha256: 'c'.repeat(64), bytes: 100 },
    },
    filesystem: {
      protectedStartMenu: { exists: false },
    },
  }
  return {
    schemaVersion: 1,
    verifier: verifier.VerifierId,
    viewport: {
      width: verifier.CaptureWidth,
      height: verifier.CaptureHeight,
    },
    isolation: { assertions: { exact: true } },
    currentSource: {
      channel: 'development',
      commit: 'd'.repeat(40),
    },
    fixture: {
      baseVersion: verifier.BaseVersion,
      targetVersion: verifier.TargetVersion,
    },
    updater: { assertions: { genuine: true } },
    evidenceBoundary: {
      publishedPayload: false,
      realElectronSquirrelEventPath: true,
      historicalPublishedMigration: {
        capture: verifier.HistoricalCaptureBasename,
        captureSha256: verifier.HistoricalCaptureSha256,
        document: verifier.HistoricalEvidenceDocument,
      },
      assertions: { honest: true },
    },
    ui: { assertions: { ready: true } },
    capture: {
      file: verifier.CaptureBasename,
      width: verifier.CaptureWidth,
      height: verifier.CaptureHeight,
      bytes: 20_001,
      sha256: 'b'.repeat(64),
    },
    protectedInstall: {
      before: fingerprint,
      after: { ...fingerprint },
      unchanged: true,
    },
    externalState: {
      before: external,
      after: structuredClone(external),
      unchanged: true,
    },
    privacy: { assertions: { clean: true } },
    cleanup: { assertions: { complete: true } },
  }
}

test('pins output geometry, Squirrel binary, and historical evidence boundary', () => {
  assert.equal(verifier.CaptureWidth, 960)
  assert.equal(verifier.CaptureHeight, 660)
  assert.equal(
    verifier.CaptureBasename,
    'auto-updater-current-source-ready.png'
  )
  assert.equal(
    verifier.ReceiptBasename,
    'auto-updater-current-source-ready-receipt.json'
  )
  assert.equal(
    verifier.ReadyBasename,
    'auto-updater-current-source-ready-verifier-ready.json'
  )
  assert.equal(verifier.VerifierId, 'gallery-auto-updater-current-source-ready')
  assert.equal(
    verifier.HistoricalCaptureBasename,
    'auto-updater-update-ready.png'
  )
  assert.notEqual(verifier.CaptureBasename, verifier.HistoricalCaptureBasename)
  assert.equal(verifier.BaseVersion, '9000.0.0')
  assert.equal(verifier.TargetVersion, '9000.0.1')
  assert.equal(verifier.SquirrelBytes, 1_899_520)
  assert.equal(
    verifier.SquirrelSha256,
    '76359cd4b0349a83337b941332ad042c90351c2bb0a4628307740324C97984CC'.toLowerCase()
  )
  assert.equal(verifier.SquirrelFileVersion, '2.0.1.1')
  assert.equal(verifier.SquirrelProductVersion, '2.0.1+eef37460ae')
  assert.equal(verifier.LegacyVersion, '3.6.3-beta3-s000000000201')
  assert.equal(verifier.LegacyTag, `v${verifier.LegacyVersion}`)
  assert.equal(
    verifier.LegacyTargetCommit,
    'fa4806971c5515766fee5a0ab03a76adfdd11d79'
  )
  assert.equal(verifier.LegacyPackageBytes, 311_014_524)
  assert.equal(
    verifier.LegacyPackageSha256,
    'e73548bcae9c51c8f7540c9ef49f32f83bbcc3cfecc08bec5b095d60109bb238'
  )
  assert.equal(
    verifier.HistoricalEvidenceDocument,
    'docs/verification/auto-updater-version-order-2026-07-22.md'
  )
  assert.equal(
    verifier.HistoricalCaptureSha256,
    'a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d'
  )
})

test('strict CLI requires explicit execution identity and non-default desktop', () => {
  const runRoot = path.join(
    os.tmpdir(),
    'desktop-material-updater-ready-contract-parser'
  )
  const args = completeArguments(runRoot)
  const parsed = verifier.parseArguments(args)
  assert.equal(parsed.port, 9337)
  assert.equal(parsed.desktopName, 'DMUpdaterContract')
  assert.equal(parsed.protectedUserSid, ProtectedSid)
  assert.equal(parsed.executionUserSid, ExecutionSid)

  assert.throws(
    () => verifier.parseArguments([...args, '--host', '0.0.0.0']),
    /Unsupported argument/
  )
  assert.throws(
    () => verifier.parseArguments([...args, '--port', '9338']),
    /Duplicate argument/
  )
  assert.doesNotThrow(() =>
    verifier.parseArguments(
      args.map(value => (value === ExecutionSid ? ProtectedSid : value))
    )
  )
  assert.throws(
    () =>
      verifier.parseArguments(
        args.map(value => (value === 'DMUpdaterContract' ? 'Default' : value))
      ),
    /visible desktop/
  )
  assert.throws(
    () =>
      verifier.parseArguments(
        args.filter(
          (value, index, values) =>
            value !== '--execution-user-sid' &&
            values[index - 1] !== '--execution-user-sid'
        )
      ),
    /execution-user-sid is required/
  )
})

test('fixture identity is deterministic, unique, and valid for NuGet and HKCU', () => {
  const first = verifier.fixtureIdentityForRunRoot(
    path.join(os.tmpdir(), 'desktop-material-updater-ready-first')
  )
  const second = verifier.fixtureIdentityForRunRoot(
    path.join(os.tmpdir(), 'desktop-material-updater-ready-second')
  )
  assert.match(
    first,
    new RegExp(`^${verifier.FixturePackagePrefix}-[a-f0-9]{16}$`)
  )
  assert.equal(
    first,
    verifier.fixtureIdentityForRunRoot(
      path.join(os.tmpdir(), 'desktop-material-updater-ready-first')
    )
  )
  assert.notEqual(first, second)
})

test('fixture nupkg is deterministic, valid, bounded, and has no executable', async t => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dm-updater-nupkg-contract-')
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const packageId = `${verifier.FixturePackagePrefix}-abcdef0123456789`
  const first = await verifier.buildFixturePackageBuffer(
    packageId,
    verifier.TargetVersion,
    'ready'
  )
  const second = await verifier.buildFixturePackageBuffer(
    packageId,
    verifier.TargetVersion,
    'ready'
  )
  assert.deepEqual(first, second)
  const packageName = `${packageId}-${verifier.TargetVersion}-full.nupkg`
  const packagePath = path.join(root, packageName)
  fs.writeFileSync(packagePath, first, { flag: 'wx' })
  const inspection = await verifier.validateInertFixturePackage(
    packagePath,
    packageId,
    verifier.TargetVersion
  )
  assert.equal(inspection.assertions.noExecutablePayload, true)
  assert.ok(inspection.entries.includes(`lib/net45/${verifier.FixtureMarker}`))
  assert.ok(inspection.entries.every(name => !/\.exe$/i.test(name)))

  const releaseEntry = verifier.releaseEntryForBuffer(packageName, first)
  const parsed = verifier.parseReleasesManifest(releaseEntry)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].packageId, packageId)
  assert.equal(parsed[0].version, verifier.TargetVersion)
  assert.equal(parsed[0].kind, 'full')
  assert.equal(parsed[0].bytes, first.byteLength)
})

test('manifest parser still identifies the immutable historical full package', () => {
  const manifest = [
    verifier.LegacyReleaseEntry,
    '89ABCDEF0123456789ABCDEF0123456789ABCDEF ' +
      'GitHubDesktop-3.6.3-beta3-zadtbhvdfc-delta.nupkg 100',
    'FEDCBA9876543210FEDCBA9876543210FEDCBA98 ' +
      'GitHubDesktop-3.6.3-beta3-zadtbhvdfc-full.nupkg 311110476',
  ].join('\n')
  const selected = verifier.selectPublishedUpgrade(manifest)
  assert.deepEqual(selected, {
    releaseHash: 'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
    package: 'GitHubDesktop-3.6.3-beta3-zadtbhvdfc-full.nupkg',
    packageId: 'GitHubDesktop',
    version: '3.6.3-beta3-zadtbhvdfc',
    kind: 'full',
    bytes: 311_110_476,
  })
  assert.throws(
    () => verifier.selectPublishedUpgrade(verifier.LegacyReleaseEntry),
    /strict full-package upgrade/
  )
})

test('development bundle attestation rejects any automatic updater call', t => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dm-updater-renderer-contract-')
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const commit = 'e'.repeat(40)
  const rendererPath = path.join(root, 'renderer.js')
  fs.writeFileSync(
    rendererPath,
    `${commit};class App{async performDeferredLaunchActions(){` +
      'await updateStore.isUpdateShowcase()}' +
      'scheduleDeferredLaunchActions(){}}',
    'utf8'
  )
  assert.equal(
    verifier.assertDevelopmentRendererBundle(rendererPath, commit)
      .automaticCheckEliminated,
    true
  )
  fs.writeFileSync(
    rendererPath,
    `${commit};class App{async performDeferredLaunchActions(){` +
      'this.checkForUpdates(true);await updateStore.isUpdateShowcase()}' +
      'scheduleDeferredLaunchActions(){}}',
    'utf8'
  )
  assert.throws(
    () => verifier.assertDevelopmentRendererBundle(rendererPath, commit),
    /development bundle assertions failed/
  )
})

test('Squirrel evidence requires exact loopback apply and inert fallback', () => {
  const installRoot = path.join(
    os.tmpdir(),
    'desktop-material-updater-ready-log',
    'DesktopMaterialUpdaterReadyVerifier-abcdef0123456789'
  )
  const feedURL = 'http://127.0.0.1:45678/feed/'
  const packageName =
    `DesktopMaterialUpdaterReadyVerifier-abcdef0123456789-` +
    `${verifier.TargetVersion}-full.nupkg`
  const log = [
    `info: Program: Starting Squirrel Updater: --update ${feedURL}`,
    `info: Program: Starting update, downloading from ${feedURL}`,
    `info: Program: About to update to: ${installRoot}`,
    `info: FileDownloader: Downloading file: ${feedURL}${packageName}`,
    'info: ApplyReleasesImpl: Writing files to app directory: ' +
      path.join(installRoot, `app-${verifier.TargetVersion}`),
    'info: ApplyReleasesImpl: Squirrel Enabled Apps: []',
    'warn: ApplyReleasesImpl: No apps are marked as Squirrel-aware! ' +
      'Going to run them all',
    'info: ApplyReleasesImpl: Starting fixPinnedExecutables',
    'info: ApplyReleasesImpl: Fixing up tray icons',
    'info: Program: Finished Squirrel Updater',
  ].join('\n')
  const evidence = verifier.parseSquirrelEvidence(
    log,
    installRoot,
    feedURL,
    packageName
  )
  assert.equal(evidence.version, verifier.TargetVersion)
  assert.equal(evidence.package, packageName)
  assert.ok(Object.values(evidence.assertions).every(Boolean))

  assert.throws(
    () =>
      verifier.parseSquirrelEvidence(
        log.replace('Squirrel Enabled Apps: []', 'Squirrel Enabled Apps: [x]'),
        installRoot,
        feedURL,
        packageName
      ),
    /genuine owned-update contract/
  )
  assert.throws(
    () =>
      verifier.parseSquirrelEvidence(
        `${log}\nhttps://github.com/Ding-Ding-Projects/desktop-material/releases`,
        installRoot,
        feedURL,
        packageName
      ),
    /genuine owned-update contract/
  )
})

test('final receipt rejects boundary, capture, state, and privacy drift', () => {
  assert.equal(
    verifier.validateFinalReceipt(passingReceipt()).fixture.targetVersion,
    verifier.TargetVersion
  )

  const wrongTarget = passingReceipt()
  wrongTarget.fixture.targetVersion = verifier.BaseVersion
  assert.throws(
    () => verifier.validateFinalReceipt(wrongTarget),
    /version ordering/
  )

  const publishedClaim = passingReceipt()
  publishedClaim.evidenceBoundary.publishedPayload = true
  assert.throws(
    () => verifier.validateFinalReceipt(publishedClaim),
    /version ordering/
  )

  const historicalCollision = passingReceipt()
  historicalCollision.evidenceBoundary.historicalPublishedMigration.capture =
    verifier.CaptureBasename
  assert.throws(
    () => verifier.validateFinalReceipt(historicalCollision),
    /version ordering/
  )

  const failedAssertion = passingReceipt()
  failedAssertion.ui.assertions.ready = false
  assert.throws(
    () => verifier.validateFinalReceipt(failedAssertion),
    /ui assertions failed/
  )

  const wrongCapture = passingReceipt()
  wrongCapture.capture.width = 959
  assert.throws(
    () => verifier.validateFinalReceipt(wrongCapture),
    /protected-state/
  )

  const changedProtected = passingReceipt()
  changedProtected.protectedInstall.after.sha256 = 'f'.repeat(64)
  assert.throws(
    () => verifier.validateFinalReceipt(changedProtected),
    /protected-state/
  )

  const changedExternal = passingReceipt()
  changedExternal.externalState.after.registry.environment.bytes = 101
  assert.throws(
    () => verifier.validateFinalReceipt(changedExternal),
    /protected-state/
  )

  for (const privateValue of [
    'C:\\Users\\private\\secret',
    'https://example.invalid/?guid=secret',
    'S-1-5-21-111111111-222222222-333333333-1001',
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  ]) {
    const privateReceipt = passingReceipt()
    privateReceipt.note = privateValue
    assert.throws(
      () => verifier.validateFinalReceipt(privateReceipt),
      /private path/
    )
  }
})

test('path and PNG helpers keep containment and original-pixel geometry strict', () => {
  const root = path.join(os.tmpdir(), 'owned-root')
  assert.equal(
    verifier.isContainedPath(root, path.join(root, 'captures', 'a.png')),
    true
  )
  assert.equal(verifier.isContainedPath(root, root), false)
  assert.equal(
    verifier.isContainedPath(root, path.join(root, '..', 'escape')),
    false
  )

  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png, 0)
  Buffer.from('IHDR').copy(png, 12)
  png.writeUInt32BE(960, 16)
  png.writeUInt32BE(660, 20)
  assert.deepEqual(verifier.pngDimensions(png), {
    width: 960,
    height: 660,
  })
})

test('source Git provenance is hermetic and includes non-ignored untracked files', () => {
  const inheritedEnvironment = {
    Path: 'preserved-path',
    GIT_DIR: 'redirected-git-dir',
    Git_Work_Tree: 'redirected-work-tree',
    GIT_INDEX_FILE: 'redirected-index',
    GIT_OBJECT_DIRECTORY: 'redirected-objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: 'redirected-alternates',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'include.path',
    GIT_CONFIG_VALUE_0: 'redirected-config',
    GIT_TRACE2_EVENT: 'redirected-trace',
    GIT_SSH_COMMAND: 'redirected-ssh',
    Gcm_Interactive: 'Always',
    ssh_askpass: 'redirected-askpass',
  }
  const environment =
    verifier.hermeticReadOnlyGitEnvironment(inheritedEnvironment)

  assert.equal(environment.Path, 'preserved-path')
  for (const forbidden of [
    'GIT_DIR',
    'Git_Work_Tree',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'GIT_TRACE2_EVENT',
    'GIT_SSH_COMMAND',
    'Gcm_Interactive',
    'ssh_askpass',
  ]) {
    assert.equal(environment[forbidden], undefined, forbidden)
  }
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  assert.equal(environment.GIT_CONFIG_GLOBAL, nullDevice)
  assert.equal(environment.GIT_CONFIG_SYSTEM, nullDevice)
  assert.equal(environment.GIT_CONFIG_NOSYSTEM, '1')
  assert.equal(environment.GIT_OPTIONAL_LOCKS, '0')
  assert.equal(environment.GIT_NO_REPLACE_OBJECTS, '1')
  assert.equal(environment.GIT_TERMINAL_PROMPT, '0')
  assert.equal(environment.GCM_INTERACTIVE, 'Never')
  assert.equal(environment.GIT_ASKPASS, '')
  assert.equal(environment.SSH_ASKPASS, '')

  for (const required of [
    "'--no-optional-locks'",
    '`core.hooksPath=${GitNullDevice}`',
    "'core.fsmonitor=false'",
    "'core.untrackedCache=false'",
    'env: hermeticReadOnlyGitEnvironment()',
    "['rev-parse', '--show-toplevel']",
    "['rev-parse', '--verify', 'HEAD^{commit}']",
    "['status', '--porcelain=v1', '-z', '--untracked-files=all']",
    'staged, unstaged, or non-ignored untracked files',
  ]) {
    assert.ok(
      source.includes(required),
      `missing hermetic Git contract: ${required}`
    )
  }
  assert.equal(source.includes("'--untracked-files=no'"), false)
})

test('source gates launch on exact development bundle and unique owned topology', () => {
  for (const required of [
    'const PackagedAppRoot = path.join(',
    "'GitHubDesktop-win32-x64'",
    'RELEASE_CHANNEL=development production build',
    'assertDevelopmentRendererBundle',
    'automaticCheckEliminated',
    'fixtureIdentityForRunRoot',
    'prepareOwnedTopology',
    'SquirrelSha256',
    'Owned base application is not an exact packaged-build copy.',
    'safe-to-launch-exact-owned-development-build',
  ]) {
    assert.ok(source.includes(required), `missing source contract: ${required}`)
  }
})

test('PowerShell probes preserve multiline scripts and sanitize forbidden process controls', () => {
  for (const required of [
    "Buffer.from(source, 'utf16le').toString('base64')",
    "'-EncodedCommand'",
    'sanitizeForbiddenControlCharacters',
    '/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]/g',
    "'\\uFFFD'",
  ]) {
    assert.ok(
      source.includes(required),
      `missing robust PowerShell probe contract: ${required}`
    )
  }
  assert.equal(source.includes("'-Command',\n        '-'"), false)
  assert.ok(
    source.includes(
      '[System.Diagnostics.Process]::GetProcessById(${processId}).Threads'
    )
  )
  assert.equal(source.includes('Get-CimInstance Win32_Thread'), false)
})

test('source invokes real IPC, observes real state, and never fabricates ready UI', () => {
  for (const required of [
    'prepareIsolatedUpdaterWorkspace',
    "localStorage.setItem('has-shown-welcome-flow', '1')",
    'accountAndProviderFlowsNotInvoked: true',
    "'check-for-updates'",
    'invokeRealCheckForUpdates',
    "'auto-updater-update-downloaded'",
    'genuineUpdateStoreReady: updateStatus === 3',
    "'An update has been downloaded and is ready to be installed.'",
    "'Quit and Install Update'",
    'button.click()',
  ]) {
    if (required === "'auto-updater-update-downloaded'") {
      assert.equal(
        source.includes(required),
        false,
        'verifier must observe DOM/store, not emit the updater event'
      )
    } else if (required === 'button.click()') {
      assert.equal(
        source.includes(required),
        false,
        'verifier must not click the baked public-feed About button'
      )
    } else {
      assert.ok(
        source.includes(required),
        `missing source contract: ${required}`
      )
    }
  }
  for (const forbidden of [
    'quit-and-install-updates',
    'quitAndInstall(',
    'UpdateStatus.UpdateReady',
    '.status = 3',
    'dispatchEvent(new',
    'Setup.exe --',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `forbidden updater shortcut: ${forbidden}`
    )
  }
})

test('owned first-run preference always reaches a newly loaded renderer', () => {
  const start = source.indexOf(
    'async function prepareIsolatedUpdaterWorkspace(client)'
  )
  const end = source.indexOf('\nasync function openRealAbout(client)', start)
  assert.ok(start >= 0 && end > start, 'missing isolated workspace helper')

  const helper = source.slice(start, end)
  for (const required of [
    "localStorage.setItem('has-shown-welcome-flow', '1')",
    "await client.send('Page.reload', { ignoreCache: false })",
    "'performance.timeOrigin'",
    "'isolated updater renderer reload'",
  ]) {
    assert.ok(
      helper.includes(required),
      `missing first-run reload contract: ${required}`
    )
  }
  assert.equal(
    helper.includes('if (welcomeWasVisible)'),
    false,
    'renderer reload must not depend on welcome mounting before the probe'
  )
})

test('current-source About assertions ignore screen-reader duplication and pin the development build label', () => {
  assert.ok(source.includes("clone.querySelectorAll('.sr-only')"))
  assert.ok(
    source.includes("'Build ${sourceCommit.slice(0, 10)} (x64)'"),
    'development capture must prove the exact visible source build'
  )
  assert.equal(
    source.includes("'Version ${productVersion} (x64)'"),
    false,
    'development builds expose a Build label, not a release Version label'
  )
  assert.equal(
    [...source.matchAll(/await configureCaptureViewport\(client\)/g)].length,
    2,
    'the final ready surface must reassert geometry after persisted zoom settles'
  )
})

test('source contains loopback, registry, external-state, and cleanup ledgers', () => {
  for (const required of [
    "server.listen(0, '127.0.0.1'",
    "request.method !== 'GET'",
    'noExecutablePayload',
    'registryQuery(options.registryKey).exists',
    'deleteOwnedRegistryKey(options)',
    "registryFingerprint('HKCU\\\\Environment')",
    'protectedProductUninstall',
    'trayIconStreams',
    'pinnedTaskbar',
    'sameExternalState(externalBefore, externalAfter)',
    'ownedRegistryKeyRemoved',
    'readyHandshakeRemoved',
  ]) {
    assert.ok(source.includes(required), `missing source contract: ${required}`)
  }
  assert.equal(source.includes('fetch('), false)
  assert.equal(source.includes('https://api.github.com'), false)
})

test('source captures before attested File Exit and does not kill a process', () => {
  const captureIndex = source.lastIndexOf(
    'captureOriginalPixels(client, options.capturePath)'
  )
  const exitIndex = source.lastIndexOf(
    'normalExitRequested = await requestNormalExit(client)'
  )
  assert.ok(captureIndex > 0)
  assert.ok(exitIndex > captureIndex)
  assert.ok(source.includes("'execute-menu-item-by-id', '@.&File.quit'"))
  assert.ok(source.includes('return true'))
  assert.equal(source.includes('.Kill('), false)
  assert.equal(source.includes('Stop-Process'), false)
  assert.equal(source.includes('taskkill'), false)
})

test('receipt explicitly separates current inert proof from historical publication', () => {
  for (const required of [
    'currentSourceUI: true',
    'realElectronSquirrelEventPath: true',
    'publishedPayload: false',
    "targetPayload: 'verifier-owned-inert-no-executable-full-nupkg'",
    'historicalPublishedMigration',
    'capture: HistoricalCaptureBasename',
    'publishedPayloadNotClaimed: true',
    'historicalEvidenceSeparated: true',
  ]) {
    assert.ok(
      source.includes(required),
      `missing evidence boundary: ${required}`
    )
  }
})

test('safe errors redact owned paths, user roots, GUIDs, and updater query IDs', () => {
  const options = {
    runRoot: 'C:\\Users\\person\\AppData\\Local\\Temp\\owned',
    protectedInstallRoot: 'C:\\Users\\person\\AppData\\Local\\GitHubDesktop',
    installRoot: 'C:\\Users\\person\\AppData\\Local\\Temp\\owned\\fixture',
  }
  const value = verifier.safeError(
    new Error(
      `${options.installRoot}\\x?guid=secret ` +
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    ),
    options
  )
  assert.equal(value.includes('person'), false)
  assert.equal(value.includes('secret'), false)
  assert.equal(value.includes('aaaaaaaa-bbbb'), false)
  assert.ok(value.includes('<redacted-audit-path>'))
  assert.ok(value.includes('?guid=<redacted>'))
  assert.ok(value.includes('<redacted-guid>'))
})
