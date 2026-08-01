#!/usr/bin/env node
'use strict'

/* eslint-disable no-sync -- all writes are bounded to a validated Temp child */

/**
 * Attach-only verifier for the six gallery frames owned by the
 * `windows-ui-state-lowlevel` batch.
 *
 * The caller owns the production Electron process, isolated user-data
 * directory, loopback CDP port, off-screen Win32 desktop, and the three
 * already-created evidence directories. This helper never launches, focuses,
 * resizes, or terminates the app. It creates only disposable Git fixtures
 * below --fixture-root, drives shipped controls in the attached renderer,
 * records original Chromium pixels below --capture-root, writes one strict
 * JSON receipt per scene below --receipt-root, and restores the temporary app
 * state before releasing its short-lived public fixture drive.
 *
 * Example:
 *   node .codex/verification/verify_gallery_ui_state_cdp.js \
 *     --port 9337 \
 *     --run-root %TEMP%\desktop-material-gallery-ui-state-20260728 \
 *     --fixture-root %TEMP%\desktop-material-gallery-ui-state-20260728\fixtures \
 *     --capture-root %TEMP%\desktop-material-gallery-ui-state-20260728\captures \
 *     --receipt-root %TEMP%\desktop-material-gallery-ui-state-20260728\receipts \
 *     --scenes material-command-palette-appearance,material-tab-groups
 */

const crypto = require('crypto')
const { execFileSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const WebSocket = require('ws')

const ReceiptSchema = 'desktop-material/gallery-ui-state-cdp-scene/v1'
const RunRootPattern =
  /^desktop-material-gallery-ui-state-[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/
const PublicFixtureDriveCandidates = Object.freeze([
  'Z:',
  'Y:',
  'X:',
  'W:',
  'V:',
  'U:',
  'T:',
  'S:',
  'R:',
])
const GalleryGroupName = 'Gallery evidence'
const GalleryTabGroupName = 'Gallery persisted'
const OverflowPattern = '^gallery-overflow-0[1-8]$'
const SyncSummaryText = '1 commit to push, 1 commit to pull'
const CommonAssertionNames = Object.freeze([
  'productionRenderer',
  'requestedViewport',
  'lightEnglishPlainVoice',
  'realProductionControls',
  'surfaceVisibleAndContained',
  'noClippingOrDocumentOverflow',
  'bundledFontsLoaded',
  'noPrivatePathOrCredentialOutput',
  'originalChromiumPixels',
])

const SceneSpecifications = Object.freeze({
  'material-command-palette-appearance': Object.freeze({
    scene: 'material-command-palette-appearance',
    galleryScene: 'command-palette-appearance',
    output: 'material-command-palette-appearance.png',
    width: 1000,
    height: 687,
    captureWidth: 1000,
    captureHeight: 687,
    minimumBytes: 20_000,
    stateKeys: Object.freeze([
      'query',
      'resultCount',
      'editorOpen',
      'resetVisible',
      'randomToggleVisible',
      'randomModeChanged',
      'alignedOptions',
      'editorScrollTop',
      'appearanceHeadingVisible',
      'iconRowCount',
      'groupChipRowCount',
      'keywordRowCount',
    ]),
    assertionNames: Object.freeze([
      ...CommonAssertionNames,
      'eightOllamaResults',
      'appearanceEditorOpen',
      'resetControlVisible',
      'randomModeRoundTrip',
      'alignedAppearanceControls',
      'appearanceEditorAtTop',
      'appearanceHeadingVisible',
      'richResultRows',
    ]),
  }),
  'material-tab-groups': Object.freeze({
    scene: 'material-tab-groups',
    galleryScene: 'restored-tab-group',
    output: 'material-tab-groups.png',
    width: 1000,
    height: 687,
    captureWidth: 1000,
    captureHeight: 687,
    minimumBytes: 20_000,
    stateKeys: Object.freeze([
      'groupName',
      'groupId',
      'color',
      'memberCount',
      'expanded',
      'reloadBeforeTimeOrigin',
      'reloadAfterTimeOrigin',
      'persistedMemberLabels',
    ]),
    assertionNames: Object.freeze([
      ...CommonAssertionNames,
      'createdThroughTabMenu',
      'namedColorApplied',
      'rendererReloaded',
      'groupPersisted',
      'expandedMemberVisible',
    ]),
  }),
  'repository-groups-expanded': Object.freeze({
    scene: 'repository-groups-expanded',
    galleryScene: 'repository-group-expanded',
    output: 'repository-groups-expanded.png',
    width: 1180,
    height: 820,
    captureWidth: 1180,
    captureHeight: 820,
    minimumBytes: 20_000,
    stateKeys: Object.freeze([
      'groupName',
      'memberCount',
      'ariaExpanded',
      'countPillVisible',
      'visibleMembers',
      'visibleSyncSummaries',
      'persistedGroupNames',
    ]),
    assertionNames: Object.freeze([
      ...CommonAssertionNames,
      'createdThroughRepositoryGroupDialog',
      'threeRealMembersPersisted',
      'expandedDisclosure',
      'allMembersVisible',
      'syncSummariesVisible',
    ]),
  }),
  'repository-groups-collapsed': Object.freeze({
    scene: 'repository-groups-collapsed',
    galleryScene: 'repository-group-collapsed',
    output: 'repository-groups-collapsed.png',
    width: 1180,
    height: 820,
    captureWidth: 1180,
    captureHeight: 820,
    minimumBytes: 20_000,
    stateKeys: Object.freeze([
      'groupName',
      'memberCount',
      'ariaExpanded',
      'countPillVisible',
      'visibleMembers',
      'visibleSyncSummaries',
      'persistedGroupNames',
    ]),
    assertionNames: Object.freeze([
      ...CommonAssertionNames,
      'createdThroughRepositoryGroupDialog',
      'threeRealMembersPersisted',
      'collapsedDisclosure',
      'memberCountPillVisible',
      'memberRowsHidden',
    ]),
  }),
  'repository-list-sync-summary': Object.freeze({
    scene: 'repository-list-sync-summary',
    galleryScene: 'repository-row-sync-summary',
    output: 'repository-list-sync-summary.png',
    width: 1180,
    height: 820,
    captureWidth: 390,
    captureHeight: 100,
    minimumBytes: 5_000,
    stateKeys: Object.freeze([
      'repository',
      'branch',
      'ahead',
      'behind',
      'summary',
      'wholeWindowPrivacyChecked',
      'clip',
    ]),
    assertionNames: Object.freeze([
      ...CommonAssertionNames,
      'bareOriginFixture',
      'knownAheadBehind',
      'productionStateRefresh',
      'exactSummaryText',
      'wholeWindowPrivacyBeforeCrop',
      'exact390x100Crop',
    ]),
  }),
  'tab-overflow-search': Object.freeze({
    scene: 'tab-overflow-search',
    galleryScene: 'tab-overflow-regex-search',
    output: 'tab-overflow-search.png',
    width: 1280,
    height: 800,
    captureWidth: 1280,
    captureHeight: 800,
    minimumBytes: 20_000,
    stateKeys: Object.freeze([
      'pattern',
      'filterMode',
      'totalOverflowCount',
      'resultCount',
      'resultLabels',
      'builderLauncherVisible',
      'overflowPathRoot',
    ]),
    assertionNames: Object.freeze([
      ...CommonAssertionNames,
      'enoughRealTabs',
      'overflowButtonVisible',
      'regexModeActive',
      'regexResultsVisible',
      'regexBuilderLauncherVisible',
      'publicAliasPathsOnly',
    ]),
  }),
})

const SceneOrder = Object.freeze([
  'material-command-palette-appearance',
  'material-tab-groups',
  'repository-groups-expanded',
  'repository-groups-collapsed',
  'repository-list-sync-summary',
  'tab-overflow-search',
])

const SceneAliases = Object.freeze(
  Object.fromEntries(
    SceneOrder.flatMap(scene => {
      const specification = SceneSpecifications[scene]
      return [
        [scene, scene],
        [specification.galleryScene, scene],
      ]
    })
  )
)

const FixtureKeys = Object.freeze([
  'kind',
  'repositories',
  'groupName',
  'branch',
  'ahead',
  'behind',
  'publicDrive',
])
const AppearanceKeys = Object.freeze([
  'theme',
  'languageMode',
  'funnyLevelEnglish',
  'funnyLevelCantonese',
  'reducedMotion',
  'deviceScaleFactor',
])
const CaptureKeys = Object.freeze([
  'file',
  'width',
  'height',
  'bytes',
  'sha256',
  'fromSurface',
  'clip',
])
const CleanupKeys = Object.freeze([
  'repositoriesRemoved',
  'fixtureRepositoriesAbsent',
  'localStorageRestored',
  'transientsClosed',
  'viewportOverrideCleared',
  'publicFixtureDriveReleased',
  'fixtureFilesRetainedForCaller',
])
const ReceiptKeys = Object.freeze([
  'schema',
  'scene',
  'galleryOutput',
  'viewport',
  'appearance',
  'fixture',
  'state',
  'assertions',
  'capture',
  'cleanup',
])
const Appearance = Object.freeze({
  theme: 'light',
  languageMode: 'english',
  funnyLevelEnglish: 1,
  funnyLevelCantonese: 1,
  reducedMotion: true,
  deviceScaleFactor: 1,
})
const OverflowRepositoryNames = Object.freeze(
  Array.from({ length: 14 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0')
    return `gallery-overflow-${ordinal}`
  })
)
const RepositoryGroupNames = Object.freeze([
  'gallery-group-alpha',
  'gallery-group-beta',
  'gallery-group-gamma',
])
const PresentationStorage = Object.freeze({
  theme: 'light',
  'language-mode-v1': 'english',
  'has-shown-welcome-flow': '1',
  'zoom-auto-fit-enabled': '0',
  'filter-mode/command-palette': 'fuzzy',
  'filter-mode/tab-overflow': 'fuzzy',
  'filter-mode/repositories': 'fuzzy',
  'filter-mode/repository-group-members': 'fuzzy',
  'repository-list-collapsed-groups': '[]',
  'audio-system-settings-v1': JSON.stringify({
    funnyLevelEnglish: 1,
    funnyLevelCantonese: 1,
  }),
})

function fail(message) {
  throw new Error(message)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameKeys(value, expectedKeys) {
  return (
    isRecord(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expectedKeys].sort())
  )
}

function normalizedPath(value) {
  return path.resolve(value).toLowerCase()
}

function isContainedPath(root, candidate, allowRoot = false) {
  const relative = path.relative(root, candidate)
  return (
    (allowRoot || relative.length > 0) &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function parseArguments(argv) {
  const allowed = new Set([
    'port',
    'run-root',
    'fixture-root',
    'capture-root',
    'receipt-root',
    'scenes',
  ])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    const key = name.slice(2)
    if (!allowed.has(key)) {
      fail(`Unsupported argument --${key}.`)
    }
    if (values.has(key)) {
      fail(`Duplicate argument --${key}.`)
    }
    values.set(key, value)
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    fail('A valid loopback CDP --port is required.')
  }
  const requiredPath = name => {
    const value = values.get(name)
    if (value === undefined || value.trim().length === 0) {
      fail(`--${name} is required.`)
    }
    return path.resolve(value)
  }

  const requested =
    values.get('scenes') === undefined
      ? [...SceneOrder]
      : values
          .get('scenes')
          .split(',')
          .map(value => value.trim())
          .filter(value => value.length > 0)
          .map(value => {
            const canonical = SceneAliases[value]
            if (canonical === undefined) {
              fail(
                `Unsupported gallery UI-state scene ${JSON.stringify(value)}.`
              )
            }
            return canonical
          })
  if (requested.length === 0) {
    fail('--scenes must name at least one scene.')
  }
  if (new Set(requested).size !== requested.length) {
    fail('--scenes may not contain duplicates or aliases of the same scene.')
  }
  const requestedSet = new Set(requested)

  return {
    port,
    runRoot: requiredPath('run-root'),
    fixtureRoot: requiredPath('fixture-root'),
    captureRoot: requiredPath('capture-root'),
    receiptRoot: requiredPath('receipt-root'),
    scenes: SceneOrder.filter(scene => requestedSet.has(scene)),
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

function assertDirectChild(root, candidate, label) {
  const real = assertRealDirectory(candidate, label)
  if (
    normalizedPath(path.dirname(real)) !== normalizedPath(root) ||
    path.basename(real).length === 0 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(path.basename(real))
  ) {
    fail(`${label} must be one named direct child of the owned run root.`)
  }
  return real
}

function validateOwnedPaths(options) {
  const tempRoot = assertRealDirectory(os.tmpdir(), 'Operating-system Temp')
  const runRoot = assertRealDirectory(options.runRoot, 'Run root')
  if (
    normalizedPath(path.dirname(runRoot)) !== normalizedPath(tempRoot) ||
    !RunRootPattern.test(path.basename(runRoot))
  ) {
    fail(
      'Run root must be a direct Temp child named desktop-material-gallery-ui-state-*.'
    )
  }

  const fixtureRoot = assertDirectChild(
    runRoot,
    options.fixtureRoot,
    'Fixture root'
  )
  const captureRoot = assertDirectChild(
    runRoot,
    options.captureRoot,
    'Capture root'
  )
  const receiptRoot = assertDirectChild(
    runRoot,
    options.receiptRoot,
    'Receipt root'
  )
  if (
    new Set(
      [fixtureRoot, captureRoot, receiptRoot].map(candidate =>
        normalizedPath(candidate)
      )
    ).size !== 3
  ) {
    fail('Fixture, capture, and receipt roots must be distinct.')
  }

  for (const scene of options.scenes) {
    const specification = SceneSpecifications[scene]
    const capturePath = path.join(captureRoot, specification.output)
    const receiptPath = path.join(receiptRoot, `${scene}.json`)
    for (const [candidate, label] of [
      [capturePath, `${scene} capture`],
      [receiptPath, `${scene} receipt`],
    ]) {
      if (!isContainedPath(runRoot, candidate) || fs.existsSync(candidate)) {
        fail(`${label} must be one fresh file inside the owned run root.`)
      }
    }
  }

  return { runRoot, fixtureRoot, captureRoot, receiptRoot }
}

function ensureFreshDirectory(parent, name) {
  const candidate = path.join(parent, name)
  if (
    path.relative(parent, candidate) !== name ||
    path.isAbsolute(name) ||
    fs.existsSync(candidate)
  ) {
    fail(`Disposable fixture directory ${name} must be a fresh direct child.`)
  }
  fs.mkdirSync(candidate, { recursive: false })
  const real = assertRealDirectory(candidate, `Fixture directory ${name}`)
  if (
    normalizedPath(path.dirname(real)) !== normalizedPath(parent) ||
    normalizedPath(real) !== normalizedPath(candidate)
  ) {
    fail(`Disposable fixture directory ${name} escaped its owned parent.`)
  }
  return real
}

function writeFreshFile(file, content) {
  fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' })
}

const GitNullDevice = 'NUL'
const GitRedirectEnvironmentNames = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_EXEC_PATH',
  'GIT_GLOB_PATHSPECS',
  'GIT_GRAFT_FILE',
  'GIT_ICASE_PATHSPECS',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_LITERAL_PATHSPECS',
  'GIT_NAMESPACE',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
  'GIT_REDIRECT_STDERR',
  'GIT_REDIRECT_STDIN',
  'GIT_REDIRECT_STDOUT',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_SUPER_PREFIX',
  'GIT_TEMPLATE_DIR',
  'GIT_WORK_TREE',
])

function gitEnvironment(extraEnvironment = {}) {
  const environment = { ...process.env, ...extraEnvironment }
  for (const key of Object.keys(environment)) {
    const normalized = key.toUpperCase()
    if (
      /^GIT_CONFIG(?:_|$)/.test(normalized) ||
      /^GIT_TRACE(?:2)?(?:_|$)/.test(normalized) ||
      GitRedirectEnvironmentNames.includes(normalized)
    ) {
      delete environment[key]
    }
  }
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: GitNullDevice,
    GIT_CONFIG_SYSTEM: GitNullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  }
}

function runGit(cwd, arguments_, extraEnvironment = {}) {
  return execFileSync(
    'git',
    [
      '-c',
      'commit.gpgSign=false',
      '-c',
      'tag.gpgSign=false',
      '-c',
      'push.gpgSign=false',
      '-c',
      `core.hooksPath=${GitNullDevice}`,
      ...arguments_,
    ],
    {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      env: gitEnvironment(extraEnvironment),
    }
  ).trim()
}

function parseGitDivergenceCounts(value, label = 'Git divergence') {
  const match = /^(\d+)\s+(\d+)$/.exec(value.trim())
  if (match === null) {
    fail(`${label} did not return two integer counts.`)
  }
  return [Number(match[1]), Number(match[2])]
}

function initializeWorktree(directory, name, timestamp) {
  runGit(directory, ['init', '--quiet', '--initial-branch=main'])
  writeFreshFile(
    path.join(directory, 'README.md'),
    `# ${name}\n\nDisposable Desktop Material gallery evidence.\n`
  )
  runGit(directory, ['add', '--', 'README.md'])
  runGit(
    directory,
    [
      '-c',
      'user.name=Desktop Material Evidence',
      '-c',
      'user.email=evidence@desktop-material.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '--message',
      `Seed ${name}`,
    ],
    {
      GIT_AUTHOR_DATE: timestamp,
      GIT_COMMITTER_DATE: timestamp,
    }
  )
}

function verifyCleanRepository(directory) {
  const inside = runGit(directory, ['rev-parse', '--is-inside-work-tree'])
  const head = runGit(directory, ['rev-parse', '--verify', 'HEAD'])
  const status = runGit(directory, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ])
  if (inside !== 'true' || !/^[a-f0-9]{40,64}$/i.test(head) || status !== '') {
    fail(`Git fixture ${path.basename(directory)} is not a clean repository.`)
  }
}

function createStandaloneRepository(parent, name, index) {
  const directory = ensureFreshDirectory(parent, name)
  initializeWorktree(
    directory,
    name,
    `2026-07-28T14:${String(index).padStart(2, '0')}:00Z`
  )
  verifyCleanRepository(directory)
  return directory
}

function createTrackingRepository(parent, name, index) {
  const bare = ensureFreshDirectory(parent, `${name}-origin.git`)
  runGit(bare, ['init', '--bare', '--quiet', '--initial-branch=main'])
  const worktree = ensureFreshDirectory(parent, name)
  initializeWorktree(
    worktree,
    name,
    `2026-07-28T15:${String(index).padStart(2, '0')}:00Z`
  )
  runGit(worktree, ['remote', 'add', 'origin', bare])
  runGit(worktree, ['push', '--quiet', '--set-upstream', 'origin', 'main'])
  const counts = parseGitDivergenceCounts(
    runGit(worktree, [
      'rev-list',
      '--left-right',
      '--count',
      'HEAD...origin/main',
    ]),
    `Tracking fixture ${name}`
  )
  if (counts[0] !== 0 || counts[1] !== 0) {
    fail(`Tracking fixture ${name} was not in sync after its seed push.`)
  }
  verifyCleanRepository(worktree)
  return worktree
}

function createSyncSummaryFixture(parent) {
  const root = ensureFreshDirectory(parent, 'sync-summary')
  const origin = ensureFreshDirectory(root, 'origin.git')
  runGit(origin, ['init', '--bare', '--quiet', '--initial-branch=main'])

  const seed = ensureFreshDirectory(root, 'seed')
  initializeWorktree(seed, 'gallery-sync-seed', '2026-07-28T16:00:00Z')
  runGit(seed, ['remote', 'add', 'origin', origin])
  runGit(seed, ['push', '--quiet', '--set-upstream', 'origin', 'main'])

  const repository = path.join(root, 'gallery-sync-summary')
  if (fs.existsSync(repository)) {
    fail('Sync-summary checkout must be fresh.')
  }
  runGit(root, ['clone', '--quiet', origin, 'gallery-sync-summary'])
  const realRepository = assertRealDirectory(
    repository,
    'Sync-summary checkout'
  )
  runGit(realRepository, ['config', 'user.name', 'Desktop Material Evidence'])
  runGit(realRepository, [
    'config',
    'user.email',
    'evidence@desktop-material.invalid',
  ])

  writeFreshFile(
    path.join(realRepository, 'local-ahead.txt'),
    'One local commit waiting to be pushed.\n'
  )
  runGit(realRepository, ['add', '--', 'local-ahead.txt'])
  runGit(
    realRepository,
    ['commit', '--quiet', '--no-gpg-sign', '--message', 'Local ahead fixture'],
    {
      GIT_AUTHOR_DATE: '2026-07-28T16:01:00Z',
      GIT_COMMITTER_DATE: '2026-07-28T16:01:00Z',
    }
  )

  writeFreshFile(
    path.join(seed, 'remote-behind.txt'),
    'One remote commit waiting to be pulled.\n'
  )
  runGit(seed, ['add', '--', 'remote-behind.txt'])
  runGit(
    seed,
    [
      '-c',
      'user.name=Desktop Material Evidence',
      '-c',
      'user.email=evidence@desktop-material.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '--message',
      'Remote behind fixture',
    ],
    {
      GIT_AUTHOR_DATE: '2026-07-28T16:02:00Z',
      GIT_COMMITTER_DATE: '2026-07-28T16:02:00Z',
    }
  )
  runGit(seed, ['push', '--quiet', 'origin', 'main'])
  runGit(realRepository, ['fetch', '--quiet', 'origin', 'main'])

  const counts = parseGitDivergenceCounts(
    runGit(realRepository, [
      'rev-list',
      '--left-right',
      '--count',
      'HEAD...origin/main',
    ]),
    'Sync-summary fixture'
  )
  if (counts[0] !== 1 || counts[1] !== 1) {
    fail(`Sync-summary fixture topology was ${JSON.stringify(counts)}.`)
  }
  verifyCleanRepository(realRepository)
  return Object.freeze({
    root,
    repository: realRepository,
    branch: 'main',
    ahead: 1,
    behind: 1,
  })
}

function createPublicFixtureDrive(fixtureRoot) {
  if (process.platform !== 'win32') {
    fail('Gallery UI-state verification is Windows-only.')
  }
  for (const drive of PublicFixtureDriveCandidates) {
    const root = `${drive}\\`
    if (fs.existsSync(root)) {
      continue
    }
    try {
      execFileSync('subst.exe', [drive, fixtureRoot], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      continue
    }
    if (!fs.existsSync(root)) {
      try {
        execFileSync('subst.exe', [drive, '/D'], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch {}
      continue
    }
    return Object.freeze({ drive, root })
  }
  fail(
    'No free drive letter was available for the disposable public fixture alias.'
  )
}

function releasePublicFixtureDrive(alias) {
  if (alias === null) {
    return true
  }
  execFileSync('subst.exe', [alias.drive, '/D'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return !fs.existsSync(alias.root)
}

function publicFixturePath(owned, alias, actualPath) {
  const relative = path.relative(owned.fixtureRoot, actualPath)
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail('Fixture path escaped the owned fixture root.')
  }
  return path.win32.join(alias.root, relative)
}

function requestJSON(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        timeout: 5_000,
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`CDP discovery returned ${response.statusCode}.`))
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('timeout', () =>
      request.destroy(new Error('CDP discovery timed out.'))
    )
    request.on('error', reject)
  })
}

async function rendererWebSocketURL(port) {
  const deadline = Date.now() + 20_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const targets = await requestJSON(port, '/json/list')
      const renderer = targets.find(
        target =>
          target.type === 'page' &&
          typeof target.url === 'string' &&
          target.url.includes('/out/index.html') &&
          typeof target.webSocketDebuggerUrl === 'string'
      )
      if (renderer !== undefined) {
        return renderer.webSocketDebuggerUrl
      }
    } catch (error) {
      lastError = error
    }
    await sleep(200)
  }
  throw (
    lastError ??
    new Error('Desktop Material production renderer was not found.')
  )
}

class CDPClient {
  constructor(url) {
    this.socket = new WebSocket(url, {
      perMessageDeflate: false,
      maxPayload: 64 * 1024 * 1024,
    })
    this.nextId = 1
    this.pending = new Map()
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
    this.socket.on('message', data => {
      const message = JSON.parse(String(data))
      if (message.id === undefined) {
        return
      }
      const pending = this.pending.get(message.id)
      if (pending === undefined) {
        return
      }
      this.pending.delete(message.id)
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message ?? 'CDP failure'))
      } else {
        pending.resolve(message.result)
      }
    })
    this.socket.on('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP connection closed.'))
      }
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }), error => {
        if (error !== undefined && error !== null) {
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  close() {
    this.socket.close()
  }
}

let client = null
const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds))
const VisibleTextInstaller =
  'globalThis.vt=(element)=>{if(!element)return "";' +
  'const clone=element.cloneNode(true);' +
  'clone.querySelectorAll(\'[aria-hidden="true"]\').forEach(node=>node.remove());' +
  'return (clone.textContent||"").trim();};\n'

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', {
    expression: VisibleTextInstaller + expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails !== undefined) {
    fail(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Renderer evaluation failed.'
    )
  }
  return result.result?.value
}

async function waitFor(expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) {
        return
      }
    } catch {}
    await sleep(250)
  }
  fail(`Timed out waiting for ${label}.`)
}

function runtimeFinderSource() {
  return `() => {
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
        fiber && depth < 200;
        depth += 1, fiber = fiber.return
      ) {
        const props = fiber.stateNode?.props
        const dispatcher = props?.dispatcher
        const appStore = props?.appStore ?? dispatcher?.appStore
        if (
          dispatcher &&
          typeof dispatcher.refreshRepository === 'function' &&
          typeof dispatcher.removeRepository === 'function' &&
          appStore &&
          typeof appStore.getState === 'function'
        ) {
          return { dispatcher, appStore }
        }
      }
    }
    return null
  }`
}

async function waitForApp() {
  await waitFor(
    `document.querySelector('#desktop-app-container') !== null &&
      typeof require === 'function' &&
      location.href.includes('/out/index.html')`,
    'Desktop Material production app container'
  )
  await waitFor(
    `(${runtimeFinderSource()})() !== null`,
    'Desktop Material production dispatcher'
  )
}

async function snapshotLocalStorage() {
  return await evaluate(`(() => {
    const snapshot = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key !== null) snapshot[key] = localStorage.getItem(key)
    }
    return snapshot
  })()`)
}

async function reloadRenderer(label) {
  const before = await evaluate('performance.timeOrigin')
  await client.send('Page.reload', { ignoreCache: true })
  await sleep(2_000)
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await waitFor(
    `performance.timeOrigin > ${JSON.stringify(before)}`,
    `${label} renderer reload`,
    30_000
  )
  await waitForApp()
  return {
    before,
    after: await evaluate('performance.timeOrigin'),
  }
}

async function preparePresentation() {
  const changed = await evaluate(`(() => {
    const expected = ${JSON.stringify(PresentationStorage)}
    let changed = false
    if (localStorage.getItem('autoSwitchTheme') !== null) {
      localStorage.removeItem('autoSwitchTheme')
      changed = true
    }
    for (const [key, value] of Object.entries(expected)) {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value)
        changed = true
      }
    }
    return changed
  })()`)
  if (changed) {
    await reloadRenderer('gallery presentation')
  }
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await waitFor(
    `(() => {
      let audio
      try {
        audio = JSON.parse(
          localStorage.getItem('audio-system-settings-v1') ?? '{}'
        )
      } catch {
        return false
      }
      return document.body.classList.contains('theme-light') &&
        localStorage.getItem('theme') === 'light' &&
        document.body.getAttribute('data-dm-language-mode') === 'english' &&
        document.documentElement.getAttribute('data-language-mode') ===
          'english' &&
        document.documentElement.lang === 'en' &&
        audio.funnyLevelEnglish === 1 &&
        audio.funnyLevelCantonese === 1 &&
        matchMedia('(prefers-reduced-motion: reduce)').matches
    })()`,
    'light English plain-voice gallery presentation'
  )
}

async function setViewport(width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await sleep(350)
  const observed = await evaluate(`({
    innerWidth,
    innerHeight,
    devicePixelRatio,
  })`)
  process.stdout.write(
    `VIEWPORT ${JSON.stringify({
      requested: { width, height, devicePixelRatio: 1 },
      observed,
    })}\n`
  )
  await waitFor(
    `innerWidth === ${width} && innerHeight === ${height} &&
      Math.abs(devicePixelRatio - 1) < 0.000001`,
    `${width}x${height} viewport`
  )
  await sleep(350)
}

async function dispatchKey(key, code, windowsVirtualKeyCode, modifiers = 0) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await client.send('Input.dispatchKeyEvent', {
      type,
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
    })
  }
  await sleep(180)
}

async function pressEscape(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await dispatchKey('Escape', 'Escape', 27)
  }
}

async function openCommandPaletteKeyboard() {
  await client.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    modifiers: 2,
  })
  await client.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'f',
    code: 'KeyF',
    windowsVirtualKeyCode: 70,
    modifiers: 2,
  })
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'f',
    code: 'KeyF',
    windowsVirtualKeyCode: 70,
    modifiers: 2,
  })
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    modifiers: 0,
  })
  await sleep(250)
  const opened = await evaluate(
    `document.querySelector('#command-palette') !== null`
  )
  if (!opened) {
    // CDP renderer key events do not always traverse Electron's native menu
    // accelerator on a hidden Win32 desktop. Exercise the same shipped
    // renderer IPC listener that the native Ctrl+F menu item targets.
    await evaluate(
      `require('electron').ipcRenderer.emit('menu-event', {}, 'find-text'), true`
    )
    await sleep(250)
    const openedFromMenu = await evaluate(
      `document.querySelector('#command-palette') !== null`
    )
    if (!openedFromMenu) {
      const dispatched = await evaluate(`(() => {
        const findRuntime = ${runtimeFinderSource()}
        const runtime = findRuntime()
        if (runtime === null) return false
        runtime.dispatcher.showPopup({ type: 'CommandPalette' })
        return true
      })()`)
      if (!dispatched) {
        fail('Unable to dispatch the command palette through production state.')
      }
      process.stdout.write('COMMAND_PALETTE_OPEN route=dispatcher-fallback\n')
    } else {
      process.stdout.write('COMMAND_PALETTE_OPEN route=menu-event-fallback\n')
    }
  } else {
    process.stdout.write('COMMAND_PALETTE_OPEN route=keyboard\n')
  }
}

async function pointForExpression(elementExpression, label) {
  const point = await evaluate(`(() => {
    const element = (${elementExpression})
    if (!(element instanceof HTMLElement)) return null
    const style = getComputedStyle(element)
    const bounds = element.getBoundingClientRect()
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity || 1) === 0 ||
      bounds.width <= 0 ||
      bounds.height <= 0
    ) {
      return null
    }
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const settled = element.getBoundingClientRect()
    return {
      x: settled.left + settled.width / 2,
      y: settled.top + settled.height / 2,
    }
  })()`)
  if (
    point === null ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    fail(`Unable to resolve visible control ${label}.`)
  }
  return point
}

async function clickPoint(point, button = 'left') {
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button,
    buttons: button === 'right' ? 2 : 1,
    clickCount: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button,
    buttons: 0,
    clickCount: 1,
  })
  await sleep(250)
}

async function clickSelector(selector, label = selector) {
  const point = await pointForExpression(
    `document.querySelector(${JSON.stringify(selector)})`,
    label
  )
  await clickPoint(point)
}

async function contextMenuSelector(selector, label = selector) {
  const point = await pointForExpression(
    `document.querySelector(${JSON.stringify(selector)})`,
    label
  )
  await clickPoint(point, 'right')
}

async function clickText(label, within = null) {
  const scopeExpression =
    within === null
      ? 'document'
      : `document.querySelector(${JSON.stringify(within)})`
  const point = await pointForExpression(
    `(() => {
      const scope = ${scopeExpression}
      if (!scope) return null
      return [...scope.querySelectorAll('button, [role="button"], a')]
        .find(element =>
          vt(element) === ${JSON.stringify(label)} &&
          element.getAttribute('aria-disabled') !== 'true' &&
          !element.disabled
        ) ?? null
    })()`,
    JSON.stringify(label)
  )
  await clickPoint(point)
}

async function setInput(selector, value) {
  const updated = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      return false
    }
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (typeof setter !== 'function') return false
    element.focus()
    setter.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return element.value === ${JSON.stringify(value)}
  })()`)
  if (!updated) {
    fail(`Unable to set shipped input ${selector}.`)
  }
  await sleep(250)
}

async function menuEvent(name) {
  const delivered = await evaluate(`(() => {
    const electron = require('electron')
    if (typeof electron?.ipcRenderer?.emit !== 'function') return false
    electron.ipcRenderer.emit(
      'menu-event',
      {},
      ${JSON.stringify(name)}
    )
    return true
  })()`)
  if (!delivered) {
    fail(`Unable to deliver production menu event ${name}.`)
  }
  await sleep(350)
}

async function waitForBundledFonts() {
  const receipt = await evaluate(`(async () => {
    if (
      !document.fonts ||
      typeof document.fonts.ready?.then !== 'function'
    ) {
      return { status: null, checks: [] }
    }
    const fonts = [
      ['normal 400 16px "Roboto"', 'Desktop Material'],
      ['normal 400 16px "Roboto Mono"', 'git status --short'],
      ['normal 400 24px "Material Symbols Rounded"', 'settings'],
    ]
    for (const [descriptor, sample] of fonts) {
      await document.fonts.load(descriptor, sample)
    }
    await document.fonts.ready
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
    return {
      status: document.fonts.status,
      checks: fonts.map(([descriptor, sample]) =>
        document.fonts.check(descriptor, sample)
      ),
    }
  })()`)
  if (
    receipt?.status !== 'loaded' ||
    !Array.isArray(receipt.checks) ||
    receipt.checks.length !== 3 ||
    receipt.checks.some(value => value !== true)
  ) {
    fail(`Bundled capture fonts were not loaded: ${JSON.stringify(receipt)}.`)
  }
}

function privacyViolations(serialized, runRoot = '') {
  const violations = []
  const patterns = [
    ['windows-user-path', /[A-Za-z]:[\\/]+Users[\\/]+/i],
    ['app-data-path', /AppData[\\/]+(?:Local|Roaming)[\\/]+/i],
    ['temp-path', /(?:^|[\\/])Temp[\\/]/i],
    ['short-user-path', /ADMINI~1|CNTOW~1/i],
    [
      'credential',
      /(?:authorization\s*[:=]|bearer\s+|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/i,
    ],
  ]
  if (runRoot.length > 0) {
    const escaped = runRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    patterns.push(['owned-run-root', new RegExp(escaped, 'i')])
  }
  for (const [name, pattern] of patterns) {
    if (pattern.test(serialized)) {
      violations.push(name)
    }
  }
  return violations
}

async function assertWholeWindowPrivacy(runRoot, scene) {
  const evidence = await evaluate(`(() => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 &&
        bounds.width > 0 &&
        bounds.height > 0
    }
    const values = [...document.querySelectorAll('input, textarea')]
      .filter(visible)
      .map(element => element.value)
    const bundledAsset = value =>
      /^file:\\/\\/[a-z]:\\/(?:[^?#]*\\/)?out\\/static\\/[a-z0-9._-]+\\.(?:gif|ico|png|svg|webp)(?:[?#].*)?$/i.test(
        value
      )
    const attributes = [
      ...document.querySelectorAll('[title], a[href], img[src], [aria-label]')
    ]
      .filter(visible)
      .flatMap(element => [
        element.getAttribute('title') ?? '',
        element.getAttribute('href') ?? '',
        element.getAttribute('src') ?? '',
        element.getAttribute('aria-label') ?? '',
      ])
      .filter(value => !bundledAsset(value))
    return {
      text: document.body.innerText,
      values,
      attributes,
    }
  })()`)
  const serialized = [
    evidence?.text ?? '',
    ...(evidence?.values ?? []),
    ...(evidence?.attributes ?? []),
  ].join('\n')
  const violations = privacyViolations(serialized, runRoot)
  if (violations.length > 0) {
    fail(
      `Whole-window privacy gate failed for ${scene}: ${violations.join(', ')}.`
    )
  }
  return true
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

function computeSyncClip(rowBounds, viewportWidth, viewportHeight) {
  if (
    !isRecord(rowBounds) ||
    ![rowBounds.left, rowBounds.top, rowBounds.width, rowBounds.height].every(
      Number.isFinite
    ) ||
    rowBounds.width <= 0 ||
    rowBounds.height <= 0 ||
    viewportWidth < 390 ||
    viewportHeight < 100
  ) {
    fail('The sync-summary row bounds are invalid.')
  }
  const x = Math.max(
    0,
    Math.min(viewportWidth - 390, Math.round(rowBounds.left))
  )
  const centeredY = Math.round(rowBounds.top - (100 - rowBounds.height) / 2)
  const y = Math.max(0, Math.min(viewportHeight - 100, centeredY))
  return { x, y, width: 390, height: 100, scale: 1 }
}

async function captureOriginalPixels(context, scene, clip = null) {
  const specification = SceneSpecifications[scene]
  await waitForBundledFonts()
  await assertWholeWindowPrivacy(context.owned.runRoot, scene)
  const parameters = {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  }
  if (clip !== null) {
    parameters.clip = clip
  }
  const result = await client.send('Page.captureScreenshot', parameters)
  const buffer = Buffer.from(result.data, 'base64')
  const dimensions = pngDimensions(buffer)
  if (
    dimensions.width !== specification.captureWidth ||
    dimensions.height !== specification.captureHeight
  ) {
    fail(
      `${scene} captured ${dimensions.width}x${dimensions.height}, expected ` +
        `${specification.captureWidth}x${specification.captureHeight}.`
    )
  }
  if (buffer.byteLength < specification.minimumBytes) {
    fail(
      `${scene} capture is suspiciously small at ${buffer.byteLength} bytes.`
    )
  }
  const digest = crypto.createHash('sha256').update(buffer).digest('hex')
  if (context.captureHashes.has(digest)) {
    fail(`${scene} duplicates another gallery capture byte-for-byte.`)
  }
  context.captureHashes.add(digest)
  const capturePath = path.join(context.owned.captureRoot, specification.output)
  fs.writeFileSync(capturePath, buffer, { flag: 'wx' })
  return {
    file: path
      .relative(context.owned.runRoot, capturePath)
      .split(path.sep)
      .join('/'),
    width: dimensions.width,
    height: dimensions.height,
    bytes: buffer.byteLength,
    sha256: digest,
    fromSurface: true,
    clip,
  }
}

async function closeRepositorySheet() {
  const present = await evaluate(
    `document.querySelector('#foldout-container .repository-list') !== null`
  )
  if (!present) {
    return
  }
  await clickSelector(
    '#foldout-container .repository-list .side-sheet-close',
    'repository sheet close button'
  )
  await waitFor(
    `document.querySelector('#foldout-container .repository-list') === null`,
    'closed repository sheet'
  )
}

async function closeTransientSurfaces() {
  await closeRepositorySheet().catch(() => undefined)
  await pressEscape(5)
  await waitFor(
    `document.querySelectorAll(
      '#dialog-layer dialog[open], .material-context-menu, ' +
      '.tab-overflow-popover, .tab-group-members-popover, ' +
      '.regex-builder-overlay'
    ).length === 0`,
    'closed transient gallery surfaces'
  )
  return true
}

async function openRepositorySheet() {
  const open = await evaluate(
    `document.querySelector('#foldout-container .repository-list') !== null`
  )
  if (!open) {
    await menuEvent('choose-repository')
  }
  await waitFor(
    `document.querySelector(
      '#foldout-container .repository-list .repository-list-actions'
    ) !== null`,
    'repository sheet'
  )
}

async function addRepositoryThroughDialog(context, repository) {
  const attempted = {
    actualPath: repository.actualPath,
    publicPath: repository.publicPath,
    name: repository.name,
  }
  context.attemptedRepositories.push(attempted)
  await menuEvent('add-local-repository')
  await waitFor(
    `document.querySelector(
      '#add-existing-repository input[type="text"]'
    ) !== null`,
    `add ${repository.name} dialog`
  )
  await setInput(
    '#add-existing-repository input[type="text"]',
    repository.publicPath
  )
  await waitFor(
    `(() => {
      const dialog = document.querySelector('#add-existing-repository')
      const button = dialog &&
        [...dialog.querySelectorAll('button')].find(candidate =>
          vt(candidate) === 'Add repository'
        )
      return button instanceof HTMLButtonElement &&
        !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true'
    })()`,
    `enabled Add repository button for ${repository.name}`,
    30_000
  )
  await clickText('Add repository', '#add-existing-repository')
  await waitFor(
    `(() => {
      if (document.querySelector('#add-existing-repository') !== null) {
        return false
      }
      const tabs = [...document.querySelectorAll(
        '.repository-tab[role="tab"]'
      )]
      return tabs.some(tab =>
        vt(tab.querySelector('.repository-tab-label')) ===
          ${JSON.stringify(repository.name)}
      )
    })()`,
    `real ${repository.name} repository tab`,
    40_000
  )
  const native = await evaluate(`(() => {
    const findRuntime = ${runtimeFinderSource()}
    const runtime = findRuntime()
    if (runtime === null) return null
    const pathModule = require('path')
    const candidates = ${JSON.stringify([
      repository.actualPath,
      repository.publicPath,
    ])}.map(candidate => pathModule.resolve(candidate).toLowerCase())
    const match = runtime.appStore
      .getState()
      .repositories.find(candidate =>
        candidates.includes(pathModule.resolve(candidate.path).toLowerCase())
      )
    return match
      ? {
          id: match.id,
          name: match.name,
          selected: runtime.appStore.selectedRepository?.id === match.id,
        }
      : null
  })()`)
  if (
    native === null ||
    !Number.isSafeInteger(native.id) ||
    native.name !== repository.name
  ) {
    fail(`${repository.name} was not registered in production AppStore state.`)
  }
  return native
}

async function refreshRepositoryState(repository) {
  const receipt = await evaluate(`(async () => {
    const findRuntime = ${runtimeFinderSource()}
    const runtime = findRuntime()
    if (runtime === null) return { runtimeFound: false }
    const pathModule = require('path')
    const candidates = ${JSON.stringify([
      repository.actualPath,
      repository.publicPath,
    ])}.map(candidate => pathModule.resolve(candidate).toLowerCase())
    const match = runtime.appStore
      .getState()
      .repositories.find(candidate =>
        candidates.includes(pathModule.resolve(candidate.path).toLowerCase())
      )
    if (!match) return { runtimeFound: true, repositoryFound: false }
    await runtime.dispatcher.refreshRepository(match)
    const state = runtime.appStore
      .getState()
      .localRepositoryStateLookup?.get(match.id)
    return {
      runtimeFound: true,
      repositoryFound: true,
      upstreamState: state?.upstreamState ?? null,
      ahead: state?.aheadBehind?.ahead ?? null,
      behind: state?.aheadBehind?.behind ?? null,
      branchName: state?.branchName ?? null,
    }
  })()`)
  if (
    receipt?.runtimeFound !== true ||
    receipt.repositoryFound !== true ||
    receipt.upstreamState !== 'tracking'
  ) {
    fail(
      `Production repository refresh did not load tracking state: ${JSON.stringify(
        receipt
      )}.`
    )
  }
  return receipt
}

function baseFixture(overrides = {}) {
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

function passingAssertions(scene) {
  return Object.fromEntries(
    SceneSpecifications[scene].assertionNames.map(name => [name, true])
  )
}

async function inspectCommonLayout(selector, scene) {
  const receipt = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(selector)})
    if (!(root instanceof HTMLElement)) return null
    const bounds = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    return {
      visible:
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 &&
        bounds.width > 0 &&
        bounds.height > 0,
      contained:
        bounds.left >= -0.5 &&
        bounds.top >= -0.5 &&
        bounds.right <= innerWidth + 0.5 &&
        bounds.bottom <= innerHeight + 0.5,
      documentOverflow:
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
    }
  })()`)
  if (
    receipt?.visible !== true ||
    receipt.contained !== true ||
    receipt.documentOverflow !== false
  ) {
    fail(`${scene} layout gate failed: ${JSON.stringify(receipt)}.`)
  }
}

async function sceneCommandPalette(context) {
  const scene = 'material-command-palette-appearance'
  await closeTransientSurfaces()
  await setViewport(1000, 687)
  await openCommandPaletteKeyboard()
  await waitFor(
    `document.querySelector(
      '#command-palette input[data-search-surface-id="command-palette"]'
    ) !== null`,
    'command palette'
  )
  await setInput(
    '#command-palette input[data-search-surface-id="command-palette"]',
    'ollama'
  )
  const ollamaResults = await evaluate(`(() => ({
    count: document.querySelectorAll(
      '#command-palette .command-palette-row'
    ).length,
    titles: [...document.querySelectorAll(
      '#command-palette .command-palette-title'
    )].map(element => vt(element)),
  }))()`)
  process.stdout.write(`OLLAMA_RESULTS ${JSON.stringify(ollamaResults)}\n`)
  // At least eight rows, not exactly eight: the gate exists to prove the list
  // renders a full screen of rich rows beside the aligned editor, and an exact
  // count silently breaks every time the catalog gains a command (it did, when
  // the palette grew its live setting rows).
  await waitFor(
    `document.querySelectorAll(
      '#command-palette .command-palette-row'
    ).length >= 8`,
    'at least eight ollama command results'
  )
  await clickSelector(
    '#command-palette .command-palette-appearance-toggle',
    'Customize appearance'
  )
  await waitFor(
    `document.querySelector(
      '#command-palette #command-palette-appearance-editor'
    ) !== null`,
    'command-palette appearance editor'
  )
  await clickText('Reset defaults', '#command-palette-appearance-editor')
  await clickSelector(
    '#command-palette-appearance-editor .command-palette-appearance-mode input[type="checkbox"]',
    'Random per repository'
  )
  await waitFor(
    `document.querySelector(
      '#command-palette-appearance-editor .command-palette-appearance-mode input[type="checkbox"]'
    )?.checked === true`,
    'random-per-repository appearance enabled'
  )
  const randomModeChanged = await evaluate(`(() => {
    const editor = document.querySelector('#command-palette-appearance-editor')
    const toggle = editor?.querySelector(
      '.command-palette-appearance-mode input[type="checkbox"]'
    )
    const compact = editor?.querySelector(
      'input[name="command-palette-density"][value="compact"]'
    )
    return toggle instanceof HTMLInputElement &&
      toggle.checked &&
      compact instanceof HTMLInputElement &&
      compact.matches(':disabled')
  })()`)
  await clickSelector(
    '#command-palette-appearance-editor .command-palette-appearance-mode input[type="checkbox"]',
    'Random per repository'
  )
  await waitFor(
    `document.querySelector(
      '#command-palette-appearance-editor .command-palette-appearance-mode input[type="checkbox"]'
    )?.checked === false`,
    'manual appearance restored'
  )
  const appearanceViewport = await evaluate(`(() => {
    const editor = document.querySelector('#command-palette-appearance-editor')
    if (!(editor instanceof HTMLElement)) return Promise.resolve(null)
    editor.scrollTop = 0
    return new Promise(resolve =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const heading = editor.querySelector('h3')
          const editorBounds = editor.getBoundingClientRect()
          const headingBounds = heading instanceof HTMLElement
            ? heading.getBoundingClientRect()
            : null
          resolve({
            editorScrollTop: editor.scrollTop,
            appearanceHeadingVisible:
              heading instanceof HTMLElement &&
              vt(heading) === 'Appearance' &&
              headingBounds !== null &&
              headingBounds.left >= editorBounds.left - 0.5 &&
              headingBounds.right <= editorBounds.right + 0.5 &&
              headingBounds.top >= editorBounds.top - 0.5 &&
              headingBounds.bottom <= editorBounds.bottom + 0.5,
          })
        })
      )
    )
  })()`)
  if (
    appearanceViewport?.editorScrollTop !== 0 ||
    appearanceViewport.appearanceHeadingVisible !== true
  ) {
    fail(
      `Command-palette appearance heading is clipped: ${JSON.stringify(
        appearanceViewport
      )}.`
    )
  }
  const state = await evaluate(`(() => {
    const dialog = document.querySelector('#command-palette')
    const input = dialog?.querySelector(
      'input[data-search-surface-id="command-palette"]'
    )
    const rows = [...(dialog?.querySelectorAll('.command-palette-row') ?? [])]
    const editor = dialog?.querySelector(
      '#command-palette-appearance-editor'
    )
    const reset = editor &&
      [...editor.querySelectorAll('button')].find(button =>
        vt(button) === 'Reset defaults'
      )
    const randomToggle = editor?.querySelector(
      '.command-palette-appearance-mode input[type="checkbox"]'
    )
    const alignedOptions = [
      ...(editor?.querySelectorAll(
        '.command-palette-appearance-option, .command-palette-appearance-check'
      ) ?? []),
    ].every(label => {
      const control = label.querySelector('input')
      const copy = label.querySelector(
        '.command-palette-appearance-option-copy, span'
      )
      if (!(control instanceof HTMLElement) || !(copy instanceof HTMLElement)) {
        return false
      }
      const controlBounds = control.getBoundingClientRect()
      const copyBounds = copy.getBoundingClientRect()
      const gap = copyBounds.left - controlBounds.right
      return gap >= -0.5 && gap <= 16
    })
    const contained = element => {
      if (!(element instanceof HTMLElement)) return false
      const bounds = element.getBoundingClientRect()
      return bounds.left >= -0.5 &&
        bounds.top >= -0.5 &&
        bounds.right <= innerWidth + 0.5 &&
        bounds.bottom <= innerHeight + 0.5
    }
    return {
      query: input?.value ?? null,
      resultCount: rows.length,
      editorOpen:
        editor instanceof HTMLElement &&
        contained(editor) &&
        dialog instanceof HTMLElement &&
        contained(dialog),
      resetVisible: reset instanceof HTMLButtonElement && contained(reset),
      randomToggleVisible:
        randomToggle instanceof HTMLInputElement &&
        !randomToggle.checked &&
        contained(randomToggle),
      randomModeChanged: ${JSON.stringify(randomModeChanged)},
      alignedOptions,
      editorScrollTop: ${JSON.stringify(appearanceViewport.editorScrollTop)},
      appearanceHeadingVisible: ${JSON.stringify(
        appearanceViewport.appearanceHeadingVisible
      )},
      iconRowCount: rows.filter(row =>
        row.querySelector('.command-palette-icon') !== null
      ).length,
      groupChipRowCount: rows.filter(row =>
        row.querySelector('.command-palette-group') !== null
      ).length,
      keywordRowCount: rows.filter(row =>
        row.querySelector('.command-palette-keywords') !== null
      ).length,
    }
  })()`)
  // Richness is asserted per row rather than against a fixed catalog size:
  // every rendered row must carry its icon, group chip and keyword line, and
  // the list must fill the frame (at least eight rows). Hardcoding eight made
  // the gate fail the moment the palette gained new commands, while saying
  // nothing about rows nine and ten.
  if (
    state?.query !== 'ollama' ||
    typeof state.resultCount !== 'number' ||
    state.resultCount < 8 ||
    state.editorOpen !== true ||
    state.resetVisible !== true ||
    state.randomToggleVisible !== true ||
    state.randomModeChanged !== true ||
    state.alignedOptions !== true ||
    state.editorScrollTop !== 0 ||
    state.appearanceHeadingVisible !== true ||
    state.iconRowCount !== state.resultCount ||
    state.groupChipRowCount !== state.resultCount ||
    state.keywordRowCount !== state.resultCount
  ) {
    fail(`Command-palette gallery state diverged: ${JSON.stringify(state)}.`)
  }
  await inspectCommonLayout('#command-palette', scene)
  const capture = await captureOriginalPixels(context, scene)
  context.pendingReceipts.push({
    scene,
    fixture: baseFixture(),
    state,
    capture,
  })
  await pressEscape(2)
}

function ensurePublicAlias(context) {
  if (context.publicAlias === null) {
    context.publicAlias = createPublicFixtureDrive(context.owned.fixtureRoot)
  }
  return context.publicAlias
}

function repositoryDescriptor(context, actualPath, name) {
  const alias = ensurePublicAlias(context)
  return Object.freeze({
    actualPath,
    publicPath: publicFixturePath(context.owned, alias, actualPath),
    name,
  })
}

async function ensureTabGroupFixture(context) {
  if (context.tabGroupFixture !== null) {
    return context.tabGroupFixture
  }
  const root = ensureFreshDirectory(context.owned.fixtureRoot, 'tab-group')
  const name = 'gallery-tab-persisted'
  const actualPath = createStandaloneRepository(root, name, 1)
  const repository = repositoryDescriptor(context, actualPath, name)
  await addRepositoryThroughDialog(context, repository)
  context.tabGroupFixture = Object.freeze({ root, repository })
  return context.tabGroupFixture
}

async function sceneTabGroups(context) {
  const scene = 'material-tab-groups'
  await closeTransientSurfaces()
  await setViewport(1000, 687)
  const fixture = await ensureTabGroupFixture(context)
  const existing = await evaluate(
    `[...document.querySelectorAll('.repository-tab-group-label')]
      .some(label => vt(label) === ${JSON.stringify(GalleryTabGroupName)})`
  )
  if (existing) {
    fail(`Tab group ${GalleryTabGroupName} unexpectedly already exists.`)
  }

  const tabSelectorExpression = `(() => {
    return [...document.querySelectorAll('.repository-tab[role="tab"]')]
      .find(tab =>
        vt(tab.querySelector('.repository-tab-label')) ===
          ${JSON.stringify(fixture.repository.name)}
      ) ?? null
  })()`
  const tabPoint = await pointForExpression(
    tabSelectorExpression,
    `${fixture.repository.name} tab`
  )
  await clickPoint(tabPoint, 'right')
  await waitFor(
    `document.querySelector('.material-context-menu') !== null`,
    'repository-tab context menu'
  )
  await clickText('Add tab to new group…', '.material-context-menu')
  await waitFor(
    `document.querySelector(
      '#dialog-layer dialog#create-tab-group[open]'
    ) !== null`,
    'create tab-group dialog'
  )
  await setInput('#create-tab-group input[type="text"]', GalleryTabGroupName)
  await clickSelector(
    '#create-tab-group button.tab-group-color[data-color="blue"]',
    'blue tab-group color'
  )
  await waitFor(
    `document.querySelector(
      '#create-tab-group button.tab-group-color[data-color="blue"]'
    )?.getAttribute('aria-pressed') === 'true'`,
    'selected blue tab-group color'
  )
  await clickText('Create group', '#create-tab-group')
  await waitFor(
    `(() => {
      const group = [...document.querySelectorAll('.repository-tab-group')]
        .find(candidate =>
          vt(candidate.querySelector('.repository-tab-group-label')) ===
            ${JSON.stringify(GalleryTabGroupName)}
        )
      return group?.classList.contains('tab-group--blue') === true &&
        vt(group.querySelector('.repository-tab-group-count')) === '1'
    })()`,
    'created blue gallery tab group',
    30_000
  )
  const before = await evaluate(`(() => {
    const group = [...document.querySelectorAll('.repository-tab-group')]
      .find(candidate =>
        vt(candidate.querySelector('.repository-tab-group-label')) ===
          ${JSON.stringify(GalleryTabGroupName)}
      )
    return {
      groupId: group?.getAttribute('data-group-id') ?? null,
      timeOrigin: performance.timeOrigin,
    }
  })()`)
  if (
    typeof before?.groupId !== 'string' ||
    before.groupId.length === 0 ||
    !Number.isFinite(before.timeOrigin)
  ) {
    fail('Created gallery tab group has no stable production identity.')
  }
  await sleep(1_200)
  const reload = await reloadRenderer('gallery tab-group persistence')
  await setViewport(1000, 687)
  const state = await evaluate(`(() => {
    const group = [...document.querySelectorAll('.repository-tab-group')]
      .find(candidate =>
        vt(candidate.querySelector('.repository-tab-group-label')) ===
          ${JSON.stringify(GalleryTabGroupName)}
      )
    const chip = group?.querySelector('button.repository-tab-group-chip')
    const memberLabels = [
      ...document.querySelectorAll(
        '.repository-tab.grouped.tab-group--blue[role="tab"]'
      ),
    ]
      .filter(
        tab =>
          vt(tab.querySelector('.repository-tab-label')) ===
          ${JSON.stringify(fixture.repository.name)}
      )
      .map(tab => vt(tab.querySelector('.repository-tab-label')))
    return {
      groupName:
        vt(group?.querySelector('.repository-tab-group-label')) || null,
      groupId: group?.getAttribute('data-group-id') ?? null,
      color: group?.classList.contains('tab-group--blue') ? 'blue' : null,
      memberCount: Number(
        vt(group?.querySelector('.repository-tab-group-count'))
      ),
      expanded: chip?.getAttribute('aria-expanded') === 'true',
      reloadBeforeTimeOrigin: ${JSON.stringify(reload.before)},
      reloadAfterTimeOrigin: ${JSON.stringify(reload.after)},
      persistedMemberLabels: memberLabels,
    }
  })()`)
  if (
    state?.groupName !== GalleryTabGroupName ||
    state.groupId !== before.groupId ||
    state.color !== 'blue' ||
    state.memberCount !== 1 ||
    state.expanded !== true ||
    state.reloadBeforeTimeOrigin !== before.timeOrigin ||
    !(state.reloadAfterTimeOrigin > state.reloadBeforeTimeOrigin) ||
    JSON.stringify(state.persistedMemberLabels) !==
      JSON.stringify([fixture.repository.name])
  ) {
    fail(`Tab-group persistence state diverged: ${JSON.stringify(state)}.`)
  }
  await inspectCommonLayout('.repository-tab-strip', scene)
  const capture = await captureOriginalPixels(context, scene)
  context.pendingReceipts.push({
    scene,
    fixture: baseFixture({
      kind: 'git-worktree',
      repositories: [fixture.repository.name],
      groupName: GalleryTabGroupName,
      publicDrive: context.publicAlias.drive,
    }),
    state,
    capture,
  })
}

async function ensureRepositoryGroupFixture(context) {
  if (context.repositoryGroupFixture !== null) {
    return context.repositoryGroupFixture
  }
  const root = ensureFreshDirectory(
    context.owned.fixtureRoot,
    'repository-groups'
  )
  const repositories = RepositoryGroupNames.map((name, index) => {
    const actualPath = createTrackingRepository(root, name, index + 1)
    return repositoryDescriptor(context, actualPath, name)
  })
  for (const repository of repositories) {
    await addRepositoryThroughDialog(context, repository)
  }
  context.repositoryGroupFixture = Object.freeze({ root, repositories })
  return context.repositoryGroupFixture
}

async function createRepositoryGroupThroughDialog(context) {
  const fixture = await ensureRepositoryGroupFixture(context)
  if (context.repositoryGroupCreated) {
    return fixture
  }
  await openRepositorySheet()
  await setInput(
    '.repository-list input[data-search-surface-id="repositories"]',
    ''
  )
  // The dedicated .repository-group-new-button no longer exists: creating a
  // group moved into the repository list's "More" actions menu, beside Sync
  // repositories. Drive the shipped route instead of a retired button.
  await clickSelector(
    '.repository-list .repository-more-actions-button',
    'Repository list more actions'
  )
  await waitFor(
    `(() => {
      const menu = document.querySelector('.material-context-menu[role="menu"]')
      const item = [...(menu?.querySelectorAll('button.context-menu-item') ?? [])]
        .find(button =>
          button.querySelector('.context-menu-item-label')?.textContent?.trim() ===
            'Create a repository group'
        )
      return menu instanceof HTMLElement && item instanceof HTMLButtonElement &&
        !item.disabled && item.getAttribute('aria-disabled') !== 'true'
    })()`,
    'Create a repository group menu item'
  )
  await evaluate(`(() => {
    const menu = document.querySelector('.material-context-menu[role="menu"]')
    const item = [...(menu?.querySelectorAll('button.context-menu-item') ?? [])]
      .find(button =>
        button.querySelector('.context-menu-item-label')?.textContent?.trim() ===
          'Create a repository group'
      )
    if (!(item instanceof HTMLButtonElement)) return false
    item.click()
    return true
  })()`)
  await waitFor(
    `document.querySelector(
      '#dialog-layer dialog#manage-repository-group[open]'
    ) !== null`,
    'manage repository-group dialog'
  )
  await setInput(
    '#manage-repository-group input[type="text"]',
    GalleryGroupName
  )
  for (const repository of fixture.repositories) {
    const point = await pointForExpression(
      `(() => {
        const rows = [...document.querySelectorAll(
          '#manage-repository-group li.repository-group-member'
        )]
        const row = rows.find(candidate =>
          vt(candidate.querySelector('strong')) ===
            ${JSON.stringify(repository.name)}
        )
        return row?.querySelector('input[type="checkbox"]') ?? null
      })()`,
      `${repository.name} repository-group checkbox`
    )
    await clickPoint(point)
  }
  await waitFor(
    `(() => {
      const selected = [...document.querySelectorAll(
        '#manage-repository-group li.repository-group-member'
      )].filter(row =>
        row.querySelector('input[type="checkbox"]')?.checked === true
      )
      return selected.length === 3 &&
        ${JSON.stringify(RepositoryGroupNames)}.every(name =>
          selected.some(row => vt(row.querySelector('strong')) === name)
        )
    })()`,
    'three selected repository-group members'
  )
  await clickText('Create group', '#manage-repository-group')
  const groupKey = `2:custom:${GalleryGroupName.toLowerCase()}`
  await waitFor(
    `document.querySelector(
      'button.repository-group-header[data-group-key=${JSON.stringify(
        groupKey
      )}]'
    ) !== null &&
      document.querySelector('#manage-repository-group') === null`,
    'created repository group',
    30_000
  )
  context.repositoryGroupCreated = true
  return fixture
}

async function inspectRepositoryGroupState(expectedExpanded) {
  const groupKey = `2:custom:${GalleryGroupName.toLowerCase()}`
  return await evaluate(`(() => {
    const header = document.querySelector(
      'button.repository-group-header[data-group-key=${JSON.stringify(
        groupKey
      )}]'
    )
    const sectionId = header?.getAttribute('aria-controls')
    const section =
      typeof sectionId === 'string' ? document.getElementById(sectionId) : null
    const rows = section
      ? [...section.querySelectorAll(
          '.list-item[role="option"] .repository-list-item'
        )]
      : []
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 &&
        bounds.width > 0 &&
        bounds.height > 0
    }
    const namedRows = rows
      .map(row => ({
        name: vt(row.querySelector('.name')),
        summary: vt(row.querySelector('.repository-sync-summary')),
        visible: visible(row),
      }))
      .filter(row => ${JSON.stringify(RepositoryGroupNames)}.includes(row.name))
    const findRuntime = ${runtimeFinderSource()}
    const runtime = findRuntime()
    const persisted = runtime
      ? runtime.appStore
          .getState()
          .repositories
          .filter(repository =>
            ${JSON.stringify(RepositoryGroupNames)}.includes(repository.name)
          )
          .map(repository => ({
            name: repository.name,
            groupName: repository.groupName,
          }))
          .sort((left, right) => left.name.localeCompare(right.name))
      : []
    const count = header?.querySelector('.repository-group-count')
    return {
      groupName: vt(header?.querySelector('.repository-group-label')) || null,
      memberCount: persisted.length,
      ariaExpanded: header?.getAttribute('aria-expanded') === 'true',
      countPillVisible: visible(count),
      visibleMembers: namedRows.filter(row => row.visible).map(row => row.name),
      visibleSyncSummaries: namedRows
        .filter(row => row.visible)
        .map(row => row.summary),
      persistedGroupNames: persisted.map(row => row.groupName),
      expectedExpanded: ${expectedExpanded},
    }
  })()`)
}

function validateRepositoryGroupState(state, expanded) {
  const expectedNames = [...RepositoryGroupNames].sort()
  const observedNames = [...(state?.visibleMembers ?? [])].sort()
  const persisted = state?.persistedGroupNames ?? []
  if (
    state?.groupName !== GalleryGroupName ||
    state.memberCount !== 3 ||
    state.ariaExpanded !== expanded ||
    persisted.length !== 3 ||
    persisted.some(name => name !== GalleryGroupName)
  ) {
    fail(
      `Repository-group production state diverged: ${JSON.stringify(state)}.`
    )
  }
  if (expanded) {
    if (
      state.countPillVisible !== false ||
      JSON.stringify(observedNames) !== JSON.stringify(expectedNames) ||
      state.visibleSyncSummaries.length !== 3 ||
      state.visibleSyncSummaries.some(summary => summary.length === 0)
    ) {
      fail(`Expanded repository-group rows diverged: ${JSON.stringify(state)}.`)
    }
  } else if (
    state.countPillVisible !== true ||
    state.visibleMembers.length !== 0 ||
    state.visibleSyncSummaries.length !== 0
  ) {
    fail(`Collapsed repository-group rows diverged: ${JSON.stringify(state)}.`)
  }
  const { expectedExpanded: _ignored, ...receiptState } = state
  return receiptState
}

async function sceneRepositoryGroups(context, expanded) {
  const scene = expanded
    ? 'repository-groups-expanded'
    : 'repository-groups-collapsed'
  await setViewport(1180, 820)
  const fixture = await createRepositoryGroupThroughDialog(context)
  await openRepositorySheet()
  const groupKey = `2:custom:${GalleryGroupName.toLowerCase()}`
  const headerSelector = `button.repository-group-header[data-group-key=${JSON.stringify(
    groupKey
  )}]`
  const currentExpanded = await evaluate(
    `document.querySelector(${JSON.stringify(
      headerSelector
    )})?.getAttribute('aria-expanded') === 'true'`
  )
  if (currentExpanded !== expanded) {
    await clickSelector(headerSelector, `${GalleryGroupName} disclosure`)
  }
  await waitFor(
    `document.querySelector(${JSON.stringify(
      headerSelector
    )})?.getAttribute('aria-expanded') === ${JSON.stringify(String(expanded))}`,
    `${expanded ? 'expanded' : 'collapsed'} repository group`
  )
  const state = validateRepositoryGroupState(
    await inspectRepositoryGroupState(expanded),
    expanded
  )
  await inspectCommonLayout('#foldout-container .repository-list', scene)
  const capture = await captureOriginalPixels(context, scene)
  context.pendingReceipts.push({
    scene,
    fixture: baseFixture({
      kind: 'three-tracking-git-worktrees',
      repositories: fixture.repositories.map(repository => repository.name),
      groupName: GalleryGroupName,
      branch: 'main',
      ahead: 0,
      behind: 0,
      publicDrive: context.publicAlias.drive,
    }),
    state,
    capture,
  })
}

async function ensureSyncFixture(context) {
  if (context.syncFixture !== null) {
    return context.syncFixture
  }
  const fixture = createSyncSummaryFixture(context.owned.fixtureRoot)
  const name = 'gallery-sync-summary'
  const repository = repositoryDescriptor(context, fixture.repository, name)
  await addRepositoryThroughDialog(context, repository)
  context.syncFixture = Object.freeze({ ...fixture, repository })
  return context.syncFixture
}

async function sceneRepositorySyncSummary(context) {
  const scene = 'repository-list-sync-summary'
  await setViewport(1180, 820)
  const fixture = await ensureSyncFixture(context)
  const refreshed = await refreshRepositoryState(fixture.repository)
  if (
    refreshed.ahead !== fixture.ahead ||
    refreshed.behind !== fixture.behind ||
    refreshed.branchName !== fixture.branch
  ) {
    fail(
      `Known sync topology did not reach production state: ${JSON.stringify(
        refreshed
      )}.`
    )
  }
  await openRepositorySheet()
  await setInput(
    '.repository-list input[data-search-surface-id="repositories"]',
    fixture.repository.name
  )
  await waitFor(
    `(() => {
      const rows = [...document.querySelectorAll(
        '.repository-list .list-item[role="option"] .repository-list-item'
      )]
      return rows.filter(row =>
        vt(row.querySelector('.name')) ===
          ${JSON.stringify(fixture.repository.name)} &&
        vt(row.querySelector('.repository-sync-summary')) ===
          ${JSON.stringify(SyncSummaryText)}
      ).length === 1
    })()`,
    'exact diverged repository sync summary',
    30_000
  )
  const inspected = await evaluate(`(() => {
    const row = [...document.querySelectorAll(
      '.repository-list .list-item[role="option"] .repository-list-item'
    )].find(candidate =>
      vt(candidate.querySelector('.name')) ===
        ${JSON.stringify(fixture.repository.name)}
    )
    if (!(row instanceof HTMLElement)) return null
    const outer = row.closest('.list-item')
    const bounds = outer?.getBoundingClientRect()
    if (!bounds) return null
    return {
      repository: vt(row.querySelector('.name')),
      summary: vt(row.querySelector('.repository-sync-summary')),
      rowBounds: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
    }
  })()`)
  if (
    inspected?.repository !== fixture.repository.name ||
    inspected.summary !== SyncSummaryText
  ) {
    fail(`Rendered sync-summary row diverged: ${JSON.stringify(inspected)}.`)
  }
  const clip = computeSyncClip(inspected.rowBounds, 1180, 820)
  await assertWholeWindowPrivacy(context.owned.runRoot, scene)
  const state = {
    repository: fixture.repository.name,
    branch: fixture.branch,
    ahead: fixture.ahead,
    behind: fixture.behind,
    summary: inspected.summary,
    wholeWindowPrivacyChecked: true,
    clip,
  }
  await inspectCommonLayout('#foldout-container .repository-list', scene)
  const capture = await captureOriginalPixels(context, scene, clip)
  context.pendingReceipts.push({
    scene,
    fixture: baseFixture({
      kind: 'diverged-git-worktree-with-bare-origin',
      repositories: [fixture.repository.name],
      branch: fixture.branch,
      ahead: fixture.ahead,
      behind: fixture.behind,
      publicDrive: context.publicAlias.drive,
    }),
    state,
    capture,
  })
}

async function ensureOverflowFixture(context) {
  if (context.overflowFixture !== null) {
    return context.overflowFixture
  }
  await closeRepositorySheet()
  const root = ensureFreshDirectory(context.owned.fixtureRoot, 'overflow')
  const repositories = OverflowRepositoryNames.map((name, index) => {
    const actualPath = createStandaloneRepository(root, name, index + 1)
    return repositoryDescriptor(context, actualPath, name)
  })
  for (const repository of repositories) {
    await addRepositoryThroughDialog(context, repository)
  }
  context.overflowFixture = Object.freeze({ root, repositories })
  return context.overflowFixture
}

async function cycleFilterModeToRegex(surfaceSelector) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = await evaluate(
      `document.querySelector(
        ${JSON.stringify(`${surfaceSelector} .filter-mode-button`)}
      )?.getAttribute('aria-label') ?? null`
    )
    if (label === 'Filter mode: Regex (click to change)') {
      return
    }
    await clickSelector(
      `${surfaceSelector} .filter-mode-button`,
      'filter mode cycle'
    )
  }
  fail('Unable to activate the shipped Regex filter mode.')
}

async function sceneTabOverflow(context) {
  const scene = 'tab-overflow-search'
  await closeTransientSurfaces()
  await setViewport(1280, 800)
  const fixture = await ensureOverflowFixture(context)
  await waitFor(
    `(() => {
      const button = document.querySelector(
        'button.repository-tab-overflow'
      )
      return button instanceof HTMLButtonElement &&
        Number(vt(button.querySelector('.repository-tab-overflow-count'))) >= 8
    })()`,
    'repository-tab overflow button',
    30_000
  )
  await clickSelector(
    'button.repository-tab-overflow',
    'repository-tab overflow button'
  )
  await waitFor(
    `document.querySelector('.tab-overflow-popover') !== null`,
    'tab-overflow popover'
  )
  await cycleFilterModeToRegex('.tab-overflow-popover')
  await setInput(
    '.tab-overflow-popover input[data-search-surface-id="tab-overflow"]',
    OverflowPattern
  )
  await waitFor(
    `(() => {
      const popover = document.querySelector('.tab-overflow-popover')
      const rows = popover?.querySelectorAll(
        '.tab-overflow-result[role="option"]'
      )
      const mode = popover?.querySelector('.filter-mode-button')
      return rows !== undefined &&
        rows.length >= 4 &&
        mode?.getAttribute('aria-label') ===
          'Filter mode: Regex (click to change)' &&
        popover.querySelector('.tab-overflow-error') === null
    })()`,
    'regex-filtered overflow results'
  )
  const safeRoot = path.win32.join(
    context.publicAlias.root,
    path.relative(context.owned.fixtureRoot, fixture.root)
  )
  const state = await evaluate(`(() => {
    const popover = document.querySelector('.tab-overflow-popover')
    const input = popover?.querySelector(
      'input[data-search-surface-id="tab-overflow"]'
    )
    const rows = [...(popover?.querySelectorAll(
      '.tab-overflow-result[role="option"]'
    ) ?? [])]
    const paths = rows.map(row =>
      vt(row.querySelector('.tab-overflow-result-path'))
    )
    const labels = rows.map(row =>
      vt(row.querySelector('.tab-overflow-result-copy strong'))
    )
    const builder = popover?.querySelector('.filter-regex-builder-button')
    return {
      pattern: input?.value ?? null,
      filterMode:
        popover?.querySelector('.filter-mode-button')
          ?.getAttribute('aria-label') ?? null,
      totalOverflowCount: Number(
        vt(document.querySelector('.repository-tab-overflow-count'))
      ),
      resultCount: rows.length,
      resultLabels: labels,
      builderLauncherVisible:
        builder instanceof HTMLButtonElement &&
        vt(builder) === '.*Regex builder',
      overflowPathRoot: ${JSON.stringify(safeRoot)},
      paths,
    }
  })()`)
  const expectedPathPrefix = safeRoot.toLowerCase() + '\\'
  if (
    state?.pattern !== OverflowPattern ||
    state.filterMode !== 'Filter mode: Regex (click to change)' ||
    state.totalOverflowCount < 8 ||
    state.resultCount < 4 ||
    state.builderLauncherVisible !== true ||
    state.resultLabels.some(
      label => !OverflowRepositoryNames.includes(label)
    ) ||
    state.paths.some(
      candidate => !candidate.toLowerCase().startsWith(expectedPathPrefix)
    )
  ) {
    fail(`Tab-overflow gallery state diverged: ${JSON.stringify(state)}.`)
  }
  const { paths: _privateImplementationDetail, ...receiptState } = state
  await inspectCommonLayout('.tab-overflow-popover', scene)
  const capture = await captureOriginalPixels(context, scene)
  context.pendingReceipts.push({
    scene,
    fixture: baseFixture({
      kind: 'fourteen-git-worktrees',
      repositories: fixture.repositories.map(repository => repository.name),
      branch: 'main',
      publicDrive: context.publicAlias.drive,
    }),
    state: receiptState,
    capture,
  })
}

async function removeFixtureRepositories(context) {
  if (context.attemptedRepositories.length === 0) {
    return {
      removed: 0,
      absent: true,
    }
  }
  const candidates = context.attemptedRepositories.flatMap(repository => [
    repository.actualPath,
    repository.publicPath,
  ])
  const result = await evaluate(`(async () => {
    const findRuntime = ${runtimeFinderSource()}
    const runtime = findRuntime()
    if (runtime === null) return { runtimeFound: false }
    const pathModule = require('path')
    const expected = new Set(
      ${JSON.stringify(candidates)}
        .map(candidate => pathModule.resolve(candidate).toLowerCase())
    )
    const repositories = runtime.appStore
      .getState()
      .repositories.filter(repository =>
        expected.has(pathModule.resolve(repository.path).toLowerCase())
      )
    let removed = 0
    for (const repository of repositories) {
      const outcome = await runtime.dispatcher.removeRepository(
        repository,
        false
      )
      if (outcome === 'error' || outcome === 'trash-failed') {
        return {
          runtimeFound: true,
          removed,
          removalFailed: true,
        }
      }
      removed += 1
    }
    const remaining = runtime.appStore
      .getState()
      .repositories.filter(repository =>
        expected.has(pathModule.resolve(repository.path).toLowerCase())
      ).length
    return {
      runtimeFound: true,
      removed,
      removalFailed: false,
      remaining,
    }
  })()`)
  if (
    result?.runtimeFound !== true ||
    result.removalFailed !== false ||
    result.remaining !== 0
  ) {
    fail(`Fixture repository cleanup failed: ${JSON.stringify(result)}.`)
  }
  return {
    removed: result.removed,
    absent: true,
  }
}

async function restoreLocalStorage(snapshot) {
  const restored = await evaluate(`(() => {
    const expected = ${JSON.stringify(snapshot)}
    localStorage.clear()
    for (const [key, value] of Object.entries(expected)) {
      localStorage.setItem(key, value)
    }
    const observed = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key !== null) observed[key] = localStorage.getItem(key)
    }
    return JSON.stringify(observed) === JSON.stringify(expected)
  })()`)
  if (!restored) {
    fail('Isolated profile localStorage could not be restored exactly.')
  }
  return true
}

async function cleanupRun(context, localStorageSnapshot) {
  const transientsClosed = await closeTransientSurfaces()
  const repositories = await removeFixtureRepositories(context)
  const localStorageRestored = await restoreLocalStorage(localStorageSnapshot)
  await reloadRenderer('gallery verifier cleanup')
  const absentAfterReload = await evaluate(`(() => {
    const findRuntime = ${runtimeFinderSource()}
    const runtime = findRuntime()
    if (runtime === null) return false
    const pathModule = require('path')
    const expected = new Set(
      ${JSON.stringify(
        context.attemptedRepositories.flatMap(repository => [
          repository.actualPath,
          repository.publicPath,
        ])
      )}
        .map(candidate => pathModule.resolve(candidate).toLowerCase())
    )
    return runtime.appStore
      .getState()
      .repositories.every(repository =>
        !expected.has(pathModule.resolve(repository.path).toLowerCase())
      )
  })()`)
  if (!absentAfterReload) {
    fail('A disposable fixture repository returned after cleanup reload.')
  }
  await client.send('Emulation.clearDeviceMetricsOverride')
  await client.send('Emulation.setEmulatedMedia', { features: [] })
  const publicFixtureDriveReleased = releasePublicFixtureDrive(
    context.publicAlias
  )
  if (!publicFixtureDriveReleased) {
    fail('Disposable public fixture drive could not be released.')
  }
  context.publicAlias = null
  return {
    repositoriesRemoved: repositories.removed,
    fixtureRepositoriesAbsent: repositories.absent && absentAfterReload,
    localStorageRestored,
    transientsClosed,
    viewportOverrideCleared: true,
    publicFixtureDriveReleased,
    fixtureFilesRetainedForCaller: true,
  }
}

function assertPublicReceipt(receipt) {
  const serialized = JSON.stringify(receipt)
  const violations = privacyViolations(serialized)
  if (
    violations.length > 0 ||
    serialized.includes('desktop-material-gallery-ui-state-')
  ) {
    fail(
      `Scene receipt contains private path or credential material: ${[
        ...violations,
        ...(serialized.includes('desktop-material-gallery-ui-state-')
          ? ['run-root-name']
          : []),
      ].join(', ')}.`
    )
  }
}

function validateSceneReceipt(scene, receipt) {
  const specification = SceneSpecifications[scene]
  if (specification === undefined) {
    fail(`Unknown receipt scene ${JSON.stringify(scene)}.`)
  }
  if (
    !sameKeys(receipt, ReceiptKeys) ||
    receipt.schema !== ReceiptSchema ||
    receipt.scene !== scene ||
    receipt.galleryOutput !== specification.output ||
    !sameKeys(receipt.viewport, ['width', 'height']) ||
    receipt.viewport.width !== specification.width ||
    receipt.viewport.height !== specification.height ||
    !sameKeys(receipt.appearance, AppearanceKeys) ||
    JSON.stringify(receipt.appearance) !== JSON.stringify(Appearance) ||
    !sameKeys(receipt.fixture, FixtureKeys) ||
    !Array.isArray(receipt.fixture.repositories) ||
    !sameKeys(receipt.state, specification.stateKeys) ||
    !sameKeys(receipt.assertions, specification.assertionNames) ||
    specification.assertionNames.some(
      name => receipt.assertions[name] !== true
    ) ||
    !sameKeys(receipt.capture, CaptureKeys) ||
    receipt.capture.file.split('/').at(-1) !== specification.output ||
    receipt.capture.width !== specification.captureWidth ||
    receipt.capture.height !== specification.captureHeight ||
    !Number.isSafeInteger(receipt.capture.bytes) ||
    receipt.capture.bytes < specification.minimumBytes ||
    !/^[a-f0-9]{64}$/.test(receipt.capture.sha256 ?? '') ||
    receipt.capture.fromSurface !== true ||
    !sameKeys(receipt.cleanup, CleanupKeys) ||
    !Number.isSafeInteger(receipt.cleanup.repositoriesRemoved) ||
    receipt.cleanup.repositoriesRemoved < 0 ||
    receipt.cleanup.fixtureRepositoriesAbsent !== true ||
    receipt.cleanup.localStorageRestored !== true ||
    receipt.cleanup.transientsClosed !== true ||
    receipt.cleanup.viewportOverrideCleared !== true ||
    receipt.cleanup.publicFixtureDriveReleased !== true ||
    receipt.cleanup.fixtureFilesRetainedForCaller !== true
  ) {
    fail(`Strict scene receipt structure is invalid for ${scene}.`)
  }
  for (const name of receipt.fixture.repositories) {
    if (typeof name !== 'string' || !/^gallery-[a-z0-9-]+$/.test(name)) {
      fail(`${scene} receipt has an invalid public repository name.`)
    }
  }
  if (
    receipt.fixture.publicDrive !== null &&
    !/^[R-Z]:$/.test(receipt.fixture.publicDrive)
  ) {
    fail(`${scene} receipt has an invalid public drive identity.`)
  }

  if (scene === 'material-command-palette-appearance') {
    if (
      receipt.fixture.kind !== 'none' ||
      receipt.state.query !== 'ollama' ||
      receipt.state.resultCount !== 8 ||
      receipt.state.editorOpen !== true ||
      receipt.state.resetVisible !== true ||
      receipt.state.randomToggleVisible !== true ||
      receipt.state.randomModeChanged !== true ||
      receipt.state.alignedOptions !== true ||
      receipt.state.editorScrollTop !== 0 ||
      receipt.state.appearanceHeadingVisible !== true ||
      receipt.state.iconRowCount !== 8 ||
      receipt.state.groupChipRowCount !== 8 ||
      receipt.state.keywordRowCount !== 8 ||
      receipt.capture.clip !== null
    ) {
      fail('Command-palette receipt semantics are invalid.')
    }
  } else if (scene === 'material-tab-groups') {
    if (
      receipt.fixture.repositories.length !== 1 ||
      receipt.fixture.groupName !== GalleryTabGroupName ||
      receipt.state.groupName !== GalleryTabGroupName ||
      receipt.state.color !== 'blue' ||
      receipt.state.memberCount !== 1 ||
      receipt.state.expanded !== true ||
      !(
        receipt.state.reloadAfterTimeOrigin >
        receipt.state.reloadBeforeTimeOrigin
      ) ||
      JSON.stringify(receipt.state.persistedMemberLabels) !==
        JSON.stringify(receipt.fixture.repositories) ||
      receipt.capture.clip !== null
    ) {
      fail('Tab-group receipt semantics are invalid.')
    }
  } else if (
    scene === 'repository-groups-expanded' ||
    scene === 'repository-groups-collapsed'
  ) {
    const expanded = scene === 'repository-groups-expanded'
    if (
      receipt.fixture.repositories.length !== 3 ||
      receipt.fixture.groupName !== GalleryGroupName ||
      receipt.state.groupName !== GalleryGroupName ||
      receipt.state.memberCount !== 3 ||
      receipt.state.ariaExpanded !== expanded ||
      receipt.state.countPillVisible !== !expanded ||
      receipt.state.persistedGroupNames.length !== 3 ||
      receipt.state.persistedGroupNames.some(
        name => name !== GalleryGroupName
      ) ||
      (expanded
        ? receipt.state.visibleMembers.length !== 3 ||
          receipt.state.visibleSyncSummaries.length !== 3
        : receipt.state.visibleMembers.length !== 0 ||
          receipt.state.visibleSyncSummaries.length !== 0) ||
      receipt.capture.clip !== null
    ) {
      fail(`${scene} receipt semantics are invalid.`)
    }
  } else if (scene === 'repository-list-sync-summary') {
    if (
      receipt.fixture.repositories.length !== 1 ||
      receipt.fixture.branch !== 'main' ||
      receipt.fixture.ahead !== 1 ||
      receipt.fixture.behind !== 1 ||
      receipt.state.ahead !== 1 ||
      receipt.state.behind !== 1 ||
      receipt.state.summary !== SyncSummaryText ||
      receipt.state.wholeWindowPrivacyChecked !== true ||
      !sameKeys(receipt.state.clip, ['x', 'y', 'width', 'height', 'scale']) ||
      receipt.state.clip.width !== 390 ||
      receipt.state.clip.height !== 100 ||
      receipt.state.clip.scale !== 1 ||
      JSON.stringify(receipt.capture.clip) !==
        JSON.stringify(receipt.state.clip)
    ) {
      fail('Repository sync-summary receipt semantics are invalid.')
    }
  } else if (scene === 'tab-overflow-search') {
    if (
      receipt.fixture.repositories.length !== 14 ||
      receipt.state.pattern !== OverflowPattern ||
      receipt.state.filterMode !== 'Filter mode: Regex (click to change)' ||
      receipt.state.totalOverflowCount < 8 ||
      receipt.state.resultCount < 4 ||
      !Array.isArray(receipt.state.resultLabels) ||
      receipt.state.resultLabels.length !== receipt.state.resultCount ||
      receipt.state.builderLauncherVisible !== true ||
      !/^[R-Z]:\\overflow$/.test(receipt.state.overflowPathRoot) ||
      receipt.capture.clip !== null
    ) {
      fail('Tab-overflow receipt semantics are invalid.')
    }
  }
  assertPublicReceipt(receipt)
  return receipt
}

function buildReceipt(pending, cleanup) {
  const specification = SceneSpecifications[pending.scene]
  return validateSceneReceipt(pending.scene, {
    schema: ReceiptSchema,
    scene: pending.scene,
    galleryOutput: specification.output,
    viewport: {
      width: specification.width,
      height: specification.height,
    },
    appearance: { ...Appearance },
    fixture: pending.fixture,
    state: pending.state,
    assertions: passingAssertions(pending.scene),
    capture: pending.capture,
    cleanup,
  })
}

async function runSelectedScene(context, scene) {
  switch (scene) {
    case 'material-command-palette-appearance':
      return await sceneCommandPalette(context)
    case 'material-tab-groups':
      return await sceneTabGroups(context)
    case 'repository-groups-expanded':
      return await sceneRepositoryGroups(context, true)
    case 'repository-groups-collapsed':
      return await sceneRepositoryGroups(context, false)
    case 'repository-list-sync-summary':
      return await sceneRepositorySyncSummary(context)
    case 'tab-overflow-search':
      return await sceneTabOverflow(context)
    default:
      fail(`No executor exists for scene ${scene}.`)
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const owned = validateOwnedPaths(options)
  const webSocketURL = await rendererWebSocketURL(options.port)
  client = new CDPClient(webSocketURL)
  await client.open()

  const context = {
    options,
    owned,
    publicAlias: null,
    attemptedRepositories: [],
    tabGroupFixture: null,
    repositoryGroupFixture: null,
    repositoryGroupCreated: false,
    syncFixture: null,
    overflowFixture: null,
    pendingReceipts: [],
    captureHashes: new Set(),
  }
  let localStorageSnapshot = null
  let runError = null
  let cleanupError = null
  let cleanup = null

  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await waitForApp()
    localStorageSnapshot = await snapshotLocalStorage()
    await preparePresentation()
    for (const scene of options.scenes) {
      await runSelectedScene(context, scene)
      process.stdout.write(`GALLERY_UI_STATE_CAPTURED ${scene}\n`)
    }
  } catch (error) {
    runError = error
  }

  if (localStorageSnapshot !== null) {
    try {
      cleanup = await cleanupRun(context, localStorageSnapshot)
    } catch (error) {
      cleanupError = error
      if (context.publicAlias !== null) {
        try {
          releasePublicFixtureDrive(context.publicAlias)
          context.publicAlias = null
        } catch {}
      }
    }
  } else if (context.publicAlias !== null) {
    try {
      releasePublicFixtureDrive(context.publicAlias)
      context.publicAlias = null
    } catch (error) {
      cleanupError = error
    }
  }
  client.close()

  if (runError !== null || cleanupError !== null) {
    const messages = [runError, cleanupError]
      .filter(error => error !== null)
      .map(error =>
        error instanceof Error ? error.stack ?? error.message : String(error)
      )
    fail(messages.join('\nCleanup failure:\n'))
  }
  if (
    cleanup === null ||
    context.pendingReceipts.length !== options.scenes.length
  ) {
    fail('Gallery verifier did not produce one cleaned receipt per scene.')
  }

  for (const pending of context.pendingReceipts) {
    const receipt = buildReceipt(pending, cleanup)
    const receiptPath = path.join(owned.receiptRoot, `${pending.scene}.json`)
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
    process.stdout.write(
      `GALLERY_UI_STATE_RECEIPT ${JSON.stringify(receipt)}\n`
    )
  }
}

if (require.main === module) {
  main().catch(error => {
    const detail =
      error instanceof Error
        ? error.stack ?? error.message
        : String(error ?? 'Unknown gallery UI-state verifier error.')
    process.stderr.write(`${detail}\n`)
    process.exit(1)
  })
}

module.exports = {
  Appearance,
  CleanupKeys,
  CommonAssertionNames,
  FixtureKeys,
  GalleryGroupName,
  GalleryTabGroupName,
  OverflowPattern,
  ReceiptSchema,
  RepositoryGroupNames,
  SceneOrder,
  SceneSpecifications,
  SyncSummaryText,
  buildReceipt,
  computeSyncClip,
  isContainedPath,
  parseArguments,
  parseGitDivergenceCounts,
  pngDimensions,
  privacyViolations,
  validateSceneReceipt,
}
