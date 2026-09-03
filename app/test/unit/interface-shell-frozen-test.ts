import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import * as FsAsync from 'node:fs/promises'
import * as Path from 'node:path'
import { promisify } from 'node:util'

import {
  SOURCE_EXTENSIONS,
  findRendererWiringIssues,
  findRetiredFamilyIssues,
  findRetiredImportIssues,
  findUnretainedRendererMd3Issues,
  readSourceFiles,
  type FrozenInterfaceShellContract,
  type SourceRecord,
} from './interface-shell-frozen-validator'

const repoRoot = Path.resolve(__dirname, '..', '..', '..')
const md3Dir = Path.join(repoRoot, 'app', 'src', 'ui', 'md3')
const stylesDir = Path.join(repoRoot, 'app', 'styles', 'ui')
const contractPath = Path.join(
  repoRoot,
  'app',
  'test',
  'fixtures',
  'frozen-interface-shell-contract.json'
)
const contract = JSON.parse(
  // This is a checked-in, public-safe contract. Loading it at test time keeps
  // the hand-written inventory separate from the source under test.
  require('node:fs').readFileSync(contractPath, 'utf8')
) as FrozenInterfaceShellContract
const execFileAsync = promisify(execFile)

function assertContractShape(): void {
  assert.equal(contract.schemaVersion, 1)
  assert.equal(contract.baseline.presentation, '2026-08-07')
  assert.equal(contract.baseline.restoredOn, '2026-08-15')
  assert.equal(
    contract.changePolicy.frozenBoundary,
    'application chrome, whole-screen views, and their shell styles'
  )
  assert.deepEqual(contract.changePolicy.allowedWithinBoundary, [
    'control-level bug fixes',
    'Material Design 3 conformance for retained controls and dialogs',
  ])
  assert.equal(
    contract.changePolicy.requiresExplicitRequest,
    'replacing, re-skinning, re-shelling, or restoring the application chrome'
  )

  const allPaths = [
    ...contract.retiredShell.barrelPaths,
    ...contract.retiredShell.modulePaths,
    ...contract.retiredShell.stylesheetPaths,
    ...contract.survivingControls,
  ]
  assert.ok(allPaths.length > 0)
  assert.equal(new Set(allPaths).size, allPaths.length)
  assert.ok(contract.retiredShell.familyPrefixes.length > 0)
  assert.equal(
    new Set(contract.retiredShell.familyPrefixes).size,
    contract.retiredShell.familyPrefixes.length
  )
  assert.ok(contract.provenance.length > 0)
  assert.equal(
    new Set(contract.provenance.map(entry => entry.sha)).size,
    contract.provenance.length
  )
  assert.deepEqual(
    contract.currentRenderer.acceptedSourceExtensions,
    SOURCE_EXTENSIONS
  )
  assert.deepEqual(contract.currentRenderer.aliases, {})
  assert.deepEqual(contract.currentRenderer.mountedComponent, {
    exportName: 'App',
    renderMethod: 'render',
  })
  assert.equal(contract.retiredShell.barrelPaths[0], 'app/src/ui/md3/index.ts')
  assert.deepEqual(contract.negativeRegression.requiredDimensions, [
    'retired-path-resolution',
    'accepted-source-extensions',
    'alias-import-resolution',
    'comment-free-import-detection',
    'renderer-boundary-markers',
    'renderer-retired-imports',
    'renderer-import-bindings',
    'retired-family-reservation',
    'renderer-root-reachability',
    'renderer-public-entry-root',
    'renderer-nested-closure-scope',
    'renderer-nested-class-scope',
    'renderer-unrelated-path-scope',
    'renderer-local-symbol-calls',
    'renderer-cycle-bounds',
    'renderer-public-entry-elements',
    'renderer-dead-control-flow',
  ])
}

function rendererRecord(source: string): SourceRecord {
  return {
    path: Path.join(repoRoot, contract.currentRenderer.entry),
    source,
  }
}

describe('the interface shell stays frozen', () => {
  it('loads a complete, exact-boundary contract', () => {
    assertContractShape()
    assert.match(contract.baseline.rule, /frozen/i)
  })

  for (const name of contract.retiredShell.modulePaths) {
    it('does not reintroduce app/src/ui/md3/' + name, async () => {
      const exists = await FsAsync.access(Path.join(md3Dir, name)).then(
        () => true,
        () => false
      )
      assert.equal(
        exists,
        false,
        name +
          ' is back. The application chrome is frozen: see the frozen-shell contract in AGENTS.md.'
      )
    })
  }

  for (const name of contract.retiredShell.stylesheetPaths) {
    it('does not reintroduce app/styles/ui/' + name, async () => {
      const exists = await FsAsync.access(Path.join(stylesDir, name)).then(
        () => true,
        () => false
      )
      assert.equal(
        exists,
        false,
        name + ' is back. The application chrome is frozen: see AGENTS.md.'
      )
    })
  }

  for (const name of contract.retiredShell.barrelPaths) {
    it('reserves the retired barrel ' + name, async () => {
      const exists = await FsAsync.access(Path.join(repoRoot, name)).then(
        () => true,
        () => false
      )
      assert.equal(exists, false, name + ' is a retired shell barrel.')
    })
  }

  for (const name of contract.survivingControls) {
    it('keeps the surviving control app/src/ui/md3/' + name, async () => {
      const exists = await FsAsync.access(Path.join(md3Dir, name)).then(
        () => true,
        () => false
      )
      assert.equal(
        exists,
        true,
        name +
          ' is gone. Shared Material Design 3 controls and dialogs survive the revert deliberately.'
      )
    })
  }

  it('keeps retired shell names reserved as a family', async () => {
    const [md3Files, styleFiles] = await Promise.all([
      FsAsync.readdir(md3Dir),
      FsAsync.readdir(stylesDir),
    ])
    const issues = findRetiredFamilyIssues({
      contract,
      paths: [
        ...md3Files.map(file => Path.join(md3Dir, file)),
        ...styleFiles.map(file => Path.join(stylesDir, file)),
      ],
    })
    assert.deepEqual(issues, [], 'A retired shell family member returned.')
  })

  it('rejects static, dynamic, and require imports of retired shell modules', async () => {
    const sourceFiles = await readSourceFiles(
      Path.join(repoRoot, 'app', 'src'),
      contract.currentRenderer.acceptedSourceExtensions
    )
    const issues = findRetiredImportIssues({
      contract,
      repoRoot,
      files: sourceFiles,
    })
    assert.deepEqual(issues, [], 'A source file imports the retired shell.')
  })

  it('does not let app.tsx import a retired shell module', async () => {
    const appPath = Path.join(repoRoot, contract.currentRenderer.entry)
    const appSource = await FsAsync.readFile(appPath, 'utf8')
    const issues = findRetiredImportIssues({
      contract,
      repoRoot,
      files: [{ path: appPath, source: appSource }],
    })
    assert.deepEqual(issues, [])
  })

  it('keeps renderer shell imports within the retained control inventory', async () => {
    const appPath = Path.join(repoRoot, contract.currentRenderer.entry)
    const appSource = await FsAsync.readFile(appPath, 'utf8')
    const issues = findUnretainedRendererMd3Issues({
      contract,
      repoRoot,
      renderer: { path: appPath, source: appSource },
    })
    assert.deepEqual(issues, [])
  })

  it('records and verifies the exact revert provenance', async () => {
    assert.equal(contract.schemaVersion, 1)
    assert.equal(contract.baseline.presentation, '2026-08-07')
    assert.equal(contract.baseline.restoredOn, '2026-08-15')
    assert.match(contract.baseline.rule, /frozen/i)
    assert.equal(contract.provenance.length, 8)

    for (const entry of contract.provenance) {
      assert.match(entry.sha, /^[0-9a-f]{40}$/)
      const result = await execFileAsync(
        'git',
        ['show', '-s', '--format=%H%x00%s', entry.sha],
        { cwd: repoRoot, windowsHide: true }
      )
      const [sha, subject] = result.stdout.trim().split('\0')
      assert.equal(sha, entry.sha)
      assert.equal(subject, entry.subject)
      assert.notEqual(entry.role.trim(), '')
    }
  })

  it('keeps the current renderer entry and control-level Material Design 3 wiring', async () => {
    const appPath = Path.join(repoRoot, contract.currentRenderer.entry)
    const appSource = await FsAsync.readFile(appPath, 'utf8')
    const issues = findRendererWiringIssues({
      contract,
      renderer: rendererRecord(appSource),
    })
    assert.deepEqual(issues, [])
  })
})

/**
 * The revert took stylesheet treatments too, and nothing was watching them.
 *
 * The module list above guards files that must not come back. It cannot see a
 * property restored inside a stylesheet that legitimately survived, so on
 * 2026-09-03 an agent restored the reverted dialog, banner, toast, blank-state,
 * welcome and notification-centre treatments from `0af7ce4698` and this suite
 * stayed green the whole time.
 *
 * What made that easy was not an absent guard but a present one pointing the
 * wrong way: `overlay-material-language-test.ts` asserted the reverted styling
 * still existed, so it had been red since the revert and read as a repair
 * order. It has been deleted. These markers are its replacement, pointing the
 * way the owner actually decided.
 *
 * Each marker is anchored to a whole line, so a commented-out declaration does
 * not satisfy one, and none uses a lazy `[\s\S]*?` bridge, which reaches past
 * the rule it was written for. Every marker was checked in both directions
 * before being trusted: absent from the tree as it stands, present in
 * `0af7ce4698`.
 */
const REVERTED_STYLE_MARKERS: ReadonlyArray<{
  readonly file: string
  readonly marker: RegExp
  readonly surface: string
}> = [
  {
    file: '_banners.scss',
    surface: 'the banner tonal card',
    marker: /^\s*max-width: 920px;\s*$/m,
  },
  {
    file: '_banners.scss',
    surface: 'the banner elevation',
    marker: /^\s*box-shadow: var\(--md-sys-elevation-level1\);\s*$/m,
  },
  {
    file: 'window/_toast-notification.scss',
    surface: 'the toast snackbar offset',
    marker: /^\s*bottom: 18px;\s*$/m,
  },
  {
    file: 'window/_toast-notification.scss',
    surface: 'the toast inverse surface',
    marker: /^\s*background: var\(--md-sys-color-inverse-surface\);\s*$/m,
  },
  {
    file: '_dialog.scss',
    surface: 'the dialog high container',
    marker:
      /^\s*background: var\(--md-sys-color-surface-container-high\);\s*$/m,
  },
  {
    file: '_dialog.scss',
    surface: 'the dialog header height',
    marker: /^\s*min-height: 48px;\s*$/m,
  },
  {
    file: '_no-repositories.scss',
    surface: 'the blank-state pane radius',
    marker: /^\s*border-radius: 24px;\s*$/m,
  },
  {
    file: '_no-repositories.scss',
    surface: 'the blank-state narrow stack',
    marker: /^\s*@media screen and \(max-width: 880px\) \{\s*$/m,
  },
  {
    file: '_welcome.scss',
    surface: 'the welcome narrow block',
    marker: /^\s*@media screen and \(max-width: 420px\) \{\s*$/m,
  },
  {
    file: '_notification-centre.scss',
    surface: 'the notification panel full-bleed width',
    marker: /^\s*width: calc\(100vw - 8px\);\s*$/m,
  },
]

describe('the reverted style wave stays reverted', () => {
  for (const { file, marker, surface } of REVERTED_STYLE_MARKERS) {
    it(`does not restore ${surface} in app/styles/ui/${file}`, async () => {
      const source = await FsAsync.readFile(Path.join(stylesDir, file), 'utf8')
      assert.equal(
        marker.test(source),
        false,
        `${file} has ${surface} back. That treatment was removed by 427029d9bc, ` +
          '"Revert the interface to 2026-08-07, before both MD3 waves". The current interface is Material Design 3 already; it simply is not that ' +
          'wave. Restoring it is the third unrequested rebuild AGENTS.md warns about. If the repository owner asked for it in this session, in their own ' +
          'words, delete this entry deliberately and say so in the commit.'
      )
    })
  }

  it('keeps a marker for every surface the wave touched', () => {
    // A list-based guard only checks what is on its list, so the list itself
    // needs a floor. Six stylesheets were reverted; each must still be named.
    const covered = new Set(REVERTED_STYLE_MARKERS.map(entry => entry.file))
    for (const file of [
      '_dialog.scss',
      '_banners.scss',
      'window/_toast-notification.scss',
      '_welcome.scss',
      '_no-repositories.scss',
      '_notification-centre.scss',
    ]) {
      assert.equal(
        covered.has(file),
        true,
        `${file} was part of the reverted wave and has no marker guarding it.`
      )
    }
  })
})
