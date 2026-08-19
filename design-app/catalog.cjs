'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { HistoryRoutes, UnreachableHistoryStates } = require('./scenarios.cjs')

const RepoRoot = path.resolve(__dirname, '..')
const DesignRoot = path.join(RepoRoot, 'design')
const CanonicalReference = 'Desktop Material v2.dc.html'
const RouteDriverPath = path.join(
  RepoRoot,
  '.codex',
  'verification',
  'capture_design_reference_cdp.js'
)

function fail(message) {
  throw new Error(message)
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function posixRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/')
}

function walkDesignFiles(directory = DesignRoot, output = []) {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    const stat = fs.lstatSync(candidate)
    if (stat.isSymbolicLink()) {
      fail('The design reference tree may not contain symbolic links.')
    }
    if (stat.isDirectory()) {
      walkDesignFiles(candidate, output)
      continue
    }
    if (stat.isFile() && entry.name.endsWith('.dc.html')) output.push(candidate)
  }
  return output
}

function titleFromHtml(html, fallback) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? match[1].replace(/\s+/g, ' ').trim() : fallback
}

function listReferences() {
  return walkDesignFiles().map(absolutePath => {
    const bytes = fs.readFileSync(absolutePath)
    const relativePath = posixRelative(DesignRoot, absolutePath)
    return {
      id: relativePath,
      file: path.basename(absolutePath),
      title: titleFromHtml(bytes.toString('utf8'), path.basename(absolutePath)),
      bytes: bytes.length,
      sha256: sha256(bytes),
      canonical: relativePath === CanonicalReference,
    }
  })
}

function routes() {
  const driver = require(RouteDriverPath)
  const canonicalRoutes = driver.Routes.map(route => ({
    name: route.name,
    reference: CanonicalReference,
    source: 'capture_design_reference_cdp.js',
    theme: route.theme,
    actions: route.actions.map(action => ({ ...action })),
    expectedLabels: [...route.expectedLabels],
    suppliedPng: route.suppliedPng,
    suppliedPngDisposition: route.suppliedPngDisposition ?? null,
    expectedViewport: {
      registration: { ...routeSummary(route).expectedViewport.registration },
      logical: {
        ...routeSummary(route).expectedViewport.logical,
        themes: [...routeSummary(route).expectedViewport.logical.themes],
      },
    },
    expectedVisibleText: [],
    expectedVisibleSelectors: [],
    expectedDrawerWidth: null,
    settleMs: 1100,
  }))
  return [
    ...canonicalRoutes,
    ...HistoryRoutes.map(route => ({
      ...route,
      source: 'hand-written-history-registry',
    })),
  ]
}

function routeSummary(route) {
  const driver = require(RouteDriverPath)
  return driver
    .listReceipt()
    .canonicalRoutes.find(item => item.name === route.name)
}

function catalogReceipt() {
  const references = listReferences()
  const stateRoutes = routes()
  return {
    schemaVersion: 1,
    canonicalReference: CanonicalReference,
    references,
    stateRoutes,
    unreachableStates: UnreachableHistoryStates,
    defaults: {
      reference: CanonicalReference,
      state: 'workspace-changes-light',
      theme: 'light',
      width: 1240,
      height: 725,
      autoFit: false,
    },
  }
}

function strictBoolean(value, option) {
  if (value === 'true') return true
  if (value === 'false') return false
  fail(`--${option} must be true or false.`)
}

function strictDimension(value, option) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 320 || parsed > 4096) {
    fail(`--${option} must be an integer from 320 through 4096.`)
  }
  return parsed
}

function parsePairs(argv) {
  if (argv.length % 2 !== 0) fail('Every option requires an explicit value.')
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (!option?.startsWith('--') || option.length < 3) {
      fail(`Invalid option near ${option ?? '<end>'}.`)
    }
    const key = option.slice(2)
    if (values.has(key)) fail(`Duplicate --${key} option.`)
    values.set(key, value)
  }
  return values
}

function parseArguments(argv) {
  const values = parsePairs(argv)
  const allowed = new Set([
    'list',
    'reference',
    'state',
    'theme',
    'width',
    'height',
    'auto-fit',
    'capture',
  ])
  for (const key of values.keys()) {
    if (!allowed.has(key)) fail(`Unsupported option --${key}.`)
  }

  if (values.has('list')) {
    const list = strictBoolean(values.get('list'), 'list')
    if (!list || values.size !== 1) {
      fail('--list true cannot be combined with launch or capture options.')
    }
    return { list: true }
  }

  const receipt = catalogReceipt()
  const reference = values.get('reference') ?? receipt.defaults.reference
  const referenceEntry = receipt.references.find(item => item.id === reference)
  if (!referenceEntry) fail(`Unknown design reference: ${reference}.`)

  const state =
    values.get('state') ??
    (reference === CanonicalReference
      ? receipt.defaults.state
      : receipt.stateRoutes.find(route => route.reference === reference)
          ?.name ?? 'default')
  const route =
    state === 'default'
      ? null
      : receipt.stateRoutes.find(candidate => candidate.name === state)
  if (state !== 'default' && !route) fail(`Unknown design state: ${state}.`)
  if (route && route.reference !== reference) {
    fail(`Design state ${state} belongs to ${route.reference}.`)
  }

  const requestedTheme = values.get('theme') ?? 'route'
  if (!['route', 'light', 'dark'].includes(requestedTheme)) {
    fail('--theme must be route, light, or dark.')
  }
  const theme =
    requestedTheme === 'route'
      ? route?.theme ?? receipt.defaults.theme
      : requestedTheme
  const width = values.has('width')
    ? strictDimension(values.get('width'), 'width')
    : receipt.defaults.width
  const height = values.has('height')
    ? strictDimension(values.get('height'), 'height')
    : receipt.defaults.height
  const autoFit = values.has('auto-fit')
    ? strictBoolean(values.get('auto-fit'), 'auto-fit')
    : receipt.defaults.autoFit

  let capture = null
  if (values.has('capture')) {
    capture = values.get('capture')
    if (!path.isAbsolute(capture))
      fail('--capture must be an absolute PNG path.')
    if (path.extname(capture).toLowerCase() !== '.png') {
      fail('--capture must end in .png.')
    }
    if (fs.existsSync(capture))
      fail('--capture refuses to overwrite an existing path.')
    const parent = path.dirname(capture)
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
      fail('--capture parent directory must already exist.')
    }
  }

  return {
    list: false,
    reference,
    state,
    route,
    theme,
    width,
    height,
    autoFit,
    capture,
  }
}

function referencePath(referenceId) {
  const entry = listReferences().find(item => item.id === referenceId)
  if (!entry) fail(`Unknown design reference: ${referenceId}.`)
  const absolutePath = path.resolve(DesignRoot, ...referenceId.split('/'))
  const relative = path.relative(DesignRoot, absolutePath)
  if (
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  ) {
    fail('The design reference path escapes design/.')
  }
  const stat = fs.lstatSync(absolutePath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('The design reference must be a regular tracked file.')
  }
  return { entry, absolutePath }
}

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
}

function runtimeHtml(referenceId) {
  const { entry, absolutePath } = referencePath(referenceId)
  const bytes = fs.readFileSync(absolutePath)
  if (sha256(bytes) !== entry.sha256)
    fail('The design reference changed while loading.')
  let html = bytes.toString('utf8')
  html = html.replace(
    /<link\b(?=[^>]*\bhref\s*=\s*["']https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com))[^>]*>\s*/gi,
    ''
  )

  const reactUrl = pathToFileURL(
    path.join(RepoRoot, 'site', 'vendor', 'react.production.min.js')
  ).href
  const reactDomUrl = pathToFileURL(
    path.join(RepoRoot, 'site', 'vendor', 'react-dom.production.min.js')
  ).href
  const fontCssUrl = pathToFileURL(path.join(__dirname, 'fonts.css')).href
  const baseUrl = pathToFileURL(absolutePath).href
  const resourceMap = JSON.stringify({
    'https://unpkg.com/react@18.3.1/umd/react.production.min.js': reactUrl,
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js':
      reactDomUrl,
  }).replaceAll('</script', '<\\/script')
  const injection = [
    `<base href="${escapeAttribute(baseUrl)}">`,
    `<script data-design-reference-resources>window.__resources=Object.assign(window.__resources||{},${resourceMap})</script>`,
    `<link data-design-reference-fonts rel="stylesheet" href="${escapeAttribute(
      fontCssUrl
    )}">`,
  ].join('')
  if (!/<head(?:\s[^>]*)?>/i.test(html))
    fail('The design reference has no head element.')
  html = html.replace(/<head(\s[^>]*)?>/i, match => `${match}${injection}`)
  return {
    identity: entry,
    html,
  }
}

module.exports = {
  CanonicalReference,
  DesignRoot,
  RepoRoot,
  RouteDriverPath,
  catalogReceipt,
  listReferences,
  parseArguments,
  referencePath,
  routes,
  runtimeHtml,
  sha256,
}
