'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const verifierPath = path.join(
  __dirname,
  'verify_submodule_race_regression_cdp.js'
)
const { isWithin, parseArguments } = require(verifierPath)

test('the race verifier confines its fixture and captures to an owned temp run', t => {
  const runRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'desktop-material-p0-ui-race-contract-')
  )
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(runRoot, 'fixture', '.git'), { recursive: true })
  fs.mkdirSync(path.join(runRoot, 'captures'))

  const parsed = parseArguments(['--port', '9337', '--run-root', runRoot])
  assert.equal(parsed.port, 9337)
  assert.equal(parsed.runRoot, fs.realpathSync.native(runRoot))
  assert.equal(parsed.fixturePath, path.join(parsed.runRoot, 'fixture'))
  assert.equal(parsed.captureDirectory, path.join(parsed.runRoot, 'captures'))
  assert.ok(isWithin(parsed.runRoot, parsed.fixturePath))

  assert.throws(
    () =>
      parseArguments([
        '--port',
        '9337',
        '--run-root',
        path.join(os.tmpdir(), 'not-an-owned-run-root'),
      ]),
    /run-root/
  )
})

test('the race verifier attaches only and asserts the duplicate transition boundary', () => {
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
  assert.match(source, /const duplicateOpen = await open\.evaluate/)
  assert.match(source, /const duplicateBack = await back\.evaluate/)
  assert.match(source, /button\.click\(\)\s*\n\s*const firstDisabled/)
  assert.match(source, /persistentRepositoryCount/)
  assert.match(source, /repositoryTabCount/)
  assert.match(
    source,
    /Duplicate Open changed the persistent repository or tab boundary/
  )
  assert.match(
    source,
    /Duplicate Back did not restore the exact parent boundary/
  )
})
