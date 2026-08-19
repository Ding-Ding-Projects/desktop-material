'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const catalog = require('../catalog.cjs')
const { PngSignature, assertLaunchResult } = require('../launch-result.cjs')

const ExpectedRoutes = [
  'workspace-changes-light',
  'workspace-dark',
  'tab-text-style',
  'regex-builder',
  'settings-history-manager',
  'settings-accounts-dark',
  'history-detail',
  'actions-run-detail',
  'workflow-manager',
  'workflow-catalog',
  'workflow-dispatch',
  'repositories-sheet',
  'branch-sheet',
  'account-switcher',
  'notification-centre',
  'clone-dialog-v2',
]

const ExpectedHistoryDestinations = [
  'history-history',
  'history-changes',
  'history-branches',
  'history-actions',
  'history-inbox',
  'history-terminal',
  'history-agents',
  'history-repositories',
]

test('catalog discovers only the three tracked design documents with exact identity', () => {
  const references = catalog.listReferences()
  assert.deepEqual(
    references.map(item => item.id),
    [
      'Desktop Material v2.dc.html',
      'Desktop Material.dc.html',
      'History MD3.dc.html',
    ]
  )
  for (const reference of references) {
    assert.ok(reference.bytes > 1000)
    assert.match(reference.sha256, /^[a-f0-9]{64}$/)
    assert.equal(path.isAbsolute(reference.id), false)
  }
})

test('state registry is the exact existing capture-driver route set', () => {
  const routes = catalog.routes()
  assert.deepEqual(
    routes
      .filter(item => item.reference === catalog.CanonicalReference)
      .map(item => item.name),
    ExpectedRoutes
  )
  assert.equal(
    routes.filter(item => item.reference === catalog.CanonicalReference).length,
    16
  )
  for (const route of routes.filter(
    item => item.reference === catalog.CanonicalReference
  )) {
    assert.ok(['light', 'dark'].includes(route.theme))
    assert.equal(route.expectedViewport.registration.width, 924)
    assert.equal(route.expectedViewport.registration.height, 540)
    assert.equal(route.expectedViewport.logical.width, 1240)
    assert.equal(route.expectedViewport.logical.height, 725)
  }
})

test('History registry covers every destination, major state, and reachable menu', () => {
  const receipt = catalog.catalogReceipt()
  const history = receipt.stateRoutes.filter(
    item => item.reference === 'History MD3.dc.html'
  )
  for (const destination of ExpectedHistoryDestinations) {
    assert.ok(
      history.some(item => item.name === destination),
      destination
    )
  }
  for (const major of [
    'history-detail-sheet',
    'history-compose-dialog',
    'history-regex-builder',
    'history-toast-fetch',
    'history-collapsed-drawer',
    'history-progress-fetch',
    'history-empty',
    'history-repositories-empty',
  ]) {
    assert.ok(
      history.some(item => item.name === major),
      major
    )
  }
  assert.equal(
    history.filter(item => item.name.startsWith('history-menu-')).length,
    22
  )
  assert.deepEqual(receipt.unreachableStates, [
    {
      name: 'history-menu-compose',
      reason:
        "menuSpec() defines overlay 'compose', but the source exposes no click or context-menu action that opens it.",
    },
  ])
})

test('runtime load replaces remote runtime resources in memory and never changes source', () => {
  const before = catalog.referencePath(catalog.CanonicalReference)
  const original = fs.readFileSync(before.absolutePath)
  const rendered = catalog.runtimeHtml(catalog.CanonicalReference)
  const after = fs.readFileSync(before.absolutePath)
  assert.deepEqual(after, original)
  assert.equal(rendered.identity.sha256, catalog.sha256(original))
  assert.doesNotMatch(rendered.html, /<link\b[^>]*fonts\.googleapis\.com/i)
  assert.doesNotMatch(rendered.html, /<link\b[^>]*fonts\.gstatic\.com/i)
  assert.match(rendered.html, /data-design-reference-resources/)
  assert.match(rendered.html, /designReferenceSeed=0x5eed2026/)
  assert.match(rendered.html, /Math\.imul\(designReferenceSeed,1664525\)/)
  assert.match(rendered.html, /react\.production\.min\.js/)
  assert.match(rendered.html, /data-design-reference-fonts/)
})

test('CLI options select exact reference, state, theme, viewport, and auto-fit', () => {
  const selected = catalog.parseArguments([
    '--reference',
    'Desktop Material v2.dc.html',
    '--state',
    'regex-builder',
    '--theme',
    'dark',
    '--width',
    '924',
    '--height',
    '540',
    '--auto-fit',
    'true',
  ])
  assert.equal(selected.reference, 'Desktop Material v2.dc.html')
  assert.equal(selected.state, 'regex-builder')
  assert.equal(selected.route.name, 'regex-builder')
  assert.equal(selected.theme, 'dark')
  assert.equal(selected.width, 924)
  assert.equal(selected.height, 540)
  assert.equal(selected.autoFit, true)
})

test('CLI rejects ambiguous, unsafe, or unsupported selections', () => {
  assert.throws(
    () => catalog.parseArguments(['--reference', '../outside.dc.html']),
    /Unknown design reference/
  )
  assert.throws(
    () =>
      catalog.parseArguments([
        '--reference',
        'History MD3.dc.html',
        '--state',
        'regex-builder',
      ]),
    /belongs to Desktop Material v2/
  )
  assert.throws(
    () => catalog.parseArguments(['--state', 'missing']),
    /Unknown design state/
  )
  assert.throws(
    () => catalog.parseArguments(['--width', '319']),
    /integer from 320/
  )
  assert.throws(
    () => catalog.parseArguments(['--theme', 'system']),
    /route, light, or dark/
  )
  assert.throws(
    () => catalog.parseArguments(['--list', 'true', '--theme', 'light']),
    /cannot be combined/
  )
})

test('capture output must be absolute, new, and PNG', () => {
  assert.throws(
    () => catalog.parseArguments(['--capture', 'relative.png']),
    /absolute PNG path/
  )
  const output = path.join(os.tmpdir(), `design-reference-${process.pid}.png`)
  fs.rmSync(output, { force: true })
  const parsed = catalog.parseArguments(['--capture', output])
  assert.equal(parsed.capture, output)
  fs.writeFileSync(output, 'occupied')
  try {
    assert.throws(
      () => catalog.parseArguments(['--capture', output]),
      /refuses to overwrite/
    )
  } finally {
    fs.rmSync(output, { force: true })
  }
})

test('launcher rejects the prior false-success shape and verifies real PNG output', () => {
  const output = path.join(
    os.tmpdir(),
    `design-reference-launch-result-${process.pid}.png`
  )
  fs.rmSync(output, { force: true })
  const options = { capture: output }
  assert.throws(
    () => assertLaunchResult(options, { status: 0, error: null }),
    /exited successfully without producing/
  )
  assert.equal(assertLaunchResult(options, { status: 5, error: null }), 5)
  fs.writeFileSync(
    output,
    Buffer.concat([PngSignature, Buffer.from('fixture')])
  )
  try {
    assert.equal(assertLaunchResult(options, { status: 0, error: null }), 0)
    fs.writeFileSync(output, 'not a png')
    assert.throws(
      () => assertLaunchResult(options, { status: 0, error: null }),
      /not a PNG/
    )
  } finally {
    fs.rmSync(output, { force: true })
  }
})

test('Electron boundary stays sandboxed, offline, and overwrite-safe', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8')
  const runtime = fs.readFileSync(
    path.join(__dirname, '..', 'runtime.js'),
    'utf8'
  )
  for (const contract of [
    'nodeIntegration: false',
    'contextIsolation: true',
    'sandbox: true',
    "{ urls: ['http://*/*', 'https://*/*'] }",
    'callback({ cancel: true })',
    'window.webContents.capturePage()',
    "{ flag: 'wx' }",
    "app.commandLine.appendSwitch('force-device-scale-factor', '1')",
  ]) {
    assert.ok(main.includes(contract), `missing Electron contract: ${contract}`)
  }
  for (const contract of [
    'function exactTextButtons(scope, text)',
    'node.nodeType === Node.TEXT_NODE',
    'const actionTimeoutMs = 5000',
    'await waitFor(',
    "visible(element) && element.getAttribute('title') === action.name",
  ]) {
    assert.ok(
      runtime.includes(contract),
      `missing deterministic action-wait contract: ${contract}`
    )
  }
})
