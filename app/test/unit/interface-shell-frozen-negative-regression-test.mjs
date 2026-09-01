import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const validatorModule = await import('./interface-shell-frozen-validator.ts')
const validator =
  validatorModule.default ??
  validatorModule['module.exports'] ??
  validatorModule
const {
  SOURCE_EXTENSIONS,
  findRendererWiringIssues,
  findRetiredImportIssues,
  readSourceFiles,
} = validator

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const contractPath = join(
  root,
  'app',
  'test',
  'fixtures',
  'frozen-interface-shell-contract.json'
)
const contract = JSON.parse(await readFile(contractPath, 'utf8'))
const realRendererSource = await readFile(
  join(root, contract.currentRenderer.entry),
  'utf8'
)
const dimensions = [
  'retired-path-resolution',
  'accepted-source-extensions',
  'alias-import-resolution',
  'comment-free-import-detection',
  'renderer-boundary-markers',
  'renderer-retired-imports',
]

assert.deepEqual(contract.negativeRegression.requiredDimensions, dimensions)

const temporaryRoot = await mkdtemp(join(tmpdir(), 'frozen-shell-negative-'))
const sourceRoot = join(temporaryRoot, 'app', 'src')
const rendererPath = join(temporaryRoot, contract.currentRenderer.entry)
const retiredModulePath = join(sourceRoot, 'ui', 'md3', 'md3-shell.tsx')
const retiredBarrelPath = join(sourceRoot, 'ui', 'md3', 'index.ts')

async function writeSource(path, source) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, source, 'utf8')
}

async function sourceInventory(activeContract = contract) {
  const files = await readSourceFiles(
    sourceRoot,
    activeContract.currentRenderer.acceptedSourceExtensions
  )
  return files.filter(file => file.path !== rendererPath)
}

async function retiredImportIssues(activeContract = contract) {
  return findRetiredImportIssues({
    contract: activeContract,
    repoRoot: temporaryRoot,
    files: await sourceInventory(activeContract),
  })
}

function assertOnlyIssueCode(issues, code, label) {
  assert.ok(issues.length > 0, `${label} stayed green`)
  assert.ok(
    issues.every(issue => issue.code === code),
    `${label} reached the wrong validator: ${JSON.stringify(issues)}`
  )
}

async function assertRetiredImportsGreen(label, activeContract = contract) {
  assert.deepEqual(
    await retiredImportIssues(activeContract),
    [],
    `${label} must be green`
  )
}

async function ensureRetiredModule() {
  await writeSource(retiredModulePath, 'export {}\n')
}

async function ensureRetiredBarrel() {
  await writeSource(retiredBarrelPath, 'export {}\n')
}

async function removeIfPresent(path) {
  await unlink(path).catch(error => {
    if (error?.code !== 'ENOENT') throw error
  })
}

try {
  await writeSource(rendererPath, realRendererSource)
  await assertRetiredImportsGreen('untouched frozen-shell import contract')
  assert.deepEqual(
    findRetiredImportIssues({
      contract,
      repoRoot: temporaryRoot,
      files: [{ path: rendererPath, source: realRendererSource }],
    }),
    [],
    'untouched renderer retired-import contract must be green'
  )
  assert.deepEqual(
    findRendererWiringIssues({
      contract,
      renderer: { path: rendererPath, source: realRendererSource },
    }),
    [],
    'untouched frozen-shell renderer contract must be green'
  )

  const pathProbe = join(sourceRoot, 'retired-path-probe.ts')
  await ensureRetiredBarrel()
  await writeSource(
    pathProbe,
    [
      "import './ui/md3'",
      "void import('./ui/md3/index')",
      "require('./ui/md3')",
      '',
    ].join('\n')
  )
  const pathIssues = await retiredImportIssues()
  assert.equal(
    pathIssues.length,
    3,
    'retired-path-resolution must reach static, dynamic, and require inspection'
  )
  assertOnlyIssueCode(pathIssues, 'retired-import', 'retired-path-resolution')
  await removeIfPresent(pathProbe)
  await removeIfPresent(retiredBarrelPath)
  await assertRetiredImportsGreen('retired-path-resolution restored')
  console.log('retired-path-resolution: green -> red(retired-import) -> green')

  await ensureRetiredModule()
  for (const extension of SOURCE_EXTENSIONS) {
    const extensionProbe = join(
      sourceRoot,
      `accepted-source-extension-probe${extension}`
    )
    const importSource =
      extension === '.cjs' || extension === '.cts'
        ? "require('./ui/md3/md3-shell')\n"
        : "import './ui/md3/md3-shell'\n"
    await writeSource(extensionProbe, importSource)
    const extensionIssues = await retiredImportIssues()
    assertOnlyIssueCode(
      extensionIssues,
      'retired-import',
      `accepted-source-extensions ${extension}`
    )
    assert.ok(
      extensionIssues.some(issue => issue.path === extensionProbe),
      `accepted-source-extensions did not inventory ${extension}`
    )
    await removeIfPresent(extensionProbe)
    await assertRetiredImportsGreen(
      `accepted-source-extensions ${extension} restored`
    )
  }
  await removeIfPresent(retiredModulePath)
  console.log(
    `accepted-source-extensions: ${SOURCE_EXTENSIONS.length} green -> red(retired-import) -> green transitions`
  )

  const aliasContract = structuredClone(contract)
  aliasContract.currentRenderer.aliases['@ui/'] = 'app/src/ui/'
  const aliasProbe = join(sourceRoot, 'alias-import-probe.mjs')
  await ensureRetiredModule()
  await writeSource(aliasProbe, "import '@ui/md3/md3-shell'\n")
  assertOnlyIssueCode(
    await retiredImportIssues(aliasContract),
    'retired-import',
    'alias-import-resolution'
  )
  await removeIfPresent(aliasProbe)
  await removeIfPresent(retiredModulePath)
  await assertRetiredImportsGreen(
    'alias-import-resolution restored',
    aliasContract
  )
  console.log('alias-import-resolution: green -> red(retired-import) -> green')

  const commentProbe = join(sourceRoot, 'comment-import-probe.ts')
  const commentedImport = "/* import './ui/md3/md3-shell' */\n"
  await ensureRetiredModule()
  await writeSource(commentProbe, commentedImport)
  await assertRetiredImportsGreen(
    'comment-free-import-detection comment baseline'
  )
  await writeSource(commentProbe, "import './ui/md3/md3-shell'\n")
  assertOnlyIssueCode(
    await retiredImportIssues(),
    'retired-import',
    'comment-free-import-detection'
  )
  await writeSource(commentProbe, commentedImport)
  await assertRetiredImportsGreen('comment-free-import-detection restored')
  await removeIfPresent(commentProbe)
  await removeIfPresent(retiredModulePath)
  console.log(
    'comment-free-import-detection: green(comment) -> red(actual import) -> green(comment)'
  )

  const rendererMarker = contract.currentRenderer.markers[0]
  const mutatedRendererSource = realRendererSource.replace(
    rendererMarker,
    'id="desktop-app-contents-negative-probe"'
  )
  assert.notEqual(
    mutatedRendererSource,
    realRendererSource,
    'renderer-boundary-markers mutation must alter the actual renderer source'
  )
  await writeSource(rendererPath, mutatedRendererSource)
  const markerIssues = findRendererWiringIssues({
    contract,
    renderer: { path: rendererPath, source: mutatedRendererSource },
  })
  assertOnlyIssueCode(
    markerIssues,
    'missing-renderer-marker',
    'renderer-boundary-markers'
  )
  assert.ok(
    markerIssues.some(issue => issue.detail === rendererMarker),
    'renderer-boundary-markers must report the exact removed marker'
  )
  await writeSource(rendererPath, realRendererSource)
  assert.deepEqual(
    findRendererWiringIssues({
      contract,
      renderer: { path: rendererPath, source: realRendererSource },
    }),
    [],
    'renderer-boundary-markers restored must be green'
  )
  console.log(
    'renderer-boundary-markers: green -> red(missing-renderer-marker) -> green'
  )

  await ensureRetiredModule()
  const rendererWithRetiredImport =
    "import './md3/md3-shell'\n" + realRendererSource
  await writeSource(rendererPath, rendererWithRetiredImport)
  assertOnlyIssueCode(
    findRetiredImportIssues({
      contract,
      repoRoot: temporaryRoot,
      files: [{ path: rendererPath, source: rendererWithRetiredImport }],
    }),
    'retired-import',
    'renderer-retired-imports'
  )
  await writeSource(rendererPath, realRendererSource)
  await removeIfPresent(retiredModulePath)
  assert.deepEqual(
    findRetiredImportIssues({
      contract,
      repoRoot: temporaryRoot,
      files: [{ path: rendererPath, source: realRendererSource }],
    }),
    [],
    'renderer-retired-imports restored must be green'
  )
  console.log('renderer-retired-imports: green -> red(retired-import) -> green')

  await assertRetiredImportsGreen('restored frozen-shell import contract')
  assert.deepEqual(
    findRetiredImportIssues({
      contract,
      repoRoot: temporaryRoot,
      files: [{ path: rendererPath, source: realRendererSource }],
    }),
    [],
    'restored renderer retired-import contract must be green'
  )
  assert.deepEqual(
    findRendererWiringIssues({
      contract,
      renderer: { path: rendererPath, source: realRendererSource },
    }),
    [],
    'restored frozen-shell renderer contract must be green'
  )
  console.log(
    `registered frozen-shell red-green runner covered ${dimensions.length} dimensions`
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
