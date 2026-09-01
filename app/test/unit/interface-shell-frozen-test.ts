import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import * as FsAsync from 'node:fs/promises'
import * as Path from 'node:path'
import { promisify } from 'node:util'

import {
  SOURCE_EXTENSIONS,
  findRendererWiringIssues,
  findRetiredImportIssues,
  findUnretainedRendererMd3Issues,
  readSourceFiles,
  withoutSourceExtension,
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
  assert.equal(contract.retiredShell.barrelPaths[0], 'app/src/ui/md3/index.ts')
  assert.deepEqual(contract.negativeRegression.requiredDimensions, [
    'retired-path-resolution',
    'accepted-source-extensions',
    'alias-import-resolution',
    'comment-free-import-detection',
    'renderer-boundary-markers',
    'renderer-retired-imports',
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
    const offenders = [...md3Files, ...styleFiles].filter(file => {
      const stem = withoutSourceExtension(file.replace(/^_/, '')).toLowerCase()
      return contract.retiredShell.familyPrefixes.some(prefix =>
        stem.startsWith(prefix.toLowerCase())
      )
    })
    assert.deepEqual(offenders, [], 'A retired shell family member returned.')
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
