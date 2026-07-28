'use strict'

/* eslint-disable no-sync -- contract tests read bounded repository files */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const verifier = require('./verify_gallery_cheap_lfs_live_cdp')
const source = fs.readFileSync(
  path.join(__dirname, 'verify_gallery_cheap_lfs_live_cdp.js'),
  'utf8'
)

function validSurfaceReceipt(scenario) {
  const specification = verifier.ScenarioSpecifications[scenario]
  const cloud = scenario === 'cloud-compression'
  const relativePaths =
    specification.expectedPath === null
      ? Array.from(
          { length: specification.pointerCount },
          (_, index) => `public-bambu-${String(index + 1).padStart(2, '0')}.bin`
        )
      : [specification.expectedPath]
  return {
    schema: verifier.SurfaceReceiptSchema,
    scenario,
    evidence: {
      mode: 'retained-state-validation',
      stateValidationPerformed: true,
      providerMutationPerformed: false,
      repositoryMutationPerformed: false,
      clonePerformedByVerifier: false,
      mutationReceipt: null,
    },
    repository: {
      selectedPathMatched: true,
      gitEntryKind: 'real-directory',
      visibility: specification.visibility,
      publicIdentity: specification.publicIdentity,
      freshCloneReflogValidated: true,
      worktreeClean: true,
      expectedCommitMatched: true,
      originTrackingTipMatched: true,
    },
    viewport: {
      captureWidth: specification.width,
      captureHeight: specification.height,
      cssWidth: Math.round(specification.width / specification.zoomFactor),
      cssHeight: Math.round(specification.height / specification.zoomFactor),
      devicePixelRatio: specification.zoomFactor,
      physicalWidth: specification.width,
      physicalHeight: specification.height,
      zoomFactor: specification.zoomFactor,
    },
    appearance: {
      theme: specification.theme,
      languageMode: specification.languageMode,
      funnyLevelEnglish: 1,
      funnyLevelCantonese: 1,
      reducedMotion: true,
    },
    state: {
      loaded: true,
      busy: null,
      errorPresent: false,
      pointerCount: specification.pointerCount,
      releasePointerCount: specification.pointerCount,
      validIntegrityCount: specification.pointerCount,
      localPointerCount: specification.pointerCount,
      visibleMaterializeButtonCount: cloud ? 1 : 2,
      cloudPrivateOptIn: cloud,
      cloudWorkflowReady: false,
      persistedCloudOptIn: cloud,
      managedWorkflowKind: cloud ? 'encrypted-public-builder-routed' : null,
      compressedPointerCount: cloud ? 1 : 0,
      compressionSavingsPercent: cloud ? 99.9 : null,
      relativePaths,
      pointerSetSha256: '1'.repeat(64),
    },
    visibleText: {
      managerTitle:
        specification.languageMode === 'bilingual'
          ? 'Cheap LFS manager · Cheap LFS 管理器'
          : 'Cheap LFS manager',
      trackedSummary: `${specification.pointerCount} tracked by Cheap LFS`,
      firstPath: relativePaths[0],
      workflowIndicator: cloud
        ? 'No workflow was added to this private repository. Compression runs through the encrypted public builder. · 呢個私人 repo 冇加過 workflow，壓縮會經加密 public builder 做。'
        : '',
      compressionLabel: cloud
        ? 'Compressed · 99.9% smaller · 已壓縮 · 慳咗 99.9%'
        : '',
      materializeLabel: 'Materialize',
      privacyCorpusSha256: '2'.repeat(64),
    },
    assertions: Object.fromEntries(
      verifier.ExpectedAssertionNames.map(name => [name, true])
    ),
  }
}

function validFinalReceipt(scenario) {
  const specification = verifier.ScenarioSpecifications[scenario]
  return {
    ...validSurfaceReceipt(scenario),
    capture: {
      outputFile: specification.outputFile,
      source: 'Page.captureScreenshot',
      fromSurface: true,
      captureBeyondViewport: false,
      originalPng: true,
      width: specification.width,
      height: specification.height,
      bytes: 25_000,
      sha256: '3'.repeat(64),
      pixelInspection: {
        width: specification.width,
        height: specification.height,
        colorType: 2,
        channelMinimum: 0,
        channelMaximum: 255,
        quantizedColorCount: 128,
        darkPixelRatio: 0.4,
        lightPixelRatio: 0.2,
      },
    },
  }
}

test('three live gallery scenarios pin exact filenames, pixels, and presentation', () => {
  assert.deepEqual(verifier.ScenarioSpecifications, {
    'bambu-build-live': {
      outputFile: 'cheap-lfs-bambu-build-live.png',
      width: 960,
      height: 660,
      zoomFactor: 0.75,
      theme: 'dark',
      languageMode: 'bilingual',
      visibility: 'public',
      pointerCount: 10,
      expectedPath: null,
      publicIdentity: 'codingmachineedge/bambu-build',
      expectedCommit: 'c93403ebbc275c455f0440bfeb75fa84f6599522',
    },
    'cloud-compression': {
      outputFile: 'cheap-lfs-cloud-compression.png',
      width: 960,
      height: 660,
      zoomFactor: 0.75,
      theme: 'dark',
      languageMode: 'bilingual',
      visibility: 'private',
      pointerCount: 1,
      expectedPath: 'payload-private.bin',
      publicIdentity: null,
      expectedCommit: 'e56519d4742c63bb2c9f5f1e917de3fca7379fdd',
    },
    'ui-acceptance': {
      outputFile: 'cheap-lfs-ui-acceptance.png',
      width: 1200,
      height: 752,
      zoomFactor: 0.8,
      theme: 'light',
      languageMode: 'english',
      visibility: 'private',
      pointerCount: 1,
      expectedPath: 'payload-private.bin',
      publicIdentity: null,
      expectedCommit: 'e56519d4742c63bb2c9f5f1e917de3fca7379fdd',
    },
  })
})

test('CLI requires one supported scenario and exact owned output names', () => {
  const base = [
    '--port',
    '9337',
    '--run-root',
    'C:\\Temp\\desktop-material-gallery-cheap-lfs-live-contract1',
    '--repository-path',
    'C:\\Temp\\desktop-material-gallery-cheap-lfs-live-contract1\\fixture',
    '--scenario',
    'cloud-compression',
    '--capture',
    'C:\\Temp\\desktop-material-gallery-cheap-lfs-live-contract1\\captures\\cheap-lfs-cloud-compression.png',
    '--receipt',
    'C:\\Temp\\desktop-material-gallery-cheap-lfs-live-contract1\\receipts\\cheap-lfs-cloud-compression.receipt.json',
  ]
  const parsed = verifier.parseArguments(base)
  assert.equal(parsed.port, 9337)
  assert.equal(parsed.scenario, 'cloud-compression')
  assert.equal(
    parsed.specification,
    verifier.ScenarioSpecifications['cloud-compression']
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--mystery', 'value']),
    /Unsupported argument/
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--port', '9338']),
    /Duplicate argument/
  )
  const invalid = [...base]
  invalid[invalid.indexOf('cloud-compression')] = 'legacy-workflow'
  assert.throws(() => verifier.parseArguments(invalid), /Scenario must be/)
})

test('owned path containment rejects roots and parent traversal', () => {
  const root = path.resolve('C:\\Temp\\owned-root')
  assert.equal(
    verifier.isContainedPath(root, path.join(root, 'fixture', 'large.bin')),
    true
  )
  assert.equal(verifier.isContainedPath(root, root), false)
  assert.equal(
    verifier.isContainedPath(root, path.resolve(root, '..', 'escaped.bin')),
    false
  )
})

test('fresh-clone provenance binds both public and private reviewed origins', () => {
  assert.equal(
    verifier.parseOriginURL(
      '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/codingmachineedge/bambu-build.git\n'
    ),
    'https://github.com/codingmachineedge/bambu-build.git'
  )
  assert.equal(
    verifier.parseOriginURL(
      '[remote "upstream"]\n\turl = https://github.com/codingmachineedge/bambu-build.git\n'
    ),
    null
  )
  for (const contract of [
    'codingmachineedge/bambu-build',
    'DingDingChae/desktop-material-cheap-lfs-private-20260722-153308',
    'validateFreshClonePreparation',
    'preparation.originMatched === true',
    'preparation.freshCloneReflogValidated === true',
    'preparation.worktreeClean === true',
    'preparation.expectedCommitMatched === true',
    'preparation.originTrackingTipMatched === true',
  ]) {
    assert.ok(source.includes(contract), contract)
  }
})

test('filesystem gates use identity and require a one-entry clone reflog', () => {
  for (const contract of [
    'status.dev !== realStatus.dev',
    'status.ino !== realStatus.ino',
    'status.isSymbolicLink()',
    "path.join(gitDirectory, 'logs', 'HEAD')",
    'reflog.length === 1',
    'clone: from',
    'normalizedGitHubOriginIdentity(origin)',
    'PrivateAcceptanceOriginIdentity',
    "'status', '--porcelain=v1', '-z', '--untracked-files=all'",
    'GIT_OPTIONAL_LOCKS',
    'GIT_CONFIG_NOSYSTEM',
    'core.hooksPath=',
    "'@{upstream}^{commit}'",
  ]) {
    assert.ok(
      source.includes(contract),
      `missing owned-state gate: ${contract}`
    )
  }
  assert.doesNotMatch(
    source,
    /normalizedPath\(real\) !== normalizedPath\(candidate\)/
  )
})

test('read-only Git provenance fails closed on dirty or unreviewed state', () => {
  const expected = '1'.repeat(40)
  const clean = {
    status: '',
    branch: 'main',
    upstream: 'origin/main',
    head: expected,
    upstreamTip: expected,
  }
  assert.deepEqual(verifier.validateGitStateProof(clean, expected, 'Fixture'), {
    worktreeClean: true,
    expectedCommitMatched: true,
    originTrackingTipMatched: true,
  })
  for (const [field, value, message] of [
    ['status', '?? payload-private.bin', /no staged, unstaged, or untracked/],
    ['branch', 'review', /reviewed origin\/main checkout/],
    ['upstream', 'fork/main', /reviewed origin\/main checkout/],
    ['head', '2'.repeat(40), /HEAD does not match/],
    ['upstreamTip', '3'.repeat(40), /origin\/main does not match/],
  ]) {
    assert.throws(
      () =>
        verifier.validateGitStateProof(
          { ...clean, [field]: value },
          expected,
          'Fixture'
        ),
      message
    )
  }
})

test('driver is attach-only and uses the real production Cheap LFS surface', () => {
  for (const contract of [
    "document.querySelector('#cheap-lfs-tab')",
    "type: 'mousePressed'",
    "type: 'mouseReleased'",
    '.cheap-lfs-manager-view .cheap-lfs[aria-label="Cheap LFS large files"]',
    'component.state.pointers',
    'component.props.repository === repository',
    'Page.captureScreenshot',
    'fromSurface: true',
    'captureBeyondViewport: false',
    "fs.writeFileSync(options.capturePath, buffer, { flag: 'wx' })",
  ]) {
    assert.ok(
      source.includes(contract),
      `missing live driver contract: ${contract}`
    )
  }
  assert.match(source, /execFileSync\(\s*'git'/)
  assert.doesNotMatch(source, /spawnSync|Start-Process|electron\.exe/i)
  assert.doesNotMatch(
    source,
    /createElement|insertAdjacentHTML|innerHTML\s*=|ReactDOM\.render/
  )
  assert.doesNotMatch(source, /capture_gallery_cdp/)
})

test('driver validates state only and records that no mutation was performed', () => {
  for (const contract of [
    "mode: 'retained-state-validation'",
    'stateValidationPerformed: true',
    'providerMutationPerformed: false',
    'repositoryMutationPerformed: false',
    'clonePerformedByVerifier: false',
    'mutationReceipt: null',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing evidence contract: ${contract}`
    )
  }
  assert.doesNotMatch(
    source,
    /\.materializePointer\(|\.pinFileToRelease\(|\.commitRepository\(|dispatcher\.push\(/i
  )
})

test('current private cloud scene requires builder routing, opt-in, and 99.9 percent', () => {
  for (const contract of [
    'No workflow was added to this private repository',
    'encrypted public builder',
    '呢個私人 repo 冇加過 workflow',
    '加密 public builder',
    "managedWorkflowKind === 'encrypted-public-builder-routed'",
    'component.state.cloudPrivateOptIn === true',
    'component.state.cloudWorkflowReady === false',
    'persistedCloudOptIn === true',
    'firstCompressedSavings === 99.9',
  ]) {
    assert.ok(source.includes(contract), `missing cloud gate: ${contract}`)
  }
  assert.doesNotMatch(
    source,
    /scenario === 'cloud-compression'[\s\S]{0,500}cloudWorkflowReady\s*=\s*true/
  )
})

test('pointer proof validates Release metadata, hashes, local pointer state, and counts', () => {
  for (const contract of [
    "entry?.kind !== 'release'",
    "entry.provider !== 'release'",
    'entry.pointer?.version',
    'validHash(entry.pointer.sha256)',
    "entry.workingTreeState === 'pointer'",
    'releasePointerCount === specification.pointerCount',
    'validIntegrityCount === specification.pointerCount',
    'localPointerCount === specification.pointerCount',
    'pointerSetSha256',
  ]) {
    assert.ok(source.includes(contract), `missing pointer proof: ${contract}`)
  }
})

test('renderer inspection programs compile for all three scenarios', () => {
  for (const scenario of Object.keys(verifier.ScenarioSpecifications)) {
    const specification = verifier.ScenarioSpecifications[scenario]
    const expression = verifier.inspectionExpression(
      { scenario, specification },
      {
        appStoreFound: true,
        selected: true,
        pathMatched: true,
        visibility: specification.visibility,
        publicIdentity: specification.publicIdentity,
      },
      {
        originMatched: true,
        freshCloneReflogValidated: true,
        worktreeClean: true,
        expectedCommitMatched: true,
        originTrackingTipMatched: true,
      }
    )
    assert.doesNotThrow(() => new Function(`return ${expression}`))
  }
})

test('surface validator fails closed on false assertions, mutation drift, and scene drift', () => {
  for (const scenario of Object.keys(verifier.ScenarioSpecifications)) {
    const receipt = validSurfaceReceipt(scenario)
    assert.equal(verifier.validateSurfaceReceipt(receipt, scenario), receipt)
  }

  const failed = validSurfaceReceipt('ui-acceptance')
  failed.assertions.scenarioContract = false
  assert.throws(
    () => verifier.validateSurfaceReceipt(failed, 'ui-acceptance'),
    /scenarioContract/
  )

  const mutated = validSurfaceReceipt('cloud-compression')
  mutated.evidence.providerMutationPerformed = true
  assert.throws(
    () => verifier.validateSurfaceReceipt(mutated, 'cloud-compression'),
    /header diverged/
  )

  const historical = validSurfaceReceipt('cloud-compression')
  historical.state.managedWorkflowKind = 'private-in-repo-workflow-ready'
  assert.throws(
    () => verifier.validateSurfaceReceipt(historical, 'cloud-compression'),
    /retained-state receipt/
  )
})

test('final receipt pins original CDP PNG proof', () => {
  for (const scenario of Object.keys(verifier.ScenarioSpecifications)) {
    const receipt = validFinalReceipt(scenario)
    assert.equal(verifier.validateFinalReceipt(receipt), receipt)
  }
  const scaled = validFinalReceipt('bambu-build-live')
  scaled.capture.width = 959
  assert.throws(
    () => verifier.validateFinalReceipt(scaled),
    /original-pixel capture proof/
  )
})

test('pixel inspector accepts the three existing full-resolution gallery PNGs', () => {
  for (const scenario of Object.keys(verifier.ScenarioSpecifications)) {
    const specification = verifier.ScenarioSpecifications[scenario]
    const bytes = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'docs',
        'assets',
        'screenshots',
        specification.outputFile
      )
    )
    const pixels = verifier.inspectPngBytes(
      bytes,
      specification.width,
      specification.height
    )
    assert.ok(pixels.quantizedColorCount >= 32)
  }
})

test('privacy scan and capture order precede original pixel acquisition', () => {
  for (const contract of [
    'document.createTreeWalker',
    'NodeFilter.SHOW_TEXT',
    'privateOutput.test(privacyCorpus)',
    'credentialOutput.test(privacyCorpus)',
    'noAccountIdentityInCapture',
    'originalPng: true',
    'inspectPngBytes',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing privacy/pixel gate: ${contract}`
    )
  }
  const inspected = source.indexOf('const surface = validateSurfaceReceipt(')
  const captured = source.indexOf(
    'const capture = await captureOriginalPixels('
  )
  assert.ok(inspected >= 0)
  assert.ok(captured > inspected)
})

test('current gallery copy uses private builder routing while dated evidence stays historical', () => {
  const currentFiles = [
    path.join(__dirname, 'gallery_capture_plan.js'),
    path.join(__dirname, '..', '..', 'docs', 'wiki', 'Feature-Gallery.md'),
    path.join(__dirname, '..', '..', 'docs', 'readme-tabs', 'screenshots.md'),
    path.join(
      __dirname,
      '..',
      '..',
      'docs',
      'features',
      'repository-management',
      'release-backed-cheap-lfs.md'
    ),
    path.join(__dirname, '..', '..', 'docs', 'wiki', 'User-Guide.md'),
    path.join(__dirname, '..', '..', 'ROADMAP.md'),
  ].map(file => fs.readFileSync(file, 'utf8'))
  const currentCopy = currentFiles.join('\n')
  assert.match(currentCopy, /encrypted public-builder|encrypted public builder/)
  assert.match(
    currentCopy,
    /no private-repository workflow|installs no workflow/
  )
  assert.doesNotMatch(currentCopy, /managed cloud workflow ready/i)
  assert.doesNotMatch(currentCopy, /same reviewed commit\/push boundary/i)

  const historical = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'docs',
      'verification',
      'cheap-lfs-cloud-compression-2026-07-22.md'
    ),
    'utf8'
  )
  assert.match(historical, /Current-state clarification \(2026-07-28\)/)
  assert.match(historical, /faithfully preserve the 2026-07-22 build/)
  assert.match(historical, /ready managed workflow notice/)
  assert.match(historical, /historical result below is unchanged/)
})
