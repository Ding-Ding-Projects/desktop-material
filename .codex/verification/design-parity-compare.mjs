import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  PNG_LIMITS,
  calculatePixelDiff,
  createSideBySideComparison,
  decodePng,
} from './design-parity-png.mjs'

export const TOOL_NAME = 'desktop-material-design-parity-compare'
export const TOOL_VERSION = '1.0.0'

const RequiredOptions = Object.freeze([
  'reference-png',
  'production-png',
  'reference-file',
  'reference-route',
  'production-route',
  'state',
  'theme',
  'viewport-width',
  'viewport-height',
  'scale',
  'comparison',
  'receipt',
])

function fail(message) {
  throw new Error(message)
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function strictText(value, option, maximum = 512) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail('--' + option + ' must be non-empty bounded text without control characters')
  }
  return value
}

function strictInteger(value, option) {
  if (!/^\d+$/.test(value)) fail('--' + option + ' must be an integer')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 160 || parsed > PNG_LIMITS.maxDimension) {
    fail('--' + option + ' must be an integer from 160 through ' + PNG_LIMITS.maxDimension)
  }
  return parsed
}

function strictScale(value) {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) {
    fail('--scale must be a decimal with at most three fractional digits')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 4) {
    fail('--scale must be from 0.5 through 4')
  }
  return parsed
}

function parsePairs(argv) {
  if (argv.length % 2 !== 0) fail('Every option requires one explicit value')
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (typeof option !== 'string' || !/^--[a-z][a-z-]*$/.test(option)) {
      fail('Invalid option near ' + String(option))
    }
    const key = option.slice(2)
    if (!RequiredOptions.includes(key)) fail('Unsupported option --' + key)
    if (values.has(key)) fail('Duplicate option --' + key)
    values.set(key, value)
  }
  for (const option of RequiredOptions) {
    if (!values.has(option)) fail('Missing required option --' + option)
  }
  return values
}

function canonicalPath(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function receiptPath(value) {
  const resolved = path.resolve(value)
  const relative = path.relative(process.cwd(), resolved)
  const selected =
    relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)
      ? relative
      : resolved
  return selected.split(path.sep).join('/')
}

function sameStats(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  )
}

export function readImmutablePng(filePath, label) {
  if (path.extname(filePath).toLowerCase() !== '.png') fail(label + ' must end in .png')
  const absolutePath = path.resolve(filePath)
  const beforeLink = fs.lstatSync(absolutePath, { bigint: true })
  if (beforeLink.isSymbolicLink() || !beforeLink.isFile()) {
    fail(label + ' must be a regular non-symbolic-link file')
  }
  if (beforeLink.size > BigInt(PNG_LIMITS.maxFileBytes)) fail(label + ' exceeds 64 MiB')
  const realPath = fs.realpathSync.native(absolutePath)
  const descriptor = fs.openSync(absolutePath, 'r')
  let bytes
  let before
  let after
  try {
    before = fs.fstatSync(descriptor, { bigint: true })
    bytes = fs.readFileSync(descriptor)
    after = fs.fstatSync(descriptor, { bigint: true })
  } finally {
    fs.closeSync(descriptor)
  }
  if (!sameStats(before, after) || bytes.length !== Number(before.size)) {
    fail(label + ' changed while it was being read')
  }
  return Object.freeze({
    absolutePath,
    realPath,
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.length,
  })
}

function assertStableInput(original, filePath, label) {
  const current = readImmutablePng(filePath, label)
  if (canonicalPath(current.realPath) !== canonicalPath(original.realPath)) {
    fail(label + ' resolved to a different file after comparison')
  }
  if (current.sha256 !== original.sha256 || current.byteLength !== original.byteLength) {
    fail(label + ' changed during comparison')
  }
}

function assertNewOutput(filePath, extension, label) {
  const absolutePath = path.resolve(filePath)
  if (path.extname(absolutePath).toLowerCase() !== extension) {
    fail(label + ' must end in ' + extension)
  }
  if (fs.existsSync(absolutePath)) fail(label + ' refuses to overwrite an existing path')
  const parent = path.dirname(absolutePath)
  const parentLink = fs.lstatSync(parent)
  if (!parentLink.isDirectory() || parentLink.isSymbolicLink()) {
    fail(label + ' parent must be a regular directory')
  }
  const realParent = fs.realpathSync.native(parent)
  if (canonicalPath(realParent) !== canonicalPath(parent)) {
    fail(label + ' parent may not resolve through a symbolic link or junction')
  }
  return absolutePath
}

export function parseComparisonArguments(argv) {
  const values = parsePairs(argv)
  const viewportWidth = strictInteger(values.get('viewport-width'), 'viewport-width')
  const viewportHeight = strictInteger(values.get('viewport-height'), 'viewport-height')
  const scale = strictScale(values.get('scale'))
  const physicalWidth = viewportWidth * scale
  const physicalHeight = viewportHeight * scale
  if (
    !Number.isSafeInteger(physicalWidth) ||
    !Number.isSafeInteger(physicalHeight) ||
    physicalWidth > PNG_LIMITS.maxDimension ||
    physicalHeight > PNG_LIMITS.maxDimension
  ) {
    fail('Viewport dimensions multiplied by --scale must produce bounded whole pixels')
  }
  const theme = values.get('theme')
  if (!['light', 'dark'].includes(theme)) fail('--theme must be light or dark')
  return Object.freeze({
    referencePng: values.get('reference-png'),
    productionPng: values.get('production-png'),
    comparison: values.get('comparison'),
    receipt: values.get('receipt'),
    tuple: Object.freeze({
      referenceFile: strictText(values.get('reference-file'), 'reference-file'),
      referenceRoute: strictText(values.get('reference-route'), 'reference-route', 256),
      productionRoute: strictText(values.get('production-route'), 'production-route', 256),
      state: strictText(values.get('state'), 'state', 256),
      theme,
      viewportWidth,
      viewportHeight,
      scale,
    }),
    physicalWidth,
    physicalHeight,
  })
}

function inputReceipt(filePath, immutable, decoded) {
  return Object.freeze({
    path: receiptPath(filePath),
    bytes: immutable.byteLength,
    sha256: immutable.sha256,
    width: decoded.width,
    height: decoded.height,
    bitDepth: decoded.bitDepth,
    colorType: decoded.colorType,
  })
}

export function runComparison(options) {
  const reference = readImmutablePng(options.referencePng, 'reference PNG')
  const production = readImmutablePng(options.productionPng, 'production PNG')
  if (canonicalPath(reference.realPath) === canonicalPath(production.realPath)) {
    fail('Reference and production captures must be distinct files')
  }

  const comparisonPath = assertNewOutput(options.comparison, '.png', 'comparison output')
  const receiptOutputPath = assertNewOutput(options.receipt, '.json', 'receipt output')
  const allPaths = [
    reference.absolutePath,
    production.absolutePath,
    comparisonPath,
    receiptOutputPath,
  ].map(canonicalPath)
  if (new Set(allPaths).size !== allPaths.length) fail('Input and output paths must all be distinct')

  const referencePng = decodePng(reference.bytes, 'reference PNG')
  const productionPng = decodePng(production.bytes, 'production PNG')
  if (referencePng.width !== productionPng.width || referencePng.height !== productionPng.height) {
    fail('Reference and production PNG dimensions must match exactly')
  }
  if (
    referencePng.width !== options.physicalWidth ||
    referencePng.height !== options.physicalHeight
  ) {
    fail('PNG dimensions must equal viewport dimensions multiplied by scale')
  }

  const diff = calculatePixelDiff(referencePng, productionPng)
  const comparison = createSideBySideComparison(referencePng, productionPng)
  const comparisonHash = sha256(comparison.png)
  const receipt = {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    tuple: { ...options.tuple },
    inputs: {
      reference: inputReceipt(options.referencePng, reference, referencePng),
      production: inputReceipt(options.productionPng, production, productionPng),
    },
    comparison: {
      path: receiptPath(options.comparison),
      bytes: comparison.png.length,
      sha256: comparisonHash,
      width: comparison.width,
      height: comparison.height,
      layout: comparison.layout,
    },
    diff,
    immutableInputsVerified: true,
  }

  let comparisonWritten = false
  let receiptWritten = false
  try {
    fs.writeFileSync(comparisonPath, comparison.png, { flag: 'wx' })
    comparisonWritten = true
    const writtenComparison = fs.readFileSync(comparisonPath)
    if (sha256(writtenComparison) !== comparisonHash) fail('Comparison output hash changed after write')
    assertStableInput(reference, options.referencePng, 'reference PNG')
    assertStableInput(production, options.productionPng, 'production PNG')
    fs.writeFileSync(receiptOutputPath, JSON.stringify(receipt, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
    })
    receiptWritten = true
  } catch (error) {
    if (receiptWritten) fs.rmSync(receiptOutputPath, { force: true })
    if (comparisonWritten) fs.rmSync(comparisonPath, { force: true })
    throw error
  }
  return Object.freeze(receipt)
}

export function runComparisonCli(argv = process.argv.slice(2)) {
  const options = parseComparisonArguments(argv)
  const receipt = runComparison(options)
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

const directEntry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null
if (directEntry === import.meta.url) {
  try {
    runComparisonCli()
  } catch (error) {
    process.stderr.write('Design parity comparison failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}
