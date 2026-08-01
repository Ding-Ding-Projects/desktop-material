'use strict'

/* eslint-disable no-sync -- bounded contract-source reads only */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const verifier = require('./verify_gallery_ui_state_cdp')

const source = fs.readFileSync(
  path.join(__dirname, 'verify_gallery_ui_state_cdp.js'),
  'utf8'
)

function cleanupReceipt(repositoriesRemoved = 0) {
  return {
    repositoriesRemoved,
    fixtureRepositoriesAbsent: true,
    localStorageRestored: true,
    transientsClosed: true,
    viewportOverrideCleared: true,
    publicFixtureDriveReleased: true,
    fixtureFilesRetainedForCaller: true,
  }
}

function fixtureReceipt(overrides = {}) {
  return {
    kind: 'none',
    repositories: [],
    groupName: null,
    branch: null,
    ahead: null,
    behind: null,
    publicDrive: null,
    ...overrides,
  }
}

function captureReceipt(scene, clip = null) {
  const specification = verifier.SceneSpecifications[scene]
  return {
    file: `captures/${specification.output}`,
    width: specification.captureWidth,
    height: specification.captureHeight,
    bytes: specification.minimumBytes + 1,
    sha256: 'a'.repeat(64),
    fromSurface: true,
    clip,
  }
}

function pendingReceipt(scene) {
  switch (scene) {
    case 'material-command-palette-appearance':
      return {
        scene,
        fixture: fixtureReceipt(),
        state: {
          query: 'ollama',
          resultCount: 8,
          editorOpen: true,
          resetVisible: true,
          randomToggleVisible: true,
          randomModeChanged: true,
          alignedOptions: true,
          editorScrollTop: 0,
          appearanceHeadingVisible: true,
          iconRowCount: 8,
          groupChipRowCount: 8,
          keywordRowCount: 8,
        },
        capture: captureReceipt(scene),
      }
    case 'material-tab-groups':
      return {
        scene,
        fixture: fixtureReceipt({
          kind: 'git-worktree',
          repositories: ['gallery-tab-persisted'],
          groupName: verifier.GalleryTabGroupName,
          publicDrive: 'Z:',
        }),
        state: {
          groupName: verifier.GalleryTabGroupName,
          groupId: 'group-contract',
          color: 'blue',
          memberCount: 1,
          expanded: true,
          reloadBeforeTimeOrigin: 100,
          reloadAfterTimeOrigin: 200,
          persistedMemberLabels: ['gallery-tab-persisted'],
        },
        capture: captureReceipt(scene),
      }
    case 'repository-groups-expanded':
    case 'repository-groups-collapsed': {
      const expanded = scene.endsWith('expanded')
      return {
        scene,
        fixture: fixtureReceipt({
          kind: 'three-tracking-git-worktrees',
          repositories: [...verifier.RepositoryGroupNames],
          groupName: verifier.GalleryGroupName,
          branch: 'main',
          ahead: 0,
          behind: 0,
          publicDrive: 'Z:',
        }),
        state: {
          groupName: verifier.GalleryGroupName,
          memberCount: 3,
          ariaExpanded: expanded,
          countPillVisible: !expanded,
          visibleMembers: expanded ? [...verifier.RepositoryGroupNames] : [],
          visibleSyncSummaries: expanded
            ? [
                'Nothing to push or pull as of the last check',
                'Nothing to push or pull as of the last check',
                'Nothing to push or pull as of the last check',
              ]
            : [],
          persistedGroupNames: [
            verifier.GalleryGroupName,
            verifier.GalleryGroupName,
            verifier.GalleryGroupName,
          ],
        },
        capture: captureReceipt(scene),
      }
    }
    case 'repository-list-sync-summary': {
      const clip = { x: 10, y: 430, width: 390, height: 100, scale: 1 }
      return {
        scene,
        fixture: fixtureReceipt({
          kind: 'diverged-git-worktree-with-bare-origin',
          repositories: ['gallery-sync-summary'],
          branch: 'main',
          ahead: 1,
          behind: 1,
          publicDrive: 'Z:',
        }),
        state: {
          repository: 'gallery-sync-summary',
          branch: 'main',
          ahead: 1,
          behind: 1,
          summary: verifier.SyncSummaryText,
          wholeWindowPrivacyChecked: true,
          clip,
        },
        capture: captureReceipt(scene, clip),
      }
    }
    case 'tab-overflow-search':
      return {
        scene,
        fixture: fixtureReceipt({
          kind: 'fourteen-git-worktrees',
          repositories: Array.from(
            { length: 14 },
            (_, index) =>
              `gallery-overflow-${String(index + 1).padStart(2, '0')}`
          ),
          branch: 'main',
          publicDrive: 'Z:',
        }),
        state: {
          pattern: verifier.OverflowPattern,
          filterMode: 'Filter mode: Regex (click to change)',
          totalOverflowCount: 10,
          resultCount: 8,
          resultLabels: Array.from(
            { length: 8 },
            (_, index) =>
              `gallery-overflow-${String(index + 1).padStart(2, '0')}`
          ),
          builderLauncherVisible: true,
          overflowPathRoot: 'Z:\\overflow',
        },
        capture: captureReceipt(scene),
      }
    default:
      throw new Error(`No contract fixture for ${scene}`)
  }
}

function validReceipt(scene) {
  return verifier.buildReceipt(
    pendingReceipt(scene),
    cleanupReceipt(scene === 'material-command-palette-appearance' ? 0 : 18)
  )
}

test('catalog locks the six gallery outputs and required viewport geometry', () => {
  assert.deepEqual(verifier.SceneOrder, [
    'material-command-palette-appearance',
    'material-tab-groups',
    'repository-groups-expanded',
    'repository-groups-collapsed',
    'repository-list-sync-summary',
    'tab-overflow-search',
  ])
  const geometry = Object.fromEntries(
    verifier.SceneOrder.map(scene => {
      const item = verifier.SceneSpecifications[scene]
      return [
        scene,
        [item.width, item.height, item.captureWidth, item.captureHeight],
      ]
    })
  )
  assert.deepEqual(geometry, {
    'material-command-palette-appearance': [1000, 687, 1000, 687],
    'material-tab-groups': [1000, 687, 1000, 687],
    'repository-groups-expanded': [1180, 820, 1180, 820],
    'repository-groups-collapsed': [1180, 820, 1180, 820],
    'repository-list-sync-summary': [1180, 820, 390, 100],
    'tab-overflow-search': [1280, 800, 1280, 800],
  })
  for (const scene of verifier.SceneOrder) {
    assert.equal(verifier.SceneSpecifications[scene].output, `${scene}.png`)
  }
})

test('CLI requires caller-owned roots, normalizes aliases, and orders scenes', () => {
  const base = [
    '--port',
    '9337',
    '--run-root',
    'C:\\Temp\\desktop-material-gallery-ui-state-contract',
    '--fixture-root',
    'C:\\Temp\\desktop-material-gallery-ui-state-contract\\fixtures',
    '--capture-root',
    'C:\\Temp\\desktop-material-gallery-ui-state-contract\\captures',
    '--receipt-root',
    'C:\\Temp\\desktop-material-gallery-ui-state-contract\\receipts',
  ]
  const parsed = verifier.parseArguments([
    ...base,
    '--scenes',
    'tab-overflow-regex-search,command-palette-appearance',
  ])
  assert.equal(parsed.port, 9337)
  assert.deepEqual(parsed.scenes, [
    'material-command-palette-appearance',
    'tab-overflow-search',
  ])
  assert.deepEqual(verifier.parseArguments(base).scenes, verifier.SceneOrder)
  assert.throws(
    () =>
      verifier.parseArguments([
        ...base,
        '--scenes',
        'material-tab-groups,restored-tab-group',
      ]),
    /duplicates/
  )
  assert.throws(
    () => verifier.parseArguments([...base, '--mystery', 'value']),
    /Unsupported argument/
  )
  assert.throws(
    () => verifier.parseArguments(base.filter(value => value !== '9337')),
    /Invalid argument|valid loopback/
  )
})

test('fixture Git is hermetic and cannot inherit redirects or hooks', () => {
  for (const contract of [
    '/^GIT_CONFIG(?:_|$)/',
    'GitRedirectEnvironmentNames.includes(normalized)',
    'GIT_CONFIG_GLOBAL: GitNullDevice',
    'GIT_CONFIG_SYSTEM: GitNullDevice',
    "GIT_CONFIG_NOSYSTEM: '1'",
    '`core.hooksPath=${GitNullDevice}`',
    "'commit.gpgSign=false'",
    "GIT_TERMINAL_PROMPT: '0'",
  ]) {
    assert.ok(source.includes(contract), contract)
  }
})

test('driver is attach-only and never starts or terminates a UI process', () => {
  for (const contract of [
    "requestJSON(port, '/json/list')",
    "target.url.includes('/out/index.html')",
    'new CDPClient(webSocketURL)',
    "client.send('Runtime.enable')",
    "client.send('Page.enable')",
    'Page.captureScreenshot',
    'fromSurface: true',
    'captureBeyondViewport: false',
  ]) {
    assert.ok(source.includes(contract), `missing attach contract: ${contract}`)
  }
  assert.doesNotMatch(
    source,
    /chromium\.launch|electron\.exe|Start-Process|taskkill|TerminateProcess|spawnSync|spawn\(/
  )
})

test('fixture writes are owned, real Git, and exposed through a cleaned public drive', () => {
  for (const contract of [
    'RunRootPattern',
    'path.dirname(runRoot)',
    'assertDirectChild(',
    "['init', '--quiet', '--initial-branch=main']",
    "['init', '--bare', '--quiet', '--initial-branch=main']",
    "['clone', '--quiet', origin, 'gallery-sync-summary']",
    "'rev-list'",
    "'--left-right'",
    "'HEAD...origin/main'",
    "execFileSync('subst.exe', [drive, fixtureRoot]",
    "execFileSync('subst.exe', [alias.drive, '/D']",
  ]) {
    assert.ok(
      source.includes(contract),
      `missing fixture contract: ${contract}`
    )
  }
  assert.doesNotMatch(
    source,
    /createElement\(|appendChild\(|insertAdjacentHTML|\.innerHTML\s*=|\.textContent\s*=|style\.setProperty/
  )
})

test('all state is reached through shipped controls and production stores', () => {
  for (const contract of [
    "menuEvent('add-local-repository')",
    "'Add repository'",
    "clickText('Add tab to new group…'",
    "clickText('Create group', '#create-tab-group')",
    // Group creation moved into the repository list's "More" actions menu, so
    // the reviewed control is that menu item rather than a retired button.
    "'.repository-list .repository-more-actions-button'",
    "'Create a repository group'",
    "clickText('Create group', '#manage-repository-group')",
    'runtime.dispatcher.refreshRepository(match)',
    'runtime.dispatcher.removeRepository(',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing production-control contract: ${contract}`
    )
  }
})

test('command palette contract proves aligned random mode and rich ollama rows', () => {
  for (const contract of [
    'openCommandPaletteKeyboard()',
    "'ollama'",
    'length >= 8',
    "'#command-palette .command-palette-appearance-toggle'",
    "'Reset defaults'",
    "'Random per repository'",
    'randomModeChanged',
    'alignedOptions',
    'editor.scrollTop = 0',
    'requestAnimationFrame(() =>',
    'appearanceHeadingVisible',
    'state.editorScrollTop !== 0',
    'state.appearanceHeadingVisible !== true',
    'state.iconRowCount !== 8',
    'state.groupChipRowCount !== 8',
    'state.keywordRowCount !== 8',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing palette contract: ${contract}`
    )
  }
  assert.equal(
    validReceipt('material-command-palette-appearance').state.resultCount,
    8
  )
})

test('tab group is created through its menu and proven across a renderer reload', () => {
  for (const contract of [
    'GalleryTabGroupName',
    'data-color="blue"',
    "clickText('Create group', '#create-tab-group')",
    "reloadRenderer('gallery tab-group persistence')",
    'state.groupId !== before.groupId',
    'state.reloadAfterTimeOrigin > state.reloadBeforeTimeOrigin',
    'persistedMemberLabels',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing tab-group contract: ${contract}`
    )
  }
  const receipt = validReceipt('material-tab-groups')
  assert.equal(receipt.state.expanded, true)
  assert.deepEqual(receipt.state.persistedMemberLabels, [
    'gallery-tab-persisted',
  ])
})

test('repository group scenes use three real members and opposite disclosures', () => {
  for (const scene of [
    'repository-groups-expanded',
    'repository-groups-collapsed',
  ]) {
    assert.equal(validReceipt(scene).state.memberCount, 3)
  }
  assert.equal(
    validReceipt('repository-groups-expanded').state.ariaExpanded,
    true
  )
  assert.equal(
    validReceipt('repository-groups-collapsed').state.ariaExpanded,
    false
  )
  assert.equal(
    validReceipt('repository-groups-collapsed').state.countPillVisible,
    true
  )
  for (const contract of [
    'RepositoryGroupNames',
    'three selected repository-group members',
    'repository.groupName',
    'visibleSyncSummaries',
    'button.repository-group-header[data-group-key=',
  ]) {
    assert.ok(
      source.includes(contract),
      `missing repository-group contract: ${contract}`
    )
  }
})

test('sync summary proves a real one-ahead/one-behind bare-origin topology before exact crop', () => {
  const receipt = validReceipt('repository-list-sync-summary')
  assert.equal(receipt.fixture.ahead, 1)
  assert.equal(receipt.fixture.behind, 1)
  assert.equal(receipt.state.summary, '1 commit to push, 1 commit to pull')
  assert.deepEqual(receipt.capture.clip, {
    x: 10,
    y: 430,
    width: 390,
    height: 100,
    scale: 1,
  })
  const privacy = source.indexOf(
    'await assertWholeWindowPrivacy(context.owned.runRoot, scene)',
    source.indexOf('async function sceneRepositorySyncSummary')
  )
  const capture = source.indexOf(
    'await captureOriginalPixels(context, scene, clip)',
    privacy
  )
  assert.ok(privacy > 0 && capture > privacy)
  for (const contract of [
    "'gallery-sync-summary'",
    "'fetch', '--quiet', 'origin', 'main'",
    'refreshed.ahead !== fixture.ahead',
    'SyncSummaryText',
    'width: 390',
    'height: 100',
  ]) {
    assert.ok(source.includes(contract), `missing sync contract: ${contract}`)
  }
})

test('overflow scene opens enough real tabs and leaves Regex results plus builder launcher', () => {
  const receipt = validReceipt('tab-overflow-search')
  assert.equal(receipt.fixture.repositories.length, 14)
  assert.equal(receipt.state.pattern, '^gallery-overflow-0[1-8]$')
  assert.equal(receipt.state.filterMode, 'Filter mode: Regex (click to change)')
  assert.equal(receipt.state.builderLauncherVisible, true)
  assert.equal(receipt.state.resultCount, 8)
  for (const contract of [
    'OverflowRepositoryNames',
    "'button.repository-tab-overflow'",
    "cycleFilterModeToRegex('.tab-overflow-popover')",
    'OverflowPattern',
    "'.filter-regex-builder-button'",
    "'publicAliasPathsOnly'",
  ]) {
    assert.ok(
      source.includes(contract),
      `missing overflow contract: ${contract}`
    )
  }
})

test('strict per-scene receipts reject extras, false gates, semantic drift, and private data', () => {
  for (const scene of verifier.SceneOrder) {
    const receipt = validReceipt(scene)
    assert.equal(verifier.validateSceneReceipt(scene, receipt), receipt)

    const falseGate = structuredClone(receipt)
    const assertion = verifier.SceneSpecifications[scene].assertionNames[0]
    falseGate.assertions[assertion] = false
    assert.throws(() => verifier.validateSceneReceipt(scene, falseGate))

    const extra = structuredClone(receipt)
    extra.unreviewed = true
    assert.throws(() => verifier.validateSceneReceipt(scene, extra))

    const privateReceipt = structuredClone(receipt)
    privateReceipt.capture.file =
      'C:\\Users\\someone\\AppData\\Local\\Temp\\capture.png'
    assert.throws(() => verifier.validateSceneReceipt(scene, privateReceipt))
  }

  const syncDrift = validReceipt('repository-list-sync-summary')
  syncDrift.state.behind = 2
  assert.throws(
    () =>
      verifier.validateSceneReceipt('repository-list-sync-summary', syncDrift),
    /semantics/
  )

  const scrolledPalette = validReceipt('material-command-palette-appearance')
  scrolledPalette.state.editorScrollTop = 1
  assert.throws(
    () =>
      verifier.validateSceneReceipt(
        'material-command-palette-appearance',
        scrolledPalette
      ),
    /semantics/
  )

  const clippedPaletteHeading = validReceipt(
    'material-command-palette-appearance'
  )
  clippedPaletteHeading.state.appearanceHeadingVisible = false
  assert.throws(
    () =>
      verifier.validateSceneReceipt(
        'material-command-palette-appearance',
        clippedPaletteHeading
      ),
    /semantics/
  )
})

test('privacy and crop helpers fail closed without touching the renderer', () => {
  assert.deepEqual(verifier.parseGitDivergenceCounts('0\t0'), [0, 0])
  assert.deepEqual(verifier.parseGitDivergenceCounts('1  2'), [1, 2])
  assert.throws(() => verifier.parseGitDivergenceCounts('1'), /two integer/)
  assert.deepEqual(
    verifier.privacyViolations('clean public text at Z:\\overflow'),
    []
  )
  assert.deepEqual(
    verifier.privacyViolations(
      'C:\\Users\\person\\AppData\\Local\\Temp\\secret'
    ),
    ['windows-user-path', 'app-data-path', 'temp-path']
  )
  assert.deepEqual(verifier.privacyViolations('Authorization: Bearer secret'), [
    'credential',
  ])
  assert.deepEqual(
    verifier.computeSyncClip(
      { left: 10, top: 450, width: 390, height: 54 },
      1180,
      820
    ),
    { x: 10, y: 427, width: 390, height: 100, scale: 1 }
  )
  assert.deepEqual(
    verifier.computeSyncClip(
      { left: 1000, top: 790, width: 390, height: 54 },
      1180,
      820
    ),
    { x: 790, y: 720, width: 390, height: 100, scale: 1 }
  )
  assert.throws(
    () =>
      verifier.computeSyncClip(
        { left: 0, top: 0, width: 0, height: 54 },
        1180,
        820
      ),
    /invalid/
  )
})

test('PNG parser accepts IHDR geometry and rejects non-PNG data', () => {
  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png, 0)
  Buffer.from('IHDR', 'ascii').copy(png, 12)
  png.writeUInt32BE(390, 16)
  png.writeUInt32BE(100, 20)
  assert.deepEqual(verifier.pngDimensions(png), { width: 390, height: 100 })
  assert.throws(() => verifier.pngDimensions(Buffer.alloc(24)), /valid PNG/)
})
