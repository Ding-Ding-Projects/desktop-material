import { accessSync } from 'node:fs'
import * as FsAsync from 'node:fs/promises'
import * as Path from 'node:path'
import * as ts from 'typescript'

export type FrozenInterfaceShellContract = {
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
    rootElement: RendererElementContract
    requiredElements: RendererElementContract[]
    acceptedSourceExtensions: string[]
    aliases: Record<string, string>
  }
  negativeRegression: {
    requiredDimensions: string[]
  }
}

export type SourceRecord = {
  path: string
  source: string
}

export type RendererElementContract = {
  tag: string
  attributes?: Record<string, string>
}

export type StaticImportRecord = {
  specifier: string
  statement: string
  bindings: string[]
}

export type FrozenShellValidationIssue = {
  code:
    | 'retired-import'
    | 'retired-family-member'
    | 'missing-renderer-import'
    | 'missing-renderer-element'
    | 'missing-renderer-root'
    | 'unretained-renderer-md3-import'
  path: string
  detail: string
}

export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const

export function withoutSourceExtension(value: string): string {
  return value.replace(/\.(?:tsx?|jsx?|mts|mjs|cts|cjs)$/i, '')
}

export function repositoryRelativePath(
  repoRoot: string,
  value: string
): string {
  return normalizeRepositoryRelativePath(Path.relative(repoRoot, value))
}

function normalizeRepositoryRelativePath(value: string): string {
  return withoutSourceExtension(value)
    .replace(/\\/g, '/')
    .replace(/\/index$/i, '')
    .toLowerCase()
}

function parseAst(source: string): ts.SourceFile {
  return ts.createSourceFile(
    'frozen-shell.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
}

export function parseStaticImportStatements(
  source: string
): StaticImportRecord[] {
  const statements: StaticImportRecord[] = []
  const sourceFile = parseAst(source)
  sourceFile.forEachChild(node => {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) {
      return
    }
    const module = node.moduleSpecifier
    if (module && ts.isStringLiteral(module)) {
      const bindings: string[] = []
      if (ts.isImportDeclaration(node) && node.importClause !== undefined) {
        const importClause = node.importClause
        if (importClause.name !== undefined) {
          bindings.push(importClause.name.text)
        }
        const namedBindings = importClause.namedBindings
        if (namedBindings !== undefined) {
          if (ts.isNamespaceImport(namedBindings)) {
            bindings.push(namedBindings.name.text)
          } else {
            bindings.push(...namedBindings.elements.map(item => item.name.text))
          }
        }
      }
      statements.push({
        specifier: module.text,
        statement: node.getText(sourceFile),
        bindings,
      })
    }
  })
  return statements
}

export function findRetiredFamilyIssues(options: {
  contract: FrozenInterfaceShellContract
  paths: readonly string[]
}): FrozenShellValidationIssue[] {
  const prefixes = options.contract.retiredShell.familyPrefixes.map(prefix =>
    prefix.toLowerCase()
  )
  return options.paths.flatMap(path => {
    const stem = withoutSourceExtension(Path.basename(path).replace(/^_/, ''))
      .toLowerCase()
      .replace(/\\/g, '/')
    if (!prefixes.some(prefix => stem.startsWith(prefix))) {
      return []
    }
    return [
      {
        code: 'retired-family-member' as const,
        path,
        detail: stem,
      },
    ]
  })
}

export function parseDynamicImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const sourceFile = parseAst(source)
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

export function parseRequireSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const sourceFile = parseAst(source)
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function normalizedRetiredPaths(
  contract: FrozenInterfaceShellContract
): Set<string> {
  return new Set(
    [
      ...contract.retiredShell.modulePaths.map(
        name => `app/src/ui/md3/${name}`
      ),
      ...contract.retiredShell.barrelPaths,
      ...contract.retiredShell.stylesheetPaths.map(
        name => `app/styles/ui/${name}`
      ),
    ].map(normalizeRepositoryRelativePath)
  )
}

export function resolveImportPath(options: {
  contract: FrozenInterfaceShellContract
  repoRoot: string
  sourceFile: string
  specifier: string
}): string | null {
  const { contract, repoRoot, sourceFile, specifier } = options
  let target = specifier
  if (!target.startsWith('.')) {
    const alias = Object.entries(contract.currentRenderer.aliases).find(
      ([prefix]) => target.startsWith(prefix)
    )
    if (alias === undefined) {
      return null
    }
    target = alias[1] + target.slice(alias[0].length)
  } else {
    target = Path.relative(
      repoRoot,
      Path.resolve(Path.dirname(sourceFile), target)
    )
  }

  const base = target.replace(/\\/g, '/')
  const extensions = contract.currentRenderer.acceptedSourceExtensions
  const candidates = [
    base,
    ...extensions.map(extension => base + extension),
    ...extensions.map(extension => `${base}/index${extension}`),
  ]
  for (const candidate of candidates) {
    const absolute = Path.resolve(repoRoot, candidate)
    try {
      accessSync(absolute)
      return absolute
    } catch {
      continue
    }
  }
  return Path.resolve(repoRoot, base)
}

export function isRetiredSpecifier(options: {
  contract: FrozenInterfaceShellContract
  repoRoot: string
  sourceFile: string
  specifier: string
}): boolean {
  const resolved = resolveImportPath(options)
  if (resolved === null) {
    return false
  }
  return normalizedRetiredPaths(options.contract).has(
    repositoryRelativePath(options.repoRoot, resolved)
  )
}

export async function listSourceFiles(
  root: string,
  acceptedSourceExtensions: readonly string[]
): Promise<string[]> {
  const accepted = new Set(
    acceptedSourceExtensions.map(extension => extension.toLowerCase())
  )
  const entries = await FsAsync.readdir(root, { recursive: true })
  return entries
    .filter(entry => accepted.has(Path.extname(entry).toLowerCase()))
    .map(entry => Path.join(root, entry))
}

export async function readSourceFiles(
  root: string,
  acceptedSourceExtensions: readonly string[]
): Promise<SourceRecord[]> {
  const paths = await listSourceFiles(root, acceptedSourceExtensions)
  return Promise.all(
    paths.map(async path => ({
      path,
      source: await FsAsync.readFile(path, 'utf8'),
    }))
  )
}

export function findRetiredImportIssues(options: {
  contract: FrozenInterfaceShellContract
  repoRoot: string
  files: readonly SourceRecord[]
}): FrozenShellValidationIssue[] {
  const issues: FrozenShellValidationIssue[] = []
  for (const item of options.files) {
    const staticImports = parseStaticImportStatements(item.source)
    for (const entry of staticImports) {
      if (
        isRetiredSpecifier({
          contract: options.contract,
          repoRoot: options.repoRoot,
          sourceFile: item.path,
          specifier: entry.specifier,
        })
      ) {
        issues.push({
          code: 'retired-import',
          path: item.path,
          detail: entry.statement,
        })
      }
    }
    for (const specifier of [
      ...parseDynamicImportSpecifiers(item.source),
      ...parseRequireSpecifiers(item.source),
    ]) {
      if (
        isRetiredSpecifier({
          contract: options.contract,
          repoRoot: options.repoRoot,
          sourceFile: item.path,
          specifier,
        })
      ) {
        issues.push({
          code: 'retired-import',
          path: item.path,
          detail: specifier,
        })
      }
    }
  }
  return issues
}

export function findUnretainedRendererMd3Issues(options: {
  contract: FrozenInterfaceShellContract
  repoRoot: string
  renderer: SourceRecord
}): FrozenShellValidationIssue[] {
  const retained = new Set(
    options.contract.survivingControls.map(name =>
      withoutSourceExtension(`app/src/ui/md3/${name}`)
        .replace(/\\/g, '/')
        .toLowerCase()
    )
  )
  const importedMd3Paths = parseStaticImportStatements(options.renderer.source)
    .map(({ specifier }) =>
      resolveImportPath({
        contract: options.contract,
        repoRoot: options.repoRoot,
        sourceFile: options.renderer.path,
        specifier,
      })
    )
    .filter((resolved): resolved is string => resolved !== null)
    .map(resolved => repositoryRelativePath(options.repoRoot, resolved))
    .filter(path => path.startsWith('app/src/ui/md3/'))

  return importedMd3Paths
    .filter(path => !retained.has(path))
    .map(path => ({
      code: 'unretained-renderer-md3-import' as const,
      path: options.renderer.path,
      detail: path,
    }))
}

type ParsedRendererElement = {
  tag: string
  attributes: ReadonlyMap<string, string>
}

function parseRendererElements(
  sourceFile: ts.SourceFile
): ParsedRendererElement[] {
  const elements: ParsedRendererElement[] = []
  const recordOpening = (
    opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement
  ) => {
    const attributes = new Map<string, string>()
    for (const property of opening.attributes.properties) {
      if (!ts.isJsxAttribute(property)) {
        continue
      }
      const initializer = property.initializer
      if (initializer !== undefined && ts.isStringLiteral(initializer)) {
        attributes.set(property.name.getText(sourceFile), initializer.text)
      }
    }
    elements.push({
      tag: opening.tagName.getText(sourceFile),
      attributes,
    })
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      recordOpening(node.openingElement)
    } else if (ts.isJsxSelfClosingElement(node)) {
      recordOpening(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return elements
}

function rendererElementMatches(
  actual: ParsedRendererElement,
  expected: RendererElementContract
): boolean {
  if (actual.tag !== expected.tag) {
    return false
  }
  return Object.entries(expected.attributes ?? {}).every(
    ([name, value]) => actual.attributes.get(name) === value
  )
}

function rendererElementDetail(expected: RendererElementContract): string {
  const attributes = Object.entries(expected.attributes ?? {})
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(' ')
  return attributes === '' ? expected.tag : `${expected.tag} ${attributes}`
}

export function findRendererWiringIssues(options: {
  contract: FrozenInterfaceShellContract
  renderer: SourceRecord
}): FrozenShellValidationIssue[] {
  const { contract, renderer } = options
  const issues: FrozenShellValidationIssue[] = []
  const sourceFile = parseAst(renderer.source)
  const imports = parseStaticImportStatements(renderer.source)
  const elements = parseRendererElements(sourceFile)

  for (const expected of contract.currentRenderer.imports) {
    const matching = imports.find(
      ({ specifier, bindings }) =>
        specifier === expected.specifier && bindings.includes(expected.binding)
    )
    if (matching === undefined) {
      issues.push({
        code: 'missing-renderer-import',
        path: renderer.path,
        detail: `${expected.binding} from ${expected.specifier}`,
      })
    }
  }

  if (
    !elements.some(element =>
      rendererElementMatches(element, contract.currentRenderer.rootElement)
    )
  ) {
    issues.push({
      code: 'missing-renderer-root',
      path: renderer.path,
      detail: rendererElementDetail(contract.currentRenderer.rootElement),
    })
  }
  for (const expected of contract.currentRenderer.requiredElements) {
    if (!elements.some(element => rendererElementMatches(element, expected))) {
      issues.push({
        code: 'missing-renderer-element',
        path: renderer.path,
        detail: rendererElementDetail(expected),
      })
    }
  }
  return issues
}
