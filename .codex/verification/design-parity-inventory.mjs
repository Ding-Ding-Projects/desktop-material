import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  TOOL_NAME,
  sha256,
} from './design-parity-compare.mjs'
import {
  calculatePixelDiff,
  createSideBySideComparison,
  decodePng,
} from './design-parity-png.mjs'

const MaxJsonBytes = 16 * 1024 * 1024
const MaxJsonDepth = 64
const ShaPattern = /^[a-f0-9]{64}$/
const TimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const MaterialCategories = Object.freeze([
  'buttons',
  'fields',
  'menus',
  'tabs',
  'dialogs',
  'navigation',
  'switches',
  'selection-controls',
  'typography',
  'shape',
  'elevation',
  'state-layers',
  'motion',
])

function fail(label, message) {
  throw new Error(label + ': ' + message)
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function exactKeys(value, keys, label) {
  if (!isPlainObject(value)) fail(label, 'must be an object')
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, 'keys must be exactly [' + expected.join(', ') + ']')
  }
}

function strictString(value, label, maximum = 512) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail(label, 'must be non-empty bounded text without control characters')
  }
  return value
}

function strictInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(label, 'must be an integer from ' + minimum + ' through ' + maximum)
  }
  return value
}

function strictNumber(value, label, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(label, 'must be a finite number from ' + minimum + ' through ' + maximum)
  }
  return value
}

function strictSha(value, label) {
  if (typeof value !== 'string' || !ShaPattern.test(value)) {
    fail(label, 'must be a lowercase SHA-256 digest')
  }
  return value
}

function strictTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !TimestampPattern.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(label, 'must be an ISO-8601 timestamp with a timezone')
  }
  return value
}

function strictRelativePath(value, label) {
  strictString(value, label, 1024)
  if (value.includes('\\') || path.posix.isAbsolute(value)) {
    fail(label, 'must be a forward-slash relative path')
  }
  const normalized = path.posix.normalize(value)
  if (normalized !== value || value === '..' || value.startsWith('../')) {
    fail(label, 'must not escape or normalize outside its root')
  }
  return value
}

function resolveWithin(root, relativePath, label) {
  strictRelativePath(relativePath, label)
  const rootPath = path.resolve(root)
  const target = path.resolve(rootPath, ...relativePath.split('/'))
  const relative = path.relative(rootPath, target)
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
    fail(label, 'escapes its declared root')
  }
  return target
}

function compareJson(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail(label, 'does not match the pinned value')
}

export function parseStrictJson(text, label = 'JSON') {
  if (typeof text !== 'string') fail(label, 'must be UTF-8 text')
  if (Buffer.byteLength(text, 'utf8') > MaxJsonBytes) fail(label, 'exceeds 16 MiB')
  let index = 0

  function whitespace() {
    while (index < text.length && /\s/.test(text[index])) index += 1
  }

  function parseString() {
    const start = index
    index += 1
    let escaped = false
    while (index < text.length) {
      const character = text[index]
      if (!escaped && character === '"') {
        index += 1
        try {
          return JSON.parse(text.slice(start, index))
        } catch (error) {
          fail(label, 'invalid string: ' + error.message)
        }
      }
      if (!escaped && character === '\\') escaped = true
      else escaped = false
      index += 1
    }
    fail(label, 'unterminated string')
  }

  function parseValue(depth) {
    if (depth > MaxJsonDepth) fail(label, 'exceeds maximum nesting depth')
    whitespace()
    const character = text[index]
    if (character === '"') return parseString()
    if (character === '{') {
      index += 1
      const object = Object.create(null)
      const keys = new Set()
      whitespace()
      if (text[index] === '}') {
        index += 1
        return object
      }
      while (index < text.length) {
        whitespace()
        if (text[index] !== '"') fail(label, 'object key must be a string')
        const key = parseString()
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          fail(label, 'unsafe object key ' + key)
        }
        if (keys.has(key)) fail(label, 'duplicate object key ' + key)
        keys.add(key)
        whitespace()
        if (text[index] !== ':') fail(label, 'missing colon after object key')
        index += 1
        object[key] = parseValue(depth + 1)
        whitespace()
        if (text[index] === '}') {
          index += 1
          return object
        }
        if (text[index] !== ',') fail(label, 'missing comma between object entries')
        index += 1
      }
      fail(label, 'unterminated object')
    }
    if (character === '[') {
      index += 1
      const array = []
      whitespace()
      if (text[index] === ']') {
        index += 1
        return array
      }
      while (index < text.length) {
        array.push(parseValue(depth + 1))
        whitespace()
        if (text[index] === ']') {
          index += 1
          return array
        }
        if (text[index] !== ',') fail(label, 'missing comma between array entries')
        index += 1
      }
      fail(label, 'unterminated array')
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) {
        index += literal.length
        return literal === 'true' ? true : literal === 'false' ? false : null
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index))
    if (number) {
      index += number[0].length
      const value = Number(number[0])
      if (!Number.isFinite(value)) fail(label, 'number must be finite')
      return value
    }
    fail(label, 'unexpected token at character ' + index)
  }

  const result = parseValue(0)
  whitespace()
  if (index !== text.length) fail(label, 'trailing content after JSON value')
  return result
}

function readStrictJsonFile(filePath, label) {
  const absolutePath = path.resolve(filePath)
  const stat = fs.lstatSync(absolutePath)
  if (!stat.isFile() || stat.isSymbolicLink()) fail(label, 'must be a regular file')
  if (stat.size > MaxJsonBytes) fail(label, 'exceeds 16 MiB')
  const bytes = fs.readFileSync(absolutePath)
  return Object.freeze({
    absolutePath,
    bytes,
    sha256: sha256(bytes),
    value: parseStrictJson(bytes.toString('utf8'), label),
  })
}

function validateRoute(value, label) {
  exactKeys(value, ['id', 'referenceFile', 'referenceRoute'], label)
  strictString(value.id, label + '.id', 256)
  strictRelativePath(value.referenceFile, label + '.referenceFile')
  strictString(value.referenceRoute, label + '.referenceRoute', 256)
  return value
}

function validateUnreachableCatalogState(value, label) {
  exactKeys(value, ['id', 'reason', 'referenceFile', 'referenceRoute'], label)
  validateRoute(
    {
      id: value.id,
      referenceFile: value.referenceFile,
      referenceRoute: value.referenceRoute,
    },
    label
  )
  strictString(value.reason, label + '.reason', 2048)
  return value
}

export function validateRouteCatalog(value, expectedCount) {
  exactKeys(
    value,
    [
      'catalogId',
      'expectedReachableRouteCount',
      'routes',
      'schemaVersion',
      'unreachableStates',
    ],
    'route catalog'
  )
  if (value.schemaVersion !== 1) fail('route catalog.schemaVersion', 'must equal 1')
  strictString(value.catalogId, 'route catalog.catalogId', 256)
  strictInteger(value.expectedReachableRouteCount, 'route catalog count', 1, 500)
  if (value.expectedReachableRouteCount !== expectedCount) {
    fail('route catalog count', 'does not match the explicit expected count')
  }
  if (!Array.isArray(value.routes) || value.routes.length !== expectedCount) {
    fail('route catalog.routes', 'must contain exactly ' + expectedCount + ' routes')
  }
  const ids = new Set()
  value.routes.forEach((route, index) => {
    validateRoute(route, 'route catalog.routes[' + index + ']')
    if (ids.has(route.id)) fail('route catalog.routes', 'duplicate exact id ' + route.id)
    ids.add(route.id)
  })
  if (!Array.isArray(value.unreachableStates)) {
    fail('route catalog.unreachableStates', 'must be an array')
  }
  const unreachableIds = new Set()
  value.unreachableStates.forEach((state, index) => {
    validateUnreachableCatalogState(state, 'route catalog.unreachableStates[' + index + ']')
    if (ids.has(state.id) || unreachableIds.has(state.id)) {
      fail('route catalog.unreachableStates', 'duplicate or reachable exact id ' + state.id)
    }
    unreachableIds.add(state.id)
  })
  return value
}

function validateTuple(value, label) {
  exactKeys(
    value,
    [
      'productionRoute',
      'referenceFile',
      'referenceRoute',
      'scale',
      'state',
      'theme',
      'viewportHeight',
      'viewportWidth',
    ],
    label
  )
  strictRelativePath(value.referenceFile, label + '.referenceFile')
  strictString(value.referenceRoute, label + '.referenceRoute', 256)
  strictString(value.productionRoute, label + '.productionRoute', 256)
  strictString(value.state, label + '.state', 256)
  if (!['light', 'dark'].includes(value.theme)) fail(label + '.theme', 'must be light or dark')
  strictInteger(value.viewportWidth, label + '.viewportWidth', 160, 8192)
  strictInteger(value.viewportHeight, label + '.viewportHeight', 160, 8192)
  strictNumber(value.scale, label + '.scale', 0.5, 4)
  if (
    !Number.isSafeInteger(value.viewportWidth * value.scale) ||
    !Number.isSafeInteger(value.viewportHeight * value.scale)
  ) {
    fail(label, 'viewport and scale must produce whole physical pixels')
  }
  return value
}

function validateArtifact(value, label) {
  exactKeys(value, ['path', 'sha256'], label)
  strictRelativePath(value.path, label + '.path')
  strictSha(value.sha256, label + '.sha256')
  return value
}

function validateAudit(value, label) {
  exactKeys(value, ['controls', 'reviewedAt', 'reviewedBy', 'status'], label)
  if (value.status !== 'pass') fail(label + '.status', 'must be pass')
  strictString(value.reviewedBy, label + '.reviewedBy', 256)
  strictTimestamp(value.reviewedAt, label + '.reviewedAt')
  if (!Array.isArray(value.controls) || value.controls.length !== MaterialCategories.length) {
    fail(label + '.controls', 'must enumerate every required Material Design 3 category')
  }
  const categories = new Set()
  value.controls.forEach((control, index) => {
    const controlLabel = label + '.controls[' + index + ']'
    exactKeys(control, ['category', 'notes', 'primitive', 'status'], controlLabel)
    strictString(control.category, controlLabel + '.category', 128)
    strictString(control.primitive, controlLabel + '.primitive', 256)
    strictString(control.notes, controlLabel + '.notes', 1024)
    if (control.status !== 'pass') fail(controlLabel + '.status', 'must be pass')
    if (categories.has(control.category)) fail(label + '.controls', 'duplicate category ' + control.category)
    categories.add(control.category)
  })
  compareJson([...categories].sort(), [...MaterialCategories].sort(), label + '.controls categories')
}

function validateDeviation(value, label) {
  exactKeys(value, ['approvedAt', 'approvedBy', 'id', 'reason'], label)
  strictString(value.id, label + '.id', 256)
  strictString(value.reason, label + '.reason', 2048)
  strictString(value.approvedBy, label + '.approvedBy', 256)
  strictTimestamp(value.approvedAt, label + '.approvedAt')
}

function validateReceiptShape(receipt, label) {
  exactKeys(
    receipt,
    [
      'comparison',
      'diff',
      'immutableInputsVerified',
      'inputs',
      'schemaVersion',
      'tool',
      'tuple',
    ],
    label
  )
  if (receipt.schemaVersion !== 1) fail(label + '.schemaVersion', 'must equal 1')
  exactKeys(receipt.tool, ['name', 'version'], label + '.tool')
  if (receipt.tool.name !== TOOL_NAME) fail(label + '.tool.name', 'does not identify this comparator')
  if (typeof receipt.tool.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(receipt.tool.version)) {
    fail(label + '.tool.version', 'must be semantic version text')
  }
  validateTuple(receipt.tuple, label + '.tuple')
  exactKeys(receipt.inputs, ['production', 'reference'], label + '.inputs')
  for (const side of ['reference', 'production']) {
    const input = receipt.inputs[side]
    const inputLabel = label + '.inputs.' + side
    exactKeys(
      input,
      ['bitDepth', 'bytes', 'colorType', 'height', 'path', 'sha256', 'width'],
      inputLabel
    )
    strictString(input.path, inputLabel + '.path', 2048)
    strictInteger(input.bytes, inputLabel + '.bytes', 1, 64 * 1024 * 1024)
    strictSha(input.sha256, inputLabel + '.sha256')
    strictInteger(input.width, inputLabel + '.width', 1, 8192)
    strictInteger(input.height, inputLabel + '.height', 1, 8192)
    if (input.bitDepth !== 8) fail(inputLabel + '.bitDepth', 'must equal 8')
    if (![2, 6].includes(input.colorType)) fail(inputLabel + '.colorType', 'must be 2 or 6')
  }
  exactKeys(
    receipt.comparison,
    ['bytes', 'height', 'layout', 'path', 'sha256', 'width'],
    label + '.comparison'
  )
  strictString(receipt.comparison.path, label + '.comparison.path', 2048)
  strictInteger(receipt.comparison.bytes, label + '.comparison.bytes', 1, 128 * 1024 * 1024)
  strictSha(receipt.comparison.sha256, label + '.comparison.sha256')
  strictInteger(receipt.comparison.width, label + '.comparison.width', 1, 8192)
  strictInteger(receipt.comparison.height, label + '.comparison.height', 1, 8192)
  exactKeys(
    receipt.comparison.layout,
    ['gap', 'headerHeight', 'headerToImageGap', 'labels', 'padding'],
    label + '.comparison.layout'
  )
  exactKeys(receipt.comparison.layout.labels, ['production', 'reference'], label + '.comparison.layout.labels')
  if (
    receipt.comparison.layout.labels.reference !== 'REFERENCE' ||
    receipt.comparison.layout.labels.production !== 'PRODUCTION'
  ) {
    fail(label + '.comparison.layout.labels', 'must preserve both exact visible labels')
  }
  for (const key of ['gap', 'headerHeight', 'headerToImageGap', 'padding']) {
    strictInteger(receipt.comparison.layout[key], label + '.comparison.layout.' + key, 0, 512)
  }
  exactKeys(
    receipt.diff,
    [
      'changedBounds',
      'comparedPixelCount',
      'differentPixelFraction',
      'differentPixelCount',
      'differentPixelRatio',
      'maximumChannelDelta',
      'totalAbsoluteChannelDelta',
    ],
    label + '.diff'
  )
  strictInteger(receipt.diff.comparedPixelCount, label + '.diff.comparedPixelCount', 1)
  strictInteger(
    receipt.diff.differentPixelCount,
    label + '.diff.differentPixelCount',
    0,
    receipt.diff.comparedPixelCount
  )
  exactKeys(
    receipt.diff.differentPixelFraction,
    ['denominator', 'numerator'],
    label + '.diff.differentPixelFraction'
  )
  strictInteger(
    receipt.diff.differentPixelFraction.numerator,
    label + '.diff.differentPixelFraction.numerator',
    0,
    receipt.diff.comparedPixelCount
  )
  if (
    receipt.diff.differentPixelFraction.numerator !== receipt.diff.differentPixelCount ||
    receipt.diff.differentPixelFraction.denominator !== receipt.diff.comparedPixelCount
  ) {
    fail(label + '.diff.differentPixelFraction', 'must exactly equal the pixel-count fraction')
  }
  strictInteger(
    receipt.diff.differentPixelFraction.denominator,
    label + '.diff.differentPixelFraction.denominator',
    1,
    receipt.diff.comparedPixelCount
  )
  strictNumber(receipt.diff.differentPixelRatio, label + '.diff.differentPixelRatio', 0, 1)
  strictInteger(receipt.diff.totalAbsoluteChannelDelta, label + '.diff.totalAbsoluteChannelDelta', 0)
  strictInteger(receipt.diff.maximumChannelDelta, label + '.diff.maximumChannelDelta', 0, 255)
  if (receipt.diff.changedBounds !== null) {
    exactKeys(
      receipt.diff.changedBounds,
      ['bottom', 'height', 'left', 'right', 'top', 'width'],
      label + '.diff.changedBounds'
    )
    for (const key of ['bottom', 'height', 'left', 'right', 'top', 'width']) {
      strictInteger(receipt.diff.changedBounds[key], label + '.diff.changedBounds.' + key, 0)
    }
  }
  if (receipt.immutableInputsVerified !== true) {
    fail(label + '.immutableInputsVerified', 'must be true')
  }
  return receipt
}

function readPinnedArtifact(inventoryDirectory, artifact, label) {
  const absolutePath = resolveWithin(inventoryDirectory, artifact.path, label + '.path')
  const stat = fs.lstatSync(absolutePath)
  if (!stat.isFile() || stat.isSymbolicLink()) fail(label, 'must resolve to a regular file')
  const bytes = fs.readFileSync(absolutePath)
  if (sha256(bytes) !== artifact.sha256) fail(label, 'SHA-256 does not match the inventory')
  return Object.freeze({ absolutePath, bytes, sha256: artifact.sha256 })
}

function verifyReferenceFile(repositoryRoot, referenceFile, fixtureOnly) {
  const absolutePath = resolveWithin(repositoryRoot, referenceFile, 'referenceFile')
  const stat = fs.lstatSync(absolutePath)
  if (!stat.isFile() || stat.isSymbolicLink()) fail('referenceFile', 'must be a regular file')
  if (fixtureOnly) return
  const result = childProcess.spawnSync(
    'git',
    ['-C', repositoryRoot, 'ls-files', '--error-unmatch', '--', referenceFile],
    { encoding: 'utf8', windowsHide: true }
  )
  if (result.status !== 0) fail('referenceFile', referenceFile + ' is not tracked by Git')
}

function validateReviewedUnreachable(value, catalogValue, label) {
  exactKeys(
    value,
    ['id', 'reason', 'referenceFile', 'referenceRoute', 'reviewedAt', 'reviewedBy'],
    label
  )
  compareJson(
    {
      id: value.id,
      referenceFile: value.referenceFile,
      referenceRoute: value.referenceRoute,
      reason: value.reason,
    },
    catalogValue,
    label
  )
  strictString(value.reviewedBy, label + '.reviewedBy', 256)
  strictTimestamp(value.reviewedAt, label + '.reviewedAt')
}

function validateScreen(screen, route, context, label) {
  exactKeys(
    screen,
    ['captureTuple', 'evidence', 'id', 'intentionalDeviations', 'material3Audit'],
    label
  )
  if (screen.id !== route.id) fail(label + '.id', 'must exactly match the route id')
  validateTuple(screen.captureTuple, label + '.captureTuple')
  if (
    screen.captureTuple.referenceFile !== route.referenceFile ||
    screen.captureTuple.referenceRoute !== route.referenceRoute
  ) {
    fail(label + '.captureTuple', 'reference file and route must exactly match the route catalog')
  }
  validateAudit(screen.material3Audit, label + '.material3Audit')
  if (!Array.isArray(screen.intentionalDeviations)) {
    fail(label + '.intentionalDeviations', 'must be an array')
  }
  const deviationIds = new Set()
  screen.intentionalDeviations.forEach((deviation, index) => {
    validateDeviation(deviation, label + '.intentionalDeviations[' + index + ']')
    if (deviationIds.has(deviation.id)) {
      fail(label + '.intentionalDeviations', 'duplicate exact id ' + deviation.id)
    }
    deviationIds.add(deviation.id)
  })

  exactKeys(
    screen.evidence,
    ['comparison', 'productionCapture', 'referenceCapture', 'visualDiffReceipt'],
    label + '.evidence'
  )
  for (const key of ['referenceCapture', 'productionCapture', 'comparison', 'visualDiffReceipt']) {
    validateArtifact(screen.evidence[key], label + '.evidence.' + key)
  }

  const referenceArtifact = readPinnedArtifact(
    context.inventoryDirectory,
    screen.evidence.referenceCapture,
    label + '.evidence.referenceCapture'
  )
  const productionArtifact = readPinnedArtifact(
    context.inventoryDirectory,
    screen.evidence.productionCapture,
    label + '.evidence.productionCapture'
  )
  const comparisonArtifact = readPinnedArtifact(
    context.inventoryDirectory,
    screen.evidence.comparison,
    label + '.evidence.comparison'
  )
  const receiptArtifact = readPinnedArtifact(
    context.inventoryDirectory,
    screen.evidence.visualDiffReceipt,
    label + '.evidence.visualDiffReceipt'
  )
  const receipt = validateReceiptShape(
    parseStrictJson(receiptArtifact.bytes.toString('utf8'), label + ' receipt'),
    label + ' receipt'
  )
  compareJson(receipt.tuple, screen.captureTuple, label + ' receipt tuple')
  if (
    receipt.inputs.reference.sha256 !== referenceArtifact.sha256 ||
    receipt.inputs.production.sha256 !== productionArtifact.sha256 ||
    receipt.comparison.sha256 !== comparisonArtifact.sha256
  ) {
    fail(label + ' receipt', 'artifact hashes do not match the inventory')
  }

  const referencePng = decodePng(referenceArtifact.bytes, label + ' reference capture')
  const productionPng = decodePng(productionArtifact.bytes, label + ' production capture')
  const comparisonPng = decodePng(comparisonArtifact.bytes, label + ' comparison')
  const physicalWidth = screen.captureTuple.viewportWidth * screen.captureTuple.scale
  const physicalHeight = screen.captureTuple.viewportHeight * screen.captureTuple.scale
  for (const side of [referencePng, productionPng]) {
    if (side.width !== physicalWidth || side.height !== physicalHeight) {
      fail(label, 'raw capture dimensions do not match the capture tuple')
    }
  }
  const recalculatedDiff = calculatePixelDiff(referencePng, productionPng)
  compareJson(receipt.diff, recalculatedDiff, label + ' recalculated diff')
  const recalculatedComparison = createSideBySideComparison(referencePng, productionPng)
  if (
    sha256(recalculatedComparison.png) !== comparisonArtifact.sha256 ||
    !recalculatedComparison.png.equals(comparisonArtifact.bytes) ||
    comparisonPng.width !== recalculatedComparison.width ||
    comparisonPng.height !== recalculatedComparison.height
  ) {
    fail(label + ' comparison', 'is not the deterministic labelled side-by-side output')
  }
  if (recalculatedDiff.differentPixelCount > 0 && screen.intentionalDeviations.length === 0) {
    fail(label + '.intentionalDeviations', 'must review every non-zero visual difference')
  }
  if (recalculatedDiff.differentPixelCount === 0 && screen.intentionalDeviations.length > 0) {
    fail(label + '.intentionalDeviations', 'may not approve a difference when the exact diff is zero')
  }
  return recalculatedDiff
}

export function validateInventory(options) {
  const inventoryFile = readStrictJsonFile(options.inventory, 'inventory')
  const routeCatalogFile = readStrictJsonFile(options.routeCatalog, 'route catalog')
  const catalog = validateRouteCatalog(routeCatalogFile.value, options.expectedReferenceRouteCount)
  const inventory = inventoryFile.value
  exactKeys(
    inventory,
    [
      'expectedReferenceRouteCount',
      'fixtureOnly',
      'inventoryId',
      'referenceRoutes',
      'routeCatalogSha256',
      'schemaVersion',
      'screens',
      'unreachableStates',
    ],
    'inventory'
  )
  if (inventory.schemaVersion !== 1) fail('inventory.schemaVersion', 'must equal 1')
  if (typeof inventory.fixtureOnly !== 'boolean') fail('inventory.fixtureOnly', 'must be boolean')
  if (inventory.fixtureOnly && !options.allowFixture) {
    fail('inventory.fixtureOnly', 'fixture evidence is refused without --allow-fixture true')
  }
  strictString(inventory.inventoryId, 'inventory.inventoryId', 256)
  strictSha(inventory.routeCatalogSha256, 'inventory.routeCatalogSha256')
  if (inventory.routeCatalogSha256 !== routeCatalogFile.sha256) {
    fail('inventory.routeCatalogSha256', 'does not pin the exact route catalog bytes')
  }
  if (inventory.expectedReferenceRouteCount !== options.expectedReferenceRouteCount) {
    fail('inventory.expectedReferenceRouteCount', 'does not match the explicit expected count')
  }
  if (!Array.isArray(inventory.referenceRoutes)) {
    fail('inventory.referenceRoutes', 'must be an array')
  }
  if (inventory.referenceRoutes.length !== catalog.routes.length) {
    fail('inventory.referenceRoutes', 'must contain every exact route from the route catalog')
  }
  inventory.referenceRoutes.forEach((route, index) => {
    validateRoute(route, 'inventory.referenceRoutes[' + index + ']')
  })
  compareJson(inventory.referenceRoutes, catalog.routes, 'inventory.referenceRoutes')

  if (!Array.isArray(inventory.unreachableStates)) {
    fail('inventory.unreachableStates', 'must be an array')
  }
  if (inventory.unreachableStates.length !== catalog.unreachableStates.length) {
    fail('inventory.unreachableStates', 'must review every catalogued unreachable state')
  }
  inventory.unreachableStates.forEach((state, index) => {
    validateReviewedUnreachable(
      state,
      catalog.unreachableStates[index],
      'inventory.unreachableStates[' + index + ']'
    )
  })

  if (!Array.isArray(inventory.screens) || inventory.screens.length !== catalog.routes.length) {
    fail('inventory.screens', 'must contain exactly one evidence row per reachable route')
  }
  const repositoryRoot = path.resolve(options.repositoryRoot)
  const repositoryStat = fs.lstatSync(repositoryRoot)
  if (!repositoryStat.isDirectory() || repositoryStat.isSymbolicLink()) {
    fail('repository root', 'must be a regular directory')
  }
  const uniqueReferenceFiles = new Set(catalog.routes.map(route => route.referenceFile))
  for (const referenceFile of uniqueReferenceFiles) {
    verifyReferenceFile(repositoryRoot, referenceFile, inventory.fixtureOnly)
  }

  const screenIds = new Set()
  let differentPixels = 0
  inventory.screens.forEach((screen, index) => {
    if (!isPlainObject(screen)) fail('inventory.screens[' + index + ']', 'must be an object')
    if (screenIds.has(screen.id)) fail('inventory.screens', 'duplicate exact id ' + screen.id)
    screenIds.add(screen.id)
    const route = catalog.routes[index]
    if (screen.id !== route.id) {
      fail('inventory.screens[' + index + '].id', 'must preserve exact route order and identity')
    }
    const diff = validateScreen(
      screen,
      route,
      { inventoryDirectory: path.dirname(inventoryFile.absolutePath) },
      'inventory.screens[' + index + ']'
    )
    differentPixels += diff.differentPixelCount
  })

  return Object.freeze({
    schemaVersion: 1,
    inventoryId: inventory.inventoryId,
    fixtureOnly: inventory.fixtureOnly,
    verifiedScreenCount: inventory.screens.length,
    reviewedUnreachableStateCount: inventory.unreachableStates.length,
    differentPixelCount: differentPixels,
    routeCatalogSha256: routeCatalogFile.sha256,
  })
}

export function loadStrictJsonFile(filePath, label) {
  return readStrictJsonFile(filePath, label)
}

export const REQUIRED_MATERIAL_CATEGORIES = MaterialCategories
