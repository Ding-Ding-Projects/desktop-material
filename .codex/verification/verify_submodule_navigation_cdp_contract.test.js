'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const verifierPath = path.join(__dirname, 'verify_submodule_navigation_cdp.js')
const {
  TEN_PASS_COVERAGE,
  isContainedPath,
  parseArguments,
  readState,
  viewportForPass,
  writeState,
} = require(verifierPath)

test('the verifier declares all ten ordered pass contracts', () => {
  assert.deepEqual(
    Object.keys(TEN_PASS_COVERAGE).map(Number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  )
  for (const pass of Object.keys(TEN_PASS_COVERAGE).map(Number)) {
    assert.ok(TEN_PASS_COVERAGE[pass].length >= 4, `pass ${pass}`)
  }

  const coverage = Object.values(TEN_PASS_COVERAGE).flat()
  for (const expected of [
    'checked-out-gating',
    'uninitialized-gating',
    'temporary-child-open',
    'back-to-parent',
    'restart-policy',
    'appearance-cancel-rollback',
    'keyboard-only-back',
    'scale-200',
    'cantonese',
    'notifications-tools-settings',
  ]) {
    assert.ok(coverage.includes(expected), expected)
  }
})

test('argument parsing confines a new pass capture to an owned run root', t => {
  const runRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'desktop-material-p0-ui-contract-')
  )
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(runRoot, 'fixture', '.git'), { recursive: true })
  fs.mkdirSync(path.join(runRoot, 'captures'))
  const capture = path.join(runRoot, 'captures', 'pass-01-primary.png')

  const parsed = parseArguments([
    '--port',
    '9337',
    '--run-root',
    runRoot,
    '--pass',
    '1',
    '--capture',
    capture,
  ])
  assert.equal(parsed.port, 9337)
  assert.equal(parsed.pass, 1)
  assert.equal(
    parsed.capture,
    path.join(parsed.runRoot, 'captures', 'pass-01-primary.png')
  )
  assert.equal(parsed.runRoot, fs.realpathSync.native(runRoot))
  assert.ok(isContainedPath(parsed.runRoot, parsed.capture))

  const firstState = {
    version: 1,
    runId: path.basename(parsed.runRoot),
    lastCompletedPass: 1,
    captures: [],
  }
  writeState(parsed, firstState)
  assert.equal(readState(parsed).lastCompletedPass, 1)
  writeState(parsed, { ...firstState, lastCompletedPass: 2 })
  assert.equal(readState(parsed).lastCompletedPass, 2)

  assert.throws(
    () =>
      parseArguments([
        '--port',
        '9337',
        '--run-root',
        runRoot,
        '--pass',
        '1',
        '--capture',
        path.join(os.tmpdir(), 'pass-01-outside.png'),
      ]),
    /inside the owned run root/
  )
  assert.throws(
    () =>
      parseArguments([
        '--port',
        '9337',
        '--run-root',
        runRoot,
        '--pass',
        '11',
        '--capture',
        capture,
      ]),
    /1 through 10/
  )
  assert.throws(
    () =>
      parseArguments([
        '--port',
        '9337',
        '--run-root',
        runRoot,
        '--pass',
        '1',
        '--capture',
        capture,
        '--host',
        '0.0.0.0',
      ]),
    /Unknown argument/
  )
})

test('compact, scale, and standard passes use deterministic dimensions', () => {
  assert.deepEqual(viewportForPass(1), { width: 1440, height: 960 })
  assert.deepEqual(viewportForPass(7), { width: 700, height: 650 })
  assert.deepEqual(viewportForPass(8), { width: 640, height: 480 })
  assert.deepEqual(viewportForPass(9), { width: 700, height: 650 })
  assert.deepEqual(viewportForPass(10), { width: 1440, height: 960 })
})

test('the attach-only helper contains no native process/window ownership APIs', () => {
  const source = fs.readFileSync(verifierPath, 'utf8')
  for (const forbidden of [
    "require('child_process')",
    'chromium.launch(',
    'electron.launch(',
    '.bringToFront(',
    'browser.close(',
    'page.close(',
    'window.close(',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  assert.match(source, /127\.0\.0\.1:\$\{port\}/)
  assert.match(source, /externalRequired/)
  assert.match(source, /performance\.timeOrigin/)
})

test('the verifier clears capture-only tooltip suppression before each pass', () => {
  const source = fs.readFileSync(verifierPath, 'utf8')
  assert.ok(
    source.includes(
      "document.getElementById('gallery-tooltip-suppressor')?.remove()"
    )
  )
})
