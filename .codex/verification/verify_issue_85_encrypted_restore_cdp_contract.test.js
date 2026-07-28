'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const verifier = require('./verify_issue_85_encrypted_restore_cdp')

const verifierSource = fs.readFileSync(
  path.join(__dirname, 'verify_issue_85_encrypted_restore_cdp.js'),
  'utf8'
)
const operationSource = fs.readFileSync(
  path.join(__dirname, 'prepare_issue_85_encrypted_restore_fixture.ts'),
  'utf8'
)
const bootstrapSource = fs.readFileSync(
  path.join(__dirname, 'run_issue_85_encrypted_restore_fixture.js'),
  'utf8'
)

function validOperationReceipt() {
  return {
    schema: verifier.OperationReceiptSchema,
    operationKind: verifier.OperationKind,
    result: 'succeeded',
    repositoryRelativePath: verifier.RelativePayloadPath,
    releaseTag: 'issue-85-encrypted-compressed-restore',
    productionEntrypoints: ['pinFileToRelease', 'materializePointer'],
    provider: 'github-release',
    transformations: {
      compressedBeforeEncryption: true,
      encrypted: true,
      pointerFormat: 'part-encrypted-deflate',
      plaintextBytes: 4096,
      deflatedBytes: 512,
      storedCiphertextBytes: 640,
      plaintextSha256: '1'.repeat(64),
      storedCiphertextSha256: '2'.repeat(64),
      ciphertextDiffersFromPlaintext: true,
    },
    restore: {
      expectedPhaseOrder: [...verifier.ExpectedPhaseOrder],
      observedPhaseOrder: [...verifier.ExpectedPhaseOrder],
      progressEventCount: 7,
      decryptingProgress: {
        direction: 'download',
        phase: 'decrypting',
        transferredBytes: 640,
        totalBytes: 640,
        logicalTransferredBytes: 4096,
        logicalTotalBytes: 4096,
        actualTransferredBytes: 640,
        actualTotalBytes: 640,
        partOrdinal: 1,
        partsTotal: 1,
        partTransferredBytes: 640,
        partTotalBytes: 640,
        queuedParts: 0,
        activeParts: [
          {
            partOrdinal: 1,
            partsTotal: 1,
            phase: 'decrypting',
            processedBytes: 640,
            totalBytes: 640,
            downloadComplete: true,
          },
        ],
      },
      restoredBytes: 4096,
      restoredSha256: '1'.repeat(64),
      contentMatched: true,
    },
    cleanup: {
      uploadTemporaryPathCount: 1,
      downloadTemporaryPathCount: 1,
      allTemporaryPayloadFilesRemoved: true,
      passwordBufferZeroed: true,
      providerPayloadBuffersZeroed: true,
    },
  }
}

function validSurfaceReceipt() {
  const assertions = Object.fromEntries(
    verifier.ExpectedAssertionNames.map(name => [name, true])
  )
  return {
    schema: verifier.SurfaceReceiptSchema,
    operation: {
      schema: verifier.OperationReceiptSchema,
      operationKind: verifier.OperationKind,
      receiptBytes: 1000,
      receiptSha256: '3'.repeat(64),
      observedPhaseOrder: [...verifier.ExpectedPhaseOrder],
      contentMatched: true,
      temporaryPayloadFilesRemoved: true,
    },
    viewport: {
      width: verifier.Specification.width,
      height: verifier.Specification.height,
      devicePixelRatio: 1,
    },
    appearance: {
      theme: 'dark',
      languageMode: 'bilingual',
      funnyLevelEnglish: 1,
      funnyLevelCantonese: 1,
      reducedMotion: true,
    },
    hydration: {
      appStoreFound: true,
      repositorySelected: true,
      repositoryMatched: true,
      repositoryIdentityValid: true,
      repositoryId: 85,
      repositoryName: 'fixture',
      updateInvoked: true,
      statePublished: true,
      stateRepositoryMatched: true,
      phase: 'decrypting',
      currentLanePhase: 'decrypting',
      currentLanePath: verifier.RelativePayloadPath,
      prefetchLanePresent: false,
    },
    visibleText: {
      phaseBadge: 'Phase: Decrypting · 階段：解密緊',
      lanePhase: 'Decrypting · 解密緊',
      relativePath: verifier.RelativePayloadPath,
    },
    assertions,
  }
}

test('operation harness invokes real production pin and restore entrypoints', () => {
  for (const contract of [
    'pinFileToRelease(',
    'materializePointer(',
    'compressBeforeEncryption: true',
    "update.phase === 'decrypting'",
    'part-encrypted-deflate',
    'password.fill(0)',
    'gateway.dispose()',
    'allTemporaryPayloadFilesRemoved',
  ]) {
    assert.ok(
      operationSource.includes(contract),
      `missing genuine operation contract: ${contract}`
    )
  }
  assert.match(
    operationSource,
    /const ExpectedPhases = \[\s*'downloading',\s*'decrypting',\s*'decompressing',\s*'verifying',\s*'materializing',/m
  )
  assert.doesNotMatch(operationSource, /updateCheapLfsRestore/)
  assert.doesNotMatch(
    operationSource,
    /electron(?:\.exe)?|Page\.captureScreenshot/
  )
  assert.match(bootstrapSource, /ts-node\/register\/transpile-only/)
  assert.match(bootstrapSource, /__PROCESS_KIND__: 'main'/)
  assert.match(bootstrapSource, /const \{ main \} = require\(/)
  assert.doesNotMatch(
    bootstrapSource,
    /child_process|spawn|execFile|Start-Process|electron\.exe/
  )
})

test('CDP scene consumes the genuine receipt and publishes only through AppStore', () => {
  for (const contract of [
    "requiredPath('operation-receipt')",
    'validateOperationReceipt(receipt)',
    'buildAppProgress(',
    'appStore.updateCheapLfsRestore(progress)',
    'appStore.updateCheapLfsRestore(null)',
    'Page.captureScreenshot',
    'fromSurface: true',
    'Phase: Decrypting · 階段：解密緊',
    'Decrypting · 解密緊',
    '.cheap-lfs-restore-lane-meta > span:last-child',
  ]) {
    assert.ok(
      verifierSource.includes(contract),
      `missing genuine CDP contract: ${contract}`
    )
  }
  assert.doesNotMatch(verifierSource, /restoreProgressFixture/)
  assert.doesNotMatch(
    verifierSource,
    /spawnSync|execFile|Start-Process|child_process|electron\.exe/
  )
})

test('fixed scene pins bilingual plain voice and a wide production viewport', () => {
  assert.deepEqual(verifier.Specification, {
    width: 1440,
    height: 960,
    languageMode: 'bilingual',
    funnyLevelEnglish: 1,
    funnyLevelCantonese: 1,
  })
})

test('CLI parsing requires the operation receipt and rejects drift', () => {
  const base = [
    '--port',
    '9337',
    '--run-root',
    'C:\\Temp\\desktop-material-cheap-lfs-restore-progress-issue85',
    '--repository-path',
    'C:\\Temp\\desktop-material-cheap-lfs-restore-progress-issue85\\fixture',
    '--operation-receipt',
    'C:\\Temp\\desktop-material-cheap-lfs-restore-progress-issue85\\receipts\\operation.json',
    '--capture',
    'C:\\Temp\\desktop-material-cheap-lfs-restore-progress-issue85\\captures\\decrypting.png',
    '--receipt',
    'C:\\Temp\\desktop-material-cheap-lfs-restore-progress-issue85\\receipts\\surface.json',
  ]
  const parsed = verifier.parseArguments(base)
  assert.equal(parsed.port, 9337)
  assert.equal(parsed.specification, verifier.Specification)
  assert.throws(
    () => verifier.parseArguments([...base, '--mystery', 'value']),
    /Unsupported/
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--port', '9338']),
    /Duplicate/
  )
  assert.throws(
    () =>
      verifier.parseArguments(
        base.slice(0, base.indexOf('--operation-receipt'))
      ),
    /--operation-receipt is required/
  )
})

test('operation receipt validator locks encryption, compression, phase order, content, and cleanup', () => {
  const receipt = validOperationReceipt()
  assert.equal(verifier.validateOperationReceipt(receipt), receipt)

  for (const mutate of [
    candidate => candidate.restore.observedPhaseOrder.splice(1, 1),
    candidate => {
      candidate.restore.decryptingProgress.phase = 'decompressing'
    },
    candidate => {
      candidate.restore.decryptingProgress.activeParts[0].phase = 'verifying'
    },
    candidate => {
      candidate.transformations.encrypted = false
    },
    candidate => {
      candidate.transformations.deflatedBytes =
        candidate.transformations.plaintextBytes
    },
    candidate => {
      candidate.restore.contentMatched = false
    },
    candidate => {
      candidate.cleanup.allTemporaryPayloadFilesRemoved = false
    },
    candidate => {
      candidate.cleanup.passwordBufferZeroed = false
    },
    candidate => {
      candidate.privatePath = 'C:\\Users\\someone\\secret'
    },
  ]) {
    const candidate = structuredClone(receipt)
    mutate(candidate)
    assert.throws(() => verifier.validateOperationReceipt(candidate))
  }
})

test('AppStore progress is derived from the real decrypting callback', () => {
  const operation = validOperationReceipt()
  const progress = verifier.buildAppProgress(operation, 85, 'fixture')
  assert.equal(progress.repositoryId, 85)
  assert.equal(progress.repositoryName, 'fixture')
  assert.equal(progress.phase, 'decrypting')
  assert.equal(progress.currentLane.phase, 'decrypting')
  assert.equal(progress.currentLane.relativePath, verifier.RelativePayloadPath)
  assert.equal(progress.currentLane.processedBytes, 640)
  assert.equal(progress.currentLane.totalBytes, 640)
  assert.equal(progress.currentLane.percent, 100)
  assert.equal(progress.prefetchLane, null)
  assert.equal(progress.actualDownloadedBytes, 640)
  assert.equal(progress.logicalProcessedBytes, 4096)
})

test('strict surface and final receipts reject false gates, extras, and cleanup gaps', () => {
  const surface = validSurfaceReceipt()
  assert.equal(verifier.validateSurfaceReceipt(surface), surface)

  const falseGate = structuredClone(surface)
  falseGate.assertions.genuineDecryptingBadgeVisible = false
  assert.throws(
    () => verifier.validateSurfaceReceipt(falseGate),
    /genuineDecryptingBadgeVisible/
  )

  const extra = structuredClone(surface)
  extra.assertions.unreviewed = true
  assert.throws(() => verifier.validateSurfaceReceipt(extra))

  const final = {
    ...surface,
    capture: {
      width: verifier.Specification.width,
      height: verifier.Specification.height,
      bytes: 20_001,
      sha256: '4'.repeat(64),
    },
    cleanup: {
      appStoreFound: true,
      updateInvoked: true,
      stateCleared: true,
      cardRemoved: true,
    },
  }
  assert.equal(verifier.validateFinalReceipt(final), final)
  const cleanupGap = structuredClone(final)
  cleanupGap.cleanup.cardRemoved = false
  assert.throws(() => verifier.validateFinalReceipt(cleanupGap))
})

test('cleanup always clears AppStore before the CDP connection closes', () => {
  const mainIndex = verifierSource.indexOf('async function main()')
  const cleanupCall = verifierSource.lastIndexOf(
    'cleanup = await clearRestoreProgress()'
  )
  const clearUpdate = verifierSource.lastIndexOf(
    'appStore.updateCheapLfsRestore(null)'
  )
  const close = verifierSource.lastIndexOf('client.close()')
  assert.ok(mainIndex >= 0)
  assert.ok(clearUpdate > 0)
  assert.ok(cleanupCall > mainIndex)
  assert.ok(close > cleanupCall)
})

test('top-level non-Error failures remain diagnosable', () => {
  assert.match(
    verifierSource,
    /Unknown genuine encrypted Cheap LFS restore surface verifier error/
  )
  assert.match(operationSource, /Unknown genuine Cheap LFS restore fixture/)
  assert.match(
    bootstrapSource,
    /Unknown genuine Cheap LFS restore fixture bootstrap/
  )
  assert.match(verifierSource, /error instanceof Error/)
  assert.match(operationSource, /error instanceof Error/)
  assert.match(bootstrapSource, /error instanceof Error/)
})
