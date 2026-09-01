import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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
  findRetiredFamilyIssues,
  findRetiredImportIssues,
  parseStaticImportStatements,
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
  'renderer-import-bindings',
  'retired-family-reservation',
  'renderer-root-reachability',
]

assert.deepEqual(contract.negativeRegression.requiredDimensions, dimensions)

const temporaryRoot = await mkdtemp(join(tmpdir(), 'frozen-shell-negative-'))
const sourceRoot = join(temporaryRoot, 'app', 'src')
const md3Root = join(sourceRoot, 'ui', 'md3')
const stylesRoot = join(temporaryRoot, 'app', 'styles', 'ui')
const rendererPath = join(temporaryRoot, contract.currentRenderer.entry)
const retiredModulePath = join(md3Root, 'md3-shell.tsx')
const retiredBarrelPath = join(md3Root, 'index.ts')

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

async function retiredFamilyIssues() {
  await Promise.all([
    mkdir(md3Root, { recursive: true }),
    mkdir(stylesRoot, { recursive: true }),
  ])
  const [moduleFiles, styleFiles] = await Promise.all([
    readdir(md3Root),
    readdir(stylesRoot),
  ])
  return findRetiredFamilyIssues({
    contract,
    paths: [
      ...moduleFiles.map(file => join(md3Root, file)),
      ...styleFiles.map(file => join(stylesRoot, file)),
    ],
  })
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

  const rendererRootId = contract.currentRenderer.rootElement.attributes.id
  const rendererRootLiteral = `id="${rendererRootId}"`
  const mutatedRendererSource = realRendererSource.replace(
    rendererRootLiteral,
    `id="${rendererRootId}-negative-probe"`
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
    'missing-renderer-root',
    'renderer-boundary-markers'
  )
  assert.ok(
    markerIssues.some(issue =>
      issue.detail.includes(`id=${JSON.stringify(rendererRootId)}`)
    ),
    'renderer-boundary-markers must report the exact root id'
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

  const toolbarContract = contract.currentRenderer.requiredElements.find(
    element => element.tag === 'Toolbar'
  )
  assert.ok(toolbarContract, 'Toolbar must remain in the renderer contract')
  const toolbarId = toolbarContract.attributes.id
  const toolbarLiteral = `id="${toolbarId}"`
  const rendererWithoutToolbarBoundary = realRendererSource.replace(
    toolbarLiteral,
    `id="${toolbarId}-negative-probe"`
  )
  assert.notEqual(
    rendererWithoutToolbarBoundary,
    realRendererSource,
    'renderer-boundary-markers must alter the exact Toolbar id'
  )
  const toolbarIssues = findRendererWiringIssues({
    contract,
    renderer: { path: rendererPath, source: rendererWithoutToolbarBoundary },
  })
  assertOnlyIssueCode(
    toolbarIssues,
    'missing-renderer-element',
    'renderer-boundary-markers Toolbar structure'
  )
  assert.ok(
    toolbarIssues.some(issue => issue.detail.includes('Toolbar')),
    'renderer-boundary-markers must report the missing Toolbar structure'
  )
  assert.deepEqual(
    findRendererWiringIssues({
      contract,
      renderer: { path: rendererPath, source: realRendererSource },
    }),
    [],
    'renderer-boundary-markers Toolbar restoration must be green'
  )
  console.log(
    'renderer-boundary-markers: green -> red(missing-renderer-root) -> green -> red(missing-renderer-element) -> green'
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

  const bindingForms = parseStaticImportStatements(
    [
      "import DefaultBinding from './default-binding'",
      "import * as NamespaceBinding from './namespace-binding'",
      "import { OriginalBinding as NamedBinding } from './named-binding'",
      '',
    ].join('\n')
  )
  assert.deepEqual(
    bindingForms.map(item => ({
      specifier: item.specifier,
      bindings: item.bindings,
    })),
    [
      { specifier: './default-binding', bindings: ['DefaultBinding'] },
      { specifier: './namespace-binding', bindings: ['NamespaceBinding'] },
      { specifier: './named-binding', bindings: ['NamedBinding'] },
    ],
    'renderer-import-bindings must read default, namespace, and named bindings from the import clause'
  )
  const realTabImport =
    "import { RepositoryTabStrip } from './repository-tabs/repository-tab-strip'"
  const fakeCommentTabImport =
    "import { /* RepositoryTabStrip */ } from './repository-tabs/repository-tab-strip'"
  const rendererWithFakeCommentBinding = realRendererSource.replace(
    realTabImport,
    fakeCommentTabImport
  )
  assert.notEqual(
    rendererWithFakeCommentBinding,
    realRendererSource,
    'renderer-import-bindings must replace the active import clause'
  )
  const bindingIssues = findRendererWiringIssues({
    contract,
    renderer: {
      path: rendererPath,
      source: rendererWithFakeCommentBinding,
    },
  })
  assertOnlyIssueCode(
    bindingIssues,
    'missing-renderer-import',
    'renderer-import-bindings'
  )
  assert.ok(
    bindingIssues.some(issue =>
      issue.detail.includes(
        'RepositoryTabStrip from ./repository-tabs/repository-tab-strip'
      )
    ),
    'renderer-import-bindings must report the binding hidden behind the comment'
  )
  assert.deepEqual(
    findRendererWiringIssues({
      contract,
      renderer: { path: rendererPath, source: realRendererSource },
    }),
    [],
    'renderer-import-bindings restored must be green'
  )
  console.log(
    'renderer-import-bindings: default/namespace/named parsed -> red(active inner-comment fake) -> green'
  )

  assert.deepEqual(
    await retiredFamilyIssues(),
    [],
    'retired-family-reservation baseline must be green'
  )
  const renamedFamilyModule = join(md3Root, 'md3-shell-renamed-p0.tsx')
  await writeSource(renamedFamilyModule, 'export {}\n')
  const familyModuleIssues = await retiredFamilyIssues()
  assertOnlyIssueCode(
    familyModuleIssues,
    'retired-family-member',
    'retired-family-reservation module'
  )
  assert.ok(
    familyModuleIssues.some(issue => issue.path === renamedFamilyModule),
    'retired-family-reservation must report the fresh renamed module'
  )
  await removeIfPresent(renamedFamilyModule)
  assert.deepEqual(
    await retiredFamilyIssues(),
    [],
    'retired-family-reservation module restoration must be green'
  )
  const renamedFamilyStylesheet = join(stylesRoot, '_md3-shell-renamed-p1.scss')
  await writeSource(renamedFamilyStylesheet, '.probe {}\n')
  const familyStylesheetIssues = await retiredFamilyIssues()
  assertOnlyIssueCode(
    familyStylesheetIssues,
    'retired-family-member',
    'retired-family-reservation stylesheet'
  )
  assert.ok(
    familyStylesheetIssues.some(
      issue => issue.path === renamedFamilyStylesheet
    ),
    'retired-family-reservation must report the fresh renamed stylesheet'
  )
  await removeIfPresent(renamedFamilyStylesheet)
  assert.deepEqual(
    await retiredFamilyIssues(),
    [],
    'retired-family-reservation stylesheet restoration must be green'
  )
  console.log(
    'retired-family-reservation: green -> red(module) -> green -> red(stylesheet) -> green'
  )

  const rootBoundTabCall = '{this.renderRepositoryTabStrip()}'
  const rendererWithUnreachableTabHelper = realRendererSource.replace(
    rootBoundTabCall,
    '{null /* renderer-root-reachability probe */}'
  )
  assert.notEqual(
    rendererWithUnreachableTabHelper,
    realRendererSource,
    'renderer-root-reachability must remove the actual root-bound call'
  )
  assert.ok(
    rendererWithUnreachableTabHelper.includes('<RepositoryTabStrip'),
    'renderer-root-reachability must retain identical JSX in the unreachable helper'
  )
  const reachabilityIssues = findRendererWiringIssues({
    contract,
    renderer: {
      path: rendererPath,
      source: rendererWithUnreachableTabHelper,
    },
  })
  assertOnlyIssueCode(
    reachabilityIssues,
    'missing-renderer-element',
    'renderer-root-reachability'
  )
  assert.ok(
    reachabilityIssues.some(issue => issue.detail === 'RepositoryTabStrip'),
    'renderer-root-reachability must report the unreachable RepositoryTabStrip'
  )
  assert.deepEqual(
    findRendererWiringIssues({
      contract,
      renderer: { path: rendererPath, source: realRendererSource },
    }),
    [],
    'renderer-root-reachability restored must be green'
  )
  console.log(
    'renderer-root-reachability: green -> red(unreachable helper decoy retained) -> green'
  )

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
