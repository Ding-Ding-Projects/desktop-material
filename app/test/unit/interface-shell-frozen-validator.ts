import assert from 'node:assert'
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
    mountedComponent: {
      exportName: string
      renderMethod: string
    }
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
    | 'renderer-call-ambiguous'
    | 'renderer-call-unresolved'
    | 'renderer-dead-path-only'
    | 'renderer-entry-ambiguous'
    | 'renderer-reachability-bound'
    | 'renderer-root-ambiguous'
    | 'renderer-root-unreachable'
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

type RendererReachability = {
  deadElements: ParsedRendererElement[]
  elements: ParsedRendererElement[]
  issues: FrozenShellValidationIssue[]
}

const MAX_REACHABLE_RENDER_FUNCTIONS = 2_048
const MAX_REACHABLE_RENDER_CALLS = 16_384

function parseRendererElement(
  sourceFile: ts.SourceFile,
  opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement
): ParsedRendererElement {
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
  return {
    tag: opening.tagName.getText(sourceFile),
    attributes,
  }
}

function isFunctionNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
}

function createRendererProgram(source: string): {
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
} {
  const fileName = 'frozen-shell.tsx'
  const compilerOptions: ts.CompilerOptions = {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  }
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const host: ts.CompilerHost = {
    fileExists: name => name === fileName,
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => '',
    getDefaultLibFileName: () => 'lib.d.ts',
    getNewLine: () => '\n',
    getSourceFile: name => (name === fileName ? sourceFile : undefined),
    readFile: name => (name === fileName ? source : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  }
  const program = ts.createProgram([fileName], compilerOptions, host)
  const boundSourceFile = program.getSourceFile(fileName)
  assert.ok(
    boundSourceFile,
    'Renderer source must bind into its analysis program'
  )
  return { sourceFile: boundSourceFile, checker: program.getTypeChecker() }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? ts.getModifiers(node)?.some(modifier => modifier.kind === kind) ?? false
    : false
}

function findRendererEntry(options: {
  contract: FrozenInterfaceShellContract
  sourceFile: ts.SourceFile
}): ts.MethodDeclaration[] {
  const { exportName, renderMethod } =
    options.contract.currentRenderer.mountedComponent
  return options.sourceFile.statements.flatMap(statement => {
    if (
      !ts.isClassDeclaration(statement) ||
      statement.name?.text !== exportName ||
      !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      return []
    }
    return statement.members.filter(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) &&
        member.body !== undefined &&
        ts.isIdentifier(member.name) &&
        member.name.text === renderMethod &&
        !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(member, ts.SyntaxKind.ProtectedKeyword) &&
        !hasModifier(member, ts.SyntaxKind.StaticKeyword)
    )
  })
}

function unwrapCallableExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

type CallableResolution = {
  implementations: ts.FunctionLikeDeclaration[]
  unresolvedSameFileCandidate: boolean
}

function implementationFromDeclaration(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  seenSymbols: Set<ts.Symbol>
): CallableResolution {
  if (declaration.getSourceFile() !== sourceFile) {
    return { implementations: [], unresolvedSameFileCandidate: false }
  }
  if (isFunctionNode(declaration)) {
    return declaration.body === undefined
      ? { implementations: [], unresolvedSameFileCandidate: true }
      : { implementations: [declaration], unresolvedSameFileCandidate: false }
  }
  if (
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyDeclaration(declaration)
  ) {
    if (declaration.initializer === undefined) {
      return { implementations: [], unresolvedSameFileCandidate: true }
    }
    const initializer = unwrapCallableExpression(declaration.initializer)
    if (
      ts.isArrowFunction(initializer) ||
      ts.isFunctionExpression(initializer)
    ) {
      return {
        implementations: [initializer],
        unresolvedSameFileCandidate: false,
      }
    }
    const symbol = checker.getSymbolAtLocation(initializer)
    if (symbol !== undefined) {
      return implementationsFromSymbol(symbol, checker, sourceFile, seenSymbols)
    }
    return { implementations: [], unresolvedSameFileCandidate: true }
  }
  if (
    ts.isImportClause(declaration) ||
    ts.isImportSpecifier(declaration) ||
    ts.isNamespaceImport(declaration) ||
    ts.isImportEqualsDeclaration(declaration)
  ) {
    return { implementations: [], unresolvedSameFileCandidate: false }
  }
  return { implementations: [], unresolvedSameFileCandidate: false }
}

function implementationsFromSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  seenSymbols = new Set<ts.Symbol>()
): CallableResolution {
  if (seenSymbols.has(symbol)) {
    return { implementations: [], unresolvedSameFileCandidate: false }
  }
  seenSymbols.add(symbol)
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const declarations = symbol.declarations ?? []
    if (
      declarations.some(declaration =>
        [
          ts.SyntaxKind.ImportClause,
          ts.SyntaxKind.ImportSpecifier,
          ts.SyntaxKind.NamespaceImport,
          ts.SyntaxKind.ImportEqualsDeclaration,
        ].includes(declaration.kind)
      )
    ) {
      return { implementations: [], unresolvedSameFileCandidate: false }
    }
    const target = checker.getAliasedSymbol(symbol)
    if (target !== symbol) {
      return implementationsFromSymbol(target, checker, sourceFile, seenSymbols)
    }
  }
  const implementations = new Set<ts.FunctionLikeDeclaration>()
  let unresolvedSameFileCandidate = false
  for (const declaration of symbol.declarations ?? []) {
    const result = implementationFromDeclaration(
      declaration,
      checker,
      sourceFile,
      seenSymbols
    )
    result.implementations.forEach(implementation =>
      implementations.add(implementation)
    )
    unresolvedSameFileCandidate ||= result.unresolvedSameFileCandidate
  }
  return { implementations: [...implementations], unresolvedSameFileCandidate }
}

function resolveCallImplementations(options: {
  call: ts.CallExpression
  checker: ts.TypeChecker
  sourceFile: ts.SourceFile
}): CallableResolution {
  const expression = unwrapCallableExpression(options.call.expression)
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return { implementations: [expression], unresolvedSameFileCandidate: false }
  }
  const symbolLocation = ts.isPropertyAccessExpression(expression)
    ? expression.name
    : expression
  const symbol = options.checker.getSymbolAtLocation(symbolLocation)
  return symbol === undefined
    ? { implementations: [], unresolvedSameFileCandidate: false }
    : implementationsFromSymbol(symbol, options.checker, options.sourceFile)
}

type FunctionGraph = {
  adjacency: ReadonlyMap<
    ts.FunctionLikeDeclaration,
    ReadonlySet<ts.FunctionLikeDeclaration>
  >
  issues: FrozenShellValidationIssue[]
  visited: ReadonlySet<ts.FunctionLikeDeclaration>
}

type ExecutableNodeVisitor = {
  dead: (node: ts.Node) => void
  live: (node: ts.Node) => void
}

function immediateBooleanValue(expression: ts.Expression): boolean | null {
  const unwrapped = unwrapCallableExpression(expression)
  if (unwrapped.kind === ts.SyntaxKind.TrueKeyword) return true
  if (unwrapped.kind === ts.SyntaxKind.FalseKeyword) return false
  return null
}

function walkDeadNode(node: ts.Node, visitor: ExecutableNodeVisitor): void {
  visitor.dead(node)
  if (isFunctionNode(node) || ts.isClassLike(node)) return
  ts.forEachChild(node, child => walkDeadNode(child, visitor))
}

function walkExecutableNode(
  node: ts.Node,
  visitor: ExecutableNodeVisitor,
  root: ts.Node = node
): void {
  visitor.live(node)
  if (node !== root && (isFunctionNode(node) || ts.isClassLike(node))) return

  if (ts.isBlock(node)) {
    for (let index = 0; index < node.statements.length; index += 1) {
      const statement = node.statements[index]
      walkExecutableNode(statement, visitor, root)
      if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
        for (const dead of node.statements.slice(index + 1)) {
          walkDeadNode(dead, visitor)
        }
        break
      }
    }
    return
  }

  if (ts.isIfStatement(node)) {
    walkExecutableNode(node.expression, visitor, root)
    const condition = immediateBooleanValue(node.expression)
    if (condition === true) {
      walkExecutableNode(node.thenStatement, visitor, root)
      if (node.elseStatement !== undefined) {
        walkDeadNode(node.elseStatement, visitor)
      }
    } else if (condition === false) {
      walkDeadNode(node.thenStatement, visitor)
      if (node.elseStatement !== undefined) {
        walkExecutableNode(node.elseStatement, visitor, root)
      }
    } else {
      walkExecutableNode(node.thenStatement, visitor, root)
      if (node.elseStatement !== undefined) {
        walkExecutableNode(node.elseStatement, visitor, root)
      }
    }
    return
  }

  if (ts.isConditionalExpression(node)) {
    walkExecutableNode(node.condition, visitor, root)
    const condition = immediateBooleanValue(node.condition)
    if (condition === true) {
      walkExecutableNode(node.whenTrue, visitor, root)
      walkDeadNode(node.whenFalse, visitor)
    } else if (condition === false) {
      walkDeadNode(node.whenTrue, visitor)
      walkExecutableNode(node.whenFalse, visitor, root)
    } else {
      walkExecutableNode(node.whenTrue, visitor, root)
      walkExecutableNode(node.whenFalse, visitor, root)
    }
    return
  }

  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    walkExecutableNode(node.left, visitor, root)
    const left = immediateBooleanValue(node.left)
    const rightIsDead =
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        left === false) ||
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && left === true)
    if (rightIsDead) walkDeadNode(node.right, visitor)
    else walkExecutableNode(node.right, visitor, root)
    return
  }

  if (ts.isWhileStatement(node)) {
    walkExecutableNode(node.expression, visitor, root)
    if (immediateBooleanValue(node.expression) === false) {
      walkDeadNode(node.statement, visitor)
    } else {
      walkExecutableNode(node.statement, visitor, root)
    }
    return
  }

  ts.forEachChild(node, child => walkExecutableNode(child, visitor, root))
}

function buildFunctionGraph(options: {
  checker: ts.TypeChecker
  entry: ts.FunctionLikeDeclaration
  path: string
  sourceFile: ts.SourceFile
}): FunctionGraph {
  const adjacency = new Map<
    ts.FunctionLikeDeclaration,
    Set<ts.FunctionLikeDeclaration>
  >()
  const issues: FrozenShellValidationIssue[] = []
  const queue: ts.FunctionLikeDeclaration[] = [options.entry]
  const visited = new Set<ts.FunctionLikeDeclaration>()
  let callCount = 0

  while (queue.length > 0) {
    if (visited.size >= MAX_REACHABLE_RENDER_FUNCTIONS) {
      issues.push({
        code: 'renderer-reachability-bound',
        path: options.path,
        detail: `${MAX_REACHABLE_RENDER_FUNCTIONS} functions`,
      })
      break
    }
    const current = queue.shift()
    if (current === undefined || visited.has(current)) {
      continue
    }
    visited.add(current)
    const targets = new Set<ts.FunctionLikeDeclaration>()
    adjacency.set(current, targets)
    const body = current.body
    if (body === undefined) {
      continue
    }
    walkExecutableNode(body, {
      dead: () => undefined,
      live: node => {
        if (!ts.isCallExpression(node)) return
        callCount += 1
        if (callCount > MAX_REACHABLE_RENDER_CALLS) {
          if (
            !issues.some(issue => issue.code === 'renderer-reachability-bound')
          ) {
            issues.push({
              code: 'renderer-reachability-bound',
              path: options.path,
              detail: `${MAX_REACHABLE_RENDER_CALLS} calls`,
            })
          }
          return
        }
        const resolution = resolveCallImplementations({
          call: node,
          checker: options.checker,
          sourceFile: options.sourceFile,
        })
        if (resolution.implementations.length > 1) {
          issues.push({
            code: 'renderer-call-ambiguous',
            path: options.path,
            detail: node.expression.getText(options.sourceFile),
          })
        } else if (resolution.implementations.length === 1) {
          const target = resolution.implementations[0]
          targets.add(target)
          if (!visited.has(target)) {
            queue.push(target)
          }
        } else if (resolution.unresolvedSameFileCandidate) {
          issues.push({
            code: 'renderer-call-unresolved',
            path: options.path,
            detail: node.expression.getText(options.sourceFile),
          })
        }
      },
    })
    if (issues.some(issue => issue.code === 'renderer-reachability-bound')) {
      break
    }
  }
  return { adjacency, issues, visited }
}

type RendererElementFlow = {
  dead: ParsedRendererElement[]
  live: ParsedRendererElement[]
}

function collectOwnRendererElements(
  sourceFile: ts.SourceFile,
  implementation: ts.FunctionLikeDeclaration
): RendererElementFlow {
  const dead: ParsedRendererElement[] = []
  const live: ParsedRendererElement[] = []
  const body = implementation.body
  if (body === undefined) {
    return { dead, live }
  }
  const collect = (target: ParsedRendererElement[]) => (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      target.push(parseRendererElement(sourceFile, node.openingElement))
    } else if (ts.isJsxSelfClosingElement(node)) {
      target.push(parseRendererElement(sourceFile, node))
    }
  }
  walkExecutableNode(body, { dead: collect(dead), live: collect(live) })
  return { dead, live }
}

function findAllRootFunctions(
  sourceFile: ts.SourceFile,
  rootContract: RendererElementContract
): {
  dead: ReadonlySet<ts.FunctionLikeDeclaration>
  live: ReadonlySet<ts.FunctionLikeDeclaration>
} {
  const dead = new Set<ts.FunctionLikeDeclaration>()
  const live = new Set<ts.FunctionLikeDeclaration>()
  const visit = (node: ts.Node) => {
    if (isFunctionNode(node) && node.body !== undefined) {
      const elements = collectOwnRendererElements(sourceFile, node)
      if (
        elements.live.some(element =>
          rendererElementMatches(element, rootContract)
        )
      ) {
        live.add(node)
      }
      if (
        elements.dead.some(element =>
          rendererElementMatches(element, rootContract)
        )
      ) {
        dead.add(node)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { dead, live }
}

function descendantFunctions(
  root: ts.FunctionLikeDeclaration,
  adjacency: FunctionGraph['adjacency']
): ReadonlySet<ts.FunctionLikeDeclaration> {
  const descendants = new Set<ts.FunctionLikeDeclaration>()
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || descendants.has(current)) continue
    descendants.add(current)
    for (const target of adjacency.get(current) ?? []) {
      if (!descendants.has(target)) queue.push(target)
    }
  }
  return descendants
}

function collectReachableRendererElements(options: {
  contract: FrozenInterfaceShellContract
  path: string
  source: string
}): RendererReachability {
  const { sourceFile, checker } = createRendererProgram(options.source)
  const entries = findRendererEntry({ contract: options.contract, sourceFile })
  if (entries.length !== 1) {
    return {
      deadElements: [],
      elements: [],
      issues: [
        {
          code: 'renderer-entry-ambiguous',
          path: options.path,
          detail: `${options.contract.currentRenderer.mountedComponent.exportName}.${options.contract.currentRenderer.mountedComponent.renderMethod}: ${entries.length} candidates`,
        },
      ],
    }
  }
  const graph = buildFunctionGraph({
    checker,
    entry: entries[0],
    path: options.path,
    sourceFile,
  })
  if (graph.issues.length > 0) {
    return { deadElements: [], elements: [], issues: graph.issues }
  }
  const allRoots = findAllRootFunctions(
    sourceFile,
    options.contract.currentRenderer.rootElement
  )
  if (allRoots.live.size === 0 && allRoots.dead.size === 0) {
    return {
      deadElements: [],
      elements: [],
      issues: [
        {
          code: 'missing-renderer-root',
          path: options.path,
          detail: rendererElementDetail(
            options.contract.currentRenderer.rootElement
          ),
        },
      ],
    }
  }
  const reachableRoots = [...allRoots.live].filter(root =>
    graph.visited.has(root)
  )
  if (reachableRoots.length === 0) {
    const deadReachableRoot = [...allRoots.dead].some(root =>
      graph.visited.has(root)
    )
    return {
      deadElements: [],
      elements: [],
      issues: [
        {
          code: deadReachableRoot
            ? 'renderer-dead-path-only'
            : 'renderer-root-unreachable',
          path: options.path,
          detail: rendererElementDetail(
            options.contract.currentRenderer.rootElement
          ),
        },
      ],
    }
  }
  if (reachableRoots.length !== 1) {
    return {
      deadElements: [],
      elements: [],
      issues: [
        {
          code: 'renderer-root-ambiguous',
          path: options.path,
          detail: `${reachableRoots.length} reachable roots`,
        },
      ],
    }
  }
  const descendants = descendantFunctions(reachableRoots[0], graph.adjacency)
  const elementFlows = [...descendants].map(implementation =>
    collectOwnRendererElements(sourceFile, implementation)
  )
  return {
    deadElements: elementFlows.flatMap(flow => flow.dead),
    elements: elementFlows.flatMap(flow => flow.live),
    issues: [],
  }
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
  const imports = parseStaticImportStatements(renderer.source)
  const reachability = collectReachableRendererElements({
    contract,
    path: renderer.path,
    source: renderer.source,
  })

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

  issues.push(...reachability.issues)
  if (reachability.issues.length === 0) {
    for (const expected of contract.currentRenderer.requiredElements) {
      if (
        reachability.elements.some(element =>
          rendererElementMatches(element, expected)
        )
      ) {
        continue
      }
      const deadPathOnly = reachability.deadElements.some(element =>
        rendererElementMatches(element, expected)
      )
      issues.push({
        code: deadPathOnly
          ? 'renderer-dead-path-only'
          : 'missing-renderer-element',
        path: renderer.path,
        detail: rendererElementDetail(expected),
      })
    }
  }
  return issues
}
