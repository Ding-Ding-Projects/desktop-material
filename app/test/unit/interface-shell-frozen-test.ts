import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import * as FsAsync from 'node:fs/promises'
import * as Path from 'node:path'
import { promisify } from 'node:util'
import * as ts from 'typescript'

type FrozenInterfaceShellContract = {
  schemaVersion: number
  baseline: {
    presentation: string
    restoredOn: string
    rule: string
  }
  changePolicy: {
    frozenBoundary: string
    allowedWithinBoundary: string[]
    requiresExplicitRequest: string
  }
  provenance: Array<{ sha: string; role: string; subject: string }>
  retiredShell: {
    barrelPaths: string[]
    modulePaths: string[]
    stylesheetPaths: string[]
    familyPrefixes: string[]
  }
  survivingControls: string[]
  currentRenderer: {
    entry: string
    imports: Array<{ binding: string; specifier: string }>
    markers: string[]
    acceptedSourceExtensions: string[]
    aliases: Record<string, string>
  }
  negativeRegression: {
    requiredDimensions: string[]
  }
}

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

const negativeDimension = process.env.FROZEN_SHELL_NEGATIVE_DIMENSION
if (negativeDimension === 'retired-path-resolution') {
  contract.retiredShell.barrelPaths[0] = 'app/src/ui/md3/not-the-retired-barrel.ts'
} else if (negativeDimension === 'accepted-source-extensions') {
  contract.currentRenderer.acceptedSourceExtensions.pop()
} else if (negativeDimension === 'alias-import-resolution') {
  contract.currentRenderer.aliases['@ui/'] = 'app/src/not-ui/'
} else if (negativeDimension === 'comment-free-import-detection') {
  contract.currentRenderer.imports[0].specifier = './not-an-import'
} else if (negativeDimension === 'renderer-boundary-markers') {
  contract.currentRenderer.markers[0] = 'id="missing-renderer-boundary"'
} else if (negativeDimension === 'renderer-retired-imports') {
  contract.currentRenderer.imports[0].specifier = './md3/md3-shell'
}

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
  assert.deepEqual(contract.currentRenderer.acceptedSourceExtensions, sourceExtensions)
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

function withoutExtension(value: string): string {
  return value.replace(/\.(?:tsx?|jsx?|mts|mjs|cts|cjs)$/i, '')
}

function repositoryRelativePath(value: string): string {
  return withoutExtension(Path.relative(repoRoot, value))
    .replace(/\\/g, '/')
    .replace(/\/index$/i, '')
    .toLowerCase()
}

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs']

function stripComments(source: string): string {
  let result = ''
  let quote: string | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (lineComment) {
      if (char === '\n') {
        lineComment = false
        result += char
      } else {
        result += ' '
      }
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        result += '  '
        index += 1
      } else {
        result += char === '\n' ? '\n' : ' '
      }
      continue
    }
    if (quote !== null) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if ((char === '/' && next === '/') || (char === '/' && next === '*')) {
      if (next === '/') lineComment = true
      else blockComment = true
      result += '  '
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    result += char
  }
  return result
}

function parseAst(source: string): ts.SourceFile {
  return ts.createSourceFile('frozen-shell.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

function parseStaticImportStatements(source: string): Array<{
  specifier: string
  statement: string
}> {
  const statements: Array<{ specifier: string; statement: string }> = []
  const sourceFile = parseAst(source)
  sourceFile.forEachChild(node => {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return
    const module = node.moduleSpecifier
    if (module && ts.isStringLiteral(module)) {
      statements.push({ specifier: module.text, statement: node.getText(sourceFile) })
    }
  })
  return statements
}

function parseDynamicImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const sourceFile = parseAst(source)
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifiers.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function parseRequireSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const sourceFile = parseAst(source)
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && ts.isIdentifier(node.expression) && node.expression.text === 'require') specifiers.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function isRetiredSpecifier(sourceFile: string, specifier: string): boolean {
  const resolved = resolveImportPath(sourceFile, specifier)
  if (resolved === null) return false
  const retiredPaths = new Set([
    ...contract.retiredShell.modulePaths.map(name => `app/src/ui/md3/${name}`),
    ...contract.retiredShell.barrelPaths.map(name => name),
    ...contract.retiredShell.stylesheetPaths.map(name => `app/styles/ui/${name}`),
  ].map(name => withoutExtension(name).replace(/\\/g, '/').toLowerCase()))
  return retiredPaths.has(repositoryRelativePath(resolved))
}

function resolveImportPath(sourceFile: string, specifier: string): string | null {
  let target = specifier
  if (!target.startsWith('.')) {
    const alias = Object.entries(contract.currentRenderer.aliases).find(([prefix]) =>
      target.startsWith(prefix)
    )
    if (alias === undefined) return null
    target = alias[1] + target.slice(alias[0].length)
  } else {
    target = Path.relative(repoRoot, Path.resolve(Path.dirname(sourceFile), target))
  }
  const base = target.replace(/\\/g, '/')
  const candidates = [base, ...sourceExtensions.map(extension => base + extension), ...sourceExtensions.map(extension => `${base}/index${extension}`)]
  for (const candidate of candidates) {
    const absolute = Path.resolve(repoRoot, candidate)
    try {
      require('node:fs').accessSync(absolute)
      return absolute
    } catch {
      continue
    }
  }
  return Path.resolve(repoRoot, base)
}

async function listTypeScriptSources(root: string): Promise<string[]> {
  const entries = await FsAsync.readdir(root, { recursive: true })
  return entries
    .filter(entry => /\.(?:ts|tsx|js|jsx|mts|mjs|cts|cjs)$/i.test(entry))
    .map(entry => Path.join(root, entry))
}

async function readSourceFiles(root: string): Promise<
  Array<{ path: string; source: string }>
> {
  const paths = await listTypeScriptSources(root)
  const files = await Promise.all(
    paths.map(async path => ({
      path,
      source: await FsAsync.readFile(path, 'utf8'),
    }))
  )
  if (negativeDimension === 'alias-import-resolution') {
    files.push({ path: Path.join(root, 'alias-import.js'), source: "import './md3/md3-shell'" })
  } else if (negativeDimension === 'accepted-source-extensions') {
    files.push({ path: Path.join(root, 'js-family.js'), source: "import './md3/md3-shell'" })
  } else if (negativeDimension === 'comment-free-import-detection') {
    files.push({ path: Path.join(root, 'comment-evasion.ts'), source: "/* import './md3/md3-shell' */" })
  }
  return files
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
      const stem = withoutExtension(file.replace(/^_/, '')).toLowerCase()
      return contract.retiredShell.familyPrefixes.some(prefix =>
        stem.startsWith(prefix.toLowerCase())
      )
    })
    assert.deepEqual(offenders, [], 'A retired shell family member returned.')
  })

  it('rejects static, dynamic, and require imports of retired shell modules', async () => {
    const sourceFiles = await readSourceFiles(Path.join(repoRoot, 'app', 'src'))
    const offenders: string[] = []
    for (const item of sourceFiles) {
      for (const entry of parseStaticImportStatements(item.source)) {
        if (isRetiredSpecifier(item.path, entry.specifier)) {
          offenders.push(item.path + ': ' + entry.statement)
        }
      }
      for (const specifier of [
        ...parseDynamicImportSpecifiers(item.source),
        ...parseRequireSpecifiers(item.source),
      ]) {
        if (isRetiredSpecifier(item.path, specifier)) {
          offenders.push(item.path + ': ' + specifier)
        }
      }
    }
    assert.deepEqual(offenders, [], 'A source file imports the retired shell.')
  })

  it('does not let app.tsx import a retired shell module', async () => {
    const appPath = Path.join(repoRoot, contract.currentRenderer.entry)
    const appSource = await FsAsync.readFile(appPath, 'utf8')
    const offenders = parseStaticImportStatements(appSource)
      .filter(({ specifier }) => isRetiredSpecifier(appPath, specifier))
      .map(({ specifier }) => specifier)
    assert.deepEqual(offenders, [])
  })

  it('keeps renderer shell imports within the retained control inventory', async () => {
    const appPath = Path.join(repoRoot, contract.currentRenderer.entry)
    const appSource = await FsAsync.readFile(appPath, 'utf8')
    const retained = new Set(
      contract.survivingControls.map(name =>
        withoutExtension(`app/src/ui/md3/${name}`)
          .replace(/\\/g, '/')
          .toLowerCase()
      )
    )
    const importedMd3Paths = parseStaticImportStatements(appSource)
      .map(({ specifier }) => resolveImportPath(appPath, specifier))
      .filter((resolved): resolved is string => resolved !== null)
      .map(repositoryRelativePath)
      .filter(path => path.startsWith('app/src/ui/md3/'))
    assert.ok(importedMd3Paths.length > 0)
    assert.deepEqual(importedMd3Paths.filter(path => !retained.has(path)), [])
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
    const imports = parseStaticImportStatements(appSource)

    for (const expected of contract.currentRenderer.imports) {
      const matching = imports.find(
        ({ specifier, statement }) =>
          specifier === expected.specifier &&
          new RegExp(
            '\\b' + escapeRegExp(expected.binding) + '\\b'
          ).test(statement)
      )
      assert.ok(
        matching,
        'Current renderer import ' +
          expected.binding +
          ' from ' +
          expected.specifier +
          ' is missing.'
      )
    }

    const lines = parseAst(appSource).statements.map(statement => statement.getText())
    assert.ok(lines.some(line => line.trim() === 'private renderApp() {'))
    for (const marker of contract.currentRenderer.markers) {
      assert.ok(
        lines.some(line => line.includes(marker) && line.trim().length > 0),
        'Current renderer marker ' + marker + ' is missing.'
      )
    }
  })
})
